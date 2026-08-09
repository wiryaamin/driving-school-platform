/**
 * person-lookup-service — the ONLY entry point the Student Domain calls for
 * identity lookups (Phase 2: "the Student Registration workflow must
 * communicate only with the Person Lookup Service").
 *
 * students/index.ts must never import person-lookup.ts's provider factory
 * or any provider class directly — only performPersonLookup() and
 * getPersonLookupStatus() below. This is what makes "business logic must
 * never know which provider is being used" mechanically true: the Student
 * Domain doesn't hold a reference to a provider, a credential, or even the
 * configured provider's name beyond what this service chooses to return.
 *
 * Responsibilities this layer owns (person-lookup.ts owns none of these):
 *   - Resolving the calling tenant's configuration (provider choice,
 *     decrypted credentials, timeout/retry policy, cache TTL, auto-lookup/
 *     auto-address-update toggles) from person_lookup_provider_configs,
 *     falling back to Mock with sane defaults for any org with no config
 *     row yet — configuring nothing must still work, same as every other
 *     integration on this platform.
 *   - Cache-first resolution (person-lookup-cache.ts), including caching
 *     'not_found' results and never caching 'unavailable' ones.
 *   - Retry with backoff + a hard timeout around the one real network call
 *     a live provider makes, per the tenant's own policy.
 *   - Recording every lookup — cache hit or not — as an identity-security
 *     audit event (P-027: recordIdentityEvent() is the single writer).
 *   - Recording provider-health observations for the status endpoint.
 */

import { createServiceClient } from './supabase.ts';
import { decryptCredential } from './credential-crypto.ts';
import { recordIdentityEvent } from './identity-events.ts';
import { getCachedLookup, writeCacheEntry, invalidateCacheEntry } from './person-lookup-cache.ts';
import {
  getPersonLookupProvider, isValidPersonnummerFormat,
  type PersonLookupResult, type PersonLookupCapabilities,
} from './person-lookup.ts';
import { logger } from './logger.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export interface PersonLookupServiceResult {
  status:       PersonLookupResult['status'];
  data:         PersonLookupResult['data'];
  error:        string | null;
  errorType?:   string;
  provider:     string;
  capabilities: PersonLookupCapabilities;
  fromCache:    boolean;
  lookedUpAt:   string;
  cachedAt?:    string;
  confidence?:  string | null;
}

interface ResolvedConfig {
  provider:                  string;
  apiKey?:                   string;
  clientId?:                 string;
  clientSecret?:             string;
  baseUrl?:                  string;
  timeoutMs:                 number;
  maxRetries:                number;
  retryBackoffMs:            number;
  autoLookupEnabled:         boolean;
  autoAddressUpdateEnabled:  boolean;
  cacheTtlSeconds:           number;
}

const DEFAULT_CONFIG: ResolvedConfig = {
  provider:                 'mock',
  timeoutMs:                5000,
  maxRetries:               2,
  retryBackoffMs:           500,
  autoLookupEnabled:        true,
  autoAddressUpdateEnabled: false,
  cacheTtlSeconds:          2_592_000, // 30 days
};

