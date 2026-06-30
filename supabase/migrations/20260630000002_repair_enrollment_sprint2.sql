-- ════════════════════════════════════════════════════════════════════════════
-- REPAIR MIGRATION: 20260630000002_repair_enrollment_sprint2.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
--
-- Purpose:
--   Reproduces the content of 20260621000001_enrollment_sprint2.sql that was
--   silently skipped due to a version-prefix collision with
--   20260621000001_student_practice_log.sql.
--   The Supabase CLI recorded version 20260621000001 for the first file it
--   encountered and skipped the second file's SQL content entirely.
--
--   This repair migration is idempotent throughout. It can execute safely
--   whether objects exist, do not exist, or data is already present.
--
-- Objects reproduced (all with idempotency guards):
--   students.onboarding_status      — Onboarding workflow status column
--   enrollment_events               — Immutable audit timeline per enrollment
--   student_package_assignments     — Package ownership with full price snapshot
--   emit_enrollment_event()         — SECURITY DEFINER event emitter (RPC)
--   set_student_onboarding_status() — SECURITY DEFINER onboarding updater
--   v_enrollment_stats              — Per-org aggregate statistics view
--   v_enrollment_campaign_stats     — Campaign conversion performance view
--
-- Dependencies (must exist before this migration runs):
--   public.organizations            — Phase 1 (applied)
--   public.students                 — Phase 2A (applied)
--   public.package_offerings        — Phase 4A (applied)
--   public.campaigns                — 20260628000001 (applied)
--   public.campaign_coupon_codes    — 20260628000001 (applied)
--   public.enrollment_requests      — 20260630000001 (runs immediately before)
--   auth.users                      — Supabase managed
--   public.set_updated_at()         — Phase 1 (applied)
--   public.auth_organization_id()   — Phase 1 (applied)
--   public.has_permission()         — Phase 1 (applied)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Student onboarding status ──────────────────────────────────────────────
-- Tracks where a newly converted student is in the pre-booking onboarding flow.
-- Operators update this as the student progresses.
-- ADD COLUMN IF NOT EXISTS is inherently idempotent.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'new_student'
  CONSTRAINT chk_student_onboarding_status CHECK (onboarding_status IN (
    'new_student',        -- Freshly converted; no action taken yet
    'documents_pending',  -- Awaiting identity / permit documents from student
    'ready_for_booking',  -- Documents verified; operator cleared student for lessons
    'active_student'      -- Student has booked at least one lesson
  ));

-- ── 2. Enrollment events ──────────────────────────────────────────────────────
-- Append-only audit timeline for each enrollment lifecycle transition.
-- Emitted via SECURITY DEFINER RPC to avoid needing a permissive INSERT policy.

