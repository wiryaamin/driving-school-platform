-- =============================================================================
-- MIGRATION: 20260528000003_phase2b_scheduling_rls.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2B — Scheduling Engine RLS (Split 2 of 4)
-- Description:
--   Row Level Security for all 8 Phase 2B scheduling tables.
--   Three-tier SELECT pattern (staff / self / platform admin) consistent with
--   Phase 2A. Soft-deleted rows (deleted_at IS NOT NULL) are hidden from all
--   non-platform-admin tiers — platform admin bypass policies have no
--   deleted_at filter, allowing audit visibility via the service role.
--
-- Execution order:
--   1. 20260528000002_phase2b_scheduling_core.sql
--   2. 20260528000003_phase2b_scheduling_rls.sql    ← this file
--   3. 20260528000004_phase2b_scheduling_events.sql
--   4. 20260528000005_phase2b_scheduling_indexes.sql
--
-- Dependencies:
--   20260528000002_phase2b_scheduling_core.sql — all 8 tables must exist
-- =============================================================================

ALTER TABLE public.lesson_types                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_time_off           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_slots                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_bookings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_attendance            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_notes                 ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- LESSON TYPES
-- Staff with slot:read see all (active + inactive).
-- Students and instructors using the portal see active types only.
-- Portal access is scoped to confirmed org members (student or instructor row
-- must exist) — prevents unauthenticated or cross-org access.
-- No soft delete on lesson_types (config table; lifecycle via is_active flag).
-- =============================================================================

CREATE POLICY "lesson_types_select_staff"
  ON public.lesson_types FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:read')
  );

-- Students and instructors see active types for the booking / calendar UI.
-- Requires an active student or instructor record in the org to prevent access
-- by users who are merely JWT org members but not enrolled.
CREATE POLICY "lesson_types_select_portal"
  ON public.lesson_types FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND is_active = true
    AND (
      EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.user_id         = auth.uid()
          AND s.organization_id = public.auth_organization_id()
          AND s.deleted_at      IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.instructors i
        WHERE i.user_id         = auth.uid()
          AND i.organization_id = public.auth_organization_id()
          AND i.deleted_at      IS NULL
      )
    )
  );

CREATE POLICY "lesson_types_select_platform"
  ON public.lesson_types FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "lesson_types_insert"
  ON public.lesson_types FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:create')
  );

CREATE POLICY "lesson_types_update"
  ON public.lesson_types FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:update')
  );

CREATE POLICY "lesson_types_delete"
  ON public.lesson_types FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:delete')
  );

-- =============================================================================
-- INSTRUCTOR AVAILABILITY RULES
-- Staff with availability:read see all.
-- Instructors see their own rules (self-access for portal).
-- Platform admin bypass for all rows.
-- No soft delete on this table.
-- =============================================================================

CREATE POLICY "instructor_availability_rules_select_staff"
  ON public.instructor_availability_rules FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:read')
  );

CREATE POLICY "instructor_availability_rules_select_self"
  ON public.instructor_availability_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructors i
      WHERE i.id       = instructor_id
        AND i.user_id  = auth.uid()
        AND i.deleted_at IS NULL
    )
  );

CREATE POLICY "instructor_availability_rules_select_platform"
  ON public.instructor_availability_rules FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "instructor_availability_rules_insert"
  ON public.instructor_availability_rules FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

CREATE POLICY "instructor_availability_rules_update"
  ON public.instructor_availability_rules FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

CREATE POLICY "instructor_availability_rules_delete"
  ON public.instructor_availability_rules FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

-- =============================================================================
-- INSTRUCTOR TIME OFF
-- Staff with availability:read see all.
-- Instructors see their own time-off (for portal status tracking).
-- Staff can approve/reject; instructors can submit and cancel their own pending.
-- No soft delete on this table (approval workflow lifecycle is sufficient).
-- =============================================================================

CREATE POLICY "instructor_time_off_select_staff"
  ON public.instructor_time_off FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:read')
  );

CREATE POLICY "instructor_time_off_select_self"
  ON public.instructor_time_off FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructors i
      WHERE i.id       = instructor_id
        AND i.user_id  = auth.uid()
        AND i.deleted_at IS NULL
    )
  );

CREATE POLICY "instructor_time_off_select_platform"
  ON public.instructor_time_off FOR SELECT
  USING (public.is_platform_admin());

-- Staff or the instructor themselves can submit a time-off request.
CREATE POLICY "instructor_time_off_insert"
  ON public.instructor_time_off FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('scheduling:availability:update')
      OR EXISTS (
        SELECT 1 FROM public.instructors i
        WHERE i.id       = instructor_id
          AND i.user_id  = auth.uid()
          AND i.deleted_at IS NULL
      )
    )
  );

