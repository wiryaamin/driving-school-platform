-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260617000004_impersonation_write_guard.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     A-10 — Pre-Activate Impersonation Write Guard
--
-- BACKGROUND:
--   Phase 1B.2 (20260527000002_phase1b2_hardening.sql, §7c) introduced
--   is_impersonating() and documented that write guards on memberships and
--   membership_roles would be activated "once the impersonation Edge Function
--   exists." The impersonation Edge Function has not yet been built, but the
--   guard should be in place before it is, so it activates automatically.
--
-- MECHANISM:
--   PostgreSQL RESTRICTIVE policies are AND'd with permissive policies.
--   These policies evaluate NOT public.is_impersonating() which returns:
--     • true  (NOT false) — when impersonator_id is absent from JWT (always
--              today, since the Edge Function doesn't exist yet) → no-op
--     • false (NOT true)  — when impersonator_id is set by the Edge Function
--              → INSERT/UPDATE/DELETE blocked on memberships and membership_roles
--
-- PROTECTED TABLES:
--   memberships      — who belongs to which org with what status
--   membership_roles — which roles a member holds
--
-- WHY THESE TABLES:
--   An impersonating platform admin must not be able to escalate their
--   own tenant permissions, add/remove users, or grant/revoke roles while
--   acting as another user. SELECTs are intentionally not blocked — the
--   admin needs to see the tenant's membership state.
-- ════════════════════════════════════════════════════════════════════════════

-- ── memberships write guard ───────────────────────────────────────────────────

CREATE POLICY "memberships_restrict_impersonation_insert"
  ON public.memberships
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_impersonating());

CREATE POLICY "memberships_restrict_impersonation_update"
  ON public.memberships
  AS RESTRICTIVE
  FOR UPDATE
  USING     (NOT public.is_impersonating())
  WITH CHECK (NOT public.is_impersonating());

CREATE POLICY "memberships_restrict_impersonation_delete"
  ON public.memberships
  AS RESTRICTIVE
  FOR DELETE
  USING (NOT public.is_impersonating());

-- ── membership_roles write guard ─────────────────────────────────────────────

CREATE POLICY "membership_roles_restrict_impersonation_insert"
  ON public.membership_roles
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (NOT public.is_impersonating());

CREATE POLICY "membership_roles_restrict_impersonation_update"
  ON public.membership_roles
  AS RESTRICTIVE
  FOR UPDATE
  USING     (NOT public.is_impersonating())
  WITH CHECK (NOT public.is_impersonating());

CREATE POLICY "membership_roles_restrict_impersonation_delete"
  ON public.membership_roles
  AS RESTRICTIVE
  FOR DELETE
  USING (NOT public.is_impersonating());
