-- Tighten instructor_time_off UPDATE policy.
--
-- The original WITH CHECK only verified org membership + identity; it did not restrict
-- which status values an instructor could write on their own record. An instructor
-- could self-approve by setting status = 'approved' directly, bypassing the
-- approval workflow. This migration enforces the constraint at the DB layer.
--
-- New rule:
--   • Staff with scheduling:availability:update  → may set any status (approve/reject/etc.)
--   • Instructors updating their own record      → may only set status to 'pending' or 'cancelled'

DROP POLICY IF EXISTS "instructor_time_off_update" ON public.instructor_time_off;

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
      -- Staff with permission can set any status
      public.has_permission('scheduling:availability:update')
      OR (
        -- Instructors can only move their own requests to pending or cancelled
        EXISTS (
          SELECT 1 FROM public.instructors i
          WHERE i.id       = instructor_id
            AND i.user_id  = auth.uid()
            AND i.deleted_at IS NULL
        )
        AND status IN ('pending', 'cancelled')
      )
    )
  );