-- Staff can approve/reject. Instructors can cancel their own pending requests.
-- Application layer enforces the rule that instructors cannot approve their own.
CREATE POLICY "instructor_time_off_update"
  ON public.instructor_time_off FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('scheduling:availability:update')
      OR EXISTS (
        SELECT 1 FROM public.instructors i
        WHERE i.id       = instructor_id
          AND i.user_id  = auth.uid()
          AND i.deleted_at IS NULL
      )
    )
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('scheduling:availability:update')
      OR EXISTS (
        SELECT 1 FROM public.instructors i
        WHERE i.id       = instructor_id
          AND i.user_id  = auth.uid()
          AND i.deleted_at IS NULL
      )
    )
  );

-- Only staff with availability:update can hard-delete time-off records.
CREATE POLICY "instructor_time_off_delete"
  ON public.instructor_time_off FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

-- =============================================================================
-- RECURRING SCHEDULE EXCEPTIONS
-- Staff with availability:read see all.
-- Instructors see exceptions for their own rules.
-- No soft delete on this table.
-- =============================================================================

CREATE POLICY "recurring_schedule_exceptions_select_staff"
  ON public.recurring_schedule_exceptions FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:read')
  );

CREATE POLICY "recurring_schedule_exceptions_select_self"
  ON public.recurring_schedule_exceptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructors i
      WHERE i.id       = instructor_id
        AND i.user_id  = auth.uid()
        AND i.deleted_at IS NULL
    )
  );

CREATE POLICY "recurring_schedule_exceptions_select_platform"
  ON public.recurring_schedule_exceptions FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "recurring_schedule_exceptions_insert"
  ON public.recurring_schedule_exceptions FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

CREATE POLICY "recurring_schedule_exceptions_update"
  ON public.recurring_schedule_exceptions FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

CREATE POLICY "recurring_schedule_exceptions_delete"
  ON public.recurring_schedule_exceptions FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

-- =============================================================================
-- LESSON SLOTS
-- Staff with slot:read see all non-deleted slots.
-- Students see open/full/in_progress/completed non-deleted slots (booking UI).
-- Instructors see all non-deleted slots in their schedule (own calendar).
-- Platform admin bypass sees all including soft-deleted (audit).
-- =============================================================================

CREATE POLICY "lesson_slots_select_staff"
  ON public.lesson_slots FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at  IS NULL
    AND public.has_permission('scheduling:slot:read')
  );

-- Students browse available slots in the booking UI.
-- Only non-cancelled, non-deleted slots are shown.
CREATE POLICY "lesson_slots_select_student"
  ON public.lesson_slots FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at  IS NULL
    AND status      IN ('open', 'full', 'in_progress', 'completed')
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.user_id         = auth.uid()
        AND s.organization_id = public.auth_organization_id()
        AND s.deleted_at      IS NULL
    )
  );

-- Instructors see all statuses of their own non-deleted slots.
CREATE POLICY "lesson_slots_select_self"
  ON public.lesson_slots FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.instructors i
      WHERE i.id       = instructor_id
        AND i.user_id  = auth.uid()
        AND i.deleted_at IS NULL
    )
  );

-- Platform admin can see all slots including soft-deleted (audit / support).
CREATE POLICY "lesson_slots_select_platform"
  ON public.lesson_slots FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "lesson_slots_insert"
  ON public.lesson_slots FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:create')
  );

CREATE POLICY "lesson_slots_update"
  ON public.lesson_slots FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at  IS NULL
    AND public.has_permission('scheduling:slot:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:update')
  );

CREATE POLICY "lesson_slots_delete"
  ON public.lesson_slots FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:delete')
  );

-- =============================================================================
-- LESSON BOOKINGS
-- Staff with booking:read see all non-deleted bookings.
-- Students see their own non-deleted bookings.
-- Instructors see all non-deleted bookings in their slots.
-- Platform admin bypass sees all including soft-deleted (audit).
-- =============================================================================

CREATE POLICY "lesson_bookings_select_staff"
  ON public.lesson_bookings FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at  IS NULL
    AND public.has_permission('scheduling:booking:read')
  );

-- Students see their own booking history (all non-deleted statuses).
CREATE POLICY "lesson_bookings_select_student"
  ON public.lesson_bookings FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id       = student_id
        AND s.user_id  = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

-- Instructors see all non-deleted bookings in their slots.
CREATE POLICY "lesson_bookings_select_instructor"
  ON public.lesson_bookings FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.instructors i
      WHERE i.id       = instructor_id
        AND i.user_id  = auth.uid()
        AND i.deleted_at IS NULL
    )
  );

