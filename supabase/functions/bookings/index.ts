import { z } from 'npm:zod@3';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext } from '../_shared/context.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { resolveLessonPackageCredit, insertLessonBooking, consumeLessonPackageCreditOrCompensate, reverseLessonCreditOnCancellation } from '../_shared/lesson-credits.ts';
import { getCancellationDeadlineHours, isWithinCancellationDeadline } from '../_shared/cancellation-policy.ts';
import { transitionBookingAttendance } from '../_shared/booking-lifecycle.ts';
import type { EdgeRequestContext } from '../_shared/context.ts';

// ─── Inline schemas (Deno cannot import workspace packages) ──────────────────

const BOOKING_STATUSES = ['draft', 'reserved', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled'] as const;
const CANCELLATION_CATEGORIES = ['student_request', 'school_cancelled', 'weather', 'vehicle_fault', 'instructor_sick', 'other'] as const;
const UUID_RE    = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// Booking status transition matrix (mirrors DB is_valid_booking_transition)
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:       ['reserved', 'confirmed', 'cancelled'],
  reserved:    ['confirmed', 'cancelled'],
  confirmed:   ['completed', 'cancelled', 'no_show', 'rescheduled'],
  completed:   [],
  cancelled:   [],
  no_show:     [],
  rescheduled: [],
};

const CreateBookingSchema = z.object({
  slot_id:         z.string().uuid(),
  student_id:      z.string().uuid(),
  status:          z.enum(BOOKING_STATUSES).optional(),
  price_sek:       z.number().min(0).nullable().optional(),
  // Required only when the target slot has no predefined lesson type
  // (generic availability) — see lesson_booking_set_slot_fields().
  lesson_type_id:  z.string().uuid().optional(),
});

const UpdateBookingSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
});

const CancelBookingSchema = z.object({
  cancellation_reason:    z.string().max(2000).nullable().optional(),
  cancellation_category:  z.enum(CANCELLATION_CATEGORIES).nullable().optional(),
});

const RescheduleBookingSchema = z.object({
  new_slot_id:    z.string().uuid(),
  // Required only when the target slot has no predefined lesson type.
  lesson_type_id: z.string().uuid().optional(),
});

const AddNoteSchema = z.object({
  content:     z.string().min(1).max(2000),
  is_internal: z.boolean().optional(),
});

const FeedbackSchema = z.object({
  performance_rating: z.number().int().min(1).max(5).optional(),
  instructor_notes:   z.string().max(2000).optional(),
});

