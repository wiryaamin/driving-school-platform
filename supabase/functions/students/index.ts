import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

// ─── Inline Zod schemas (Deno can't import workspace packages) ───────────────

const STUDENT_STATUSES = ['lead', 'onboarding', 'active', 'paused', 'completed', 'withdrawn', 'archived'] as const;
const PERMIT_STAGES = ['not_started', 'theory_study', 'risk1_booked', 'risk1_completed', 'risk2_booked', 'risk2_completed', 'theory_exam_booked', 'theory_passed', 'practical_exam_booked', 'practical_passed', 'licence_issued'] as const;
const IDENTITY_TYPES = ['personnummer', 'samordningsnummer', 'passport', 'national_id', 'none'] as const;
const PERSONNUMMER_HASH_RE = /^[a-f0-9]{64}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateStudentSchema = z.object({
  first_name:  z.string().trim().min(1).max(100),
  last_name:   z.string().trim().min(1).max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  identity_type:          z.enum(IDENTITY_TYPES).optional(),
  personnummer_encrypted:  z.string().optional(),
  personnummer_hash:       z.string().regex(PERSONNUMMER_HASH_RE, 'Must be SHA-256 hex').optional(),
  personnummer_last4:      z.string().regex(/^\d{4}$/).optional(),
  email:         z.string().email().optional(),
  phone:         z.string().max(30).optional(),
  address_line1: z.string().max(200).optional(),
  address_line2: z.string().max(200).optional(),
  postal_code:   z.string().max(20).optional(),
  city:          z.string().max(100).optional(),
  preferred_language:         z.enum(['sv', 'en']).optional(),
  communication_opt_in_email: z.boolean().optional(),
  communication_opt_in_sms:   z.boolean().optional(),
  data_processing_consent: z.boolean().optional(),
  marketing_consent:       z.boolean().optional(),
  gdpr_consent_given_at:   z.string().datetime({ offset: true }).optional(),
  gdpr_consent_version:    z.string().max(50).optional(),
  status:                  z.enum(STUDENT_STATUSES).optional(),
  enrolled_at:             z.string().datetime({ offset: true }).optional(),
  enrollment_location_id:  z.string().uuid().optional(),
  assigned_instructor_id:  z.string().uuid().optional(),
  target_licence_category: z.string().max(10).optional(),
  permit_stage:            z.enum(PERMIT_STAGES).optional(),
});

const UpdateStudentSchema = CreateStudentSchema.partial();

