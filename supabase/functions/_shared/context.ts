import { createSupabaseClient } from './supabase.ts';
import { logger } from './logger.ts';

// Mirrors packages/api-core TenantContext — keep in sync
export interface EdgeTenantContext {
  organizationId: string | null;
  actorId: string | null;
  actorRole: string | null;
  permissions: string[];
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
 * Flow:
 *   1. Extract or generate X-Correlation-ID
 *   2. Verify Authorization: Bearer <jwt> via Supabase auth.getUser()
 *   3. Extract JWT claims (set by Phase 1B.3 auth-hook)
 *   4. Return context or a typed error Response
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

  const client = createSupabaseClient(req);
  const { data: { user }, error: authError } = await client.auth.getUser();

  if (authError !== null || user === null) {
    logger.warn('JWT verification failed', {
      correlation_id: correlationId,
      error: authError?.message,
    });
    return {
      ok: false,
      response: errorResponse(401, 'UNAUTHORIZED', 'Invalid or expired token', correlationId),
    };
  }

  // Decode JWT payload directly to read custom claims set by the auth-hook.
  // These claims (organization_id, role, permissions, is_platform_admin) are
  // top-level fields in the JWT — they are NOT present in user.app_metadata on
  // hosted Supabase, where getUser() returns the database record rather than
  // merging all JWT claims into app_metadata.
  const jwt = decodeJwtPayload(authHeader.slice(7));

  // Forensic logging — remove after JWT claim extraction is verified.
  logger.info('buildEdgeContext.jwt_debug', {
    correlation_id:   correlationId,
    jwt_keys:         Object.keys(jwt),
    organization_id:  jwt['organization_id'] ?? null,
    is_platform_admin: jwt['is_platform_admin'] ?? false,
    permissions_count: Array.isArray(jwt['permissions']) ? (jwt['permissions'] as string[]).length : 0,
  });

  const ctx: EdgeRequestContext = {
    organizationId:  (jwt['organization_id'] as string | null) ?? null,
    actorId:         user.id,
    actorRole:       (jwt['role'] as string | null) ?? null,
    permissions:     (jwt['permissions'] as string[]) ?? [],
    correlationId,
    isPlatformAdmin: (jwt['is_platform_admin'] as boolean) ?? false,
    isWorker:        false,
    requestId:       correlationId,
    userAgent:       req.headers.get('User-Agent'),
    ipAddress:       req.headers.get('X-Forwarded-For'),
    startedAt:       Date.now(),
  };

  return { ok: true, ctx };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const b64url = token.split('.')[1] ?? '';
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (b64.length % 4)) % 4;
    return JSON.parse(atob(b64 + '='.repeat(padding))) as Record<string, unknown>;
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
