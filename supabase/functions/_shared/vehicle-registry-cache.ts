/**
 * vehicle-registry-cache — read/write helpers for vehicle_registry_cache
 * (migration 20260727000002). Mirrors person-lookup-cache.ts, keyed by
 * registration number instead of a hashed personnummer — a Swedish plate
 * number is a public identifier, not sensitive personal data, so no HMAC
 * hashing step is needed here (normalization is enough). Cached data is
 * still encrypted at rest defensively, since some provider responses may
 * include owner data alongside vehicle data.
 *
 * Both 'found' and 'not_found' are cached; 'unavailable' never is — a
 * transient provider failure must not be remembered as a real answer.
 */

import { encryptCredential, decryptCredential } from './credential-crypto.ts';
import { logger } from './logger.ts';
import type { VehicleRegistryData, VehicleRegistryStatus } from './vehicle-registry.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

function normalize(registrationNumber: string): string {
  return registrationNumber.replace(/[\s-]/g, '').toUpperCase();
}

export interface CachedVehicleLookup {
  status:          VehicleRegistryStatus;
  data:             VehicleRegistryData | null;
  confidence:       string | null;
  lookedUpAt:       string;
  cacheExpiresAt:   string;
  lastRefreshedAt:  string;
  fromCache:        true;
}

export async function getCachedVehicleLookup(
  db: Db, organizationId: string, registrationNumber: string, provider: string,
): Promise<CachedVehicleLookup | null> {
  const key = normalize(registrationNumber);

  const { data: row, error } = await db
    .from('vehicle_registry_cache')
    .select('status, canonical_data_encrypted, looked_up_at, cache_expires_at, last_refreshed_at')
    .eq('organization_id', organizationId)
    .eq('registration_number', key)
    .eq('provider', provider)
    .gt('cache_expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    logger.error('vehicle_registry_cache.read_failed', { error: error.message });
    return null;
  }
  if (!row) return null;

  let data: VehicleRegistryData | null = null;
  if (row.canonical_data_encrypted) {
    try {
      data = JSON.parse(await decryptCredential(row.canonical_data_encrypted));
    } catch (err) {
      logger.error('vehicle_registry_cache.decrypt_failed', { error: err instanceof Error ? err.message : String(err) });
      return null; // fail closed — treat as a cache miss rather than return garbage
    }
  }

  return {
    status:          row.status,
    data,
    confidence:      null,
    lookedUpAt:      row.looked_up_at,
    cacheExpiresAt:  row.cache_expires_at,
    lastRefreshedAt: row.last_refreshed_at,
    fromCache:       true,
  };
}

export async function writeVehicleCacheEntry(
  db: Db, organizationId: string, registrationNumber: string, provider: string,
  status: VehicleRegistryStatus, data: VehicleRegistryData | null,
  cacheTtlSeconds: number,
): Promise<void> {
  if (status === 'unavailable') return;
  if (cacheTtlSeconds <= 0) return;

  const key = normalize(registrationNumber);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + cacheTtlSeconds * 1000);
  const encrypted = data ? await encryptCredential(JSON.stringify(data)) : null;

  const { error } = await db
    .from('vehicle_registry_cache')
    .upsert({
      organization_id:          organizationId,
      registration_number:      key,
      provider,
      status,
      canonical_data_encrypted: encrypted,
      looked_up_at:             now.toISOString(),
      cache_expires_at:         expiresAt.toISOString(),
      last_refreshed_at:        now.toISOString(),
    }, { onConflict: 'organization_id,registration_number,provider' });

  if (error) {
    logger.error('vehicle_registry_cache.write_failed', { error: error.message });
  }
}

export async function invalidateVehicleCacheEntry(
  db: Db, organizationId: string, registrationNumber: string, provider?: string,
): Promise<void> {
  const key = normalize(registrationNumber);
  let query = db
    .from('vehicle_registry_cache')
    .delete()
    .eq('organization_id', organizationId)
    .eq('registration_number', key);
  if (provider) query = query.eq('provider', provider);

  const { error } = await query;
  if (error) {
    logger.error('vehicle_registry_cache.invalidate_failed', { error: error.message });
  }
}
