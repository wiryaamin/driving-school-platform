-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260621000003_package_consumption_fix.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     Package Consumption Automation — Sprint 4 Remediation
--
-- Fixes applied:
--   C-1: consume_lesson_credit() now validates expires_at before consuming.
--        An expired package is rejected even if the expiration sweep has not
--        yet executed.
--
--   H-1: expire_stale_packages_all() — org-agnostic sweep for the event-worker
--        maintenance tick. Uses SKIP LOCKED so concurrent ticks are safe.
--
--   H-2: record_package_assigned_event()   — writes package_assigned event
--        record_lesson_booked_event()       — writes lesson_booked event
--        record_lesson_completed_event()    — writes lesson_completed event
--        All three are non-critical (silent on missing data) so they never
--        break the primary operation that invokes them.
-- ════════════════════════════════════════════════════════════════════════════

-- ── C-1: consume_lesson_credit — add expiration guard ────────────────────────
-- Replaces the version from 20260621000002. All other logic is unchanged.

CREATE OR REPLACE FUNCTION public.consume_lesson_credit(
  p_assignment_id   uuid,
  p_organization_id uuid,
  p_booking_id      uuid  DEFAULT NULL,
  p_lesson_category text  DEFAULT NULL,
  p_actor_id        uuid  DEFAULT NULL,
  p_actor_email     text  DEFAULT NULL,
  p_metadata        jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asgn     RECORD;
  v_new_used int;
  v_completed boolean;
BEGIN
  SELECT *
  INTO   v_asgn
  FROM   public.student_package_assignments
  WHERE  id              = p_assignment_id
    AND  organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package assignment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_asgn.status != 'active' THEN
    RAISE EXCEPTION 'Package is % — only active packages can consume credits', v_asgn.status
      USING ERRCODE = 'P0001';
  END IF;

  -- C-1 fix: reject consumption even if the expiration sweep has not yet run.
  IF v_asgn.expires_at IS NOT NULL AND v_asgn.expires_at < now() THEN
    RAISE EXCEPTION 'Package has expired — credits cannot be consumed after expiry'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_asgn.lessons_used >= v_asgn.package_quantity THEN
    RAISE EXCEPTION 'No remaining credits in package'
      USING ERRCODE = 'P0001';
  END IF;

  v_new_used  := v_asgn.lessons_used + 1;
  v_completed := v_new_used >= v_asgn.package_quantity;

  UPDATE public.student_package_assignments
  SET    lessons_used = v_new_used,
         status       = CASE WHEN v_completed THEN 'completed' ELSE status END,
         updated_at   = now()
  WHERE  id = p_assignment_id;

  INSERT INTO public.package_consumption_events (
    organization_id, assignment_id, student_id, event_type,
    booking_id, credits_delta, lessons_used_after,
    actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, p_assignment_id, v_asgn.student_id, 'credit_consumed',
    p_booking_id, 1, v_new_used,
    p_actor_id, p_actor_email,
    p_metadata || CASE
      WHEN p_lesson_category IS NOT NULL
      THEN jsonb_build_object('lesson_category', p_lesson_category)
      ELSE '{}'::jsonb
    END
  );

  IF v_completed THEN
    INSERT INTO public.package_consumption_events (
      organization_id, assignment_id, student_id, event_type,
      credits_delta, lessons_used_after, actor_id, actor_email, metadata
    ) VALUES (
      p_organization_id, p_assignment_id, v_asgn.student_id, 'package_completed',
      0, v_new_used, p_actor_id, p_actor_email, '{}'
    );
  END IF;

  RETURN jsonb_build_object(
    'assignment_id',     p_assignment_id,
    'student_id',        v_asgn.student_id,
    'lessons_used',      v_new_used,
    'lessons_remaining', v_asgn.package_quantity - v_new_used,
    'package_completed', v_completed,
    'status',            CASE WHEN v_completed THEN 'completed' ELSE v_asgn.status END
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.consume_lesson_credit(uuid,uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_lesson_credit(uuid,uuid,uuid,text,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_lesson_credit(uuid,uuid,uuid,text,uuid,text,jsonb) TO service_role;

-- ── H-1: expire_stale_packages_all — cross-org sweep for maintenance tick ────
-- The per-org expire_stale_packages(uuid) remains available for on-demand calls.
-- This variant sweeps all orgs atomically using SKIP LOCKED so concurrent
-- event-worker invocations do not double-expire the same row.

CREATE OR REPLACE FUNCTION public.expire_stale_packages_all()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec   RECORD;
  v_count int := 0;
BEGIN
  FOR v_rec IN
    SELECT id, organization_id, student_id, lessons_used
    FROM   public.student_package_assignments
    WHERE  status     = 'active'
      AND  expires_at IS NOT NULL
      AND  expires_at <  now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.student_package_assignments
    SET    status     = 'expired',
           updated_at = now()
    WHERE  id = v_rec.id;

    INSERT INTO public.package_consumption_events (
      organization_id, assignment_id, student_id, event_type,
      credits_delta, lessons_used_after, metadata
    ) VALUES (
      v_rec.organization_id, v_rec.id, v_rec.student_id, 'package_expired',
      0, v_rec.lessons_used,
      jsonb_build_object('expired_at', now())
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL    ON FUNCTION public.expire_stale_packages_all() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_packages_all() TO service_role;

-- ── H-2a: record_package_assigned_event ──────────────────────────────────────
-- Called by the enrollment Edge Function after a package assignment is created.
-- Writes a package_assigned event so the package timeline is complete from day 1.
-- Non-critical: returns void and is silent on missing data.

CREATE OR REPLACE FUNCTION public.record_package_assigned_event(
  p_assignment_id   uuid,
  p_organization_id uuid,
  p_actor_id        uuid DEFAULT NULL,
  p_actor_email     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asgn RECORD;
BEGIN
  SELECT student_id, package_name, lesson_category, package_quantity
  INTO   v_asgn
  FROM   public.student_package_assignments
  WHERE  id              = p_assignment_id
    AND  organization_id = p_organization_id;

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.package_consumption_events (
    organization_id, assignment_id, student_id, event_type,
    credits_delta, lessons_used_after, actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, p_assignment_id, v_asgn.student_id, 'package_assigned',
    0, 0, p_actor_id, p_actor_email,
    jsonb_build_object(
      'package_name',     v_asgn.package_name,
      'lesson_category',  v_asgn.lesson_category,
      'package_quantity', v_asgn.package_quantity
    )
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.record_package_assigned_event(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_package_assigned_event(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_package_assigned_event(uuid,uuid,uuid,text) TO service_role;

-- ── H-2b: record_lesson_booked_event ─────────────────────────────────────────
-- Called by the event-worker's Lesson.Created handler.
-- Locates the student's oldest active package assignment whose lesson_category
-- matches the slot's lesson_type.category, then emits a lesson_booked event.
-- If no active package matches, the function returns silently (no event).
-- This preserves the FIFO credit consumption ordering.

CREATE OR REPLACE FUNCTION public.record_lesson_booked_event(
  p_booking_id      uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_slot_id    uuid;
  v_category   text;
  v_asgn_id    uuid;
  v_used       int;
BEGIN
  -- Fetch booking identifiers
  SELECT student_id, slot_id
  INTO   v_student_id, v_slot_id
  FROM   public.lesson_bookings
  WHERE  id              = p_booking_id
    AND  organization_id = p_organization_id
    AND  deleted_at      IS NULL;

  IF NOT FOUND THEN RETURN; END IF;

  -- Resolve lesson_category via lesson_types join
  SELECT lt.category::text
  INTO   v_category
  FROM   public.lesson_slots    ls
  JOIN   public.lesson_types    lt ON lt.id = ls.lesson_type_id
  WHERE  ls.id              = v_slot_id
    AND  ls.organization_id = p_organization_id
    AND  ls.deleted_at      IS NULL;

  IF NOT FOUND THEN RETURN; END IF;

  -- Find oldest active assignment for this student + category (FIFO)
  SELECT id, lessons_used
  INTO   v_asgn_id, v_used
  FROM   public.student_package_assignments
  WHERE  student_id      = v_student_id
    AND  organization_id = p_organization_id
    AND  lesson_category = v_category
    AND  status          = 'active'
  ORDER  BY assigned_at ASC
  LIMIT  1;

  IF v_asgn_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.package_consumption_events (
    organization_id, assignment_id, student_id, event_type,
    booking_id, credits_delta, lessons_used_after, metadata
  ) VALUES (
    p_organization_id, v_asgn_id, v_student_id, 'lesson_booked',
    p_booking_id, 0, v_used,
    jsonb_build_object('lesson_category', v_category)
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.record_lesson_booked_event(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_lesson_booked_event(uuid,uuid) TO service_role;

-- ── H-2c: record_lesson_completed_event ──────────────────────────────────────
-- Called by the bookings Edge Function when a booking transitions to 'completed'.
-- Emits a lesson_completed informational event on the most relevant package:
--   1. Active package with matching category (FIFO)
--   2. Most recently assigned completed package with matching category (fallback)
-- Returns silently if no matching assignment exists.

CREATE OR REPLACE FUNCTION public.record_lesson_completed_event(
  p_booking_id      uuid,
  p_organization_id uuid,
  p_actor_id        uuid DEFAULT NULL,
  p_actor_email     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_slot_id    uuid;
  v_category   text;
  v_asgn_id    uuid;
  v_used       int;
BEGIN
  SELECT student_id, slot_id
  INTO   v_student_id, v_slot_id
  FROM   public.lesson_bookings
  WHERE  id              = p_booking_id
    AND  organization_id = p_organization_id
    AND  deleted_at      IS NULL;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT lt.category::text
  INTO   v_category
  FROM   public.lesson_slots  ls
  JOIN   public.lesson_types  lt ON lt.id = ls.lesson_type_id
  WHERE  ls.id              = v_slot_id
    AND  ls.organization_id = p_organization_id
    AND  ls.deleted_at      IS NULL;

  IF NOT FOUND THEN RETURN; END IF;

  -- Prefer active package; fall back to most recently assigned non-cancelled
  SELECT id, lessons_used
  INTO   v_asgn_id, v_used
  FROM   public.student_package_assignments
  WHERE  student_id      = v_student_id
    AND  organization_id = p_organization_id
    AND  lesson_category = v_category
    AND  status          != 'cancelled'
  ORDER  BY
    CASE WHEN status = 'active'    THEN 0
         WHEN status = 'completed' THEN 1
         ELSE 2
    END,
    assigned_at ASC
  LIMIT  1;

  IF v_asgn_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.package_consumption_events (
    organization_id, assignment_id, student_id, event_type,
    booking_id, credits_delta, lessons_used_after,
    actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, v_asgn_id, v_student_id, 'lesson_completed',
    p_booking_id, 0, v_used,
    p_actor_id, p_actor_email,
    jsonb_build_object('lesson_category', v_category)
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.record_lesson_completed_event(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_lesson_completed_event(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_lesson_completed_event(uuid,uuid,uuid,text) TO service_role;
