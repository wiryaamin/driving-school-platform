import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import { createInstructorRecord, resolvePersonnummer } from '../_shared/instructor-provisioning.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

// ─── Inline Zod schemas (Deno can't import workspace packages) ───────────────

const EMPLOYMENT_TYPES = ['employed', 'contractor', 'external', 'on_leave', 'inactive'] as const;
const IDENTITY_TYPES   = ['personnummer', 'samordningsnummer', 'passport', 'national_id', 'none'] as const;
const PERSONNUMMER_HASH_RE = /^[a-f0-9]{64}$/i;
const PERSONNUMMER_RE = /^\d{8}-?\d{4}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateInstructorSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name:  z.string().trim().min(1).max(100),
  email:      z.string().email(),

  phone:         z.string().max(30).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),

  // Raw personnummer (YYYYMMDD-XXXX, dash optional) — never persisted as-is;
  // handleCreate/handleUpdate turn it into personnummer_encrypted/_hash/_last4
  // via _shared/bankid-crypto.ts before hitting the database.
  personnummer: z.string().regex(PERSONNUMMER_RE, 'Format: YYYYMMDD-XXXX').optional(),

  identity_type:          z.enum(IDENTITY_TYPES).optional(),
  personnummer_encrypted:  z.string().optional(),
  personnummer_hash:       z.string().regex(PERSONNUMMER_HASH_RE, 'Must be SHA-256 hex').optional(),
  personnummer_last4:      z.string().regex(/^\d{4}$/).optional(),

  employment_type:       z.enum(EMPLOYMENT_TYPES).optional(),
  employment_started_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  employment_ended_at:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  employee_number:       z.string().max(50).optional(),

  teaching_categories: z.array(z.string().min(1).max(10)).min(1).optional(),
  adi_number:          z.string().max(50).optional(),
  adi_valid_until:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),

  primary_location_id: z.string().uuid().optional(),
  languages_spoken:    z.array(z.string().min(1).max(50)).optional(),
  max_lessons_per_day: z.number().int().positive().max(20).optional(),

  // ── Overview page profile fields ──────────────────────────────────────────
  address_line1:                z.string().max(200).optional(),
  postal_code:                  z.string().max(20).optional(),
  city:                         z.string().max(100).optional(),
  bio:                          z.string().max(2000).optional(),
  emergency_contact_first_name: z.string().max(100).optional(),
  emergency_contact_last_name:  z.string().max(100).optional(),
  emergency_contact_email:      z.string().email().max(200).optional(),
  emergency_contact_phone:      z.string().max(30).optional(),
  sort_order:                   z.number().int().min(0).optional(),
  show_in_booking:              z.boolean().optional(),
  show_in_ecommerce:            z.boolean().optional(),
  show_on_website:              z.boolean().optional(),
});

const UpdateInstructorSchema = CreateInstructorSchema.partial().extend({
  email: z.string().email().optional(),
});

