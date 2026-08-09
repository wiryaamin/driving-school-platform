import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import { performPersonLookup, getPersonLookupStatus, isValidPersonnummerFormat } from '../_shared/person-lookup-service.ts';
import { hashPersonalNumber, identityCryptoConfigured } from '../_shared/bankid-crypto.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

// ─── Inline Zod schemas (Deno can't import workspace packages) ───────────────

const STUDENT_STATUSES = ['lead', 'onboarding', 'active', 'paused', 'completed', 'withdrawn', 'archived'] as const;
const PERMIT_STAGES = ['not_started', 'theory_study', 'risk1_booked', 'risk1_completed', 'risk2_booked', 'risk2_completed', 'theory_exam_booked', 'theory_passed', 'practical_exam_booked', 'practical_passed', 'licence_issued'] as const;
const IDENTITY_TYPES = ['personnummer', 'samordningsnummer', 'passport', 'national_id', 'none'] as const;
const PERSONNUMMER_HASH_RE = /^[a-f0-9]{64}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Server-side personnummer hash (Action 5) ─────────────────────────────────
//
// Duplicate detection previously only ran when a client happened to supply a
// pre-computed personnummer_hash — the frontend never did, so it was dead
// code (see bankid-crypto.ts's own provenance note, written during ADR-007
// Phase 3's Existing Implementation Review). Both
// date_of_birth (already normalized to ISO YYYY-MM-DD, whatever raw
// YYYYMMDD-XXXX/YYMMDD+XXXX/etc. format the receptionist originally typed —
// existing frontend parsing, unchanged) and personnummer_last4 together
// reconstruct the exact same 12-digit personnummer regardless of the
// original input format, so hashing their concatenation server-side is a
// canonical, client-independent duplicate key. Reuses the existing generic
// HMAC-SHA256 helper from _shared/bankid-crypto.ts (IDENTITY_HASH_KEY) rather
// than duplicating hashing logic — the same primitive already used for
// auth_identity_links.external_subject_hash.
async function computePersonnummerHash(dateOfBirth: string, last4: string): Promise<string | undefined> {
  if (!identityCryptoConfigured()) {
    logger.error('students.personnummer_hash_unavailable', { reason: 'IDENTITY_HASH_KEY not configured' });
    return undefined;
  }
  const canonical = `${dateOfBirth.replace(/-/g, '')}${last4}`;
  return await hashPersonalNumber(canonical);
}

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
  notes:                   z.string().max(5000).nullable().optional(),
  corporate_customer_id:   z.string().uuid().nullable().optional(),
});

const UpdateStudentSchema = CreateStudentSchema.partial();

const PersonLookupSchema = z.object({
  personnummer: z.string().min(1).max(20),
  /** Manual refresh capability (Phase 4) — bypasses any cached result and forces a fresh provider call. */
  force_refresh: z.boolean().optional(),
});

