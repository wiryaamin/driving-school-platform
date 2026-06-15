/**
 * ledger-governance — Schedule lineage, fiscal dependency, subledger orchestration,
 *                     replay integrity, and canonical replay exports.
 *
 * Routes:
 *   POST /ledger-governance/supersede                    — supersede schedule generation
 *   GET  /ledger-governance/schedule/:type/:source_id   — generation history for a source
 *   GET  /ledger-governance/current/:type/:source_id    — current generation for a source
 *   POST /ledger-governance/close-deps/:period_id       — validate close dependencies
 *   POST /ledger-governance/reopen/:period_id           — reopen period safely
 *   GET  /ledger-governance/deps/:period_id             — dependencies for a period
 *   GET  /ledger-governance/dependents/:period_id       — downstream dependents of a period
 *   POST /ledger-governance/subledger/:period_id        — orchestrate subledger close
 *   GET  /ledger-governance/subledger/:period_id        — get subledger jobs for period
 *   POST /ledger-governance/integrity/:period_id        — validate replay integrity
 *   POST /ledger-governance/snapshot/:period_id         — generate replay snapshot (report)
 *   POST /ledger-governance/export/:period_id           — generate canonical replay export
 *   GET  /ledger-governance/export/:period_id           — latest canonical export for period
 *   GET  /ledger-governance/hashes/:period_id           — hash registry for period
 *   GET  /ledger-governance/divergences/:period_id      — divergences for period
 *   GET  /ledger-governance/divergences                 — unresolved divergences (org-wide)
 *   GET  /ledger-governance/reports/:period_id          — validation reports for period
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
async function handleSupersede(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { schedule_type, source_id, lines_count, total_amount, reason } = body;
  if (!schedule_type || !source_id || lines_count === undefined || total_amount === undefined) {
    return err('schedule_type, source_id, lines_count, total_amount are required', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await client.rpc('supersede_schedule_generation', {
    p_org_id:        orgId,
    p_schedule_type: schedule_type,
    p_source_id:     source_id,
    p_lines_count:   Number(lines_count),
    p_total_amount:  Number(total_amount),
    p_reason:        reason ?? null,
    p_actor_id:      user.id,
  });
  if (error) return err(error.message, 422, 'SUPERSEDE_FAILED');
  return json({ generation_id: data as string }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetScheduleHistory(scheduleType: string, sourceId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('schedule_generations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('schedule_type', scheduleType)
    .eq('source_id', sourceId)
    .order('generation_number', { ascending: true });
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetCurrentGeneration(scheduleType: string, sourceId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('schedule_generations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('schedule_type', scheduleType)
    .eq('source_id', sourceId)
    .eq('is_current', true)
    .maybeSingle();
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  if (data === null) return err('No current generation found', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateCloseDeps(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client.rpc('validate_close_dependencies', {
    p_org_id:    orgId,
    p_period_id: periodId,
    p_actor_id:  user.id,
  });
  if (error) return err(error.message, 422, 'VALIDATION_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReopenPeriod(req: Request, periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  if (!body['reason']) return err('reason is required', 400, 'VALIDATION_ERROR');

  const { data, error } = await client.rpc('reopen_period_safe', {
    p_org_id:    orgId,
    p_period_id: periodId,
    p_reason:    body['reason'] as string,
    p_actor_id:  user.id,
  });
  if (error) {
    const msg = error.message as string;
    if (msg.includes('PERIOD_LOCKED')) return err('Period is locked and cannot be reopened', 423, 'PERIOD_LOCKED');
    if (msg.includes('DOWNSTREAM_LOCKED')) return err('Downstream locked period prevents reopen', 423, 'DOWNSTREAM_LOCKED');
    return err(msg, 422, 'REOPEN_FAILED');
  }
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetDependencies(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('fiscal_dependency_graph')
    .select('*')
    .eq('organization_id', orgId)
    .eq('dependent_period_id', periodId)
    .eq('is_active', true);
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetDependents(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('fiscal_dependency_graph')
    .select('*')
    .eq('organization_id', orgId)
    .eq('required_period_id', periodId)
    .eq('is_active', true);
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleOrchestrateSubledger(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client.rpc('orchestrate_subledger_close', {
    p_org_id:    orgId,
    p_period_id: periodId,
    p_actor_id:  user.id,
  });
  if (error) return err(error.message, 422, 'ORCHESTRATION_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetSubledgerJobs(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('subledger_close_jobs')
    .select('*')
    .eq('organization_id', orgId)
    .eq('period_id', periodId)
    .order('subledger_type', { ascending: true });
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateIntegrity(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client.rpc('validate_replay_integrity', {
    p_org_id:    orgId,
    p_period_id: periodId,
    p_actor_id:  user.id,
  });
  if (error) return err(error.message, 422, 'INTEGRITY_CHECK_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateSnapshot(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client.rpc('generate_replay_snapshot', {
    p_org_id:    orgId,
    p_period_id: periodId,
    p_actor_id:  user.id,
  });
  if (error) return err(error.message, 422, 'SNAPSHOT_FAILED');
  return json({ report_id: data as string }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateExport(req: Request, periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:governance:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  let notes: string | null = null;
  try {
    const body = await req.json() as Record<string, unknown>;
    notes = (body['notes'] as string | undefined) ?? null;
  } catch { /* notes stays null */ }

  const { data, error } = await client.rpc('generate_canonical_replay_export', {
    p_org_id:    orgId,
    p_period_id: periodId,
    p_notes:     notes,
    p_actor_id:  user.id,
  });
  if (error) return err(error.message, 422, 'EXPORT_FAILED');
  return json({ export_id: data as string }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetLatestExport(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('canonical_replay_exports')
    .select('*')
    .eq('organization_id', orgId)
    .eq('period_id', periodId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  if (data === null) return err('No canonical export found for period', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetHashes(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('replay_hash_registry')
    .select('*')
    .eq('organization_id', orgId)
    .eq('period_id', periodId)
    .order('hash_type', { ascending: true });
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetDivergencesByPeriod(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('replay_divergence_events')
    .select('*')
    .eq('organization_id', orgId)
    .eq('period_id', periodId)
    .order('detected_at', { ascending: false });
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetUnresolvedDivergences(client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('replay_divergence_events')
    .select('*')
    .eq('organization_id', orgId)
    .is('resolved_at', null)
    .order('detected_at', { ascending: false });
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetReports(periodId: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:replay:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('replay_validation_reports')
    .select('*')
    .eq('organization_id', orgId)
    .eq('period_id', periodId)
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
  const fnIdx    = segments.findLastIndex((s) => s === 'ledger-governance');
  const seg1     = segments[fnIdx + 1] ?? '';
  const seg2     = segments[fnIdx + 2] ?? '';
  const seg3     = segments[fnIdx + 3] ?? '';
  const method   = req.method;

  const id2 = UUID_RE.test(seg2) ? seg2 : null;

  // POST /ledger-governance/supersede
  if (seg1 === 'supersede' && method === 'POST') {
    return handleSupersede(req, client, orgId, user);
  }
  // GET /ledger-governance/schedule/:type/:source_id
  if (seg1 === 'schedule' && seg2 !== '' && seg3 !== '' && method === 'GET') {
    return handleGetScheduleHistory(seg2, seg3, client, orgId, user);
  }
  // GET /ledger-governance/current/:type/:source_id
  if (seg1 === 'current' && seg2 !== '' && seg3 !== '' && method === 'GET') {
    return handleGetCurrentGeneration(seg2, seg3, client, orgId, user);
  }
  // POST /ledger-governance/close-deps/:period_id
  if (seg1 === 'close-deps' && id2 !== null && method === 'POST') {
    return handleValidateCloseDeps(id2, client, orgId, user);
  }
  // POST /ledger-governance/reopen/:period_id
  if (seg1 === 'reopen' && id2 !== null && method === 'POST') {
    return handleReopenPeriod(req, id2, client, orgId, user);
  }
  // GET /ledger-governance/deps/:period_id
  if (seg1 === 'deps' && id2 !== null && method === 'GET') {
    return handleGetDependencies(id2, client, orgId, user);
  }
  // GET /ledger-governance/dependents/:period_id
  if (seg1 === 'dependents' && id2 !== null && method === 'GET') {
    return handleGetDependents(id2, client, orgId, user);
  }
  // POST|GET /ledger-governance/subledger/:period_id
  if (seg1 === 'subledger' && id2 !== null) {
    if (method === 'POST') return handleOrchestrateSubledger(id2, client, orgId, user);
    if (method === 'GET')  return handleGetSubledgerJobs(id2, client, orgId, user);
  }
  // POST /ledger-governance/integrity/:period_id
  if (seg1 === 'integrity' && id2 !== null && method === 'POST') {
    return handleValidateIntegrity(id2, client, orgId, user);
  }
  // POST /ledger-governance/snapshot/:period_id
  if (seg1 === 'snapshot' && id2 !== null && method === 'POST') {
    return handleGenerateSnapshot(id2, client, orgId, user);
  }
  // POST|GET /ledger-governance/export/:period_id
  if (seg1 === 'export' && id2 !== null) {
    if (method === 'POST') return handleGenerateExport(req, id2, client, orgId, user);
    if (method === 'GET')  return handleGetLatestExport(id2, client, orgId, user);
  }
  // GET /ledger-governance/hashes/:period_id
  if (seg1 === 'hashes' && id2 !== null && method === 'GET') {
    return handleGetHashes(id2, client, orgId, user);
  }
  // GET /ledger-governance/divergences/:period_id  or  /divergences (no id)
  if (seg1 === 'divergences' && method === 'GET') {
    if (id2 !== null) return handleGetDivergencesByPeriod(id2, client, orgId, user);
    return handleGetUnresolvedDivergences(client, orgId, user);
  }
  // GET /ledger-governance/reports/:period_id
  if (seg1 === 'reports' && id2 !== null && method === 'GET') {
    return handleGetReports(id2, client, orgId, user);
  }

  return err('Not found', 404);
}));
