-- =============================================================================
-- Person Lookup Framework — production-grade rebuild
--
-- Prior state (docs/INTEGRATION_CONFIGURATION_GUIDE.md §4.10, ADR-008):
-- a provider-abstraction interface + Mock provider only, explicitly deferring
-- caching, tenant configuration, and audit logging as Version 1.1 Backlog
-- pending approval to build a real provider. That approval was given
-- explicitly for this pass — this migration builds exactly what was deferred.
--
-- Three new tables:
--   person_lookup_provider_configs — per-tenant provider selection,
--     encrypted credentials, timeout/retry policy, auto-lookup/auto-address
--     toggles, cache TTL. Mirrors nets-credentials' encrypted-in-column
--     pattern but as its own table (unlike Nets/Stripe's 2-3 fields, this
--     config surface is wide enough that cramming it into
--     organizations.settings would be worse, not simpler).
--   person_lookup_cache — successful AND not-found lookups cached, keyed by
--     a keyed HMAC hash of the personnummer (never the raw value — same
--     primitive as students.personnummer_hash), with the canonical person
--     data encrypted at rest (GDPR: this is real personal data, not a
--     credential, but the same AES-256-GCM primitive applies generically).
--   person_lookup_provider_health — periodic validateConnection() results,
--     so "is the configured provider currently reachable" is a real,
--     queryable operational signal instead of only visible synchronously
--     inside a single request.
--
-- Audit logging deliberately does NOT get a fourth new table: P-027
-- (identity-events.ts's own header comment) requires every identity-event
-- writer to go through recordIdentityEvent() / identity_security_events,
-- never a second parallel mechanism. This migration only widens that
-- table's existing provider CHECK constraint to admit 'person_lookup' —
-- the same enum-drift bug class just found and fixed today in
-- payment_method (see 20260726000002) and payment_requests.provider (see
-- 20260726000001): a hardcoded allow-list that a genuinely new, legitimate
-- value can silently fail against forever if nobody remembers to widen it.
-- =============================================================================

-- ── Fix the same enum-drift bug class in identity_security_events ──────────

ALTER TABLE public.identity_security_events
  DROP CONSTRAINT identity_security_events_provider_check;

ALTER TABLE public.identity_security_events
  ADD CONSTRAINT identity_security_events_provider_check
  CHECK (provider IN ('password', 'bankid', 'entra_id', 'google_workspace', 'saml', 'person_lookup'));

-- ── person_lookup_provider_configs ──────────────────────────────────────────

CREATE TABLE public.person_lookup_provider_configs (
  id                            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id               uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- 'mock' | 'spar' | 'navet' | 'creditsafe' | 'ratsit' | 'roaring' | 'custom'
  -- Intentionally text, not an enum: KNOWN_PROVIDER_NAMES in person-lookup.ts
  -- is the single source of truth for valid values (an app-level constant a
  -- new provider class can extend in one place), not a second list here that
  -- could drift from it the same way the two enum bugs fixed today did.
  active_provider               text        NOT NULL DEFAULT 'mock',

  -- Encrypted via encryptCredential() (ADR-022) — never plaintext, never
  -- logged. Shape is provider-specific (API key, client id/secret, or a
  -- small JSON blob) and only ever decrypted inside that provider's own
  -- adapter class, never elsewhere.
  credentials_encrypted         text,
  base_url                      text,

  timeout_ms                    integer     NOT NULL DEFAULT 5000  CHECK (timeout_ms BETWEEN 500 AND 30000),
  max_retries                   integer     NOT NULL DEFAULT 2     CHECK (max_retries BETWEEN 0 AND 5),
  retry_backoff_ms              integer     NOT NULL DEFAULT 500   CHECK (retry_backoff_ms BETWEEN 100 AND 10000),

  auto_lookup_enabled           boolean     NOT NULL DEFAULT true,
  auto_address_update_enabled   boolean     NOT NULL DEFAULT false,

  cache_ttl_seconds             integer     NOT NULL DEFAULT 2592000 CHECK (cache_ttl_seconds >= 0), -- 30 days; 0 = caching disabled

  is_active                     boolean     NOT NULL DEFAULT true,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  created_by                    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT person_lookup_provider_configs_org_uniq UNIQUE (organization_id)
);

COMMENT ON TABLE public.person_lookup_provider_configs IS
  'One row per tenant: which Person Lookup provider is active, its encrypted credentials, and its operational policy (timeout/retry/caching/auto-fill behavior). No credentials may be hardcoded — see ADR-022.';

CREATE TRIGGER person_lookup_provider_configs_set_updated_at
  BEFORE UPDATE ON public.person_lookup_provider_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.person_lookup_provider_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_lookup_provider_configs_select"
  ON public.person_lookup_provider_configs FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "person_lookup_provider_configs_insert"
  ON public.person_lookup_provider_configs FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  );