CREATE POLICY "lesson_bookings_select_platform"
  ON public.lesson_bookings FOR SELECT
  USING (public.is_platform_admin());

-- Staff create bookings on behalf of students. Student self-booking is not
-- enabled in Phase 2B — the booking:create permission is staff-only.
-- Phase 3 student portal self-booking requires a separate policy or permission.
CREATE POLICY "lesson_bookings_insert"
  ON public.lesson_bookings FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:create')
  );

CREATE POLICY "lesson_bookings_update"
  ON public.lesson_bookings FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at  IS NULL
    AND public.has_permission('scheduling:booking:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:update')
  );

CREATE POLICY "lesson_bookings_delete"
  ON public.lesson_bookings FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:delete')
  );

-- =============================================================================
-- BOOKING ATTENDANCE
-- Staff with booking:read see all non-deleted attendance records.
-- Students see their own non-deleted records.
-- Instructors see attendance for bookings in their slots.
-- Platform admin bypass sees all including soft-deleted.
-- =============================================================================

CREATE POLICY "booking_attendance_select_staff"
  ON public.booking_attendance FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at  IS NULL
    AND public.has_permission('scheduling:booking:read')
  );

CREATE POLICY "booking_attendance_select_student"
  ON public.booking_attendance FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id       = student_id
        AND s.user_id  = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

-- Instructors see attendance for bookings in their slots.
CREATE POLICY "booking_attendance_select_instructor"
  ON public.booking_attendance FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM   public.lesson_bookings lb
      JOIN   public.instructors i
               ON i.id = lb.instructor_id AND i.user_id = auth.uid()
      WHERE  lb.id        = booking_id
        AND  lb.deleted_at IS NULL
        AND  i.deleted_at  IS NULL
    )
  );

CREATE POLICY "booking_attendance_select_platform"
  ON public.booking_attendance FOR SELECT
  USING (public.is_platform_admin());

-- Only staff with booking:update can record or amend attendance.
CREATE POLICY "booking_attendance_insert"
  ON public.booking_attendance FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:update')
  );

CREATE POLICY "booking_attendance_update"
  ON public.booking_attendance FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at  IS NULL
    AND public.has_permission('scheduling:booking:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:update')
  );

-- Hard DELETE of attendance requires booking:delete. Use soft_delete() instead.
CREATE POLICY "booking_attendance_delete"
  ON public.booking_attendance FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:delete')
  );

-- =============================================================================
-- BOOKING NOTES
-- Staff with booking:read see all non-deleted notes.
-- Students see non-internal (is_internal = false) notes on their bookings.
-- Instructors see all non-deleted notes on their bookings (internal + external).
-- Authors can update and soft-delete their own notes.
-- Platform admin bypass sees all including soft-deleted.
-- =============================================================================

CREATE POLICY "booking_notes_select_staff"
  ON public.booking_notes FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at  IS NULL
    AND public.has_permission('scheduling:booking:read')
  );

-- Students see only shared (non-internal) notes on their own bookings.
CREATE POLICY "booking_notes_select_student"
  ON public.booking_notes FOR SELECT
  USING (
    deleted_at  IS NULL
    AND is_internal = false
    AND EXISTS (
      SELECT 1
      FROM   public.lesson_bookings lb
      JOIN   public.students s
               ON s.id = lb.student_id AND s.user_id = auth.uid()
      WHERE  lb.id        = booking_id
        AND  lb.deleted_at IS NULL
        AND  s.deleted_at  IS NULL
    )
  );

-- Instructors see all notes (including internal) on bookings in their slots.
CREATE POLICY "booking_notes_select_instructor"
  ON public.booking_notes FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM   public.lesson_bookings lb
      JOIN   public.instructors i
               ON i.id = lb.instructor_id AND i.user_id = auth.uid()
      WHERE  lb.id        = booking_id
        AND  lb.deleted_at IS NULL
        AND  i.deleted_at  IS NULL
    )
  );

CREATE POLICY "booking_notes_select_platform"
  ON public.booking_notes FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "booking_notes_insert"
  ON public.booking_notes FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:update')
  );

-- Staff with booking:update OR the note's author can edit.
CREATE POLICY "booking_notes_update"
  ON public.booking_notes FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at  IS NULL
    AND (
      public.has_permission('scheduling:booking:update')
      OR author_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('scheduling:booking:update')
      OR author_id = auth.uid()
    )
  );

-- Staff with booking:delete OR the note's author can hard-delete.
-- Use soft_delete() to preserve audit trail where possible.
CREATE POLICY "booking_notes_delete"
  ON public.booking_notes FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('scheduling:booking:delete')
      OR author_id = auth.uid()
    )
  );
