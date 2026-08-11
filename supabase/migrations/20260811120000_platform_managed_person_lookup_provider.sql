-- ════════════════════════════════════════════════════════════════════════════
-- Platform-managed Person Lookup migration v1 (integration/person-lookup).
--
-- Same architectural decision and pattern as SMS/Email/WhatsApp/Push/Voice
-- (20260810120000-20260811100000): the provider and its credentials are
-- platform-owned — tenants use the resulting business functionality but
-- must not configure, select, own, or manage the underlying provider.
--
-- Audit findings before this migration (read-only, no schema/data touched):
--   - person_lookup_provider_configs.credentials_encrypted stores a tenant's
--     Roaring OAuth2 Client ID/Secret pair (JSON-encoded, then encrypted).
--     Both real active tenants, and all 17 rows platform-wide, hold a
--     byte-identical ciphertext copy of one sandbox source org's credential
--     (ROARING_SANDBOX_SOURCE_ORG_ID, copied at provisioning by
--     _shared/trial-provisioning.ts) — no tenant has ever entered a
--     genuinely independent credential.
--   - No platform Roaring secret existed before this migration
--     (ROARING_CLIENT_ID/ROARING_CLIENT_SECRET newly configured as Supabase
--     Secrets as part of this same change, reusing the already-proven-live
--     sandbox credential value — not rotated, not a new provider account).
--   - Provider (Roaring) is real and live-verified against a real sandbox
--     account (2026-07-27 commissioning), unlike Vehicle Registry's
--     unverified Biluppgifter integration.
--
-- This is a SIXTH, independent trigger function (not merged with the SMS/
-- Email/WhatsApp/Push/Voice ones) — same rollback-isolation rationale: each
-- integration must be independently restorable without affecting the
-- others.
--
-- Same defense-in-depth rationale as the five communications channels: the
-- students Edge Function's PUT/POST paths and person-lookup-config/index.ts
-- (the only tenant write path) both use the service_role client, so the
-- Edge Function's own code (person-lookup-service.ts's resolveConfig(), and
-- person-lookup-config/index.ts's handlePost, both updated in the same
-- commit as this migration) is the primary enforcement point. This trigger
-- closes the secondary path — a direct PostgREST write using a tenant's own
-- JWT, bypassing the Edge Function's business logic — that the existing
-- person_lookup_provider_configs_insert/_update RLS policies (org_owner/
-- org_admin/org_manager) would otherwise still allow for the
-- active_provider/credentials_encrypted/base_url columns.
-- timeout_ms/max_retries/retry_backoff_ms/auto_lookup_enabled/
-- auto_address_update_enabled/cache_ttl_seconds/is_active (legitimate
-- tenant business/operational settings) remain fully tenant-writable.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_person_lookup_provider_configs_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
BEGIN
  -- Trusted backend (every Edge Function uses the service_role key) and
  -- Platform Admin may set/change the provider and its credentials.
  IF v_jwt_role = 'service_role' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 'mock' is the column's own DEFAULT — accepting it is not "setting a
    -- provider," it's accepting the schema default. Any other explicit
    -- value, or any credential/base_url, is provider infrastructure.
    IF NEW.active_provider IS DISTINCT FROM 'mock'
       OR NEW.credentials_encrypted IS NOT NULL
       OR NEW.base_url IS NOT NULL THEN
      RAISE EXCEPTION 'Person Lookup provider and credentials are platform-managed and cannot be set by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.active_provider IS DISTINCT FROM OLD.active_provider
       OR NEW.credentials_encrypted IS DISTINCT FROM OLD.credentials_encrypted
       OR NEW.base_url IS DISTINCT FROM OLD.base_url THEN
      RAISE EXCEPTION 'Person Lookup provider and credentials are platform-managed and cannot be changed by tenant users'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_person_lookup_provider_configs_fields IS
  'Defense-in-depth guard, independent of RLS: blocks any non-service-role, '
  'non-platform-admin INSERT/UPDATE from setting or changing '
  'person_lookup_provider_configs.active_provider/.credentials_encrypted/'
  '.base_url, even though person_lookup_provider_configs_insert/_update '
  'permit the row-level write for org_owner/org_admin/org_manager. '
  'timeout_ms/max_retries/retry_backoff_ms/auto_lookup_enabled/'
  'auto_address_update_enabled/cache_ttl_seconds/is_active remain '
  'tenant-writable. Independent from the five communications-* triggers '
  '(20260810120000-20260811100000) so any one integration can be rolled '
  'back without touching the others.';

DROP TRIGGER IF EXISTS person_lookup_provider_configs_protect_provider ON public.person_lookup_provider_configs;
CREATE TRIGGER person_lookup_provider_configs_protect_provider
  BEFORE INSERT OR UPDATE ON public.person_lookup_provider_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_person_lookup_provider_configs_fields();
