-- ═══════════════════════════════════════════════════════════════════════════
-- Identity & Security Architecture — Phase 3: BankID Authentication Integration
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Implements ADR-007 (Enterprise Architecture Handbook) / P-027's Identity
-- domain extension for BankID as the second authentication provider.
--
-- auth_identity_links is Identity State (not Identity History — that remains
-- identity_security_events, untouched by this migration). It answers "which
-- external identities does this user have linked," the same question
-- memberships answers for organization access. It is never derived from
-- identity_security_events and never feeds an authorization decision.
--
-- bankid_auth_orders is transient BankID protocol/session state — the
-- server-side record of an in-flight Init→Collect→(Complete|Failed) BankID
-- order. It is not Identity History (it does not describe that an identity
-- event occurred; identity_security_events already does that) and not
-- Identity State (it is not queried to determine current identity — once an
-- order resolves, the durable outcome is either a row in auth_identity_links
-- (link) or a real Supabase session (login); the order row itself expires and
-- is disposable). It exists only because BankID's Collect endpoint must be
-- polled server-side (mTLS is only available to the Edge Function, never the
-- browser) and that polling needs a place to hold orderRef/status/hintCode
-- between requests.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── auth_identity_links ────────────────────────────────────────────────────

CREATE TABLE public.auth_identity_links (
  id                          uuid          NOT NULL DEFAULT gen_random_uuid(),
  user_id                     uuid          NOT NULL,
  provider                    text          NOT NULL,
  external_subject_encrypted  text          NOT NULL,  -- AES-256-GCM encrypted personal number (BankID) / external subject.
  external_subject_hash       text          NOT NULL,  -- HMAC-SHA256 hex — O(1) equality lookup, never plaintext.
  display_name                text,         -- Provider-supplied display name (e.g. BankID givenName + surname). UI hint only, never authoritative identity.
  linked_at                   timestamptz   NOT NULL DEFAULT now(),
  last_used_at                timestamptz,

  CONSTRAINT auth_identity_links_pkey PRIMARY KEY (id),
  CONSTRAINT auth_identity_links_user_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT auth_identity_links_provider_check CHECK (
    provider IN ('bankid', 'entra_id', 'google_workspace', 'saml')
  ),
  CONSTRAINT auth_identity_links_hash_format CHECK (external_subject_hash ~ '^[a-f0-9]{64}$'),
  -- The atomic backstop against duplicate users (ADR-007, mirroring ADR-004's
  -- trigger-as-backstop pattern): the same external identity can never link to
  -- two different auth.users rows, enforced by the database, not application logic.
  CONSTRAINT auth_identity_links_unique_external UNIQUE (provider, external_subject_hash),
  -- One link per provider per user — a person has exactly one BankID identity.
  CONSTRAINT auth_identity_links_unique_user_provider UNIQUE (user_id, provider)
);

COMMENT ON TABLE public.auth_identity_links IS
  'Identity State (ADR-007) — which external provider identities are linked to '
  'which auth.users row. Never Identity History; identity_security_events '
  'records that a linking event happened, this table records what currently '
  'exists. Never an input to requirePerm()/RLS/any authorization decision.';
COMMENT ON COLUMN public.auth_identity_links.external_subject_encrypted IS
  'AES-256-GCM encrypted (IDENTITY_ENCRYPTION_KEY, _shared/bankid-crypto.ts). Plaintext personal number never stored.';
COMMENT ON COLUMN public.auth_identity_links.external_subject_hash IS
  'HMAC-SHA256 hex (IDENTITY_HASH_KEY, _shared/bankid-crypto.ts) — enables equality lookup without plaintext exposure.';

CREATE INDEX auth_identity_links_user_idx ON public.auth_identity_links (user_id);

ALTER TABLE public.auth_identity_links ENABLE ROW LEVEL SECURITY;

-- Mirrors identity_security_events' RLS shape: a user may see their own
-- linked identities; broader visibility requires the same dedicated
-- permission pattern already established for identity events. No
-- INSERT/UPDATE/DELETE policy for any client role — writes only via the
-- service role (bankid-auth Edge Function), exactly like recordIdentityEvent().
CREATE POLICY "auth_identity_links_select_own_or_permitted"
  ON public.auth_identity_links FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_permission('administration:identity_link:read')
    OR public.is_platform_admin()
  );

INSERT INTO public.permissions (id, code, domain, resource, action, description)
VALUES (
  gen_random_uuid(), 'administration:identity_link:read', 'administration', 'identity_link', 'read',
  'View which external identity providers (BankID, etc.) are linked to user accounts'
);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('org_owner', 'org_admin') AND r.is_system_role = true
  AND p.code = 'administration:identity_link:read';

-- ─── bankid_auth_orders ─────────────────────────────────────────────────────

CREATE TABLE public.bankid_auth_orders (
  id                      uuid          NOT NULL DEFAULT gen_random_uuid(),
  order_ref               text          NOT NULL,  -- BankID's orderRef — the capability token the frontend polls with.
  purpose                 text          NOT NULL,  -- 'login' | 'link'.
  status                  text          NOT NULL DEFAULT 'pending',  -- 'pending' | 'complete' | 'failed' | 'expired' | 'consumed'.
  user_id                 uuid,         -- Set immediately for 'link' (caller already authenticated); resolved on completion for 'login'.
  personal_number_hash    text,         -- Set once BankID returns completionData — HMAC only, never plaintext.
  hint_code               text,         -- BankID's latest status/hintCode, relayed to the frontend for UI messaging.
  correlation_id          uuid,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  expires_at              timestamptz   NOT NULL,
  completed_at            timestamptz,

  CONSTRAINT bankid_auth_orders_pkey PRIMARY KEY (id),
  CONSTRAINT bankid_auth_orders_user_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT bankid_auth_orders_order_ref_unique UNIQUE (order_ref),
  CONSTRAINT bankid_auth_orders_purpose_check CHECK (purpose IN ('login', 'link')),
  CONSTRAINT bankid_auth_orders_status_check CHECK (
    status IN ('pending', 'complete', 'failed', 'expired', 'consumed')
  )
);

COMMENT ON TABLE public.bankid_auth_orders IS
  'Transient BankID protocol/session state (Init→Collect→Complete|Failed). Not '
  'Identity History (identity_security_events already records that a BankID '
  'event occurred) and not durable Identity State (auth_identity_links records '
  'what currently exists after a link resolves). Exists only to hold '
  'orderRef/status/hintCode between polling round-trips, since mTLS to BankID '
  'is only available server-side. Rows are disposable after expiry.';

CREATE INDEX bankid_auth_orders_order_ref_idx ON public.bankid_auth_orders (order_ref);
CREATE INDEX bankid_auth_orders_expires_idx ON public.bankid_auth_orders (expires_at);

ALTER TABLE public.bankid_auth_orders ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policy for any client role — this table is
-- touched exclusively by the bankid-auth Edge Function via the service role.
-- The frontend never queries it directly; orderRef possession (an unguessable
-- UUID minted by BankID) is the only capability needed to poll /collect,
-- exactly like a password-reset token, and RLS default-deny keeps it that way
-- even if a future caller mistakenly used an anon/authenticated client.