const ListQuerySchema = z.object({
  page:          z.coerce.number().int().positive().max(1000).default(1),
  per_page:      z.coerce.number().int().positive().max(500).default(25),
  sort_by:       z.string().optional(),
  sort_dir:      z.enum(['asc', 'desc']).optional(),
  student_id:    z.string().uuid().optional(),
  instructor_id: z.string().uuid().optional(),
  slot_id:       z.string().uuid().optional(),
  status:        z.enum(BOOKING_STATUSES).optional(),
  from:          z.string().regex(DATETIME_RE).optional(),
  to:            z.string().regex(DATETIME_RE).optional(),
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

// Parses the URL path to extract booking ID and optional action sub-path.
// Handles:
//   /functions/v1/bookings          → { id: null, action: null }
//   /functions/v1/bookings/{uuid}   → { id: uuid, action: null }
//   /functions/v1/bookings/{uuid}/cancel     → { id: uuid, action: 'cancel' }
//   /functions/v1/bookings/{uuid}/reschedule → { id: uuid, action: 'reschedule' }
function parsePath(req: Request): { id: string | null; action: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  // Find 'bookings' segment index
  const fnIdx = segments.findLastIndex(s => s === 'bookings');
  const after  = segments.slice(fnIdx + 1);

  if (after.length === 0) return { id: null, action: null };

  const maybeId = after[0] ?? '';
  const id      = UUID_RE.test(maybeId) ? maybeId : null;
  const action  = after[1] ?? null;

  return { id, action };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleList(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:read');
  if (guard) return guard;

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = ListQuerySchema.safeParse(raw);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Invalid query parameters', parsed.error.issues);

  const { page, per_page, sort_by = 'starts_at', sort_dir = 'desc', student_id, instructor_id, slot_id, status, from, to } = parsed.data;

  const ALLOWED_SORT_COLUMNS = new Set([
    'starts_at', 'ends_at', 'created_at', 'updated_at', 'status',
  ]);
  const safeSortBy = ALLOWED_SORT_COLUMNS.has(sort_by) ? sort_by : 'starts_at';

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const fromIdx = (page - 1) * per_page;
  const toIdx   = fromIdx + per_page - 1;

  // eslint-disable-next-line prefer-const
  let q = (client as any)
    .from('lesson_bookings')
    .select('*', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .order(safeSortBy, { ascending: sort_dir === 'asc' })
    .range(fromIdx, toIdx);

  if (student_id    !== undefined) q = q.eq('student_id',    student_id);
  if (instructor_id !== undefined) q = q.eq('instructor_id', instructor_id);
  if (slot_id       !== undefined) q = q.eq('slot_id',       slot_id);
  if (status        !== undefined) q = q.eq('status',        status);
  if (from          !== undefined) q = q.gte('starts_at',    from);
  if (to            !== undefined) q = q.lte('starts_at',    to);

  const { data, error, count } = await q;
  if (error) {
    logger.error('bookings.list_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to list bookings');
  }
  return pagedResp(ctx, data ?? [], count ?? 0, page, per_page);
}

async function handleCreate(req: Request, ctx: EdgeRequestContext): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:create');
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const parsed = CreateBookingSchema.safeParse(body);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);

  const dto = parsed.data;
  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  // Verify slot exists and has capacity
  const { data: slot } = await (client as any)
    .from('lesson_slots')
    .select('id, status, starts_at, ends_at, current_bookings, max_bookings, lesson_type_id')
    .eq('id', dto.slot_id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (slot === null) return errorResp(ctx, 404, 'NOT_FOUND', `Slot '${dto.slot_id}' not found`);
  if (slot.status === 'cancelled' || slot.status === 'blocked') {
    return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', `Slot is ${slot.status}`);
  }
  if (slot.current_bookings >= slot.max_bookings) {
    return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Slot is at full capacity');
  }

  // Generic-availability slots (lesson_type_id null) carry no lesson type of
  // their own — the booker must supply one. Typed slots ignore whatever the
  // caller sends here (the trigger keeps the slot's own type authoritative).
  if (!slot.lesson_type_id && !dto.lesson_type_id) {
    return errorResp(ctx, 422, 'LESSON_TYPE_REQUIRED',
      'Detta pass har ingen förvald lektionstyp — ange lektionstyp vid bokning.');
  }
  const effectiveLessonTypeId: string | null = slot.lesson_type_id ?? dto.lesson_type_id ?? null;

  // Pre-flight: student availability
  const { data: avail, error: availErr } = await (client as any).rpc('check_student_booking_availability', {
    p_student_id: dto.student_id,
    p_starts_at:  slot.starts_at,
    p_ends_at:    slot.ends_at,
  });
  if (availErr) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to check student availability');
  if (!avail) return errorResp(ctx, 409, 'CONFLICT', 'Student already has a booking overlapping this time window');

  // ── C1: Package credit validation ─────────────────────────────────────────────
  // Finds the student's oldest non-expired active package for the slot category.
  // If active packages exist but none have remaining credits → reject booking.
  // Students with no active packages are allowed (billed separately, no package).
  // Uses effectiveLessonTypeId (not slot.lesson_type_id) so a generic-availability
  // slot booked with an explicit lesson type still correctly consumes a package
  // credit instead of always resolving to "not applicable".
  const preflight = await resolveLessonPackageCredit(client, {
    organizationId: ctx.organizationId,
    studentId:      dto.student_id,
    lessonTypeId:   effectiveLessonTypeId,
  });

  if (preflight.kind === 'insufficient') {
    return errorResp(ctx, 409, 'INSUFFICIENT_CREDITS',
      'Eleven saknar lektionstillgodokvitton för det här passet',
      { student_id: dto.student_id, required_quantity: 1, available_quantity: 0 },
    );
  }
  if (preflight.kind === 'expired') {
    return errorResp(ctx, 409, 'PACKAGE_EXPIRED',
      'Elevens lektionspaket för den här kategorin har gått ut — förnya paketet innan bokning',
      { student_id: dto.student_id, category: preflight.category },
    );
  }

  const insertPayload: Record<string, unknown> = {
    slot_id:          dto.slot_id,
    student_id:       dto.student_id,
    status:           dto.status ?? 'reserved',
    booked_by:        ctx.actorId,
    organization_id:  ctx.organizationId,
    created_by:       ctx.actorId,
    updated_by:       ctx.actorId,
  };
  if (dto.price_sek !== undefined) insertPayload['price_sek'] = dto.price_sek;
  // Only set when the slot itself has no lesson type — the trigger keeps a
  // typed slot's own value authoritative regardless of what's sent here.
  if (!slot.lesson_type_id && dto.lesson_type_id) insertPayload['lesson_type_id'] = dto.lesson_type_id;

  const { data: booking, error } = await insertLessonBooking(client, insertPayload);

  if (error) {
    logger.error('bookings.create_failed', { correlation_id: ctx.correlationId, error: error.message });
    if (error.code === '23P01') return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Booking conflict: the time window is already occupied');
    if (error.code === '23505') return errorResp(ctx, 409, 'CONFLICT', 'Student already has a booking for this slot');
    // 23514 (check_violation): lost the capacity race — a concurrent booking's
    // AFTER INSERT trigger (update_slot_booking_count) already pushed
    // current_bookings to max_bookings between our pre-flight read and this
    // insert. The pre-flight check above is inherently TOCTOU-racy (no
    // capacity lock is taken), so this is the expected, normal way the race
    // resolves — found via live concurrent-booking hardening, previously
    // surfaced as a raw 500 instead of the same SLOT_UNAVAILABLE response
    // the non-race case already returns.
    if (error.code === '23514') return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Slot is at full capacity');
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to create booking');
  }

  // ── C1: Consume package credit (post-insert) ──────────────────────────────────
  // Race edge case: pre-flight passed but concurrent booking exhausted the last
  // credit between our check and this insert. Compensate by cancelling the new booking.
  if (preflight.kind === 'available') {
    const consumeResult = await consumeLessonPackageCreditOrCompensate(client, {
      assignmentId:   preflight.assignmentId,
      category:       preflight.category,
      organizationId: ctx.organizationId,
      bookingId:      booking.id,
      actorId:        ctx.actorId,
      actorEmail:     null,
    });

    if (!consumeResult.ok) {
      logger.warn('bookings.credit_consume_failed', {
        correlation_id: ctx.correlationId,
        booking_id:     booking.id,
        student_id:     dto.student_id,
        assignment_id:  preflight.assignmentId,
        error:          consumeResult.errorMessage,
      });
      return errorResp(ctx, 409, 'INSUFFICIENT_CREDITS',
        'Eleven saknar lektionstillgodokvitton för det här passet',
        { student_id: dto.student_id, required_quantity: 1, available_quantity: 0 },
      );
    }

    logger.info('bookings.credit_consumed', {
      request_id:     ctx.requestId,
      correlation_id: ctx.correlationId,
      org_id:          ctx.organizationId,
      booking_id:      booking.id,
      student_id:      dto.student_id,
      assignment_id:   preflight.assignmentId,
      lesson_category: preflight.category,
    });
  }

  logger.info('Lesson.Created', {
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    booking_id:     booking.id,
    slot_id:        dto.slot_id,
    student_id:     dto.student_id,
    actor_id:       ctx.actorId,
  });

  return successResp(ctx, booking, 201);
}

async function handleGetById(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:read');
  if (guard) return guard;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });
  const { data: booking, error } = await (client as any)
    .from('lesson_bookings')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to fetch booking');
  if (booking === null) return errorResp(ctx, 404, 'NOT_FOUND', `Booking '${id}' not found`);
  return successResp(ctx, booking);
}

async function handleUpdate(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:update');
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const parsed = UpdateBookingSchema.safeParse(body);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  const { data: existing } = await (client as any)
    .from('lesson_bookings')
    .select('id, status')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) return errorResp(ctx, 404, 'NOT_FOUND', `Booking '${id}' not found`);

  const { status: newStatus } = parsed.data;

  // Idempotent no-op: a retried PATCH (e.g. after a gateway timeout whose
  // original request actually succeeded) re-applying the status the booking
  // is already in should succeed, not be treated as an invalid transition
  // from a terminal state.
  if (existing.status === newStatus) {
    const { data: current } = await (client as any)
      .from('lesson_bookings')
      .select('*')
      .eq('id', id)
      .single();
    return successResp(ctx, current);
  }

  // Cancellation requires cancelled_at/cancelled_by (enforced by the
  // lesson_bookings_cancel_consistency check constraint) and package-credit
  // restoration, both handled only by the dedicated cancel endpoint.
  if (newStatus === 'cancelled') {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', "Use PATCH /bookings/:id/cancel to cancel a booking");
  }

  // Portal Audit P0-3 (IP-01/XP-04): the actual status transition, credit
  // side effects, and lesson_completed event are the single canonical
  // implementation in _shared/booking-lifecycle.ts — also reused by
  // instructor-portal's attendance endpoint so no second lifecycle can
  // silently diverge from this one.
  const result = await transitionBookingAttendance(client, {
    organizationId: ctx.organizationId!,
    bookingId:      id,
    newStatus,
    actorId:        ctx.actorId,
  });

  if (!result.ok) {
    return errorResp(ctx, result.status, result.code ?? 'ERROR', result.message ?? 'Failed to update booking',
      result.code === 'NO_SHOW_TOO_EARLY' ? { starts_at: existing.starts_at } : undefined);
  }

  logger.info('Lesson.Updated', { correlation_id: ctx.correlationId, booking_id: id, status: newStatus });

  return successResp(ctx, result.booking);
}