CREATE TABLE IF NOT EXISTS public.enrollment_events (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enrollment_id   uuid        NOT NULL REFERENCES public.enrollment_requests(id) ON DELETE CASCADE,
  event_type      text        NOT NULL CONSTRAINT chk_enrollment_event_type CHECK (event_type IN (
    'submitted',        -- Form submitted by prospective student
    'viewed',           -- Operator first opened the enrollment record
    'approved',         -- Operator approved the enrollment
    'rejected',         -- Operator rejected the enrollment
    'converted',        -- Enrollment converted to a student record
    'package_assigned', -- Package ownership record created for the student
    'notes_updated',    -- Operator updated internal notes
    'status_updated'    -- Onboarding status changed on the linked student
  )),
  actor_id        uuid        REFERENCES auth.users(id),
  actor_email     text,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Immutable: no UPDATE trigger, no UPDATE/DELETE policies
CREATE INDEX IF NOT EXISTS idx_enrollment_events_enrollment
  ON public.enrollment_events (enrollment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_enrollment_events_org
  ON public.enrollment_events (organization_id, created_at DESC);

ALTER TABLE public.enrollment_events ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'enrollment_events'
      AND policyname = 'enrollment_events_select'
  ) THEN
    CREATE POLICY "enrollment_events_select" ON public.enrollment_events
      FOR SELECT USING (
        organization_id = public.auth_organization_id()
        AND public.has_permission('enrollment:request:read')
      );
  END IF;
END;
$policy$;

-- No authenticated INSERT policy — all inserts go through emit_enrollment_event()
GRANT SELECT          ON public.enrollment_events TO authenticated;
GRANT SELECT, INSERT  ON public.enrollment_events TO service_role;

-- ── 3. Student package assignments ────────────────────────────────────────────
-- Created automatically when an enrollment is converted to a student.
-- Records an immutable snapshot of the package, pricing, and discounts applied.

CREATE TABLE IF NOT EXISTS public.student_package_assignments (
  id                   uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id           uuid          NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  enrollment_id        uuid          REFERENCES public.enrollment_requests(id),
  package_offering_id  uuid          NOT NULL REFERENCES public.package_offerings(id),

  -- ── Package snapshot (immutable at assignment) ──────────────────────────
  package_name         text          NOT NULL,
  package_code         text,
  lesson_category      text          NOT NULL,
  package_quantity     int           NOT NULL CHECK (package_quantity > 0),

  -- ── Campaign / coupon audit trail ───────────────────────────────────────
  campaign_id          uuid          REFERENCES public.campaigns(id),
  campaign_name        text,
  coupon_id            uuid          REFERENCES public.campaign_coupon_codes(id),
  coupon_code          text,

  -- ── Price snapshot (immutable) ───────────────────────────────────────────
  base_price           numeric(12,2) NOT NULL CHECK (base_price >= 0),
  vat_rate             numeric(5,4)  NOT NULL CHECK (vat_rate >= 0),
  campaign_discount    numeric(12,2) NOT NULL DEFAULT 0 CHECK (campaign_discount >= 0),
  coupon_discount      numeric(12,2) NOT NULL DEFAULT 0 CHECK (coupon_discount >= 0),
  final_price          numeric(12,2) NOT NULL CHECK (final_price >= 0),
  final_price_incl_vat numeric(12,2) NOT NULL CHECK (final_price_incl_vat >= 0),
  currency             text          NOT NULL DEFAULT 'SEK',

  -- ── Progress tracking ─────────────────────────────────────────────────────
  lessons_used         int           NOT NULL DEFAULT 0 CHECK (lessons_used >= 0),
  status               text          NOT NULL DEFAULT 'active'
    CONSTRAINT chk_spa_status CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  expires_at           timestamptz,

  -- ── Assignment audit ──────────────────────────────────────────────────────
  assigned_at          timestamptz   NOT NULL DEFAULT now(),
  assigned_by          uuid          REFERENCES auth.users(id),

  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_student_package_assignments_updated_at
  ON public.student_package_assignments;
CREATE TRIGGER set_student_package_assignments_updated_at
  BEFORE UPDATE ON public.student_package_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_spa_student
  ON public.student_package_assignments (student_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_spa_org_status
  ON public.student_package_assignments (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_spa_enrollment
  ON public.student_package_assignments (enrollment_id)
  WHERE enrollment_id IS NOT NULL;

ALTER TABLE public.student_package_assignments ENABLE ROW LEVEL SECURITY;

-- Read: any org member with enrollment read permission
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'student_package_assignments'
      AND policyname = 'spa_select'
  ) THEN
    CREATE POLICY "spa_select" ON public.student_package_assignments
      FOR SELECT USING (
        organization_id = public.auth_organization_id()
        AND public.has_permission('enrollment:request:read')
      );
  END IF;
END;
$policy$;

-- Insert: org members with convert permission (auto-created during conversion)
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'student_package_assignments'
      AND policyname = 'spa_insert'
  ) THEN
    CREATE POLICY "spa_insert" ON public.student_package_assignments
      FOR INSERT WITH CHECK (
        organization_id = public.auth_organization_id()
        AND public.has_permission('enrollment:request:convert')
      );
  END IF;
END;
$policy$;

-- Update: org members with package assign permission
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'student_package_assignments'
      AND policyname = 'spa_update'
  ) THEN
    CREATE POLICY "spa_update" ON public.student_package_assignments
      FOR UPDATE
      USING (
        organization_id = public.auth_organization_id()
        AND public.has_permission('enrollment:package:assign')
      )
      WITH CHECK (
        organization_id = public.auth_organization_id()
        AND public.has_permission('enrollment:package:assign')
      );
  END IF;
END;
$policy$;

GRANT SELECT, INSERT, UPDATE ON public.student_package_assignments TO authenticated;
GRANT ALL                    ON public.student_package_assignments TO service_role;

-- ── 4. New permission: enrollment:package:assign ──────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'enrollment:package:assign', 'enrollment', 'package', 'assign',
   'Assign or manage package ownership for a converted enrollment student')
ON CONFLICT (code) DO NOTHING;

-- org_owner and org_admin get this permission
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin') AND r.is_system_role = true
  AND  p.code = 'enrollment:package:assign'
ON CONFLICT DO NOTHING;

-- org_manager gets this permission too
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name = 'org_manager' AND r.is_system_role = true
  AND  p.code = 'enrollment:package:assign'
