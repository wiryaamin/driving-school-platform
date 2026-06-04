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

  // JWT claims are set by the Phase 1B.3 auth-hook Edge Function
  // Structure mirrors packages/types/src/auth.types.ts JwtClaims
  const meta = user.app_metadata as {
    organization_id?: string | null;
    role?: string | null;
    permissions?: string[];
    is_platform_admin?: boolean;
  };

  const ctx: EdgeRequestContext = {
    organizationId:  meta.organization_id ?? null,
    actorId:         user.id,
    actorRole:       meta.role ?? null,
    permissions:     meta.permissions ?? [],
    correlationId,
    isPlatformAdmin: meta.is_platform_admin ?? false,
    isWorker:        false,
    requestId:       correlationId,
    userAgent:       req.headers.get('User-Agent'),
    ipAddress:       req.headers.get('X-Forwarded-For'),
    startedAt:       Date.now(),
  };

  return { ok: true, ctx };
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
