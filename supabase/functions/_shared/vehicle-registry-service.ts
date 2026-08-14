/**
 * vehicle-registry-service — the ONLY entry point the Vehicle Domain calls
 * for registration/inspection lookups. Mirrors person-lookup-service.ts's
 * role exactly: the Vehicle Domain (the vehicle-registry Edge Function)
 * must never import vehicle-registry.ts's provider factory or any provider
 * class directly — only performVehicleLookup()/getVehicleRegistryStatus()
 * below. This is what makes "business logic must never know which provider
 * is being used" mechanically true, not just a convention.
 *
 * Audit logging reuses insert_activity_log() (enterprise_foundation
 * migration) — the same RPC guardian-portal uses for read-access auditing —
 * rather than identity_security_events, since a vehicle registration lookup
 * is not an identity-security event; it doesn't belong in that table's
 * domain (see ADR-007/P-027's own scope, which is authentication/identity,
 * not vehicle compliance data).
 */

import { createServiceClient } from './supabase.ts';
import { decryptCredential } from './credential-crypto.ts';
import { getCachedVehicleLookup, writeVehicleCacheEntry, invalidateVehicleCacheEntry } from './vehicle-registry-cache.ts';
import {
  getVehicleRegistryProvider, isValidRegistrationNumberFormat,
  type VehicleRegistryResult, type VehicleRegistryCapabilities,
} from './vehicle-registry.ts';
import { logger } from './logger.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export interface VehicleRegistryServiceResult {
  status:       VehicleRegistryResult['status'];
  data:         VehicleRegistryResult['data'];
  error:        string | null;
  errorType?:   string;
  provider:     string;
  capabilities: VehicleRegistryCapabilities;
  fromCache:    boolean;
  lookedUpAt:   string;
  cachedAt?:    string;
}

interface ResolvedConfig {
  provider:         string;
  apiKey?:          string;
  baseUrl?:         string;
  timeoutMs:        number;
  maxRetries:       number;
  retryBackoffMs:   number;
  autoLookupEnabled: boolean;
  cacheTtlSeconds:  number;
}

const DEFAULT_CONFIG: ResolvedConfig = {
  provider:          'mock',
  timeoutMs:         5000,
  maxRetries:        2,
  retryBackoffMs:    500,
  autoLookupEnabled: true,
  cacheTtlSeconds:   7_776_000, // 90 days
};

