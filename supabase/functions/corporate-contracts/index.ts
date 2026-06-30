/**
 * corporate-contracts — Corporate contract persistence.
 *
 * Routes:
 *   GET   /corporate-contracts?corporate_customer_id=:id   — list contracts for a company
 *   POST  /corporate-contracts                              — create contract
 *   PATCH /corporate-contracts/:id                         — update contract
 *   DELETE /corporate-contracts/:id                        — soft-delete (archive)
 */

import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateSchema = z.object({
  corporate_customer_id: z.string().uuid(),
  name:                  z.string().trim().min(1).max(200),
  er_ref:                z.string().trim().max(200).optional(),
  payment_terms_days:    z.coerce.number().int().min(0).optional(),
  credit_limit_sek:      z.coerce.number().min(0).optional(),
  discount_pct:          z.coerce.number().min(0).max(100).optional(),
  is_active:             z.boolean().optional().default(true),
  comment:               z.string().trim().max(5000).optional(),
  contact_email:         z.string().trim().max(200).optional(),
  contact_name:          z.string().trim().max(200).optional(),
  contact_phone:         z.string().trim().max(50).optional(),
});

const UpdateSchema = CreateSchema.omit({ corporate_customer_id: true }).partial();

const ListQuerySchema = z.object({
  corporate_customer_id: z.string().uuid(),
  page:                  z.coerce.number().int().positive().max(1000).default(1),
  per_page:              z.coerce.number().int().positive().max(100).default(50),
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

function pagedResp<T>(
  ctx: EdgeRequestContext, data: T[], total: number, page: number, perPage: number,
): Response {
  return new Response(
    JSON.stringify({ data, meta: { total, page, per_page: perPage, has_more: page * perPage < total } }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId } },
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleList(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'corporate:contract:read');
  if (guard) return guard;

  const raw    = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = ListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'corporate_customer_id (UUID) is required');
  }

  const { corporate_customer_id, page, per_page } = parsed.data;
  const client = createSupabaseClient(req);
  const from   = (page - 1) * per_page;
  const to     = from + per_page - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error, count } = await (client as any)
    .from('corporate_contracts')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .eq('corporate_customer_id', corporate_customer_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    logger.error('corp_contracts.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to list contracts');
  }

  return pagedResp(ctx, data ?? [], count ?? 0, page, per_page);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreate(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'corporate:contract:create');
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: record, error } = await (client as any)
    .from('corporate_contracts')
    .insert({
      ...parsed.data,
      organization_id: ctx.organizationId,
      created_by:      ctx.actorId,
      updated_by:      ctx.actorId,
    })
    .select()
    .single();

  if (error) {
    logger.error('corp_contracts.create_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to create contract');
  }

  logger.info('CorporateContract.Created', {
    correlation_id: ctx.correlationId, org_id: ctx.organizationId,
    record_id: record.id, actor_id: ctx.actorId,
  });

  return successResp(ctx, record, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpdate(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'corporate:contract:update');
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: record, error } = await (client as any)
    .from('corporate_contracts')
    .update({ ...parsed.data, updated_at: new Date().toISOString(), updated_by: ctx.actorId })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error?.code === 'PGRST116' || record === null) {
    return errorResp(ctx, 404, 'NOT_FOUND', `Contract '${id}' not found`);
  }
  if (error) {
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to update contract');
  }

  logger.info('CorporateContract.Updated', {
    correlation_id: ctx.correlationId, org_id: ctx.organizationId,
    record_id: id, actor_id: ctx.actorId,
  });

  return successResp(ctx, record);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleArchive(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'corporate:contract:delete');
  if (guard) return guard;

  const client = createSupabaseClient(req);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (client as any)
    .from('corporate_contracts')
    .select('id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) {
    return errorResp(ctx, 404, 'NOT_FOUND', `Contract '${id}' not found`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from('corporate_contracts')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.actorId })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId);

  if (error) {
    logger.error('corp_contracts.archive_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to archive contract');
  }

  logger.info('CorporateContract.Archived', {
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
      if (req.method === 'GET')       { response = await handleList(req, ctx); }
      else if (req.method === 'POST') { response = await handleCreate(req, ctx); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found' }),
          { status: 404, headers: JSON_CT },
        );
      }
    } else {
      if (req.method === 'PATCH')        { response = await handleUpdate(req, ctx, id); }
      else if (req.method === 'DELETE')  { response = await handleArchive(req, ctx, id); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found' }),
          { status: 404, headers: JSON_CT },
        );
      }
    }
  } catch (err) {
    logger.error('corp_contracts.unhandled_error', {
      correlation_id: ctx.correlationId,
      error: err instanceof Error ? err.message : String(err),
    });
    response = new Response(
      JSON.stringify({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }),
      { status: 500, headers: JSON_CT },
    );
  }

  logger.info('request.completed', {
    method: req.method, status: response.status,
    correlation_id: ctx.correlationId, duration_ms: Date.now() - startedAt,
  });

  return response;
}));
