/**
 * fixed-assets — Fixed asset subledger, depreciation, and disposal management.
 *
 * Routes:
 *   GET  /fixed-assets/classes              — list active asset classes
 *   GET  /fixed-assets                      — list fixed assets (?status=&asset_class_id=)
 *   POST /fixed-assets                      — register a new fixed asset
 *   GET  /fixed-assets/:id                  — get single asset
 *   POST /fixed-assets/:id/depreciate       — post next depreciation period
 *   POST /fixed-assets/:id/dispose          — post asset disposal
 *   POST /fixed-assets/:id/impair           — post impairment write-down
 *   GET  /fixed-assets/:id/schedule         — get depreciation schedule for asset
 *   POST /fixed-assets/:id/schedule/generate — generate/regenerate depreciation schedule
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { buildErrorResponse } from '../_shared/errors.ts';
import { requireFeature } from '../_shared/subscription.ts';

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(ctx: EdgeRequestContext, message: string, status: number, code: string): Response {
  return buildErrorResponse(ctx, status, code, message);
}
function preCtxUnauthorized(req: Request): Response {
  const correlationId = req.headers.get('X-Correlation-ID') ?? crypto.randomUUID();
  const requestId      = crypto.randomUUID();
  return new Response(
    JSON.stringify({
      code: 'UNAUTHORIZED', message: 'Missing Authorization header',
      trace_id: correlationId, request_id: requestId, version: 1,
    }),
    { status: 401, headers: { ...JSON_CT, 'X-Correlation-ID': correlationId, 'X-Request-ID': requestId } },
  );
}
function hasPermission(ctx: EdgeRequestContext, perm: string): boolean {
  return ctx.permissions.includes(perm);
}
function extractPathSegments(req: Request): string[] {
  return new URL(req.url).pathname.split('/').filter(Boolean);
}
function extractAssetId(req: Request): string | null {
  const segs = extractPathSegments(req);
  const fnIdx = segs.findLastIndex((s) => s === 'fixed-assets');
  const candidate = segs[fnIdx + 1] ?? '';
  return UUID_RE.test(candidate) ? candidate : null;
}
function extractSubPath(req: Request): string | null {
  const segs = extractPathSegments(req);
  const fnIdx = segs.findLastIndex((s) => s === 'fixed-assets');
  return segs[fnIdx + 2] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleClasses(_req: Request, client: any, _orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:assets:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client
    .from('fixed_asset_classes')
    .select('*')
    .eq('is_active', true)
    .order('class_code');
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:assets:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url    = new URL(req.url);
  const status = url.searchParams.get('status');
  const classId = url.searchParams.get('asset_class_id');
  const page    = Number(url.searchParams.get('page')     ?? '1');
  const perPage = Number(url.searchParams.get('per_page') ?? '50');
  const from    = (page - 1) * perPage;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('fixed_assets')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('asset_code')
    .range(from, from + perPage - 1);

  if (status)  q = q.eq('status', status);
  if (classId) q = q.eq('asset_class_id', classId);

  const { data, error, count } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0 } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRegister(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:assets:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(ctx, 'Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { period_id, asset_class_id, asset_code, asset_name, acquisition_date, acquisition_cost } = body;
  if (!period_id || !asset_class_id || !asset_code || !asset_name || !acquisition_date || !acquisition_cost) {
    return err(ctx, 'period_id, asset_class_id, asset_code, asset_name, acquisition_date, acquisition_cost are required', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await client.rpc('register_fixed_asset', {
    p_org_id:              orgId,
    p_period_id:           period_id,
    p_asset_class_id:      asset_class_id,
    p_asset_code:          asset_code,
    p_asset_name:          asset_name,
    p_acquisition_date:    acquisition_date,
    p_acquisition_cost:    Number(acquisition_cost),
    p_residual_value:      Number(body['residual_value'] ?? 0),
    p_useful_life_months:  Number(body['useful_life_months'] ?? 60),
    p_depreciation_method: body['depreciation_method'] ?? 'straight_line',
    p_credit_account:      body['credit_account'] ?? '2440',
    p_description:         body['description'] ?? null,
    p_notes:               body['notes'] ?? null,
    p_actor_id:            ctx.actorId,
  });
  if (error) return err(ctx, error.message, error.code === 'P0002' ? 404 : 422, error.code ?? 'RPC_ERROR');

  const { data: asset } = await client
    .from('fixed_assets')
    .select('*')
    .eq('id', data)
    .eq('organization_id', orgId)
    .maybeSingle();
  return json({ data: asset }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetAsset(req: Request, client: any, orgId: string, ctx: EdgeRequestContext, assetId: string): Promise<Response> {
  if (!hasPermission(ctx, 'finance:assets:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data } = await client
    .from('fixed_assets')
    .select('*')
    .eq('id', assetId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!data) return err(ctx, 'Asset not found', 404, 'NOT_FOUND');
  return json({ data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDepreciate(req: Request, client: any, orgId: string, ctx: EdgeRequestContext, assetId: string): Promise<Response> {
  if (!hasPermission(ctx, 'finance:assets:depreciate')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const periodId = body['period_id'] as string | undefined;
  if (!periodId) return err(ctx, 'period_id is required', 400, 'VALIDATION_ERROR');

  const { data, error } = await client.rpc('post_depreciation_period', {
    p_asset_id:  assetId,
    p_period_id: periodId,
    p_actor_id:  ctx.actorId,
  });
  if (error) return err(ctx, error.message, error.code === 'P0002' ? 404 : 422, error.code ?? 'RPC_ERROR');

  const { data: asset } = await client
    .from('fixed_assets')
    .select('*')
    .eq('id', assetId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return json({ journal_entry_id: data, asset });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDispose(req: Request, client: any, orgId: string, ctx: EdgeRequestContext, assetId: string): Promise<Response> {
  if (!hasPermission(ctx, 'finance:assets:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(ctx, 'Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { period_id, disposal_type, disposal_date } = body;
  if (!period_id || !disposal_type || !disposal_date) {
    return err(ctx, 'period_id, disposal_type, disposal_date are required', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await client.rpc('post_asset_disposal', {
    p_asset_id:      assetId,
    p_period_id:     period_id,
    p_disposal_type: disposal_type,
    p_disposal_date: disposal_date,
    p_proceeds:      Number(body['proceeds'] ?? 0),
    p_notes:         body['notes'] ?? null,
    p_actor_id:      ctx.actorId,
  });
  if (error) return err(ctx, error.message, error.code === 'P0002' ? 404 : 422, error.code ?? 'RPC_ERROR');

  const { data: disposal } = await client
    .from('asset_disposals')
    .select('*')
    .eq('id', data)
    .eq('organization_id', orgId)
    .maybeSingle();
  return json({ data: disposal }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleImpair(req: Request, client: any, _orgId: string, ctx: EdgeRequestContext, assetId: string): Promise<Response> {
  if (!hasPermission(ctx, 'finance:assets:depreciate')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(ctx, 'Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { period_id, impairment_date, impairment_amount } = body;
  if (!period_id || !impairment_date || !impairment_amount) {
    return err(ctx, 'period_id, impairment_date, impairment_amount are required', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await client.rpc('post_impairment_adjustment', {
    p_asset_id:          assetId,
    p_period_id:         period_id,
    p_impairment_date:   impairment_date,
    p_impairment_amount: Number(impairment_amount),
    p_reason:            body['reason'] ?? null,
    p_actor_id:          ctx.actorId,
  });
  if (error) return err(ctx, error.message, error.code === 'P0002' ? 404 : 422, error.code ?? 'RPC_ERROR');
  return json({ journal_entry_id: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetSchedule(_req: Request, client: any, orgId: string, ctx: EdgeRequestContext, assetId: string): Promise<Response> {
  if (!hasPermission(ctx, 'finance:assets:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data } = await client
    .from('depreciation_schedules')
    .select('*')
    .eq('organization_id', orgId)
    .eq('asset_id', assetId)
    .order('period_number');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateSchedule(_req: Request, client: any, _orgId: string, ctx: EdgeRequestContext, assetId: string): Promise<Response> {
  if (!hasPermission(ctx, 'finance:assets:depreciate')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('generate_depreciation_schedule', {
    p_asset_id: assetId,
    p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, error.code === 'P0002' ? 404 : 422, error.code ?? 'RPC_ERROR');
  return json({ lines_generated: data });
}

Deno.serve((req: Request) => serveCors(req, async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader  = req.headers.get('Authorization');

  if (!authHeader) return preCtxUnauthorized(req);

  const client = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  if (req.method !== 'GET') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
  }

  const subGuard = requireFeature(ctx, 'finance:fixed-assets:manage');
  if (subGuard) return subGuard;

  const orgId = ctx.organizationId;
  if (!orgId) return err(ctx, 'No organization context', 403, 'NO_ORG_CONTEXT');

  const method  = req.method;
  const segs    = extractPathSegments(req);
  const fnIdx   = segs.findLastIndex((s) => s === 'fixed-assets');
  const assetId = extractAssetId(req);
  const subPath = extractSubPath(req);

  // GET /fixed-assets/classes
  if (method === 'GET' && segs[fnIdx + 1] === 'classes' && !assetId) {
    return handleClasses(req, client, orgId, ctx);
  }

  // Routes on a specific asset: /fixed-assets/:id/...
  if (assetId) {
    if (method === 'GET'  && !subPath)                          return handleGetAsset(req, client, orgId, ctx, assetId);
    if (method === 'GET'  && subPath === 'schedule')            return handleGetSchedule(req, client, orgId, ctx, assetId);
    if (method === 'POST' && subPath === 'schedule' && segs[fnIdx + 3] === 'generate') return handleGenerateSchedule(req, client, orgId, ctx, assetId);
    if (method === 'POST' && subPath === 'depreciate')          return handleDepreciate(req, client, orgId, ctx, assetId);
    if (method === 'POST' && subPath === 'dispose')             return handleDispose(req, client, orgId, ctx, assetId);
    if (method === 'POST' && subPath === 'impair')              return handleImpair(req, client, orgId, ctx, assetId);
    return err(ctx, 'Not found', 404, 'NOT_FOUND');
  }

  // Collection routes
  if (method === 'GET')  return handleList(req, client, orgId, ctx);
  if (method === 'POST') return handleRegister(req, client, orgId, ctx);

  return err(ctx, 'Method not allowed', 405, 'METHOD_NOT_ALLOWED');
}));