async function resolveConfig(db: Db, organizationId: string): Promise<ResolvedConfig> {
  const { data: row } = await db
    .from('vehicle_registry_provider_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .maybeSingle();

  if (!row) return DEFAULT_CONFIG;

  let apiKey: string | undefined;
  if (row.credentials_encrypted) {
    try {
      apiKey = await decryptCredential(row.credentials_encrypted);
    } catch (err) {
      logger.error('vehicle_registry_service.credential_decrypt_failed', {
        org_id: organizationId, error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    provider:          row.active_provider,
    apiKey,
    baseUrl:           row.base_url ?? undefined,
    timeoutMs:         row.timeout_ms,
    maxRetries:        row.max_retries,
    retryBackoffMs:    row.retry_backoff_ms,
    autoLookupEnabled: row.auto_lookup_enabled,
    cacheTtlSeconds:   row.cache_ttl_seconds,
  };
}

async function callWithRetry(
  fn: () => Promise<VehicleRegistryResult>, maxRetries: number, backoffMs: number,
): Promise<VehicleRegistryResult> {
  let lastResult: VehicleRegistryResult = { status: 'unavailable', data: null, error: 'no attempt made', errorType: 'unknown' };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await fn();

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
  const { error } = await db.from('vehicle_registry_provider_health').insert({
    organization_id: organizationId, provider, is_healthy: isHealthy, latency_ms: latencyMs, error_message: errorMessage,
  });
  if (error) logger.error('vehicle_registry_service.health_write_failed', { error: error.message });
}

function recordAudit(
  db: Db, organizationId: string, actorId: string | null, action: string, vehicleId: string | null,
  metadata: Record<string, unknown>, correlationId: string | null,
): void {
  // Fire-and-forget, same idiom as guardian-portal's logGuardianAccess() —
  // auditing must never add latency to the caller's request.
  //
  // actor_type: 'staff' when a real actorId is present (an authenticated
  // staff member triggered this lookup via the UI), 'system' when it isn't
  // (an automated/background lookup) — this mirrors the distinction the
  // caller already makes with actorId itself, not a new inference.
  // visibility stays 'admin_only' (the column default, passed explicitly
  // for clarity): a vehicle registry lookup is an operational/compliance
  // concern for staff, not a business event any portal user should see.
  void db.rpc('insert_activity_log', {
    p_organization_id: organizationId,
    p_user_id:         actorId,
    p_user_email:       null,
    p_action:           action,
    p_entity_type:      'vehicle',
    p_entity_id:        vehicleId,
    p_metadata:         metadata,
    p_actor_type:       actorId ? 'staff' : 'system',
    p_visibility:       'admin_only',
    p_correlation_id:   correlationId,
  }).then(({ error }: { error: { message: string } | null }) => {
    if (error) logger.error('vehicle_registry_service.audit_write_failed', { error: error.message });
  });
}

export interface PerformVehicleLookupParams {
  organizationId:     string;
  actorId:            string | null;
  registrationNumber: string;
  vehicleId?:         string | null; // set when looking up an existing vehicle record; null when adding a new one
  forceRefresh?:      boolean;
  correlationId?:     string | null;
}

export async function performVehicleLookup(params: PerformVehicleLookupParams): Promise<VehicleRegistryServiceResult> {
  const { organizationId, actorId, registrationNumber, vehicleId, forceRefresh, correlationId } = params;
  const db = createServiceClient();
  const config = await resolveConfig(db, organizationId);
  const provider = getVehicleRegistryProvider({ provider: config.provider, apiKey: config.apiKey, baseUrl: config.baseUrl, timeoutMs: config.timeoutMs });

  if (forceRefresh) {
    await invalidateVehicleCacheEntry(db, organizationId, registrationNumber, provider.getProviderName());
  } else {
    const cached = await getCachedVehicleLookup(db, organizationId, registrationNumber, provider.getProviderName());
    if (cached) {
      recordAudit(db, organizationId, actorId, 'vehicle_registry.cache_hit', vehicleId ?? null, { provider: provider.getProviderName(), outcome: cached.status }, correlationId ?? null);
      return {
        status: cached.status, data: cached.data, error: null,
        provider: provider.getProviderName(), capabilities: provider.getProviderCapabilities(),
        fromCache: true, lookedUpAt: cached.lookedUpAt, cachedAt: cached.lastRefreshedAt,
      };
    }
  }

  const startedAt = Date.now();
  const result = await callWithRetry(
    () => provider.lookupByRegistrationNumber(registrationNumber),
    config.maxRetries, config.retryBackoffMs,
  );
  const latencyMs = Date.now() - startedAt;

  await recordHealth(db, organizationId, provider.getProviderName(), result.status !== 'unavailable', latencyMs, result.error ?? null);
  recordAudit(db, organizationId, actorId, 'vehicle_registry.performed', vehicleId ?? null, {
    provider: provider.getProviderName(), outcome: result.status, error_type: result.errorType ?? null, latency_ms: latencyMs,
  }, correlationId ?? null);

  const nowIso = new Date().toISOString();
  await writeVehicleCacheEntry(db, organizationId, registrationNumber, provider.getProviderName(), result.status, result.data, config.cacheTtlSeconds);

  return {
    status: result.status, data: result.data, error: result.error ?? null, errorType: result.errorType,
    provider: provider.getProviderName(), capabilities: provider.getProviderCapabilities(),
    fromCache: false, lookedUpAt: nowIso,
  };
}

export interface VehicleRegistryStatusResult {
  provider:          string;
  connected:         boolean;
  capabilities:      VehicleRegistryCapabilities;
  autoLookupEnabled: boolean;
}

export async function getVehicleRegistryStatus(organizationId: string): Promise<VehicleRegistryStatusResult> {
  const db = createServiceClient();
  const config = await resolveConfig(db, organizationId);
  const provider = getVehicleRegistryProvider({ provider: config.provider, apiKey: config.apiKey, baseUrl: config.baseUrl, timeoutMs: config.timeoutMs });

  const startedAt = Date.now();
  const connected = await provider.validateConnection().catch(() => false);
  await recordHealth(db, organizationId, provider.getProviderName(), connected, Date.now() - startedAt, connected ? null : 'validateConnection() returned false');

  return {
    provider: provider.getProviderName(), connected,
    capabilities: provider.getProviderCapabilities(), autoLookupEnabled: config.autoLookupEnabled,
  };
}

export { isValidRegistrationNumberFormat };
