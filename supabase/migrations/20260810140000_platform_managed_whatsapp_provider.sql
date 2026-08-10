-- ════════════════════════════════════════════════════════════════════════════
-- Platform-managed WhatsApp migration v1 (integration/communications-whatsapp).
--
-- Same architectural decision and pattern as SMS (20260810120000, commit
-- b14fb4e) and Email (20260810130000, commit 695dc4a): all external
-- integrations are platform-owned and platform-managed — tenants use the
-- resulting business functionality but must not configure, subscribe to,
-- own, or manage external providers.
--
-- Audit findings before this migration (read-only, no schema/data touched):
--   - channel_configs.whatsapp uses the exact same generic columns as sms/
--     email (provider, from_address, display_name, daily_limit, metadata) —
--     no whatsapp-specific table exists.
--   - Both real active tenants: enabled=true, provider='meta',
--     has_credentials=false, from_address=null, display_name=null — neither
--     has ever configured their own Meta/Twilio WhatsApp credentials.
--   - notification_templates has zero rows for channel='whatsapp' (tenant-
--     owned or system-default) — WhatsApp messages are sent as free-form
--     text via the Meta Cloud API's "text" message type, not Meta's
--     approved-template mechanism, so there is no template-ownership
--     question to resolve in this migration.
--   - No dedicated WhatsApp webhook Edge Function exists in this codebase —
--     nothing to touch under that heading.
--
-- This is a THIRD, independent trigger function (not merged with the SMS or
-- Email ones) — same rollback-isolation rationale: each integration must be
-- independently restorable without affecting the others.
--
-- Same defense-in-depth rationale as SMS/Email: the communications Edge
-- Function (supabase/functions/communications/index.ts) is the only write
-- path the frontend uses and it writes via the service_role client, so the
-- Edge Function's own PUT handler (same commit as this migration) is the
-- primary enforcement point. This trigger closes the secondary path — a
-- direct PostgREST write using a tenant's own JWT, bypassing the Edge
-- Function's business logic — that the existing channel_configs_insert/
-- _update RLS policies (org_owner/org_admin/org_manager) would otherwise
-- still allow for the whatsapp row's provider/metadata (credentials)
-- columns. enabled/from_address/display_name/daily_limit and all other
-- channel rows (sms/email/push/voice) are completely unaffected.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_channel_configs_whatsapp_provider_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
BEGIN
  -- Trusted backend (every Edge Function uses the service_role key) and
  -- Platform Admin may set/change the WhatsApp provider and its credentials.
  IF v_jwt_role = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.channel <> 'whatsapp' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.provider IS NOT NULL OR COALESCE(NEW.metadata, '{}'::jsonb) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'WhatsApp provider and credentials are platform-managed and cannot be set by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.provider IS DISTINCT FROM OLD.provider
       OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
      RAISE EXCEPTION 'WhatsApp provider and credentials are platform-managed and cannot be changed by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_channel_configs_whatsapp_provider_fields IS
  'Defense-in-depth guard, independent of RLS: blocks any non-service-role, '
  'non-platform-admin INSERT/UPDATE from setting or changing channel_configs.'
  'provider or .metadata (credentials) on the whatsapp row, even though '
  'channel_configs_insert/_update permit the row-level write for org_owner/'
  'org_admin/org_manager. enabled/from_address/display_name/daily_limit and '
  'all non-whatsapp channel rows are unaffected. Independent from '
  'protect_channel_configs_sms_provider_fields (20260810120000) and '
  'protect_channel_configs_email_provider_fields (20260810130000) so any one '
  'integration can be rolled back without touching the others.';

DROP TRIGGER IF EXISTS channel_configs_protect_whatsapp_provider ON public.channel_configs;
CREATE TRIGGER channel_configs_protect_whatsapp_provider
  BEFORE INSERT OR UPDATE ON public.channel_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_channel_configs_whatsapp_provider_fields();
