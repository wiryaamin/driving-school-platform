-- ════════════════════════════════════════════════════════════════════════════
-- Code review finding (Tenant Lifecycle Control): organizations_update_own_admin
-- grants any tenant user holding administration:organization:update (org_owner,
-- org_admin) row-level UPDATE on their OWN organization row, with no column
-- restriction. RLS in Postgres governs which ROWS a statement may touch, not
-- which COLUMNS — so a tenant admin's own still-valid JWT (issued before any
-- Platform Admin action, remaining valid for its normal TTL since claims are
-- baked in at issuance, not re-checked per request) could PATCH their own
-- organization's status/subscription_tier/subscription_status/trial_ends_at/
-- deleted_at directly via PostgREST — self-restoring a Suspended tenant,
-- self-extending a trial, or self-upgrading a subscription tier, silently
-- undoing the exact Platform Admin lifecycle controls (Suspend/Cancel/Extend/
-- Convert/Delete) this feature depends on.
--
-- Fix: an additional BEFORE UPDATE trigger — not a change to any existing RLS
-- policy or the authentication architecture — that independently rejects a
-- write to any lifecycle-governing column unless the caller is the trusted
-- backend (service_role, used by every Edge Function/provisioning path) or a
-- genuine Platform Admin (is_platform_admin(), the same JWT claim already
-- authoritative everywhere else in this schema). Tenant-editable columns
-- (name, legal_name, org_number, vat_number, settings — confirmed the only
-- ones any tenant-facing settings page actually writes) are unaffected.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_organization_lifecycle_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted backend (every Edge Function/provisioning path uses the service
  -- role) and Platform Admin may change any column.
  IF current_user = 'service_role' OR public.is_platform_admin() THEN
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
  'row-level UPDATE for a tenant''s own organization_management-permitted user.';

DROP TRIGGER IF EXISTS organizations_protect_lifecycle_columns ON public.organizations;
CREATE TRIGGER organizations_protect_lifecycle_columns
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_organization_lifecycle_columns();
