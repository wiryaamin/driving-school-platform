/**
 * ledger-replay — Authoritative ledger replay and balance reconstruction.
 *
 * Routes:
 *   POST /ledger-replay/period/:id          — run deterministic replay for a period
 *   POST /ledger-replay/period/:id/validate — validate balance reconstruction
 *   POST /ledger-replay/fiscal-year/:id     — replay all periods in a fiscal year
 *   GET  /ledger-replay/period/:id/runs     — list replay runs for a period
 *   GET  /ledger-replay/period/:id/latest   — latest replay run for a period
 *   GET  /ledger-replay/runs/:id            — get single replay run
 *   GET  /ledger-replay/runs/:id/snapshots  — snapshots for a run
 *   GET  /ledger-replay/runs/:id/divergent  — divergent snapshots for a run
 *   GET  /ledger-replay/divergent           — all divergent runs for the org
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { enrichUserFromJwt, getOrgIdFromBearer } from '../_shared/jwt.ts';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReplayPeriod(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client.rpc('replay_period_state', {
    p_org_id:    orgId,
    p_period_id: periodId,
    p_actor_id:  user.id,
  });
  if (error) return err(error.message, 422, 'REPLAY_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidatePeriod(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client.rpc('validate_balance_reconstruction', {
    p_org_id:    orgId,
    p_period_id: periodId,
    p_actor_id:  user.id,
  });
  if (error) return err(error.message, 422, 'VALIDATION_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReplayFiscalYear(fiscalYearId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client.rpc('replay_fiscal_year', {
    p_org_id:         orgId,
    p_fiscal_year_id: fiscalYearId,
    p_actor_id:       user.id,
  });
  if (error) return err(error.message, 422, 'REPLAY_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleListRunsByPeriod(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('ledger_replay_runs')
    .select('*')
    .eq('organization_id', orgId)
    .eq('period_id', periodId)
    .order('created_at', { ascending: false });
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLatestRunByPeriod(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('ledger_replay_runs')
    .select('*')
    .eq('organization_id', orgId)
    .eq('period_id', periodId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  if (data === null) return err('No replay runs found for period', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetRun(runId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('ledger_replay_runs')
    .select('*')
    .eq('id', runId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  if (data === null) return err('Replay run not found', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetSnapshots(runId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('replay_snapshots')
    .select('*')
    .eq('organization_id', orgId)
    .eq('replay_run_id', runId)
    .order('account_code', { ascending: true });
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetDivergentSnapshots(runId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('replay_snapshots')
    .select('*')
    .eq('organization_id', orgId)
    .eq('replay_run_id', runId)
    .eq('has_divergence', true)
    .order('divergence_amount', { ascending: false });
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleListDivergentRuns(client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('ledger_replay_runs')
    .select('*')
    .eq('organization_id', orgId)
    .eq('status', 'divergent')
    .order('created_at', { ascending: false });
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

Deno.serve((req: Request) => serveCors(req, async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader  = req.headers.get('Authorization') ?? '';

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user: rawUser }, error: authErr } = await client.auth.getUser();
  if (authErr !== null || rawUser === null) return err('Unauthorized', 401, 'UNAUTHORIZED');
  const user = enrichUserFromJwt(req, rawUser);

  const orgId = getOrgId(user) ?? getOrgIdFromBearer(req);
  if (orgId === null) return err('No organization context', 400, 'NO_ORG_CONTEXT');

  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'ledger-replay');
  const seg1     = segments[fnIdx + 1] ?? '';   // 'period' | 'fiscal-year' | 'runs' | 'divergent'
  const seg2     = segments[fnIdx + 2] ?? '';   // :id
  const seg3     = segments[fnIdx + 3] ?? '';   // 'runs' | 'latest' | 'validate' | 'snapshots' | 'divergent'
  const method   = req.method;

  const id = UUID_RE.test(seg2) ? seg2 : null;

  // POST /ledger-replay/period/:id
  if (seg1 === 'period' && id !== null && seg3 === '' && method === 'POST') {
    return handleReplayPeriod(id, client, orgId, user);
  }
  // POST /ledger-replay/period/:id/validate
  if (seg1 === 'period' && id !== null && seg3 === 'validate' && method === 'POST') {
    return handleValidatePeriod(id, client, orgId, user);
  }
  // GET /ledger-replay/period/:id/runs
  if (seg1 === 'period' && id !== null && seg3 === 'runs' && method === 'GET') {
    return handleListRunsByPeriod(id, client, orgId, user);
  }
  // GET /ledger-replay/period/:id/latest
  if (seg1 === 'period' && id !== null && seg3 === 'latest' && method === 'GET') {
    return handleLatestRunByPeriod(id, client, orgId, user);
  }
  // POST /ledger-replay/fiscal-year/:id
  if (seg1 === 'fiscal-year' && id !== null && seg3 === '' && method === 'POST') {
    return handleReplayFiscalYear(id, client, orgId, user);
  }
  // GET /ledger-replay/runs/:id
  if (seg1 === 'runs' && id !== null && seg3 === '' && method === 'GET') {
    return handleGetRun(id, client, orgId, user);
  }
  // GET /ledger-replay/runs/:id/snapshots
  if (seg1 === 'runs' && id !== null && seg3 === 'snapshots' && method === 'GET') {
    return handleGetSnapshots(id, client, orgId, user);
  }
  // GET /ledger-replay/runs/:id/divergent
  if (seg1 === 'runs' && id !== null && seg3 === 'divergent' && method === 'GET') {
    return handleGetDivergentSnapshots(id, client, orgId, user);
  }
  // GET /ledger-replay/divergent
  if (seg1 === 'divergent' && method === 'GET') {
    return handleListDivergentRuns(client, orgId, user);
  }

  return err('Not found', 404);
}));
