-- Temporary diagnostic — reveals what current_user actually is for a
-- service-role Edge Function call, since the assumption in
-- protect_organization_lifecycle_columns() (current_user = 'service_role')
-- turned out to be wrong (it blocked a genuine service-role write from
-- handleDeleteTenantData). Superseded by the next migration once confirmed.
CREATE OR REPLACE FUNCTION public.protect_organization_lifecycle_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    RAISE EXCEPTION 'DEBUG current_user=% session_user=% is_platform_admin=% jwt_role_claim=%',
      current_user, session_user, public.is_platform_admin(),
      current_setting('request.jwt.claims', true)::jsonb ->> 'role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
