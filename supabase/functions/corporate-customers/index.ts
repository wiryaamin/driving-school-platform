import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CORP_STATUSES = ['active', 'paused', 'archived'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateSchema = z.object({
  company_name:       z.string().trim().min(1).max(200),
  org_number:         z.string().trim().max(20).optional(),
  address_line1:      z.string().trim().max(200).optional(),
  address_line2:      z.string().trim().max(200).optional(),
  postal_code:        z.string().trim().max(20).optional(),
  city:               z.string().trim().max(100).optional(),
  contact_first_name: z.string().trim().max(100).optional(),
  contact_last_name:  z.string().trim().max(100).optional(),
  contact_email:      z.string().email().max(200).optional(),
  contact_phone:      z.string().trim().max(30).optional(),
  invoice_text:       z.string().trim().max(2000).optional(),
  notes:              z.string().trim().max(2000).optional(),
  status:             z.enum(CORP_STATUSES).optional(),
});

const UpdateSchema = CreateSchema.partial();

const ListQuerySchema = z.object({
  page:     z.coerce.number().int().positive().max(1000).default(1),
  per_page: z.coerce.number().int().positive().max(100).default(25),
  sort_by:  z.string().optional(),
  sort_dir: z.enum(['asc', 'desc']).optional(),
  search:   z.string().min(1).max(200).optional(),
  status:   z.enum(CORP_STATUSES).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JSON_CT = { 'Content-Type': 'application/json' } as const;

function errorResp(ctx: EdgeRequestContext, status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message, trace_id: ctx.correlationId }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId },
  });
}

function successResp<T>(ctx: EdgeRequestContext, data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId },
  });
}

function pagedResp<T>(ctx: EdgeRequestContext, data: T[], total: number, page: number, perPage: number): Response {
  return new Response(
    JSON.stringify({ data, meta: { total, page, per_page: perPage, has_more: page * perPage < total } }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId } }
  );
}

function requirePerm(ctx: EdgeRequestContext, code: string): Response | null {
  if (ctx.isPlatformAdmin) return null;
  if (ctx.organizationId === null) {
    return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  }
  if (!ctx.permissions.includes(code)) {
    return errorResp(ctx, 403, 'FORBIDDEN', `Requires permission: ${code}`);
  }
  return null;
}

function extractId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  return last !== undefined && UUID_RE.test(last) ? last : null;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleList(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'corporate:customer:read');
  if (guard) return guard;

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = ListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query parameters');
  }

  const { page, per_page, sort_by = 'created_at', sort_dir = 'desc', search, status } = parsed.data;
  const client = createSupabaseClient(req);
  const from = (page - 1) * per_page;
  const to = from + per_page - 1;

  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('corporate_customers')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .order(sort_by, { ascending: sort_dir === 'asc' })
    .range(from, to);

  if (status !== undefined) q = q.eq('status', status);
  if (search !== undefined && search !== '') {
    q = q.or(`company_name.ilike.%${search}%,contact_email.ilike.%${search}%,org_number.ilike.%${search}%`);
  }

  const { data, error, count } = await q;
  if (error) {
    logger.error('corp_customers.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to list corporate customers');
  }

  return pagedResp(ctx, data ?? [], count ?? 0, page, per_page);
}

async function handleCreate(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'corporate:customer:create');
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON');
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed');
  }

  const client = createSupabaseClient(req);

  // Duplicate org_number check within same org
  if (parsed.data.org_number) {
    const { data: dup } = await (client as any)
      .from('corporate_customers')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('org_number', parsed.data.org_number)
      .is('deleted_at', null)
      .maybeSingle();
    if (dup) {
      return errorResp(ctx, 409, 'CONFLICT', `A corporate customer with org number ${parsed.data.org_number} already exists`);
    }
  }

  const { data: record, error } = await (client as any)
    .from('corporate_customers')
    .insert({ ...parsed.data, organization_id: ctx.organizationId, created_by: ctx.actorId, updated_by: ctx.actorId })
    .select()
    .single();

  if (error) {
    logger.error('corp_customers.create_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to create corporate customer');
  }

  logger.info('CorporateCustomer.Created', {
    correlation_id: ctx.correlationId, org_id: ctx.organizationId,
    record_id: record.id, actor_id: ctx.actorId,
  });

  return successResp(ctx, record, 201);
}

async function handleGetById(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'corporate:customer:read');
  if (guard) return guard;

  const client = createSupabaseClient(req);
  const { data: record, error } = await (client as any)
    .from('corporate_customers')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch corporate customer');
  }
  if (record === null) {
    return errorResp(ctx, 404, 'NOT_FOUND', `Corporate customer '${id}' not found`);
  }

  return successResp(ctx, record);
}

async function handleUpdate(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'corporate:customer:update');
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON');
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed');
  }

  const client = createSupabaseClient(req);

  const { data: record, error } = await (client as any)
    .from('corporate_customers')
    .update({ ...parsed.data, updated_by: ctx.actorId })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error?.code === 'PGRST116' || record === null) {
    return errorResp(ctx, 404, 'NOT_FOUND', `Corporate customer '${id}' not found`);
  }
  if (error) {
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to update corporate customer');
  }

  logger.info('CorporateCustomer.Updated', {
    correlation_id: ctx.correlationId, org_id: ctx.organizationId,
    record_id: id, actor_id: ctx.actorId,
  });

  return successResp(ctx, record);
}

async function handleArchive(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'corporate:customer:delete');
  if (guard) return guard;

  const client = createSupabaseClient(req);

  const { data: existing } = await (client as any)
    .from('corporate_customers')
    .select('id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) {
    return errorResp(ctx, 404, 'NOT_FOUND', `Corporate customer '${id}' not found`);
  }

  const { error } = await (client as any).rpc('soft_delete', {
    p_table_name: 'corporate_customers',
    p_record_id:  id,
  });

  if (error) {
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to archive corporate customer');
  }

  logger.info('CorporateCustomer.Archived', {
    correlation_id: ctx.correlationId, org_id: ctx.organizationId,
    record_id: id, actor_id: ctx.actorId,
  });

  return new Response(null, { status: 204, headers: { 'X-Correlation-ID': ctx.correlationId } });
}

// ─── Router ───────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  logger.info('request.started', {
    method: req.method, path: new URL(req.url).pathname,
    correlation_id: ctx.correlationId, org_id: ctx.organizationId ?? 'platform',
  });

  const startedAt = Date.now();
  let response: Response;

  try {
    const id = extractId(req);

    if (!id) {
      if (req.method === 'GET')  { response = await handleList(req, ctx); }
      else if (req.method === 'POST') { response = await handleCreate(req, ctx); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found' }),
          { status: 404, headers: JSON_CT }
        );
      }
    } else {
      if (req.method === 'GET')         { response = await handleGetById(req, ctx, id); }
      else if (req.method === 'PATCH')  { response = await handleUpdate(req, ctx, id); }
      else if (req.method === 'DELETE') { response = await handleArchive(req, ctx, id); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found' }),
          { status: 404, headers: JSON_CT }
        );
      }
    }
  } catch (err) {
    logger.error('corp_customers.unhandled_error', {
      correlation_id: ctx.correlationId,
      error: err instanceof Error ? err.message : String(err),
    });
    response = new Response(
      JSON.stringify({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }),
      { status: 500, headers: JSON_CT }
    );
  }

  logger.info('request.completed', {
    method: req.method, status: response.status,
    correlation_id: ctx.correlationId, duration_ms: Date.now() - startedAt,
  });

  return response;
}));
