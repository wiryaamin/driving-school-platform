/**
 * waitlist — Slot waitlist management API.
 *
 * Routes:
 *   GET    /waitlist?slot_id=:id   — list entries for a slot
 *   POST   /waitlist               — join waitlist
 *   GET    /waitlist/:id           — get single entry
 *   DELETE /waitlist/:id           — leave waitlist (cancel entry)
 *   POST   /waitlist/:id/promote   — manually promote a specific entry (admin)
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

function extractId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'waitlist');
  const candidate = segments[fnIdx + 1] ?? '';
  return UUID_RE.test(candidate) ? candidate : null;
}

function extractAction(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'waitlist');
  return segments[fnIdx + 2] ?? null;
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
  if (!hasPermission(user, 'scheduling:booking:read')) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  const url    = new URL(req.url);
  const slotId = url.searchParams.get('slot_id');
  const status = url.searchParams.get('status') ?? 'waiting';

  if (slotId === null || !UUID_RE.test(slotId)) {
    return err('slot_id query param is required', 400, 'VALIDATION_ERROR');
  }

  // eslint-disable-next-line prefer-const
  let q = client
    .from('waitlist_entries')
    .select('*')
    .eq('organization_id', orgId)
    .eq('slot_id', slotId)
    .order('priority',   { ascending: true })
    .order('created_at', { ascending: true });

  if (status !== 'all') q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleJoin(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'scheduling:booking:create')) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body', 400, 'VALIDATION_ERROR');
  }

  const { slot_id, student_id } = body;
  if (!slot_id || !student_id) {
    return err('slot_id and student_id are required', 400, 'VALIDATION_ERROR');
  }

  // Verify slot exists and belongs to this org
  const { data: slot } = await client
    .from('lesson_slots')
    .select('id, status')
    .eq('id', slot_id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();

  if (slot === null) return err('Slot not found', 404, 'NOT_FOUND');
  if (['cancelled', 'blocked'].includes(slot.status as string)) {
    return err(`Cannot join waitlist for a ${slot.status} slot`, 409, 'CONFLICT');
  }

  // Check for duplicate active entry
  const { data: existing } = await client
    .from('waitlist_entries')
    .select('id')
    .eq('organization_id', orgId)
    .eq('slot_id', slot_id)
    .eq('student_id', student_id)
    .eq('status', 'waiting')
    .maybeSingle();

  if (existing !== null) {
    return err('Student already has an active waitlist entry for this slot', 409, 'CONFLICT');
  }

  const { data, error } = await client
    .from('waitlist_entries')
    .insert({
      organization_id: orgId,
      slot_id,
      student_id,
      priority:   body['priority']   ?? 0,
      expires_at: body['expires_at'] ?? null,
      notes:      body['notes']      ?? null,
      status:     'waiting',
    })
    .select()
    .single();

  if (error) return err(error.message, 422, 'INSERT_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetOne(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'scheduling:booking:read')) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  const { data, error } = await client
    .from('waitlist_entries')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) return err(error.message, 500, 'QUERY_FAILED');
  if (data === null) return err('Waitlist entry not found', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLeave(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'scheduling:booking:update')) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  const { data: existing } = await client
    .from('waitlist_entries')
    .select('status')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (existing === null) return err('Waitlist entry not found', 404, 'NOT_FOUND');
  if (existing.status !== 'waiting') {
    return err(`Cannot cancel a waitlist entry in '${existing.status}' status`, 409, 'CONFLICT');
  }

  const { data, error } = await client
    .from('waitlist_entries')
    .update({ status: 'cancelled', status_changed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) return err(error.message, 500, 'UPDATE_FAILED');
  return json(data);
}

// Admin: manually trigger promotion for a specific slot
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePromote(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'scheduling:booking:update')) {
    return err('Forbidden', 403, 'FORBIDDEN');
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body', 400, 'VALIDATION_ERROR');
  }

  const { slot_id } = body;
  if (!slot_id || !UUID_RE.test(String(slot_id))) {
    return err('slot_id is required', 400, 'VALIDATION_ERROR');
  }

  const { data: promotedId, error } = await (client as any).rpc('promote_waitlist_next', {
    p_slot_id: slot_id,
  });

  if (error) return err(error.message, 500, 'RPC_FAILED');
  if (promotedId === null) return json({ promoted: null, message: 'No waiting entries for this slot' });
  return json({ promoted: promotedId });
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

  const id     = extractId(req);
  const action = extractAction(req);
  const method = req.method;

  // POST /waitlist/:id/promote  (admin-triggered)
  if (id !== null && action === 'promote' && method === 'POST') {
    return handlePromote(req, client, orgId, user);
  }

  // /waitlist/:id
  if (id !== null) {
    if (method === 'GET')    return handleGetOne(id, client, orgId, user);
    if (method === 'DELETE') return handleLeave(id, client, orgId, user);
    return err('Method not allowed', 405);
  }

  // /waitlist
  if (method === 'GET')  return handleList(req, client, orgId, user);
  if (method === 'POST') return handleJoin(req, client, orgId, user);
  return err('Method not allowed', 405);
});
