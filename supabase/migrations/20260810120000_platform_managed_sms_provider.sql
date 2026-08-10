-- ════════════════════════════════════════════════════════════════════════════
-- Platform-managed SMS migration v1 (integration/communications-sms).
--
-- Architectural decision: all external integrations are platform-owned and
-- platform-managed — tenants use the resulting business functionality but
-- must not configure, subscribe to, own, or manage external providers.
--
-- Every real active tenant's channel_configs.sms row already resolves
-- entirely through the platform-wide Supabase Secret fallback in
-- _shared/comm-providers.ts's cred() — zero tenants currently have their own
-- SMS credentials configured (confirmed live during the architecture audit,
-- docs/INTEGRATION_ARCHITECTURE_AUDIT_2026-08-10.md). This migration closes
-- the write path so that stays true going forward.
--
-- The communications Edge Function (supabase/functions/communications/
-- index.ts) is the only write path the frontend uses, and it writes via the
-- service_role client — so this is defense-in-depth (mirrors
-- protect_organization_lifecycle_columns, 20260809220000/20260809231500):
-- it closes a *direct* PostgREST write (a tenant's own JWT calling the
-- table directly, bypassing the Edge Function's own business logic) that
-- the existing channel_configs_insert/_update RLS policies (org_owner/
-- org_admin/org_manager) would otherwise still allow for the SMS row's
-- provider/metadata (credentials) columns specifically. Row-level RLS can't
-- express "these columns, only on this channel value" — a column-aware
-- BEFORE trigger can. Email/WhatsApp/Push/Voice rows and all other
-- channel_configs columns (enabled, from_address, display_name,
-- daily_limit) are completely unaffected — tenants keep managing those for
-- every channel exactly as today.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_channel_configs_sms_provider_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
BEGIN
  -- Trusted backend (every Edge Function uses the service_role key) and
  -- Platform Admin may set/change the SMS provider and its credentials.
  IF v_jwt_role = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.channel <> 'sms' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.provider IS NOT NULL OR COALESCE(NEW.metadata, '{}'::jsonb) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'SMS provider and credentials are platform-managed and cannot be set by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.provider IS DISTINCT FROM OLD.provider
       OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
      RAISE EXCEPTION 'SMS provider and credentials are platform-managed and cannot be changed by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_channel_configs_sms_provider_fields IS
  'Defense-in-depth guard, independent of RLS: blocks any non-service-role, '
  'non-platform-admin INSERT/UPDATE from setting or changing channel_configs.'
  'provider or .metadata (credentials) on the sms row, even though '
  'channel_configs_insert/_update permit the row-level write for org_owner/'
  'org_admin/org_manager. enabled/from_address/display_name/daily_limit and '
  'all non-sms channel rows are unaffected.';

DROP TRIGGER IF EXISTS channel_configs_protect_sms_provider ON public.channel_configs;
CREATE TRIGGER channel_configs_protect_sms_provider
  BEFORE INSERT OR UPDATE ON public.channel_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_channel_configs_sms_provider_fields();
