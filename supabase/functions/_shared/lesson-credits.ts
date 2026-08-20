// ─── Shared lesson-booking package-credit logic ──────────────────────────────
//
// Single authoritative implementation of "does this booking involve a
// package credit, and if so consume it" (Sprint 4I ISSUE-1 remediation).
// Extracted verbatim from the staff booking path (bookings/index.ts) so the
// staff and Student Portal booking-creation entry points share exactly one
// implementation instead of two independently-maintained copies — the
// Student Portal previously had none of this logic at all.
//
// Callers own: slot validation, overlap validation, authorization, and all
// HTTP error-response formatting/messages. This module owns only the credit
// resolution/consumption mechanics and the booking-row insert itself.

// ─── Credit pre-flight ────────────────────────────────────────────────────────

export type CreditPreflightResult =
  | { kind: 'not_applicable' }
  | { kind: 'insufficient'; category: string }
  | { kind: 'available'; assignmentId: string; category: string };

export async function resolveLessonPackageCredit(
  client: any,
  params: { organizationId: string; studentId: string; lessonTypeId: string | null },
): Promise<CreditPreflightResult> {
  if (!params.lessonTypeId) return { kind: 'not_applicable' };

  const { data: lt } = await client
    .from('lesson_types')
    .select('category')
    .eq('id', params.lessonTypeId)
    .maybeSingle();

  if (!lt?.category) return { kind: 'not_applicable' };

  const { data: asgnRows } = await client
    .from('student_package_assignments')
    .select('id, package_quantity, lessons_used, expires_at')
    .eq('student_id',      params.studentId)
    .eq('organization_id', params.organizationId)
    .eq('lesson_category', lt.category)
    .eq('status',          'active')
    .order('assigned_at',  { ascending: true });

  const now = new Date().toISOString();
  const activeValid: Array<{ id: string; package_quantity: number; lessons_used: number; expires_at: string | null }> =
    (asgnRows ?? []).filter((r: any) => r.expires_at === null || (r.expires_at as string) > now);

  if (activeValid.length === 0) return { kind: 'not_applicable' };

  const firstWithCredits = activeValid.find(r => r.lessons_used < r.package_quantity);
  if (!firstWithCredits) return { kind: 'insufficient', category: lt.category as string };

  return { kind: 'available', assignmentId: firstWithCredits.id, category: lt.category as string };
}

// ─── Booking row creation ─────────────────────────────────────────────────────
//
// Thin wrapper around the identical insert both entry points perform.
// selectColumns lets each caller preserve its own existing response shape
// (the staff path returns the full row; the Student Portal returns a
// narrower column list) — this function does not decide that.

export async function insertLessonBooking(
  client: any,
  payload: Record<string, unknown>,
  selectColumns = '*',
): Promise<{ data: any; error: any }> {
  return await client
    .from('lesson_bookings')
    .insert(payload)
    .select(selectColumns)
    .single();
}

// ─── Credit consumption / compensation ────────────────────────────────────────

export type CreditConsumeResult =
  | { ok: true }
  | { ok: false; errorMessage: string };

