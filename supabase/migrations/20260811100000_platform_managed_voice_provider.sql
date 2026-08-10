-- ════════════════════════════════════════════════════════════════════════════
-- Platform-managed Voice migration v1 (integration/communications-voice).
--
-- Same architectural decision and pattern as SMS (20260810120000, commit
-- b14fb4e), Email (20260810130000, commit 695dc4a), WhatsApp (20260810140000,
-- commit c9279e4), and Push (20260810150000, commit f2951fa): all external
-- integrations are platform-owned and platform-managed — tenants use the
-- resulting business functionality but must not configure, subscribe to,
-- own, or manage external providers.
--
-- Audit findings before this migration (read-only, no schema/data touched):
--   - channel_configs.voice uses the exact same generic columns as sms/
--     email/whatsapp/push — no voice-specific table exists.
--   - Both real active tenants: enabled=false, provider=null, from_address=
--     null, has_credentials=false — voice has never been activated by
--     either, no tenant-owned credentials, no configured caller ID.
--   - Voice in this codebase is outbound-only text-to-speech (TTS): 46elks
--     (reusing the same ELKS_API_USERNAME/PASSWORD platform secret as SMS)
--     and Twilio (reusing the same TWILIO_ACCOUNT_SID/AUTH_TOKEN/
--     PHONE_NUMBER platform secret as SMS/WhatsApp) via an inline TwiML
--     <Say> — no separate telephone-number provisioning/ownership table
--     exists anywhere in the schema. For the Twilio path the caller ID was
--     already hard-coded to prefer the platform's own TWILIO_PHONE_NUMBER
--     secret over any tenant-supplied from_address
--     (dispatchTwilioVoice: `cred(creds,'TWILIO_PHONE_NUMBER') ?? from`) —
--     caller ID was already effectively platform-controlled at runtime
--     before this migration.
--   - No call recording, no inbound calling, no call routing, no
--     voicemail, and no dedicated webhook/callback Edge Function exist
--     anywhere in this codebase for voice — confirmed by exhaustive
--     codebase search. Zero call history (outbound_messages) and zero
--     notification_templates rows (tenant-owned or system-default) exist
--     for channel='voice' for either real tenant.
--   - No STOP condition from the audit checklist (tenant credentials,
--     telephone-number ownership, caller-ID conflict, recording ownership,
--     inbound-call architecture, webhook ownership) applies — none of
--     those features exist to conflict with platform-managed Voice.
--
-- This is a FIFTH, independent trigger function (not merged with the SMS,
-- Email, WhatsApp, or Push ones) — same rollback-isolation rationale: each
-- integration must be independently restorable without affecting the
-- others.
--
-- Same defense-in-depth rationale as SMS/Email/WhatsApp/Push: the
-- communications Edge Function (supabase/functions/communications/index.ts)
-- is the only write path the frontend uses for channel_configs and it
-- writes via the service_role client, so the Edge Function's own PUT
-- handler (same commit as this migration) is the primary enforcement
-- point. This trigger closes the secondary path — a direct PostgREST write
-- using a tenant's own JWT, bypassing the Edge Function's business logic —
-- that the existing channel_configs_insert/_update RLS policies (org_owner/
-- org_admin/org_manager) would otherwise still allow for the voice row's
-- provider/metadata (credentials) columns. enabled/from_address/
-- display_name/daily_limit and all other channel rows (sms/email/whatsapp/
-- push) are completely unaffected.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_channel_configs_voice_provider_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
BEGIN
  -- Trusted backend (every Edge Function uses the service_role key) and
  -- Platform Admin may set/change the Voice provider and its credentials.
  IF v_jwt_role = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.channel <> 'voice' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.provider IS NOT NULL OR COALESCE(NEW.metadata, '{}'::jsonb) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Voice provider and credentials are platform-managed and cannot be set by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.provider IS DISTINCT FROM OLD.provider
       OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
      RAISE EXCEPTION 'Voice provider and credentials are platform-managed and cannot be changed by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_channel_configs_voice_provider_fields IS
  'Defense-in-depth guard, independent of RLS: blocks any non-service-role, '
  'non-platform-admin INSERT/UPDATE from setting or changing channel_configs.'
  'provider or .metadata (credentials) on the voice row, even though '
  'channel_configs_insert/_update permit the row-level write for org_owner/'
  'org_admin/org_manager. enabled/from_address/display_name/daily_limit and '
  'all non-voice channel rows are unaffected. Independent from '
  'protect_channel_configs_sms_provider_fields (20260810120000), '
  'protect_channel_configs_email_provider_fields (20260810130000), '
  'protect_channel_configs_whatsapp_provider_fields (20260810140000), and '
  'protect_channel_configs_push_provider_fields (20260810150000) so any one '
  'integration can be rolled back without touching the others.';

DROP TRIGGER IF EXISTS channel_configs_protect_voice_provider ON public.channel_configs;
CREATE TRIGGER channel_configs_protect_voice_provider
  BEFORE INSERT OR UPDATE ON public.channel_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_channel_configs_voice_provider_fields();
