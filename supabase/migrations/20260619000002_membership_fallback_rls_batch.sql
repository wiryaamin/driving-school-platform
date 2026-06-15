-- =============================================================================
-- Fix: Membership-based fallback SELECT policies for all frontend-queried tables
--
-- Root cause: all existing SELECT policies use auth_organization_id() which reads
-- organization_id from JWT custom claims populated by the auth hook. If the auth
-- hook is not active (e.g. remote project without deployed hook), JWT lacks the
-- claim and every policy evaluates to NULL = UUID → false → 0 rows returned.
--
-- Fix: Add fallback SELECT policies using the memberships table, which is
-- accessible via auth.uid() alone (memberships_select_own_org allows user_id
-- = auth.uid() without custom JWT claims).
-- =============================================================================

-- ─── students ─────────────────────────────────────────────────────────────────
CREATE POLICY students_select_member
  ON public.students
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      WHERE  m.user_id = auth.uid() AND m.removed_at IS NULL
    )
  );

-- ─── instructors ──────────────────────────────────────────────────────────────
CREATE POLICY instructors_select_member
  ON public.instructors
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      WHERE  m.user_id = auth.uid() AND m.removed_at IS NULL
    )
  );

-- ─── invoices ─────────────────────────────────────────────────────────────────
CREATE POLICY invoices_select_member
  ON public.invoices
  FOR SELECT
  USING (
    organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      WHERE  m.user_id = auth.uid() AND m.removed_at IS NULL
    )
  );

-- ─── lesson_slots ─────────────────────────────────────────────────────────────
CREATE POLICY lesson_slots_select_member
  ON public.lesson_slots
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      WHERE  m.user_id = auth.uid() AND m.removed_at IS NULL
    )
  );

-- ─── lesson_bookings ──────────────────────────────────────────────────────────
CREATE POLICY lesson_bookings_select_member
  ON public.lesson_bookings
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id IN (
      SELECT m.organization_id FROM public.memberships m
      WHERE  m.user_id = auth.uid() AND m.removed_at IS NULL
    )
  );