export async function consumeLessonPackageCreditOrCompensate(
  client: any,
  params: {
    assignmentId:   string;
    category:       string;
    organizationId: string;
    bookingId:      string;
    actorId:        string | null;
    actorEmail:     string | null;
  },
): Promise<CreditConsumeResult> {
  // The booking row (inserted by the caller just before this function runs)
  // and this credit consumption are two separate PostgREST/RPC round-trips,
  // not one transaction — a genuine gap, but the realistic failure mode
  // within it is this RPC call itself failing (network blip, timeout),
  // which previously threw straight out of this function uncaught: the
  // booking stayed committed with no credit consumed and no compensating
  // cancellation, while the caller's HTTP response still surfaced as a 500.
  // Catching here ensures the exact same compensation the controlled-error
  // branch already had also runs for that failure mode. (A true mid-flight
  // process kill between the booking insert and this call remains a narrower,
  // lower-likelihood gap that only combining both into one atomic SQL
  // function would fully close — out of scope for this fix.)
  let consumeErr: { message: string } | null;
  try {
    // consume_lesson_credit() uses FOR UPDATE — safe under concurrent load.
    const result = await client.rpc('consume_lesson_credit', {
      p_assignment_id:   params.assignmentId,
      p_organization_id: params.organizationId,
      p_booking_id:      params.bookingId,
      p_lesson_category: params.category,
      p_actor_id:        params.actorId,
      p_actor_email:     params.actorEmail,
    });
    consumeErr = result.error;
  } catch (e) {
    consumeErr = { message: e instanceof Error ? e.message : String(e) };
  }

  if (consumeErr) {
    // Race edge case: pre-flight passed but a concurrent booking exhausted
    // the last credit between the check and this insert. Compensate by
    // cancelling the just-created booking.
    await client
      .from('lesson_bookings')
      .update({
        status:            'cancelled',
        status_changed_at: new Date().toISOString(),
        cancelled_at:      new Date().toISOString(),
        cancelled_by:      params.actorId,
        updated_by:        params.actorId,
      })
      .eq('id', params.bookingId)
      .eq('organization_id', params.organizationId);

    return { ok: false, errorMessage: consumeErr.message };
  }

  return { ok: true };
}

// ─── Credit reversal on cancellation (F3 V1) ──────────────────────────────────
//
// Single authoritative implementation of "should this cancelled booking's
// package credit come back" — extracted verbatim from the staff cancel path
// (bookings/index.ts handleCancel) for the identical reason
// consumeLessonPackageCreditOrCompensate exists: the Student Portal's own
// cancel handler previously had none of this logic at all, meaning a student
// who cancelled through the portal permanently lost the credit regardless of
// notice given — a real bug, not a policy gap. Both entry points now call
// this one implementation.
//
// `forfeit` is the F3 late-cancellation/no-show policy decision (computed by
// the caller from isWithinCancellationDeadline + who/why is cancelling) — it
// short-circuits before ever consulting the package's own
// cancellation_consumes_credit flag, so a late student-initiated cancellation
// forfeits credit even for a package whose flag would otherwise restore it.

export interface CreditReversalResult {
  attempted:  boolean;  // a credit_consumed event existed for this booking and wasn't already reversed
  reversed:   boolean;  // reverse_lesson_credit succeeded
  forfeited:  boolean;  // skipped specifically because forfeit=true (F3 policy), not the package's own flag
  error?:     string;
}

export async function reverseLessonCreditOnCancellation(
  client: any,
  params: {
    organizationId: string;
    bookingId:      string;
    forfeit:        boolean;
    actorId:        string | null;
    actorEmail:     string | null;
    reason:         string;
  },
): Promise<CreditReversalResult> {
  const { data: creditEvents } = await client
    .from('package_consumption_events')
    .select('assignment_id, event_type')
    .eq('booking_id',      params.bookingId)
    .eq('organization_id', params.organizationId)
    .in('event_type', ['credit_consumed', 'credit_reversed']);

  const consumed = (creditEvents ?? []).find((e: any) => e.event_type === 'credit_consumed');
  const reversed = (creditEvents ?? []).find((e: any) => e.event_type === 'credit_reversed');

  if (!consumed || reversed) return { attempted: false, reversed: false, forfeited: false };
  if (params.forfeit)        return { attempted: true, reversed: false, forfeited: true };

  const { data: asgn } = await client
    .from('student_package_assignments')
    .select('cancellation_consumes_credit')
    .eq('id',              consumed.assignment_id)
    .eq('organization_id', params.organizationId)
    .maybeSingle();

  if (!asgn || asgn.cancellation_consumes_credit) return { attempted: true, reversed: false, forfeited: false };

  const { error } = await client.rpc('reverse_lesson_credit', {
    p_assignment_id:   consumed.assignment_id,
    p_organization_id: params.organizationId,
    p_reversal_type:   'manual',
    p_reason:          params.reason,
    p_booking_id:      params.bookingId,
    p_actor_id:        params.actorId,
    p_actor_email:     params.actorEmail,
  });

  if (error) return { attempted: true, reversed: false, forfeited: false, error: error.message };
  return { attempted: true, reversed: true, forfeited: false };
}
