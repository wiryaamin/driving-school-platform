/**
 * person-lookup-cache — read/write helpers for person_lookup_cache
 * (migration 20260727000001).
 *
 * The raw personnummer is never stored — only a keyed HMAC hash via
 * hashPersonalNumber() (bankid-crypto.ts, the same primitive as
 * students.personnummer_hash). Cached person data is encrypted at rest via
 * encryptCredential() (ADR-022) — GDPR: this is real personal data, and the
 * fact that the AES-256-GCM primitive was originally named for credentials
 * doesn't make it any less applicable here.
 *
 * Both successful ('found') and 'not_found' results are cached — a
 * not-found result is still worth remembering for cache_ttl_seconds, so a
 * receptionist re-typing the same personnummer doesn't re-hit a paid
 * provider for a result that won't have changed. 'unavailable' results
 * (provider errors) are never cached — a transient failure must not be
 * remembered as if it were a real answer.
 */

import { hashPersonalNumber } from './bankid-crypto.ts';
import { encryptCredential, decryptCredential } from './credential-crypto.ts';
import { logger } from './logger.ts';
import type { PersonLookupData, PersonLookupStatus } from './person-lookup.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export interface CachedLookup {
  status:          PersonLookupStatus;
  data:             PersonLookupData | null;
  confidence:       string | null;
  lookedUpAt:       string;
  cacheExpiresAt:   string;
  lastRefreshedAt:  string;
  fromCache:        true;
}

export async function getCachedLookup(
  db: Db, organizationId: string, personnummer: string, provider: string,
): Promise<CachedLookup | null> {
  const hash = await hashPersonalNumber(personnummer);

  const { data: row, error } = await db
    .from('person_lookup_cache')
    .select('status, canonical_data_encrypted, confidence, looked_up_at, cache_expires_at, last_refreshed_at')
    .eq('organization_id', organizationId)
    .eq('personnummer_hash', hash)
    .eq('provider', provider)
    .gt('cache_expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    logger.error('person_lookup_cache.read_failed', { error: error.message });
    return null;
  }
  if (!row) return null;

  let data: PersonLookupData | null = null;
  if (row.canonical_data_encrypted) {
    try {
      data = JSON.parse(await decryptCredential(row.canonical_data_encrypted));
    } catch (err) {
      logger.error('person_lookup_cache.decrypt_failed', { error: err instanceof Error ? err.message : String(err) });
      return null; // fail closed — treat as a cache miss rather than return garbage
    }
  }

  return {
    status:          row.status,
    data,
    confidence:      row.confidence,
    lookedUpAt:      row.looked_up_at,
    cacheExpiresAt:  row.cache_expires_at,
    lastRefreshedAt: row.last_refreshed_at,
    fromCache:       true,
  };
}

export async function writeCacheEntry(
  db: Db, organizationId: string, personnummer: string, provider: string,
  status: PersonLookupStatus, data: PersonLookupData | null, confidence: string | null,
  cacheTtlSeconds: number,
): Promise<void> {
  // 'unavailable' is never cached — see module header.
  if (status === 'unavailable') return;
  if (cacheTtlSeconds <= 0) return; // caching disabled for this tenant

  const hash = await hashPersonalNumber(personnummer);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + cacheTtlSeconds * 1000);

  const encrypted = data ? await encryptCredential(JSON.stringify(data)) : null;

  const { error } = await db
    .from('person_lookup_cache')
    .upsert({
      organization_id:          organizationId,
      personnummer_hash:        hash,
      provider,
      status,
      canonical_data_encrypted: encrypted,
      confidence,
      looked_up_at:             now.toISOString(),
      cache_expires_at:         expiresAt.toISOString(),
      last_refreshed_at:        now.toISOString(),
    }, { onConflict: 'organization_id,personnummer_hash,provider' });

  if (error) {
    logger.error('person_lookup_cache.write_failed', { error: error.message });
  }
}

/** Manual refresh / cache invalidation — deletes any cached entry so the next lookup hits the provider fresh. */
export async function invalidateCacheEntry(
  db: Db, organizationId: string, personnummer: string, provider?: string,
): Promise<void> {
  const hash = await hashPersonalNumber(personnummer);
  let query = db
    .from('person_lookup_cache')
    .delete()
    .eq('organization_id', organizationId)
    .eq('personnummer_hash', hash);
  if (provider) query = query.eq('provider', provider);

  const { error } = await query;
  if (error) {
    logger.error('person_lookup_cache.invalidate_failed', { error: error.message });
  }
}
