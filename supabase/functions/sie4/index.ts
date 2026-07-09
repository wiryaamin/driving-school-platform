/**
 * sie4 — SIE4 bookkeeping file generation and retrieval.
 *
 * Routes:
 *   POST /sie4/generate                — generate SIE4 from a completed export run
 *   GET  /sie4                         — list recent SIE4 exports (no content_text)
 *   GET  /sie4/:id                     — get SIE4 export (with content_text)
 *   GET  /sie4/by-run/:exportRunId     — get SIE4 by export run ID
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { buildErrorResponse } from '../_shared/errors.ts';

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(ctx: EdgeRequestContext, message: string, status: number, code: string): Response {
  return buildErrorResponse(ctx, status, code, message);
}
function hasPermission(ctx: EdgeRequestContext, perm: string): boolean {
  return ctx.permissions.includes(perm);
}

function parsePath(req: Request): { sie4Id: string | null; sub: string | null; runId: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'sie4');
  const seg1     = segments[fnIdx + 1] ?? null;
  const seg2     = segments[fnIdx + 2] ?? null;
  return {
    sie4Id: seg1 && UUID_RE.test(seg1) ? seg1 : null,
    sub:    seg1 && !UUID_RE.test(seg1) ? seg1 : null,
    runId:  seg1 === 'by-run' && seg2 && UUID_RE.test(seg2) ? seg2 : null,
  };
}

Deno.serve((req: Request) => serveCors(req, async () => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    // No EdgeRequestContext exists yet at this point (buildEdgeContext runs below) —
    // generate correlation/request IDs locally to keep the canonical shape without
    // altering the pre-existing early-exit condition or status code.
    const preCorrelationId = req.headers.get('X-Correlation-ID') ?? crypto.randomUUID();
    const preRequestId     = crypto.randomUUID();
    return new Response(
      JSON.stringify({
        code: 'UNAUTHORIZED', message: 'Missing Authorization header',
        trace_id: preCorrelationId, request_id: preRequestId, version: 1,
      }),
      { status: 401, headers: { ...JSON_CT, 'X-Correlation-ID': preCorrelationId, 'X-Request-ID': preRequestId } },
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  if (req.method !== 'GET') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
  }

  const orgId = ctx.organizationId;
  if (!orgId) return err(ctx, 'No organization context', 403, 'NO_ORG');

  const { sie4Id, sub, runId } = parsePath(req);

  try {
    // POST /sie4/generate
    if (req.method === 'POST' && sub === 'generate') {
      if (!hasPermission(ctx, 'finance:sie4:run')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
      const body = await req.json();
      const { export_run_id } = body;
      if (!export_run_id || !UUID_RE.test(export_run_id)) return err(ctx, 'export_run_id is required', 400, 'VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('generate_sie4_export' as never, {
        p_export_run_id: export_run_id,
        p_actor_id:      ctx.actorId,
      });
      if (error) {
        if (error.message?.includes('EXPORT_RUN_NOT_FOUND'))    return err(ctx, 'Export run not found', 404, 'NOT_FOUND');
        if (error.message?.includes('EXPORT_RUN_NOT_COMPLETE')) return err(ctx, 'Export run must be completed before generating SIE4', 409, 'CONFLICT');
        if (error.message?.includes('SIE4_NO_ENTRIES'))         return err(ctx, 'Export run has no entries', 422, 'NO_ENTRIES');
        throw error;
      }
      return json({ sie4_export_id: data }, 201);
    }

    // GET /sie4/by-run/:runId
    if (req.method === 'GET' && sub === 'by-run' && runId) {
      if (!hasPermission(ctx, 'finance:sie4:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase
        .from('sie4_exports' as never)
        .select('*')
        .eq('export_run_id', runId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err(ctx, 'SIE4 export not found', 404, 'NOT_FOUND');
      return json(data);
    }

    // GET /sie4/:id
    if (req.method === 'GET' && sie4Id) {
      if (!hasPermission(ctx, 'finance:sie4:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase
        .from('sie4_exports' as never)
        .select('*')
        .eq('id', sie4Id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err(ctx, 'SIE4 export not found', 404, 'NOT_FOUND');
      return json(data);
    }

    // GET /sie4
    if (req.method === 'GET' && !sie4Id && !sub) {
      if (!hasPermission(ctx, 'finance:sie4:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
      const url   = new URL(req.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '10', 10), 50);
      const { data, error } = await supabase
        .from('sie4_exports' as never)
        .select('id, organization_id, export_run_id, content_hash, voucher_count, transaction_count, from_date, to_date, fiscal_year_start, generated_at, generated_by')
        .eq('organization_id', orgId)
        .order('generated_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    return err(ctx, 'Not Found', 404, 'NOT_FOUND');

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sie4]', msg);
    return err(ctx, 'Internal server error', 500, 'INTERNAL_ERROR');
  }
}));
