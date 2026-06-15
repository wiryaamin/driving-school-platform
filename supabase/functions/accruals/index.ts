/**
 * accruals — Accrual schedules, deferred revenue, and fiscal integrity.
 *
 * Routes:
 *   GET  /accruals                                  — list accrual schedules
 *   POST /accruals                                  — create accrual schedule
 *   GET  /accruals/:id                              — get accrual schedule + lines
 *   POST /accruals/:id/release                      — post next release period
 *   POST /accruals/:id/cancel                       — cancel remaining lines
 *
 *   GET  /accruals/deferred                         — list periodic deferred schedules
 *   POST /accruals/deferred                         — create periodic deferred schedule
 *   GET  /accruals/deferred/:id                     — get deferred schedule
 *   POST /accruals/deferred/:id/release             — post next deferred release
 *   GET  /accruals/deferred/integrity/:period_id    — validate deferred release integrity
 *
 *   POST /accruals/integrity/close-dependencies     — check chronological close deps
 *   POST /accruals/integrity/replay                 — run accounting replay validation
 *   POST /accruals/integrity/canonical-export       — generate canonical accounting export
 *   POST /accruals/integrity/multi-year             — run multi-year fiscal integrity check
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
function pathSegs(req: Request): string[] {
  return new URL(req.url).pathname.split('/').filter(Boolean);
}

// ── Accrual Schedule Handlers ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleListAccruals(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:accruals:read')) return err('Forbidden', 403, 'FORBIDDEN');
  const url      = new URL(req.url);
  const status   = url.searchParams.get('status');
  const type     = url.searchParams.get('accrual_type');
  const page     = Number(url.searchParams.get('page')     ?? '1');
  const perPage  = Number(url.searchParams.get('per_page') ?? '50');
  const from     = (page - 1) * perPage;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('accrual_schedules')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('start_date', { ascending: false })
    .range(from, from + perPage - 1);
  if (status) q = q.eq('status', status);
  if (type)   q = q.eq('accrual_type', type);

  const { data, error, count } = await q;
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0 } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateAccrual(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:accruals:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { accrual_type, description, total_amount, start_date, release_months, release_debit_account, release_credit_account } = body;
  if (!accrual_type || !description || !total_amount || !start_date || !release_months || !release_debit_account || !release_credit_account) {
    return err('accrual_type, description, total_amount, start_date, release_months, release_debit_account, release_credit_account are required', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await client.rpc('create_accrual_schedule', {
    p_org_id:                  orgId,
    p_period_id:               body['period_id'] ?? null,
    p_accrual_type:            accrual_type,
    p_description:             description,
    p_total_amount:            Number(total_amount),
    p_start_date:              start_date,
    p_release_months:          Number(release_months),
    p_release_debit_account:   release_debit_account,
    p_release_credit_account:  release_credit_account,
    p_initial_debit_account:   body['initial_debit_account'] ?? null,
    p_initial_credit_account:  body['initial_credit_account'] ?? null,
    p_notes:                   body['notes'] ?? null,
    p_actor_id:                user.id,
  });
  if (error) return err(error.message, 422, error.code ?? 'RPC_ERROR');

  const { data: schedule } = await client
    .from('accrual_schedules')
    .select('*')
    .eq('id', data)
    .eq('organization_id', orgId)
    .maybeSingle();
  return json({ data: schedule }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetAccrual(_req: Request, client: any, orgId: string, user: any, scheduleId: string): Promise<Response> {
  if (!hasPermission(user, 'finance:accruals:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const [{ data: schedule }, { data: lines }] = await Promise.all([
    client.from('accrual_schedules').select('*').eq('id', scheduleId).eq('organization_id', orgId).maybeSingle(),
    client.from('accrual_release_lines').select('*').eq('accrual_schedule_id', scheduleId).eq('organization_id', orgId).order('period_number'),
  ]);
  if (!schedule) return err('Accrual schedule not found', 404, 'NOT_FOUND');
  return json({ data: schedule, lines: lines ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReleaseAccrual(req: Request, client: any, orgId: string, user: any, scheduleId: string): Promise<Response> {
  if (!hasPermission(user, 'finance:accruals:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const periodId = body['period_id'] as string | undefined;
  if (!periodId) return err('period_id is required', 400, 'VALIDATION_ERROR');

  const { data, error } = await client.rpc('post_accrual_release', {
    p_schedule_id: scheduleId,
    p_period_id:   periodId,
    p_actor_id:    user.id,
  });
  if (error) return err(error.message, 422, error.code ?? 'RPC_ERROR');

  const { data: schedule } = await client
    .from('accrual_schedules')
    .select('*')
    .eq('id', scheduleId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return json({ journal_entry_id: data, schedule });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCancelAccrual(req: Request, client: any, orgId: string, user: any, scheduleId: string): Promise<Response> {
  if (!hasPermission(user, 'finance:accruals:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const reason = (body['reason'] as string | undefined) ?? 'Cancelled';

  const { error } = await client.rpc('cancel_accrual_schedule', {
    p_schedule_id: scheduleId,
    p_reason:      reason,
    p_actor_id:    user.id,
  });
  if (error) return err(error.message, 422, error.code ?? 'RPC_ERROR');

  const { data: schedule } = await client
    .from('accrual_schedules')
    .select('*')
    .eq('id', scheduleId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return json({ data: schedule });
}

// ── Deferred Revenue Handlers ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleListDeferred(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:accruals:read')) return err('Forbidden', 403, 'FORBIDDEN');
  const url        = new URL(req.url);
  const activeOnly = url.searchParams.get('active_only') === 'true';
  const page       = Number(url.searchParams.get('page')     ?? '1');
  const perPage    = Number(url.searchParams.get('per_page') ?? '50');
  const from       = (page - 1) * perPage;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('periodic_deferred_schedules')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('start_date', { ascending: false })
    .range(from, from + perPage - 1);
  if (activeOnly) q = q.eq('is_fully_released', false);

  const { data, error, count } = await q;
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0 } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateDeferred(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:accruals:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { source_type, source_id, description, total_amount, start_date, release_months } = body;
  if (!source_type || !source_id || !description || !total_amount || !start_date || !release_months) {
    return err('source_type, source_id, description, total_amount, start_date, release_months are required', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await client.rpc('create_periodic_deferred_schedule', {
    p_org_id:               orgId,
    p_period_id:            body['period_id'] ?? null,
    p_source_type:          source_type,
    p_source_id:            source_id,
    p_description:          description,
    p_total_amount:         Number(total_amount),
    p_start_date:           start_date,
    p_release_months:       Number(release_months),
    p_deferral_account:     body['deferral_account'] ?? '2970',
    p_recognition_account:  body['recognition_account'] ?? '3041',
    p_notes:                body['notes'] ?? null,
    p_actor_id:             user.id,
  });
  if (error) return err(error.message, 422, error.code ?? 'RPC_ERROR');

  const { data: schedule } = await client
    .from('periodic_deferred_schedules')
    .select('*')
    .eq('id', data)
    .eq('organization_id', orgId)
    .maybeSingle();
  return json({ data: schedule }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetDeferred(_req: Request, client: any, orgId: string, user: any, scheduleId: string): Promise<Response> {
  if (!hasPermission(user, 'finance:accruals:read')) return err('Forbidden', 403, 'FORBIDDEN');
  const { data } = await client
    .from('periodic_deferred_schedules')
    .select('*')
    .eq('id', scheduleId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!data) return err('Deferred schedule not found', 404, 'NOT_FOUND');
  return json({ data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReleaseDeferred(req: Request, client: any, orgId: string, user: any, scheduleId: string): Promise<Response> {
  if (!hasPermission(user, 'finance:accruals:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const periodId = body['period_id'] as string | undefined;
  if (!periodId) return err('period_id is required', 400, 'VALIDATION_ERROR');

  const { data, error } = await client.rpc('post_periodic_deferred_release', {
    p_schedule_id: scheduleId,
    p_period_id:   periodId,
    p_actor_id:    user.id,
  });
  if (error) return err(error.message, 422, error.code ?? 'RPC_ERROR');

  const { data: schedule } = await client
    .from('periodic_deferred_schedules')
    .select('*')
    .eq('id', scheduleId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return json({ journal_entry_id: data, schedule });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDeferredIntegrity(_req: Request, client: any, orgId: string, user: any, periodId: string): Promise<Response> {
  if (!hasPermission(user, 'finance:accruals:read')) return err('Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('validate_deferred_release_integrity', {
    p_org_id:    orgId,
    p_period_id: periodId,
  });
  if (error) return err(error.message, 422, error.code ?? 'RPC_ERROR');
  return json({ data });
}

// ── Fiscal Integrity Handlers ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCloseDeps(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:integrity:manage')) return err('Forbidden', 403, 'FORBIDDEN');
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }
  const { period_id } = body;
  if (!period_id) return err('period_id is required', 400, 'VALIDATION_ERROR');
  const { data, error } = await client.rpc('validate_chronological_close_dependencies', {
    p_org_id: orgId, p_period_id: period_id, p_actor_id: user.id,
  });
  if (error) return err(error.message, 422, error.code ?? 'RPC_ERROR');
  return json({ data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReplay(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:integrity:manage')) return err('Forbidden', 403, 'FORBIDDEN');
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }
  const { period_id } = body;
  if (!period_id) return err('period_id is required', 400, 'VALIDATION_ERROR');
  const { data, error } = await client.rpc('run_accounting_replay_validation', {
    p_org_id: orgId, p_period_id: period_id, p_actor_id: user.id,
  });
  if (error) return err(error.message, 422, error.code ?? 'RPC_ERROR');
  return json({ data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCanonicalExport(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:integrity:manage')) return err('Forbidden', 403, 'FORBIDDEN');
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }
  const { period_id } = body;
  if (!period_id) return err('period_id is required', 400, 'VALIDATION_ERROR');
  const { data, error } = await client.rpc('generate_canonical_accounting_export', {
    p_org_id: orgId, p_period_id: period_id, p_notes: body['notes'] ?? null, p_actor_id: user.id,
  });
  if (error) return err(error.message, 422, error.code ?? 'RPC_ERROR');
  const { data: exportRecord } = await client
    .from('canonical_accounting_exports')
    .select('*')
    .eq('id', data)
    .eq('organization_id', orgId)
    .maybeSingle();
  return json({ data: exportRecord }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMultiYear(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:integrity:manage')) return err('Forbidden', 403, 'FORBIDDEN');
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }
  const { fiscal_year_id } = body;
  if (!fiscal_year_id) return err('fiscal_year_id is required', 400, 'VALIDATION_ERROR');
  const { data, error } = await client.rpc('run_multi_year_fiscal_integrity_check', {
    p_org_id: orgId, p_fiscal_year_id: fiscal_year_id, p_actor_id: user.id,
  });
  if (error) return err(error.message, 422, error.code ?? 'RPC_ERROR');
  return json({ data });
}

// ── Main Router ───────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader  = req.headers.get('Authorization');

  if (!authHeader) return err('Missing Authorization header', 401, 'UNAUTHORIZED');

  const client = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user: rawUser }, error: authError } = await client.auth.getUser();
  if (authError || !rawUser) return err('Unauthorized', 401, 'UNAUTHORIZED');
  const user = enrichUserFromJwt(req, rawUser);

  const orgId = getOrgId(user) ?? getOrgIdFromBearer(req);
  if (!orgId) return err('No organization context', 403, 'NO_ORG_CONTEXT');

  const method = req.method;
  const segs   = pathSegs(req);
  const fnIdx  = segs.findLastIndex((s) => s === 'accruals');
  const seg1   = segs[fnIdx + 1] ?? '';  // 'deferred' | 'integrity' | UUID
  const seg2   = segs[fnIdx + 2] ?? '';  // UUID or sub-action
  const seg3   = segs[fnIdx + 3] ?? '';  // sub-action under seg2

  // ── Integrity routes: /accruals/integrity/...
  if (seg1 === 'integrity') {
    if (method === 'POST' && seg2 === 'close-dependencies') return handleCloseDeps(req, client, orgId, user);
    if (method === 'POST' && seg2 === 'replay')             return handleReplay(req, client, orgId, user);
    if (method === 'POST' && seg2 === 'canonical-export')   return handleCanonicalExport(req, client, orgId, user);
    if (method === 'POST' && seg2 === 'multi-year')         return handleMultiYear(req, client, orgId, user);
    return err('Not found', 404, 'NOT_FOUND');
  }

  // ── Deferred routes: /accruals/deferred/...
  if (seg1 === 'deferred') {
    // /accruals/deferred/integrity/:period_id
    if (seg2 === 'integrity' && UUID_RE.test(seg3) && method === 'GET') {
      return handleDeferredIntegrity(req, client, orgId, user, seg3);
    }
    // /accruals/deferred/:id/...
    if (UUID_RE.test(seg2)) {
      if (method === 'GET'  && !seg3)             return handleGetDeferred(req, client, orgId, user, seg2);
      if (method === 'POST' && seg3 === 'release') return handleReleaseDeferred(req, client, orgId, user, seg2);
      return err('Not found', 404, 'NOT_FOUND');
    }
    if (method === 'GET')  return handleListDeferred(req, client, orgId, user);
    if (method === 'POST') return handleCreateDeferred(req, client, orgId, user);
    return err('Not found', 404, 'NOT_FOUND');
  }

  // ── Accrual schedule routes: /accruals/:id/...
  if (UUID_RE.test(seg1)) {
    if (method === 'GET'  && !seg2)             return handleGetAccrual(req, client, orgId, user, seg1);
    if (method === 'POST' && seg2 === 'release') return handleReleaseAccrual(req, client, orgId, user, seg1);
    if (method === 'POST' && seg2 === 'cancel')  return handleCancelAccrual(req, client, orgId, user, seg1);
    return err('Not found', 404, 'NOT_FOUND');
  }

  // ── Collection routes: /accruals
  if (method === 'GET')  return handleListAccruals(req, client, orgId, user);
  if (method === 'POST') return handleCreateAccrual(req, client, orgId, user);

  return err('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
}));