ON CONFLICT DO NOTHING;

-- ── 5. SECURITY DEFINER helpers ───────────────────────────────────────────────

-- emit_enrollment_event: append an immutable audit event for an enrollment.
-- Called by both the protected enrollments Edge Function (user JWT)
-- and the public-enrollment Edge Function (service role).
CREATE OR REPLACE FUNCTION public.emit_enrollment_event(
  p_organization_id uuid,
  p_enrollment_id   uuid,
  p_event_type      text,
  p_actor_id        uuid  DEFAULT NULL,
  p_actor_email     text  DEFAULT NULL,
  p_metadata        jsonb DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.enrollment_events
    (organization_id, enrollment_id, event_type, actor_id, actor_email, metadata)
  VALUES
    (p_organization_id, p_enrollment_id, p_event_type, p_actor_id, p_actor_email, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.emit_enrollment_event(uuid, uuid, text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_enrollment_event(uuid, uuid, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emit_enrollment_event(uuid, uuid, text, uuid, text, jsonb) TO service_role;

-- set_student_onboarding_status: update the onboarding_status column on a student
-- without requiring the caller to have students:student:update permission.
-- Called from the enrollment operator workflow.
CREATE OR REPLACE FUNCTION public.set_student_onboarding_status(
  p_organization_id   uuid,
  p_student_id        uuid,
  p_onboarding_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_onboarding_status NOT IN (
    'new_student', 'documents_pending', 'ready_for_booking', 'active_student'
  ) THEN
    RAISE EXCEPTION 'Invalid onboarding_status: %', p_onboarding_status;
  END IF;

  UPDATE public.students
     SET onboarding_status = p_onboarding_status
   WHERE id              = p_student_id
     AND organization_id = p_organization_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.set_student_onboarding_status(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_student_onboarding_status(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_onboarding_status(uuid, uuid, text) TO service_role;

-- ── 6. Reporting views ────────────────────────────────────────────────────────
-- security_invoker = true: views respect the caller's RLS context.
-- RLS on enrollment_requests already enforces org isolation.
-- CREATE OR REPLACE VIEW is inherently idempotent.

CREATE OR REPLACE VIEW public.v_enrollment_stats
WITH (security_invoker = true)
AS
SELECT
  organization_id,
  COUNT(*) FILTER (WHERE status = 'submitted')       AS submitted_count,
  COUNT(*) FILTER (WHERE status = 'pending_review')  AS pending_review_count,
  COUNT(*) FILTER (WHERE status = 'approved')        AS approved_count,
  COUNT(*) FILTER (WHERE status = 'rejected')        AS rejected_count,
  COUNT(*) FILTER (WHERE status = 'converted')       AS converted_count,
  COUNT(*)                                           AS total_count,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'converted') * 100.0
    / NULLIF(COUNT(*), 0),
    1
  )                                                  AS conversion_rate_pct,
  COALESCE(SUM(final_price_incl_vat) FILTER (
    WHERE status IN ('approved', 'converted')
  ), 0)                                              AS pipeline_value,
  COALESCE(SUM(final_price_incl_vat) FILTER (
    WHERE status = 'converted'
  ), 0)                                              AS converted_value,
  COUNT(*) FILTER (
    WHERE submitted_at >= now() - INTERVAL '30 days'
  )                                                  AS last_30d_count,
  COUNT(*) FILTER (
    WHERE status = 'converted'
      AND converted_at >= now() - INTERVAL '30 days'
  )                                                  AS last_30d_converted
FROM public.enrollment_requests
GROUP BY organization_id;

CREATE OR REPLACE VIEW public.v_enrollment_campaign_stats
WITH (security_invoker = true)
AS
SELECT
  er.organization_id,
  er.campaign_id,
  er.campaign_name,
  COUNT(*)                                                AS total_enrollments,
  COUNT(*) FILTER (WHERE er.status = 'converted')        AS converted_count,
  ROUND(
    COUNT(*) FILTER (WHERE er.status = 'converted') * 100.0
    / NULLIF(COUNT(*), 0),
    1
  )                                                       AS conversion_rate_pct,
  COALESCE(SUM(er.campaign_discount) FILTER (
    WHERE er.status IN ('approved', 'converted')
  ), 0)                                                   AS total_discount_given,
  COALESCE(SUM(er.final_price_incl_vat) FILTER (
    WHERE er.status = 'converted'
  ), 0)                                                   AS converted_revenue
FROM public.enrollment_requests er
WHERE er.campaign_id IS NOT NULL
GROUP BY er.organization_id, er.campaign_id, er.campaign_name;
