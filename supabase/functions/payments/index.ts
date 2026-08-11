/**
 * payments — Payment recording, history, and reconciliation.
 *
 * Routes:
 *   GET  /payments                        — list payments
 *   POST /payments                        — record a payment (atomic RPC)
 *   GET  /payments/:id                    — get single payment
 *   GET  /payments/:id/allocations        — get allocations for a payment
 *   POST /payments/:id/allocate           — manually allocate payment to invoice
 *   POST /payments/request                — staff-initiated Stripe payment link for an invoice
 */

import { serveCors }            from '../_shared/cors.ts';
import { buildEdgeContext }     from '../_shared/context.ts';
import { createSupabaseClient }  from '../_shared/supabase.ts';
import { createFunctionLogger }  from '../_shared/logger.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { decryptCredential }     from '../_shared/credential-crypto.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

const log     = createFunctionLogger('payments');
const JSON_CT = { 'Content-Type': 'application/json' } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(ctx: EdgeRequestContext, body: T, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

function fail(ctx: EdgeRequestContext, status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message, trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

function requirePerm(ctx: EdgeRequestContext, code: string): Response | null {
  if (ctx.organizationId === null) return fail(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  if (ctx.isPlatformAdmin) return null;
  if (!ctx.permissions.includes(code)) return fail(ctx, 403, 'FORBIDDEN', `Requires permission: ${code}`);
  return null;
}

function extractPathParts(req: Request): { id: string | null; sub: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'payments');
  const candidate = segments[fnIdx + 1] ?? '';
  const sub       = segments[fnIdx + 2] ?? null;
  const id        = UUID_RE.test(candidate) ? candidate : null;
  return { id, sub };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:payment:read');
  if (guard) return guard;

  const url     = new URL(req.url);
  const page    = Math.max(1, Number(url.searchParams.get('page')     ?? '1'));
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page') ?? '25')));
  const from    = (page - 1) * perPage;
  const to      = from + perPage - 1;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('payments')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const invoiceId    = url.searchParams.get('invoice_id');
  const studentId    = url.searchParams.get('student_id');
  const status       = url.searchParams.get('status');
  const methodFilter = url.searchParams.get('method');

  if (invoiceId    !== null)              q = q.eq('invoice_id',     invoiceId);
  if (studentId    !== null)              q = q.eq('student_id',     studentId);
  if (status       !== null && status !== 'all') q = q.eq('status', status);
  if (methodFilter !== null)              q = q.eq('payment_method', methodFilter);

  const { data, error, count } = await q;
  if (error) {
    log.error('payments.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to list payments');
  }

  return new Response(
    JSON.stringify({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0, has_more: page * perPage < (count ?? 0) } }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRecord(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:payment:create');
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const { invoice_id, amount, payment_method } = body;
  if (!invoice_id || !amount || !payment_method) {
    return fail(ctx, 422, 'VALIDATION_ERROR', 'invoice_id, amount, payment_method are required');
  }

  const { data: invoice } = await client
    .from('invoices')
    .select('id')
    .eq('id', invoice_id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  if (invoice === null) return fail(ctx, 404, 'NOT_FOUND', 'Invoice not found');

  const args: Record<string, unknown> = {
    p_invoice_id: invoice_id,
    p_amount:     Number(amount),
    p_method:     payment_method,
    p_actor_id:   ctx.actorId,
  };
  if (body['provider_reference'] !== undefined) args['p_reference'] = body['provider_reference'];

  const { data: paymentId, error } = await client.rpc('record_payment', args);

  if (error) {
    const msg = error.message as string;
    if (msg.includes('INVOICE_NOT_FOUND'))   return fail(ctx, 404, 'NOT_FOUND',          'Invoice not found');
    if (msg.includes('INVOICE_NOT_PAYABLE')) return fail(ctx, 409, 'CONFLICT',            'Invoice is not in a payable status');
    if (msg.includes('INVALID_AMOUNT'))      return fail(ctx, 422, 'VALIDATION_ERROR',    'Payment amount must be positive');
    log.error('payments.record_failed', { correlation_id: ctx.correlationId, error: msg });
    return fail(ctx, 422, 'INTERNAL_ERROR', msg);
  }

  log.info('Payment.Recorded', {
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    payment_id:     paymentId,
    actor_id:       ctx.actorId,
  });

  const { data: payment, error: fetchErr } = await client
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (fetchErr !== null || payment === null) return ok(ctx, { id: paymentId as string }, 201);
  return ok(ctx, payment, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetOne(id: string, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:payment:read');
  if (guard) return guard;

  const { data, error } = await client
    .from('payments')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  if (error) {
    log.error('payments.get_failed', { correlation_id: ctx.correlationId, error: error.message, payment_id: id });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch payment');
  }
  if (data === null) return fail(ctx, 404, 'NOT_FOUND', `Payment '${id}' not found`);
  return ok(ctx, data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetAllocations(id: string, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:payment:read');
  if (guard) return guard;

  const { data, error } = await client
    .from('payment_allocations')
    .select('*')
    .eq('payment_id', id)
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: true });

  if (error) {
    log.error('payments.allocations_failed', { correlation_id: ctx.correlationId, error: error.message, payment_id: id });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch allocations');
  }

  return new Response(
    JSON.stringify({ data: data ?? [] }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAllocate(req: Request, id: string, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:reconciliation:manage');
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const { invoice_id, amount } = body;
  if (!invoice_id || !amount) return fail(ctx, 422, 'VALIDATION_ERROR', 'invoice_id and amount are required');
  if (Number(amount) <= 0)     return fail(ctx, 422, 'VALIDATION_ERROR', 'amount must be positive');

  const { data: allocationId, error: rpcErr } = await client.rpc('allocate_payment', {
    p_org_id:     ctx.organizationId,
    p_payment_id: id,
    p_invoice_id: invoice_id,
    p_amount:     Number(amount),
    p_notes:      body['notes']    ?? null,
    p_actor_id:   ctx.actorId,
  });

  if (rpcErr) {
    const msg = rpcErr.message as string;
    if (msg.includes('PAYMENT_NOT_FOUND'))         return fail(ctx, 404, 'NOT_FOUND', 'Payment not found');
    if (msg.includes('INVOICE_NOT_FOUND'))          return fail(ctx, 404, 'NOT_FOUND', 'Invoice not found');
    if (msg.includes('PAYMENT_NOT_ALLOCATABLE'))    return fail(ctx, 409, 'CONFLICT', 'Payment is not in an allocatable state');
    if (msg.includes('INVOICE_NOT_PAYABLE'))        return fail(ctx, 409, 'CONFLICT', 'Invoice is not in a payable status');
    if (msg.includes('ALLOCATION_EXCEEDS_PAYMENT')) return fail(ctx, 422, 'VALIDATION_ERROR', 'Allocation exceeds payment headroom');
    if (msg.includes('PERIOD_LOCKED'))              return fail(ctx, 423, 'PERIOD_LOCKED', 'Financial period is locked');
    log.error('payments.allocate_failed', { correlation_id: ctx.correlationId, error: msg, payment_id: id });
    return fail(ctx, 422, 'INTERNAL_ERROR', msg);
  }

  log.info('Payment.Allocated', {
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    payment_id:     id,
    allocation_id:  allocationId,
    actor_id:       ctx.actorId,
  });

  return ok(ctx, { allocation_id: allocationId as string }, 201);
}

// Staff-initiated payment link — mirrors student-portal's own
// POST /payments/stripe/checkout Stripe Checkout Session creation exactly
// (same params shape, same payment_requests row shape), the difference being
// this is invoked by staff on behalf of a student who hasn't self-initiated
// payment via the portal (Business Workflow Execution Audit 2026-08-07, "Let
// staff send a payment request from Finance"). Delivery (email) is the
// caller's responsibility via the existing communications/send pipeline —
// this endpoint only creates the session and returns the URL, so it stays a
// single-purpose Stripe integration rather than reimplementing message
// dispatch (opt-in checks, daily limits, retry) a second time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRequestLink(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:payment:create');
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const invoiceId = body['invoice_id'];
  if (typeof invoiceId !== 'string' || !invoiceId) {
    return fail(ctx, 422, 'VALIDATION_ERROR', 'invoice_id is required');
  }

  const { data: invoice } = await client
    .from('invoices')
    .select('id, student_id, outstanding_amount, invoice_number, status, void_at')
    .eq('id', invoiceId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  if (invoice === null) return fail(ctx, 404, 'NOT_FOUND', 'Invoice not found');
  if (invoice.void_at !== null || !['issued', 'overdue', 'partially_paid'].includes(invoice.status)) {
    return fail(ctx, 409, 'CONFLICT', 'Invoice is not in a payable status');
  }
  if (Number(invoice.outstanding_amount) <= 0) {
    return fail(ctx, 409, 'CONFLICT', 'Invoice has no outstanding balance');
  }

  const { data: student } = await client
    .from('students')
    .select('id, first_name, last_name, email')
    .eq('id', invoice.student_id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  if (student === null) return fail(ctx, 404, 'NOT_FOUND', 'Student not found');
  if (!student.email) return fail(ctx, 422, 'VALIDATION_ERROR', 'Student has no email address on file');

  const { data: orgRow } = await client
    .from('organizations')
    .select('settings')
    .eq('id', ctx.organizationId)
    .maybeSingle();

  // Dual-level payment architecture: a tenant's own (or explicitly-copied
  // pilot) credential in organizations.settings is the only valid source.
  // No platform Deno.env fallback here — falling back to a platform-wide
  // secret would silently process this tenant's payment through whatever
  // account that secret represents (including a future genuine TrafikCloud
  // production account) with no consent step and no way for staff to tell
  // from the UI. See Payment Provider Resolution Safety Check (2026-08-11).
  const settings  = (orgRow?.settings as Record<string, unknown> | undefined) ?? {};
  const storedKey = settings['stripe_secret_key'] as string | undefined;
  const stripeKey = storedKey !== undefined ? await decryptCredential(storedKey) : '';

  if (!stripeKey) return fail(ctx, 503, 'PROVIDER_NOT_CONFIGURED', 'Online card payment is not configured for this school');

  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
  const prId   = crypto.randomUUID();

  const params = new URLSearchParams({
    'mode':                                   'payment',
    'currency':                               'sek',
    'line_items[0][price_data][currency]':    'sek',
    'line_items[0][price_data][unit_amount]': String(Math.round(Number(invoice.outstanding_amount) * 100)),
    'line_items[0][price_data][product_data][name]':
      `Faktura ${invoice.invoice_number ?? invoiceId.slice(0, 8)}`,
    'line_items[0][quantity]':      '1',
    'success_url':                  `${appUrl}/portal/konto?payment=success&req=${prId}`,
    'cancel_url':                   `${appUrl}/portal/konto?payment=cancelled`,
    'metadata[invoice_id]':         invoiceId,
    'metadata[payment_request_id]': prId,
    'metadata[organization_id]':    ctx.organizationId ?? '',
    'metadata[student_id]':         invoice.student_id,
    'metadata[requested_by]':       ctx.actorId ?? '',
  });

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  type StripeSession = { id: string; url: string; error?: { message: string } };
  const stripeData = await stripeRes.json() as StripeSession;

  if (!stripeRes.ok || stripeData.error) {
    log.error('payments.request_link_stripe_failed', {
      correlation_id: ctx.correlationId,
      status: stripeRes.status,
      error:  stripeData.error?.message,
    });
    return fail(ctx, 502, 'PROVIDER_ERROR', 'Payment provider error — please try again');
  }

  const { error: prErr } = await client.from('payment_requests').insert({
    id:                  prId,
    organization_id:     ctx.organizationId,
    student_id:          invoice.student_id,
    invoice_id:          invoiceId,
    provider:            'stripe',
    provider_session_id: stripeData.id,
    amount_sek:          invoice.outstanding_amount,
    status:              'pending',
    return_url:          `${appUrl}/portal/konto`,
    expires_at:          new Date(Date.now() + 30 * 60_000).toISOString(),
    metadata:            { stripe_session_id: stripeData.id, requested_by: ctx.actorId },
  });

  if (prErr) {
    log.error('payments.request_link_insert_failed', { correlation_id: ctx.correlationId, error: prErr.message });
    // Session already created at Stripe — return it anyway rather than
    // stranding a valid, payable link the student could still use.
  }

  log.info('Payment.LinkRequested', {
    correlation_id: ctx.correlationId,
    org_id: ctx.organizationId, student_id: invoice.student_id,
    invoice_id: invoiceId, pr_id: prId, actor_id: ctx.actorId,
  });

  return ok(ctx, {
    payment_request_id: prId,
    session_url:         stripeData.url,
    student_email:        student.email as string,
    student_name:          `${student.first_name} ${student.last_name}`,
    invoice_number:        invoice.invoice_number as string | null,
    amount_sek:             Number(invoice.outstanding_amount),
  }, 201);
}

// ─── Router ───────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  if (req.method !== 'GET') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
  }

  log.requestStarted(req, ctx.correlationId, ctx.organizationId, ctx.actorId);

  const { id, sub } = extractPathParts(req);
  const method = req.method;
  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const lastSegment = new URL(req.url).pathname.split('/').filter(Boolean).pop();

  let response: Response;

  try {
    if (id === null && lastSegment === 'request' && method === 'POST') { response = await handleRequestLink(req, ctx, client); }
    else if (id !== null && sub === 'allocations' && method === 'GET')  { response = await handleGetAllocations(id, ctx, client); }
    else if (id !== null && sub === 'allocate'    && method === 'POST') { response = await handleAllocate(req, id, ctx, client); }
    else if (id !== null && sub === null) {
      if (method === 'GET') { response = await handleGetOne(id, ctx, client); }
      else                  { response = fail(ctx, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed'); }
    } else if (id === null) {
      if (method === 'GET')  { response = await handleList(req, ctx, client); }
      else if (method === 'POST') { response = await handleRecord(req, ctx, client); }
      else                   { response = fail(ctx, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed'); }
    } else {
      response = fail(ctx, 404, 'NOT_FOUND', 'Route not found');
    }
  } catch (err) {
    log.error('payments.unhandled_error', {
      correlation_id: ctx.correlationId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack   : undefined,
    });
    response = fail(ctx, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }

  log.requestCompleted(req, response.status, ctx.correlationId, ctx.startedAt);
  return response;
}));
