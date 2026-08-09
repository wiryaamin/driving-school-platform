-- =============================================================================
-- Vehicle Registry Lookup Framework
--
-- Same shape as the Person Lookup Framework (20260727000001), reapplied to a
-- different domain: vehicle registration/inspection data from a licensed
-- Transportstyrelsen vägtrafikregistret reseller (Biluppgifter.se recommended
-- — see docs/INTEGRATION_CONFIGURATION_GUIDE.md; Fordonsfakta.se as the
-- documented alternative). Unlike Person Lookup, no reseller in this space
-- offers frictionless self-service signup — every one requires a sales
-- conversation and (per Transportstyrelsen's own Road Traffic Data Act
-- 2019:369 framework) a direct-access permit forwarded through the reseller.
-- This migration ships the framework ready to go; going live still requires
-- the business step of actually obtaining reseller credentials.
--
-- Three tables, same reasoning as Person Lookup's three:
--   vehicle_registry_provider_configs — per-tenant provider selection,
--     encrypted credentials, timeout/retry policy, cache TTL. A school
--     without its own reseller account simply gets Mock (no lookup),
--     the same graceful-default idiom used everywhere else.
--   vehicle_registry_cache — successful AND not-found lookups cached,
--     keyed by registration number (not a personnummer — no HMAC-hash
--     requirement here, registration numbers are public plate identifiers,
--     not the sensitive-personal-data class personnummer is; still
--     encrypted at rest as it can carry owner data depending on provider).
--   vehicle_registry_provider_health — periodic connectivity signal.
--
-- Audit logging reuses the platform's existing generic activity-audit
-- mechanism (audit_trigger_fn() / audit_logs), the same as every other
-- ordinary CRUD table — this domain has no identity-event-style special
-- case, unlike Person Lookup's reuse of identity_security_events.
-- =============================================================================

-- ── vehicle_registry_provider_configs ───────────────────────────────────────

CREATE TABLE public.vehicle_registry_provider_configs (
  id                            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id               uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- 'mock' | 'biluppgifter' | 'fordonsfakta' | 'custom' — intentionally
  -- text, not an enum: KNOWN_VEHICLE_REGISTRY_PROVIDER_NAMES in
  -- vehicle-registry.ts is the single source of truth for valid values,
  -- the same pattern already established for Person Lookup's provider name.
  active_provider               text        NOT NULL DEFAULT 'mock',

  -- Encrypted via encryptCredential() (ADR-022) — never plaintext, never
  -- logged. Shape is provider-specific (a single API key for both
  -- evaluated resellers today) and only ever decrypted inside that
  -- provider's own adapter class.
  credentials_encrypted         text,
  base_url                      text,

  timeout_ms                    integer     NOT NULL DEFAULT 5000  CHECK (timeout_ms BETWEEN 500 AND 30000),
  max_retries                   integer     NOT NULL DEFAULT 2     CHECK (max_retries BETWEEN 0 AND 5),
  retry_backoff_ms              integer     NOT NULL DEFAULT 500   CHECK (retry_backoff_ms BETWEEN 100 AND 10000),

  auto_lookup_enabled           boolean     NOT NULL DEFAULT true,

  -- Registration/inspection data changes far less often than a person's
  -- address — a longer default TTL than Person Lookup's 30 days is
  -- deliberately correct here, not copy-pasted.
  cache_ttl_seconds             integer     NOT NULL DEFAULT 7776000 CHECK (cache_ttl_seconds >= 0), -- 90 days; 0 = caching disabled

  is_active                     boolean     NOT NULL DEFAULT true,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  created_by                    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT vehicle_registry_provider_configs_org_uniq UNIQUE (organization_id)
);

COMMENT ON TABLE public.vehicle_registry_provider_configs IS
  'One row per tenant: which Vehicle Registry provider is active, its encrypted credentials, and its operational policy. No credentials may be hardcoded.';

CREATE TRIGGER vehicle_registry_provider_configs_set_updated_at
  BEFORE UPDATE ON public.vehicle_registry_provider_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.vehicle_registry_provider_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_registry_provider_configs_select"
  ON public.vehicle_registry_provider_configs FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "vehicle_registry_provider_configs_insert"
  ON public.vehicle_registry_provider_configs FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  );

CREATE POLICY "vehicle_registry_provider_configs_update"
  ON public.vehicle_registry_provider_configs FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  );

-- ── vehicle_registry_cache ───────────────────────────────────────────────────

CREATE TYPE public.vehicle_registry_cache_status AS ENUM ('found', 'not_found', 'unavailable');

CREATE TABLE public.vehicle_registry_cache (
  id                        uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Swedish registration plates are normalized upper-case, no spaces/hyphens
  -- (e.g. 'ABC123'). Not hashed — this is a public plate identifier, not
  -- sensitive personal data the way a personnummer is.
  registration_number       text        NOT NULL,
  provider                  text        NOT NULL,

  status                    public.vehicle_registry_cache_status NOT NULL,
  -- Encrypted via encryptCredential() — some provider responses include
  -- owner data alongside vehicle data; encrypted at rest defensively even
  -- though the primary fields (registration/inspection status) are not
  -- personal data themselves. NULL for not_found/unavailable.
  canonical_data_encrypted  text,

  looked_up_at              timestamptz NOT NULL DEFAULT now(),
  cache_expires_at          timestamptz NOT NULL,
  last_refreshed_at         timestamptz NOT NULL DEFAULT now(),
  refresh_count             integer     NOT NULL DEFAULT 0 CHECK (refresh_count >= 0),

  created_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vehicle_registry_cache_org_regno_provider_uniq UNIQUE (organization_id, registration_number, provider)
);

COMMENT ON TABLE public.vehicle_registry_cache IS
  'Caches both successful and not-found vehicle lookups per tenant+provider, keyed by registration number. Cached data encrypted at rest defensively (some providers include owner data).';

CREATE INDEX vehicle_registry_cache_lookup_idx
  ON public.vehicle_registry_cache (organization_id, registration_number, provider);

CREATE INDEX vehicle_registry_cache_expiry_idx
  ON public.vehicle_registry_cache (cache_expires_at);

ALTER TABLE public.vehicle_registry_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_registry_cache_select"
  ON public.vehicle_registry_cache FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

-- No client-role INSERT/UPDATE/DELETE policy: written exclusively by the
-- vehicles Edge Function's service-role client, same as person_lookup_cache.

-- ── vehicle_registry_provider_health ─────────────────────────────────────────

CREATE TABLE public.vehicle_registry_provider_health (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider         text        NOT NULL,

  checked_at       timestamptz NOT NULL DEFAULT now(),
  is_healthy       boolean     NOT NULL,
  latency_ms       integer,
  error_message    text
);

COMMENT ON TABLE public.vehicle_registry_provider_health IS
  'History of validateConnection() results per tenant+provider for the Vehicle Registry Lookup Framework.';

CREATE INDEX vehicle_registry_provider_health_lookup_idx
  ON public.vehicle_registry_provider_health (organization_id, provider, checked_at DESC);

ALTER TABLE public.vehicle_registry_provider_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_registry_provider_health_select"
  ON public.vehicle_registry_provider_health FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR organization_id IS NULL
    OR public.is_platform_admin()
  );

-- Written exclusively by the vehicles Edge Function's service-role client —
-- no INSERT/UPDATE/DELETE policy for any role.
