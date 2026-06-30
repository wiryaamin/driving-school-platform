/**
 * orders — Commercial order management workspace.
 *
 * Routes:
 *   GET    /orders               — list (paginated, filter by status/search)
 *   POST   /orders               — create order (calls create_order RPC)
 *   GET    /orders/:id           — detail with items + events
 *   PATCH  /orders/:id           — update status or notes
 *   POST   /orders/:id/cancel    — cancel order with reason
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors }        from '../_shared/cors.ts';
import { enrichUserFromJwt, getOrgIdFromBearer, getUserIdFromBearer } from '../_shared/jwt.ts';

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(message: string, status: number, code?: string): Response {
  return json({ error: message, ...(code !== undefined ? { code } : {}) }, status);
}
function getOrgId(user: { app_metadata?: Record<string, unknown> }): string | null {
  return (user.app_metadata?.['organization_id'] as string | undefined) ?? null;
}
function hasPermission(user: { app_metadata?: Record<string, unknown> }, perm: string): boolean {
  if (user.app_metadata?.['is_platform_admin'] === true) return true;
  const perms = (user.app_metadata?.['permissions'] as string[] | undefined) ?? [];
  return perms.includes(perm);
}

function parsePath(req: Request): { id: string | null; action: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'orders');
  const after    = segments.slice(fnIdx + 1);
  if (after.length === 0) return { id: null, action: null };
  const first = after[0] ?? '';
  if (UUID_RE.test(first)) return { id: first, action: after[1] ?? null };
  return { id: null, action: first };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'orders:order:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const url     = new URL(req.url);
  const page    = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page') ?? '25')));
  const from    = (page - 1) * perPage;
  const to      = from + perPage - 1;
  const status  = url.searchParams.get('status');
  const search  = (url.searchParams.get('search') ?? '').trim();
  const dateFrom = url.searchParams.get('date_from');
  const dateTo   = url.searchParams.get('date_to');

  // eslint-disable-next-line prefer-const
  let q = client
    .from('v_order_summary')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status !== null && status !== 'all') q = q.eq('status', status);
  if (dateFrom !== null) q = q.gte('created_at', dateFrom);
  if (dateTo   !== null) q = q.lte('created_at', dateTo);

  if (search.length > 0) {
    q = q.or(
      `student_first_name.ilike.%${search}%,student_last_name.ilike.%${search}%,` +
      `student_email.ilike.%${search}%,package_name.ilike.%${search}%`
    );
  }

  const { data, error, count } = await q;
  if (error !== null) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0 } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreate(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'orders:order:create')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return err('Request body must be valid JSON', 422, 'VALIDATION_ERROR'); }

  const actorId    = (user.id as string | undefined) ?? null;
  const actorEmail = (user.email as string | undefined) ?? null;

  const { data, error } = await client.rpc('create_order', {
    p_organization_id:     orgId,
    p_student_id:          body['student_id']          ?? null,
    p_enrollment_id:       body['enrollment_id']       ?? null,
    p_package_offering_id: body['package_offering_id'] ?? null,
    p_package_name:        body['package_name']        ?? null,
    p_package_code:        body['package_code']        ?? null,
    p_lesson_category:     body['lesson_category']     ?? null,
    p_package_quantity:    body['package_quantity']    ?? null,
    p_campaign_id:         body['campaign_id']         ?? null,
    p_campaign_name:       body['campaign_name']       ?? null,
    p_coupon_id:           body['coupon_id']           ?? null,
    p_coupon_code:         body['coupon_code']         ?? null,
    p_base_price:          body['base_price']          ?? 0,
    p_campaign_discount:   body['campaign_discount']   ?? 0,
    p_coupon_discount:     body['coupon_discount']     ?? 0,
    p_vat_rate:            body['vat_rate']            ?? 0.25,
    p_currency:            body['currency']            ?? 'SEK',
    p_internal_notes:      body['internal_notes']      ?? null,
    p_actor_id:            actorId,
    p_actor_email:         actorEmail,
    p_metadata:            body['metadata']            ?? {},
  });

  if (error !== null) return err(error.message, 500, 'CREATE_FAILED');
  return json({ data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetById(req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'orders:order:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const [orderRes, itemsRes, eventsRes] = await Promise.all([
    client
      .from('v_order_summary')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle(),
    client
      .from('order_items')
      .select('*')
      .eq('order_id', id)
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true }),
    client
      .from('order_events')
      .select('*')
      .eq('order_id', id)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true }),
  ]);

  if (orderRes.error !== null) return err(orderRes.error.message, 500, 'QUERY_FAILED');
  if (orderRes.data === null)  return err(`Order '${id}' not found`, 404, 'NOT_FOUND');

  return json({
    data: {
      ...orderRes.data,
      items:  itemsRes.data  ?? [],
      events: eventsRes.data ?? [],
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpdate(req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'orders:order:update')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return err('Request body must be valid JSON', 422, 'VALIDATION_ERROR'); }

  const actorId    = (user.id as string | undefined) ?? null;
  const actorEmail = (user.email as string | undefined) ?? null;
  const newStatus  = body['status'] as string | undefined;

  // If only updating notes (no status change), do a direct update
  if (newStatus === undefined) {
    const { data, error } = await client
      .from('orders')
      .update({
        internal_notes: body['internal_notes'] ?? null,
        updated_by:     actorId,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error !== null) {
      if (error.code === 'PGRST116') return err(`Order '${id}' not found`, 404, 'NOT_FOUND');
      return err(error.message, 500, 'UPDATE_FAILED');
    }

    // Emit order_updated event
    await client.rpc('emit_order_event', {
      p_organization_id: orgId,
      p_order_id:        id,
      p_event_type:      'order_updated',
      p_actor_id:        actorId,
      p_actor_email:     actorEmail,
      p_metadata:        { notes_updated: true },
    }).catch(() => {/* non-critical */});

    return json({ data });
  }

  // Status transition via SECURITY DEFINER
  const { data, error } = await client.rpc('update_order_status', {
    p_order_id:            id,
    p_organization_id:     orgId,
    p_new_status:          newStatus,
    p_actor_id:            actorId,
    p_actor_email:         actorEmail,
    p_amount_paid:         body['amount_paid']         ?? null,
    p_cancellation_reason: body['cancellation_reason'] ?? null,
    p_internal_notes:      body['internal_notes']      ?? null,
  });

  if (error !== null) return err(error.message, 409, 'TRANSITION_FAILED');
  return json({ data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCancel(req: Request, client: any, orgId: string, user: any, id: string): Promise<Response> {
  if (!hasPermission(user, 'orders:order:cancel')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown> = {};
  try { body = await req.json() as Record<string, unknown>; } catch { /* reason is optional */ }

  const actorId    = (user.id as string | undefined) ?? null;
  const actorEmail = (user.email as string | undefined) ?? null;

  const { data, error } = await client.rpc('update_order_status', {
    p_order_id:            id,
    p_organization_id:     orgId,
    p_new_status:          'cancelled',
    p_actor_id:            actorId,
    p_actor_email:         actorEmail,
    p_amount_paid:         null,
    p_cancellation_reason: body['reason'] as string ?? null,
    p_internal_notes:      null,
  });

  if (error !== null) return err(error.message, 409, 'CANCEL_FAILED');
  return json({ data });
}

// ─── Revenue report ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRevenueReport(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'orders:order:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const url     = new URL(req.url);
  const dateFrom = url.searchParams.get('date_from');
  const dateTo   = url.searchParams.get('date_to');

  // eslint-disable-next-line prefer-const
  let q = client
    .from('v_order_revenue_report')
    .select('*')
    .eq('organization_id', orgId)
    .order('period_month', { ascending: false });

  if (dateFrom !== null) q = q.gte('period_month', dateFrom);
  if (dateTo   !== null) q = q.lte('period_month', dateTo);

  const { data, error } = await q;
  if (error !== null) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve((req: Request) =>
  serveCors(req, async () => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const client = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    let user = await client.auth.getUser().then((r) => r.data.user ?? {});
    user = enrichUserFromJwt(req, user);

    const orgId = getOrgId(user);
    if (orgId === null) return err('No organization context', 401, 'UNAUTHORIZED');

    const { id, action } = parsePath(req);

    // Collection routes
    if (id === null) {
      if (action === 'revenue-report' && req.method === 'GET') return handleRevenueReport(req, client, orgId, user);
      if (req.method === 'GET')  return handleList(req, client, orgId, user);
      if (req.method === 'POST') return handleCreate(req, client, orgId, user);
      return err('Method not allowed', 405);
    }

    // Item action routes
    if (action === 'cancel' && req.method === 'POST') return handleCancel(req, client, orgId, user, id);

    // Item routes
    if (req.method === 'GET')   return handleGetById(req, client, orgId, user, id);
    if (req.method === 'PATCH') return handleUpdate(req, client, orgId, user, id);

    return err('Method not allowed', 405);
  })
);
