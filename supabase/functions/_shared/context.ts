import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logger } from './logger.ts';
import { checkTrialLock } from './subscription.ts';

// Mirrors packages/api-core TenantContext — keep in sync
export interface EdgeTenantContext {
  organizationId: string | null;
  actorId: string | null;
  /** Verified actor email from auth.getUser(). Null if not present on the auth user. */
  actorEmail: string | null;
  actorRole: string | null;
  permissions: string[];
  /** Subscription tier from JWT claims. Defaults to 'trial' if not present. */
  subscriptionTier: string;
  /** Subscription status from JWT claims (e.g. 'trialing', 'active'). Null for platform admins. */
  subscriptionStatus: string | null;
  /** Trial end date from JWT claims, ISO string. Null once upgraded or for platform admins. */
  trialEndsAt: string | null;
  correlationId: string;
  isPlatformAdmin: boolean;
  isWorker: false;
}

export interface EdgeRequestContext extends EdgeTenantContext {
  requestId: string;
  userAgent: string | null;
  ipAddress: string | null;
  startedAt: number;
}

export type ContextResult =
  | { ok: true; ctx: EdgeRequestContext }
  | { ok: false; response: Response };

/**
 * Builds a fully-hydrated EdgeRequestContext from an inbound Edge Function request.
 *
 * Verifies the JWT via supabase.auth.getUser() (handles both HS256 and RS256 signing
 * transparently — avoids the brittle HMAC-SHA256 custom check which requires
 * SUPABASE_JWT_SECRET to be available and match the project's signing algorithm).
 * Custom claims (organization_id, role, permissions, is_platform_admin) are decoded
 * directly from the JWT payload since auth.getUser() does not return app_metadata.
 */
export async function buildEdgeContext(req: Request): Promise<ContextResult> {
  const correlationId =
    req.headers.get('X-Correlation-ID') ?? crypto.randomUUID();
  // request_id always identifies exactly this one invocation — never accepted
  // from the client, unlike correlation_id which may span a multi-request flow.
  // See PR-2 Observability Architecture v1.0, ADR-001.
  const requestId = crypto.randomUUID();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: errorResponse(401, 'UNAUTHORIZED', 'Missing bearer token', correlationId, requestId),
    };
  }

  const jwt = authHeader.slice(7); // strip 'Bearer '

  // Verify via Supabase admin client — handles both HS256 and RS256 transparently.
  const supabaseUrl        = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient        = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: authErr } = await adminClient.auth.getUser(jwt);

  if (authErr || !user) {
    logger.warn('JWT verification failed via auth.getUser()', {
      correlation_id: correlationId,
      error: authErr?.message ?? 'no user',
    });
    return {
      ok: false,
      response: errorResponse(401, 'UNAUTHORIZED', 'Invalid or expired token', correlationId, requestId),
    };
  }

  // Decode custom claims from JWT payload — not returned by auth.getUser().
  const claims = decodeJwtPayload(jwt);

  logger.debug('buildEdgeContext.jwt_verified', {
    correlation_id:    correlationId,
    actor_id:          user.id,
    organization_id:   claims['organization_id'] ?? null,
    is_platform_admin: claims['is_platform_admin'] ?? false,
    permissions_count: Array.isArray(claims['permissions']) ? (claims['permissions'] as string[]).length : 0,
  });

  const ctx: EdgeRequestContext = {
    organizationId:     (claims['organization_id']   as string | null) ?? null,
    actorId:            user.id,
    actorEmail:         user.email ?? null,
    actorRole:          (claims['role']              as string | null) ?? null,
    permissions:        (claims['permissions']       as string[])      ?? [],
    subscriptionTier:   (claims['subscription_tier']  as string)       ?? 'trial',
    subscriptionStatus: (claims['subscription_status'] as string | null) ?? null,
    trialEndsAt:        (claims['trial_ends_at']      as string | null) ?? null,
    correlationId,
    isPlatformAdmin:    (claims['is_platform_admin']  as boolean)      ?? false,
    isWorker:           false,
    requestId,
    userAgent:          req.headers.get('User-Agent'),
    ipAddress:          req.headers.get('X-Forwarded-For'),
    startedAt:          Date.now(),
  };

  // 7-day-grace-then-lock trial expiry — enforced here so every Edge
  // Function is protected uniformly, the same way JWT verification already
  // is, with no per-handler opt-in to forget. See checkTrialLock for the
  // exact rule (mirrors the frontend's getTrialLockState).
  const lockResponse = checkTrialLock(ctx);
  if (lockResponse !== null) {
    return { ok: false, response: lockResponse };
  }

  return { ok: true, ctx };
}

/**
 * Guard clause for route-level permission checks. Mirrors the local
 * requirePerm() already used in students/instructors/etc. — centralised here
 * so newly-migrated functions can import instead of redefining it.
 * Platform admins bypass. Returns null when allowed, or a 403 Response.
 */
export function requirePerm(ctx: EdgeRequestContext, code: string): Response | null {
  if (ctx.organizationId === null) {
    return errorResponse(403, 'FORBIDDEN', 'Organisation context is required', ctx.correlationId, ctx.requestId);
  }
  if (ctx.isPlatformAdmin) return null;
  if (!ctx.permissions.includes(code)) {
    return errorResponse(403, 'FORBIDDEN', `Requires permission: ${code}`, ctx.correlationId, ctx.requestId);
  }
  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  const b64url = parts[1] ?? '';
  if (!b64url) return {};
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - b64.length % 4) % 4;
  try {
    return JSON.parse(atob(b64 + '='.repeat(pad))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  traceId: string,
  requestId?: string
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Correlation-ID': traceId,
  };
  if (requestId !== undefined) headers['X-Request-ID'] = requestId;

  return new Response(
    JSON.stringify({
      code,
      message,
      trace_id: traceId,
      ...(requestId !== undefined && { request_id: requestId }),
    }),
    { status, headers }
  );
}
