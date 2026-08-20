// Canonical lesson-booking status transitions — Portal Audit P0-3 (IP-01/XP-04).
//
// Extracted verbatim from bookings/index.ts's handleUpdate (the staff/
// instructor-app path, already correct) so it can be reused by any caller
// that needs to mark a lesson completed/no_show — specifically
// instructor-portal's attendance endpoint, which previously wrote only to
// booking_attendance and never touched lesson_bookings.status at all,
// leaving credit consumption/reversal, waitlist promotion, and the
// student's own completed/no-show counts permanently out of sync with what
// actually happened. This is the one authoritative write path now; nothing
// else may transition a booking's status outside of this function (or
// handleCancel's own cancellation path, which has its own credit-reversal
// semantics and is intentionally not folded in here).
//
// No new state machine, no new credit logic, no new waitlist logic — this
// is a lift of the existing logic into a shared module, not a rewrite.

import { createServiceClient } from './supabase.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export const VALID_BOOKING_TRANSITIONS: Record<string, string[]> = {
  draft:       ['reserved', 'confirmed', 'cancelled'],
  reserved:    ['confirmed', 'cancelled'],
  confirmed:   ['completed', 'cancelled', 'no_show', 'rescheduled'],
  completed:   [],
  cancelled:   [],
  no_show:     [],
  rescheduled: [],
};

export interface AttendanceTransitionResult {
  ok:      boolean;
  status:  number;      // HTTP status to surface on failure; 200 on success
  code?:   string;
  message?: string;
  booking?: Record<string, unknown>;
}

// Transitions a booking's status, applying exactly the same rules
// bookings/index.ts's handleUpdate already enforces for every non-cancel
// transition (cancellation has its own credit-reversal semantics and stays
// in handleCancel, unchanged):
//   - idempotent no-op if the booking is already in newStatus
//   - only transitions allowed by VALID_BOOKING_TRANSITIONS proceed
//   - no_show is rejected before the lesson's own starts_at (F4)
//   - no_show sets no_show_marked_at/no_show_marked_by (required by the
//     lesson_bookings_no_show_consistency check constraint)
//   - completed fires record_lesson_completed_event (best-effort)
//   - deliberately no credit-reversal on no_show (F3 V1 approved policy —
//     same consequence as a late cancellation)
// In practice only 'completed' and 'no_show' are ever passed (the only
// transitions any caller — instructor-app's attendance action, now
// instructor-portal's — actually performs), but the full transition table
// is honored for fidelity with the original function.
export async function transitionBookingAttendance(
  client: SupabaseClient,
  params: {
    organizationId: string;
    bookingId:      string;
    newStatus:      string;
    actorId:        string | null;
  },
): Promise<AttendanceTransitionResult> {
  const { organizationId, bookingId, newStatus, actorId } = params;

  const { data: existing } = await client
    .from('lesson_bookings')
    .select('id, status, starts_at')
    .eq('id', bookingId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing === null) {
    return { ok: false, status: 404, code: 'NOT_FOUND', message: `Booking '${bookingId}' not found` };
  }

  const existingRow = existing as { id: string; status: string; starts_at: string };

  if (existingRow.status === newStatus) {
    const { data: current } = await client.from('lesson_bookings').select('*').eq('id', bookingId).single();
    return { ok: true, status: 200, booking: current as Record<string, unknown> };
  }

  const allowed = VALID_BOOKING_TRANSITIONS[existingRow.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return {
      ok: false, status: 409, code: 'CONFLICT',
      message: `Booking status transition '${existingRow.status}' → '${newStatus}' is not permitted`,
    };
  }

  if (newStatus === 'no_show' && new Date(existingRow.starts_at).getTime() > Date.now()) {
    return {
      ok: false, status: 409, code: 'NO_SHOW_TOO_EARLY',
      message: 'Kan inte markera som uteblev innan lektionen har börjat',
    };
  }

  const updatePayload: Record<string, unknown> = {
    status:             newStatus,
    status_changed_at:  new Date().toISOString(),
    updated_by:         actorId,
  };
  if (newStatus === 'no_show') {
    updatePayload['no_show_marked_at'] = new Date().toISOString();
    updatePayload['no_show_marked_by'] = actorId;
  }

  const { data: booking, error } = await client
    .from('lesson_bookings')
    .update(updatePayload)
    .eq('id', bookingId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    return { ok: false, status: 500, code: 'INTERNAL_ERROR', message: 'Failed to update booking' };
  }

  if (newStatus === 'completed') {
    await client.rpc('record_lesson_completed_event', {
      p_booking_id:      bookingId,
      p_organization_id: organizationId,
      p_actor_id:        actorId,
      p_actor_email:     null,
    }).then(undefined, () => { /* non-critical, matches existing best-effort behavior */ });

    // P1 (Training Progress Automation, Phase 1): Risk 1 / Risk 2 only —
    // deliberately not theory/practical-exam, which happen at Trafikverket,
    // outside this system, and have no booking to infer completion from.
    // Best-effort, same as the event RPC above: a failure here must never
    // fail the attendance transition itself.
    await applyMilestoneProgression(booking as Record<string, unknown>)
      .catch(() => { /* non-critical, matches existing best-effort behavior */ });
  }

  return { ok: true, status: 200, booking: booking as Record<string, unknown> };
}

// Advances risk1_completed_at/risk2_completed_at on a student's FIRST
// completed Risk 1 / Risk 2 lesson — never on no-show or cancellation,
// since this only ever runs from the 'completed' branch above. "First
// completion wins": the conditional .is(<field>, null) makes this both
// idempotent (a second Risk 1 completion is a no-op) and correction-safe
// (a staff member's manually-set or corrected value, once non-null, is
// never overwritten by this automatic path).
//
// Uses a service-role client rather than the caller-supplied one
// deliberately: `students_update` is the table's only UPDATE RLS policy
// and it requires students:student:update, which the instructor role does
// not hold (only students:progress:update — checked against the live
// grants, and no policy actually consults that permission, so it's
// currently unused). Reusing the caller's own JWT client here would
// silently no-op via RLS on every instructor-driven completion — the
// P0-1/P1-3 precedent for this exact situation (students/index.ts's
// assessment write) is to use service-role for the specific side-effect
// while keeping the authorization boundary in code, not in RLS: this
// function never takes organization_id or student_id from caller input —
// both come from the booking row `transitionBookingAttendance` itself just
// authorized and updated, which is the same guarantee the RLS policy would
// have provided, just enforced in code instead of at the database layer.
async function applyMilestoneProgression(booking: Record<string, unknown>): Promise<void> {
  const lessonTypeId   = booking['lesson_type_id']  as string | null;
  const studentId      = booking['student_id']      as string | null;
  const organizationId = booking['organization_id'] as string;
  if (lessonTypeId === null || studentId === null) return;

  const svc = createServiceClient();

  const { data: lessonType } = await svc
    .from('lesson_types')
    .select('category')
    .eq('id', lessonTypeId)
    .maybeSingle();

  const category = (lessonType as { category: string } | null)?.category;
  const field = category === 'risk1' ? 'risk1_completed_at'
              : category === 'risk2' ? 'risk2_completed_at'
              : null;
  if (field === null) return;

  await svc
    .from('students')
    .update({ [field]: new Date().toISOString() })
    .eq('id', studentId)
    .eq('organization_id', organizationId)
    .is(field, null);
}
