/**
 * person-lookup-config — tenant configuration for the Person Lookup
 * Framework (Phase 5): active provider, encrypted credentials, timeout,
 * retry policy, auto-lookup/auto-address-update toggles, cache duration.
 *
 * Mirrors nets-credentials/stripe-credentials (ADR-022) for the credential
 * field specifically — encrypted via encryptCredential(), never returned in
 * plaintext, only a masked display fragment. The rest of the config
 * (timeout/retry/toggles/cache TTL) is plain tenant-owned settings, no
 * different in sensitivity from any other operational setting on this
 * platform.
 *
 * Routes:
 *   GET  /person-lookup-config   — current config (credential masked, never plaintext)
 *   POST /person-lookup-config   — create/update config (upsert)
 */

import { serveCors }                          from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { createServiceClient }                from '../_shared/supabase.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { buildErrorResponse }                 from '../_shared/errors.ts';
import { encryptCredential, maskCredential, credentialCryptoConfigured } from '../_shared/credential-crypto.ts';
import { KNOWN_PROVIDER_NAMES } from '../_shared/person-lookup.ts';

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
  active_provider:              string;
  credentials_encrypted:        string | null;
  base_url:                     string | null;
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
    active_provider:              row?.active_provider ?? 'mock',
    credentials_configured:       typeof row?.credentials_encrypted === 'string' && row.credentials_encrypted !== '',
    base_url:                     row?.base_url ?? null,
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

  const provider = typeof body['active_provider'] === 'string' ? body['active_provider'].trim().toLowerCase() : undefined;
  if (provider !== undefined && !KNOWN_PROVIDER_NAMES.includes(provider as never)) {
    return err(ctx, `Okänd leverantör. Giltiga värden: ${KNOWN_PROVIDER_NAMES.join(', ')}`, 422, 'VALIDATION_FAILED');
  }

  // Two credential shapes are accepted, matching the two auth models real
  // providers use: a single api_key (future single-key providers), or a
  // client_id + client_secret pair (Roaring's OAuth2 client-credentials
  // model). Whichever is supplied is what person-lookup-service.ts's
  // resolveConfig() disambiguates by shape when decrypting.
  const clientId     = typeof body['client_id']     === 'string' ? body['client_id'].trim()     : undefined;
  const clientSecret = typeof body['client_secret'] === 'string' ? body['client_secret'].trim() : undefined;
  const apiKeyInput  = typeof body['api_key']        === 'string' ? body['api_key'].trim()       : undefined;

  if (clientId !== undefined && clientSecret === undefined) {
    return err(ctx, 'client_secret krävs tillsammans med client_id', 422, 'VALIDATION_FAILED');
  }
  if (clientSecret !== undefined && clientId === undefined) {
    return err(ctx, 'client_id krävs tillsammans med client_secret', 422, 'VALIDATION_FAILED');
  }

  const credentialInput = clientId !== undefined && clientSecret !== undefined
    ? (clientId === '' && clientSecret === '' ? '' : JSON.stringify({ clientId, clientSecret }))
    : apiKeyInput;

  if (credentialInput !== undefined && credentialInput !== '' && !credentialCryptoConfigured()) {
    return err(ctx, 'Kryptering är inte konfigurerad på plattformen', 503, 'CRYPTO_NOT_CONFIGURED');
  }

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
    active_provider: provider ?? existing?.active_provider ?? 'mock',
    base_url:        typeof body['base_url'] === 'string' ? (body['base_url'].trim() || null) : (existing?.base_url ?? null),
    timeout_ms:                  typeof body['timeout_ms'] === 'number' ? body['timeout_ms'] : (existing?.timeout_ms ?? 5000),
    max_retries:                 typeof body['max_retries'] === 'number' ? body['max_retries'] : (existing?.max_retries ?? 2),
    retry_backoff_ms:            typeof body['retry_backoff_ms'] === 'number' ? body['retry_backoff_ms'] : (existing?.retry_backoff_ms ?? 500),
    auto_lookup_enabled:         typeof body['auto_lookup_enabled'] === 'boolean' ? body['auto_lookup_enabled'] : (existing?.auto_lookup_enabled ?? true),
    auto_address_update_enabled: typeof body['auto_address_update_enabled'] === 'boolean' ? body['auto_address_update_enabled'] : (existing?.auto_address_update_enabled ?? false),
    cache_ttl_seconds:           typeof body['cache_ttl_seconds'] === 'number' ? body['cache_ttl_seconds'] : (existing?.cache_ttl_seconds ?? 2_592_000),
    is_active:                   typeof body['is_active'] === 'boolean' ? body['is_active'] : (existing?.is_active ?? true),
    updated_by: ctx.actorId,
  };

  if (credentialInput !== undefined) {
    next.credentials_encrypted = credentialInput === '' ? null : await encryptCredential(credentialInput);
  } else if (existing) {
    next.credentials_encrypted = existing.credentials_encrypted;
  }

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
