-- =============================================================================
-- MIGRATION: 20260720000007_fix_spa_select_rls_permission_mismatch.sql
-- Description:
--   Sprint 4I operational validation found that GET /package-consumption
--   (backing the "Paket & krediter" panel) returns 200 with an always-empty
--   data array for receptionist and instructor, even after confirming via
--   service-role query that matching student_package_assignments rows
--   exist. No error surfaces anywhere — RLS silently filters every row.
--
--   Root cause: a permission-code mismatch between the edge function's
--   application-layer check and the table's RLS policy. The list/detail/
--   events handlers in supabase/functions/package-consumption/index.ts all
--   check 'packages:consumption:read' (and receptionist/instructor do have
--   it — see 20260720000003/002). But the spa_select RLS policy on
--   student_package_assignments (20260630000002_repair_enrollment_sprint2)
--   requires 'enrollment:request:read' instead — a different permission,
--   from the enrollment-request domain, that only org_owner/org_admin/
--   org_manager/finance_admin hold. The two checks were never reconciled
--   when package-consumption's read surface was generalized beyond the
--   original enrollment-conversion flow, so every role that legitimately
--   passes the app-layer check still gets zero rows back from Postgres.
--
--   Fix: point spa_select at packages:consumption:read, matching what the
--   edge function that is the sole consumer of this policy actually
--   checks. spa_insert/spa_update are not touched — inserts run through
--   SECURITY DEFINER RPCs (purchase_package, enrollment conversion) that
--   bypass RLS, and the one direct UPDATE path (PATCH
--   cancellation_consumes_credit) already checks enrollment:package:assign
--   at the app layer, matching spa_update exactly.
-- =============================================================================

DROP POLICY IF EXISTS "spa_select" ON public.student_package_assignments;

CREATE POLICY "spa_select" ON public.student_package_assignments
  FOR SELECT USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('packages:consumption:read')
  );
