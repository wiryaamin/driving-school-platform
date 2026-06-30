import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import type { AuthHookPayload, AuthHookResponse, CustomClaims } from '../_shared/types.ts';

// Loaded once at cold-start — avoids per-request env lookups.
// Format: "v1,whsec_<base64_key>" — Supabase standard-webhook signing key.
const HOOK_SECRET = Deno.env.get('AUTH_HOOK_SECRET');

// Warn when JWT payload exceeds this byte threshold — large JWTs slow down every
// authenticated request since the token is sent in every Authorization header.
const JWT_SIZE_WARNING_BYTES = 4096;

// GoTrue v2.188.1+ uses standard-webhook signing (NOT Bearer token) for auth hooks.
// It sends three headers:
//   webhook-id:        unique message ID per invocation
//   webhook-timestamp: Unix seconds (used in signed content + replay guard)
//   webhook-signature: "v1,<base64(HMAC-SHA256(msgId.timestamp.body, key))>"
//
// The secret in config.toml / GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_SECRETS is the
// signing key in "v1,whsec_<base64_raw_key>" format. We decode the raw key,
// recompute the HMAC over the same signed content, and compare with the received
// signature. This replaces the old "Authorization: Bearer <raw_secret>" check
// which GoTrue no longer sends.
async function verifyStandardWebhook(
  req: Request,
  rawBody: string,
  secret: string,
): Promise<boolean> {
  const WHSEC_PREFIX = 'v1,whsec_';
  if (!secret.startsWith(WHSEC_PREFIX)) return false;

  const msgId        = req.headers.get('webhook-id');
  const msgTimestamp = req.headers.get('webhook-timestamp');
  const msgSignature = req.headers.get('webhook-signature');

  if (!msgId || !msgTimestamp || !msgSignature) return false;

  // Replay-attack guard: reject requests older than 5 minutes.
  const ts  = parseInt(msgTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(ts) || Math.abs(now - ts) > 300) return false;

  // Decode the raw signing key from the whsec_ base64 payload.
  const b64Key   = secret.slice(WHSEC_PREFIX.length);
  const rawKey   = Uint8Array.from(atob(b64Key), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Signed content = "<webhook-id>.<webhook-timestamp>.<raw-body>"
  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;
  const sigBytes      = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(signedContent),
  );
  const computedSig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  // webhook-signature may contain multiple space-separated "v1,<sig>" values.
  return msgSignature
    .split(' ')
    .some(s => {
      const comma = s.indexOf(',');
      if (comma === -1) return false;
      return s.slice(0, comma) === 'v1' && s.slice(comma + 1) === computedSig;
    });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const correlationId = crypto.randomUUID();

  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  // ── 1. Read raw body (needed for signature verification before JSON parse) ──
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return json({ error: 'Failed to read request body' }, 400);
  }

  // ── 2. Verify standard-webhook HMAC-SHA256 signature ────────────────────────
  // GoTrue sends webhook-id / webhook-timestamp / webhook-signature headers.
  // Reject immediately if the signature is absent or doesn't match.
  if (!HOOK_SECRET) {
    logger.error('auth-hook: AUTH_HOOK_SECRET env var is not set', { correlation_id: correlationId });
    return json({ error: 'Hook misconfigured' }, 500);
  }

  const signatureValid = await verifyStandardWebhook(req, rawBody, HOOK_SECRET);
  if (!signatureValid) {
    logger.warn('auth-hook: unauthorized request — invalid or missing webhook signature', {
      correlation_id: correlationId,
      has_webhook_id:        !!req.headers.get('webhook-id'),
      has_webhook_timestamp: !!req.headers.get('webhook-timestamp'),
      has_webhook_signature: !!req.headers.get('webhook-signature'),
    });
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── 3. Parse payload ─────────────────────────────────────────────────────────
  let payload: AuthHookPayload;
  try {
    payload = JSON.parse(rawBody) as AuthHookPayload;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { user_id, claims, authentication_method } = payload;

  if (!user_id) {
    return json({ error: 'Missing user_id' }, 400);
  }

  // ── 4. Build custom claims via DB function ────────────────────────────────────
  try {
    const supabase = createServiceClient();

    const preferredOrgId = (claims.app_metadata?.preferred_org_id as string) ?? null;

    const firstAttempt = await supabase.rpc('get_user_jwt_claims', {
      p_user_id:       user_id,
      p_target_org_id: preferredOrgId,
    });

    let claimsData = firstAttempt.data;
    let claimsError = firstAttempt.error;

    if (claimsError) {
      // Retry once — cold start may have caused the initial DB connection to fail.
      logger.warn('auth-hook: claims attempt 1 failed — retrying in 500 ms', {
        correlation_id: correlationId,
        user_id,
        error: claimsError.message,
      });
      await new Promise(r => setTimeout(r, 500));
      const retry = await supabase.rpc('get_user_jwt_claims', {
        p_user_id:       user_id,
        p_target_org_id: preferredOrgId,
      });
      claimsData  = retry.data;
      claimsError = retry.error;
    }

    if (claimsError) {
      logger.error('auth-hook: get_user_jwt_claims failed after retry — degraded fallback', {
        correlation_id: correlationId,
        user_id,
        error: claimsError.message,
        code:  claimsError.code,
      });
      return json({ claims: { ...claims, auth_degraded: true } }, 200);
    }

    const custom = claimsData as CustomClaims | null;

    logger.info('auth-hook: claims built', {
      correlation_id:    correlationId,
      user_id,
      method:            authentication_method,
      has_org:           !!custom?.organization_id,
      is_platform_admin: custom?.is_platform_admin ?? false,
    });

    // ── 5. Merge and return enriched claims ───────────────────────────────────
    const enriched: AuthHookResponse['claims'] = {
      ...claims,
      organization_id:      custom?.organization_id       ?? null,
      active_membership_id: custom?.active_membership_id  ?? null,
      role:                 custom?.role                  ?? claims.role,
      permissions:          custom?.permissions           ?? [],
      location_ids:         custom?.location_ids          ?? [],
      subscription_tier:    custom?.subscription_tier     ?? 'trial',
      is_platform_admin:    custom?.is_platform_admin     ?? false,
    };

    // ── 7. JWT size guard ─────────────────────────────────────────────────────
    const payloadBytes = new TextEncoder().encode(JSON.stringify(enriched)).length;
    if (payloadBytes > JWT_SIZE_WARNING_BYTES) {
      logger.warn('auth-hook: JWT payload exceeds size threshold', {
        correlation_id: correlationId,
        user_id,
        bytes:     payloadBytes,
        threshold: JWT_SIZE_WARNING_BYTES,
        hint:      'Consider trimming the permissions array or switching to permission groups',
      });
    }

    return json({ claims: enriched }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('auth-hook: unexpected error — degraded fallback', {
      correlation_id: correlationId,
      user_id,
      error: message,
    });
    return json({ claims: { ...claims, auth_degraded: true } }, 200);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
