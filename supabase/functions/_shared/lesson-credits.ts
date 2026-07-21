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
  // consume_lesson_credit() uses FOR UPDATE — safe under concurrent load.
  const { error: consumeErr } = await client.rpc('consume_lesson_credit', {
    p_assignment_id:   params.assignmentId,
    p_organization_id: params.organizationId,
    p_booking_id:      params.bookingId,
    p_lesson_category: params.category,
    p_actor_id:        params.actorId,
    p_actor_email:     params.actorEmail,
  });

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
