/**
 * student-packages — Student package purchase and listing.
 *
 * Routes:
 *   GET  /student-packages?student_id=  — list student's purchased packages
 *   POST /student-packages              — purchase a package (atomic RPC)
 *   GET  /student-packages/:id          — get single student package
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
function extractId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'student-packages');
  const candidate = segments[fnIdx + 1] ?? '';
  return UUID_RE.test(candidate) ? candidate : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:wallet:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const url      = new URL(req.url);
  const studentId = url.searchParams.get('student_id');
  const status    = url.searchParams.get('status') ?? 'active';
  const page      = Number(url.searchParams.get('page')     ?? '1');
  const perPage   = Number(url.searchParams.get('per_page') ?? '25');
  const from      = (page - 1) * perPage;
  const to        = from + perPage - 1;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('student_packages')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('purchased_at', { ascending: false })
    .range(from, to);

  if (studentId !== null) q = q.eq('student_id', studentId);
  if (status    !== 'all') q = q.eq('status', status);

  const { data, error, count } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0 } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePurchase(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:package:create')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(ctx, 'Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { student_id, offering_id } = body;
  if (!student_id || !offering_id) {
    return err(ctx, 'student_id and offering_id are required', 400, 'VALIDATION_ERROR');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: packageId, error } = await (client as any).rpc('purchase_package', {
    p_org_id:      orgId,
    p_student_id:  student_id,
    p_offering_id: offering_id,
    p_actor_id:    ctx.actorId,
  });

  if (error) {
    const msg = error.message as string;
    if (msg.includes('OFFERING_NOT_FOUND')) return err(ctx, 'Package offering not found or not active', 404, 'NOT_FOUND');
    return err(ctx, msg, 422, 'PURCHASE_FAILED');
  }

  // Fetch the created student_package to return it
  const { data, error: fetchErr } = await client
    .from('student_packages')
    .select('*')
    .eq('id', packageId)
    .single();

  if (fetchErr !== null || data === null) return json({ id: packageId as string }, 201);
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetOne(id: string, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:wallet:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('student_packages')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  if (data === null) return err(ctx, 'Student package not found', 404, 'NOT_FOUND');
  return json(data);
}

Deno.serve((req: Request) => serveCors(req, async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader  = req.headers.get('Authorization') ?? '';

  const client = createClient(supabaseUrl, anonKey, {
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

  const orgId = ctx.organizationId;
  if (orgId === null) return err(ctx, 'No organization context', 400, 'NO_ORG_CONTEXT');

  const id     = extractId(req);
  const method = req.method;

  if (id !== null) {
    if (method === 'GET') return handleGetOne(id, client, orgId, ctx);
    return err(ctx, 'Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  if (method === 'GET')  return handleList(req, client, orgId, ctx);
  if (method === 'POST') return handlePurchase(req, client, orgId, ctx);
  return err(ctx, 'Method not allowed', 405, 'METHOD_NOT_ALLOWED');
}));
