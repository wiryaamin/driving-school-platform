/**
 * stripe-credentials — Server-side, encrypted management of a tenant's own
 * Stripe credentials (ADR-022, Integration Credential Management
 * Architecture, applied to Stripe specifically per the approved
 * Corrective Implementation scope).
 *
 * Replaces the previous direct frontend -> organizations.settings write
 * for stripe_secret_key / stripe_webhook_secret. All other organization
 * settings fields are unaffected and continue to save as before — this
 * function is scoped to the two Stripe credential fields only.
 *
 * Routes:
 *   GET  /stripe-credentials   — status + masked display only, never the
 *                                 real value
 *   POST /stripe-credentials   — { stripe_secret_key?, stripe_webhook_secret? }
 *                                 validates, encrypts, persists; either or
 *                                 both fields may be provided independently
 *
 * Validation before persistence:
 *   - stripe_secret_key: live connectivity check (GET /v1/account) — a
 *     credential that doesn't authenticate is never saved. This is the
 *     exact check that would have caught the unrelated third-party
 *     credential this ADR was written in response to.
 *   - stripe_webhook_secret: format check only (no live-verifiable API
 *     exists for a webhook signing secret in isolation).
 *
 * Backward compatibility: values already stored in plaintext (before this
 * function existed) are left exactly as they are — this function only
 * governs future saves. See _shared/credential-crypto.ts.
 */

import { serveCors }                          from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { createServiceClient }                from '../_shared/supabase.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { buildErrorResponse }                 from '../_shared/errors.ts';
import { encryptCredential, decryptCredential, maskCredential, credentialCryptoConfigured } from '../_shared/credential-crypto.ts';

const JSON_CT = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(ctx: EdgeRequestContext, message: string, status: number, code = 'ERROR'): Response {
  return buildErrorResponse(ctx, status, code, message);
}

// Same permission already gating other organization-wide administrative
// settings actions (data-migration, guardian-portal management) — no new
// permission introduced.
const REQUIRED_PERMISSION = 'administration:organization:update';

function requirePerm(ctx: EdgeRequestContext): Response | null {
  if (ctx.isPlatformAdmin) return null;
  if (ctx.organizationId === null) return err(ctx, 'Organisationskontext krävs', 403, 'FORBIDDEN');
  if (!ctx.permissions.includes(REQUIRED_PERMISSION)) {
    return err(ctx, `Kräver behörighet: ${REQUIRED_PERMISSION}`, 403, 'FORBIDDEN');
  }
  return null;
}

// ─── Validation ───────────────────────────────────────────────────────────────

async function verifyStripeSecretKey(key: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(key)) {
    return { ok: false, error: 'Ogiltigt format på Stripe Secret Key (ska börja med sk_test_ eller sk_live_).' };
  }
  try {
    const res = await fetch('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { ok: false, error: 'Stripe kunde inte verifiera nyckeln — kontrollera att den är korrekt och aktiv.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Kunde inte nå Stripe för att verifiera nyckeln. Försök igen.' };
  }
}

function verifyStripeWebhookSecretFormat(secret: string): { ok: boolean; error?: string } {
  if (!/^whsec_[A-Za-z0-9]+$/.test(secret) || secret.length < 20) {
    return { ok: false, error: 'Ogiltigt format på Stripe Webhook Signing Secret (ska börja med whsec_).' };
  }
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

  return json({
    data: {
      stripe_secret_key_configured:     typeof settings['stripe_secret_key'] === 'string' && settings['stripe_secret_key'] !== '',
      stripe_secret_key_masked:         (settings['stripe_secret_key_masked'] as string | undefined) ?? null,
      stripe_webhook_secret_configured: typeof settings['stripe_webhook_secret'] === 'string' && settings['stripe_webhook_secret'] !== '',
      stripe_webhook_secret_masked:     (settings['stripe_webhook_secret_masked'] as string | undefined) ?? null,
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

  const secretKeyInput     = typeof body['stripe_secret_key'] === 'string' ? body['stripe_secret_key'].trim() : undefined;
  const webhookSecretInput = typeof body['stripe_webhook_secret'] === 'string' ? body['stripe_webhook_secret'].trim() : undefined;

  if (secretKeyInput === undefined && webhookSecretInput === undefined) {
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
      delete next['stripe_secret_key'];
      delete next['stripe_secret_key_masked'];
    } else {
      const validation = await verifyStripeSecretKey(secretKeyInput);
      if (!validation.ok) return err(ctx, validation.error ?? 'Ogiltig nyckel', 422, 'VALIDATION_FAILED');
      next['stripe_secret_key']        = await encryptCredential(secretKeyInput);
      next['stripe_secret_key_masked'] = maskCredential(secretKeyInput);
    }
  }

  if (webhookSecretInput !== undefined) {
    if (webhookSecretInput === '') {
      delete next['stripe_webhook_secret'];
      delete next['stripe_webhook_secret_masked'];
    } else {
      const validation = verifyStripeWebhookSecretFormat(webhookSecretInput);
      if (!validation.ok) return err(ctx, validation.error ?? 'Ogiltigt format', 422, 'VALIDATION_FAILED');
      next['stripe_webhook_secret']        = await encryptCredential(webhookSecretInput);
      next['stripe_webhook_secret_masked'] = maskCredential(webhookSecretInput);
    }
  }

  const { error: updateErr } = await client
    .from('organizations')
    .update({ settings: next })
    .eq('id', orgId);
  if (updateErr) return err(ctx, 'Kunde inte spara', 500, 'UPDATE_FAILED');

  return json({
    data: {
      stripe_secret_key_configured:     typeof next['stripe_secret_key'] === 'string',
      stripe_secret_key_masked:         (next['stripe_secret_key_masked'] as string | undefined) ?? null,
      stripe_webhook_secret_configured: typeof next['stripe_webhook_secret'] === 'string',
      stripe_webhook_secret_masked:     (next['stripe_webhook_secret_masked'] as string | undefined) ?? null,
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
    console.error('stripe-credentials error', e);
    return err(ctx, 'Internt serverfel', 500, 'INTERNAL_ERROR');
  }
}));