async function handleCancel(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:update');
  if (guard) return guard;

  let body: unknown = {};
  try { body = await req.json(); } catch { /* no body required */ }

  const parsed = CancelBookingSchema.safeParse(body);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  const { data: existing } = await (client as any)
    .from('lesson_bookings')
    .select('id, status, starts_at')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) return errorResp(ctx, 404, 'NOT_FOUND', `Booking '${id}' not found`);

  const allowed = VALID_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes('cancelled')) {
    return errorResp(ctx, 409, 'CONFLICT', `Cannot cancel a booking in '${existing.status}' status`);
  }

  // F3 V1: a cancellation attributed to the student ("Elevens önskemål") that
  // falls inside the organization's cancellation-deadline window forfeits the
  // credit — same consequence as a no-show, deliberately. Staff/school/
  // instructor-caused cancellations (any other category, or none given) are
  // exempt regardless of timing, per the approved V1 policy.
  const isStudentInitiated = parsed.data.cancellation_category === 'student_request';
  const forfeitCredit = isStudentInitiated
    ? isWithinCancellationDeadline(existing.starts_at, await getCancellationDeadlineHours(client, ctx.organizationId!))
    : false;

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status:            'cancelled',
    status_changed_at: now,
    cancelled_at:      now,
    cancelled_by:      ctx.actorId,
    updated_by:        ctx.actorId,
  };
  if (parsed.data.cancellation_reason   !== undefined) updatePayload['cancellation_reason']   = parsed.data.cancellation_reason;
  if (parsed.data.cancellation_category !== undefined) updatePayload['cancellation_category'] = parsed.data.cancellation_category;

  const { data: booking, error } = await (client as any)
    .from('lesson_bookings')
    .update(updatePayload)
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select()
    .single();

  if (error) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to cancel booking');

  logger.info('Lesson.Cancelled', {
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    org_id:         ctx.organizationId,
    booking_id:     id,
    actor_id:       ctx.actorId,
  });

  // ── C2 / F3: Restore or forfeit package credit on cancellation ──────────────
  // See reverseLessonCreditOnCancellation (_shared/lesson-credits.ts) — shared
  // with the Student Portal's cancel path. forfeitCredit (computed above)
  // short-circuits the reversal for a late student-initiated cancellation;
  // otherwise behavior is unchanged from before F3 (gated on the package's
  // own cancellation_consumes_credit flag). A failed reversal is surfaced to
  // the caller (not just logged) so the receptionist can be told to check
  // the student's package manually.
  const reversal = await reverseLessonCreditOnCancellation(client, {
    organizationId: ctx.organizationId!,
    bookingId:      id,
    forfeit:        forfeitCredit,
    actorId:        ctx.actorId,
    actorEmail:     null,
    reason:         'Lektion avbokad — kredit återställd automatiskt',
  });

  if (reversal.error) {
    logger.warn('bookings.credit_reverse_failed', {
      request_id:     ctx.requestId,
      correlation_id: ctx.correlationId,
      org_id:         ctx.organizationId,
      booking_id:     id,
      error:          reversal.error,
    });
  } else if (reversal.reversed) {
    logger.info('bookings.credit_reversed', {
      request_id:     ctx.requestId,
      correlation_id: ctx.correlationId,
      org_id:         ctx.organizationId,
      booking_id:     id,
      actor_id:       ctx.actorId,
    });
  } else if (reversal.forfeited) {
    logger.info('bookings.credit_forfeited_late_cancellation', {
      request_id:     ctx.requestId,
      correlation_id: ctx.correlationId,
      org_id:         ctx.organizationId,
      booking_id:     id,
      actor_id:       ctx.actorId,
    });
  }

  return successResp(ctx, reversal.error
    ? { ...booking, credit_reversal_failed: true }
    : { ...booking, credit_forfeited: reversal.forfeited });
}

