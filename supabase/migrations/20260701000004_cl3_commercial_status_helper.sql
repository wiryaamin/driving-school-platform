-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701000004_cl3_commercial_status_helper.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Sprint:    CL-3 — Enrollment → Invoice Integration
--
-- DELIVERABLE:
--   D3.M1  set_student_commercial_status()
--          SECURITY DEFINER helper that updates students.commercial_status
--          without requiring the caller to hold students:student:update.
--          Required because handleConvert() runs under enrollment:request:convert
--          which does not grant direct UPDATE access to the students table.
--
--          Modeled on set_student_onboarding_status() from
--          20260630000002_repair_enrollment_sprint2.sql (lines 286–311).
--
-- CALLER CONTEXTS:
--   - handleConvert() in enrollments Edge Function
--       'aktiverad_ej_fakturerad' — after enrollment is marked converted
--       'awaiting_payment'        — after invoice is successfully issued
--   - handleCreateInvoice() in enrollments Edge Function
--       'awaiting_payment'        — after invoice created via fallback route
--
-- DEPENDENCIES:
--   public.student_commercial_status ENUM — 20260701000001
--   public.students.commercial_status    — 20260701000001
-- ════════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION public.set_student_commercial_status(
  p_organization_id uuid,
  p_student_id      uuid,
  p_status          text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN (
    'operationally_registered',
    'aktiverad_ej_fakturerad',
    'awaiting_payment',
    'partially_paid',
    'commercially_active',
    'package_exhausted',
    'package_expired',
    'training_complete',
    'archived'
  ) THEN
    RAISE EXCEPTION 'Invalid commercial_status: %', p_status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.students
     SET commercial_status = p_status::public.student_commercial_status,
         updated_at        = now()
   WHERE id              = p_student_id
     AND organization_id = p_organization_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.set_student_commercial_status(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_student_commercial_status(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_commercial_status(uuid, uuid, text) TO service_role;
