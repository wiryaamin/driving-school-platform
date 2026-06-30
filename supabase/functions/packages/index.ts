/**
 * packages — Package catalog and offerings management.
 *
 * Routes:
 *   GET    /packages                  — list offerings
 *   POST   /packages                  — create offering
 *   GET    /packages/:id              — get offering detail
 *   PATCH  /packages/:id              — update offering
 *   POST   /packages/:id/archive      — archive offering
 *   POST   /packages/:id/activate     — restore archived offering to active
 *   GET    /packages/catalog          — list catalog entries
 *   POST   /packages/catalog          — create catalog entry
 */

import { serveCors }            from '../_shared/cors.ts';
import { buildEdgeContext }     from '../_shared/context.ts';
import { createSupabaseClient }  from '../_shared/supabase.ts';
import { createFunctionLogger }  from '../_shared/logger.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

const log     = createFunctionLogger('packages');
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
  const fnIdx    = segments.findLastIndex((s) => s === 'packages');
  const after    = segments.slice(fnIdx + 1);
  if (after.length === 0) return { id: null, action: null };
  const first = after[0] ?? '';
  if (UUID_RE.test(first)) return { id: first, action: after[1] ?? null };
  return { id: null, action: first };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleListOfferings(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:package:read');
  if (guard) return guard;

  const url        = new URL(req.url);
  const page       = Math.max(1, Number(url.searchParams.get('page')     ?? '1'));
  const perPage    = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page') ?? '25')));
  const from       = (page - 1) * perPage;
  const to         = from + perPage - 1;
  const status     = url.searchParams.get('status') ?? 'active';
  const category   = url.searchParams.get('lesson_category');
  const visibility = url.searchParams.get('visibility');
  const featured   = url.searchParams.get('featured');

  // eslint-disable-next-line prefer-const
  let q = client
    .from('package_offerings')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .order('sort_order', { ascending: true })
    .range(from, to);

  if (status !== 'all')     q = q.eq('status',          status);
  if (category !== null)    q = q.eq('lesson_category', category);
  if (visibility !== null)  q = q.eq('visibility',      visibility);
  if (featured === 'true')  q = q.eq('featured',        true);

  const { data, error, count } = await q;
  if (error) {
    log.error('packages.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to list packages');
  }

  return new Response(
    JSON.stringify({ data: data ?? [], meta: { page, per_page: perPage, total: count ?? 0, has_more: page * perPage < (count ?? 0) } }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId } }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateOffering(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:package:create');
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const { name, lesson_category, quantity, price } = body;
  if (!name || !lesson_category || !quantity || price === undefined) {
    return fail(ctx, 422, 'VALIDATION_ERROR', 'name, lesson_category, quantity, price are required');
  }

  const { data, error } = await client
    .from('package_offerings')
    .insert({
      organization_id: ctx.organizationId,
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
      package_code:    body['package_code']     ?? null,
      visibility:      body['visibility']       ?? 'internal',
      featured:        body['featured']         ?? false,
      internal_notes:  body['internal_notes']   ?? null,
      created_by:      ctx.actorId,
    })
    .select()
    .single();

  if (error) {
    log.error('packages.create_failed', { correlation_id: ctx.correlationId, error: error.message });
    return fail(ctx, 422, 'INTERNAL_ERROR', 'Failed to create package offering');
  }

  log.info('Package.OfferingCreated', { correlation_id: ctx.correlationId, org_id: ctx.organizationId, actor_id: ctx.actorId });
  return ok(ctx, data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetOffering(id: string, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:package:read');
  if (guard) return guard;

  const { data, error } = await client
    .from('package_offerings')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  if (error) {
    log.error('packages.get_failed', { correlation_id: ctx.correlationId, error: error.message, offering_id: id });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch package offering');
  }
  if (data === null) return fail(ctx, 404, 'NOT_FOUND', `Package offering '${id}' not found`);
  return ok(ctx, data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpdateOffering(id: string, req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:package:update');
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const allowed = [
    'name', 'description', 'price', 'vat_rate', 'validity_days', 'sort_order', 'metadata',
    'package_code', 'visibility', 'featured', 'internal_notes',
  ];
  const patch: Record<string, unknown> = { updated_by: ctx.actorId };
  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  const { data, error } = await client
    .from('package_offerings')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select()
    .single();

  if (error) {
    log.error('packages.update_failed', { correlation_id: ctx.correlationId, error: error.message, offering_id: id });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to update package offering');
  }
  if (data === null) return fail(ctx, 404, 'NOT_FOUND', `Package offering '${id}' not found`);
  return ok(ctx, data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleArchiveOffering(id: string, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:package:archive');
  if (guard) return guard;

  const { data, error } = await client
    .from('package_offerings')
    .update({ status: 'archived', archived_at: new Date().toISOString(), archived_by: ctx.actorId })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .neq('status', 'archived')
    .select()
    .single();

  if (error) {
    log.error('packages.archive_failed', { correlation_id: ctx.correlationId, error: error.message, offering_id: id });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to archive package offering');
  }
  if (data === null) return fail(ctx, 404, 'NOT_FOUND', 'Package offering not found or already archived');

  log.info('Package.OfferingArchived', { correlation_id: ctx.correlationId, org_id: ctx.organizationId, offering_id: id, actor_id: ctx.actorId });
  return ok(ctx, data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleActivateOffering(id: string, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:package:update');
  if (guard) return guard;

  const { data, error } = await client
    .from('package_offerings')
    .update({ status: 'active', archived_at: null, archived_by: null, updated_by: ctx.actorId })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'archived')
    .select()
    .single();

  if (error) {
    log.error('packages.activate_failed', { correlation_id: ctx.correlationId, error: error.message, offering_id: id });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to activate package offering');
  }
  if (data === null) return fail(ctx, 404, 'NOT_FOUND', 'Package offering not found or not archived');
  return ok(ctx, data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleListCatalog(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:package:read');
  if (guard) return guard;

  const category = new URL(req.url).searchParams.get('lesson_category');

  // eslint-disable-next-line prefer-const
  let q = client
    .from('package_catalog')
    .select('*')
    .or(`organization_id.is.null,organization_id.eq.${ctx.organizationId}`)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (category !== null) q = q.eq('lesson_category', category);

  const { data, error } = await q;
  if (error) {
    log.error('packages.catalog_list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return fail(ctx, 500, 'INTERNAL_ERROR', 'Failed to list catalog');
  }
  return new Response(
    JSON.stringify({ data: data ?? [] }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId } }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateCatalogEntry(req: Request, ctx: EdgeRequestContext, client: any): Promise<Response> {
  const guard = requirePerm(ctx, 'finance:package:create');
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const { name, lesson_category, default_quantity, default_price } = body;
  if (!name || !lesson_category || !default_quantity || default_price === undefined) {
    return fail(ctx, 422, 'VALIDATION_ERROR', 'name, lesson_category, default_quantity, default_price are required');
  }

  const { data, error } = await client
    .from('package_catalog')
    .insert({
      organization_id:  ctx.organizationId,
      name,
      description:      body['description']     ?? null,
      package_type:     body['package_type']    ?? 'driving',
      lesson_category,
      default_quantity: Number(default_quantity),
      default_price:    Number(default_price),
      currency:         body['currency']        ?? 'SEK',
      vat_rate:         body['vat_rate']        ?? 0.25,
      validity_days:    body['validity_days']   ?? null,
      created_by:       ctx.actorId,
    })
    .select()
    .single();

  if (error) {
    log.error('packages.catalog_create_failed', { correlation_id: ctx.correlationId, error: error.message });
    return fail(ctx, 422, 'INTERNAL_ERROR', 'Failed to create catalog entry');
  }
  return ok(ctx, data, 201);
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
    if (id === null && action === 'catalog') {
      if (method === 'GET')       { response = await handleListCatalog(req, ctx, client); }
      else if (method === 'POST') { response = await handleCreateCatalogEntry(req, ctx, client); }
      else                        { response = fail(ctx, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed'); }
    } else if (id !== null && action === 'archive'  && method === 'POST') {
      response = await handleArchiveOffering(id, ctx, client);
    } else if (id !== null && action === 'activate' && method === 'POST') {
      response = await handleActivateOffering(id, ctx, client);
    } else if (id !== null && action === null) {
      if (method === 'GET')         { response = await handleGetOffering(id, ctx, client); }
      else if (method === 'PATCH')  { response = await handleUpdateOffering(id, req, ctx, client); }
      else                          { response = fail(ctx, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed'); }
    } else if (id === null && action === null) {
      if (method === 'GET')         { response = await handleListOfferings(req, ctx, client); }
      else if (method === 'POST')   { response = await handleCreateOffering(req, ctx, client); }
      else                          { response = fail(ctx, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed'); }
    } else {
      response = fail(ctx, 404, 'NOT_FOUND', 'Route not found');
    }
  } catch (err) {
    log.error('packages.unhandled_error', {
      correlation_id: ctx.correlationId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack   : undefined,
    });
    response = fail(ctx, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }

  log.requestCompleted(req, response.status, ctx.correlationId, ctx.startedAt);
  return response;
}));
