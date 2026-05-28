import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import type { AuthHookPayload, AuthHookResponse, CustomClaims } from '../_shared/types.ts';

// Loaded once at cold-start — avoids per-request env lookups
const HOOK_SECRET = Deno.env.get('AUTH_HOOK_SECRET');

// Warn when JWT payload exceeds this byte threshold — large JWTs slow down every
// authenticated request since the token is sent in every Authorization header.
const JWT_SIZE_WARNING_BYTES = 4096;

Deno.serve(async (req: Request): Promise<Response> => {
  // Correlation ID ties together all log lines for a single hook invocation
  const correlationId = crypto.randomUUID();

  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  // ── 1. Verify Supabase hook secret ──────────────────────────────────────────
  // Supabase sends the secret configured in config.toml as `Bearer <secret>`.
  // Any request that fails this check is rejected — the hook is not a public API.
  const authHeader = req.headers.get('Authorization');
  if (!HOOK_SECRET || authHeader !== `Bearer ${HOOK_SECRET}`) {
    logger.warn('auth-hook: unauthorized request', {
      correlation_id: correlationId,
      has_header: !!authHeader,
      ip: req.headers.get('x-forwarded-for') ?? 'unknown',
    });
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── 2. Parse payload ─────────────────────────────────────────────────────────
  let payload: AuthHookPayload;
  try {
    payload = (await req.json()) as AuthHookPayload;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { user_id, claims, authentication_method } = payload;

  if (!user_id) {
    return json({ error: 'Missing user_id' }, 400);
  }

  // ── 3. Build custom claims via DB function ────────────────────────────────────
  try {
    const supabase = createServiceClient();

    // preferred_org_id is set by /switch-tenant and persisted in app_metadata.
    // The auth hook reads it here so tenant switches take effect on next token refresh.
    const preferredOrgId = (claims.app_metadata?.preferred_org_id as string) ?? null;

    const { data: customClaims, error: claimsError } = await supabase
      .rpc('get_user_jwt_claims', {
        p_user_id:       user_id,
        p_target_org_id: preferredOrgId,
      });

    if (claimsError) {
      // Log the failure but never block sign-in — return unmodified claims with
      // auth_degraded flag so the client can show a degraded-session warning.
      logger.error('auth-hook: get_user_jwt_claims failed — degraded fallback', {
        correlation_id: correlationId,
        user_id,
        error: claimsError.message,
        code:  claimsError.code,
      });
      return json({ claims: { ...claims, auth_degraded: true } }, 200);
    }

    const custom = customClaims as CustomClaims | null;

    logger.info('auth-hook: claims built', {
      correlation_id:    correlationId,
      user_id,
      method:            authentication_method,
      has_org:           !!custom?.organization_id,
      is_platform_admin: custom?.is_platform_admin ?? false,
    });

    // ── 4. Impersonation gate (foundation — not yet active) ────────────────────
    // When impersonation is implemented:
    //   - Validate impersonator_id claim against platform_admins table
    //   - Cap JWT expiry to 30 minutes
    //   - Emit audit event via event_outbox
    //   - Ensure permissions do not exceed target user's actual grants
    // For now: strip any impersonator_id that somehow reaches the hook
    // to prevent privilege escalation via a crafted request.
    const safeImpersonatorId: string | undefined = undefined; // locked until implemented

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
      ...(safeImpersonatorId !== undefined && { impersonator_id: safeImpersonatorId }),
    };

    // ── 6. JWT size guard ─────────────────────────────────────────────────────
    // Large JWTs increase latency on every authenticated API call. Warn early
    // so we can prune the permission set before it becomes a production issue.
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
    // Fail open — never lock users out on unexpected errors
    return json({ claims: { ...claims, auth_degraded: true } }, 200);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