async function resolveConfig(db: Db, organizationId: string): Promise<ResolvedConfig> {
  const { data: row } = await db
    .from('person_lookup_provider_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .maybeSingle();

  if (!row) return DEFAULT_CONFIG;

  // credentials_encrypted holds either a plain single-secret string (a
  // future single-API-key provider) or a JSON-encoded {clientId,
  // clientSecret} pair (Roaring's OAuth2 client-credentials model) —
  // decrypted once here and disambiguated by shape, so the storage layer
  // stays a single generic encrypted column regardless of which auth
  // model a given provider uses.
  let apiKey: string | undefined;
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  if (row.credentials_encrypted) {
    try {
      const decrypted = await decryptCredential(row.credentials_encrypted);
      try {
        const parsed = JSON.parse(decrypted) as { clientId?: string; clientSecret?: string };
        if (parsed.clientId && parsed.clientSecret) {
          clientId = parsed.clientId;
          clientSecret = parsed.clientSecret;
        } else {
          apiKey = decrypted;
        }
      } catch {
        apiKey = decrypted;
      }
    } catch (err) {
      logger.error('person_lookup_service.credential_decrypt_failed', {
        org_id: organizationId, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    provider:                 row.active_provider,
    apiKey, clientId, clientSecret,
    baseUrl:                  row.base_url ?? undefined,
    timeoutMs:                row.timeout_ms,
    maxRetries:               row.max_retries,
    retryBackoffMs:           row.retry_backoff_ms,
    autoLookupEnabled:        row.auto_lookup_enabled,
    autoAddressUpdateEnabled: row.auto_address_update_enabled,
    cacheTtlSeconds:          row.cache_ttl_seconds,
  };
}

async function callWithRetry(
  fn: () => Promise<PersonLookupResult>, maxRetries: number, backoffMs: number,
): Promise<PersonLookupResult> {
  let lastResult: PersonLookupResult = { status: 'unavailable', data: null, error: 'no attempt made', errorType: 'unknown' };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await fn();

    // Only retry on the categories where a retry could plausibly help —
    // never retry a definitive found/not_found, and never retry
    // authentication/misconfiguration failures (retrying a wrong API key
    // just wastes the tenant's rate-limit budget for a result that cannot
    // change without a human fixing the configuration first).
    const retryable = lastResult.status === 'unavailable'
      && (lastResult.errorType === 'timeout' || lastResult.errorType === 'provider_unavailable');
    if (!retryable || attempt === maxRetries) break;

    await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
  }
  return lastResult;
}

async function recordHealth(
  db: Db, organizationId: string, provider: string, isHealthy: boolean, latencyMs: number, errorMessage: string | null,
): Promise<void> {
  const { error } = await db.from('person_lookup_provider_health').insert({
    organization_id: organizationId, provider, is_healthy: isHealthy, latency_ms: latencyMs, error_message: errorMessage,
  });
  if (error) logger.error('person_lookup_service.health_write_failed', { error: error.message });
}

export interface PerformLookupParams {
  organizationId: string;
  actorId:        string | null;
  personnummer:   string;
  correlationId:  string;
  /** Bypasses the cache and forces a fresh provider call — the "manual refresh" capability. */
  forceRefresh?:  boolean;
}

export async function performPersonLookup(params: PerformLookupParams): Promise<PersonLookupServiceResult> {
  const { organizationId, actorId, personnummer, correlationId, forceRefresh } = params;
  const db = createServiceClient();
  const config = await resolveConfig(db, organizationId);
  const provider = getPersonLookupProvider({
    provider: config.provider, apiKey: config.apiKey, clientId: config.clientId, clientSecret: config.clientSecret,
    baseUrl: config.baseUrl, timeoutMs: config.timeoutMs,
  });

  if (forceRefresh) {
    await invalidateCacheEntry(db, organizationId, personnummer, provider.getProviderName());
  } else {
    const cached = await getCachedLookup(db, organizationId, personnummer, provider.getProviderName());
    if (cached) {
      await recordIdentityEvent({
        eventType: 'person_lookup.cache_hit', provider: 'person_lookup', organizationId, userId: actorId, correlationId,
        metadata: { provider: provider.getProviderName(), outcome: cached.status },
      });
      return {
        status: cached.status, data: cached.data, error: null,
        provider: provider.getProviderName(), capabilities: provider.getProviderCapabilities(),
        fromCache: true, lookedUpAt: cached.lookedUpAt, cachedAt: cached.lastRefreshedAt, confidence: cached.confidence,
      };
    }
  }

  const startedAt = Date.now();
  const result = await callWithRetry(
    () => provider.lookupByPersonnummer(personnummer),
    config.maxRetries, config.retryBackoffMs,
  );
  const latencyMs = Date.now() - startedAt;

  await recordHealth(db, organizationId, provider.getProviderName(), result.status !== 'unavailable', latencyMs, result.error ?? null);

  await recordIdentityEvent({
    eventType: 'person_lookup.performed', provider: 'person_lookup', organizationId, userId: actorId, correlationId,
    metadata: { provider: provider.getProviderName(), outcome: result.status, error_type: result.errorType ?? null, latency_ms: latencyMs },
  });

  const nowIso = new Date().toISOString();
  await writeCacheEntry(
    db, organizationId, personnummer, provider.getProviderName(),
    result.status, result.data, result.confidence ?? null, config.cacheTtlSeconds,
  );

  return {
    status: result.status, data: result.data, error: result.error ?? null, errorType: result.errorType,
    provider: provider.getProviderName(), capabilities: provider.getProviderCapabilities(),
    fromCache: false, lookedUpAt: nowIso, confidence: result.confidence ?? null,
  };
}

export interface PersonLookupStatusResult {
  provider:     string;
  connected:    boolean;
  capabilities: PersonLookupCapabilities;
  autoLookupEnabled: boolean;
}

export async function getPersonLookupStatus(organizationId: string): Promise<PersonLookupStatusResult> {
  const db = createServiceClient();
  const config = await resolveConfig(db, organizationId);
  const provider = getPersonLookupProvider({
    provider: config.provider, apiKey: config.apiKey, clientId: config.clientId, clientSecret: config.clientSecret,
    baseUrl: config.baseUrl, timeoutMs: config.timeoutMs,
  });

  const startedAt = Date.now();
  const connected = await provider.validateConnection().catch(() => false);
  await recordHealth(db, organizationId, provider.getProviderName(), connected, Date.now() - startedAt, connected ? null : 'validateConnection() returned false');

  return {
    provider: provider.getProviderName(), connected,
    capabilities: provider.getProviderCapabilities(), autoLookupEnabled: config.autoLookupEnabled,
  };
}

/** Re-exported so callers that only need format validation don't need to import person-lookup.ts directly. */
export { isValidPersonnummerFormat };
