-- ════════════════════════════════════════════════════════════════════════════
-- Platform-managed Push migration v1 (integration/communications-push).
--
-- Same architectural decision and pattern as SMS (20260810120000, commit
-- b14fb4e), Email (20260810130000, commit 695dc4a), and WhatsApp
-- (20260810140000, commit c9279e4): all external integrations are
-- platform-owned and platform-managed — tenants use the resulting business
-- functionality but must not configure, subscribe to, own, or manage
-- external providers.
--
-- Audit findings before this migration (read-only, no schema/data touched):
--   - channel_configs.push uses the exact same generic columns as sms/
--     email/whatsapp — no push-specific config table exists.
--   - Both real active tenants: enabled=false, provider=null,
--     has_credentials=false — push has never been activated by either.
--   - push_device_tokens (FCM/OneSignal device registration tokens) is a
--     SEPARATE table, unrelated to channel_configs, already RLS-enabled
--     with ZERO policies for authenticated/anon — only service_role has
--     GRANT SELECT/INSERT/UPDATE, so direct tenant/user PostgREST access
--     was already fully blocked before this migration. Device tokens are
--     recipient-addressing data (like a phone number or email address),
--     not provider credentials, and are NOT touched by this migration.
--   - Client-side Firebase Web config (VITE_FIREBASE_API_KEY/PROJECT_ID/
--     MESSAGING_SENDER_ID/APP_ID/VAPID_KEY, apps/web/src/core/push/index.ts)
--     is build-time, platform-only configuration — never tenant-configurable
--     or stored per-org, so there was nothing to remove there either.
--   - notification_templates has 11 system-default (organization_id IS
--     NULL) rows for channel='push' and zero tenant-owned rows for either
--     real tenant — untouched by this migration.
--
-- This is a FOURTH, independent trigger function (not merged with the SMS,
-- Email, or WhatsApp ones) — same rollback-isolation rationale: each
-- integration must be independently restorable without affecting the
-- others.
--
-- Same defense-in-depth rationale as SMS/Email/WhatsApp: the communications
-- Edge Function (supabase/functions/communications/index.ts) is the only
-- write path the frontend uses for channel_configs and it writes via the
-- service_role client, so the Edge Function's own PUT handler (same commit
-- as this migration) is the primary enforcement point. This trigger closes
-- the secondary path — a direct PostgREST write using a tenant's own JWT,
-- bypassing the Edge Function's business logic — that the existing
-- channel_configs_insert/_update RLS policies (org_owner/org_admin/
-- org_manager) would otherwise still allow for the push row's
-- provider/metadata (credentials) columns. enabled/from_address/
-- display_name/daily_limit and all other channel rows (sms/email/whatsapp/
-- voice) are completely unaffected.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_channel_configs_push_provider_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
BEGIN
  -- Trusted backend (every Edge Function uses the service_role key) and
  -- Platform Admin may set/change the Push provider and its credentials.
  IF v_jwt_role = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.channel <> 'push' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.provider IS NOT NULL OR COALESCE(NEW.metadata, '{}'::jsonb) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Push provider and credentials are platform-managed and cannot be set by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.provider IS DISTINCT FROM OLD.provider
       OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
      RAISE EXCEPTION 'Push provider and credentials are platform-managed and cannot be changed by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_channel_configs_push_provider_fields IS
  'Defense-in-depth guard, independent of RLS: blocks any non-service-role, '
  'non-platform-admin INSERT/UPDATE from setting or changing channel_configs.'
  'provider or .metadata (credentials) on the push row, even though '
  'channel_configs_insert/_update permit the row-level write for org_owner/'
  'org_admin/org_manager. enabled/from_address/display_name/daily_limit and '
  'all non-push channel rows are unaffected. Independent from '
  'protect_channel_configs_sms_provider_fields (20260810120000), '
  'protect_channel_configs_email_provider_fields (20260810130000), and '
  'protect_channel_configs_whatsapp_provider_fields (20260810140000) so any '
  'one integration can be rolled back without touching the others. Does not '
  'touch push_device_tokens, which was already service-role-only (no '
  'authenticated/anon RLS policy exists on that table).';

DROP TRIGGER IF EXISTS channel_configs_protect_push_provider ON public.channel_configs;
CREATE TRIGGER channel_configs_protect_push_provider
  BEFORE INSERT OR UPDATE ON public.channel_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_channel_configs_push_provider_fields();