const StudentListQuerySchema = z.object({
  page:             z.coerce.number().int().positive().max(1000).default(1),
  per_page:         z.coerce.number().int().positive().max(500).default(25),
  sort_by:          z.string().optional(),
  sort_dir:         z.enum(['asc', 'desc']).optional(),
  search:           z.string().min(1).max(200).optional(),
  status:           z.enum(STUDENT_STATUSES).optional(),
  instructor_id:    z.string().uuid().optional(),
  permit_stage:          z.enum(PERMIT_STAGES).optional(),
  licence_category:      z.string().max(10).optional(),
  not_licence_category:  z.string().max(10).optional(),
  corporate_customer_id: z.string().uuid().optional(),
  age_from: z.coerce.number().int().min(14).max(110).optional(),
  age_to:   z.coerce.number().int().min(14).max(110).optional(),
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
    search, status, instructor_id, permit_stage,
    licence_category, not_licence_category, corporate_customer_id,
    age_from, age_to,
  } = parsed.data;

  const ALLOWED_SORT_COLUMNS = new Set([
    'created_at', 'updated_at', 'first_name', 'last_name',
    'status', 'permit_stage', 'target_licence_category',
  ]);
  const safeSortBy = ALLOWED_SORT_COLUMNS.has(sort_by) ? sort_by : 'created_at';

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const from = (page - 1) * per_page;
  const to   = from + per_page - 1;

  // Exclude PII fields not needed for list context.
  // personnummer_encrypted and personnummer_hash are only returned on detail (GET /:id).
  const LIST_COLUMNS = [
    'id', 'organization_id', 'first_name', 'last_name', 'date_of_birth',
    'identity_type', 'personnummer_last4',
    'email', 'phone', 'address_line1', 'address_line2', 'postal_code', 'city',
    'preferred_language', 'communication_opt_in_email', 'communication_opt_in_sms',
    'data_processing_consent', 'marketing_consent', 'gdpr_consent_given_at', 'gdpr_consent_version',
    'status', 'enrolled_at', 'enrollment_location_id', 'assigned_instructor_id',
    'target_licence_category', 'permit_stage',
    'notes', 'corporate_customer_id',
    'created_at', 'updated_at', 'created_by', 'updated_by',
  ].join(', ');

  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('students')
    .select(LIST_COLUMNS, { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .order(safeSortBy, { ascending: sort_dir === 'asc' })
    .range(from, to);

  if (status !== undefined)                q = q.eq('status', status);
  if (instructor_id !== undefined)         q = q.eq('assigned_instructor_id', instructor_id);
  if (permit_stage !== undefined)          q = q.eq('permit_stage', permit_stage);
  if (licence_category !== undefined)      q = q.eq('target_licence_category', licence_category);
  if (not_licence_category !== undefined)  q = q.neq('target_licence_category', not_licence_category);
  if (corporate_customer_id !== undefined) q = q.eq('corporate_customer_id', corporate_customer_id);
  if (search !== undefined && search !== '') {
    q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  if (age_from !== undefined) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - age_from);
    q = q.lte('date_of_birth', d.toISOString().slice(0, 10));
  }
  if (age_to !== undefined) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - age_to);
    q = q.gte('date_of_birth', d.toISOString().slice(0, 10));
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

  // Duplicate detection must not depend on the client supplying a hash —
  // compute it server-side from the same (date_of_birth, personnummer_last4)
  // pair the client already sends today, overriding any client-supplied value.
  if (dto.date_of_birth !== undefined && dto.personnummer_last4 !== undefined) {
    const computed = await computePersonnummerHash(dto.date_of_birth, dto.personnummer_last4);
    if (computed !== undefined) dto.personnummer_hash = computed;
  }

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

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
    return errorResp(
      ctx, 409, 'DUPLICATE_PERSONAL_NUMBER',
      'A student with this personnummer is already registered in this organisation',
      { existing_student_id: pnrDup.data.id },
    );
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
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    student_id:     student.id,
    actor_id:       ctx.actorId,
  });

  return successResp(ctx, student, 201);
}

// ─── Person Lookup Framework (Sprint 6) ────────────────────────────────────────
// Assists Student Registration by pre-filling the form from a configured
// identity-lookup provider (Mock Provider only in Version 1.0). Never
// persists anything — the caller decides what to keep when the student is
// actually saved via handleCreate above.

async function handlePersonLookup(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'students:student:create');
  if (guard) return guard;

  // Person Lookup has a real per-call cost once a paid provider is active
  // — its own tighter budget, layered on top of the route's normal write limit.
  const lookupRateGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'person_lookup', ctx.correlationId);
  if (lookupRateGuard) return lookupRateGuard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON');
  }

  const parsed = PersonLookupSchema.safeParse(body);
  if (!parsed.success) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);
  }

  const { personnummer, force_refresh } = parsed.data;

  // Invalid personnummer must never reach the provider.
  if (!isValidPersonnummerFormat(personnummer)) {
    return errorResp(ctx, 422, 'INVALID_PERSONNUMMER', 'Personnummer format or checksum is invalid');
  }

  if (!ctx.organizationId) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');

  let result: Awaited<ReturnType<typeof performPersonLookup>>;
  try {
    result = await performPersonLookup({
      organizationId: ctx.organizationId,
      actorId:        ctx.actorId,
      personnummer,
      correlationId:  ctx.correlationId,
      forceRefresh:   force_refresh,
    });
  } catch (err) {
    logger.error('students.person_lookup_failed', {
      correlation_id: ctx.correlationId,
      error:          err instanceof Error ? err.message : String(err),
    });
    return errorResp(ctx, 502, 'PERSON_LOOKUP_FAILED', 'Person lookup service is temporarily unavailable');
  }

  logger.info('Student.PersonLookup', {
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    actor_id:       ctx.actorId,
    provider:       result.provider,
    outcome:        result.status,
    from_cache:     result.fromCache,
  });

  return successResp(ctx, {
    status:       result.status,
    data:         result.data,
    error:        result.error ?? null,
    error_type:   result.errorType ?? null,
    provider:     result.provider,
    capabilities: result.capabilities,
    from_cache:   result.fromCache,
    looked_up_at: result.lookedUpAt,
    cached_at:    result.cachedAt ?? null,
    confidence:   result.confidence ?? null,
  });
}