async function handleReschedule(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:create');
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const parsed = RescheduleBookingSchema.safeParse(body);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);

  const { new_slot_id } = parsed.data;
  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  // Fetch old booking
  const { data: oldBooking } = await (client as any)
    .from('lesson_bookings')
    .select('id, status, student_id, slot_id, price_sek')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (oldBooking === null) return errorResp(ctx, 404, 'NOT_FOUND', `Booking '${id}' not found`);
  if (!['reserved', 'confirmed'].includes(oldBooking.status)) {
    return errorResp(ctx, 409, 'CONFLICT', `Cannot reschedule a booking in '${oldBooking.status}' status. Only reserved or confirmed bookings may be rescheduled.`);
  }

  // Fetch new slot
  const { data: newSlot } = await (client as any)
    .from('lesson_slots')
    .select('id, status, starts_at, ends_at, current_bookings, max_bookings, lesson_type_id')
    .eq('id', new_slot_id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (newSlot === null) return errorResp(ctx, 404, 'NOT_FOUND', `Target slot '${new_slot_id}' not found`);
  if (newSlot.status === 'cancelled' || newSlot.status === 'blocked') {
    return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', `Target slot is ${newSlot.status}`);
  }
  if (newSlot.current_bookings >= newSlot.max_bookings) {
    return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Target slot is at full capacity');
  }
  // Generic-availability target slot — same requirement as creating a new booking.
  if (!newSlot.lesson_type_id && !parsed.data.lesson_type_id) {
    return errorResp(ctx, 422, 'LESSON_TYPE_REQUIRED',
      'Det nya passet har ingen förvald lektionstyp — ange lektionstyp vid ombokning.');
  }

  // Pre-flight: student availability at new time (excluding old booking)
  const { data: avail, error: availErr } = await (client as any).rpc('check_student_booking_availability', {
    p_student_id:          oldBooking.student_id,
    p_starts_at:           newSlot.starts_at,
    p_ends_at:             newSlot.ends_at,
    p_exclude_booking_id:  id,
  });
  if (availErr) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to check student availability');
  if (!avail) return errorResp(ctx, 409, 'CONFLICT', 'Student already has a booking overlapping the target time window');

  // Mark old booking as rescheduled
  const now = new Date().toISOString();
  const { error: markErr } = await (client as any)
    .from('lesson_bookings')
    .update({ status: 'rescheduled', status_changed_at: now, updated_by: ctx.actorId })
    .eq('id', id)
    .eq('organization_id', ctx.organizationId);

  if (markErr) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to mark old booking as rescheduled');

  // Create new booking
  const newPayload: Record<string, unknown> = {
    slot_id:             new_slot_id,
    student_id:          oldBooking.student_id,
    status:              'reserved',
    rescheduled_from_id: id,
    booked_by:           ctx.actorId,
    organization_id:     ctx.organizationId,
    created_by:          ctx.actorId,
    updated_by:          ctx.actorId,
  };
  if (oldBooking.price_sek !== null) newPayload['price_sek'] = oldBooking.price_sek;
  if (!newSlot.lesson_type_id && parsed.data.lesson_type_id) {
    newPayload['lesson_type_id'] = parsed.data.lesson_type_id;
  }

  const { data: newBooking, error: insertErr } = await (client as any)
    .from('lesson_bookings')
    .insert(newPayload)
    .select()
    .single();

  if (insertErr) {
    logger.error('bookings.reschedule_failed', { correlation_id: ctx.correlationId, error: insertErr.message });
    // Compensating rollback: restore old booking status so it is not silently lost.
    await (client as any)
      .from('lesson_bookings')
      .update({ status: oldBooking.status, status_changed_at: null, updated_by: ctx.actorId })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId);
    if (insertErr.code === '23P01') return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Booking conflict at target slot');
    // 23514: lost the capacity race on the target slot — same TOCTOU class as
    // the create-booking path above.
    if (insertErr.code === '23514') return errorResp(ctx, 409, 'SLOT_UNAVAILABLE', 'Target slot is at full capacity');
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to create rescheduled booking');
  }

  logger.info('Lesson.Rescheduled', {
    request_id:     ctx.requestId,
    correlation_id: ctx.correlationId,
    org_id:          ctx.organizationId,
    old_booking_id:  id,
    new_booking_id:  newBooking.id,
    student_id:      oldBooking.student_id,
    new_slot_id:     new_slot_id,
    actor_id:        ctx.actorId,
  });

  return successResp(ctx, newBooking, 201);
}

