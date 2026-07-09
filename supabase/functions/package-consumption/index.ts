/**
 * package-consumption — Package credit lifecycle management.
 *
 * All routes require authentication + permission checks.
 *
 * Routes:
 *   GET    /package-consumption?student_id=X        — list packages for student
 *   GET    /package-consumption/:id                 — detail with events + reversals
 *   GET    /package-consumption/:id/events          — consumption event timeline
 *   POST   /package-consumption/consume             — consume 1 credit
 *   POST   /package-consumption/reverse             — reverse 1 credit
 *   POST   /package-consumption/expire              — expire stale packages for org
 *   PATCH  /package-consumption/:id                 — update cancellation_consumes_credit
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors }        from '../_shared/cors.ts';
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

function parsePath(req: Request): { id: string | null; action: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'package-consumption');
  const after    = segments.slice(fnIdx + 1);
  if (after.length === 0) return { id: null, action: null };
  const first = after[0] ?? '';
  if (UUID_RE.test(first)) return { id: first, action: after[1] ?? null };
  return { id: null, action: first };
}

// ─── List ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'packages:consumption:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const url       = new URL(req.url);
  const studentId = url.searchParams.get('student_id');
  const status    = url.searchParams.get('status');
  const page      = Number(url.searchParams.get('page')     ?? '1');
  const perPage   = Number(url.searchParams.get('per_page') ?? '25');
  const from      = (page - 1) * perPage;
  const to        = from + perPage - 1;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('student_package_assignments')
    .select(
      'id, student_id, enrollment_id, package_offering_id, package_name, package_code, lesson_category, ' +
      'package_quantity, lessons_used, status, expires_at, cancellation_consumes_credit, ' +
      'campaign_name, coupon_code, base_price, final_price_incl_vat, currency, ' +
      'assigned_at, assigned_by, created_at',
      { count: 'exact' },
    )
    .eq('organization_id', orgId)
    .order('assigned_at', { ascending: false })
    .range(from, to);

  if (studentId) q = q.eq('student_id', studentId);
  if (status)    q = q.eq('status', status);

  const { data, count, error } = await q;
  if (error) return err(ctx, 'Failed to load packages', 500, 'QUERY_FAILED');

  const total = count ?? 0;
  // Compute derived fields client-side to avoid view dependency
  const enriched = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    lessons_remaining: (row['package_quantity'] as number) - (row['lessons_used'] as number),
    completion_pct: (row['package_quantity'] as number) > 0
      ? Math.round(((row['lessons_used'] as number) / (row['package_quantity'] as number)) * 1000) / 10
      : 0,
    expiration_warning:
      row['status'] === 'active' &&
      row['expires_at'] != null &&
      new Date(row['expires_at'] as string).getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000,
  }));

  return json({
    data: enriched,
    meta: { total, page, per_page: perPage, has_more: page * perPage < total },
  });
}

// ─── Detail ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDetail(_req: Request, client: any, orgId: string, ctx: EdgeRequestContext, id: string): Promise<Response> {
  if (!hasPermission(ctx, 'packages:consumption:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const [assignmentRes, eventsRes, reversalsRes] = await Promise.all([
    client
      .from('student_package_assignments')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle(),
    client
      .from('package_consumption_events')
      .select('id, event_type, booking_id, reversal_id, credits_delta, lessons_used_after, actor_email, metadata, created_at')
      .eq('assignment_id', id)
      .order('created_at', { ascending: true }),
    client
      .from('package_credit_reversals')
      .select('id, reversal_type, reason, credits_restored, booking_id, reversed_by, created_at')
      .eq('assignment_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (assignmentRes.error) return err(ctx, 'Failed to load package', 500, 'QUERY_FAILED');
  if (!assignmentRes.data) return err(ctx, 'Package assignment not found', 404, 'NOT_FOUND');

  const a = assignmentRes.data as Record<string, unknown>;
  const qty = a['package_quantity'] as number;
  const used = a['lessons_used'] as number;

  return json({
    data: {
      ...a,
      lessons_remaining: qty - used,
      completion_pct: qty > 0 ? Math.round((used / qty) * 1000) / 10 : 0,
      expiration_warning:
        a['status'] === 'active' &&
        a['expires_at'] != null &&
        new Date(a['expires_at'] as string).getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000,
      events:    eventsRes.data    ?? [],
      reversals: reversalsRes.data ?? [],
    },
  });
}

// ─── Events timeline ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEvents(_req: Request, client: any, orgId: string, ctx: EdgeRequestContext, id: string): Promise<Response> {
  if (!hasPermission(ctx, 'packages:consumption:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  // Verify org ownership
  const { data: asgn } = await client
    .from('student_package_assignments')
    .select('id')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!asgn) return err(ctx, 'Package assignment not found', 404, 'NOT_FOUND');

  const { data, error } = await client
    .from('package_consumption_events')
    .select('id, event_type, booking_id, reversal_id, credits_delta, lessons_used_after, actor_email, metadata, created_at')
    .eq('assignment_id', id)
    .order('created_at', { ascending: true });

  if (error) return err(ctx, 'Failed to load events', 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// ─── Consume credit ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleConsume(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'packages:consumption:record')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(ctx, 'Invalid JSON', 400, 'INVALID_JSON'); }

  const assignmentId = body['assignment_id'];
  if (typeof assignmentId !== 'string' || !UUID_RE.test(assignmentId)) {
    return err(ctx, 'assignment_id must be a UUID', 400, 'INVALID_PARAMS');
  }

  const bookingId      = typeof body['booking_id'] === 'string' ? body['booking_id'] : null;
  const lessonCategory = typeof body['lesson_category'] === 'string' ? body['lesson_category'] : null;
  const notes          = typeof body['notes'] === 'string' ? body['notes'] : null;

  const { data, error } = await client.rpc('consume_lesson_credit', {
    p_assignment_id:   assignmentId,
    p_organization_id: orgId,
    ...(bookingId      != null ? { p_booking_id:      bookingId }      : {}),
    ...(lessonCategory != null ? { p_lesson_category: lessonCategory } : {}),
    p_actor_id:    ctx.actorId as string | null ?? undefined,
    p_actor_email: ctx.actorEmail as string | null ?? undefined,
    ...(notes != null ? { p_metadata: { notes } } : {}),
  });

  if (error) {
    if (error.code === 'P0001') return err(ctx, error.message, 409, 'BUSINESS_RULE');
    if (error.code === 'P0002') return err(ctx, 'Package assignment not found', 404, 'NOT_FOUND');
    console.error('consume_lesson_credit failed:', error);
    return err(ctx, 'Failed to consume credit', 500, 'RPC_FAILED');
  }

  return json({ data });
}

// ─── Reverse credit ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReverse(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'packages:consumption:reverse')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(ctx, 'Invalid JSON', 400, 'INVALID_JSON'); }

  const assignmentId = body['assignment_id'];
  if (typeof assignmentId !== 'string' || !UUID_RE.test(assignmentId)) {
    return err(ctx, 'assignment_id must be a UUID', 400, 'INVALID_PARAMS');
  }

  const VALID_REVERSAL_TYPES = [
    'manual', 'late_cancellation', 'no_show_reversal', 'instructor_error', 'administrative',
  ];
  const reversalType = body['reversal_type'];
  if (typeof reversalType !== 'string' || !VALID_REVERSAL_TYPES.includes(reversalType)) {
    return err(ctx, 'Invalid reversal_type', 400, 'INVALID_PARAMS');
  }

  const reason = body['reason'];
  if (typeof reason !== 'string' || !reason.trim()) {
    return err(ctx, 'reason is required', 400, 'INVALID_PARAMS');
  }

  const bookingId = typeof body['booking_id'] === 'string' ? body['booking_id'] : null;

  const { data, error } = await client.rpc('reverse_lesson_credit', {
    p_assignment_id:   assignmentId,
    p_organization_id: orgId,
    p_reversal_type:   reversalType,
    p_reason:          reason.trim(),
    ...(bookingId != null ? { p_booking_id: bookingId } : {}),
    p_actor_id:    ctx.actorId as string | null ?? undefined,
    p_actor_email: ctx.actorEmail as string | null ?? undefined,
  });

  if (error) {
    if (error.code === 'P0001') return err(ctx, error.message, 409, 'BUSINESS_RULE');
    if (error.code === 'P0002') return err(ctx, 'Package assignment not found', 404, 'NOT_FOUND');
    console.error('reverse_lesson_credit failed:', error);
    return err(ctx, 'Failed to reverse credit', 500, 'RPC_FAILED');
  }

  return json({ data });
}

// ─── Expire stale packages ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleExpire(_req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'packages:consumption:reverse')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client.rpc('expire_stale_packages', {
    p_organization_id: orgId,
  });

  if (error) {
    console.error('expire_stale_packages failed:', error);
    return err(ctx, 'Failed to expire packages', 500, 'RPC_FAILED');
  }

  return json({ data: { expired_count: data as number } });
}

// ─── Patch (config) ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePatch(req: Request, client: any, orgId: string, ctx: EdgeRequestContext, id: string): Promise<Response> {
  if (!hasPermission(ctx, 'enrollment:package:assign')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(ctx, 'Invalid JSON', 400, 'INVALID_JSON'); }

  const allowed: Record<string, unknown> = {};
  if (typeof body['cancellation_consumes_credit'] === 'boolean') {
    allowed['cancellation_consumes_credit'] = body['cancellation_consumes_credit'];
  }

  if (Object.keys(allowed).length === 0) return err(ctx, 'No valid fields to update', 400, 'NO_FIELDS');

  const { data, error } = await client
    .from('student_package_assignments')
    .update(allowed)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('id, cancellation_consumes_credit, updated_at')
    .single();

  if (error || !data) return err(ctx, 'Update failed', 500, 'UPDATE_FAILED');
  return json({ data });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')      ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader  = req.headers.get('Authorization')  ?? '';

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

  const { id, action } = parsePath(req);

  try {
    if (!id) {
      if (action === 'consume' && req.method === 'POST') return await handleConsume(req, client, orgId, ctx);
      if (action === 'reverse' && req.method === 'POST') return await handleReverse(req, client, orgId, ctx);
      if (action === 'expire'  && req.method === 'POST') return await handleExpire(req, client, orgId, ctx);
      if (!action && req.method === 'GET')               return await handleList(req, client, orgId, ctx);
      return err(ctx, 'Not found', 404, 'NOT_FOUND');
    }

    if (action === 'events' && req.method === 'GET') return await handleEvents(req, client, orgId, ctx, id);
    if (!action) {
      if (req.method === 'GET')   return await handleDetail(req, client, orgId, ctx, id);
      if (req.method === 'PATCH') return await handlePatch(req, client, orgId, ctx, id);
    }

    return err(ctx, 'Not found', 404, 'NOT_FOUND');
  } catch (e) {
    console.error('package-consumption error', e);
    return err(ctx, 'Internal server error', 500, 'INTERNAL_ERROR');
  }
}));