const InstructorListQuerySchema = z.object({
  page:             z.coerce.number().int().positive().max(1000).default(1),
  per_page:         z.coerce.number().int().positive().max(500).default(25),
  sort_by:          z.string().optional(),
  sort_dir:         z.enum(['asc', 'desc']).optional(),
  search:           z.string().min(1).max(200).optional(),
  employment_type:  z.enum(EMPLOYMENT_TYPES).optional(),
  teaching_category: z.string().max(10).optional(),
  location_id:      z.string().uuid().optional(),
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
  const body: Record<string, unknown> = { code, message, trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 };
  if (details !== undefined) body['details'] = details;
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

function successResp<T>(ctx: EdgeRequestContext, data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
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
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
  );
}

function requirePerm(ctx: EdgeRequestContext, code: string): Response | null {
  if (ctx.organizationId === null) {
    return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  }
  if (ctx.isPlatformAdmin) return null;
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

// instructors:instructor:read is held not just by org_owner/org_admin/
// org_manager/instructor_senior but also, as of
// 20260720000002_fix_instructor_read_rbac_gap.sql, the plain 'instructor'
// role — deliberately, so the instructor dashboard's "Lärarstatus" widget
// (name/employment_type/teaching_categories of colleagues) can render. That
// grant was never meant to also hand a colleague-level caller the same
// personnummer_last4/date_of_birth/employee_number every admin surface
// exposes — select('*') did that as an unintended side effect. No RBAC
// change here: this only trims the response for that one specific role,
// same PII these fields already represent for students (see the
// students:pii:read split), reusing the role signal already on ctx rather
// than introducing a new permission.
const INSTRUCTOR_PII_FIELDS = [
  'identity_type', 'personnummer_encrypted', 'personnummer_hash',
  'personnummer_last4', 'date_of_birth', 'employee_number',
] as const;

function stripInstructorPiiForPeers<T extends Record<string, unknown>>(ctx: EdgeRequestContext, row: T): T {
  if (ctx.actorRole !== 'instructor') return row;
  const stripped = { ...row };
  for (const f of INSTRUCTOR_PII_FIELDS) delete stripped[f];
  return stripped;
}

async function handleList(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'instructors:instructor:read');
  if (guard) return guard;

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = InstructorListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query parameters', parsed.error.issues);
  }

  const {
    page, per_page, sort_by = 'last_name', sort_dir = 'asc',
    search, employment_type, teaching_category, location_id,
  } = parsed.data;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const from = (page - 1) * per_page;
  const to   = from + per_page - 1;

  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('instructors')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .order(sort_by, { ascending: sort_dir === 'asc' })
    .range(from, to);

  if (employment_type !== undefined) q = q.eq('employment_type', employment_type);
  if (location_id     !== undefined) q = q.eq('primary_location_id', location_id);
  if (teaching_category !== undefined) q = q.contains('teaching_categories', [teaching_category]);
  if (search !== undefined && search !== '') {
    q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data, error, count } = await q;

  if (error) {
    logger.error('instructors.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to list instructors');
  }

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map(r => stripInstructorPiiForPeers(ctx, r));
  return pagedResp(ctx, rows, count ?? 0, page, per_page);
}

async function handleCreate(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'instructors:instructor:create');
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON');
  }

  const parsed = CreateInstructorSchema.safeParse(body);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);
  }

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const result = await createInstructorRecord(client, ctx.organizationId as string, parsed.data, ctx.actorId);

  if (!result.ok) {
    logger.error('instructors.create_failed', { correlation_id: ctx.correlationId, code: result.code, error: result.message });
    if (result.code === 'DUPLICATE_EMAIL' || result.code === 'DUPLICATE_PERSONAL_NUMBER') {
      return errorResp(ctx, 409, result.code === 'DUPLICATE_EMAIL' ? 'CONFLICT' : 'DUPLICATE_PERSONAL_NUMBER', result.message);
    }
    if (result.code === 'IDENTITY_CRYPTO_NOT_CONFIGURED') {
      return errorResp(ctx, 500, 'INTERNAL_ERROR', result.message);
    }
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to create instructor');
  }

  logger.info('Instructor.Created', {
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    instructor_id:  result.instructor['id'],
    actor_id:       ctx.actorId,
  });

  return successResp(ctx, result.instructor, 201);
}

async function handleGetById(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'instructors:instructor:read');
  if (guard) return guard;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const { data: instructor, error } = await (client as any)
    .from('instructors')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error('instructors.get_failed', { correlation_id: ctx.correlationId, error: error.message, instructor_id: id });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch instructor');
  }
  if (instructor === null) {
    return errorResp(ctx, 404, 'NOT_FOUND', `Instructor '${id}' not found`);
  }

  return successResp(ctx, stripInstructorPiiForPeers(ctx, instructor as Record<string, unknown>));
}

