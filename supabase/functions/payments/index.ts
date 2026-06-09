/**
 * payments — Payment recording, history, and reconciliation.
 *
 * Routes:
 *   GET  /payments                        — list payments
 *   POST /payments                        — record a payment (atomic RPC)
 *   GET  /payments/:id                    — get single payment
 *   GET  /payments/:id/allocations        — get allocations for a payment
 *   POST /payments/:id/allocate           — manually allocate payment to invoice
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
function extractId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'payments');
  const candidate = segments[fnIdx + 1] ?? '';
  return UUID_RE.test(candidate) ? candidate : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:payment:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const url      = new URL(req.url);
  const page     = Number(url.searchParams.get('page')     ?? '1');
  const perPage  = Number(url.searchParams.get('per_page') ?? '25');
  const from     = (page - 1) * perPage;
  const to       = from + perPage - 1;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('payments')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const invoiceId = url.searchParams.get('invoice_id');
  const studentId = url.searchParams.get('student_id');
  const status    = url.searchParams.get('status');
  const method    = url.searchParams.get('method');

  if (invoiceId !== null) q = q.eq('invoice_id',     invoiceId);
  if (studentId !== null) q = q.eq('student_id',     studentId);
  if (status    !== null && status !== 'all') q = q.eq('status', status);
  if (method    !== null) q = q.eq('payment_method', method);

  const { data, error, count } = await q;
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0 } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRecord(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:payment:create')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { invoice_id, amount, payment_method } = body;
  if (!invoice_id || !amount || !payment_method) {
    return err('invoice_id, amount, payment_method are required', 400, 'VALIDATION_ERROR');
  }

  // Verify invoice belongs to this org before calling RPC
  const { data: invoice } = await client
    .from('invoices')
    .select('id')
    .eq('id', invoice_id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (invoice === null) return err('Invoice not found', 404, 'NOT_FOUND');

  const args: Record<string, unknown> = {
    p_invoice_id: invoice_id,
    p_amount:     Number(amount),
    p_method:     payment_method,
    p_actor_id:   user.id,
  };
  if (body['provider_reference'] !== undefined) args['p_reference'] = body['provider_reference'];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: paymentId, error } = await (client as any).rpc('record_payment', args);

  if (error) {
    const msg = error.message as string;
    if (msg.includes('INVOICE_NOT_FOUND'))    return err('Invoice not found', 404, 'NOT_FOUND');
    if (msg.includes('INVOICE_NOT_PAYABLE'))  return err('Invoice is not in a payable status', 409, 'CONFLICT');
    if (msg.includes('INVALID_AMOUNT'))       return err('Payment amount must be positive', 400, 'VALIDATION_ERROR');
    return err(msg, 422, 'PAYMENT_FAILED');
  }

  // Fetch the created payment record
  const { data: payment, error: fetchErr } = await client
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (fetchErr !== null || payment === null) return json({ id: paymentId as string }, 201);
  return json(payment, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetOne(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:payment:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('payments')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) return err(error.message, 500, 'QUERY_FAILED');
  if (data === null) return err('Payment not found', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetAllocations(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:payment:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('payment_allocations')
    .select('*')
    .eq('payment_id', id)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });

  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAllocate(req: Request, id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:reconciliation:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { invoice_id, amount } = body;
  if (!invoice_id || !amount) return err('invoice_id and amount are required', 400, 'VALIDATION_ERROR');
  if (Number(amount) <= 0)     return err('amount must be positive', 400, 'VALIDATION_ERROR');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allocationId, error: rpcErr } = await (client as any).rpc('allocate_payment', {
    p_org_id:     orgId,
    p_payment_id: id,
    p_invoice_id: invoice_id,
    p_amount:     Number(amount),
    p_notes:      body['notes'] ?? null,
    p_actor_id:   user.id,
  });

  if (rpcErr) {
    const msg = rpcErr.message as string;
    if (msg.includes('PAYMENT_NOT_FOUND'))        return err('Payment not found', 404, 'NOT_FOUND');
    if (msg.includes('INVOICE_NOT_FOUND'))         return err('Invoice not found', 404, 'NOT_FOUND');
    if (msg.includes('PAYMENT_NOT_ALLOCATABLE'))   return err('Payment is not in an allocatable state', 409, 'CONFLICT');
    if (msg.includes('INVOICE_NOT_PAYABLE'))       return err('Invoice is not in a payable status', 409, 'CONFLICT');
    if (msg.includes('ALLOCATION_EXCEEDS_PAYMENT')) return err('Allocation exceeds payment headroom', 422, 'OVER_ALLOCATION');
    if (msg.includes('PERIOD_LOCKED'))             return err('Financial period is locked', 423, 'PERIOD_LOCKED');
    return err(msg, 422, 'ALLOCATION_FAILED');
  }

  return json({ allocation_id: allocationId as string }, 201);
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader  = req.headers.get('Authorization') ?? '';

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authErr } = await client.auth.getUser();
  if (authErr !== null || user === null) return err('Unauthorized', 401, 'UNAUTHORIZED');

  const orgId = getOrgId(user);
  if (orgId === null) return err('No organization context', 400, 'NO_ORG_CONTEXT');

  // Parse sub-resource: /payments/:id/allocations or /payments/:id/allocate
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'payments');
  const candidate = segments[fnIdx + 1] ?? '';
  const sub       = segments[fnIdx + 2] ?? '';
  const id        = UUID_RE.test(candidate) ? candidate : null;
  const method    = req.method;

  if (id !== null && sub === 'allocations' && method === 'GET') {
    return handleGetAllocations(id, client, orgId, user);
  }
  if (id !== null && sub === 'allocate' && method === 'POST') {
    return handleAllocate(req, id, client, orgId, user);
  }

  const singleId = extractId(req);

  if (singleId !== null) {
    if (method === 'GET') return handleGetOne(singleId, client, orgId, user);
    return err('Method not allowed', 405);
  }

  if (method === 'GET')  return handleList(req, client, orgId, user);
  if (method === 'POST') return handleRecord(req, client, orgId, user);
  return err('Method not allowed', 405);
});
