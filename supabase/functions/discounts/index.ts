/**
 * discounts — Discount programs, coupon management, and application.
 *
 * Routes:
 *   GET  /discounts                     — list discount definitions
 *   POST /discounts                     — create discount definition
 *   GET  /discounts/:id                 — get discount
 *   POST /discounts/:id/apply           — apply discount to a draft invoice
 *   POST /discounts/:id/deactivate      — deactivate a discount
 *   GET  /discounts/:id/coupons         — list coupons for a discount
 *   POST /discounts/:id/coupons         — create coupon code
 *   POST /discounts/redeem              — redeem a coupon code on an invoice
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

function parsePath(req: Request): { discountId: string | null; sub: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'discounts');
  const candidate = segments[fnIdx + 1] ?? '';
  const sub       = segments[fnIdx + 2] ?? null;
  return {
    discountId: UUID_RE.test(candidate) ? candidate : null,
    sub:        candidate === 'redeem'  ? 'redeem'  : sub,
  };
}

function mapDiscountError(msg: string): Response {
  if (msg.includes('INVOICE_NOT_FOUND'))    return err('Invoice not found', 404, 'NOT_FOUND');
  if (msg.includes('INVOICE_NOT_DRAFT'))    return err('Discounts can only be applied to draft invoices', 409, 'CONFLICT');
  if (msg.includes('DISCOUNT_NOT_FOUND'))   return err('Discount not found', 404, 'NOT_FOUND');
  if (msg.includes('DISCOUNT_INACTIVE'))    return err('Discount is not active', 422, 'DISCOUNT_INACTIVE');
  if (msg.includes('DISCOUNT_EXPIRED'))     return err('Discount has expired', 422, 'DISCOUNT_EXPIRED');
  if (msg.includes('DISCOUNT_ZERO'))        return err('Computed discount amount is zero', 422, 'DISCOUNT_ZERO');
  if (msg.includes('DISCOUNT_SCOPE_MISMATCH')) return err('Discount scope does not match invoice contents', 422, 'SCOPE_MISMATCH');
  if (msg.includes('COUPON_NOT_FOUND'))     return err('Coupon code not found', 404, 'NOT_FOUND');
  if (msg.includes('COUPON_INACTIVE'))      return err('Coupon code is not active', 422, 'COUPON_INACTIVE');
  if (msg.includes('COUPON_EXPIRED'))       return err('Coupon code has expired', 422, 'COUPON_EXPIRED');
  if (msg.includes('COUPON_LIMIT_REACHED')) return err('Coupon redemption limit reached', 422, 'COUPON_LIMIT');
  if (msg.includes('COUPON_STUDENT_LIMIT')) return err('Coupon already used the maximum times by this student', 422, 'STUDENT_LIMIT');
  if (msg.includes('PERIOD_LOCKED'))        return err('Financial period is locked', 423, 'PERIOD_LOCKED');
  return err(msg, 422, 'DISCOUNT_FAILED');
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

  const { discountId, sub } = parsePath(req);
  const method = req.method;

  // POST /discounts/redeem
  if (discountId === null && sub === 'redeem' && method === 'POST') {
    if (!hasPermission(user, 'finance:discount:assign')) return err('Forbidden', 403, 'FORBIDDEN');
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }
    const { invoice_id, coupon_code, student_id } = body;
    if (!invoice_id || !coupon_code || !student_id) {
      return err('invoice_id, coupon_code, student_id are required', 400, 'VALIDATION_ERROR');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: appId, error: rpcErr } = await (client as any).rpc('redeem_coupon', {
      p_org_id:      orgId,
      p_invoice_id:  invoice_id,
      p_coupon_code: (coupon_code as string).toUpperCase(),
      p_student_id:  student_id,
      p_actor_id:    user.id,
    });
    if (rpcErr) return mapDiscountError(rpcErr.message as string);
    return json({ application_id: appId as string }, 201);
  }

  // Routes with :id
  if (discountId !== null) {
    // POST /discounts/:id/apply
    if (sub === 'apply' && method === 'POST') {
      if (!hasPermission(user, 'finance:discount:assign')) return err('Forbidden', 403, 'FORBIDDEN');
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }
      if (!body['invoice_id']) return err('invoice_id is required', 400, 'VALIDATION_ERROR');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: appId, error: rpcErr } = await (client as any).rpc('apply_discount', {
        p_org_id:      orgId,
        p_invoice_id:  body['invoice_id'],
        p_discount_id: discountId,
        p_actor_id:    user.id,
      });
      if (rpcErr) return mapDiscountError(rpcErr.message as string);
      return json({ application_id: appId as string }, 201);
    }

    // POST /discounts/:id/deactivate
    if (sub === 'deactivate' && method === 'POST') {
      if (!hasPermission(user, 'finance:discount:create')) return err('Forbidden', 403, 'FORBIDDEN');
      const { error: updateErr } = await client
        .from('discount_definitions')
        .update({ is_active: false, updated_by: user.id })
        .eq('id', discountId)
        .eq('organization_id', orgId);
      if (updateErr) return err(updateErr.message, 500, 'UPDATE_FAILED');
      return json({ id: discountId, is_active: false });
    }

    // GET /discounts/:id/coupons
    if (sub === 'coupons' && method === 'GET') {
      if (!hasPermission(user, 'finance:coupon:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error: qErr } = await client
        .from('coupon_codes')
        .select('*')
        .eq('organization_id', orgId)
        .eq('discount_id', discountId)
        .order('created_at', { ascending: false });
      if (qErr) return err(qErr.message, 500, 'QUERY_FAILED');
      return json({ data: data ?? [] });
    }

    // POST /discounts/:id/coupons
    if (sub === 'coupons' && method === 'POST') {
      if (!hasPermission(user, 'finance:coupon:create')) return err('Forbidden', 403, 'FORBIDDEN');
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }
      if (!body['code']) return err('code is required', 400, 'VALIDATION_ERROR');
      const { data: coupon, error: insertErr } = await client
        .from('coupon_codes')
        .insert({
          organization_id: orgId,
          discount_id:     discountId,
          code:            (body['code'] as string).toUpperCase(),
          description:     body['description'] ?? null,
          redemption_limit_total:      body['redemption_limit_total']      ?? null,
          redemption_limit_per_student: body['redemption_limit_per_student'] ?? null,
          valid_from:  body['valid_from']  ?? null,
          valid_to:    body['valid_to']    ?? null,
          is_active:   body['is_active']   ?? true,
          created_by:  user.id,
        })
        .select('*')
        .single();
      if (insertErr) {
        if (insertErr.message.includes('duplicate key')) {
          return err('Coupon code already exists', 409, 'DUPLICATE_CODE');
        }
        return err(insertErr.message, 500, 'INSERT_FAILED');
      }
      return json(coupon, 201);
    }

    // GET /discounts/:id
    if (sub === null && method === 'GET') {
      if (!hasPermission(user, 'finance:discount:read')) return err('Forbidden', 403, 'FORBIDDEN');
      const { data, error: qErr } = await client
        .from('discount_definitions')
        .select('*')
        .eq('id', discountId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (qErr) return err(qErr.message, 500, 'QUERY_FAILED');
      if (data === null) return err('Discount not found', 404, 'NOT_FOUND');
      return json(data);
    }

    return err('Method not allowed', 405);
  }

  // List: GET /discounts
  if (method === 'GET') {
    if (!hasPermission(user, 'finance:discount:read')) return err('Forbidden', 403, 'FORBIDDEN');
    const url      = new URL(req.url);
    const page     = Number(url.searchParams.get('page')     ?? '1');
    const perPage  = Number(url.searchParams.get('per_page') ?? '25');
    const from     = (page - 1) * perPage;
    const to       = from + perPage - 1;
    // eslint-disable-next-line prefer-const
    let q = client
      .from('discount_definitions')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(from, to);
    const isActive = url.searchParams.get('is_active');
    if (isActive !== null) q = q.eq('is_active', isActive === 'true');
    const { data, error: qErr, count } = await q;
    if (qErr) return err(qErr.message, 500, 'QUERY_FAILED');
    return json({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0 } });
  }

  // Create: POST /discounts
  if (method === 'POST') {
    if (!hasPermission(user, 'finance:discount:create')) return err('Forbidden', 403, 'FORBIDDEN');
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }
    const { name, discount_type, discount_value } = body;
    if (!name || !discount_type || discount_value === undefined) {
      return err('name, discount_type, discount_value are required', 400, 'VALIDATION_ERROR');
    }
    const { data: discount, error: insertErr } = await client
      .from('discount_definitions')
      .insert({
        organization_id:     orgId,
        name,
        description:         body['description']         ?? null,
        discount_type,
        discount_scope:      body['discount_scope']      ?? 'all',
        scope_reference_id:  body['scope_reference_id']  ?? null,
        scope_category:      body['scope_category']      ?? null,
        discount_value:      Number(discount_value),
        max_discount_amount: body['max_discount_amount'] ? Number(body['max_discount_amount']) : null,
        currency:            body['currency']            ?? 'SEK',
        valid_from:          body['valid_from']          ?? null,
        valid_to:            body['valid_to']            ?? null,
        is_active:           body['is_active']           ?? true,
        requires_coupon:     body['requires_coupon']     ?? false,
        metadata:            body['metadata']            ?? {},
        created_by:          user.id,
        updated_by:          user.id,
      })
      .select('*')
      .single();
    if (insertErr) return err(insertErr.message, 500, 'INSERT_FAILED');
    return json(discount, 201);
  }

  return err('Method not allowed', 405);
});
