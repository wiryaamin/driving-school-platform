/**
 * health — Platform health check endpoint.
 *
 * Routes (all unauthenticated — intended for uptime monitors):
 *   GET /health/live     — Liveness: confirms the isolate is running (no DB call)
 *   GET /health/ready    — Readiness: confirms DB connectivity
 *   GET /health          — Full health report: liveness + readiness + runtime info
 *
 * Authentication: NONE — health endpoints must be reachable without a JWT.
 * These endpoints intentionally do not expose version secrets, connection strings,
 * or any internal infrastructure detail.
 *
 * Usage in monitoring:
 *   Uptime check: GET /functions/v1/health/live       (fast, ~5ms)
 *   Readiness:    GET /functions/v1/health/ready      (includes DB ping)
 *   Full health:  GET /functions/v1/health            (verbose, for dashboards)
 *
 * Expected responses:
 *   200 — healthy
 *   503 — degraded / DB unreachable (signals uptime monitor)
 */

import { serveCors }          from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { logger }             from '../_shared/logger.ts';

const APP_VERSION = Deno.env.get('APP_VERSION') ?? 'unknown';
const APP_ENV     = Deno.env.get('APP_ENV')     ?? 'unknown';

const JSON_CT = { 'Content-Type': 'application/json' } as const;

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: JSON_CT });
}

function degraded(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 503, headers: JSON_CT });
}

// ─── Liveness (no I/O) ───────────────────────────────────────────────────────

function handleLive(): Response {
  return ok({ status: 'ok', timestamp: new Date().toISOString() });
}

// ─── Readiness (DB connectivity) ─────────────────────────────────────────────

async function handleReady(): Promise<Response> {
  const db = createServiceClient();

  try {
    // Lightweight connectivity check — no table scan, just a DB round-trip.
    const { error } = await db
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .limit(0);

    if (error) {
      logger.warn('health.ready.db_error', { error: error.message });
      return degraded({
        status:    'degraded',
        timestamp: new Date().toISOString(),
        checks:    { database: 'failed' },
        error:     'Database connectivity check failed',
      });
    }
  } catch (err) {
    logger.error('health.ready.exception', {
      error: err instanceof Error ? err.message : String(err),
    });
    return degraded({
      status:    'degraded',
      timestamp: new Date().toISOString(),
      checks:    { database: 'error' },
      error:     'Unexpected error during readiness check',
    });
  }

  return ok({
    status:    'ok',
    timestamp: new Date().toISOString(),
    checks:    { database: 'ok' },
  });
}

// ─── Full health report ───────────────────────────────────────────────────────

async function handleFullHealth(): Promise<Response> {
  const startedAt = Date.now();
  const db = createServiceClient();

  let dbStatus: 'ok' | 'failed' | 'error' = 'ok';
  let dbLatencyMs: number | null = null;

  try {
    const dbStart = Date.now();
    const { error } = await db
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .limit(0);
    dbLatencyMs = Date.now() - dbStart;

    if (error) {
      dbStatus = 'failed';
      logger.warn('health.full.db_error', { error: error.message, db_latency_ms: dbLatencyMs });
    }
  } catch (err) {
    dbStatus = 'error';
    logger.error('health.full.exception', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const overallStatus = dbStatus === 'ok' ? 'ok' : 'degraded';
  const totalMs = Date.now() - startedAt;

  const body = {
    status:    overallStatus,
    timestamp: new Date().toISOString(),
    version:   APP_VERSION,
    env:       APP_ENV,
    checks: {
      database: {
        status:     dbStatus,
        latency_ms: dbLatencyMs,
      },
    },
    response_ms: totalMs,
  };

  return overallStatus === 'ok' ? ok(body) : degraded(body);
}

// ─── Router ───────────────────────────────────────────────────────────────────

Deno.serve((req: Request) =>
  serveCors(req, async () => {
    if (req.method !== 'GET') {
      return new Response(
        JSON.stringify({ code: 'METHOD_NOT_ALLOWED', message: 'Only GET is supported' }),
        { status: 405, headers: JSON_CT }
      );
    }

    // Sprint 2A fix: the hosted gateway delivers req.url already stripped
    // down to this function's own path (/health, /health/live,
    // /health/ready) rather than the full /functions/v1/health/* form this
    // regex previously assumed — confirmed live via curl against all three
    // routes, each returning 404 "Unknown health route: /health[...]"
    // because the old prefix never matched. Stripping /health (this
    // function's own name) instead of /functions/v1/health fixes all three
    // routes with no change to routing behavior otherwise.
    const path = new URL(req.url).pathname
      .replace(/^\/health/, '')
      .replace(/\/$/, '') || '/';

    if (path === '/live')  return handleLive();
    if (path === '/ready') return handleReady();
    if (path === '/')      return handleFullHealth();

    return new Response(
      JSON.stringify({ code: 'NOT_FOUND', message: `Unknown health route: ${path}` }),
      { status: 404, headers: JSON_CT }
    );
  })
);
