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
function extractPathParts(req: Request): { id: string | null; action: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'invoices');
  const after    = segments.slice(fnIdx + 1);
  if (after.length === 0) return { id: null, action: null };
  const first = after[0] ?? '';
  if (UUID_RE.test(first)) return { id: first, action: after[1] ?? null };
  return { id: null, action: first };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:invoice:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const url      = new URL(req.url);
  const page     = Number(url.searchParams.get('page')     ?? '1');
  const perPage  = Number(url.searchParams.get('per_page') ?? '25');
  const from     = (page - 1) * perPage;
  const to       = from + perPage - 1;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('invoices')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const studentId = url.searchParams.get('student_id');
  const status    = url.searchParams.get('status');
  const dateFrom  = url.searchParams.get('from');
  const dateTo    = url.searchParams.get('to');

  if (studentId !== null) q = q.eq('student_id', studentId);
  if (status    !== null && status !== 'all') q = q.eq('status', status);
  if (dateFrom  !== null) q = q.gte('created_at', dateFrom);
  if (dateTo    !== null) q = q.lte('created_at', dateTo);

  const { data, error, count } = await q;
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0 } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreate(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:invoice:create')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  if (!body['student_id']) return err('student_id is required', 400, 'VALIDATION_ERROR');

  const { data, error } = await client
    .from('invoices')
    .insert({
      organization_id:    orgId,
      student_id:         body['student_id'],
      student_package_id: body['student_package_id'] ?? null,
      currency:           body['currency']            ?? 'SEK',
      due_date:           body['due_date']            ?? null,
      notes:              body['notes']               ?? null,
      metadata:           body['metadata']            ?? {},
      created_by:         user.id,
    })
    .select()
    .single();

  if (error) return err(error.message, 422, 'INSERT_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetOne(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:invoice:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const [{ data: invoice, error: invErr }, { data: lines, error: lineErr }] = await Promise.all([
    client.from('invoices').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle(),
    client.from('invoice_line_items').select('*').eq('invoice_id', id).eq('organization_id', orgId).order('sort_order'),
  ]);

  if (invErr) return err(invErr.message, 500, 'QUERY_FAILED');
  if (invoice === null) return err('Invoice not found', 404, 'NOT_FOUND');
  if (lineErr) return err(lineErr.message, 500, 'QUERY_FAILED');

  return json({ invoice, line_items: lines ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAddLine(id: string, req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:invoice:create')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  if (!body['description'] || body['unit_price'] === undefined) {
    return err('description and unit_price are required', 400, 'VALIDATION_ERROR');
  }

  // Verify invoice is draft
  const { data: invoice } = await client
    .from('invoices')
    .select('status')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (invoice === null) return err('Invoice not found', 404, 'NOT_FOUND');
  if (invoice.status !== 'draft') return err(`Cannot add lines to a ${invoice.status} invoice`, 409, 'CONFLICT');

  const qty      = Number(body['quantity']  ?? 1);
  const price    = Number(body['unit_price']);
  const vatRate  = Number(body['vat_rate']  ?? 0.25);

  const { data, error } = await client
    .from('invoice_line_items')
    .insert({
      organization_id:    orgId,
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

  if (error) return err(error.message, 422, 'INSERT_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleIssue(id: string, client: any, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:invoice:approve')) return err('Forbidden', 403, 'FORBIDDEN');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invoiceNumber, error } = await (client as any).rpc('issue_invoice', {
    p_invoice_id: id,
    p_actor_id:   user.id,
  });

  if (error) {
    const msg = error.message as string;
    if (msg.includes('INVOICE_NOT_FOUND'))   return err('Invoice not found', 404, 'NOT_FOUND');
    if (msg.includes('INVOICE_NOT_DRAFT'))    return err('Invoice is not in draft status', 409, 'CONFLICT');
    if (msg.includes('INVOICE_NO_LINES'))     return err('Cannot issue invoice with no line items', 409, 'CONFLICT');
    return err(msg, 422, 'ISSUE_FAILED');
  }

  return json({ invoice_number: invoiceNumber as string });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVoid(id: string, req: Request, client: any, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:invoice:void')) return err('Forbidden', 403, 'FORBIDDEN');

  let reason: string | undefined;
  try {
    const body = await req.json() as Record<string, unknown>;
    reason = body['reason'] as string | undefined;
  } catch { /* reason stays undefined */ }

  const args: Record<string, unknown> = { p_invoice_id: id, p_actor_id: user.id };
  if (reason !== undefined) args['p_reason'] = reason;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: voidAt, error } = await (client as any).rpc('void_invoice', args);

  if (error) {
    const msg = error.message as string;
    if (msg.includes('INVOICE_NOT_FOUND')) return err('Invoice not found', 404, 'NOT_FOUND');
    if (msg.includes('CANNOT_VOID'))       return err('Invoice cannot be voided in current status', 409, 'CONFLICT');
    return err(msg, 422, 'VOID_FAILED');
  }

  return json({ void_at: voidAt as string });
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

  const { id, action } = extractPathParts(req);
  const method = req.method;

  // /invoices/:id/lines
  if (id !== null && action === 'lines' && method === 'POST') {
    return handleAddLine(id, req, client, orgId, user);
  }

  // /invoices/:id/issue
  if (id !== null && action === 'issue' && method === 'POST') {
    return handleIssue(id, client, user);
  }

  // /invoices/:id/void
  if (id !== null && action === 'void' && method === 'POST') {
    return handleVoid(id, req, client, user);
  }

  // /invoices/:id
  if (id !== null && action === null) {
    if (method === 'GET') return handleGetOne(id, client, orgId, user);
    return err('Method not allowed', 405);
  }

  // /invoices
  if (method === 'GET')  return handleList(req, client, orgId, user);
  if (method === 'POST') return handleCreate(req, client, orgId, user);
  return err('Method not allowed', 405);
});
