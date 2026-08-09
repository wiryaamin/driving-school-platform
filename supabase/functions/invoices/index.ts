/**
 * invoices — Invoice lifecycle management.
 *
 * Routes:
 *   GET   /invoices                   — list invoices
 *   POST  /invoices                   — create draft invoice
 *   GET   /invoices/:id               — get invoice with line items
 *   POST  /invoices/:id/lines         — add line item to draft invoice
 *   POST  /invoices/:id/issue         — issue invoice (gap-free number + VAT freeze)
 *   POST  /invoices/:id/void          — void invoice
 */

import { serveCors }           from '../_shared/cors.ts';
import { buildEdgeContext }    from '../_shared/context.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { createFunctionLogger } from '../_shared/logger.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

const log     = createFunctionLogger('invoices');
const JSON_CT = { 'Content-Type': 'application/json' } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(ctx: EdgeRequestContext, body: T, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

function fail(
  ctx: EdgeRequestContext,
  status: number,
  code: string,
  message: string,
  details?: unknown
): Response {
  const body: Record<string, unknown> = { code, message, trace_id: ctx.correlationId };
  if (details !== undefined) body['details'] = details;
  return new Response(JSON.stringify(body), {
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

function extractPathParts(req: Request): { id: string | null; action: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'invoices');
  const after    = segments.slice(fnIdx + 1);
  if (after.length === 0) return { id: null, action: null };
  const first = after[0] ?? '';
  if (UUID_RE.test(first)) return { id: first, action: after[1] ?? null };
  return { id: null, action: first };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:invoice:read');
  if (guard) return guard;

  const url     = new URL(req.url);
  const page    = Math.max(1, Number(url.searchParams.get('page')     ?? '1'));
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page') ?? '25')));
  const from    = (page - 1) * perPage;
  const to      = from + perPage - 1;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('invoices')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const studentId = url.searchParams.get('student_id');
  const status    = url.searchParams.get('status');
  const dateFrom  = url.searchParams.get('from');
  const dateTo    = url.searchParams.get('to');

  if (studentId !== null)                  q = q.eq('student_id', studentId);
  if (status    !== null && status !== 'all') q = q.eq('status', status);
  if (dateFrom  !== null)                  q = q.gte('created_at', dateFrom);
  if (dateTo    !== null)                  q = q.lte('created_at', dateTo);

  const { data, error, count } = await q;
  if (error) {
    log.error('invoices.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to list invoices');
  }

  return new Response(
    JSON.stringify({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0, has_more: page * perPage < (count ?? 0) } }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreate(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:invoice:create');
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const isGuest = body['is_guest'] === true;
  if (!isGuest && !body['student_id']) {
    return fail(ctx, 422, 'VALIDATION_ERROR', 'student_id is required for non-guest invoices');
  }

  // Reuse the student's real, already-linked company as the default billing
  // party — same rule create_invoice_from_order() applies (see migration
  // 20260807135952_invoice_corporate_billing.sql). An explicit
  // corporate_customer_id in the request always wins; only defaulted when
  // omitted entirely.
  let corporateCustomerId = body['corporate_customer_id'] ?? null;
  if (corporateCustomerId === null && !isGuest && body['student_id']) {
    const { data: studentRow } = await client
      .from('students')
      .select('corporate_customer_id')
      .eq('id', body['student_id'])
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    corporateCustomerId = studentRow?.corporate_customer_id ?? null;
  }

  const { data, error } = await client
    .from('invoices')
    .insert({
      organization_id:        ctx.organizationId,
      student_id:             body['student_id']         ?? null,
      student_package_id:     body['student_package_id'] ?? null,
      corporate_customer_id:  corporateCustomerId,
      currency:                body['currency']            ?? 'SEK',
      due_date:                body['due_date']            ?? null,
      notes:                   body['notes']               ?? null,
      metadata:                body['metadata']            ?? {},
      created_by:              ctx.actorId,
    })
    .select()
    .single();

  if (error) {
    log.error('invoices.create_failed', { correlation_id: ctx.correlationId, error: error.message });
    return fail(ctx, 422, 'INTERNAL_ERROR', 'Failed to create invoice');
  }

  log.info('Invoice.Created', {
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    invoice_id:     (data as Record<string, unknown>)['id'],
    actor_id:       ctx.actorId,
  });

  return ok(ctx, data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetOne(id: string, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:invoice:read');
  if (guard) return guard;

  const [{ data: invoice, error: invErr }, { data: lines, error: lineErr }] = await Promise.all([
    client.from('invoices').select('*').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle(),
    client.from('invoice_line_items').select('*').eq('invoice_id', id).eq('organization_id', ctx.organizationId).order('sort_order'),
  ]);

  if (invErr) {
    log.error('invoices.get_failed', { correlation_id: ctx.correlationId, error: invErr.message, invoice_id: id });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch invoice');
  }
  if (invoice === null) return fail(ctx, 404, 'NOT_FOUND', `Invoice '${id}' not found`);
  if (lineErr) {
    log.error('invoices.lines_failed', { correlation_id: ctx.correlationId, error: lineErr.message, invoice_id: id });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch invoice line items');
  }

  return ok(ctx, { invoice, line_items: lines ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAddLine(id: string, req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:invoice:create');
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  if (!body['description'] || body['unit_price'] === undefined) {
    return fail(ctx, 422, 'VALIDATION_ERROR', 'description and unit_price are required');
  }

  const { data: invoice } = await client
    .from('invoices')
    .select('status')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  if (invoice === null) return fail(ctx, 404, 'NOT_FOUND', `Invoice '${id}' not found`);
  if (invoice.status !== 'draft') {
    return fail(ctx, 409, 'CONFLICT', `Cannot add lines to a ${invoice.status} invoice`);
  }

  const qty     = Number(body['quantity']  ?? 1);
  const price   = Number(body['unit_price']);
  const vatRate = Number(body['vat_rate']  ?? 0.25);

  const { data, error } = await client
    .from('invoice_line_items')
    .insert({
      organization_id:    ctx.organizationId,
      invoice_id:         id,
      student_package_id: body['student_package_id'] ?? null,
      line_type:          body['line_type']           ?? 'package',
      description:        body['description'],
      quantity:           qty,
      unit_price:         price,
      vat_rate:           vatRate,
      vat_amount:         qty * price * vatRate,
      line_total:         qty * price,
      sort_order:         body['sort_order']          ?? 0,
      metadata:           body['metadata']            ?? {},
    })
    .select()
    .single();

  if (error) {
    log.error('invoices.add_line_failed', { correlation_id: ctx.correlationId, error: error.message, invoice_id: id });
    return fail(ctx, 422, 'INTERNAL_ERROR', 'Failed to add line item');
  }

  return ok(ctx, data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleIssue(id: string, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:invoice:approve');
  if (guard) return guard;

  const { data: invoiceNumber, error } = await client.rpc('issue_invoice', {
    p_invoice_id: id,
    p_actor_id:   ctx.actorId,
  });

  if (error) {
    const msg = error.message as string;
    if (msg.includes('INVOICE_NOT_FOUND')) return fail(ctx, 404, 'NOT_FOUND', 'Invoice not found');
    if (msg.includes('INVOICE_NOT_DRAFT')) return fail(ctx, 409, 'CONFLICT', 'Invoice is not in draft status');
    if (msg.includes('INVOICE_NO_LINES'))  return fail(ctx, 409, 'CONFLICT', 'Cannot issue invoice with no line items');
    log.error('invoices.issue_failed', { correlation_id: ctx.correlationId, error: msg, invoice_id: id });
    return fail(ctx, 422, 'INTERNAL_ERROR', msg);
  }

  log.info('Invoice.Issued', {
    correlation_id:  ctx.correlationId,
    org_id:          ctx.organizationId,
    invoice_id:      id,
    invoice_number:  invoiceNumber,
    actor_id:        ctx.actorId,
  });

  return ok(ctx, { invoice_number: invoiceNumber as string });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVoid(id: string, req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:invoice:void');
  if (guard) return guard;

  let reason: string | undefined;
  try {
    const body = await req.json() as Record<string, unknown>;
    reason = body['reason'] as string | undefined;
  } catch { /* reason stays undefined */ }

  const args: Record<string, unknown> = { p_invoice_id: id, p_actor_id: ctx.actorId };
  if (reason !== undefined) args['p_reason'] = reason;

  const { data: voidAt, error } = await client.rpc('void_invoice', args);

  if (error) {
    const msg = error.message as string;
    if (msg.includes('INVOICE_NOT_FOUND')) return fail(ctx, 404, 'NOT_FOUND', 'Invoice not found');
    if (msg.includes('CANNOT_VOID'))       return fail(ctx, 409, 'CONFLICT', 'Invoice cannot be voided in current status');
    log.error('invoices.void_failed', { correlation_id: ctx.correlationId, error: msg, invoice_id: id });
    return fail(ctx, 422, 'INTERNAL_ERROR', msg);
  }

  log.info('Invoice.Voided', {
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    invoice_id:     id,
    actor_id:       ctx.actorId,
  });

  return ok(ctx, { void_at: voidAt as string });
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

  const { id, action } = extractPathParts(req);
  const method = req.method;
  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  let response: Response;

  try {
    if (id !== null && action === 'lines'  && method === 'POST') { response = await handleAddLine(id, req, ctx, client); }
    else if (id !== null && action === 'issue' && method === 'POST') { response = await handleIssue(id, ctx, client); }
    else if (id !== null && action === 'void'  && method === 'POST') { response = await handleVoid(id, req, ctx, client); }
    else if (id !== null && action === null) {
      if (method === 'GET') { response = await handleGetOne(id, ctx, client); }
      else { response = fail(ctx, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed'); }
    } else if (id === null) {
      if (method === 'GET')  { response = await handleList(req, ctx, client); }
      else if (method === 'POST') { response = await handleCreate(req, ctx, client); }
      else { response = fail(ctx, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed'); }
    } else {
      response = fail(ctx, 404, 'NOT_FOUND', 'Route not found');
    }
  } catch (err) {
    log.error('invoices.unhandled_error', {
      correlation_id: ctx.correlationId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack   : undefined,
    });
    response = fail(ctx, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }

  log.requestCompleted(req, response.status, ctx.correlationId, ctx.startedAt);
  return response;
}));
