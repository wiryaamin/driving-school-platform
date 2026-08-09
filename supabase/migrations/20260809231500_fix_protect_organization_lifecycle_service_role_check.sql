-- ════════════════════════════════════════════════════════════════════════════
-- Fix: protect_organization_lifecycle_columns() (20260809220000) checked
-- `current_user = 'service_role'`, assuming Supabase's PostgREST connects as
-- a Postgres role literally named service_role. Live-verified false: hosted
-- Supabase's connection pooler runs every request as `postgres`
-- (session_user = 'authenticator'), regardless of the caller's JWT — proven
-- live when this exact check silently blocked handleDeleteTenantData's own
-- final organizations.deleted_at write (service-role, createServiceClient()),
-- leaving vehicles/instructors/locations soft-deleted and memberships removed
-- but the organization itself never marked deleted_at, found via a real,
-- browser-driven UI Delete-tenant test.
--
-- The service-role API key IS itself a signed JWT carrying role: "service_role"
-- — and unlike a real user's JWT, it never passes through the auth-hook (which
-- only fires on GoTrue sign-in), so that claim is never overwritten. Reading
-- it directly (the same request.jwt.claims GUC is_platform_admin() already
-- reads) is the reliable signal, confirmed live via a temporary debug
-- migration (20260809230000, superseded by this one).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_organization_lifecycle_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
BEGIN
  -- Trusted backend (every Edge Function/provisioning path uses the service
  -- role key) and Platform Admin may change any column.
  IF v_jwt_role = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status                     IS DISTINCT FROM OLD.status
     OR NEW.subscription_tier       IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_status     IS DISTINCT FROM OLD.subscription_status
     OR NEW.trial_ends_at           IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.deleted_at              IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by              IS DISTINCT FROM OLD.deleted_by
     OR NEW.max_users               IS DISTINCT FROM OLD.max_users
     OR NEW.max_locations           IS DISTINCT FROM OLD.max_locations
     OR NEW.go_live_at              IS DISTINCT FROM OLD.go_live_at
     OR NEW.go_live_approved_by     IS DISTINCT FROM OLD.go_live_approved_by
     OR NEW.payment_verified_at     IS DISTINCT FROM OLD.payment_verified_at
     OR NEW.payment_verified_by     IS DISTINCT FROM OLD.payment_verified_by
     OR NEW.internal_notes          IS DISTINCT FROM OLD.internal_notes
  THEN
    RAISE EXCEPTION 'Only Platform Admin may change organization lifecycle fields'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_organization_lifecycle_columns IS
  'Defense-in-depth guard, independent of RLS: blocks any non-service-role, '
  'non-platform-admin write to organizations lifecycle/administrative columns '
  '(status, subscription_tier, subscription_status, trial_ends_at, deleted_at, '
  'deleted_by, max_users, max_locations, go_live_*, payment_verified_*, '
  'internal_notes), even though organizations_update_own_admin permits the '
  'row-level UPDATE for a tenant''s own organization_management-permitted user. '
  'Service-role detection reads the JWT''s own role claim (never touched by '
  'the auth-hook, which only runs for real user sign-ins) rather than the '
  'connected Postgres role, which hosted Supabase''s pooler does not set to '
  'service_role.';
