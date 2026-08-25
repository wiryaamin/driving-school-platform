import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

// ─── Inline schemas (Deno cannot import workspace packages) ──────────────────

const LESSON_SLOT_STATUSES = ['open', 'full', 'in_progress', 'completed', 'cancelled', 'blocked'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// Scheduling — Admin-Friendly Booking: platform-wide duration rule, mirrored
// from the DB CHECK constraint (lesson_slots_duration_rule /
// lesson_bookings_duration_rule, migration 20260821095807) so a violation is
// rejected here with a clear message instead of falling through to a raw
// 23514 constraint-violation error. No maximum — none exists in the
// architecture and none is introduced here.
const MIN_LESSON_DURATION_MINUTES = 40;
const DURATION_GRANULARITY_MINUTES = 5;

function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
}

function validateDuration(startsAt: string, endsAt: string): string | null {
  const mins = durationMinutes(startsAt, endsAt);
  if (mins < MIN_LESSON_DURATION_MINUTES) {
    return `Lektionslängden måste vara minst ${MIN_LESSON_DURATION_MINUTES} minuter.`;
  }
  if (mins % DURATION_GRANULARITY_MINUTES !== 0) {
    return `Lektionslängden måste anges i steg om ${DURATION_GRANULARITY_MINUTES} minuter.`;
  }
  return null;
}

const CreateSlotSchema = z.object({
  instructor_id:   z.string().uuid(),
  vehicle_id:      z.string().uuid().nullable().optional(),
  location_id:     z.string().uuid().nullable().optional(),
  lesson_type_id:  z.string().uuid(),
  starts_at:       z.string().regex(DATETIME_RE, 'Must be ISO datetime'),
  ends_at:         z.string().regex(DATETIME_RE, 'Must be ISO datetime'),
  timezone:        z.string().min(1).max(50).optional(),
  max_bookings:    z.number().int().min(1).max(50).optional(),
  notes:           z.string().max(2000).nullable().optional(),
}).refine(d => new Date(d.ends_at) > new Date(d.starts_at), {
  message: 'ends_at must be after starts_at',
  path: ['ends_at'],
});

const UpdateSlotSchema = z.object({
  instructor_id:   z.string().uuid().optional(),
  vehicle_id:      z.string().uuid().nullable().optional(),
  location_id:     z.string().uuid().nullable().optional(),
  lesson_type_id:  z.string().uuid().optional(),
  starts_at:       z.string().regex(DATETIME_RE, 'Must be ISO datetime').optional(),
  ends_at:         z.string().regex(DATETIME_RE, 'Must be ISO datetime').optional(),
  timezone:        z.string().min(1).max(50).optional(),
  max_bookings:    z.number().int().min(1).max(50).optional(),
  notes:           z.string().max(2000).nullable().optional(),
  // Only a plain open<->blocked toggle is permitted through the general update
  // route ("Block Time" / "Unblock" from the calendar). Every other status
  // transition (full, in_progress, completed, cancelled) is derived from
  // booking activity or the dedicated DELETE (cancel) route, not settable here.
  status:          z.enum(['open', 'blocked']).optional(),
});

