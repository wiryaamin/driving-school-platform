-- =============================================================================
-- channel_configs — RLS hardening (formal audit of ChannelSettingsPage)
--
-- Found while formally auditing ChannelSettingsPage as a Tenant Configuration
-- surface outside the Settings UI. Two issues, same pattern already fixed for
-- notification_rules in 20260724000014/20260725000001-2:
--
--   1. Both policies used the raw, unguarded `(auth.jwt()->>'organization_id')`
--      expression instead of auth_organization_id() — no NULLIF empty-string
--      guard, and no is_platform_admin() bypass on reads (platform admins with
--      a null-org JWT could not view any org's channel_configs at all).
--   2. The write policy is named "org admins write channel_configs" but its
--      actual expression has no permission/role check at all — any org member
--      could write directly via the REST API. The real write path
--      (ChannelSettingsPage -> communications Edge Function, PUT
--      /communications/channels/:channel) already enforces ADMIN_ROLES =
--      {org_owner, org_admin, org_manager} via a service-role client that
--      bypasses RLS entirely — so this policy is the only gate against a
--      direct-API write, and it currently gates nothing.
--
-- Fix mirrors the two channel_configs writers exactly: mirror ADMIN_ROLES via
-- auth_user_role(), same as the notification_rules correction.
-- =============================================================================

DROP POLICY IF EXISTS "org members read channel_configs" ON public.channel_configs;
DROP POLICY IF EXISTS "org admins write channel_configs" ON public.channel_configs;

CREATE POLICY "channel_configs_select"
  ON public.channel_configs FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "channel_configs_insert"
  ON public.channel_configs FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  );

CREATE POLICY "channel_configs_update"
  ON public.channel_configs FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  );
