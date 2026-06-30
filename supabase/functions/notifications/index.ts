/**
 * notifications — Notification management API.
 *
 * Routes:
 *   GET    /notifications                      — list notifications (paginated)
 *   POST   /notifications                      — create notification record
 *   GET    /notifications/:id                  — get single notification
 *   PATCH  /notifications/:id/cancel           — cancel a pending notification
 *   GET    /notifications/preferences/:profileId — get preferences for profile
 *   PUT    /notifications/preferences          — upsert a preference
 */

import { serveCors }            from '../_shared/cors.ts';
import { buildEdgeContext }     from '../_shared/context.ts';
import { createSupabaseClient }  from '../_shared/supabase.ts';
import { createFunctionLogger }  from '../_shared/logger.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

const log     = createFunctionLogger('notifications');
const JSON_CT = { 'Content-Type': 'application/json' } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(ctx: EdgeRequestContext, body: T, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId },
  });
}

function fail(ctx: EdgeRequestContext, status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message, trace_id: ctx.correlationId }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId },
  });
}

function requirePerm(ctx: EdgeRequestContext, code: string): Response | null {
  if (ctx.isPlatformAdmin) return null;
  if (ctx.organizationId === null) return fail(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  if (!ctx.permissions.includes(code)) return fail(ctx, 403, 'FORBIDDEN', `Requires permission: ${code}`);
  return null;
}

function extractPathParts(req: Request): { id: string | null; action: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'notifications');
  const after    = segments.slice(fnIdx + 1);

  if (after.length === 0) return { id: null, action: null };

  const first = after[0] ?? '';

  if (first === 'preferences') return { id: after[1] ?? null, action: 'preferences' };
  if (UUID_RE.test(first))     return { id: first, action: after[1] ?? null };

  return { id: null, action: null };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'notifications:notification:read');
  if (guard) return guard;

  const url     = new URL(req.url);
  const page    = Math.max(1, Number(url.searchParams.get('page')     ?? '1'));
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page') ?? '25')));
  const from    = (page - 1) * perPage;
  const to      = from + perPage - 1;

  const ALLOWED_SORT = new Set(['created_at', 'scheduled_for', 'status']);
  const sortBy  = ALLOWED_SORT.has(url.searchParams.get('sort_by') ?? '') ? url.searchParams.get('sort_by')! : 'created_at';
  const sortDir = url.searchParams.get('sort_dir') === 'asc';

  // eslint-disable-next-line prefer-const
  let q = client
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .order(sortBy, { ascending: sortDir })
    .range(from, to);

  const recipientId = url.searchParams.get('recipient_id');
  const channel     = url.searchParams.get('channel');
  const status      = url.searchParams.get('status');
  const templateKey = url.searchParams.get('template_key');
  const dateFrom    = url.searchParams.get('from');
  const dateTo      = url.searchParams.get('to');

  if (recipientId !== null) q = q.eq('recipient_id', recipientId);
  if (channel     !== null) q = q.eq('channel',      channel);
  if (status      !== null) q = q.eq('status',       status);
  if (templateKey !== null) q = q.eq('template_key', templateKey);
  if (dateFrom    !== null) q = q.gte('created_at',  dateFrom);
  if (dateTo      !== null) q = q.lte('created_at',  dateTo);

  const { data, error, count } = await q;
  if (error) {
    log.error('notifications.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to list notifications');
  }

  return new Response(
    JSON.stringify({
      data: data ?? [],
      meta: { page, per_page: perPage, total: count ?? 0, has_more: page * perPage < (count ?? 0) },
    }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId } }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreate(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'notifications:notification:create');
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const { recipient_id, recipient_type, channel, template_key } = body;
  if (!recipient_id || !recipient_type || !channel || !template_key) {
    return fail(ctx, 422, 'VALIDATION_ERROR', 'recipient_id, recipient_type, channel, template_key are required');
  }

  // Deduplication on idempotency_key
  if (body['idempotency_key'] !== undefined) {
    const { data: existing } = await client
      .from('notifications')
      .select('*')
      .eq('idempotency_key', body['idempotency_key'])
      .maybeSingle();
    if (existing !== null) return ok(ctx, existing);
  }

  const { data, error } = await client
    .from('notifications')
    .insert({
      organization_id: ctx.organizationId,
      recipient_id,
      recipient_type,
      channel,
      template_key,
      locale:          body['locale']           ?? 'sv',
      subject:         body['subject']          ?? null,
      body:            body['body']             ?? null,
      metadata:        body['metadata']         ?? {},
      idempotency_key: body['idempotency_key']  ?? null,
      scheduled_for:   body['scheduled_for']    ?? null,
      reference_type:  body['reference_type']   ?? null,
      reference_id:    body['reference_id']     ?? null,
      status:          'pending',
    })
    .select()
    .single();

  if (error) {
    log.error('notifications.create_failed', { correlation_id: ctx.correlationId, error: error.message });
    return fail(ctx, 422, 'INTERNAL_ERROR', 'Failed to create notification');
  }

  return ok(ctx, data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetOne(id: string, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'notifications:notification:read');
  if (guard) return guard;

  const { data, error } = await client
    .from('notifications')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  if (error) {
    log.error('notifications.get_failed', { correlation_id: ctx.correlationId, error: error.message, notification_id: id });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch notification');
  }
  if (data === null) return fail(ctx, 404, 'NOT_FOUND', `Notification '${id}' not found`);
  return ok(ctx, data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCancel(id: string, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'notifications:notification:create');
  if (guard) return guard;

  const { data: existing } = await client
    .from('notifications')
    .select('status')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  if (existing === null) return fail(ctx, 404, 'NOT_FOUND', `Notification '${id}' not found`);
  if (!['pending', 'failed'].includes(existing.status as string)) {
    return fail(ctx, 409, 'CONFLICT', `Cannot cancel a notification in '${existing.status}' status`);
  }

  const { data, error } = await client
    .from('notifications')
    .update({ status: 'cancelled', status_changed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select()
    .single();

  if (error) {
    log.error('notifications.cancel_failed', { correlation_id: ctx.correlationId, error: error.message, notification_id: id });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to cancel notification');
  }

  return ok(ctx, data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetPreferences(profileId: string, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const isSelf = ctx.actorId === profileId;
  if (!isSelf) {
    const guard = requirePerm(ctx, 'notifications:preferences:manage');
    if (guard) return guard;
  }

  const { data, error } = await client
    .from('notification_preferences')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('profile_id', profileId)
    .order('channel', { ascending: true });

  if (error) {
    log.error('notifications.prefs_get_failed', { correlation_id: ctx.correlationId, error: error.message, profile_id: profileId });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch notification preferences');
  }

  return new Response(
    JSON.stringify({ data: data ?? [] }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId } }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpsertPreference(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const { profile_id, channel, notification_type, enabled } = body;
  if (!profile_id || !channel || !notification_type || enabled === undefined) {
    return fail(ctx, 422, 'VALIDATION_ERROR', 'profile_id, channel, notification_type, enabled are required');
  }

  const isSelf = ctx.actorId === profile_id;
  if (!isSelf) {
    const guard = requirePerm(ctx, 'notifications:preferences:manage');
    if (guard) return guard;
  }

  const { data, error } = await client
    .from('notification_preferences')
    .upsert(
      {
        organization_id:   ctx.organizationId,
        profile_id,
        channel,
        notification_type,
        enabled:           Boolean(enabled),
        updated_at:        new Date().toISOString(),
      },
      { onConflict: 'profile_id,channel,notification_type' }
    )
    .select()
    .single();

  if (error) {
    log.error('notifications.prefs_upsert_failed', { correlation_id: ctx.correlationId, error: error.message });
    return fail(ctx, 422, 'INTERNAL_ERROR', 'Failed to upsert notification preference');
  }

  return ok(ctx, data);
}

// ─── Router ───────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  log.requestStarted(req, ctx.correlationId, ctx.organizationId, ctx.actorId);

  const { id, action } = extractPathParts(req);
  const method = req.method;
  const client = createSupabaseClient(req);

  let response: Response;

  try {
    if (action === 'preferences') {
      if (method === 'GET' && id !== null) { response = await handleGetPreferences(id, ctx, client); }
      else if (method === 'PUT')           { response = await handleUpsertPreference(req, ctx, client); }
      else                                 { response = fail(ctx, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed'); }
    } else if (id !== null && action === 'cancel' && method === 'PATCH') {
      response = await handleCancel(id, ctx, client);
    } else if (id !== null && action === null) {
      if (method === 'GET') { response = await handleGetOne(id, ctx, client); }
      else                  { response = fail(ctx, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed'); }
    } else if (id === null) {
      if (method === 'GET')  { response = await handleList(req, ctx, client); }
      else if (method === 'POST') { response = await handleCreate(req, ctx, client); }
      else                   { response = fail(ctx, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed'); }
    } else {
      response = fail(ctx, 404, 'NOT_FOUND', 'Route not found');
    }
  } catch (err) {
    log.error('notifications.unhandled_error', {
      correlation_id: ctx.correlationId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack   : undefined,
    });
    response = fail(ctx, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }

  log.requestCompleted(req, response.status, ctx.correlationId, ctx.startedAt);
  return response;
}));
