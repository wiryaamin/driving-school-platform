/**
 * packages — Package catalog and offerings management.
 *
 * Routes:
 *   GET    /packages                  — list offerings
 *   POST   /packages                  — create offering
 *   GET    /packages/:id              — get offering detail
 *   PATCH  /packages/:id              — update offering
 *   POST   /packages/:id/archive      — archive offering
 *   GET    /packages/catalog          — list catalog entries
 *   POST   /packages/catalog          — create catalog entry
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
  const fnIdx    = segments.findLastIndex((s) => s === 'packages');
  const after    = segments.slice(fnIdx + 1);
  if (after.length === 0) return { id: null, action: null };
  const first = after[0] ?? '';
  if (UUID_RE.test(first)) return { id: first, action: after[1] ?? null };
  return { id: null, action: first };  // e.g. 'catalog'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleListOfferings(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:package:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const url      = new URL(req.url);
  const page     = Number(url.searchParams.get('page')     ?? '1');
  const perPage  = Number(url.searchParams.get('per_page') ?? '25');
  const from     = (page - 1) * perPage;
  const to       = from + perPage - 1;
  const status   = url.searchParams.get('status') ?? 'active';
  const category = url.searchParams.get('lesson_category');

  // eslint-disable-next-line prefer-const
  let q = client
    .from('package_offerings')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: true })
    .range(from, to);

  if (status !== 'all') q = q.eq('status', status);
  if (category !== null) q = q.eq('lesson_category', category);

  const { data, error, count } = await q;
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0 } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateOffering(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:package:create')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { name, lesson_category, quantity, price } = body;
  if (!name || !lesson_category || !quantity || price === undefined) {
    return err('name, lesson_category, quantity, price are required', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await client
    .from('package_offerings')
    .insert({
      organization_id: orgId,
      catalog_id:      body['catalog_id']       ?? null,
      name,
      description:     body['description']      ?? null,
      package_type:    body['package_type']     ?? 'driving',
      lesson_category,
      quantity:        Number(quantity),
      bundle_credits:  body['bundle_credits']   ?? [],
      price:           Number(price),
      currency:        body['currency']         ?? 'SEK',
      vat_rate:        body['vat_rate']         ?? 0.25,
      validity_days:   body['validity_days']    ?? null,
      sort_order:      body['sort_order']       ?? 0,
      metadata:        body['metadata']         ?? {},
      created_by:      user.id,
    })
    .select()
    .single();

  if (error) return err(error.message, 422, 'INSERT_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetOffering(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:package:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('package_offerings')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) return err(error.message, 500, 'QUERY_FAILED');
  if (data === null) return err('Package offering not found', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpdateOffering(id: string, req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:package:update')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const allowed = ['name', 'description', 'price', 'vat_rate', 'validity_days', 'sort_order', 'metadata'];
  const patch: Record<string, unknown> = { updated_by: user.id };
  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  const { data, error } = await client
    .from('package_offerings')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) return err(error.message, 500, 'UPDATE_FAILED');
  if (data === null) return err('Package offering not found', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleArchiveOffering(id: string, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:package:archive')) return err('Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('package_offerings')
    .update({ status: 'archived', archived_at: new Date().toISOString(), archived_by: user.id })
    .eq('id', id)
    .eq('organization_id', orgId)
    .neq('status', 'archived')
    .select()
    .single();

  if (error) return err(error.message, 500, 'UPDATE_FAILED');
  if (data === null) return err('Package offering not found or already archived', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleListCatalog(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:package:read')) return err('Forbidden', 403, 'FORBIDDEN');

  const category = new URL(req.url).searchParams.get('lesson_category');

  // eslint-disable-next-line prefer-const
  let q = client
    .from('package_catalog')
    .select('*')
    .or(`organization_id.is.null,organization_id.eq.${orgId}`)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (category !== null) q = q.eq('lesson_category', category);

  const { data, error } = await q;
  if (error) return err(error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateCatalogEntry(req: Request, client: any, orgId: string, user: any): Promise<Response> {
  if (!hasPermission(user, 'finance:package:create')) return err('Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { name, lesson_category, default_quantity, default_price } = body;
  if (!name || !lesson_category || !default_quantity || default_price === undefined) {
    return err('name, lesson_category, default_quantity, default_price are required', 400, 'VALIDATION_ERROR');
  }

  const { data, error } = await client
    .from('package_catalog')
    .insert({
      organization_id:  orgId,
      name,
      description:      body['description']     ?? null,
      package_type:     body['package_type']    ?? 'driving',
      lesson_category,
      default_quantity: Number(default_quantity),
      default_price:    Number(default_price),
      currency:         body['currency']        ?? 'SEK',
      vat_rate:         body['vat_rate']        ?? 0.25,
      validity_days:    body['validity_days']   ?? null,
      created_by:       user.id,
    })
    .select()
    .single();

  if (error) return err(error.message, 422, 'INSERT_FAILED');
  return json(data, 201);
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

  // /packages/catalog
  if (id === null && action === 'catalog') {
    if (method === 'GET')  return handleListCatalog(req, client, orgId, user);
    if (method === 'POST') return handleCreateCatalogEntry(req, client, orgId, user);
    return err('Method not allowed', 405);
  }

  // /packages/:id/archive
  if (id !== null && action === 'archive' && method === 'POST') {
    return handleArchiveOffering(id, client, orgId, user);
  }

  // /packages/:id
  if (id !== null && action === null) {
    if (method === 'GET')   return handleGetOffering(id, client, orgId, user);
    if (method === 'PATCH') return handleUpdateOffering(id, req, client, orgId, user);
    return err('Method not allowed', 405);
  }

  // /packages
  if (id === null && action === null) {
    if (method === 'GET')  return handleListOfferings(req, client, orgId, user);
    if (method === 'POST') return handleCreateOffering(req, client, orgId, user);
    return err('Method not allowed', 405);
  }

  return err('Not found', 404);
});
