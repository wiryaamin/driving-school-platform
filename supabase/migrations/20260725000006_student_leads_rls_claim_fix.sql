-- =============================================================================
-- student_leads — fix RLS checking a JWT path this app never populates
--
-- Found while checking LeadsSettingsPage (apps/web/src/modules/leads/routes/
-- LeadsSettingsPage.tsx), which queries student_leads directly with the
-- anon-key + user-JWT client (not an Edge Function/service-role path) — so
-- this table's RLS is the real, live authorization boundary for viewing and
-- updating leads, unlike most other surfaces audited today.
--
-- Both policies checked auth.jwt()->'app_metadata'->>'organization_id'. This
-- app's auth-hook (supabase/functions/auth-hook, get_user_jwt_claims()) puts
-- organization_id at the top level of the JWT claims, the same as every
-- other table's auth_organization_id() helper reads — nothing in this
-- codebase ever writes organization_id into a user's real app_metadata via
-- the Admin API (grepped invite-user and the auth-hook; the only
-- app_metadata write is a legacy in-memory back-fill for Edge Function
-- convenience, per _shared/jwt.ts's enrichUserFromJwt — it never reaches
-- Supabase Auth or the JWT Postgres RLS actually inspects). So this
-- condition has always evaluated to NULL/false for every real user — with
-- zero live leads currently in the database, this has not yet been visibly
-- reported, but the admin-facing leads inbox would show nothing and status
-- updates would silently fail the moment a real lead exists.
--
-- Fix: same minimal correction as every other table today — repoint to
-- auth_organization_id(). Leads are inserted via the public-booking Edge
-- Function's service-role client, so no INSERT policy is needed here,
-- unchanged from before.
-- =============================================================================

DROP POLICY IF EXISTS "org_members_select_leads" ON public.student_leads;
DROP POLICY IF EXISTS "org_members_update_leads" ON public.student_leads;

CREATE POLICY "org_members_select_leads"
  ON public.student_leads FOR SELECT
  USING (organization_id = public.auth_organization_id());

CREATE POLICY "org_members_update_leads"
  ON public.student_leads FOR UPDATE
  USING (organization_id = public.auth_organization_id())
  WITH CHECK (organization_id = public.auth_organization_id());
