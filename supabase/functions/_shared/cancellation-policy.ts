// ─── Shared cancellation-deadline policy (F3 V1) ──────────────────────────────
//
// Single source of truth for "how many hours before a lesson can a student
// still cancel/reschedule without losing their credit / at all", read from
// organizations.settings.student_booking.cancellation_deadline_hours.
// Falls back to 24h (the previous hardcoded frontend-only value in
// StudentPortalBokningarPage.tsx) when unset, so behavior is unchanged for
// every organization that hasn't explicitly configured a different value.

export const DEFAULT_CANCELLATION_DEADLINE_HOURS = 24;

export async function getCancellationDeadlineHours(client: any, organizationId: string): Promise<number> {
  const { data: org } = await client
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .maybeSingle();

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const studentBooking = (settings['student_booking'] ?? {}) as Record<string, unknown>;
  const raw = studentBooking['cancellation_deadline_hours'];

  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? raw
    : DEFAULT_CANCELLATION_DEADLINE_HOURS;
}

// "Late" = the lesson starts within deadlineHours from now. Used identically
// for both the cancellation-forfeits-credit check and the
// reschedule-is-rejected check — same rule, two different consequences,
// decided by each caller.
export function isWithinCancellationDeadline(startsAtIso: string, deadlineHours: number): boolean {
  const msUntilStart = new Date(startsAtIso).getTime() - Date.now();
  return msUntilStart < deadlineHours * 3_600_000;
}