const ListQuerySchema = z.object({
  page:           z.coerce.number().int().positive().max(1000).default(1),
  per_page:       z.coerce.number().int().positive().max(500).default(25),
  sort_by:        z.string().optional(),
  sort_dir:       z.enum(['asc', 'desc']).optional(),
  instructor_id:  z.string().uuid().optional(),
  vehicle_id:     z.string().uuid().optional(),
  location_id:    z.string().uuid().optional(),
  lesson_type_id: z.string().uuid().optional(),
  status:         z.enum(LESSON_SLOT_STATUSES).optional(),
  from:           z.string().regex(DATETIME_RE).optional(),
  to:             z.string().regex(DATETIME_RE).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JSON_CT = { 'Content-Type': 'application/json' } as const;

function errorResp(ctx: EdgeRequestContext, status: number, code: string, message: string, details?: unknown): Response {
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

function pagedResp<T>(ctx: EdgeRequestContext, data: T[], total: number, page: number, perPage: number): Response {
  return new Response(
    JSON.stringify({ data, meta: { total, page, per_page: perPage, has_more: page * perPage < total } }),
    { status: 200, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
  );
}

function requirePerm(ctx: EdgeRequestContext, code: string): Response | null {
  if (ctx.organizationId === null) return errorResp(ctx, 403, 'FORBIDDEN', 'Organisation context is required');
  if (ctx.isPlatformAdmin) return null;
  if (!ctx.permissions.includes(code)) return errorResp(ctx, 403, 'FORBIDDEN', `Requires permission: ${code}`);
  return null;
}

function extractId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  return last !== undefined && UUID_RE.test(last) ? last : null;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleList(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:slot:read');
  if (guard) return guard;

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = ListQuerySchema.safeParse(raw);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query parameters', parsed.error.issues);

  const { page, per_page, sort_by = 'starts_at', sort_dir = 'asc', instructor_id, vehicle_id, location_id, lesson_type_id, status, from, to } = parsed.data;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const fromIdx = (page - 1) * per_page;
  const toIdx   = fromIdx + per_page - 1;

  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('lesson_slots')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .order(sort_by, { ascending: sort_dir === 'asc' })
    .range(fromIdx, toIdx);

  if (instructor_id  !== undefined) q = q.eq('instructor_id',  instructor_id);
  if (vehicle_id     !== undefined) q = q.eq('vehicle_id',     vehicle_id);
  if (location_id    !== undefined) q = q.eq('location_id',    location_id);
  if (lesson_type_id !== undefined) q = q.eq('lesson_type_id', lesson_type_id);
  if (status         !== undefined) q = q.eq('status',         status);
  if (from           !== undefined) q = q.gte('starts_at',     from);
  if (to             !== undefined) q = q.lte('starts_at',     to);

  const { data, error, count } = await q;
  if (error) {
    logger.error('slots.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to list slots');
  }
  return pagedResp(ctx, data ?? [], count ?? 0, page, per_page);
}

async function handleCreate(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:slot:create');
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const parsed = CreateSlotSchema.safeParse(body);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);

  const dto = parsed.data;

  const durationErr = validateDuration(dto.starts_at, dto.ends_at);
  if (durationErr) return errorResp(ctx, 422, 'VALIDATION_ERROR', durationErr);

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  const hasVehicle = dto.vehicle_id !== undefined && dto.vehicle_id !== null;

  // Vehicle operational status gate — enforces that non-operational vehicles
  // cannot be assigned to new slots. check_vehicle_availability() only checks
  // time overlap; this check enforces the operational_status contract.
  if (hasVehicle) {
    const { data: vehicle, error: vehStatusError } = await (client as any)
      .from('vehicles')
      .select('id, operational_status')
      .eq('id', dto.vehicle_id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (vehStatusError) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch vehicle');
    if (vehicle === null) return errorResp(ctx, 404, 'NOT_FOUND', `Vehicle '${String(dto.vehicle_id)}' not found`);
    const NON_BOOKABLE_STATUSES = ['maintenance', 'inspection_due', 'inactive', 'decommissioned'];
    if (NON_BOOKABLE_STATUSES.includes(vehicle.operational_status as string)) {
      const STATUS_LABELS: Record<string, string> = {
        maintenance:    'underhåll',
        inspection_due: 'inväntar besiktning',
        inactive:       'inaktivt',
        decommissioned: 'avvecklat',
      };
      const statusLabel = STATUS_LABELS[vehicle.operational_status as string] ?? String(vehicle.operational_status);
      logger.warn('slots.vehicle_unavailable', {
        request_id:     ctx.requestId,
        correlation_id: ctx.correlationId,
        org_id:             ctx.organizationId,
        vehicle_id:         dto.vehicle_id,
        operational_status: vehicle.operational_status,
      });
      return errorResp(ctx, 409, 'VEHICLE_UNAVAILABLE',
        `Fordonet kan inte bokas – status: ${statusLabel}`,
        { vehicle_id: dto.vehicle_id, operational_status: vehicle.operational_status },
      );
    }
  }

  // Pre-flight: time-overlap availability checks in parallel
  const [instrResult, vehResult, closureResult] = await Promise.all([
    (client as any).rpc('check_instructor_availability', {
      p_instructor_id: dto.instructor_id,
      p_starts_at:     dto.starts_at,
      p_ends_at:       dto.ends_at,
    }),
    hasVehicle
      ? (client as any).rpc('check_vehicle_availability', {
          p_vehicle_id: dto.vehicle_id,
          p_starts_at:  dto.starts_at,
          p_ends_at:    dto.ends_at,
        })
      : Promise.resolve({ data: true, error: null }),
    // F5 V1: an active organization closure blocks new slot creation for its window.
    (client as any).rpc('check_organization_closure_availability', {
      p_organization_id: ctx.organizationId,
      p_starts_at:       dto.starts_at,
      p_ends_at:         dto.ends_at,
    }),
  ]);
  if (instrResult.error) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to check instructor availability');
  if (!instrResult.data) return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Läraren är inte tillgänglig under den nya tiden — den krockar med en annan lektion.');
  if (hasVehicle) {
    if (vehResult.error) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to check vehicle availability');
    if (!vehResult.data) return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Fordonet är inte tillgängligt under den nya tiden — det krockar med en annan lektion.');
  }
  if (closureResult.error) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to check organization closure status');
  if (!closureResult.data) {
    return errorResp(ctx, 409, 'ORGANIZATION_CLOSED', 'Skolan är stängd under den här perioden — nya pass kan inte skapas');
  }

  const { data: slot, error } = await (client as any)
    .from('lesson_slots')
    .insert({ ...dto, organization_id: ctx.organizationId, created_by: ctx.actorId, updated_by: ctx.actorId })
    .select()
    .single();

  if (error) {
    logger.error('slots.create_failed', { correlation_id: ctx.correlationId, error: error.message });
    if (error.code === '23P01') return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Tiden krockar med ett annat befintligt pass.');
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to create slot');
  }

  logger.info('Lesson.SlotCreated', {
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    slot_id:        slot.id,
    instructor_id:  slot.instructor_id,
  });
  return successResp(ctx, slot, 201);
}

async function handleGetById(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:slot:read');
  if (guard) return guard;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const { data: slot, error } = await (client as any)
    .from('lesson_slots')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch slot');
  if (slot === null) return errorResp(ctx, 404, 'NOT_FOUND', `Slot '${id}' not found`);
  return successResp(ctx, slot);
}

async function handleUpdate(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:slot:update');
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const parsed = UpdateSlotSchema.safeParse(body);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);

  const dto = parsed.data;
  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  const { data: existing } = await (client as any)
    .from('lesson_slots')
    .select('instructor_id, vehicle_id, starts_at, ends_at, status, current_bookings')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) return errorResp(ctx, 404, 'NOT_FOUND', `Slot '${id}' not found`);

  const newStartsAt     = dto.starts_at     ?? existing.starts_at;
  const newEndsAt       = dto.ends_at       ?? existing.ends_at;
  const newInstructorId = dto.instructor_id ?? existing.instructor_id;
  const newVehicleId    = dto.vehicle_id !== undefined ? dto.vehicle_id : existing.vehicle_id;

  const timingChanged = dto.starts_at !== undefined || dto.ends_at !== undefined;
  if (timingChanged) {
    const durationErr = validateDuration(newStartsAt, newEndsAt);
    if (durationErr) return errorResp(ctx, 422, 'VALIDATION_ERROR', durationErr);
  }

  const instrChanged = dto.instructor_id !== undefined || dto.starts_at !== undefined || dto.ends_at !== undefined;
  const vehChanged   = newVehicleId !== null && (dto.vehicle_id !== undefined || dto.starts_at !== undefined || dto.ends_at !== undefined);

  if (instrChanged || vehChanged) {
    const [instrAvail, vehAvail] = await Promise.all([
      instrChanged
        ? (client as any).rpc('check_instructor_availability', {
            p_instructor_id:   newInstructorId,
            p_starts_at:       newStartsAt,
            p_ends_at:         newEndsAt,
            p_exclude_slot_id: id,
          })
        : Promise.resolve({ data: true, error: null }),
      vehChanged
        ? (client as any).rpc('check_vehicle_availability', {
            p_vehicle_id:      newVehicleId,
            p_starts_at:       newStartsAt,
            p_ends_at:         newEndsAt,
            p_exclude_slot_id: id,
          })
        : Promise.resolve({ data: true, error: null }),
    ]);
    if (instrChanged && !instrAvail.data) return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Läraren är inte tillgänglig under den nya tiden — den krockar med en annan lektion.');
    if (vehChanged   && !vehAvail.data)   return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Fordonet är inte tillgängligt under den nya tiden — det krockar med en annan lektion.');
  }

  const updateBody: Record<string, unknown> = { ...dto, updated_by: ctx.actorId };

  if (dto.status !== undefined) {
    if (dto.status === existing.status) {
      delete updateBody.status;
    } else if (dto.status === 'blocked') {
      if (existing.status !== 'open') {
        return errorResp(ctx, 409, 'CONFLICT', 'Only an open slot can be blocked');
      }
      if ((existing.current_bookings ?? 0) > 0) {
        return errorResp(ctx, 409, 'CONFLICT', 'Cannot block a slot with active bookings');
      }
      updateBody.status_changed_at = new Date().toISOString();
    } else if (dto.status === 'open') {
      if (existing.status !== 'blocked') {
        return errorResp(ctx, 409, 'CONFLICT', 'Only a blocked slot can be reopened this way');
      }
      updateBody.status_changed_at = new Date().toISOString();
    }
  }

  // Scheduling — Admin-Friendly Booking: lesson_bookings.starts_at/ends_at is
  // only ever set from the slot at INSERT time (lesson_booking_set_slot_fields,
  // BEFORE INSERT only — no UPDATE-time equivalent exists). A plain
  // .update() on lesson_slots here would leave any active booking's own
  // denormalised copy stale. When timing actually changes, route through
  // update_slot_timing_with_booking_sync() instead, which updates both rows
  // in one transaction — a genuine conflict on the booking side (e.g. the
  // student's own EXCLUDE constraint) then rolls back the slot change too,
  // rather than leaving slot and booking disagreeing.
  if (timingChanged) {
    const { data: synced, error: syncErr } = await (client as any).rpc('update_slot_timing_with_booking_sync', {
      p_slot_id:         id,
      p_organization_id: ctx.organizationId,
      p_starts_at:       newStartsAt,
      p_ends_at:         newEndsAt,
      p_actor_id:        ctx.actorId,
    });

    if (syncErr) {
      if (syncErr.code === 'P0002')  return errorResp(ctx, 404, 'NOT_FOUND', `Slot '${id}' not found`);
      if (syncErr.code === '23P01') {
        return errorResp(ctx, 409, 'CONFLICT',
          'Den nya tiden krockar med en annan bokning eleven redan har — välj en annan tid.');
      }
      if (syncErr.code === '23514') return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Ogiltig lektionslängd.');
      logger.error('slots.timing_sync_failed', { correlation_id: ctx.correlationId, slot_id: id, error: syncErr.message });
      return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to update slot timing');
    }

    // Every other field (instructor/vehicle/notes/status/max_bookings) still
    // goes through the exact same path as before — starts_at/ends_at/
    // updated_by are already applied by the RPC above, so they're excluded
    // here to avoid a redundant second write.
    const remainingBody = { ...updateBody };
    delete remainingBody.starts_at;
    delete remainingBody.ends_at;
    delete remainingBody.updated_by;

    if (Object.keys(remainingBody).length === 0) return successResp(ctx, synced);

    const { data: slot, error } = await (client as any)
      .from('lesson_slots')
      .update({ ...remainingBody, updated_by: ctx.actorId })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') return errorResp(ctx, 404, 'NOT_FOUND', `Slot '${id}' not found`);
      return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to update slot');
    }
    return successResp(ctx, slot);
  }

  const { data: slot, error } = await (client as any)
    .from('lesson_slots')
    .update(updateBody)
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return errorResp(ctx, 404, 'NOT_FOUND', `Slot '${id}' not found`);
    if (error.code === '23P01')    return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Tiden krockar med ett annat befintligt pass.');
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to update slot');
  }
  return successResp(ctx, slot);
}

