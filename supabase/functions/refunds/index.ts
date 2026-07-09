/**
 * refunds — Refund processing and history.
 *
 * Routes:
 *   GET  /refunds            — list refunds (finance:refund:read)
 *   POST /refunds            — process a refund (finance:refund:create)
 *   GET  /refunds/:id        — get single refund (finance:refund:read)
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
  const fnIdx    = segments.findLastIndex((s) => s === 'refunds');
  const candidate = segments[fnIdx + 1] ?? '';
  return UUID_RE.test(candidate) ? candidate : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:refund:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const url     = new URL(req.url);
  const page    = Number(url.searchParams.get('page')     ?? '1');
  const perPage = Number(url.searchParams.get('per_page') ?? '25');
  const from    = (page - 1) * perPage;
  const to      = from + perPage - 1;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('refunds')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const invoiceId = url.searchParams.get('invoice_id');
  const studentId = url.searchParams.get('student_id');
  const status    = url.searchParams.get('status');

  if (invoiceId !== null) q = q.eq('invoice_id',    invoiceId);
  if (studentId !== null) q = q.eq('student_id',    studentId);
  if (status    !== null && status !== 'all') q = q.eq('refund_status', status);

  const { data, error, count } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0 } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleProcess(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:refund:create')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(ctx, 'Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { invoice_id, refund_type, reason_code } = body;
  if (!invoice_id || !refund_type || !reason_code) {
    return err(ctx, 'invoice_id, refund_type, reason_code are required', 400, 'VALIDATION_ERROR');
  }

  const refundAmount = Number(body['refund_amount'] ?? 0);
  const creditQty    = Number(body['credit_qty']    ?? 0);
  if (refundAmount === 0 && creditQty === 0) {
    return err(ctx, 'At least one of refund_amount or credit_qty must be > 0', 400, 'VALIDATION_ERROR');
  }

  const args: Record<string, unknown> = {
    p_org_id:        orgId,
    p_invoice_id:    invoice_id,
    p_refund_type:   refund_type,
    p_reason_code:   reason_code,
    p_refund_amount: refundAmount,
    p_credit_qty:    creditQty,
    p_actor_id:      ctx.actorId,
  };
  if (body['credit_category'] !== undefined) args['p_credit_category'] = body['credit_category'];
  if (body['grant_entry_id']  !== undefined) args['p_grant_entry_id']  = body['grant_entry_id'];
  if (body['payment_id']      !== undefined) args['p_payment_id']       = body['payment_id'];
  if (body['notes']           !== undefined) args['p_notes']            = body['notes'];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: refundId, error } = await (client as any).rpc('process_refund', args);

  if (error) {
    const msg = error.message as string;
    if (msg.includes('INVOICE_NOT_FOUND'))      return err(ctx, 'Invoice not found', 404, 'NOT_FOUND');
    if (msg.includes('INVOICE_NOT_REFUNDABLE')) return err(ctx, 'Invoice must be paid or partially_paid', 409, 'CONFLICT');
    if (msg.includes('OVER_REFUND'))            return err(ctx, 'Refund amount exceeds net paid amount', 422, 'OVER_REFUND');
    if (msg.includes('PERIOD_LOCKED'))          return err(ctx, 'Financial period is locked', 423, 'PERIOD_LOCKED');
    if (msg.includes('NO_PAYMENT_FOUND'))       return err(ctx, 'No confirmed payment found on invoice', 422, 'NO_PAYMENT');
    return err(ctx, msg, 422, 'REFUND_FAILED');
  }

  const { data: refund, error: fetchErr } = await client
    .from('refunds')
    .select('*')
    .eq('id', refundId)
    .single();

  if (fetchErr !== null || refund === null) return json({ id: refundId as string }, 201);
  return json(refund, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetOne(id: string, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:refund:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client
    .from('refunds')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  if (data === null) return err(ctx, 'Refund not found', 404, 'NOT_FOUND');
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
  if (method === 'POST') return handleProcess(req, client, orgId, ctx);
  return err(ctx, 'Method not allowed', 405, 'METHOD_NOT_ALLOWED');
}));
