-- =============================================================================
-- notification_rules — Correct RLS authorization to match the real write path
--
-- Security validation of 20260724000014 / 20260725000001 found that the
-- permission chosen for notification_rules' INSERT/UPDATE RLS policies was
-- matched to the wrong signal.
--
-- NotificationRulesPage (the real, canonical admin UI at /communication/rules)
-- never writes to notification_rules with the user's own JWT. Its hooks call
-- the `communications` Edge Function (action=rules), which uses
-- createServiceClient() — a service-role client that bypasses RLS entirely —
-- and enforces its own authorization: ADMIN_ROLES = {org_owner, org_admin,
-- org_manager} checked against ctx.actorRole (see
-- supabase/functions/communications/index.ts:49,327-328,362-363,382-383).
--
-- communications:message:create (used by 20260725000001) is only the
-- frontend's PermissionGate — a UI display gate, not the Edge Function's
-- actual authorization — and it is held by broader roles the Edge Function
-- itself rejects (instructor_senior, receptionist, student_admin). Because
-- RLS is the only gate a raw PostgREST call against notification_rules ever
-- passes through, matching RLS to the permission instead of the Edge
-- Function's real role check would let those broader roles write directly
-- to the table via the REST API, bypassing the Edge Function's stricter
-- ADMIN_ROLES rule entirely.
--
-- Fix: RLS now mirrors ADMIN_ROLES exactly, using the existing
-- auth_user_role() helper (same convention as is_org_admin() elsewhere in
-- this schema) instead of a permission code. This makes direct-API access
-- exactly as strict as the Edge Function path already is — no broader, no
-- narrower.
-- =============================================================================

DROP POLICY IF EXISTS "notification_rules_insert" ON public.notification_rules;
DROP POLICY IF EXISTS "notification_rules_update" ON public.notification_rules;

CREATE POLICY "notification_rules_insert"
  ON public.notification_rules FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  );

CREATE POLICY "notification_rules_update"
  ON public.notification_rules FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  );