async function handleCancel(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:slot:delete');
  if (guard) return guard;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  const { data: existing } = await (client as any)
    .from('lesson_slots')
    .select('id, status')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) return errorResp(ctx, 404, 'NOT_FOUND', `Slot '${id}' not found`);
  if (existing.status === 'cancelled') return errorResp(ctx, 409, 'CONFLICT', 'Slot is already cancelled');

  // Block if active bookings exist.
  // head: true returns data: null and count: <number> — destructure count, not data.
  const { count: activeCount } = await (client as any)
    .from('lesson_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('slot_id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .not('status', 'in', '("cancelled","no_show","rescheduled")');

  if ((activeCount ?? 0) > 0) {
    return errorResp(ctx, 409, 'CONFLICT', `Cannot cancel slot with ${activeCount ?? 0} active booking(s). Cancel or reschedule them first.`);
  }

  const { data: slot, error } = await (client as any)
    .from('lesson_slots')
    .update({ status: 'cancelled', status_changed_at: new Date().toISOString(), updated_by: ctx.actorId })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select()
    .single();

  if (error) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to cancel slot');

  logger.info('Lesson.SlotCancelled', { correlation_id: ctx.correlationId, org_id: ctx.organizationId, slot_id: id });
  return successResp(ctx, slot);
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
      if (req.method === 'GET')       { response = await handleList(req, ctx); }
      else if (req.method === 'POST') { response = await handleCreate(req, ctx); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
          { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
        );
      }
    } else {
      if (req.method === 'GET')         { response = await handleGetById(req, ctx, id); }
      else if (req.method === 'PATCH')  { response = await handleUpdate(req, ctx, id); }
      else if (req.method === 'DELETE') { response = await handleCancel(req, ctx, id); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
          { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
        );
      }
    }
  } catch (err) {
    logger.error('slots.unhandled_error', {
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
