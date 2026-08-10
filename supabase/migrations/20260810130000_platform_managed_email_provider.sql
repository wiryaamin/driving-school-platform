-- ════════════════════════════════════════════════════════════════════════════
-- Platform-managed Email migration v1 (integration/communications-email).
--
-- Same architectural decision and pattern as the SMS migration
-- (20260810120000_platform_managed_sms_provider.sql, commit b14fb4e,
-- checkpoint integration/communications-sms/v2-platform-managed-2026-08-10):
-- all external integrations are platform-owned and platform-managed —
-- tenants use the resulting business functionality but must not configure,
-- subscribe to, own, or manage external providers.
--
-- Both real active tenants' channel_configs.email row already resolves
-- entirely through the platform-wide Resend secret (RESEND_API_KEY) via
-- _shared/comm-providers.ts's cred() — zero tenants currently have their
-- own email credentials configured (verified live 2026-08-10 immediately
-- before this migration).
--
-- This is a SEPARATE trigger function from the SMS one, deliberately not
-- merged into it — the version-control/rollback register requires each
-- integration to be independently restorable without affecting another
-- (docs/INTEGRATION_VERSION_REGISTER.md). Merging the two channels into one
-- trigger would couple their rollback units; keeping them as two small,
-- structurally-identical functions preserves "restore SMS without touching
-- Email" and vice versa.
--
-- Same defense-in-depth rationale as SMS: the communications Edge Function
-- (supabase/functions/communications/index.ts) is the only write path the
-- frontend uses and it writes via the service_role client, so the Edge
-- Function's own PUT handler is the primary enforcement point (in the same
-- commit as this migration). This trigger closes the secondary path — a
-- direct PostgREST write using a tenant's own JWT, bypassing the Edge
-- Function's business logic — that the existing channel_configs_insert/
-- _update RLS policies (org_owner/org_admin/org_manager) would otherwise
-- still allow for the email row's provider/metadata (credentials) columns.
-- enabled/from_address/display_name/daily_limit and all other channel rows
-- (sms/whatsapp/push/voice) are completely unaffected.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_channel_configs_email_provider_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
BEGIN
  -- Trusted backend (every Edge Function uses the service_role key) and
  -- Platform Admin may set/change the email provider and its credentials.
  IF v_jwt_role = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.channel <> 'email' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.provider IS NOT NULL OR COALESCE(NEW.metadata, '{}'::jsonb) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Email provider and credentials are platform-managed and cannot be set by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.provider IS DISTINCT FROM OLD.provider
       OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
      RAISE EXCEPTION 'Email provider and credentials are platform-managed and cannot be changed by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_channel_configs_email_provider_fields IS
  'Defense-in-depth guard, independent of RLS: blocks any non-service-role, '
  'non-platform-admin INSERT/UPDATE from setting or changing channel_configs.'
  'provider or .metadata (credentials) on the email row, even though '
  'channel_configs_insert/_update permit the row-level write for org_owner/'
  'org_admin/org_manager. enabled/from_address/display_name/daily_limit and '
  'all non-email channel rows are unaffected. Independent from '
  'protect_channel_configs_sms_provider_fields (20260810120000) so either '
  'integration can be rolled back without touching the other.';

DROP TRIGGER IF EXISTS channel_configs_protect_email_provider ON public.channel_configs;
CREATE TRIGGER channel_configs_protect_email_provider
  BEFORE INSERT OR UPDATE ON public.channel_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_channel_configs_email_provider_fields();