const StudentListQuerySchema = z.object({
  page:             z.coerce.number().int().positive().max(1000).default(1),
  per_page:         z.coerce.number().int().positive().max(100).default(25),
  sort_by:          z.string().optional(),
  sort_dir:         z.enum(['asc', 'desc']).optional(),
  search:           z.string().min(1).max(200).optional(),
  status:           z.enum(STUDENT_STATUSES).optional(),
  instructor_id:    z.string().uuid().optional(),
  permit_stage:     z.enum(PERMIT_STAGES).optional(),
  licence_category: z.string().max(10).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JSON_CT = { 'Content-Type': 'application/json' } as const;

function errorResp(
  ctx: EdgeRequestContext,
  status: number,
  code: string,
  message: string,
  details?: unknown
): Response {
  const body: Record<string, unknown> = { code, message, trace_id: ctx.correlationId };
  if (details !== undefined) body['details'] = details;
  return new Response(JSON.stringify(body), {
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
  ctx: EdgeRequestContext,
  data: T[],
  total: number,
  page: number,
  perPage: number
): Response {
  return new Response(
    JSON.stringify({
      data,
      meta: { total, page, per_page: perPage, has_more: page * perPage < total },
    }),
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

// ─── Route Handlers ───────────────────────────────────────────────────────────

async function handleList(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'students:student:read');
  if (guard) return guard;

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = StudentListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query parameters', parsed.error.issues);
  }

  const {
    page, per_page, sort_by = 'created_at', sort_dir = 'desc',
    search, status, instructor_id, permit_stage, licence_category,
  } = parsed.data;

  const client = createSupabaseClient(req);
  const from = (page - 1) * per_page;
  const to   = from + per_page - 1;

  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('students')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .order(sort_by, { ascending: sort_dir === 'asc' })
    .range(from, to);

  if (status !== undefined)           q = q.eq('status', status);
  if (instructor_id !== undefined)    q = q.eq('assigned_instructor_id', instructor_id);
  if (permit_stage !== undefined)     q = q.eq('permit_stage', permit_stage);
  if (licence_category !== undefined) q = q.eq('target_licence_category', licence_category);
  if (search !== undefined && search !== '') {
    q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error, count } = await q;

  if (error) {
    logger.error('students.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to list students');
  }

  return pagedResp(ctx, data ?? [], count ?? 0, page, per_page);
}

async function handleCreate(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'students:student:create');
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON');
  }

  const parsed = CreateStudentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);
  }

  const dto = parsed.data;
  const client = createSupabaseClient(req);

  // Duplicate checks in parallel
  const [emailDup, pnrDup] = await Promise.all([
    dto.email !== undefined
      ? (client as any)
          .from('students')
          .select('id')
          .eq('organization_id', ctx.organizationId)
          .eq('email', dto.email)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    dto.personnummer_hash !== undefined
      ? (client as any)
          .from('students')
          .select('id')
          .eq('organization_id', ctx.organizationId)
          .eq('personnummer_hash', dto.personnummer_hash)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (dto.email !== undefined && emailDup.data !== null) {
    return errorResp(ctx, 409, 'CONFLICT', `A student with email ${dto.email} already exists in this organisation`);
  }
  if (dto.personnummer_hash !== undefined && pnrDup.data !== null) {
    return errorResp(ctx, 409, 'DUPLICATE_PERSONAL_NUMBER', 'A student with this personnummer is already registered in this organisation');
  }

  const { data: student, error } = await (client as any)
    .from('students')
    .insert({ ...dto, organization_id: ctx.organizationId, created_by: ctx.actorId, updated_by: ctx.actorId })
    .select()
    .single();

  if (error) {
    logger.error('students.create_failed', { correlation_id: ctx.correlationId, error: error.message });
    if (error.code === '23505') {
      return errorResp(ctx, 409, 'CONFLICT', 'Student record already exists (unique constraint violation)');
    }
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to create student');
  }

  logger.info('Student.Created', {
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    student_id:     student.id,
    actor_id:       ctx.actorId,
  });

  return successResp(ctx, student, 201);
}

async function handleBatch(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'students:student:read');
  if (guard) return guard;

  const idsParam = new URL(req.url).searchParams.get('ids') ?? '';
  const ids = idsParam.split(',').map(s => s.trim()).filter(s => UUID_RE.test(s));

  if (ids.length === 0) {
    return successResp(ctx, []);
  }
  if (ids.length > 50) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'ids parameter supports a maximum of 50 IDs');
  }

  const client = createSupabaseClient(req);
  const { data, error } = await (client as any)
    .from('students')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .in('id', ids);

  if (error) {
    logger.error('students.batch_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch students');
  }

  return successResp(ctx, data ?? []);
}

async function handleGetById(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'students:student:read');
  if (guard) return guard;

  const client = createSupabaseClient(req);
  const { data: student, error } = await (client as any)
    .from('students')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error('students.get_failed', { correlation_id: ctx.correlationId, error: error.message, student_id: id });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch student');
  }
  if (student === null) {
    return errorResp(ctx, 404, 'NOT_FOUND', `Student '${id}' not found`);
  }

  return successResp(ctx, student);
}