async function handleUpdate(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'instructors:instructor:update');
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON');
  }

  const parsed = UpdateInstructorSchema.safeParse(body);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);
  }

  const pnrResult = await resolvePersonnummer(parsed.data);
  if (!pnrResult.ok) return errorResp(ctx, 500, 'INTERNAL_ERROR', pnrResult.message);
  const dto = pnrResult.dto as Record<string, unknown> & { email?: string; personnummer_hash?: string };
  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  if (dto.email !== undefined) {
    const { data: dup } = await (client as any)
      .from('instructors')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('email', dto.email)
      .is('deleted_at', null)
      .maybeSingle();

    if (dup !== null && dup.id !== id) {
      return errorResp(ctx, 409, 'CONFLICT', `An instructor with email ${dto.email} already exists in this organisation`);
    }
  }

  if (dto.personnummer_hash !== undefined) {
    const { data: dup } = await (client as any)
      .from('instructors')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('personnummer_hash', dto.personnummer_hash)
      .is('deleted_at', null)
      .maybeSingle();

    if (dup !== null && dup.id !== id) {
      return errorResp(ctx, 409, 'DUPLICATE_PERSONAL_NUMBER', 'An instructor with this personnummer is already registered in this organisation');
    }
  }

  const { data: instructor, error } = await (client as any)
    .from('instructors')
    .update({ ...dto, updated_by: ctx.actorId })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    logger.error('instructors.update_failed', { correlation_id: ctx.correlationId, error: error.message, instructor_id: id });
    if (error.code === 'PGRST116') {
      return errorResp(ctx, 404, 'NOT_FOUND', `Instructor '${id}' not found`);
    }
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to update instructor');
  }
  if (instructor === null) {
    return errorResp(ctx, 404, 'NOT_FOUND', `Instructor '${id}' not found`);
  }

  logger.info('Instructor.Updated', {
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    instructor_id:  id,
    actor_id:       ctx.actorId,
  });

  return successResp(ctx, instructor);
}

async function handleArchive(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'instructors:instructor:delete');
  if (guard) return guard;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  const { data: existing } = await (client as any)
    .from('instructors')
    .select('id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) {
    return errorResp(ctx, 404, 'NOT_FOUND', `Instructor '${id}' not found`);
  }

  const { error } = await (client as any).rpc('soft_delete', {
    p_table_name: 'instructors',
    p_record_id:  id,
  });

  if (error) {
    logger.error('instructors.archive_failed', { correlation_id: ctx.correlationId, error: error.message, instructor_id: id });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to archive instructor');
  }

  logger.info('Instructor.Archived', {
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    instructor_id:  id,
    actor_id:       ctx.actorId,
  });

  return new Response(null, {
    status: 204,
    headers: { 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId },
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => serveCors(req, async () => {
  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  if (req.method !== 'GET') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
  }

  logger.info('request.started', {
    method:         req.method,
    path:           new URL(req.url).pathname,
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId ?? 'platform',
    actor_id:       ctx.actorId,
  });

  const startedAt = Date.now();
  let response: Response;

  try {
    const id = extractId(req);

    if (!id) {
      if (req.method === 'GET')        { response = await handleList(req, ctx); }
      else if (req.method === 'POST')  { response = await handleCreate(req, ctx); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
          { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
        );
      }
    } else {
      if (req.method === 'GET')         { response = await handleGetById(req, ctx, id); }
      else if (req.method === 'PATCH')  { response = await handleUpdate(req, ctx, id); }
      else if (req.method === 'DELETE') { response = await handleArchive(req, ctx, id); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
          { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
        );
      }
    }
  } catch (err) {
    logger.error('instructors.unhandled_error', {
      correlation_id: ctx.correlationId,
      error:  err instanceof Error ? err.message : String(err),
      stack:  err instanceof Error ? err.stack : undefined,
    });
    response = new Response(
      JSON.stringify({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
      { status: 500, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
    );
  }

  logger.info('request.completed', {
    method:         req.method,
    path:           new URL(req.url).pathname,
    status:         response.status,
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    duration_ms:    Date.now() - startedAt,
  });

  return response;
}));
