-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260621000002_package_consumption.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     Package Consumption Automation — Sprint 4
--
-- Creates:
--   student_package_assignments.cancellation_consumes_credit  — config column
--   package_credit_reversals                                  — reversal records
--   package_consumption_events                                — immutable audit timeline
--
-- Adds:
--   consume_lesson_credit()     — SECURITY DEFINER credit consumption
--   reverse_lesson_credit()     — SECURITY DEFINER credit reversal
--   expire_stale_packages()     — SECURITY DEFINER expiration sweep
--   v_student_package_status    — per-assignment credit status view
--   v_package_consumption_stats — org-level utilization stats view
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend student_package_assignments ────────────────────────────────────

ALTER TABLE public.student_package_assignments
  ADD COLUMN IF NOT EXISTS cancellation_consumes_credit boolean NOT NULL DEFAULT false;

-- ── 2. package_credit_reversals ──────────────────────────────────────────────
-- Immutable record of each credit restoration. Created by reverse_lesson_credit().
-- Referenced by package_consumption_events.reversal_id.

CREATE TABLE IF NOT EXISTS public.package_credit_reversals (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id   uuid        NOT NULL REFERENCES public.student_package_assignments(id) ON DELETE CASCADE,
  student_id      uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  booking_id      uuid        REFERENCES public.lesson_bookings(id) ON DELETE SET NULL,
  reversal_type   text        NOT NULL CONSTRAINT chk_reversal_type CHECK (reversal_type IN (
    'manual',             -- Operator manual correction
    'late_cancellation',  -- Late cancel; credit not burned
    'no_show_reversal',   -- No-show credit restored by admin
    'instructor_error',   -- Instructor recorded lesson in error
    'administrative'      -- Admin / accounting adjustment
  )),
  reason          text        NOT NULL,
  credits_restored int        NOT NULL DEFAULT 1 CHECK (credits_restored > 0),
  reversed_by     uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcr_assignment ON public.package_credit_reversals (assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcr_org        ON public.package_credit_reversals (organization_id, created_at DESC);

ALTER TABLE public.package_credit_reversals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pcr_select" ON public.package_credit_reversals;
CREATE POLICY "pcr_select" ON public.package_credit_reversals
  FOR SELECT USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('packages:consumption:read')
  );

GRANT SELECT, INSERT ON public.package_credit_reversals TO authenticated;
GRANT ALL            ON public.package_credit_reversals TO service_role;

-- ── 3. package_consumption_events ────────────────────────────────────────────
-- Append-only timeline for every credit lifecycle event on a package assignment.
-- All writes go through SECURITY DEFINER functions — no authenticated INSERT policy.

CREATE TABLE IF NOT EXISTS public.package_consumption_events (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id    uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id      uuid        NOT NULL REFERENCES public.student_package_assignments(id) ON DELETE CASCADE,
  student_id         uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  event_type         text        NOT NULL CONSTRAINT chk_pce_type CHECK (event_type IN (
    'package_assigned',    -- Package linked to student
    'lesson_booked',       -- Lesson booking linked to this package
    'lesson_completed',    -- Lesson completed (informational)
    'credit_consumed',     -- 1 credit deducted
    'credit_reversed',     -- 1 credit restored
    'package_completed',   -- All credits used
    'package_expired',     -- expires_at passed
    'package_reactivated'  -- Completed package un-completed via reversal
  )),
  booking_id         uuid        REFERENCES public.lesson_bookings(id) ON DELETE SET NULL,
  reversal_id        uuid        REFERENCES public.package_credit_reversals(id) ON DELETE SET NULL,
  credits_delta      int         NOT NULL DEFAULT 0,   -- +1 consumed, -1 reversed, 0 state-only
  lessons_used_after int         NOT NULL DEFAULT 0,   -- snapshot after this event
  actor_id           uuid        REFERENCES auth.users(id),
  actor_email        text,
  metadata           jsonb       NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pce_assignment ON public.package_consumption_events (assignment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pce_student    ON public.package_consumption_events (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pce_org        ON public.package_consumption_events (organization_id, created_at DESC);

ALTER TABLE public.package_consumption_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pce_select" ON public.package_consumption_events;
CREATE POLICY "pce_select" ON public.package_consumption_events
  FOR SELECT USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('packages:consumption:read')
  );

-- No authenticated INSERT — all inserts go through SECURITY DEFINER functions.
GRANT SELECT ON public.package_consumption_events TO authenticated;
GRANT ALL    ON public.package_consumption_events TO service_role;

-- ── 4. Permissions ────────────────────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'packages:consumption:read',    'packages', 'consumption', 'read',    'View package credit usage and consumption events'),
  (gen_random_uuid(), 'packages:consumption:record',  'packages', 'consumption', 'record',  'Record lesson credit consumption against a student package'),
  (gen_random_uuid(), 'packages:consumption:reverse', 'packages', 'consumption', 'reverse', 'Reverse a consumed lesson credit')
ON CONFLICT (code) DO NOTHING;

-- org_owner, org_admin: full consumption access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('org_owner', 'org_admin') AND r.is_system_role = true
  AND p.code IN (
    'packages:consumption:read',
    'packages:consumption:record',
    'packages:consumption:reverse'
  )
ON CONFLICT DO NOTHING;

-- org_manager: read + record (not reverse)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'org_manager' AND r.is_system_role = true
  AND p.code IN ('packages:consumption:read', 'packages:consumption:record')
ON CONFLICT DO NOTHING;

-- instructor_senior, instructor, receptionist: read + record
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('instructor_senior', 'instructor', 'receptionist') AND r.is_system_role = true
  AND p.code IN ('packages:consumption:read', 'packages:consumption:record')
ON CONFLICT DO NOTHING;

-- ── 5. SECURITY DEFINER: consume_lesson_credit ───────────────────────────────
-- Validates active status, checks remaining credits, increments lessons_used,
-- auto-transitions to 'completed', emits consumption (+ completion) events.
-- Returns a JSON snapshot of the result.

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
  v_asgn      RECORD;
  v_new_used  int;
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

-- ── 6. SECURITY DEFINER: reverse_lesson_credit ───────────────────────────────
-- Validates active or completed status, decrements lessons_used,
-- re-activates completed packages, creates reversal record, emits events.

CREATE OR REPLACE FUNCTION public.reverse_lesson_credit(
  p_assignment_id   uuid,
  p_organization_id uuid,
  p_reversal_type   text,
  p_reason          text,
  p_booking_id      uuid DEFAULT NULL,
  p_actor_id        uuid DEFAULT NULL,
  p_actor_email     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asgn        RECORD;
  v_new_used    int;
  v_reversal_id uuid;
  v_reactivated boolean;
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

  IF v_asgn.status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Cannot reverse credits on a % package', v_asgn.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_asgn.lessons_used <= 0 THEN
    RAISE EXCEPTION 'No consumed credits to reverse'
      USING ERRCODE = 'P0001';
  END IF;

  v_new_used    := v_asgn.lessons_used - 1;
  v_reactivated := v_asgn.status = 'completed';

  INSERT INTO public.package_credit_reversals (
    organization_id, assignment_id, student_id, booking_id,
    reversal_type, reason, credits_restored, reversed_by
  ) VALUES (
    p_organization_id, p_assignment_id, v_asgn.student_id, p_booking_id,
    p_reversal_type, p_reason, 1, p_actor_id
  )
  RETURNING id INTO v_reversal_id;

  UPDATE public.student_package_assignments
  SET    lessons_used = v_new_used,
         status       = CASE WHEN v_reactivated THEN 'active' ELSE status END,
         updated_at   = now()
  WHERE  id = p_assignment_id;

  INSERT INTO public.package_consumption_events (
    organization_id, assignment_id, student_id, event_type,
    booking_id, reversal_id, credits_delta, lessons_used_after,
    actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, p_assignment_id, v_asgn.student_id, 'credit_reversed',
    p_booking_id, v_reversal_id, -1, v_new_used,
    p_actor_id, p_actor_email,
    jsonb_build_object('reversal_type', p_reversal_type, 'reason', p_reason)
  );

  IF v_reactivated THEN
    INSERT INTO public.package_consumption_events (
      organization_id, assignment_id, student_id, event_type,
      credits_delta, lessons_used_after, actor_id, actor_email, metadata
    ) VALUES (
      p_organization_id, p_assignment_id, v_asgn.student_id, 'package_reactivated',
      0, v_new_used, p_actor_id, p_actor_email, '{}'
    );
  END IF;

  RETURN jsonb_build_object(
    'assignment_id',     p_assignment_id,
    'reversal_id',       v_reversal_id,
    'lessons_used',      v_new_used,
    'lessons_remaining', v_asgn.package_quantity - v_new_used,
    'reactivated',       v_reactivated,
    'status',            CASE WHEN v_reactivated THEN 'active' ELSE v_asgn.status END
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.reverse_lesson_credit(uuid,uuid,text,text,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_lesson_credit(uuid,uuid,text,text,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_lesson_credit(uuid,uuid,text,text,uuid,uuid,text) TO service_role;

-- ── 7. SECURITY DEFINER: expire_stale_packages ───────────────────────────────
-- Sweeps active packages whose expires_at < now() and marks them 'expired'.
-- Emits a package_expired event for each. Returns count of expired packages.
-- Suitable for event-worker tick or on-demand admin call.

CREATE OR REPLACE FUNCTION public.expire_stale_packages(
  p_organization_id uuid
)
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
    SELECT id, student_id, lessons_used
    FROM   public.student_package_assignments
    WHERE  organization_id = p_organization_id
      AND  status          = 'active'
      AND  expires_at      IS NOT NULL
      AND  expires_at      <  now()
    FOR UPDATE
  LOOP
    UPDATE public.student_package_assignments
    SET    status     = 'expired',
           updated_at = now()
    WHERE  id = v_rec.id;

    INSERT INTO public.package_consumption_events (
      organization_id, assignment_id, student_id, event_type,
      credits_delta, lessons_used_after, metadata
    ) VALUES (
      p_organization_id, v_rec.id, v_rec.student_id, 'package_expired',
      0, v_rec.lessons_used,
      jsonb_build_object('expired_at', now())
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL    ON FUNCTION public.expire_stale_packages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_packages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_packages(uuid) TO service_role;

-- ── 8. Reporting views ────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_student_package_status
WITH (security_invoker = true) AS
SELECT
  spa.id,
  spa.organization_id,
  spa.student_id,
  spa.enrollment_id,
  spa.package_offering_id,
  spa.package_name,
  spa.package_code,
  spa.lesson_category,
  spa.package_quantity,
  spa.lessons_used,
  (spa.package_quantity - spa.lessons_used)                  AS lessons_remaining,
  CASE
    WHEN spa.package_quantity > 0
    THEN ROUND(
      (spa.lessons_used::numeric / spa.package_quantity::numeric) * 100,
      1
    )
    ELSE 0::numeric
  END                                                         AS completion_pct,
  spa.cancellation_consumes_credit,
  spa.campaign_name,
  spa.coupon_code,
  spa.base_price,
  spa.final_price_incl_vat,
  spa.currency,
  spa.status,
  spa.expires_at,
  spa.assigned_at,
  spa.assigned_by,
  CASE
    WHEN spa.status = 'active'
      AND spa.expires_at IS NOT NULL
      AND spa.expires_at < (now() + INTERVAL '7 days')
    THEN true
    ELSE false
  END                                                         AS expiration_warning,
  s.first_name,
  s.last_name,
  s.email   AS student_email,
  s.onboarding_status
FROM public.student_package_assignments spa
JOIN public.students s
  ON s.id = spa.student_id AND s.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_package_consumption_stats
WITH (security_invoker = true) AS
SELECT
  spa.organization_id,
  COUNT(spa.id)                                                         AS total_packages,
  COUNT(spa.id) FILTER (WHERE spa.status = 'active')                   AS active_packages,
  COUNT(spa.id) FILTER (WHERE spa.status = 'completed')                AS completed_packages,
  COUNT(spa.id) FILTER (WHERE spa.status = 'expired')                  AS expired_packages,
  COUNT(spa.id) FILTER (WHERE spa.status = 'cancelled')                AS cancelled_packages,
  COALESCE(SUM(spa.lessons_used), 0)                                   AS total_credits_consumed,
  COALESCE(
    SUM(spa.package_quantity - spa.lessons_used)
      FILTER (WHERE spa.status = 'active'),
    0
  )                                                                     AS total_credits_remaining,
  COALESCE(SUM(spa.package_quantity), 0)                               AS total_credits_issued,
  ROUND(AVG(
    CASE WHEN spa.package_quantity > 0
    THEN (spa.lessons_used::numeric / spa.package_quantity::numeric) * 100
    ELSE 0 END
  ), 1)                                                                 AS avg_completion_pct,
  COUNT(spa.id) FILTER (
    WHERE spa.status = 'active'
      AND spa.expires_at IS NOT NULL
      AND spa.expires_at < (now() + INTERVAL '7 days')
  )                                                                     AS expiring_soon_count
FROM public.student_package_assignments spa
GROUP BY spa.organization_id;
