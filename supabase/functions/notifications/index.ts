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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}

function err(message: string, status: number, code?: string): Response {
  return json({ error: message, ...(code !== undefined && { code }) }, status);
}

function extractPathParts(req: Request): { id: string | null; action: string | null; sub: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx = segments.findLastIndex((s) => s === 'notifications');
  const after  = segments.slice(fnIdx + 1);

  if (after.length === 0) return { id: null, action: null, sub: null };

  const first = after[0] ?? '';

  // /notifications/preferences/:profileId
  if (first === 'preferences') {
    return { id: after[1] ?? null, action: 'preferences', sub: null };
  }

  // /notifications/:uuid/cancel
  if (UUID_RE.test(first)) {
    return { id: first, action: after[1] ?? null, sub: null };
  }

  return { id: null, action: null, sub: null };
}

function getOrgId(user: { app_metadata?: Record<string, unknown> }): string | null {
  return (user.app_metadata?.['organization_id'] as string | undefined) ?? null;
}

function hasPermission(user: { app_metadata?: Record<string, unknown> }, perm: string): boolean {
  const perms = (user.app_metadata?.['permissions'] as string[] | undefined) ?? [];
  return perms.includes(perm);
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'notifications:read')) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  const url      = new URL(req.url);
  const page     = Number(url.searchParams.get('page')     ?? '1');
  const perPage  = Number(url.searchParams.get('per_page') ?? '25');
  const from     = (Number(page) - 1) * Number(perPage);
  const to       = from + Number(perPage) - 1;

  // eslint-disable-next-line prefer-const
  let q = client
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order(url.searchParams.get('sort_by') ?? 'created_at', {
      ascending: (url.searchParams.get('sort_dir') ?? 'desc') === 'asc',
    })
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
  if (error) return err(error.message, 500, 'QUERY_FAILED');

  return json({
    data,
    meta: { page, per_page: perPage, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / perPage) },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreate(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'notifications:write')) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body', 400, 'VALIDATION_ERROR');
  }

  const { recipient_id, recipient_type, channel, template_key } = body;
  if (!recipient_id || !recipient_type || !channel || !template_key) {
    return err('recipient_id, recipient_type, channel, template_key are required', 400, 'VALIDATION_ERROR');
  }

  // Deduplication
  if (body['idempotency_key'] !== undefined) {
    const { data: existing } = await client
      .from('notifications')
      .select('*')
      .eq('idempotency_key', body['idempotency_key'])
      .maybeSingle();
    if (existing !== null) return json(existing, 200);
  }

  const { data, error } = await client
    .from('notifications')
    .insert({
      organization_id: orgId,
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

  if (error) return err(error.message, 422, 'INSERT_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetOne(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'notifications:read')) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  const { data, error } = await client
    .from('notifications')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) return err(error.message, 500, 'QUERY_FAILED');
  if (data === null) return err('Notification not found', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCancel(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'notifications:write')) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  const { data: existing } = await client
    .from('notifications')
    .select('status')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (existing === null) return err('Notification not found', 404, 'NOT_FOUND');
  if (!['pending', 'failed'].includes(existing.status as string)) {
    return err(`Cannot cancel a notification in '${existing.status}' status`, 409, 'CONFLICT');
  }

  const { data, error } = await client
    .from('notifications')
    .update({ status: 'cancelled', status_changed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) return err(error.message, 500, 'UPDATE_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetPreferences(profileId: string, client: any, orgId: string, user: any): Promise<Response> {
  const isSelf = (user.id as string) === profileId;
  if (!isSelf && !hasPermission(user, 'notifications:preferences:manage')) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  const { data, error } = await client
    .from('notification_preferences')
    .select('*')
    .eq('organization_id', orgId)
    .eq('profile_id', profileId)
    .order('channel', { ascending: true });

  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpsertPreference(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body', 400, 'VALIDATION_ERROR');
  }

  const { profile_id, channel, notification_type, enabled } = body;
  if (!profile_id || !channel || !notification_type || enabled === undefined) {
    return err('profile_id, channel, notification_type, enabled are required', 400, 'VALIDATION_ERROR');
  }

  const isSelf = (user.id as string) === profile_id;
  if (!isSelf && !hasPermission(user, 'notifications:preferences:manage')) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  const { data, error } = await client
    .from('notification_preferences')
    .upsert(
      {
        organization_id:   orgId,
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

  if (error) return err(error.message, 422, 'UPSERT_FAILED');
  return json(data);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader  = req.headers.get('Authorization') ?? '';

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authErr } = await client.auth.getUser();
  if (authErr !== null || user === null) {
    return err('Unauthorized', 401, 'UNAUTHORIZED');
  }

  const orgId = getOrgId(user);
  if (orgId === null) {
    return err('No organization context', 400, 'NO_ORG_CONTEXT');
  }

  const { id, action } = extractPathParts(req);
  const method = req.method;

  // /notifications/preferences/:profileId
  if (action === 'preferences') {
    if (method === 'GET' && id !== null) return handleGetPreferences(id, client, orgId, user);
    if (method === 'PUT')               return handleUpsertPreference(req, client, orgId, user);
    return err('Method not allowed', 405);
  }

  // /notifications/:id/cancel
  if (id !== null && action === 'cancel' && method === 'PATCH') {
    return handleCancel(id, client, orgId, user);
  }

  // /notifications/:id
  if (id !== null && action === null) {
    if (method === 'GET') return handleGetOne(id, client, orgId, user);
    return err('Method not allowed', 405);
  }

  // /notifications
  if (id === null) {
    if (method === 'GET')  return handleList(req, client, orgId, user);
    if (method === 'POST') return handleCreate(req, client, orgId, user);
    return err('Method not allowed', 405);
  }

  return err('Not found', 404);
});
