// Instructor-ownership scoping — Portal Audit P0-1 (IP-02/XP-02) and P0-2 (IP-03).
//
// The 'instructor' and 'instructor_senior' roles hold org-wide permissions
// (scheduling:booking:update, students:student:read, ...) with no built-in
// notion of "my own lessons/students" — that boundary has only ever existed
// as a client-side filter. This module is the one place that boundary is
// now enforced server-side, reused by both the bookings and students Edge
// Functions rather than reimplemented per-endpoint.
//
// Every other role (reception, admin, owner, finance, ...) is completely
// unaffected: isInstructorTierRole() only returns true for the two
// instructor roles, so nothing here ever runs for a staff/admin caller.
//
// Mirrors the existing RLS SELECT-scoping pattern already used for
// instructor read access (lesson_bookings_select_instructor et al.,
// 20260528000003_phase2b_scheduling_rls.sql): instructors.id matched via
// instructors.user_id = auth.uid(). This module applies the same
// relationship at the Edge Function layer, since these functions run under
// the caller's own JWT (anon key + forwarded Authorization header — see
// createSupabaseClient(req, false, ...)), not service-role.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { EdgeRequestContext } from './context.ts';

const INSTRUCTOR_TIER_ROLES = new Set(['instructor', 'instructor_senior']);

export function isInstructorTierRole(ctx: EdgeRequestContext): boolean {
  return ctx.actorRole !== null && INSTRUCTOR_TIER_ROLES.has(ctx.actorRole);
}

// Resolves the caller's own instructors.id within their org. Returns null
// if no such row exists (should not happen for an instructor-tier JWT, but
// handled defensively — a null result denies access rather than granting
// it, since callers treat null as "cannot resolve ownership").
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveOwnInstructorId(client: any, ctx: EdgeRequestContext): Promise<string | null> {
  if (ctx.organizationId === null || ctx.actorId === null) return null;
  const { data } = await client
    .from('instructors')
    .select('id')
    .eq('user_id', ctx.actorId)
    .eq('organization_id', ctx.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// Distinct student_ids this instructor has an actual lesson_bookings
// relationship with (any status, not just completed — a booked-but-not-yet-
// taught student is still "theirs" for authorization purposes).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveInstructorTaughtStudentIds(
  client: any,
  organizationId: string,
  instructorId: string,
): Promise<string[]> {
  const { data } = await client
    .from('lesson_bookings')
    .select('student_id')
    .eq('organization_id', organizationId)
    .eq('instructor_id', instructorId)
    .is('deleted_at', null);
  return ((data ?? []) as Array<{ student_id: string }>).map(r => r.student_id);
}

// Portal Audit P0-2 (IP-03): the full set of student ids an instructor-tier
// caller may see — the union of the two authoritative student↔instructor
// relationships already in the schema (no new relationship introduced):
//   1. students.assigned_instructor_id (Instructor App's existing "my
//      students" filter, previously client-side only)
//   2. any student the instructor has an actual lesson_bookings row with
//      (Instructor Portal's existing "my students" derivation)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveInstructorVisibleStudentIds(
  client: any,
  organizationId: string,
  instructorId: string,
): Promise<string[]> {
  const [taughtIds, assignedRes] = await Promise.all([
    resolveInstructorTaughtStudentIds(client, organizationId, instructorId),
    client
      .from('students')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('assigned_instructor_id', instructorId)
      .is('deleted_at', null),
  ]);
  const assignedIds = ((assignedRes.data ?? []) as Array<{ id: string }>).map(r => r.id);
  return Array.from(new Set([...taughtIds, ...assignedIds]));
}
