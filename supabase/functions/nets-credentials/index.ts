/**
 * nets-credentials — Server-side, encrypted management of a tenant's own
 * Nets Secret Key / Checkout Key, mirroring stripe-credentials (ADR-022,
 * Integration Credential Management Architecture).
 *
 * Replaces the previous direct frontend -> organizations.settings write
 * for nets_secret_key / nets_checkout_key, which stored both fields in
 * plaintext and returned them to any org member (organizations_select_own
 * RLS has no permission check, only org membership). All other
 * organization settings fields are unaffected.
 *
 * The stored nets_secret_key is consumed by student-portal's
 * /payments/nets/checkout route and nets-webhook's settlement handler.
 *
 * Routes:
 *   GET  /nets-credentials   — status + masked display only, never the
 *                               real value
 *   POST /nets-credentials   — { nets_secret_key?, nets_checkout_key? }
 *                               validates (non-empty), encrypts, persists;
 *                               either or both fields may be provided
 *                               independently
 */

import { serveCors }                          from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { createServiceClient }                from '../_shared/supabase.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { buildErrorResponse }                 from '../_shared/errors.ts';
import { encryptCredential, maskCredential, credentialCryptoConfigured } from '../_shared/credential-crypto.ts';

const JSON_CT = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(ctx: EdgeRequestContext, message: string, status: number, code = 'ERROR'): Response {
  return buildErrorResponse(ctx, status, code, message);
}

// Dual-level payment architecture: a Nets key present on this org can be
// either TrafikCloud's shared pilot/test default (copied at provisioning,
// see _shared/trial-provisioning.ts, flagged settings.nets_pilot_configuration
// = true) or the tenant's own, deliberately-entered credential. The frontend
// must never present the former as the latter — this three-state value is
// how it tells them apart without needing to inspect the credential itself.
type NetsState = 'not_connected' | 'pilot' | 'tenant_owned';

function computeNetsState(configured: boolean, isPilot: boolean): NetsState {
  if (!configured) return 'not_connected';
  return isPilot ? 'pilot' : 'tenant_owned';
}

// Same permission already gating organization-wide administrative settings
// actions (stripe-credentials, data-migration) — no new permission introduced.
const REQUIRED_PERMISSION = 'administration:organization:update';

function requirePerm(ctx: EdgeRequestContext): Response | null {
  if (ctx.organizationId === null) return err(ctx, 'Organisationskontext krävs', 403, 'FORBIDDEN');
  if (ctx.isPlatformAdmin) return null;
  if (!ctx.permissions.includes(REQUIRED_PERMISSION)) {
    return err(ctx, `Kräver behörighet: ${REQUIRED_PERMISSION}`, 403, 'FORBIDDEN');
  }
  return null;
}

// ─── Validation ───────────────────────────────────────────────────────────────
//
// No live Nets endpoint is called (unlike Stripe's GET /v1/account check) —
// there is no Nets integration in this codebase to verify against yet.
// Format is limited to a sanity length check.