async function handleUpdate(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'students:student:update');
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON');
  }

  const parsed = UpdateStudentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);
  }

  const dto = parsed.data;
  const client = createSupabaseClient(req);

  // Duplicate checks for mutable unique fields (parallel)
  const [emailDup, pnrDup] = await Promise.all([
    dto.email !== undefined
      ? (client as any)
          .from('students')
          .select('id')
          .eq('organization_id', ctx.organizationId)
          .eq('email', dto.email)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    dto.personnummer_hash !== undefined
      ? (client as any)
          .from('students')
          .select('id')
          .eq('organization_id', ctx.organizationId)
          .eq('personnummer_hash', dto.personnummer_hash)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (dto.email !== undefined && emailDup.data !== null && emailDup.data.id !== id) {
    return errorResp(ctx, 409, 'CONFLICT', `A student with email ${dto.email} already exists in this organisation`);
  }
  if (dto.personnummer_hash !== undefined && pnrDup.data !== null && pnrDup.data.id !== id) {
    return errorResp(ctx, 409, 'DUPLICATE_PERSONAL_NUMBER', 'A student with this personnummer is already registered in this organisation');
  }

  const { data: student, error } = await (client as any)
    .from('students')
    .update({ ...dto, updated_by: ctx.actorId })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    logger.error('students.update_failed', { correlation_id: ctx.correlationId, error: error.message, student_id: id });
    if (error.code === 'PGRST116') {
      return errorResp(ctx, 404, 'NOT_FOUND', `Student '${id}' not found`);
    }
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to update student');
  }
  if (student === null) {
    return errorResp(ctx, 404, 'NOT_FOUND', `Student '${id}' not found`);
  }

  logger.info('Student.Updated', {
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    student_id:     id,
    actor_id:       ctx.actorId,
  });

  return successResp(ctx, student);
}

async function handleArchive(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'students:student:delete');
  if (guard) return guard;

  const client = createSupabaseClient(req);

  // Verify the student exists before soft-deleting via RPC
  const { data: existing } = await (client as any)
    .from('students')
    .select('id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) {
    return errorResp(ctx, 404, 'NOT_FOUND', `Student '${id}' not found`);
  }

  const { error } = await (client as any).rpc('soft_delete', {
    p_table_name: 'students',
    p_record_id:  id,
  });

  if (error) {
    logger.error('students.archive_failed', { correlation_id: ctx.correlationId, error: error.message, student_id: id });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to archive student');
  }

  logger.info('Student.Archived', {
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    student_id:     id,
    actor_id:       ctx.actorId,
  });

  return new Response(null, {
    status: 204,
    headers: { 'X-Correlation-ID': ctx.correlationId },
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  logger.info('request.started', {
    method:         req.method,
    path:           new URL(req.url).pathname,
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId ?? 'platform',
    actor_id:       ctx.actorId,
  });

  const startedAt = Date.now();
  let response: Response;

  try {
    const id = extractId(req);

    if (!id) {
      // Collection routes
      const idsParam = new URL(req.url).searchParams.get('ids');
      if (req.method === 'GET' && idsParam !== null) { response = await handleBatch(req, ctx); }
      else if (req.method === 'GET')  { response = await handleList(req, ctx); }
      else if (req.method === 'POST') { response = await handleCreate(req, ctx); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', trace_id: ctx.correlationId }),
          { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId } }
        );
      }
    } else {
      // Single-resource routes
      if (req.method === 'GET')         { response = await handleGetById(req, ctx, id); }
      else if (req.method === 'PATCH')  { response = await handleUpdate(req, ctx, id); }
      else if (req.method === 'DELETE') { response = await handleArchive(req, ctx, id); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', trace_id: ctx.correlationId }),
          { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId } }
        );
      }
    }
  } catch (err) {
    logger.error('students.unhandled_error', {
      correlation_id: ctx.correlationId,
      error:  err instanceof Error ? err.message : String(err),
      stack:  err instanceof Error ? err.stack : undefined,
    });
    response = new Response(
      JSON.stringify({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', trace_id: ctx.correlationId }),
      { status: 500, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId } }
    );
  }

  logger.info('request.completed', {
    method:         req.method,
    path:           new URL(req.url).pathname,
    status:         response.status,
    correlation_id: ctx.correlationId,
    duration_ms:    Date.now() - startedAt,
  });

  return response;
}));
