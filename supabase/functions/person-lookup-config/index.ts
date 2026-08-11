/**
 * person-lookup-config — tenant configuration for the Person Lookup
 * Framework: timeout, retry policy, auto-lookup/auto-address-update
 * toggles, cache duration, enabled.
 *
 * Person Lookup is platform-managed (ADR: platform-managed integrations) —
 * provider and credentials are no longer tenant-configurable. This
 * function ignores any tenant-supplied active_provider/client_id/
 * client_secret/api_key/base_url outright (never encrypted, never stored,
 * never returned) and always preserves the existing (platform-default)
 * provider value, mirroring stripe-credentials/nets-credentials's
 * platform-managed-field handling. The remaining settings (timeout/retry/
 * toggles/cache TTL/enabled) are plain tenant-owned operational settings,
 * no different in sensitivity from any other setting on this platform, and
 * remain fully tenant-configurable.
 *
 * Routes:
 *   GET  /person-lookup-config   — current operational settings (no provider/credential fields)
 *   POST /person-lookup-config   — update operational settings only (upsert)
 */

import { serveCors }                          from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { createServiceClient }                from '../_shared/supabase.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { buildErrorResponse }                 from '../_shared/errors.ts';

const JSON_CT = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(ctx: EdgeRequestContext, message: string, status: number, code = 'ERROR'): Response {
  return buildErrorResponse(ctx, status, code, message);
}

// Same permission already gating other tenant-configuration surfaces
// (nets-credentials, stripe-credentials, data-migration).
const REQUIRED_PERMISSION = 'administration:organization:update';

function requirePerm(ctx: EdgeRequestContext): Response | null {
  if (ctx.organizationId === null) return err(ctx, 'Organisationskontext krävs', 403, 'FORBIDDEN');
  if (ctx.isPlatformAdmin) return null;
  if (!ctx.permissions.includes(REQUIRED_PERMISSION)) {
    return err(ctx, `Kräver behörighet: ${REQUIRED_PERMISSION}`, 403, 'FORBIDDEN');
  }
  return null;
}

interface ConfigRow {
  timeout_ms:                   number;
  max_retries:                  number;
  retry_backoff_ms:             number;
  auto_lookup_enabled:          boolean;
  auto_address_update_enabled:  boolean;
  cache_ttl_seconds:            number;
  is_active:                    boolean;
}

function toResponseShape(row: ConfigRow | null) {
  return {
    platform_managed:             true,
    timeout_ms:                   row?.timeout_ms ?? 5000,
    max_retries:                  row?.max_retries ?? 2,
    retry_backoff_ms:             row?.retry_backoff_ms ?? 500,
    auto_lookup_enabled:          row?.auto_lookup_enabled ?? true,
    auto_address_update_enabled:  row?.auto_address_update_enabled ?? false,
    cache_ttl_seconds:            row?.cache_ttl_seconds ?? 2_592_000,
    is_active:                    row?.is_active ?? true,
  };
}

// deno-lint-ignore no-explicit-any
async function handleGet(client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  const { data, error } = await client
    .from('person_lookup_provider_configs')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) return err(ctx, 'Kunde inte läsa konfiguration', 500, 'READ_FAILED');
  return json({ data: toResponseShape(data) });
}

