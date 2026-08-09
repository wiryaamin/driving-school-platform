-- =============================================================================
-- notification_templates — fix RLS referencing permission codes that don't exist
--
-- Found while formally auditing TemplateManagementPage as a Tenant
-- Configuration surface. notification_templates_insert/update require
-- has_permission('notifications:template:create'/'update') — but neither
-- permission code exists in public.permissions at all, so has_permission()
-- returns false unconditionally for every user, always. Direct-table
-- INSERT/UPDATE has been impossible for 100% of users since these policies
-- were created — masked in practice because the real write path
-- (TemplateManagementPage -> communications Edge Function, POST/PATCH
-- /communications/templates) uses a service-role client gated by its own
-- ADMIN_ROLES = {org_owner, org_admin, org_manager} check, bypassing RLS
-- entirely. Same root defect class as notification_rules/channel_configs
-- fixed earlier today (RLS references something that can never evaluate
-- true) — fixed the same way: mirror the real ADMIN_ROLES gate via
-- auth_user_role().
-- =============================================================================

DROP POLICY IF EXISTS "notification_templates_insert" ON public.notification_templates;
DROP POLICY IF EXISTS "notification_templates_update" ON public.notification_templates;

CREATE POLICY "notification_templates_insert"
  ON public.notification_templates FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  );

CREATE POLICY "notification_templates_update"
  ON public.notification_templates FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  );
