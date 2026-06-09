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

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(message: string, status: number, code?: string): Response {
  return json({ error: message, ...(code !== undefined && { code }) }, status);
}
function getOrgId(user: { app_metadata?: Record<string, unknown> }): string | null {
  return (user.app_metadata?.['organization_id'] as string | undefined) ?? null;
}
function hasPermission(user: { app_metadata?: Record<string, unknown> }, perm: string): boolean {
  const perms = (user.app_metadata?.['permissions'] as string[] | undefined) ?? [];
  return perms.includes(perm);
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

Deno.serve(async (req: Request) => {
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
  if (!authHeader) return err('Missing Authorization header', 401, 'UNAUTHORIZED');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return err('Unauthorized', 401, 'UNAUTHORIZED');

  const orgId = getOrgId(user);
  if (!orgId) return err('No organization context', 403, 'NO_ORG');

  const { sie4Id, sub, runId } = parsePath(req);

  try {
    // POST /sie4/generate
    if (req.method === 'POST' && sub === 'generate') {
      if (!hasPermission(user, 'finance:sie4:run')) return err('Forbidden', 403, 'FORBIDDEN');
      const body = await req.json();
      const { export_run_id } = body;
      if (!export_run_id || !UUID_RE.test(export_run_id)) return err('export_run_id is required', 400, 'VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('generate_sie4_export' as never, {
        p_export_run_id: export_run_id,
        p_actor_id:      user.id,
      });
      if (error) {
        if (error.message?.includes('EXPORT_RUN_NOT_FOUND'))    return err('Export run not found', 404, 'NOT_FOUND');
        if (error.message?.includes('EXPORT_RUN_NOT_COMPLETE')) return err('Export run must be completed before generating SIE4', 409, 'CONFLICT');
        if (error.message?.includes('SIE4_NO_ENTRIES'))         return err('Export run has no entries', 422, 'NO_ENTRIES');
        throw error;
      }
      return json({ sie4_export_id: data }, 201);
    }

    // GET /sie4/by-run/:runId
    if (req.method === 'GET' && sub === 'by-run' && runId) {
      if (!hasPermission(user, 'finance:sie4:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase
        .from('sie4_exports' as never)
        .select('*')
        .eq('export_run_id', runId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err('SIE4 export not found', 404, 'NOT_FOUND');
      return json(data);
    }

    // GET /sie4/:id
    if (req.method === 'GET' && sie4Id) {
      if (!hasPermission(user, 'finance:sie4:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error } = await supabase
        .from('sie4_exports' as never)
        .select('*')
        .eq('id', sie4Id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err('SIE4 export not found', 404, 'NOT_FOUND');
      return json(data);
    }

    // GET /sie4
    if (req.method === 'GET' && !sie4Id && !sub) {
      if (!hasPermission(user, 'finance:sie4:read')) return err('Forbidden', 403, 'FORBIDDEN');
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

    return err('Not Found', 404, 'NOT_FOUND');

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sie4]', msg);
    return err('Internal server error', 500, 'INTERNAL_ERROR');
  }
});