CREATE POLICY "person_lookup_provider_configs_update"
  ON public.person_lookup_provider_configs FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin', 'org_manager'])
  );

-- ── person_lookup_cache ──────────────────────────────────────────────────────

CREATE TYPE public.person_lookup_cache_status AS ENUM ('found', 'not_found', 'unavailable');

CREATE TABLE public.person_lookup_cache (
  id                        uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- HMAC-SHA256 via hashPersonalNumber() (bankid-crypto.ts) — same primitive
  -- as students.personnummer_hash. The raw personnummer is never stored here.
  personnummer_hash         text        NOT NULL,
  provider                  text        NOT NULL,

  status                    public.person_lookup_cache_status NOT NULL,
  -- Encrypted via encryptCredential() — this is real personal data (name,
  -- address), not a credential, but the same AES-256-GCM-at-rest primitive
  -- applies generically. NULL for not_found/unavailable (nothing to cache).
  canonical_data_encrypted  text,
  confidence                text,       -- 'exact' | 'partial' | 'unknown' | null

  looked_up_at              timestamptz NOT NULL DEFAULT now(),
  cache_expires_at          timestamptz NOT NULL,
  last_refreshed_at         timestamptz NOT NULL DEFAULT now(),
  refresh_count             integer     NOT NULL DEFAULT 0 CHECK (refresh_count >= 0),

  created_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT person_lookup_cache_org_hash_provider_uniq UNIQUE (organization_id, personnummer_hash, provider)
);

COMMENT ON TABLE public.person_lookup_cache IS
  'Caches both successful and not-found lookups per tenant+provider. Keyed by a keyed HMAC hash of the personnummer, never the plaintext value. Cached person data is encrypted at rest (GDPR).';

CREATE INDEX person_lookup_cache_lookup_idx
  ON public.person_lookup_cache (organization_id, personnummer_hash, provider);

CREATE INDEX person_lookup_cache_expiry_idx
  ON public.person_lookup_cache (cache_expires_at);

ALTER TABLE public.person_lookup_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_lookup_cache_select"
  ON public.person_lookup_cache FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

-- No client-role INSERT/UPDATE/DELETE policy: the cache is written and
-- invalidated exclusively by the students Edge Function via its
-- service-role client (same pattern as channel_configs' real write path —
-- see 20260725000004's note on that). RLS SELECT above exists so an org's
-- own staff can be shown "last refreshed at" / cache status in the UI
-- without going through the Edge Function for a pure read.

-- ── person_lookup_provider_health ───────────────────────────────────────────

CREATE TABLE public.person_lookup_provider_health (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- NULL organization_id = a platform-wide/shared-provider health check
  -- (e.g. Mock, or a provider with one shared platform credential rather
  -- than per-tenant credentials).
  organization_id  uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider         text        NOT NULL,

  checked_at       timestamptz NOT NULL DEFAULT now(),
  is_healthy       boolean     NOT NULL,
  latency_ms       integer,
  error_message    text
);

COMMENT ON TABLE public.person_lookup_provider_health IS
  'History of validateConnection() results per tenant+provider — makes "is the configured provider currently reachable" a queryable operational signal, not only visible synchronously inside a single request.';

CREATE INDEX person_lookup_provider_health_lookup_idx
  ON public.person_lookup_provider_health (organization_id, provider, checked_at DESC);

ALTER TABLE public.person_lookup_provider_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_lookup_provider_health_select"
  ON public.person_lookup_provider_health FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR organization_id IS NULL
    OR public.is_platform_admin()
  );

-- Written exclusively by the students Edge Function's service-role client
-- (health checks are a side effect of handlePersonLookupStatus, not a
-- client-writable resource) — no INSERT/UPDATE/DELETE policy for any role.
