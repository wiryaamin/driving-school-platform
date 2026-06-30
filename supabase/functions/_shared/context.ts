import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logger } from './logger.ts';

// Mirrors packages/api-core TenantContext — keep in sync
export interface EdgeTenantContext {
  organizationId: string | null;
  actorId: string | null;
  actorRole: string | null;
  permissions: string[];
  /** Subscription tier from JWT claims. Defaults to 'trial' if not present. */
  subscriptionTier: string;
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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: errorResponse(401, 'UNAUTHORIZED', 'Missing bearer token', correlationId),
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
      response: errorResponse(401, 'UNAUTHORIZED', 'Invalid or expired token', correlationId),
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
    organizationId:   (claims['organization_id']  as string | null) ?? null,
    actorId:          user.id,
    actorRole:        (claims['role']             as string | null) ?? null,
    permissions:      (claims['permissions']      as string[])      ?? [],
    subscriptionTier: (claims['subscription_tier'] as string)       ?? 'trial',
    correlationId,
    isPlatformAdmin:  (claims['is_platform_admin'] as boolean)      ?? false,
    isWorker:         false,
    requestId:        correlationId,
    userAgent:        req.headers.get('User-Agent'),
    ipAddress:        req.headers.get('X-Forwarded-For'),
    startedAt:        Date.now(),
  };

  return { ok: true, ctx };
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
  traceId: string
): Response {
  return new Response(
    JSON.stringify({ code, message, trace_id: traceId }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': traceId,
      },
    }
  );
}