async function handleAddNote(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:update');
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const parsed = AddNoteSchema.safeParse(body);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  const { data: existing } = await (client as any)
    .from('lesson_bookings')
    .select('id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) return errorResp(ctx, 404, 'NOT_FOUND', `Booking '${id}' not found`);

  const { data: note, error } = await (client as any)
    .from('booking_notes')
    .insert({
      organization_id: ctx.organizationId,
      booking_id:      id,
      author_id:       ctx.actorId,
      content:         parsed.data.content,
      is_internal:     parsed.data.is_internal ?? true,
    })
    .select('id, content, is_internal, created_at')
    .single();

  if (error) {
    logger.error('bookings.add_note_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to add note');
  }

  return successResp(ctx, note, 201);
}

async function handleFeedback(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:update');
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Request body must be valid JSON'); }

  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) return errorResp(ctx, 422, 'VALIDATION_ERROR', 'Validation failed', parsed.error.issues);

  if (parsed.data.performance_rating === undefined && parsed.data.instructor_notes === undefined) {
    return errorResp(ctx, 422, 'VALIDATION_ERROR', 'At least one of performance_rating or instructor_notes is required');
  }

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  const { data: existing } = await (client as any)
    .from('lesson_bookings')
    .select('id, status')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) return errorResp(ctx, 404, 'NOT_FOUND', `Booking '${id}' not found`);
  if (!['completed', 'no_show'].includes(existing.status)) {
    return errorResp(ctx, 409, 'CONFLICT', `Feedback can only be set on completed or no_show bookings (current: ${existing.status})`);
  }

  const updatePayload: Record<string, unknown> = { updated_by: ctx.actorId };
  if (parsed.data.performance_rating !== undefined) updatePayload['performance_rating'] = parsed.data.performance_rating;
  if (parsed.data.instructor_notes   !== undefined) updatePayload['instructor_notes']   = parsed.data.instructor_notes;

  const { data: booking, error } = await (client as any)
    .from('lesson_bookings')
    .update(updatePayload)
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select('id, performance_rating, instructor_notes')
    .single();

  if (error) {
    logger.error('bookings.feedback_failed', { correlation_id: ctx.correlationId, error: error.message });
    return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to update booking feedback');
  }

  return successResp(ctx, booking);
}

