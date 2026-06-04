import { z } from 'npm:zod@3';
import { buildEdgeContext } from './context.ts';
import { logger } from './logger.ts';
import type { EdgeRequestContext } from './context.ts';

export type EdgeHandler = (
  req: Request,
  ctx: EdgeRequestContext,
  params?: Record<string, string>
) => Promise<Response>;

export type Middleware = (next: EdgeHandler) => EdgeHandler;

// ─── Middleware: Correlation ID ───────────────────────────────────────────────

export function correlationMiddleware(): Middleware {
  return (next) => async (req, ctx, params) => {
    const response = await next(req, ctx, params);
    response.headers.set('X-Correlation-ID', ctx.correlationId);
    return response;
  };
}

// ─── Middleware: Request Logging ──────────────────────────────────────────────

export function loggingMiddleware(): Middleware {
  return (next) => async (req, ctx, params) => {
    const url = new URL(req.url);
    logger.info('request.started', {
      method:         req.method,
      path:           url.pathname,
      correlation_id: ctx.correlationId,
      org_id:         ctx.organizationId ?? 'platform',
      actor_id:       ctx.actorId,
    });

    const response = await next(req, ctx, params);

    logger.info('request.completed', {
      method:         req.method,
      path:           url.pathname,
      status:         response.status,
      correlation_id: ctx.correlationId,
      duration_ms:    Date.now() - ctx.startedAt,
    });

    return response;
  };
}

// ─── Middleware: RBAC Permission Check ───────────────────────────────────────

export function requirePermission(
  code: string,
  mode: 'all' | 'any' = 'all'
): Middleware {
  return (next) => async (req, ctx, params) => {
    if (!ctx.isPlatformAdmin) {
      const required = [code];
      const granted =
        mode === 'all'
          ? required.every(c => ctx.permissions.includes(c))
          : required.some(c => ctx.permissions.includes(c));

      if (!granted) {
        return new Response(
          JSON.stringify({
            code: 'FORBIDDEN',
            message: `Requires permission: ${code}`,
            trace_id: ctx.correlationId,
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }
    return next(req, ctx, params);
  };
}

// ─── Middleware: Zod Body Validation ────────────────────────────────────────

export function validateBody<T>(
  schema: z.ZodType<T>
): (next: (req: Request, ctx: EdgeRequestContext, dto: T, params?: Record<string, string>) => Promise<Response>) => EdgeHandler {
  return (next) => async (req, ctx, params) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON', trace_id: ctx.correlationId }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: result.error.issues,
          trace_id: ctx.correlationId,
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return next(req, ctx, result.data, params);
  };
}

// ─── Middleware: Zod Query Params Validation ─────────────────────────────────

export function validateQuery<T>(
  schema: z.ZodType<T>
): (next: (req: Request, ctx: EdgeRequestContext, dto: T, params?: Record<string, string>) => Promise<Response>) => EdgeHandler {
  return (next) => async (req, ctx, params) => {
    const url = new URL(req.url);
    const raw = Object.fromEntries(url.searchParams.entries());
    const result = schema.safeParse(raw);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: result.error.issues,
          trace_id: ctx.correlationId,
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return next(req, ctx, result.data, params);
  };
}

// ─── withMiddleware: Compose auth + context + optional permission ─────────────

export interface WithMiddlewareOptions {
  permission?: string;
  permissionMode?: 'all' | 'any';
}

/**
 * Core composition helper. Wraps any Edge Function handler with:
 *   auth verification → tenant context → optional RBAC check → correlation header → logging
 *
 * Usage:
 *   Deno.serve(async (req) => {
 *     return withMiddleware({ permission: 'students:student:read' })(
 *       async (req, ctx) => { ... }
 *     )(req);
 *   });
 */
export function withMiddleware(
  options: WithMiddlewareOptions = {}
): (handler: EdgeHandler) => (req: Request) => Promise<Response> {
  return (handler) => async (req: Request) => {
    // Build and verify context (auth + tenant)
    const result = await buildEdgeContext(req);
    if (!result.ok) return result.response;

    const { ctx } = result;

    // Apply middleware chain
    const middlewares: Middleware[] = [
      correlationMiddleware(),
      loggingMiddleware(),
    ];

    if (options.permission !== undefined) {
      middlewares.push(requirePermission(options.permission, options.permissionMode));
    }

    const composed = middlewares.reduceRight<EdgeHandler>(
      (next, mw) => mw(next),
      handler
    );

    try {
      return await composed(req, ctx);
    } catch (err) {
      logger.error('request.unhandled_error', {
        correlation_id: ctx.correlationId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return new Response(
        JSON.stringify({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          trace_id: ctx.correlationId,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}
