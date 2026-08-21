/**
 * event-worker — Transactional outbox drain worker + maintenance tick.
 *
 * Invocation:
 *   • Cron: every minute via Supabase scheduled functions or pg_cron
 *   • Manual: POST /functions/v1/event-worker with WORKER_SECRET bearer token
 *
 * Algorithm per run:
 *   1. Claim up to BATCH_SIZE 'internal' channel events via outbox_claim_next()
 *      (FOR UPDATE SKIP LOCKED — safe to run concurrently)
 *   2. Dispatch each event to the matching handler in HANDLER_REGISTRY
 *   3. Call outbox_complete() on success
 *   4. Call outbox_fail()   on failure (DB handles backoff + dead-letter)
 *   5. Run maintenance tick: drain due reminders + expire stale reservations
 *   6. Return a metrics summary in the response body
 *
 * Dead-letter: handled entirely by outbox_fail() in the DB.
 *   Backoff schedule (default max_retries=3): 30s → 60s → 120s → dead_letter.
 *
 * Maintenance tick (Phase 3D):
 *   drain_due_reminders() — atomically claims scheduled reminders whose
 *     scheduled_for <= now(), creates notification records, marks sent.
 *   expire_stale_reservations() — cancels draft/reserved bookings past timeout,
 *     publishes Reservation.Expired events back into the outbox.
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE           = Number(Deno.env.get('EVENT_WORKER_BATCH_SIZE')      ?? '50');
const ACCOUNTING_BATCH     = Number(Deno.env.get('EVENT_WORKER_ACCT_BATCH')      ?? '50');
const LOCK_TTL             = Deno.env.get('EVENT_WORKER_LOCK_TTL')               ?? '5 minutes';
const REMINDER_BATCH       = Number(Deno.env.get('EVENT_WORKER_REMINDER_BATCH')  ?? '20');
const EXPIRY_TIMEOUT       = Number(Deno.env.get('RESERVATION_EXPIRY_MINUTES')   ?? '30');
const CREDIT_EXPIRY_BATCH  = Number(Deno.env.get('CREDIT_EXPIRY_BATCH')         ?? '50');
const DUNNING_BATCH        = Number(Deno.env.get('DUNNING_BATCH')               ?? '100');
const WORKER_SECRET        = Deno.env.get('WORKER_SECRET');

// ─── Template key mapping ─────────────────────────────────────────────────────

const REMINDER_TYPE_TO_TEMPLATE: Record<string, string> = {
  reminder_24h:      'lesson.reminder.24h',
  reminder_same_day: 'lesson.reminder.same_day',
  reminder_2h:       'lesson.reminder.2h',
  reminder_1h:       'lesson.reminder.1h',
};

// Maps reminder_type → communication-worker trigger_event name
const REMINDER_TYPE_TO_TRIGGER: Record<string, string> = {
  reminder_24h:      'booking_reminder_24h',
  reminder_same_day: 'booking_reminder_same_day',
  reminder_2h:       'booking_reminder_24h',
  reminder_1h:       'booking_reminder_24h',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface OutboxEvent {
  id:              string;
  organization_id: string | null;
  event_type:      string;
  event_version:   string;
  channel:         string;
  correlation_id:  string | null;
  causation_id:    string | null;
  payload:         Record<string, unknown>;
  metadata:        Record<string, unknown>;
  status:          string;
  target_id:       string | null;
  retry_count:     number;
  max_retries:     number;
}

interface HandlerResult {
  success: boolean;
  error?:  string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (event: OutboxEvent, client: any) => Promise<HandlerResult>;

interface WorkerMetrics {
  worker_id:               string;
  run_started_at:          string;
  run_duration_ms:         number;
  events_claimed:          number;
  events_delivered:        number;
  events_failed:           number;
  events_dead_lettered:    number;
  events_no_handler:       number;
  reminders_processed:     number;
  reminders_failed:        number;
  reservations_expired:    number;
  accounting_delivered:    number;
  credits_expired:         number;
  dunning_processed:       number;
  instructor_digests_sent: number;
  campaigns_transitioned:  number;
  packages_expired:        number;
  regulatory_reminders_sent: number;
  stale_booking_reminders_sent: number;
  vehicle_compliance_reminders_sent: number;
}

// ─── Outbox event handlers ────────────────────────────────────────────────────

// Student.Created: queue a welcome internal notification for the student.
// The communication worker picks it up on the next drain cycle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStudentCreated(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const studentId = event.payload['student_id'] as string | undefined;
  const orgId     = event.organization_id;

  logger.info('handler.student_created', { event_id: event.id, org_id: orgId, student_id: studentId });

  if (studentId === undefined || orgId === null) return { success: true };

  const { error } = await client.from('notifications').insert({
    organization_id: orgId,
    recipient_id:    studentId,
    recipient_type:  'student',
    channel:         'internal',
    template_key:    'student.welcome',
    idempotency_key: `student.welcome:${studentId}`,
    reference_type:  'student',
    reference_id:    studentId,
  });

  if (error !== null) {
    if ((error as { code?: string }).code === '23505') return { success: true }; // idempotency — already queued
    logger.error('handler.student_created.notification_failed', { event_id: event.id, error: error.message });
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Student.Updated: field updates do not have a mandatory cross-domain reaction;
// specific business rules (e.g. contact-change confirmation) are handled by the UI layer.
async function handleStudentUpdated(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.student_updated', { event_id: event.id, student_id: event.payload['student_id'] });
  return { success: true };
}

// Student.Archived: cancel all non-terminal bookings for the student.
// The DB trigger on lesson_bookings will emit Lesson.Cancelled per booking,
// which then cancels reminders and promotes waitlist entries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStudentArchived(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const studentId = event.payload['student_id'] as string | undefined;
  const orgId     = event.organization_id;

  logger.info('handler.student_archived', { event_id: event.id, student_id: studentId });

  if (studentId === undefined || orgId === null) return { success: true };

  const { error, count } = await client
    .from('lesson_bookings')
    .update({
      status:                'cancelled',
      // lesson_bookings_cancel_consistency requires cancelled_at whenever
      // status = 'cancelled' — this update always violated that check and
      // never actually cancelled a single booking, found via referential-
      // integrity hardening (an archived student's future booking was left
      // dangling as 'reserved').
      cancelled_at:           new Date().toISOString(),
      cancellation_reason:    'Eleven arkiverad',
      cancellation_category:  'other',
      status_changed_at:      new Date().toISOString(),
    })
    .eq('student_id', studentId)
    .eq('organization_id', orgId)
    .in('status', ['draft', 'reserved', 'confirmed'])
    .select('id', { count: 'exact', head: true });

  if (error !== null) {
    logger.error('handler.student_archived.cancel_bookings_failed', {
      event_id:   event.id,
      student_id: studentId,
      error:      error.message,
    });
    return { success: false, error: error.message };
  }

  logger.info('handler.student_archived.bookings_cancelled', { event_id: event.id, student_id: studentId, count: count ?? 0 });
  return { success: true };
}

// student.status_changed fires on every students status transition (see
// emit_student_status_changed trigger) — this is the event that actually
// fires in production; 'Student.Archived' below is never emitted by
// anything (students/index.ts only logs that string, it never calls
// insert_outbox_event). Only react when the transition is into 'archived';
// reuses handleStudentArchived's logic since the payload shape is
// compatible (both carry student_id/organization_id).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStudentStatusChanged(event: OutboxEvent, client: any): Promise<HandlerResult> {
  if (event.payload['new_status'] !== 'archived') return { success: true };
  return handleStudentArchived(event, client);
}

// Instructor.Created: queue a welcome internal notification for the instructor.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInstructorCreated(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const instructorId = event.payload['instructor_id'] as string | undefined;
  const orgId        = event.organization_id;

  logger.info('handler.instructor_created', { event_id: event.id, org_id: orgId, instructor_id: instructorId });

  if (instructorId === undefined || orgId === null) return { success: true };

  const { error } = await client.from('notifications').insert({
    organization_id: orgId,
    recipient_id:    instructorId,
    recipient_type:  'instructor',
    channel:         'internal',
    template_key:    'instructor.welcome',
    idempotency_key: `instructor.welcome:${instructorId}`,
    reference_type:  'instructor',
    reference_id:    instructorId,
  });

  if (error !== null) {
    if ((error as { code?: string }).code === '23505') return { success: true };
    logger.error('handler.instructor_created.notification_failed', { event_id: event.id, error: error.message });
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Instructor.Updated: no mandatory cross-domain reaction.
async function handleInstructorUpdated(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.instructor_updated', { event_id: event.id, instructor_id: event.payload['instructor_id'] });
  return { success: true };
}

// Instructor.Archived: cancel future open/full slots, then cascade-cancel bookings.
// Booking cancellations emit Lesson.Cancelled events, which handle reminders + waitlist.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInstructorArchived(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const instructorId = event.payload['instructor_id'] as string | undefined;
  const orgId        = event.organization_id;

  logger.info('handler.instructor_archived', { event_id: event.id, instructor_id: instructorId });

  if (instructorId === undefined || orgId === null) return { success: true };

  const now = new Date().toISOString();

  // Fetch future slot IDs to cancel
  const { data: slots, error: slotFetchErr } = await client
    .from('lesson_slots')
    .select('id')
    .eq('instructor_id', instructorId)
    .eq('organization_id', orgId)
    .gt('starts_at', now)
    .in('status', ['open', 'full']);

  if (slotFetchErr !== null) {
    logger.error('handler.instructor_archived.fetch_slots_failed', {
      event_id:      event.id,
      instructor_id: instructorId,
      error:         slotFetchErr.message,
    });
    return { success: false, error: slotFetchErr.message };
  }

  if (!slots || slots.length === 0) return { success: true };

  const slotIds = (slots as Array<{ id: string }>).map((s) => s.id);

  // Cancel the slots
  const { error: slotCancelErr } = await client
    .from('lesson_slots')
    .update({ status: 'cancelled' })
    .in('id', slotIds);

  if (slotCancelErr !== null) {
    logger.error('handler.instructor_archived.cancel_slots_failed', {
      event_id:      event.id,
      instructor_id: instructorId,
      error:         slotCancelErr.message,
    });
    return { success: false, error: slotCancelErr.message };
  }

  // Cascade-cancel active bookings for those slots
  const { error: bookingCancelErr } = await client
    .from('lesson_bookings')
    .update({ status: 'cancelled' })
    .in('slot_id', slotIds)
    .in('status', ['draft', 'reserved', 'confirmed']);

  if (bookingCancelErr !== null) {
    logger.warn('handler.instructor_archived.cascade_cancel_failed', {
      event_id:      event.id,
      instructor_id: instructorId,
      error:         bookingCancelErr.message,
    });
    // Non-fatal: slots are cancelled; booking cascade is best-effort
  }

  logger.info('handler.instructor_archived.slots_cancelled', {
    event_id:      event.id,
    instructor_id: instructorId,
    slots_count:   slotIds.length,
  });
  return { success: true };
}

// Lesson.SlotCreated: no immediate cross-domain action required.
// Waitlist notification is handled downstream when a booking is created.
async function handleLessonSlotCreated(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.lesson_slot_created', {
    event_id:      event.id,
    slot_id:       event.payload['slot_id'],
    instructor_id: event.payload['instructor_id'],
  });
  return { success: true };
}

// Lesson.SlotCancelled: cancel all non-terminal bookings for the slot.
// Each booking update fires the DB trigger which emits Lesson.Cancelled,
// triggering reminders cancellation and waitlist promotion per booking.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLessonSlotCancelled(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const slotId = event.payload['slot_id'] as string | undefined;
  const orgId  = event.organization_id;

  logger.info('handler.lesson_slot_cancelled', { event_id: event.id, slot_id: slotId });

  if (slotId === undefined || orgId === null) return { success: true };

  const { error, count } = await client
    .from('lesson_bookings')
    .update({ status: 'cancelled' })
    .eq('slot_id', slotId)
    .eq('organization_id', orgId)
    .in('status', ['draft', 'reserved', 'confirmed'])
    .select('id', { count: 'exact', head: true });

  if (error !== null) {
    logger.error('handler.lesson_slot_cancelled.cancel_bookings_failed', {
      event_id: event.id,
      slot_id:  slotId,
      error:    error.message,
    });
    return { success: false, error: error.message };
  }

  logger.info('handler.lesson_slot_cancelled.bookings_cancelled', { event_id: event.id, slot_id: slotId, count: count ?? 0 });
  return { success: true };
}

// Lesson.Created: schedule reminders + send booking confirmation notification
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLessonCreated(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const bookingId = event.payload['booking_id'] as string | undefined;
  const orgId     = event.organization_id;

  if (bookingId === undefined) {
    logger.warn('handler.lesson_created.missing_booking_id', { event_id: event.id });
    return { success: true };
  }

  const { data: reminderCount, error } = await client.rpc('schedule_lesson_reminders', {
    p_booking_id: bookingId,
  });

  if (error !== null) {
    logger.error('handler.lesson_created.schedule_reminders_failed', {
      event_id:   event.id,
      booking_id: bookingId,
      error:      error.message,
    });
    return { success: false, error: error.message };
  }

  // Send booking confirmation — fetch slot + student contact in parallel
  if (orgId !== null) {
    try {
      const [bookingResult, slotResult] = await Promise.all([
        client
          .from('lesson_bookings')
          .select('slot_id, student_id, instructor_id')
          .eq('id', bookingId)
          .single(),
        null,
      ]);

      const booking = bookingResult.data as { slot_id: string; student_id: string; instructor_id: string | null } | null;
      if (booking !== null) {
        const [slotRes, studentRes] = await Promise.all([
          client.from('lesson_slots').select('starts_at').eq('id', booking.slot_id).single(),
          client.from('students').select('first_name, phone, email').eq('id', booking.student_id).single(),
        ]);

        const slot    = slotRes.data    as { starts_at: string }                                         | null;
        const student = studentRes.data as { first_name: string; phone: string | null; email: string | null } | null;

        if (slot !== null && student !== null) {
          const startsAt    = new Date(slot.starts_at);
          const datum       = startsAt.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' });
          const tid         = startsAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit',             timeZone: 'Europe/Stockholm' });
          const commPayload: Record<string, string> = {
            trigger_event:   'booking_confirmed',
            organization_id: orgId,
            student_id:      booking.student_id,
            förnamn:         student.first_name ?? '',
            datum,
            tid,
            reference_type:  'lesson_booking',
            reference_id:    bookingId,
          };
          if (student.phone !== null) commPayload['student_phone'] = student.phone;
          if (student.email !== null) commPayload['student_email'] = student.email;

          await client.rpc('insert_outbox_event', {
            p_event_type:      'Communication.Requested',
            p_channel:         'internal',
            p_payload:         commPayload,
            p_organization_id: orgId,
            p_causation_id:    event.id,
          }).then(undefined, (enqueueErr: unknown) => {
            logger.warn('booking_confirmed.enqueue_failed', { event_id: event.id, booking_id: bookingId, error: String(enqueueErr) });
          });

          // PORTALS V1.1 Phase 2: instructor booking-change notifications.
          if (booking.instructor_id !== null) {
            await notifyInstructorOfBookingChange(client, {
              organizationId: orgId,
              instructorId:   booking.instructor_id,
              triggerEvent:   'booking_confirmed',
              elevFornamn:    student.first_name ?? '',
              datum,
              tid,
              referenceId:    bookingId,
              causationId:    event.id,
            });
          }
        }
      }
    } catch (notifErr) {
      // Notification failure is non-fatal — reminders were already scheduled
      logger.warn('booking_confirmed.notification_error', { event_id: event.id, booking_id: bookingId, error: String(notifErr) });
    }
  }

  // H-2: emit lesson_booked event on the student's active package (non-critical)
  if (orgId !== null) {
    await (client as any).rpc('record_lesson_booked_event', {
      p_booking_id:      bookingId,
      p_organization_id: orgId,
    }).then(undefined, (e: unknown) => {
      logger.warn('handler.lesson_created.record_lesson_booked_failed', {
        event_id:   event.id,
        booking_id: bookingId,
        error:      String(e),
      });
    });
  }

  logger.info('handler.lesson_created', {
    event_id:            event.id,
    booking_id:          bookingId,
    reminders_scheduled: reminderCount ?? 0,
  });
  return { success: true };
}

// lead.created (student_leads DB trigger): notify the org owner that a
// prospective customer submitted the public booking/lead-capture form.
// The only existing "notify staff" precedent (resolveOrgOwnerId, below) was
// a single-recipient in-app-only side-channel outside the toggle-driven
// Kommunikation pipeline — this instead goes through the normal
// Communication.Requested funnel so it gets a real, per-channel-toggleable
// row like every customer-facing notification does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLeadCreated(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const leadId = event.payload['lead_id'] as string | undefined;
  const orgId  = event.organization_id;

  if (leadId === undefined || orgId === null) {
    logger.warn('handler.lead_created.missing_data', { event_id: event.id });
    return { success: true };
  }

  try {
    const ownerId = await resolveOrgOwnerId(client, orgId);
    if (ownerId === null) {
      logger.warn('handler.lead_created.no_org_owner', { event_id: event.id, org_id: orgId });
      return { success: true };
    }

    const { data: owner } = await client
      .from('profiles')
      .select('email, phone')
      .eq('id', ownerId)
      .single();

    if (!owner) return { success: true };

    const commPayload: Record<string, string> = {
      trigger_event:      'lead_created',
      organization_id:    orgId,
      admin_id:           ownerId,
      förnamn:             `${event.payload['first_name'] ?? ''} ${event.payload['last_name'] ?? ''}`.trim(),
      körkortskategori:    `${event.payload['license_category'] ?? 'B'}`,
      lead_email:          `${event.payload['email'] ?? ''}`,
      lead_phone:          `${event.payload['phone'] ?? ''}`,
      reference_type:      'student_lead',
      reference_id:        leadId,
    };
    if (owner.email) commPayload['admin_email'] = owner.email;
    if (owner.phone) commPayload['admin_phone'] = owner.phone;

    await client.rpc('insert_outbox_event', {
      p_event_type:      'Communication.Requested',
      p_channel:         'internal',
      p_payload:         commPayload,
      p_organization_id: orgId,
      p_causation_id:    event.id,
    }).then(undefined, (enqueueErr: unknown) => {
      logger.warn('lead_created.enqueue_failed', { event_id: event.id, lead_id: leadId, error: String(enqueueErr) });
    });
  } catch (notifErr) {
    logger.warn('lead_created.notification_error', { event_id: event.id, lead_id: leadId, error: String(notifErr) });
  }

  logger.info('handler.lead_created', { event_id: event.id, lead_id: leadId });
  return { success: true };
}

// enrollment_request.created (enrollment_requests DB trigger): same gap,
// same fix as lead.created above — a package enrollment submitted through
// the public catalog → checkout flow previously notified nobody at all.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEnrollmentRequestCreated(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const enrollmentId = event.payload['enrollment_id'] as string | undefined;
  const orgId        = event.organization_id;

  if (enrollmentId === undefined || orgId === null) {
    logger.warn('handler.enrollment_request_created.missing_data', { event_id: event.id });
    return { success: true };
  }

  try {
    const ownerId = await resolveOrgOwnerId(client, orgId);
    if (ownerId === null) {
      logger.warn('handler.enrollment_request_created.no_org_owner', { event_id: event.id, org_id: orgId });
      return { success: true };
    }

    const { data: owner } = await client
      .from('profiles')
      .select('email, phone')
      .eq('id', ownerId)
      .single();

    if (!owner) return { success: true };

    const commPayload: Record<string, string> = {
      trigger_event:   'enrollment_request_created',
      organization_id: orgId,
      admin_id:        ownerId,
      förnamn:          `${event.payload['first_name'] ?? ''} ${event.payload['last_name'] ?? ''}`.trim(),
      paket:            `${event.payload['package_name'] ?? ''}`,
      belopp:           `${event.payload['final_price_incl_vat'] ?? ''}`,
      lead_email:       `${event.payload['email'] ?? ''}`,
      lead_phone:       `${event.payload['phone'] ?? ''}`,
      reference_type:   'enrollment_request',
      reference_id:     enrollmentId,
    };
    if (owner.email) commPayload['admin_email'] = owner.email;
    if (owner.phone) commPayload['admin_phone'] = owner.phone;

    await client.rpc('insert_outbox_event', {
      p_event_type:      'Communication.Requested',
      p_channel:         'internal',
      p_payload:         commPayload,
      p_organization_id: orgId,
      p_causation_id:    event.id,
    }).then(undefined, (enqueueErr: unknown) => {
      logger.warn('enrollment_request_created.enqueue_failed', { event_id: event.id, enrollment_id: enrollmentId, error: String(enqueueErr) });
    });
  } catch (notifErr) {
    logger.warn('enrollment_request_created.notification_error', { event_id: event.id, enrollment_id: enrollmentId, error: String(notifErr) });
  }

  logger.info('handler.enrollment_request_created', { event_id: event.id, enrollment_id: enrollmentId });
  return { success: true };
}

async function handleLessonUpdated(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.lesson_updated', {
    event_id:   event.id,
    booking_id: event.payload['booking_id'],
    status:     event.payload['status'],
  });
  return { success: true };
}

// Lesson.Cancelled: cancel reminders + promote next waitlist entry
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Notifies every active (non-deleted) guardian linked to a student about a
// booking change. Reuses the exact same Communication.Requested -> runNotify
// dispatch path the student notification below already uses — not a
// separate notification system, just one additional enqueued event per
// existing guardian row (recipient_type='guardian', same trigger_event, same
// sms/email templates the student rules already point at). A student with
// zero guardians simply results in zero extra events.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyGuardiansOfBookingChange(
  client: any,
  params: {
    organizationId: string;
    studentId:      string;
    triggerEvent:   'booking_cancelled' | 'booking_rescheduled';
    förnamn:        string;
    datum:          string;
    tid:            string;
    referenceId?:   string;
    causationId:    string;
  },
): Promise<void> {
  const { data: guardians } = await client
    .from('student_guardians')
    .select('id, email, phone')
    .eq('student_id', params.studentId)
    .eq('organization_id', params.organizationId)
    .is('deleted_at', null);

  for (const g of (guardians ?? []) as Array<{ id: string; email: string; phone: string | null }>) {
    const commPayload: Record<string, string> = {
      trigger_event:   params.triggerEvent,
      organization_id: params.organizationId,
      guardian_id:     g.id,
      förnamn:         params.förnamn,
      datum:           params.datum,
      tid:             params.tid,
      reference_type:  'lesson_booking',
    };
    if (params.referenceId !== undefined) commPayload['reference_id'] = params.referenceId;
    if (g.email)              commPayload['guardian_email'] = g.email;
    if (g.phone !== null)     commPayload['guardian_phone'] = g.phone;

    await client.rpc('insert_outbox_event', {
      p_event_type:      'Communication.Requested',
      p_channel:         'internal',
      p_payload:         commPayload,
      p_organization_id: params.organizationId,
      p_causation_id:    params.causationId,
    }).then(undefined, (enqueueErr: unknown) => {
      logger.warn(`${params.triggerEvent}.guardian_enqueue_failed`, { guardian_id: g.id, error: String(enqueueErr) });
    });
  }
}

// Notifies the instructor a booking on their own schedule belongs to.
// PORTALS V1.1 Phase 2 — mirrors notifyGuardiansOfBookingChange's shape
// exactly, minus the loop: a booking has exactly one instructor (a direct
// FK), not a variable-length list, so a single lookup + single enqueue is
// the natural equivalent, not a new pattern. instructorId always comes from
// event.organization_id / event.payload written by the emit_booking_status_
// changed() trigger (SECURITY DEFINER, reads NEW.instructor_id directly) —
// never from client input, so this never needs to re-validate authorization,
// same trust boundary every other event-worker handler already relies on.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyInstructorOfBookingChange(
  client: any,
  params: {
    organizationId: string;
    instructorId:   string;
    triggerEvent:   'booking_confirmed' | 'booking_cancelled' | 'booking_rescheduled';
    elevFornamn:    string;
    datum:          string;
    tid:            string;
    referenceId?:   string;
    causationId:    string;
  },
): Promise<void> {
  const { data: instructor } = await client
    .from('instructors')
    .select('first_name, email, phone')
    .eq('id', params.instructorId)
    .eq('organization_id', params.organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (instructor === null) return; // removed/not found — nothing to notify

  const ins = instructor as { first_name: string; email: string | null; phone: string | null };

  const commPayload: Record<string, string> = {
    trigger_event:   params.triggerEvent,
    organization_id: params.organizationId,
    instructor_id:   params.instructorId,
    förnamn:         ins.first_name ?? '',
    elev_fornamn:    params.elevFornamn,
    datum:           params.datum,
    tid:             params.tid,
    reference_type:  'lesson_booking',
  };
  if (params.referenceId !== undefined) commPayload['reference_id'] = params.referenceId;
  if (ins.email)          commPayload['instructor_email'] = ins.email;
  if (ins.phone !== null) commPayload['instructor_phone'] = ins.phone;

  await client.rpc('insert_outbox_event', {
    p_event_type:      'Communication.Requested',
    p_channel:         'internal',
    p_payload:         commPayload,
    p_organization_id: params.organizationId,
    p_causation_id:    params.causationId,
  }).then(undefined, (enqueueErr: unknown) => {
    logger.warn(`${params.triggerEvent}.instructor_enqueue_failed`, { instructor_id: params.instructorId, error: String(enqueueErr) });
  });
}

async function handleLessonCancelled(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const bookingId = event.payload['booking_id'] as string | undefined;
  const slotId    = event.payload['slot_id']    as string | undefined;

  if (bookingId !== undefined) {
    const { error: cancelErr } = await client.rpc('cancel_lesson_reminders', {
      p_booking_id: bookingId,
    });
    if (cancelErr !== null) {
      logger.error('handler.lesson_cancelled.cancel_reminders_failed', {
        event_id:   event.id,
        booking_id: bookingId,
        error:      cancelErr.message,
      });
      return { success: false, error: cancelErr.message };
    }
  }

  if (slotId !== undefined) {
    const { data: promotedId, error: promoteErr } = await client.rpc('promote_waitlist_next', {
      p_slot_id: slotId,
    });
    if (promoteErr !== null) {
      logger.warn('handler.lesson_cancelled.promote_waitlist_failed', {
        event_id: event.id,
        slot_id:  slotId,
        error:    promoteErr.message,
      });
      // Non-fatal: promotion failure doesn't prevent reminder cancellation
    } else {
      logger.info('handler.lesson_cancelled', {
        event_id:          event.id,
        booking_id:        bookingId,
        slot_id:           slotId,
        promoted_entry_id: promotedId,
      });
    }

    // Type-based waitlist (lesson_waitlist_entries) — independent of the
    // slot-based one above, checked in addition, not instead. A student
    // waiting for "any slot of lesson type X" should also learn this slot
    // reopened, even if nobody was waiting for this exact slot specifically.
    const { data: lessonWaitlistId, error: lessonWaitlistErr } = await client.rpc('promote_lesson_waitlist_next', {
      p_slot_id: slotId,
    });
    if (lessonWaitlistErr !== null) {
      logger.warn('handler.lesson_cancelled.promote_lesson_waitlist_failed', {
        event_id: event.id,
        slot_id:  slotId,
        error:    lessonWaitlistErr.message,
      });
    } else if (lessonWaitlistId !== null) {
      logger.info('handler.lesson_cancelled.lesson_waitlist_promoted', {
        event_id: event.id, slot_id: slotId, waitlist_entry_id: lessonWaitlistId,
      });
    }
  }

  // Send cancellation notification to student
  const orgId        = event.organization_id;
  const studentId    = event.payload['student_id']    as string | undefined;
  const instructorId = event.payload['instructor_id'] as string | undefined;
  if (orgId !== null && studentId !== undefined) {
    try {
      const [studentRes, slotRes] = await Promise.all([
        client.from('students').select('first_name, phone, email').eq('id', studentId).single(),
        slotId !== undefined
          ? client.from('lesson_slots').select('starts_at').eq('id', slotId).single()
          : Promise.resolve({ data: null }),
      ]);

      const student = studentRes.data as { first_name: string; phone: string | null; email: string | null } | null;
      const slot    = slotRes.data    as { starts_at: string }                                               | null;

      if (student !== null) {
          const startsAt    = slot ? new Date(slot.starts_at) : null;
          const datum       = startsAt ? startsAt.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' }) : '';
          const tid         = startsAt ? startsAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit',             timeZone: 'Europe/Stockholm' }) : '';
          const commPayload: Record<string, string> = {
            trigger_event:   'booking_cancelled',
            organization_id: orgId,
            student_id:      studentId,
            förnamn:         student.first_name ?? '',
            datum,
            tid,
            reference_type:  'lesson_booking',
          };
          if (bookingId !== undefined) commPayload['reference_id'] = bookingId;
          if (student.phone !== null) commPayload['student_phone'] = student.phone;
          if (student.email !== null) commPayload['student_email'] = student.email;

          await client.rpc('insert_outbox_event', {
            p_event_type:      'Communication.Requested',
            p_channel:         'internal',
            p_payload:         commPayload,
            p_organization_id: orgId,
            p_causation_id:    event.id,
          }).then(undefined, (enqueueErr: unknown) => {
            logger.warn('booking_cancelled.enqueue_failed', { event_id: event.id, error: String(enqueueErr) });
          });

          await notifyGuardiansOfBookingChange(client, {
            organizationId: orgId,
            studentId,
            triggerEvent:   'booking_cancelled',
            förnamn:        student.first_name ?? '',
            datum,
            tid,
            referenceId:    bookingId,
            causationId:    event.id,
          });

          // PORTALS V1.1 Phase 2: instructor booking-change notifications.
          // instructor_id comes straight from the trusted outbox payload
          // (written by emit_booking_status_changed(), not client input) and
          // fires identically regardless of who cancelled — student self-
          // service, reception, or any other authorized path all update the
          // same lesson_bookings.status column the DB trigger watches.
          if (instructorId !== undefined) {
            await notifyInstructorOfBookingChange(client, {
              organizationId: orgId,
              instructorId,
              triggerEvent:   'booking_cancelled',
              elevFornamn:    student.first_name ?? '',
              datum,
              tid,
              referenceId:    bookingId,
              causationId:    event.id,
            });
          }
      }
    } catch (notifErr) {
      logger.warn('booking_cancelled.notification_error', { event_id: event.id, error: String(notifErr) });
    }
  }

  return { success: true };
}

// Lesson.Rescheduled: cancel old reminders, schedule new reminders, notify student of new time
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLessonRescheduled(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const oldBookingId = event.payload['old_booking_id'] as string | undefined;
  const newBookingId = event.payload['new_booking_id'] as string | undefined;
  const orgId        = event.organization_id;

  if (oldBookingId !== undefined) {
    await client.rpc('cancel_lesson_reminders', { p_booking_id: oldBookingId });
  }

  if (newBookingId !== undefined) {
    const { data: count, error } = await client.rpc('schedule_lesson_reminders', {
      p_booking_id: newBookingId,
    });
    if (error !== null) {
      logger.error('handler.lesson_rescheduled.schedule_reminders_failed', {
        event_id:       event.id,
        new_booking_id: newBookingId,
        error:          error.message,
      });
      return { success: false, error: error.message };
    }
    logger.info('handler.lesson_rescheduled', {
      event_id:            event.id,
      old_booking_id:      oldBookingId,
      new_booking_id:      newBookingId,
      reminders_scheduled: count ?? 0,
    });

    // Dispatch booking_rescheduled notification with new lesson time
    if (orgId !== null) {
      try {
        const { data: booking } = await client
          .from('lesson_bookings')
          .select('slot_id, student_id, instructor_id')
          .eq('id', newBookingId)
          .single();

        const b = booking as { slot_id: string; student_id: string; instructor_id: string | null } | null;
        if (b !== null) {
          const [slotRes, studentRes] = await Promise.all([
            client.from('lesson_slots').select('starts_at').eq('id', b.slot_id).single(),
            client.from('students').select('first_name, phone, email').eq('id', b.student_id).single(),
          ]);

          const slot    = slotRes.data    as { starts_at: string }                                         | null;
          const student = studentRes.data as { first_name: string; phone: string | null; email: string | null } | null;

          if (slot !== null && student !== null) {
            const startsAt = new Date(slot.starts_at);
            const datum    = startsAt.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' });
            const tid      = startsAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
            const commPayload: Record<string, string> = {
              trigger_event:   'booking_rescheduled',
              organization_id: orgId,
              student_id:      b.student_id,
              förnamn:         student.first_name ?? '',
              datum,
              tid,
              reference_type:  'lesson_booking',
              reference_id:    newBookingId,
            };
            if (student.phone !== null) commPayload['student_phone'] = student.phone;
            if (student.email !== null) commPayload['student_email'] = student.email;

            await client.rpc('insert_outbox_event', {
              p_event_type:      'Communication.Requested',
              p_channel:         'internal',
              p_payload:         commPayload,
              p_organization_id: orgId,
              p_causation_id:    event.id,
            }).then(undefined, (enqueueErr: unknown) => {
              logger.warn('booking_rescheduled.enqueue_failed', { event_id: event.id, error: String(enqueueErr) });
            });

            await notifyGuardiansOfBookingChange(client, {
              organizationId: orgId,
              studentId:      b.student_id,
              triggerEvent:   'booking_rescheduled',
              förnamn:        student.first_name ?? '',
              datum,
              tid,
              referenceId:    newBookingId,
              causationId:    event.id,
            });

            // PORTALS V1.1 Phase 2: instructor booking-change notifications.
            // Resolved from the new booking row (the one the instructor
            // actually now has on their schedule) — Lesson.Rescheduled's own
            // outbox payload only carries old/new booking ids, not
            // instructor_id, so it's re-fetched here same as student_id
            // already was.
            if (b.instructor_id !== null) {
              await notifyInstructorOfBookingChange(client, {
                organizationId: orgId,
                instructorId:   b.instructor_id,
                triggerEvent:   'booking_rescheduled',
                elevFornamn:    student.first_name ?? '',
                datum,
                tid,
                referenceId:    newBookingId,
                causationId:    event.id,
              });
            }
          }
        }
      } catch (notifErr) {
        logger.warn('booking_rescheduled.notification_error', { event_id: event.id, error: String(notifErr) });
      }
    }
  }

  return { success: true };
}

// ── Phase 3D handlers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleWaitlistPromoted(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const studentId           = event.payload['student_id']           as string | undefined;
  const slotId              = event.payload['slot_id']              as string | undefined;
  const reservationDeadline = event.payload['reservation_deadline'] as string | undefined;
  const orgId               = event.organization_id;

  logger.info('handler.waitlist_promoted', {
    event_id:             event.id,
    waitlist_entry_id:    event.payload['waitlist_entry_id'],
    student_id:           studentId,
    slot_id:              slotId,
    reservation_deadline: reservationDeadline,
  });

  if (studentId !== undefined && orgId !== null) {
    try {
      const [studentRes, slotRes] = await Promise.all([
        client.from('students').select('first_name, phone, email').eq('id', studentId).single(),
        slotId !== undefined
          ? client.from('lesson_slots').select('starts_at').eq('id', slotId).single()
          : Promise.resolve({ data: null }),
      ]);

      const student = studentRes.data as { first_name: string; phone: string | null; email: string | null } | null;
      const slot    = slotRes.data    as { starts_at: string }                                               | null;

      if (student !== null) {
        const startsAt = slot ? new Date(slot.starts_at) : null;
        const datum    = startsAt ? startsAt.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' }) : '';
        const tid      = startsAt ? startsAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }) : '';
        const commPayload: Record<string, string> = {
          trigger_event:   'waitlist_promoted',
          organization_id: orgId,
          student_id:      studentId,
          förnamn:         student.first_name ?? '',
          datum,
          tid,
          reference_type:  'waitlist_entry',
          reference_id:    event.payload['waitlist_entry_id'] as string,
        };
        if (reservationDeadline !== undefined) commPayload['reservation_deadline'] = reservationDeadline;
        if (student.phone !== null) commPayload['student_phone'] = student.phone;
        if (student.email !== null) commPayload['student_email'] = student.email;

        await client.rpc('insert_outbox_event', {
          p_event_type:      'Communication.Requested',
          p_channel:         'internal',
          p_payload:         commPayload,
          p_organization_id: orgId,
          p_causation_id:    event.id,
        }).then(undefined, (enqueueErr: unknown) => {
          logger.warn('waitlist_promoted.enqueue_failed', { event_id: event.id, error: String(enqueueErr) });
        });

        logger.info('handler.waitlist_promoted.dispatched', { event_id: event.id, student_id: studentId });
      } else {
        logger.info('handler.waitlist_promoted.no_contact', { event_id: event.id, student_id: studentId });
      }
    } catch (notifErr) {
      logger.warn('waitlist_promoted.notification_error', { event_id: event.id, error: String(notifErr) });
    }
  }

  return { success: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReservationExpired(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const studentId = event.payload['student_id'] as string | undefined;
  const slotId    = event.payload['slot_id']    as string | undefined;
  const orgId     = event.organization_id;

  logger.info('handler.reservation_expired', {
    event_id:   event.id,
    booking_id: event.payload['booking_id'],
    student_id: studentId,
    slot_id:    slotId,
  });

  // The vacated slot must be re-offered to the next waitlist entry — the
  // same rpc handleLessonCancelled already uses for the identical situation
  // (a slot becoming free). Without this, a slot freed by a reservation
  // that simply timed out (as opposed to an explicit cancellation) would
  // never cycle to the next person on the waitlist.
  if (slotId !== undefined) {
    const { data: promotedId, error: promoteErr } = await client.rpc('promote_waitlist_next', {
      p_slot_id: slotId,
    });
    if (promoteErr !== null) {
      logger.warn('handler.reservation_expired.promote_waitlist_failed', {
        event_id: event.id, slot_id: slotId, error: promoteErr.message,
      });
    } else if (promotedId) {
      logger.info('handler.reservation_expired.promoted_next', { event_id: event.id, slot_id: slotId, promoted_entry_id: promotedId });
    }
  }

  // Tell the student their reservation lapsed — previously a silent no-op,
  // so a student promoted off the waitlist who missed the confirmation
  // window was never told why they lost the slot. Same
  // Communication.Requested enqueue pattern as handleWaitlistPromoted.
  if (studentId !== undefined && orgId !== null) {
    try {
      const [studentRes, slotRes] = await Promise.all([
        client.from('students').select('first_name, phone, email').eq('id', studentId).single(),
        slotId !== undefined
          ? client.from('lesson_slots').select('starts_at').eq('id', slotId).single()
          : Promise.resolve({ data: null }),
      ]);

      const student = studentRes.data as { first_name: string; phone: string | null; email: string | null } | null;
      const slot    = slotRes.data    as { starts_at: string }                                               | null;

      if (student !== null) {
        const startsAt = slot ? new Date(slot.starts_at) : null;
        const datum    = startsAt ? startsAt.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' }) : '';
        const tid      = startsAt ? startsAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }) : '';
        const commPayload: Record<string, string> = {
          trigger_event:   'reservation_expired',
          organization_id: orgId,
          student_id:      studentId,
          förnamn:         student.first_name ?? '',
          datum,
          tid,
          reference_type:  'lesson_booking',
          reference_id:    event.payload['booking_id'] as string,
        };
        if (student.phone !== null) commPayload['student_phone'] = student.phone;
        if (student.email !== null) commPayload['student_email'] = student.email;

        await client.rpc('insert_outbox_event', {
          p_event_type:      'Communication.Requested',
          p_channel:         'internal',
          p_payload:         commPayload,
          p_organization_id: orgId,
          p_causation_id:    event.id,
        }).then(undefined, (enqueueErr: unknown) => {
          logger.warn('reservation_expired.enqueue_failed', { event_id: event.id, error: String(enqueueErr) });
        });

        logger.info('handler.reservation_expired.dispatched', { event_id: event.id, student_id: studentId });
      } else {
        logger.info('handler.reservation_expired.no_contact', { event_id: event.id, student_id: studentId });
      }
    } catch (notifErr) {
      logger.warn('reservation_expired.notification_error', { event_id: event.id, error: String(notifErr) });
    }
  }

  return { success: true };
}

async function handleReminderSent(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.reminder_sent', {
    event_id:    event.id,
    reminder_id: event.payload['reminder_id'],
    booking_id:  event.payload['booking_id'],
    template:    event.payload['template_key'],
  });
  return { success: true };
}

async function handleNotificationDelivered(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.notification_delivered', {
    event_id:        event.id,
    notification_id: event.payload['notification_id'],
    recipient_id:    event.payload['recipient_id'],
    template_key:    event.payload['template_key'],
  });
  return { success: true };
}

// ── Phase 4A commercial handlers (accounting channel) ─────────────────────────
// Phase 4A: all handlers are stubs — log and acknowledge.
// Phase 4B: swap for real analytics sync, invoice notifications, etc.

async function handlePackagePurchased(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.package_purchased', {
    event_id:           event.id,
    student_package_id: event.payload['student_package_id'],
    student_id:         event.payload['student_id'],
    offering_name:      event.payload['offering_name'],
    quantity_granted:   event.payload['quantity_granted'],
    lesson_category:    event.payload['lesson_category'],
    price:              event.payload['price'],
    currency:           event.payload['currency'],
  });
  return { success: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInvoiceIssued(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const studentId     = event.payload['student_id']     as string | undefined;
  const invoiceNumber = event.payload['invoice_number'] as string | undefined;
  const totalAmount   = event.payload['total_amount']   as number | undefined;
  const orgId         = event.organization_id;

  logger.info('handler.invoice_issued', {
    event_id:       event.id,
    invoice_id:     event.payload['invoice_id'],
    invoice_number: invoiceNumber,
    student_id:     studentId,
    total_amount:   totalAmount,
    currency:       event.payload['currency'],
  });

  if (studentId !== undefined && orgId !== null) {
    try {
      const { data: student } = await client
        .from('students')
        .select('first_name, phone, email')
        .eq('id', studentId)
        .single();

      const s = student as { first_name: string; phone: string | null; email: string | null } | null;
      if (s !== null && (s.phone !== null || s.email !== null)) {
        const commPayload: Record<string, string> = {
          trigger_event:   'invoice_issued',
          organization_id: orgId,
          förnamn:         s.first_name ?? '',
          fakturanummer:   invoiceNumber ?? '',
          belopp:          totalAmount !== undefined ? String(totalAmount) : '',
        };
        if (s.phone !== null) commPayload['student_phone'] = s.phone;
        if (s.email !== null) commPayload['student_email'] = s.email;

        await client.rpc('insert_outbox_event', {
          p_event_type:      'Communication.Requested',
          p_channel:         'internal',
          p_payload:         commPayload,
          p_organization_id: orgId,
          p_causation_id:    event.id,
        }).then(undefined, (enqueueErr: unknown) => {
          logger.warn('invoice_issued.enqueue_failed', { event_id: event.id, error: String(enqueueErr) });
        });
      }
    } catch (notifErr) {
      logger.warn('invoice_issued.notification_error', { event_id: event.id, error: String(notifErr) });
    }
  }

  return { success: true };
}

async function handleInvoicePaid(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.invoice_paid', {
    event_id:        event.id,
    invoice_id:      event.payload['invoice_id'],
    invoice_number:  event.payload['invoice_number'],
    student_id:      event.payload['student_id'],
    total_amount:    event.payload['total_amount'],
    payment_id:      event.payload['payment_id'],
  });
  return { success: true };
}

async function handleInvoiceVoided(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.invoice_voided', {
    event_id:        event.id,
    invoice_id:      event.payload['invoice_id'],
    invoice_number:  event.payload['invoice_number'],
    student_id:      event.payload['student_id'],
    reason:          event.payload['reason'],
  });
  return { success: true };
}

async function handlePaymentReceived(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.payment_received', {
    event_id:   event.id,
    payment_id: event.payload['payment_id'],
    invoice_id: event.payload['invoice_id'],
    student_id: event.payload['student_id'],
    amount:     event.payload['amount'],
    method:     event.payload['method'],
  });
  return { success: true };
}

async function handleCreditGranted(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.credit_granted', {
    event_id:           event.id,
    ledger_id:          event.payload['ledger_id'],
    student_id:         event.payload['student_id'],
    lesson_category:    event.payload['lesson_category'],
    quantity:           event.payload['quantity'],
    expires_at:         event.payload['expires_at'],
    student_package_id: event.payload['student_package_id'],
  });
  return { success: true };
}

async function handleCreditConsumed(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.credit_consumed', {
    event_id:        event.id,
    ledger_id:       event.payload['ledger_id'],
    student_id:      event.payload['student_id'],
    lesson_category: event.payload['lesson_category'],
    quantity:        event.payload['quantity'],
    booking_id:      event.payload['booking_id'],
  });
  return { success: true };
}

async function handleCreditExpired(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.credit_expired', {
    event_id:        event.id,
    ledger_id:       event.payload['ledger_id'],
    student_id:      event.payload['student_id'],
    lesson_category: event.payload['lesson_category'],
    quantity:        event.payload['quantity'],
    expired_at:      event.payload['expired_at'],
  });
  // TODO: notify student that credits have expired
  return { success: true };
}

// ── Phase 4B commercial handlers (accounting + internal channels) ─────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRefundProcessed(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const studentId    = event.payload['student_id']    as string | undefined;
  const invoiceId     = event.payload['invoice_id']    as string | undefined;
  const refundAmount = event.payload['refund_amount'] as number | undefined;
  const orgId        = event.organization_id;

  logger.info('handler.refund_processed', {
    event_id:        event.id,
    refund_id:       event.payload['refund_id'],
    invoice_id:      invoiceId,
    student_id:      studentId,
    refund_type:     event.payload['refund_type'],
    reason_code:     event.payload['reason_code'],
    refund_amount:   refundAmount,
    credit_quantity: event.payload['credit_quantity'],
  });

  // Tell the student their refund was processed — previously a silent
  // no-op, so a student who received money back was never told. Same
  // Communication.Requested enqueue pattern as handleReservationExpired.
  // (The ledger side of the same original TODO — posting the refund to
  // the accounting books — is handled separately via
  // post_refund_journal_entry, triggered from the Refunds page.)
  if (studentId !== undefined && orgId !== null && refundAmount !== undefined && refundAmount > 0) {
    try {
      const [studentRes, invoiceRes] = await Promise.all([
        client.from('students').select('first_name, phone, email').eq('id', studentId).single(),
        invoiceId !== undefined
          ? client.from('invoices').select('invoice_number').eq('id', invoiceId).single()
          : Promise.resolve({ data: null }),
      ]);

      const student = studentRes.data as { first_name: string; phone: string | null; email: string | null } | null;
      const invoice = invoiceRes.data  as { invoice_number: string | null }                                  | null;

      if (student !== null && (student.phone !== null || student.email !== null)) {
        const commPayload: Record<string, string> = {
          trigger_event:   'refund_processed',
          organization_id: orgId,
          student_id:      studentId,
          förnamn:         student.first_name ?? '',
          belopp:          String(refundAmount),
          fakturanummer:   invoice?.invoice_number ?? '',
          reference_type:  'refund',
          reference_id:    event.payload['refund_id'] as string,
        };
        if (student.phone !== null) commPayload['student_phone'] = student.phone;
        if (student.email !== null) commPayload['student_email'] = student.email;

        await client.rpc('insert_outbox_event', {
          p_event_type:      'Communication.Requested',
          p_channel:         'internal',
          p_payload:         commPayload,
          p_organization_id: orgId,
          p_causation_id:    event.id,
        }).then(undefined, (enqueueErr: unknown) => {
          logger.warn('refund_processed.enqueue_failed', { event_id: event.id, error: String(enqueueErr) });
        });

        logger.info('handler.refund_processed.dispatched', { event_id: event.id, student_id: studentId });
      } else {
        logger.info('handler.refund_processed.no_contact', { event_id: event.id, student_id: studentId });
      }
    } catch (notifErr) {
      logger.warn('refund_processed.notification_error', { event_id: event.id, error: String(notifErr) });
    }
  }

  return { success: true };
}

async function handlePaymentReconciled(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.payment_reconciled', {
    event_id:                  event.id,
    allocation_id:             event.payload['allocation_id'],
    payment_id:                event.payload['payment_id'],
    invoice_id:                event.payload['invoice_id'],
    allocated_amount:          event.payload['allocated_amount'],
    invoice_outstanding_after: event.payload['invoice_outstanding_after'],
  });
  // TODO: enqueue in accounting_export_queue
  return { success: true };
}

async function handleDiscountApplied(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.discount_applied', {
    event_id:         event.id,
    application_id:   event.payload['application_id'],
    discount_id:      event.payload['discount_id'],
    discount_name:    event.payload['discount_name'],
    invoice_id:       event.payload['invoice_id'],
    discount_amount:  event.payload['discount_amount'],
  });
  return { success: true };
}

async function handleCouponRedeemed(event: OutboxEvent, _client: unknown): Promise<HandlerResult> {
  logger.info('handler.coupon_redeemed', {
    event_id:        event.id,
    coupon_id:       event.payload['coupon_id'],
    coupon_code:     event.payload['coupon_code'],
    student_id:      event.payload['student_id'],
    invoice_id:      event.payload['invoice_id'],
  });
  return { success: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInvoiceOverdue(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const studentId  = event.payload['student_id']  as string | undefined;
  const daysOverdue = event.payload['days_overdue'] as number | undefined;
  const dueDate    = event.payload['due_date']     as string | undefined;
  const orgId      = event.organization_id;

  logger.info('handler.invoice_overdue', {
    event_id:     event.id,
    invoice_id:   event.payload['invoice_id'],
    student_id:   studentId,
    days_overdue: daysOverdue,
    due_date:     dueDate,
  });

  if (studentId !== undefined && orgId !== null) {
    try {
      const { data: student } = await client
        .from('students')
        .select('first_name, phone, email')
        .eq('id', studentId)
        .single();

      const s = student as { first_name: string; phone: string | null; email: string | null } | null;
      if (s !== null && (s.phone !== null || s.email !== null)) {
        const commPayload: Record<string, string> = {
          trigger_event:   'invoice_overdue',
          organization_id: orgId,
          förnamn:         s.first_name ?? '',
          dagar_försenad:  daysOverdue !== undefined ? String(daysOverdue) : '',
          förfallodatum:   dueDate ?? '',
        };
        if (s.phone !== null) commPayload['student_phone'] = s.phone;
        if (s.email !== null) commPayload['student_email'] = s.email;

        await client.rpc('insert_outbox_event', {
          p_event_type:      'Communication.Requested',
          p_channel:         'internal',
          p_payload:         commPayload,
          p_organization_id: orgId,
          p_causation_id:    event.id,
        }).then(undefined, (enqueueErr: unknown) => {
          logger.warn('invoice_overdue.enqueue_failed', { event_id: event.id, error: String(enqueueErr) });
        });
      }
    } catch (notifErr) {
      logger.warn('invoice_overdue.notification_error', { event_id: event.id, error: String(notifErr) });
    }
  }

  return { success: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInvoiceReminderSent(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const invoiceId  = event.payload['invoice_id'] as string | undefined;
  const studentId  = event.payload['student_id'] as string | undefined;
  const actionType = event.payload['action_type'] as string | undefined;
  const orgId      = event.organization_id;

  logger.info('handler.invoice_reminder_sent', {
    event_id:        event.id,
    invoice_id:      invoiceId,
    student_id:      studentId,
    stage_number:    event.payload['stage_number'],
    action_type:     actionType,
    reminder_log_id: event.payload['reminder_log_id'],
    is_automated:    event.payload['is_automated'],
  });

  // 'legal' is an internal escalation, not a customer-facing reminder — no
  // dispatch. email/sms/both all route through the same trigger_event; the
  // actual channel is decided by the org's own notification_rules config for
  // 'invoice_overdue' (communication-worker's existing lookup), same as
  // every other trigger_event in this file — no new channel logic here.
  if (actionType !== 'email' && actionType !== 'sms' && actionType !== 'both') {
    return { success: true };
  }
  if (invoiceId === undefined || studentId === undefined || orgId === null) {
    return { success: true };
  }

  // Mirrors handleInvoiceIssued's exact pattern: enqueue Communication.Requested
  // rather than calling communication-worker directly, so the single dispatch
  // point (handleCommunicationRequested) and its existing retry/dead-letter
  // handling apply here too. Uses the already-seeded 'invoice_overdue'
  // template (phase_a_notification_templates.sql) — previously unreachable,
  // since this handler never enqueued anything.
  try {
    const [{ data: student }, { data: invoice }, { data: dunningState }] = await Promise.all([
      client.from('students').select('first_name, phone, email').eq('id', studentId).single(),
      client.from('invoices').select('invoice_number, outstanding_amount, due_date').eq('id', invoiceId).single(),
      client.from('invoice_dunning_state').select('current_stage_id').eq('invoice_id', invoiceId).maybeSingle(),
    ]);

    const s   = student as { first_name: string; phone: string | null; email: string | null } | null;
    const inv = invoice as { invoice_number: string; outstanding_amount: number; due_date: string | null } | null;
    const stageId = (dunningState as { current_stage_id: string | null } | null)?.current_stage_id ?? null;

    if (s !== null && inv !== null && (s.phone !== null || s.email !== null)) {
      const commPayload: Record<string, string> = {
        trigger_event:   'invoice_overdue',
        organization_id: orgId,
        förnamn:         s.first_name ?? '',
        fakturanr:       inv.invoice_number ?? '',
        belopp:          inv.outstanding_amount !== undefined ? String(inv.outstanding_amount) : '',
        förfallodatum:   inv.due_date ?? '',
      };
      if (s.phone !== null) commPayload['student_phone'] = s.phone;
      if (s.email !== null) commPayload['student_email'] = s.email;

      // Admins can author a custom subject/message per dunning stage
      // (dunning_schedule_stages.subject_template/message_template — set
      // via the "Lägg till steg" dialog) but until now nothing ever read
      // them back: every stage sent the identical generic 'invoice_overdue'
      // template regardless of whether it was a friendly first reminder or
      // a final legal-escalation warning. Pass them through as an override
      // for communication-worker to render instead, when the stage has
      // actually customized its copy.
      if (stageId !== null) {
        const { data: stage } = await client
          .from('dunning_schedule_stages')
          .select('subject_template, message_template')
          .eq('id', stageId)
          .maybeSingle();
        const st = stage as { subject_template: string | null; message_template: string | null } | null;
        if (st?.message_template) commPayload['override_body'] = st.message_template;
        if (st?.subject_template) commPayload['override_subject'] = st.subject_template;
      }

      const { error: enqueueErr } = await client.rpc('insert_outbox_event', {
        p_event_type:      'Communication.Requested',
        p_channel:         'internal',
        p_payload:         commPayload,
        p_organization_id: orgId,
        p_causation_id:    event.id,
      });
      if (enqueueErr) {
        logger.warn('invoice_reminder_sent.enqueue_failed', { event_id: event.id, error: String(enqueueErr) });
        return { success: false, error: String(enqueueErr) };
      }
    }
  } catch (notifErr) {
    logger.warn('invoice_reminder_sent.notification_error', { event_id: event.id, error: String(notifErr) });
    return { success: false, error: String(notifErr) };
  }

  return { success: true };
}

// Communication.Requested: the single point where event-worker calls communication-worker.
// All domain handlers (booking confirmed, cancelled, reminders) enqueue this event type
// instead of calling communication-worker/notify directly, preserving the outbox contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCommunicationRequested(event: OutboxEvent, client: any): Promise<HandlerResult> {
  const payload      = event.payload as Record<string, unknown>;
  const notifId      = payload['_notification_id'] as string | null | undefined;
  const workerUrl    = `${Deno.env.get('SUPABASE_URL')}/functions/v1/communication-worker/notify`;
  const workerSecret = Deno.env.get('WORKER_SECRET');

  logger.info('handler.communication_requested', {
    event_id:      event.id,
    trigger_event: payload['trigger_event'],
    org_id:        event.organization_id,
  });

  if (workerSecret === undefined || workerSecret === '') {
    logger.warn('handler.communication_requested.no_secret', { event_id: event.id });
    return { success: true };
  }

  // Strip internal metadata fields before forwarding to communication-worker
  const workerPayload: Record<string, unknown> = { ...payload };
  delete workerPayload['_notification_id'];

  const resp = await fetch(workerUrl, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${workerSecret}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(workerPayload),
  }).catch((err: unknown) => {
    logger.warn('handler.communication_requested.fetch_failed', { event_id: event.id, error: String(err) });
    return null;
  });

  if (resp !== null && !resp.ok) {
    const errText = await resp.text().catch(() => '');
    logger.error('handler.communication_requested.non_ok', {
      event_id:    event.id,
      http_status: resp.status,
      body:        errText.slice(0, 200),
    });
    return { success: false, error: `HTTP ${resp.status}` };
  }

  // Mark the associated notification as sent (supplied by processReminder)
  if (notifId !== null && notifId !== undefined) {
    await client
      .from('notifications')
      .update({ status: 'sent', status_changed_at: new Date().toISOString(), sent_at: new Date().toISOString() })
      .eq('id', notifId)
      .then(undefined, (e: unknown) => {
        logger.warn('handler.communication_requested.update_notification_failed', {
          event_id: event.id,
          notif_id: notifId,
          error:    String(e),
        });
      });
  }

  logger.info('handler.communication_requested.dispatched', {
    event_id:      event.id,
    trigger_event: payload['trigger_event'],
  });
  return { success: true };
}

// ─── Handler registry ─────────────────────────────────────────────────────────

const HANDLER_REGISTRY: Record<string, EventHandler> = {
  'Student.Created':         handleStudentCreated,
  'Student.Updated':         handleStudentUpdated,
  'Student.Archived':        handleStudentArchived,
  'student.status_changed':  handleStudentStatusChanged, // DB trigger alias — see handleStudentStatusChanged comment
  'Instructor.Created':      handleInstructorCreated,
  'Instructor.Updated':      handleInstructorUpdated,
  'Instructor.Archived':     handleInstructorArchived,
  'Lesson.SlotCreated':      handleLessonSlotCreated,
  'Lesson.SlotCancelled':    handleLessonSlotCancelled,
  'booking.created':         handleLessonCreated,   // Phase 2B DB trigger alias
  'booking.cancelled':       handleLessonCancelled, // Phase 2B DB trigger alias — was missing; cancelling a
                                                     // booking never re-promoted the waitlist until this was added
  'lead.created':            handleLeadCreated,     // student_leads DB trigger — notify org owner of a new public lead
  'enrollment_request.created': handleEnrollmentRequestCreated, // enrollment_requests DB trigger — notify org owner of a new package enrollment
  'Lesson.Created':          handleLessonCreated,
  'Lesson.Updated':          handleLessonUpdated,
  'Lesson.Cancelled':        handleLessonCancelled,
  'Lesson.Rescheduled':      handleLessonRescheduled,
  // Phase 3D: Automation + notification events
  'Waitlist.Promoted':       handleWaitlistPromoted,
  'Reservation.Expired':     handleReservationExpired,
  'Reminder.Sent':           handleReminderSent,
  'Notification.Delivered':  handleNotificationDelivered,
  // Phase 4A: Commercial accounting events (accounting channel)
  'Package.Purchased':       handlePackagePurchased,
  'Invoice.Issued':          handleInvoiceIssued,
  'Invoice.Paid':            handleInvoicePaid,
  'Invoice.Voided':          handleInvoiceVoided,
  'Payment.Received':        handlePaymentReceived,
  'Credit.Granted':          handleCreditGranted,
  'Credit.Consumed':         handleCreditConsumed,
  'Credit.Expired':          handleCreditExpired,
  // Phase 4B: Refunds, reconciliation, discounts, dunning
  'Refund.Processed':        handleRefundProcessed,
  'Payment.Reconciled':      handlePaymentReconciled,
  'Discount.Applied':        handleDiscountApplied,
  'Coupon.Redeemed':         handleCouponRedeemed,
  'Invoice.Overdue':         handleInvoiceOverdue,
  'Invoice.ReminderSent':    handleInvoiceReminderSent,
  // Cross-domain communication dispatch (single handler for all outbound notifications)
  'Communication.Requested': handleCommunicationRequested,
};

// ─── Maintenance tick ─────────────────────────────────────────────────────────
// Runs after every outbox drain. Handles time-based automation that isn't
// driven by outbox events: reminder dispatch + stale reservation expiry.

interface MaintenanceMetrics {
  reminders_processed:     number;
  reminders_failed:        number;
  reservations_expired:    number;
  credits_expired:         number;
  dunning_processed:       number;
  instructor_digests_sent: number;
  campaigns_transitioned:  number;
  packages_expired:        number;
  regulatory_reminders_sent: number;
  stale_booking_reminders_sent: number;
  vehicle_compliance_reminders_sent: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processReminder(client: any, reminder: Record<string, unknown>, workerId: string): Promise<boolean> {
  const reminderId    = reminder['id']              as string;
  const orgId         = reminder['organization_id'] as string;
  const bookingId     = reminder['booking_id']      as string;
  const recipientId   = reminder['recipient_id']    as string;
  const recipientType = reminder['recipient_type']  as string;
  const reminderType  = reminder['reminder_type']   as string;
  const templateKey   = REMINDER_TYPE_TO_TEMPLATE[reminderType] ?? `lesson.${reminderType}`;
  const triggerEvent  = REMINDER_TYPE_TO_TRIGGER[reminderType]  ?? 'booking_reminder_24h';
  const idemKey       = `notif:reminder:${reminderId}`;

  try {
    // Fetch booking → slot start time + student contact for dispatch payload
    const { data: booking, error: bookingErr } = await client
      .from('lesson_bookings')
      .select('slot_id, student_id')
      .eq('id', bookingId)
      .single();

    if (bookingErr !== null || booking === null) {
      logger.warn('reminder.booking_not_found', { worker_id: workerId, reminder_id: reminderId, booking_id: bookingId });
      await client.from('lesson_reminders').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', reminderId);
      return false;
    }

    // Parallel fetch: slot start time + student contact details
    const [slotResult, studentResult] = await Promise.all([
      client.from('lesson_slots').select('starts_at').eq('id', booking.slot_id).single(),
      client.from('students').select('first_name, phone, email, communication_opt_in_sms').eq('id', booking.student_id).single(),
    ]);

    const slot    = slotResult.data    as { starts_at: string }                                                                     | null;
    const student = studentResult.data as { first_name: string; phone: string | null; email: string | null; communication_opt_in_sms: boolean } | null;

    const startsAt = slot ? new Date(slot.starts_at) : null;
    const datum    = startsAt ? startsAt.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' }) : '';
    const tid      = startsAt ? startsAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })            : '';

    // Create idempotent notification row (internal visibility + dedup guard)
    const { data: notif, error: insertErr } = await client
      .from('notifications')
      .insert({
        organization_id: orgId,
        recipient_id:    recipientId,
        recipient_type:  recipientType,
        channel:         'email',
        template_key:    templateKey,
        locale:          'sv',
        status:          'sending',
        idempotency_key: idemKey,
        reference_type:  'lesson_booking',
        reference_id:    bookingId,
      })
      .select('id')
      .single();

    // Duplicate key = reminder already processed by a concurrent worker; skip dispatch
    const isDuplicate = insertErr !== null && insertErr.message.includes('duplicate key');
    if (insertErr !== null && !isDuplicate) {
      throw new Error(insertErr.message);
    }

    const notifId = notif?.id ?? null;

    // Enqueue Communication.Requested so the dedicated handler dispatches
    // to communication-worker on the next drain cycle (outbox pattern — no direct HTTP).
    if (!isDuplicate && student !== null) {
      const commPayload: Record<string, string | null> = {
        trigger_event:     triggerEvent,
        organization_id:   orgId,
        student_id:        booking.student_id,
        förnamn:           student.first_name ?? '',
        datum,
        tid,
        _notification_id:  notifId,
      };
      if (student.phone !== null) commPayload['student_phone'] = student.phone;
      if (student.email !== null) commPayload['student_email'] = student.email;

      await client.rpc('insert_outbox_event', {
        p_event_type:      'Communication.Requested',
        p_channel:         'internal',
        p_payload:         commPayload,
        p_organization_id: orgId,
        p_target_id:       reminderId,
      }).then(undefined, (enqueueErr: unknown) => {
        logger.warn('reminder.enqueue_failed', { worker_id: workerId, reminder_id: reminderId, error: String(enqueueErr) });
      });

      logger.info('notification.enqueued', { worker_id: workerId, trigger_event: triggerEvent, recipient_id: recipientId, booking_id: bookingId });
    } else if (!isDuplicate) {
      logger.info('reminder.no_contact', { worker_id: workerId, reminder_id: reminderId, recipient_id: recipientId });
    }

    // Mark reminder sent and link notification
    await client
      .from('lesson_reminders')
      .update({ status: 'sent', notification_id: notifId, updated_at: new Date().toISOString() })
      .eq('id', reminderId);

    // Publish Reminder.Sent event
    await client.rpc('insert_outbox_event', {
      p_event_type:      'Reminder.Sent',
      p_channel:         'internal',
      p_payload:         { reminder_id: reminderId, booking_id: bookingId, recipient_id: recipientId, template_key: templateKey },
      p_organization_id: orgId,
      p_target_id:       reminderId,
    });

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('notification.dispatch_failed', { worker_id: workerId, reminder_id: reminderId, error: msg });

    await client
      .from('lesson_reminders')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', reminderId);

    return false;
  }
}

// ─── Instructor daily schedule digest ─────────────────────────────────────────
// Runs once per day during the 05:00–06:59 UTC window (≈ 07:00 Stockholm).
// Sends each instructor their lesson schedule for the day via communication-worker.
// Deduplication: skips instructor if outbound_messages already contains a
// 'instructor_schedule_daily' message for their contact address today.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendInstructorDigests(client: any, workerId: string): Promise<number> {
  const nowUtcHour = new Date().getUTCHours();
  if (nowUtcHour < 5 || nowUtcHour >= 7) return 0;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);

  // Get today's non-cancelled slots that have an instructor assigned
  const { data: slots, error: slotsErr } = await client
    .from('lesson_slots')
    .select('organization_id, instructor_id, starts_at')
    .gte('starts_at', todayStart.toISOString())
    .lte('starts_at', todayEnd.toISOString())
    .not('instructor_id', 'is', null)
    .is('deleted_at', null)
    .neq('status', 'cancelled');

  if (slotsErr !== null) {
    logger.warn('digest.slots_query_failed', { worker_id: workerId, error: slotsErr.message });
    return 0;
  }
  if (!slots?.length) return 0;

  // Group slots by org:instructor pair, counting lessons per instructor
  const instructorMap = new Map<string, { orgId: string; instructorId: string; slotCount: number }>();
  for (const slot of slots as Array<{ organization_id: string; instructor_id: string }>) {
    const key = `${slot.organization_id}:${slot.instructor_id}`;
    const existing = instructorMap.get(key);
    if (existing !== undefined) {
      existing.slotCount++;
    } else {
      instructorMap.set(key, { orgId: slot.organization_id, instructorId: slot.instructor_id, slotCount: 1 });
    }
  }
  if (instructorMap.size === 0) return 0;

  // Batch-fetch instructor contact details
  const instructorIds = [...new Set([...instructorMap.values()].map((v) => v.instructorId))];
  const { data: instructors, error: instErr } = await client
    .from('instructors')
    .select('id, first_name, last_name, phone, email')
    .in('id', instructorIds)
    .is('deleted_at', null);

  if (instErr !== null || !instructors?.length) {
    if (instErr !== null) logger.warn('digest.instructors_query_failed', { worker_id: workerId, error: instErr.message });
    return 0;
  }

  const instrById = new Map<string, { first_name: string; last_name: string; phone: string | null; email: string | null }>();
  for (const instr of instructors as Array<{ id: string; first_name: string; last_name: string; phone: string | null; email: string | null }>) {
    instrById.set(instr.id, instr);
  }

  const workerUrl    = `${Deno.env.get('SUPABASE_URL')}/functions/v1/communication-worker/notify`;
  const workerSecret = Deno.env.get('WORKER_SECRET');
  if (workerSecret === undefined || workerSecret === '') return 0;

  const datum = todayStart.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' });
  let sent = 0;

  for (const [, { orgId, instructorId, slotCount }] of instructorMap) {
    const instr = instrById.get(instructorId);
    if (instr === undefined) continue;

    // contactAddress dedup below is best-effort for phone/email — an
    // instructor with neither (push-only) always proceeds since there's no
    // sensible per-address key for them; worst case is a duplicate digest,
    // not a missing one, and push dedup would need a different key entirely.
    const contactAddress = instr.phone ?? instr.email ?? '';

    if (contactAddress !== '') {
      // Dedup: skip if digest already sent today to this instructor address
      const { count: alreadySent } = await client
        .from('outbound_messages')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('recipient_address', contactAddress)
        .gte('created_at', todayStart.toISOString())
        .filter('metadata->>trigger_event', 'eq', 'instructor_schedule_daily');

      if ((alreadySent ?? 0) > 0) {
        logger.debug('digest.already_sent_today', { worker_id: workerId, instructor_id: instructorId });
        continue;
      }
    }

    const payload: Record<string, string> = {
      trigger_event:    'instructor_schedule_daily',
      organization_id:  orgId,
      instructor_id:    instructorId,
      förnamn:          instr.first_name,
      datum,
      antal_lektioner:  String(slotCount),
    };
    if (instr.phone !== null) payload['instructor_phone'] = instr.phone;
    if (instr.email !== null) payload['instructor_email'] = instr.email;

    const resp = await fetch(workerUrl, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${workerSecret}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }).catch(() => null);

    if (resp?.ok === true) {
      sent++;
      logger.info('digest.sent', { worker_id: workerId, instructor_id: instructorId, org_id: orgId, slot_count: slotCount });
    } else {
      logger.warn('digest.dispatch_failed', { worker_id: workerId, instructor_id: instructorId, http_status: resp?.status });
    }
  }

  return sent;
}

// ─── Stale booking reconciliation reminder ────────────────────────────────────
// Lesson completion (confirmed -> completed/no_show) is entirely
// instructor-driven — no job auto-transitions a booking once its lesson time
// passes, by design (the system should never guess whether a lesson actually
// happened). But that means a booking an instructor forgets to close out
// stays 'confirmed' forever with nothing prompting them to fix it, silently
// skewing instructor stats and no-show tracking. Runs once per day (same
// idiom as sendInstructorDigests) and dedupes per instructor per day via
// outbound_messages, not per-booking — a single digest count, not one
// message per stale booking.
const STALE_BOOKING_GRACE_HOURS = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendStaleBookingReminders(client: any, workerId: string): Promise<number> {
  const nowUtcHour = new Date().getUTCHours();
  if (nowUtcHour < 17 || nowUtcHour >= 19) return 0;

  const cutoff = new Date(Date.now() - STALE_BOOKING_GRACE_HOURS * 60 * 60 * 1000);

  const { data: bookings, error: bookingsErr } = await client
    .from('lesson_bookings')
    .select('organization_id, instructor_id')
    .eq('status', 'confirmed')
    .lt('ends_at', cutoff.toISOString())
    .is('deleted_at', null)
    .limit(2000);

  if (bookingsErr !== null) {
    logger.warn('stale_bookings.query_failed', { worker_id: workerId, error: bookingsErr.message });
    return 0;
  }
  if (!bookings?.length) return 0;

  const instructorMap = new Map<string, { orgId: string; instructorId: string; count: number }>();
  for (const b of bookings as Array<{ organization_id: string; instructor_id: string }>) {
    const key = `${b.organization_id}:${b.instructor_id}`;
    const existing = instructorMap.get(key);
    if (existing !== undefined) {
      existing.count++;
    } else {
      instructorMap.set(key, { orgId: b.organization_id, instructorId: b.instructor_id, count: 1 });
    }
  }

  const instructorIds = [...new Set([...instructorMap.values()].map((v) => v.instructorId))];
  const { data: instructors, error: instErr } = await client
    .from('instructors')
    .select('id, first_name, phone, email')
    .in('id', instructorIds)
    .is('deleted_at', null);

  if (instErr !== null || !instructors?.length) {
    if (instErr !== null) logger.warn('stale_bookings.instructors_query_failed', { worker_id: workerId, error: instErr.message });
    return 0;
  }

  const instrById = new Map<string, { first_name: string; phone: string | null; email: string | null }>();
  for (const instr of instructors as Array<{ id: string; first_name: string; phone: string | null; email: string | null }>) {
    instrById.set(instr.id, instr);
  }

  const workerUrl    = `${Deno.env.get('SUPABASE_URL')}/functions/v1/communication-worker/notify`;
  const workerSecret = Deno.env.get('WORKER_SECRET');
  if (workerSecret === undefined || workerSecret === '') return 0;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let sent = 0;

  const todayKey = todayStart.toISOString().slice(0, 10);

  for (const [, { orgId, instructorId, count }] of instructorMap) {
    const instr = instrById.get(instructorId);
    if (instr === undefined) continue;

    // Atomically claim "one reminder per instructor per day" via a
    // deterministic idempotency_key on notifications' existing unique
    // constraint, instead of a separate read-check-then-dispatch — an
    // overlapping worker run racing this same window would previously both
    // observe zero already-sent messages and both dispatch. ON CONFLICT DO
    // NOTHING makes the claim itself the atomic gate: only the worker whose
    // insert actually lands proceeds to dispatch.
    const { data: claimed, error: claimErr } = await client
      .from('notifications')
      .insert({
        organization_id: orgId,
        recipient_id:    instructorId,
        recipient_type:  'instructor',
        channel:         'internal',
        template_key:    'booking_reconciliation_reminder',
        idempotency_key: `booking_reconciliation_reminder:${orgId}:${instructorId}:${todayKey}`,
        reference_type:  'instructor',
        reference_id:    instructorId,
        status:           'sent',
      })
      .select('id')
      .maybeSingle();

    if (claimErr) {
      if ((claimErr as { code?: string }).code !== '23505') {
        logger.error('stale_bookings.claim_failed', { worker_id: workerId, instructor_id: instructorId, error: claimErr.message });
      } else {
        logger.debug('stale_bookings.already_sent_today', { worker_id: workerId, instructor_id: instructorId });
      }
      continue;
    }
    if (!claimed) continue;

    const payload: Record<string, string> = {
      trigger_event:    'booking_reconciliation_reminder',
      organization_id:  orgId,
      instructor_id:    instructorId,
      förnamn:          instr.first_name,
      antal:            String(count),
    };
    if (instr.phone !== null) payload['instructor_phone'] = instr.phone;
    if (instr.email !== null) payload['instructor_email'] = instr.email;

    const resp = await fetch(workerUrl, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${workerSecret}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }).catch(() => null);

    if (resp?.ok === true) {
      sent++;
      logger.info('stale_bookings.reminder_sent', { worker_id: workerId, instructor_id: instructorId, org_id: orgId, count });
    } else {
      logger.warn('stale_bookings.dispatch_failed', { worker_id: workerId, instructor_id: instructorId, http_status: resp?.status });
    }
  }

  return sent;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runMaintenanceTick(client: any, workerId: string): Promise<MaintenanceMetrics> {
  const metrics: MaintenanceMetrics = {
    reminders_processed:     0,
    reminders_failed:        0,
    reservations_expired:    0,
    credits_expired:         0,
    dunning_processed:       0,
    instructor_digests_sent: 0,
    campaigns_transitioned:  0,
    packages_expired:        0,
    regulatory_reminders_sent: 0,
    stale_booking_reminders_sent: 0,
    vehicle_compliance_reminders_sent: 0,
  };

  // 1. Drain due reminders (atomic claim via SKIP LOCKED in DB function)
  const { data: dueReminders, error: drainErr } = await client.rpc('drain_due_reminders', {
    p_limit: REMINDER_BATCH,
  });

  if (drainErr !== null) {
    logger.error('maintenance.drain_reminders_failed', {
      worker_id: workerId,
      error:     drainErr.message,
    });
  } else {
    for (const reminder of (dueReminders ?? []) as Record<string, unknown>[]) {
      const sent = await processReminder(client, reminder, workerId);
      if (sent) {
        metrics.reminders_processed++;
      } else {
        metrics.reminders_failed++;
      }
    }
  }

  // 2. Expire stale reservations (publishes Reservation.Expired events to outbox)
  const { data: expiredCount, error: expireErr } = await client.rpc('expire_stale_reservations', {
    p_timeout_minutes: EXPIRY_TIMEOUT,
  });

  if (expireErr !== null) {
    logger.warn('maintenance.expire_reservations_failed', {
      worker_id: workerId,
      error:     expireErr.message,
    });
  } else {
    metrics.reservations_expired = (expiredCount as number) ?? 0;
    if (metrics.reservations_expired > 0) {
      logger.info('maintenance.reservations_expired', {
        worker_id: workerId,
        count:     metrics.reservations_expired,
      });
    }
  }

  // 3. Expire stale credits (Phase 4A: FIFO grant expiry via SKIP LOCKED in DB)
  const { data: expiredCredits, error: creditExpireErr } = await (client as any).rpc(
    'expire_stale_credits',
    { p_limit: CREDIT_EXPIRY_BATCH }
  );

  if (creditExpireErr !== null) {
    logger.warn('maintenance.expire_credits_failed', {
      worker_id: workerId,
      error:     creditExpireErr.message,
    });
  } else {
    metrics.credits_expired = (expiredCredits as number) ?? 0;
    if (metrics.credits_expired > 0) {
      logger.info('maintenance.credits_expired', {
        worker_id: workerId,
        count:     metrics.credits_expired,
      });
    }
  }

  // 4. Process dunning tick (Phase 4B: mark overdue invoices + advance dunning stages)
  const { data: dunningCount, error: dunningErr } = await (client as any).rpc(
    'process_dunning_tick',
    { p_limit: DUNNING_BATCH }
  );

  if (dunningErr !== null) {
    logger.warn('maintenance.dunning_tick_failed', {
      worker_id: workerId,
      error:     dunningErr.message,
    });
  } else {
    metrics.dunning_processed = (dunningCount as number) ?? 0;
    if (metrics.dunning_processed > 0) {
      logger.info('maintenance.dunning_processed', {
        worker_id: workerId,
        count:     metrics.dunning_processed,
      });
    }
  }

  // 5. Instructor daily schedule digest (07:00 window, deduped per instructor per day)
  metrics.instructor_digests_sent = await sendInstructorDigests(client as any, workerId);

  // 6. Campaign lifecycle: scheduled→active, active→expired
  const { data: campaignsTransitioned, error: lifecycleErr } = await (client as any).rpc(
    'process_campaign_lifecycle',
  );

  if (lifecycleErr !== null) {
    logger.warn('maintenance.campaign_lifecycle_failed', {
      worker_id: workerId,
      error:     lifecycleErr.message,
    });
  } else {
    metrics.campaigns_transitioned = (campaignsTransitioned as number) ?? 0;
    if (metrics.campaigns_transitioned > 0) {
      logger.info('maintenance.campaigns_transitioned', {
        worker_id: workerId,
        count:     metrics.campaigns_transitioned,
      });
    }
  }

  // 7. H-1: Expire stale package assignments (Sprint 4 package consumption)
  const { data: packagesExpired, error: pkgExpireErr } = await (client as any).rpc(
    'expire_stale_packages_all',
  );

  if (pkgExpireErr !== null) {
    logger.warn('maintenance.expire_packages_failed', {
      worker_id: workerId,
      error:     pkgExpireErr.message,
    });
  } else {
    metrics.packages_expired = (packagesExpired as number) ?? 0;
    if (metrics.packages_expired > 0) {
      logger.info('maintenance.packages_expired', {
        worker_id: workerId,
        count:     metrics.packages_expired,
      });
    }
  }

  // 8. Regulatory Workflow Tracker: notify the org owner of items due within
  // 7 days that haven't been reminded yet (regulatory_workflows.due_date,
  // see migration 20260727000003). Same admin-notification idiom as
  // stripe-webhook's alertSettlementFailure() — a direct write to
  // `notifications` (recipient_type: 'admin', channel: 'internal') rather
  // than the outbox/communication-worker pipeline, whose recipient
  // resolution doesn't yet cover this case either.
  try {
    metrics.regulatory_reminders_sent = await checkDueRegulatoryWorkflows(client, workerId);
  } catch (err) {
    logger.error('maintenance.regulatory_reminders_failed', {
      worker_id: workerId, error: err instanceof Error ? err.message : String(err),
    });
  }

  // 9. Stale booking reconciliation reminder (17:00-18:59 UTC window, deduped
  // per instructor per day) — see sendStaleBookingReminders for rationale.
  try {
    metrics.stale_booking_reminders_sent = await sendStaleBookingReminders(client as any, workerId);
  } catch (err) {
    logger.error('maintenance.stale_booking_reminders_failed', {
      worker_id: workerId, error: err instanceof Error ? err.message : String(err),
    });
  }

  // 10. Vehicle compliance reminders (registration/insurance/besiktning
  // expiry — see checkDueVehicleCompliance for rationale).
  try {
    metrics.vehicle_compliance_reminders_sent = await checkDueVehicleCompliance(client, workerId);
  } catch (err) {
    logger.error('maintenance.vehicle_compliance_reminders_failed', {
      worker_id: workerId, error: err instanceof Error ? err.message : String(err),
    });
  }

  return metrics;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveOrgOwnerId(client: any, orgId: string): Promise<string | null> {
  const { data: orgMemberships } = await client
    .from('memberships')
    .select('id, user_id')
    .eq('organization_id', orgId)
    .eq('status', 'active');

  const memberships = (orgMemberships ?? []) as Array<{ id: string; user_id: string }>;
  if (memberships.length === 0) return null;

  const { data: ownerRole } = await client
    .from('roles')
    .select('id')
    .eq('name', 'org_owner')
    .maybeSingle();
  const ownerRoleId = (ownerRole as { id?: string } | null)?.id;
  if (!ownerRoleId) return null;

  const { data: assignment } = await client
    .from('membership_roles')
    .select('membership_id')
    .eq('role_id', ownerRoleId)
    .in('membership_id', memberships.map((m) => m.id))
    .limit(1)
    .maybeSingle();

  const membershipId = (assignment as { membership_id?: string } | null)?.membership_id;
  return memberships.find((m) => m.id === membershipId)?.user_id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkDueRegulatoryWorkflows(client: any, workerId: string): Promise<number> {
  const today       = new Date().toISOString().slice(0, 10);
  const dueBy       = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const reReminded  = new Date(Date.now() - 3 * 86_400_000).toISOString();

  type Row = { id: string; organization_id: string; title: string; due_date: string; workflow_type: string };

  // Two passes, not a single OR filter: (a) items due within 7 days that
  // have never been reminded, and (b) items already overdue whose last
  // reminder is more than 3 days old — a single one-time reminder was found
  // insufficient during commissioning review: an item that stays overdue
  // and unresolved for weeks would otherwise never remind again. Escalating
  // every 3 days while overdue (not on any fixed schedule before the due
  // date) balances staying visible against not spamming the admin.
  const { data: neverReminded, error: err1 } = await client
    .from('regulatory_workflows')
    .select('id, organization_id, title, due_date, workflow_type')
    .is('deleted_at', null)
    .is('reminder_sent_at', null)
    .not('status', 'in', '(confirmed,rejected,expired)')
    .not('due_date', 'is', null)
    .lte('due_date', dueBy)
    .limit(100);

  if (err1) {
    logger.error('maintenance.regulatory_due_query_failed', { worker_id: workerId, error: err1.message });
  }

  const { data: overdueEscalation, error: err2 } = await client
    .from('regulatory_workflows')
    .select('id, organization_id, title, due_date, workflow_type')
    .is('deleted_at', null)
    .not('reminder_sent_at', 'is', null)
    .lt('reminder_sent_at', reReminded)
    .not('status', 'in', '(confirmed,rejected,expired)')
    .not('due_date', 'is', null)
    .lt('due_date', today)
    .limit(100);

  if (err2) {
    logger.error('maintenance.regulatory_overdue_query_failed', { worker_id: workerId, error: err2.message });
  }

  const seen = new Set<string>();
  const due: Row[] = [...(neverReminded ?? []), ...(overdueEscalation ?? [])]
    .filter((w: Row) => (seen.has(w.id) ? false : (seen.add(w.id), true)));

  let sent = 0;
  for (const w of due) {
    // Atomically claim before notifying — same discipline as
    // checkVehicleExpiryField above: the WHERE guard re-verifies the read
    // condition at claim time, so an overlapping worker run that already
    // claimed this item gets zero rows back instead of duplicating the
    // notification.
    const { data: claimed, error: claimErr } = await client
      .from('regulatory_workflows')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', w.id)
      .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${reReminded}`)
      .select('id')
      .maybeSingle();

    if (claimErr) {
      logger.error('maintenance.regulatory_claim_failed', { worker_id: workerId, workflow_id: w.id, error: claimErr.message });
      continue;
    }
    if (!claimed) {
      continue;
    }

    const recipientId = await resolveOrgOwnerId(client, w.organization_id);
    if (!recipientId) continue;

    const overdue = w.due_date < today;
    const { error: notifyErr } = await client.from('notifications').insert({
      organization_id: w.organization_id,
      recipient_id:    recipientId,
      recipient_type:  'admin',
      channel:         'internal',
      template_key:    'regulatory_workflow_due_soon',
      subject:         overdue ? 'Myndighetsärende är försenat' : 'Myndighetsärende förfaller snart',
      body:            overdue
        ? `"${w.title}" skulle ha lämnats in ${w.due_date} och är fortfarande inte klart. Kontrollera status i Myndighetsärenden.`
        : `"${w.title}" förfaller ${w.due_date}. Kontrollera status i Myndighetsärenden.`,
      priority:        overdue ? 'high' : 'normal',
      category:        'compliance',
      reference_type:  'regulatory_workflow',
      reference_id:    w.id,
      status:          'sent',
    });

    if (notifyErr) {
      logger.error('maintenance.regulatory_reminder_notify_failed', { worker_id: workerId, workflow_id: w.id, error: notifyErr.message });
      continue;
    }

    sent++;
  }

  if (sent > 0) logger.info('maintenance.regulatory_reminders_sent', { worker_id: workerId, count: sent });
  return sent;
}

// ─── Vehicle compliance reminders ──────────────────────────────────────────────
// registration_expires_at / insurance_expires_at / next_inspection_due_at have
// been indexed for exactly this since Phase 2A, but nothing ever queried them
// proactively — mirrors checkDueRegulatoryWorkflows' exact due-soon +
// overdue-escalation pattern, applied to one vehicle expiry field at a time so
// each of the three compliance concerns dedupes independently via its own
// reminder_sent_at column (20260728000004).

interface VehicleExpiryRow {
  id:               string;
  organization_id:  string;
  registration_number: string;
  expiry_date:      string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkVehicleExpiryField(
  client: any,
  workerId: string,
  expiryColumn: 'registration_expires_at' | 'insurance_expires_at' | 'next_inspection_due_at',
  reminderColumn: 'registration_reminder_sent_at' | 'insurance_reminder_sent_at' | 'inspection_reminder_sent_at',
  labelSv: string,
): Promise<number> {
  const today      = new Date().toISOString().slice(0, 10);
  const dueBy      = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const reReminded = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { data: neverReminded, error: err1 } = await client
    .from('vehicles')
    .select(`id, organization_id, registration_number, expiry_date:${expiryColumn}`)
    .is('deleted_at', null)
    .is(reminderColumn, null)
    .not(expiryColumn, 'is', null)
    .lte(expiryColumn, dueBy)
    .limit(100);

  if (err1 !== null) {
    logger.error('maintenance.vehicle_expiry_due_query_failed', { worker_id: workerId, field: expiryColumn, error: err1.message });
  }

  const { data: overdueEscalation, error: err2 } = await client
    .from('vehicles')
    .select(`id, organization_id, registration_number, expiry_date:${expiryColumn}`)
    .is('deleted_at', null)
    .not(reminderColumn, 'is', null)
    .lt(reminderColumn, reReminded)
    .not(expiryColumn, 'is', null)
    .lt(expiryColumn, today)
    .limit(100);

  if (err2 !== null) {
    logger.error('maintenance.vehicle_expiry_overdue_query_failed', { worker_id: workerId, field: expiryColumn, error: err2.message });
  }

  const seen = new Set<string>();
  const due: VehicleExpiryRow[] = [...(neverReminded ?? []), ...(overdueEscalation ?? [])]
    .filter((v: VehicleExpiryRow) => (seen.has(v.id) ? false : (seen.add(v.id), true)));

  let sent = 0;
  for (const v of due) {
    // Atomically claim this vehicle's reminder slot before notifying — the
    // WHERE guard re-verifies the same eligibility condition from the SELECT
    // above (never reminded, or last reminder stale) at claim time, so a
    // concurrent worker run that already claimed it (its own UPDATE already
    // committed) fails to match and correctly gets zero rows back instead of
    // duplicating the notification. This was found sending duplicate
    // compliance notifications under overlapping worker runs — background
    // jobs must claim ownership before acting, not act then mark done.
    const { data: claimed, error: claimErr } = await client
      .from('vehicles')
      .update({ [reminderColumn]: new Date().toISOString() })
      .eq('id', v.id)
      .or(`${reminderColumn}.is.null,${reminderColumn}.lt.${reReminded}`)
      .select('id')
      .maybeSingle();

    if (claimErr) {
      logger.error('maintenance.vehicle_expiry_claim_failed', { worker_id: workerId, vehicle_id: v.id, field: expiryColumn, error: claimErr.message });
      continue;
    }
    if (!claimed) {
      // Another worker instance already claimed this reminder — skip silently.
      continue;
    }

    const recipientId = await resolveOrgOwnerId(client, v.organization_id);
    if (!recipientId) continue;

    const overdue = v.expiry_date < today;
    const { error: notifyErr } = await client.from('notifications').insert({
      organization_id: v.organization_id,
      recipient_id:    recipientId,
      recipient_type:  'admin',
      channel:         'internal',
      template_key:    'vehicle_compliance_due_soon',
      subject:         overdue ? `${labelSv} har gått ut` : `${labelSv} går ut snart`,
      body:            overdue
        ? `${labelSv} för fordon ${v.registration_number} gick ut ${v.expiry_date} och har inte förnyats. Kontrollera fordonet i Resurser.`
        : `${labelSv} för fordon ${v.registration_number} går ut ${v.expiry_date}. Kontrollera fordonet i Resurser.`,
      priority:        overdue ? 'high' : 'normal',
      category:        'compliance',
      reference_type:  'vehicle',
      reference_id:    v.id,
      status:          'sent',
    });

    if (notifyErr) {
      logger.error('maintenance.vehicle_expiry_notify_failed', { worker_id: workerId, vehicle_id: v.id, field: expiryColumn, error: notifyErr.message });
      continue;
    }

    sent++;
  }

  return sent;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkDueVehicleCompliance(client: any, workerId: string): Promise<number> {
  const [registration, insurance, inspection] = await Promise.all([
    checkVehicleExpiryField(client, workerId, 'registration_expires_at', 'registration_reminder_sent_at', 'Fordonsregistrering'),
    checkVehicleExpiryField(client, workerId, 'insurance_expires_at',    'insurance_reminder_sent_at',    'Fordonsförsäkring'),
    checkVehicleExpiryField(client, workerId, 'next_inspection_due_at',  'inspection_reminder_sent_at',   'Besiktning'),
  ]);
  const total = registration + insurance + inspection;
  if (total > 0) logger.info('maintenance.vehicle_compliance_reminders_sent', { worker_id: workerId, count: total });
  return total;
}

// ─── Worker core ──────────────────────────────────────────────────────────────

async function runWorker(workerId: string): Promise<WorkerMetrics> {
  const startedAt     = Date.now();
  const runStartedAt  = new Date().toISOString();

  const metrics: WorkerMetrics = {
    worker_id:               workerId,
    run_started_at:          runStartedAt,
    run_duration_ms:         0,
    events_claimed:          0,
    events_delivered:        0,
    events_failed:           0,
    events_dead_lettered:    0,
    events_no_handler:       0,
    reminders_processed:     0,
    reminders_failed:        0,
    reservations_expired:    0,
    accounting_delivered:    0,
    credits_expired:         0,
    dunning_processed:       0,
    instructor_digests_sent: 0,
    campaigns_transitioned:  0,
    packages_expired:        0,
    regulatory_reminders_sent: 0,
    stale_booking_reminders_sent: 0,
    vehicle_compliance_reminders_sent: 0,
  };

  const client = createServiceClient();

  let workerRunId: string | null = null;
  try {
    const { data: runId } = await (client as any).rpc('begin_worker_run', {
      p_worker_name: 'event-worker',
      p_metadata:    { worker_id: workerId },
    });
    workerRunId = (runId as string | null) ?? null;
  } catch (runLogErr) {
    // Monitoring must never block event processing.
    logger.warn('worker.run_log_begin_failed', {
      worker_id: workerId,
      error:     runLogErr instanceof Error ? runLogErr.message : String(runLogErr),
    });
  }

  // Claim the next batch of 'internal' channel events
  const { data: events, error: claimError } = await (client as any).rpc('outbox_claim_next', {
    p_channel:    'internal',
    p_worker_id:  workerId,
    p_batch_size: BATCH_SIZE,
    p_lock_ttl:   LOCK_TTL,
  });

  if (claimError !== null) {
    logger.error('worker.claim_failed', {
      worker_id: workerId,
      error:     claimError.message,
    });
    metrics.run_duration_ms = Date.now() - startedAt;
    if (workerRunId) {
      await (client as any).rpc('complete_worker_run', {
        p_run_id:       workerRunId,
        p_status:       'failed',
        p_error_summary: claimError.message,
      }).then(undefined, () => {});
    }
    return metrics;
  }

  const batch = (events ?? []) as OutboxEvent[];
  metrics.events_claimed = batch.length;

  if (batch.length > 0) {
    logger.info('worker.batch_claimed', {
      worker_id:  workerId,
      batch_size: batch.length,
    });
  } else {
    logger.debug('worker.no_events', { worker_id: workerId });
  }

  for (const event of batch) {
    const handler = HANDLER_REGISTRY[event.event_type];

    if (handler === undefined) {
      logger.warn('worker.no_handler', {
        worker_id:  workerId,
        event_id:   event.id,
        event_type: event.event_type,
      });
      await (client as any).rpc('outbox_complete', { p_event_id: event.id });
      metrics.events_no_handler++;
      metrics.events_delivered++;
      continue;
    }

    try {
      const result = await handler(event, client);

      if (result.success) {
        await (client as any).rpc('outbox_complete', { p_event_id: event.id });
        metrics.events_delivered++;
      } else {
        const errMsg = result.error ?? 'Handler returned failure';
        logger.warn('worker.handler_failed', {
          worker_id:   workerId,
          event_id:    event.id,
          event_type:  event.event_type,
          retry_count: event.retry_count,
          error:       errMsg,
        });
        await (client as any).rpc('outbox_fail', { p_event_id: event.id, p_error: errMsg });
        metrics.events_failed++;
        if (event.retry_count >= event.max_retries) metrics.events_dead_lettered++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('worker.handler_threw', {
        worker_id:   workerId,
        event_id:    event.id,
        event_type:  event.event_type,
        retry_count: event.retry_count,
        error:       errMsg,
        stack:       err instanceof Error ? err.stack : undefined,
      });
      await (client as any).rpc('outbox_fail', { p_event_id: event.id, p_error: errMsg });
      metrics.events_failed++;
      if (event.retry_count >= event.max_retries) metrics.events_dead_lettered++;
    }
  }

  // Phase 4A: Drain accounting channel (commercial events: Invoice, Payment, Credit)
  const { data: accountingEvents, error: acctClaimErr } = await (client as any).rpc('outbox_claim_next', {
    p_channel:    'accounting',
    p_worker_id:  workerId,
    p_batch_size: ACCOUNTING_BATCH,
    p_lock_ttl:   LOCK_TTL,
  });

  if (acctClaimErr !== null) {
    logger.warn('worker.accounting_claim_failed', {
      worker_id: workerId,
      error:     acctClaimErr.message,
    });
  } else {
    for (const event of (accountingEvents ?? []) as OutboxEvent[]) {
      const handler = HANDLER_REGISTRY[event.event_type];
      try {
        if (handler === undefined) {
          await (client as any).rpc('outbox_complete', { p_event_id: event.id });
        } else {
          const result = await handler(event, client);
          if (result.success) {
            await (client as any).rpc('outbox_complete', { p_event_id: event.id });
            metrics.accounting_delivered++;
          } else {
            await (client as any).rpc('outbox_fail', {
              p_event_id: event.id,
              p_error:    result.error ?? 'accounting handler failure',
            });
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('worker.accounting_handler_threw', {
          worker_id:  workerId,
          event_id:   event.id,
          event_type: event.event_type,
          error:      errMsg,
        });
        await (client as any).rpc('outbox_fail', { p_event_id: event.id, p_error: errMsg });
      }
    }
  }

  // Phase 3D + 4A: Maintenance tick — runs every invocation regardless of outbox state
  const maintMetrics = await runMaintenanceTick(client as any, workerId);
  metrics.reminders_processed     = maintMetrics.reminders_processed;
  metrics.reminders_failed        = maintMetrics.reminders_failed;
  metrics.reservations_expired    = maintMetrics.reservations_expired;
  metrics.credits_expired         = maintMetrics.credits_expired;
  metrics.dunning_processed       = maintMetrics.dunning_processed;
  metrics.instructor_digests_sent = maintMetrics.instructor_digests_sent;
  metrics.campaigns_transitioned  = maintMetrics.campaigns_transitioned;
  metrics.packages_expired        = maintMetrics.packages_expired;
  metrics.regulatory_reminders_sent = maintMetrics.regulatory_reminders_sent;
  metrics.stale_booking_reminders_sent = maintMetrics.stale_booking_reminders_sent;
  metrics.vehicle_compliance_reminders_sent = maintMetrics.vehicle_compliance_reminders_sent;

  metrics.run_duration_ms = Date.now() - startedAt;

  logger.info('worker.run_complete', { ...metrics });

  if (workerRunId) {
    const totalFailed  = metrics.events_failed + metrics.reminders_failed;
    const totalSuccess = metrics.events_delivered + metrics.reminders_processed;
    const status = totalFailed === 0 ? 'completed' : totalSuccess > 0 ? 'partial' : 'failed';

    await (client as any).rpc('complete_worker_run', {
      p_run_id:            workerRunId,
      p_status:            status,
      p_processed_count:   metrics.events_claimed,
      p_success_count:     metrics.events_delivered,
      p_failed_count:      metrics.events_failed,
      p_retry_count:       0,
      p_dead_letter_count: metrics.events_dead_lettered,
      p_metadata:          metrics,
    }).then(undefined, (completeErr: unknown) => {
      logger.warn('worker.run_log_complete_failed', {
        worker_id: workerId,
        error:     completeErr instanceof Error ? completeErr.message : String(completeErr),
      });
    });
  }

  return metrics;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fail-closed: refuse all requests if WORKER_SECRET is not configured.
  // An absent secret means no valid token can exist — open access is never correct.
  if (!WORKER_SECRET) {
    return new Response(JSON.stringify({ error: 'Worker not configured — WORKER_SECRET missing' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (token !== WORKER_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const workerId = `edge-${crypto.randomUUID()}`;

  logger.info('worker.invoked', { worker_id: workerId, batch_size: BATCH_SIZE });

  try {
    const metrics = await runWorker(workerId);
    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error('worker.fatal_error', {
      worker_id: workerId,
      error:     err instanceof Error ? err.message : String(err),
      stack:     err instanceof Error ? err.stack : undefined,
    });
    return new Response(
      JSON.stringify({ error: 'Worker failed', worker_id: workerId }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