async function handleArchive(req: Request, ctx: EdgeRequestContext, id: string): Promise<Response> {
  const guard = requirePerm(ctx, 'scheduling:booking:delete');
  if (guard) return guard;

  const client = createSupabaseClient(req, false, { correlationId: ctx.correlationId, requestId: ctx.requestId });

  const { data: existing } = await (client as any)
    .from('lesson_bookings')
    .select('id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) return errorResp(ctx, 404, 'NOT_FOUND', `Booking '${id}' not found`);

  const { error } = await (client as any).rpc('soft_delete', {
    p_table_name: 'lesson_bookings',
    p_record_id:  id,
  });

  if (error) return errorResp(ctx, 500, 'INTERNAL_ERROR', 'Failed to archive booking');

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
    const { id, action } = parsePath(req);

    if (id !== null && action !== null) {
      // Sub-resource action routes
      if (req.method === 'PATCH' && action === 'cancel') {
        response = await handleCancel(req, ctx, id);
      } else if (req.method === 'PATCH' && action === 'reschedule') {
        response = await handleReschedule(req, ctx, id);
      } else if (req.method === 'POST' && action === 'notes') {
        response = await handleAddNote(req, ctx, id);
      } else if (req.method === 'PATCH' && action === 'feedback') {
        response = await handleFeedback(req, ctx, id);
      } else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
          { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
        );
      }
    } else if (id !== null) {
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
    } else {
      // Collection routes
      if (req.method === 'GET')       { response = await handleList(req, ctx); }
      else if (req.method === 'POST') { response = await handleCreate(req, ctx); }
      else {
        response = new Response(
          JSON.stringify({ code: 'NOT_FOUND', message: 'Route not found', trace_id: ctx.correlationId, request_id: ctx.requestId, version: 1 }),
          { status: 404, headers: { ...JSON_CT, 'X-Correlation-ID': ctx.correlationId, 'X-Request-ID': ctx.requestId } }
        );
      }
    }
  } catch (err) {
    logger.error('bookings.unhandled_error', {
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
