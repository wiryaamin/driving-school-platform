/**
 * campaigns — Campaign management for package promotions.
 *
 * Routes:
 *   GET    /campaigns                — list campaigns
 *   POST   /campaigns                — create campaign
 *   GET    /campaigns/:id            — get campaign + linked packages
 *   PATCH  /campaigns/:id            — update campaign fields
 *   POST   /campaigns/:id/activate   — draft|paused|scheduled → active (or scheduled)
 *   POST   /campaigns/:id/pause      — active → paused
 *   POST   /campaigns/:id/archive    — any → archived
 *   POST   /campaigns/:id/link       — link a package offering
 *   POST   /campaigns/:id/unlink     — unlink a package offering
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { enrichUserFromJwt, getOrgIdFromBearer } from '../_shared/jwt.ts';

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
  const fnIdx    = segments.findLastIndex((s) => s === 'campaigns');
  const after    = segments.slice(fnIdx + 1);
  if (after.length === 0) return { id: null, action: null };
  const first = after[0] ?? '';
  if (UUID_RE.test(first)) return { id: first, action: after[1] ?? null };
  return { id: null, action: first };
}

// ─── List campaigns ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:campaign:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const url     = new URL(req.url);
  const page    = Number(url.searchParams.get('page')     ?? '1');
  const perPage = Number(url.searchParams.get('per_page') ?? '25');
  const from    = (page - 1) * perPage;
  const to      = from + perPage - 1;
  const status  = url.searchParams.get('status');
  const type    = url.searchParams.get('type');

  // eslint-disable-next-line prefer-const
  let q = client
    .from('campaigns')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status !== null && status !== 'all') q = q.eq('status', status);
  if (type   !== null)                     q = q.eq('campaign_type', type);

  const [mainRes, activeRes, scheduledRes] = await Promise.all([
    q,
    client
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'active'),
    client
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'scheduled'),
  ]);

  if (mainRes.error) return err(mainRes.error.message, 500, 'QUERY_FAILED');

  return json({
    data: mainRes.data ?? [],
    meta: {
      page,
      per_page:        perPage,
      total:           mainRes.count      ?? 0,
      active_count:    activeRes.count    ?? 0,
      scheduled_count: scheduledRes.count ?? 0,
    },
  });
}

// ─── Get campaign detail (includes linked packages) ───────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGet(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:campaign:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const [campaignRes, linksRes] = await Promise.all([
    client
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle(),
    client
      .from('campaign_package_links')
      .select(`
        id,
        offering_id,
        campaign_id,
        created_at,
        package_offerings (
          id,
          name,
          price,
          vat_rate,
          status,
          lesson_category,
          package_code,
          visibility
        )
      `)
      .eq('campaign_id', id)
      .eq('organization_id', orgId),
  ]);

  if (campaignRes.error) return err(campaignRes.error.message, 500, 'QUERY_FAILED');
  if (campaignRes.data === null) return err('Campaign not found', 404, 'NOT_FOUND');
  if (linksRes.error) return err(linksRes.error.message, 500, 'QUERY_FAILED');

  return json({ ...campaignRes.data, linked_packages: linksRes.data ?? [] });
}

// ─── Create campaign ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreate(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:campaign:create')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { name, campaign_type } = body;
  if (!name || !campaign_type) {
    return err('name and campaign_type are required', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await client
    .from('campaigns')
    .insert({
      organization_id:    orgId,
      name,
      campaign_type,
      description:        body['description']        ?? null,
      visibility:         body['visibility']         ?? 'internal',
      priority:           body['priority']           ?? 0,
      discount_value:     body['discount_value']     ?? null,
      discount_is_pct:    body['discount_is_pct']    ?? null,
      max_discount_amount: body['max_discount_amount'] ?? null,
      bonus_lessons:      body['bonus_lessons']      ?? null,
      starts_at:          body['starts_at']          ?? null,
      ends_at:            body['ends_at']            ?? null,
      internal_notes:     body['internal_notes']     ?? null,
      metadata:           body['metadata']           ?? {},
      created_by:         user.id,
    })
    .select()
    .single();

  if (error) return err(error.message, 422, 'INSERT_FAILED');

  // Link packages if provided — errors are surfaced, not silently dropped
  const offeringIds = body['offering_ids'] as string[] | undefined;
  if (Array.isArray(offeringIds) && offeringIds.length > 0) {
    const links = offeringIds.map((oid) => ({
      organization_id: orgId,
      campaign_id:     data.id,
      offering_id:     oid,
      created_by:      user.id,
    }));
    const { error: linkErr } = await client.from('campaign_package_links').insert(links);
    if (linkErr) {
      return json(
        { ...data, linked_packages: [], _warning: 'Kampanjen skapades men paketkoppling misslyckades. Koppla paket manuellt.' },
        201,
      );
    }
  }

  return json(data, 201);
}

// ─── Update campaign ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpdate(id: string, req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:campaign:update')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const allowed = [
    'name', 'description', 'visibility', 'priority',
    'discount_value', 'discount_is_pct', 'max_discount_amount', 'bonus_lessons',
    'starts_at', 'ends_at', 'internal_notes', 'metadata',
  ];
  const patch: Record<string, unknown> = { updated_by: user.id };
  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  const { data, error } = await client
    .from('campaigns')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', orgId)
    .neq('status', 'archived')
    .select()
    .maybeSingle();

  if (error) return err(error.message, 500, 'UPDATE_FAILED');
  if (data === null) return err('Campaign not found or archived', 404, 'NOT_FOUND');
  return json(data);
}

// ─── Activate campaign ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleActivate(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:campaign:update')) return err('Forbidden', 403, 'FORBIDDEN');

  // Read current campaign
  const { data: campaign, error: readErr } = await client
    .from('campaigns')
    .select('starts_at, status')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (readErr) return err(readErr.message, 500, 'QUERY_FAILED');
  if (campaign === null) return err('Campaign not found', 404, 'NOT_FOUND');
  if (campaign.status === 'archived') return err('Cannot activate an archived campaign', 400, 'INVALID_STATUS');

  // Determine target status: scheduled if starts_at is in the future
  const startsAt     = campaign.starts_at ? new Date(campaign.starts_at as string) : null;
  const targetStatus = startsAt !== null && startsAt > new Date() ? 'scheduled' : 'active';

  const { data, error } = await client
    .from('campaigns')
    .update({ status: targetStatus, updated_by: user.id })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .maybeSingle();

  if (error) return err(error.message, 500, 'UPDATE_FAILED');
  if (data === null) return err('Campaign not found', 404, 'NOT_FOUND');
  return json(data);
}

// ─── Pause campaign ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePause(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:campaign:update')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('campaigns')
    .update({ status: 'paused', updated_by: user.id })
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .select()
    .maybeSingle();

  if (error) return err(error.message, 500, 'UPDATE_FAILED');
  if (data === null) return err('Campaign not found or not active', 404, 'NOT_FOUND');
  return json(data);
}

// ─── Archive campaign ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleArchive(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:campaign:archive')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('campaigns')
    .update({
      status:      'archived',
      archived_at: new Date().toISOString(),
      archived_by: user.id,
      updated_by:  user.id,
    })
    .eq('id', id)
    .eq('organization_id', orgId)
    .neq('status', 'archived')
    .select()
    .maybeSingle();

  if (error) return err(error.message, 500, 'UPDATE_FAILED');
  if (data === null) return err('Campaign not found or already archived', 404, 'NOT_FOUND');
  return json(data);
}

// ─── Link package offering ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLink(id: string, req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:campaign:update')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const offeringId = body['offering_id'] as string | undefined;
  if (!offeringId || !UUID_RE.test(offeringId)) {
    return err('offering_id (UUID) is required', 400, 'VALIDATION_ERROR');
  }

  // Verify campaign belongs to org
  const { data: campaign } = await client
    .from('campaigns')
    .select('id')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (campaign === null) return err('Campaign not found', 404, 'NOT_FOUND');

  const { data, error } = await client
    .from('campaign_package_links')
    .insert({ organization_id: orgId, campaign_id: id, offering_id: offeringId, created_by: user.id })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return err('Package already linked to this campaign', 409, 'DUPLICATE');
    return err(error.message, 422, 'INSERT_FAILED');
  }
  return json(data, 201);
}

// ─── Unlink package offering ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUnlink(id: string, req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:campaign:update')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const offeringId = body['offering_id'] as string | undefined;
  if (!offeringId) return err('offering_id is required', 400, 'VALIDATION_ERROR');

  const { error } = await client
    .from('campaign_package_links')
    .delete()
    .eq('campaign_id', id)
    .eq('offering_id', offeringId)
    .eq('organization_id', orgId);

  if (error) return err(error.message, 500, 'DELETE_FAILED');
  return json({ ok: true });
}

// ─── Router ───────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader  = req.headers.get('Authorization') ?? '';

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user: rawUser }, error: authErr } = await client.auth.getUser();
  if (authErr !== null || rawUser === null) return err('Unauthorized', 401, 'UNAUTHORIZED');
  const user = enrichUserFromJwt(req, rawUser);

  const orgId = getOrgId(user) ?? getOrgIdFromBearer(req);
  if (orgId === null) return err('No organization context', 400, 'NO_ORG_CONTEXT');

  const { id, action } = extractPathParts(req);
  const method = req.method;

  // /campaigns/:id/activate
  if (id !== null && action === 'activate' && method === 'POST') {
    return handleActivate(id, client, orgId, user);
  }

  // /campaigns/:id/pause
  if (id !== null && action === 'pause' && method === 'POST') {
    return handlePause(id, client, orgId, user);
  }

  // /campaigns/:id/archive
  if (id !== null && action === 'archive' && method === 'POST') {
    return handleArchive(id, client, orgId, user);
  }

  // /campaigns/:id/link
  if (id !== null && action === 'link' && method === 'POST') {
    return handleLink(id, req, client, orgId, user);
  }

  // /campaigns/:id/unlink
  if (id !== null && action === 'unlink' && method === 'POST') {
    return handleUnlink(id, req, client, orgId, user);
  }

  // /campaigns/:id
  if (id !== null && action === null) {
    if (method === 'GET')   return handleGet(id, client, orgId, user);
    if (method === 'PATCH') return handleUpdate(id, req, client, orgId, user);
    return err('Method not allowed', 405);
  }

  // /campaigns
  if (id === null && action === null) {
    if (method === 'GET')  return handleList(req, client, orgId, user);
    if (method === 'POST') return handleCreate(req, client, orgId, user);
    return err('Method not allowed', 405);
  }

  return err('Not found', 404);
}));