function verifyFormat(value: string): { ok: boolean; error?: string } {
  if (value.length < 8) return { ok: false, error: 'Värdet är för kort för att vara en giltig nyckel.' };
  return { ok: true };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function handleGet(client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  const { data, error } = await client
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();

  if (error || !data) return err(ctx, 'Organisation hittades inte', 404, 'NOT_FOUND');

  const settings = (data.settings ?? {}) as Record<string, unknown>;
  const configured = typeof settings['nets_secret_key'] === 'string' && settings['nets_secret_key'] !== '';
  const isPilot     = settings['nets_pilot_configuration'] === true;

  return json({
    data: {
      nets_secret_key_configured:   configured,
      nets_secret_key_masked:       (settings['nets_secret_key_masked'] as string | undefined) ?? null,
      nets_checkout_key_configured: typeof settings['nets_checkout_key'] === 'string' && settings['nets_checkout_key'] !== '',
      nets_checkout_key_masked:     (settings['nets_checkout_key_masked'] as string | undefined) ?? null,
      nets_state:                   computeNetsState(configured, isPilot),
    },
  });
}

// deno-lint-ignore no-explicit-any
async function handlePost(client: any, orgId: string, req: Request, ctx: EdgeRequestContext): Promise<Response> {
  if (!credentialCryptoConfigured()) {
    return err(ctx, 'Kryptering är inte konfigurerad på plattformen', 503, 'CRYPTO_NOT_CONFIGURED');
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err(ctx, 'Ogiltig JSON', 400, 'INVALID_JSON');
  }

  const secretKeyInput   = typeof body['nets_secret_key'] === 'string' ? body['nets_secret_key'].trim() : undefined;
  const checkoutKeyInput = typeof body['nets_checkout_key'] === 'string' ? body['nets_checkout_key'].trim() : undefined;

  if (secretKeyInput === undefined && checkoutKeyInput === undefined) {
    return err(ctx, 'Ingen uppgift att spara', 400, 'NO_FIELDS');
  }

  const { data: orgRow, error: orgErr } = await client
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .maybeSingle();
  if (orgErr || !orgRow) return err(ctx, 'Organisation hittades inte', 404, 'NOT_FOUND');

  const current = (orgRow.settings ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };

  if (secretKeyInput !== undefined) {
    if (secretKeyInput === '') {
      delete next['nets_secret_key'];
      delete next['nets_secret_key_masked'];
      // Nothing configured any more — a stale pilot flag would otherwise
      // keep reporting "pilot" for a key that no longer exists.
      delete next['nets_pilot_configuration'];
    } else {
      const validation = verifyFormat(secretKeyInput);
      if (!validation.ok) return err(ctx, validation.error ?? 'Ogiltigt värde', 422, 'VALIDATION_FAILED');
      next['nets_secret_key']        = await encryptCredential(secretKeyInput);
      next['nets_secret_key_masked'] = maskCredential(secretKeyInput);
      // The tenant just deliberately entered their own key — this can never
      // be TrafikCloud's pilot/test configuration again, even if a pilot
      // default was copied in at provisioning.
      next['nets_pilot_configuration'] = false;
    }
  }

  if (checkoutKeyInput !== undefined) {
    if (checkoutKeyInput === '') {
      delete next['nets_checkout_key'];
      delete next['nets_checkout_key_masked'];
    } else {
      const validation = verifyFormat(checkoutKeyInput);
      if (!validation.ok) return err(ctx, validation.error ?? 'Ogiltigt värde', 422, 'VALIDATION_FAILED');
      next['nets_checkout_key']        = await encryptCredential(checkoutKeyInput);
      next['nets_checkout_key_masked'] = maskCredential(checkoutKeyInput);
      // Same as the secret key above — entering their own checkout key is
      // also a deliberate tenant-ownership action, in case a tenant ever
      // updates this field independently of the secret key.
      next['nets_pilot_configuration'] = false;
    }
  }

  const { error: updateErr } = await client
    .from('organizations')
    .update({ settings: next })
    .eq('id', orgId);
  if (updateErr) return err(ctx, 'Kunde inte spara', 500, 'UPDATE_FAILED');

  const nowConfigured = typeof next['nets_secret_key'] === 'string';
  return json({
    data: {
      nets_secret_key_configured:   nowConfigured,
      nets_secret_key_masked:       (next['nets_secret_key_masked'] as string | undefined) ?? null,
      nets_checkout_key_configured: typeof next['nets_checkout_key'] === 'string',
      nets_checkout_key_masked:     (next['nets_checkout_key_masked'] as string | undefined) ?? null,
      nets_state:                   computeNetsState(nowConfigured, next['nets_pilot_configuration'] === true),
    },
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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
    console.error('nets-credentials error', e);
    return err(ctx, 'Internt serverfel', 500, 'INTERNAL_ERROR');
  }
}));