// deno-lint-ignore no-explicit-any
async function handlePost(client: any, orgId: string, req: Request, ctx: EdgeRequestContext): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err(ctx, 'Ogiltig JSON', 400, 'INVALID_JSON');
  }

  // active_provider/client_id/client_secret/api_key/base_url are
  // deliberately not read from body anywhere below — platform-managed,
  // silently ignored if a caller sends them, never validated, never
  // encrypted, never stored, never returned.

  // Friendly validation matching the table's own CHECK constraints — without
  // this, an out-of-range value reaches the DB and fails as a generic 500
  // ("Kunde inte spara konfiguration") instead of a clear 422.
  if (typeof body['timeout_ms'] === 'number' && (body['timeout_ms'] < 500 || body['timeout_ms'] > 30000)) {
    return err(ctx, 'timeout_ms måste vara mellan 500 och 30000', 422, 'VALIDATION_FAILED');
  }
  if (typeof body['max_retries'] === 'number' && (body['max_retries'] < 0 || body['max_retries'] > 5)) {
    return err(ctx, 'max_retries måste vara mellan 0 och 5', 422, 'VALIDATION_FAILED');
  }
  if (typeof body['retry_backoff_ms'] === 'number' && (body['retry_backoff_ms'] < 100 || body['retry_backoff_ms'] > 10000)) {
    return err(ctx, 'retry_backoff_ms måste vara mellan 100 och 10000', 422, 'VALIDATION_FAILED');
  }
  if (typeof body['cache_ttl_seconds'] === 'number' && body['cache_ttl_seconds'] < 0) {
    return err(ctx, 'cache_ttl_seconds kan inte vara negativt', 422, 'VALIDATION_FAILED');
  }

  const { data: existing } = await client
    .from('person_lookup_provider_configs')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle();

  const next: Record<string, unknown> = {
    organization_id: orgId,
    // active_provider/credentials_encrypted/base_url deliberately omitted —
    // never included in the upsert payload, so an UPDATE leaves them
    // completely untouched (Postgres carries the existing value forward for
    // any column not named in the SET list) and an INSERT falls through to
    // the column defaults ('mock', NULL, NULL) — both states the DB
    // trigger's INSERT check already permits, since neither represents a
    // tenant setting anything.
    timeout_ms:                  typeof body['timeout_ms'] === 'number' ? body['timeout_ms'] : (existing?.timeout_ms ?? 5000),
    max_retries:                 typeof body['max_retries'] === 'number' ? body['max_retries'] : (existing?.max_retries ?? 2),
    retry_backoff_ms:            typeof body['retry_backoff_ms'] === 'number' ? body['retry_backoff_ms'] : (existing?.retry_backoff_ms ?? 500),
    auto_lookup_enabled:         typeof body['auto_lookup_enabled'] === 'boolean' ? body['auto_lookup_enabled'] : (existing?.auto_lookup_enabled ?? true),
    auto_address_update_enabled: typeof body['auto_address_update_enabled'] === 'boolean' ? body['auto_address_update_enabled'] : (existing?.auto_address_update_enabled ?? false),
    cache_ttl_seconds:           typeof body['cache_ttl_seconds'] === 'number' ? body['cache_ttl_seconds'] : (existing?.cache_ttl_seconds ?? 2_592_000),
    is_active:                   typeof body['is_active'] === 'boolean' ? body['is_active'] : (existing?.is_active ?? true),
    updated_by: ctx.actorId,
  };

  if (!existing) next.created_by = ctx.actorId;

  const { data: saved, error: upsertErr } = await client
    .from('person_lookup_provider_configs')
    .upsert(next, { onConflict: 'organization_id' })
    .select('*')
    .single();

  if (upsertErr) return err(ctx, 'Kunde inte spara konfiguration', 500, 'SAVE_FAILED');

  return json({ data: toResponseShape(saved) });
}

Deno.serve((req: Request) => serveCors(req, async () => {
  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  if (req.method !== 'GET') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
  }

  const permGuard = requirePerm(ctx);
  if (permGuard) return permGuard;

  const orgId = ctx.organizationId!;
  const client = createServiceClient();

  try {
    if (req.method === 'GET')  return await handleGet(client, orgId, ctx);
    if (req.method === 'POST') return await handlePost(client, orgId, req, ctx);
    return err(ctx, 'Metod ej tillåten', 405, 'METHOD_NOT_ALLOWED');
  } catch (e) {
    console.error('person-lookup-config error', e);
    return err(ctx, 'Internt serverfel', 500, 'INTERNAL_ERROR');
  }
}));
