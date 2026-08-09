-- =============================================================================
-- notification_rules — Align RLS permission with the existing admin UI
--
-- Migration 20260724000014 tightened notification_rules writes to require
-- notifications:preferences:manage, which is only granted to org_owner and
-- org_admin (20260619000007). But the real, already-shipped admin UI for
-- this table — NotificationRulesPage at /communication/rules — gates its
-- create/update/delete buttons on communications:message:create, a much
-- more broadly granted permission (org_manager, instructor_senior,
-- receptionist, student_admin, in addition to org_owner/org_admin).
--
-- Left as-is, org_manager/receptionist/student_admin/instructor_senior users
-- would see enabled edit controls on that page but get RLS-denied on save —
-- a regression this migration introduced. Fix: match the RLS permission
-- check to the permission the existing frontend already relies on, rather
-- than retrofitting the frontend to a new, narrower permission.
-- =============================================================================

DROP POLICY IF EXISTS "notification_rules_insert" ON public.notification_rules;
DROP POLICY IF EXISTS "notification_rules_update" ON public.notification_rules;

CREATE POLICY "notification_rules_insert"
  ON public.notification_rules FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('communications:message:create')
  );

CREATE POLICY "notification_rules_update"
  ON public.notification_rules FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('communications:message:create')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('communications:message:create')
  );