// Read-only status/capability check for the External Services settings page
// — no personnummer involved, so it's gated on the lower read-tier permission
// rather than the create-tier permission handlePersonLookup uses.
async function handlePersonLookupStatus(_req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'students:student:read');
  if (guard) return guard;
  if (!ctx.organizationId) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');

  const status = await getPersonLookupStatus(ctx.organizationId);

  return successResp(ctx, {
    provider:            status.provider,
    connected:           status.connected,
    capabilities:        status.capabilities,
    auto_lookup_enabled: status.autoLookupEnabled,
  });
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

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const { data, error } = await (client as any)
    .from('students')
    .select('id, organization_id, first_name, last_name, date_of_birth, identity_type, personnummer_last4, email, phone, status, permit_stage, target_licence_category, assigned_instructor_id, enrollment_location_id, enrolled_at, corporate_customer_id, created_at, updated_at')
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

  // No deleted_at filter here (unlike the list endpoint) — a staff member
  // navigating directly to a known student ID (from search, an invoice, a
  // booking, etc.) must still be able to view an archived student's record.
  // Without this, archiving was a one-way door: the reactivate button lives
  // on this same detail page, which 404'd for any archived student.
  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const { data: student, error } = await (client as any)
    .from('students')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
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

  // Same server-side hash recomputation as handleCreate — only when this
  // update actually supplies both source fields together.
  if (dto.date_of_birth !== undefined && dto.personnummer_last4 !== undefined) {
    const computed = await computePersonnummerHash(dto.date_of_birth, dto.personnummer_last4);
    if (computed !== undefined) dto.personnummer_hash = computed;
  }

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

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

  // Reactivation ("Aktivera/Återaktivera kund" — dto.status set to 'active')
  // is the one legitimate update that must reach an archived row: it both
  // needs to bypass the deleted_at guard below and clear deleted_at/deleted_by
  // itself, or the record stays soft-deleted (invisible everywhere else)
  // despite showing status: 'active'.
  const isReactivating = dto.status === 'active';
  const updatePayload: Record<string, unknown> = { ...dto, updated_by: ctx.actorId };
  if (isReactivating) {
    updatePayload['deleted_at'] = null;
    updatePayload['deleted_by'] = null;
  }

  let updateQuery = (client as any)
    .from('students')
    .update(updatePayload)
    .eq('id', id)
    .eq('organization_id', ctx.organizationId);
  if (!isReactivating) updateQuery = updateQuery.is('deleted_at', null);

  const { data: student, error } = await updateQuery.select().single();

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
    request_id:     ctx.requestId,
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

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

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

  // soft_delete() only sets deleted_at — it has no knowledge of this table's
  // own status column. Without this, the record becomes invisible (correct)
  // but the frontend's reactivate button is gated on status === 'archived',
  // which never happens, so archiving was otherwise a one-way door.
  const { error: statusErr } = await (client as any)
    .from('students')
    .update({ status: 'archived', updated_by: ctx.actorId })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId);

  if (statusErr) {
    logger.error('students.archive_status_sync_failed', { correlation_id: ctx.correlationId, error: statusErr.message, student_id: id });
  }

  logger.info('Student.Archived', {
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    student_id:     id,
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
    const pathname = new URL(req.url).pathname;

    if (pathname.endsWith('/lookup-person/status')) {
      response = req.method === 'GET'
        ? await handlePersonLookupStatus(req, ctx)
        : new Response(
            JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
            { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
          );
    } else if (pathname.endsWith('/lookup-person')) {
      response = req.method === 'POST'
        ? await handlePersonLookup(req, ctx)
        : new Response(
            JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
            { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
          );
    } else if (!id) {
      // Collection routes
      const idsParam = new URL(req.url).searchParams.get('ids');
      if (req.method === 'GET' && idsParam !== null) { response = await handleBatch(req, ctx); }
      else if (req.method === 'GET')  { response = await handleList(req, ctx); }
      else if (req.method === 'POST') { response = await handleCreate(req, ctx); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
          { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
        );
      }
    } else {
      // Single-resource routes
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
    logger.error('students.unhandled_error', {
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
