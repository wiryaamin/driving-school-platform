-- Phase 5D: Transport Trust & Regulatory Delivery
-- Step 1: Endpoint Registry + Trust Verification

-- ── New compliance_event_type values ─────────────────────────────────────────

ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'transport_manifest_sealed';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'delivery_created';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'delivery_attempt_registered';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'delivery_finalized';

-- ── Phase 5D enums ────────────────────────────────────────────────────────────

CREATE TYPE delivery_status AS ENUM (
  'pending',
  'in_progress',
  'delivered',
  'failed',
  'rejected',
  'superseded'
);

CREATE TYPE delivery_attempt_outcome AS ENUM (
  'success',
  'failure',
  'timeout',
  'rejected',
  'pending'
);

-- ── regulatory_endpoints ──────────────────────────────────────────────────────
-- Mutable: endpoints can be updated or revoked.
-- endpoint_identity_hash = SHA-256(canonical_jsonb({key, authority, protocol, version, fingerprint}))
-- trust_fingerprint      = SHA-256(trust_material || endpoint_key)
-- Both are set at registration and remain stable — changes indicate tampering.

CREATE TABLE regulatory_endpoints (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_key           text        NOT NULL UNIQUE,
  authority_name         text        NOT NULL,
  protocol               text        NOT NULL,
  endpoint_version       text        NOT NULL DEFAULT 'v1',
  trust_fingerprint      text        NOT NULL,
  endpoint_identity_hash text        NOT NULL,
  is_active              boolean     NOT NULL DEFAULT true,
  eidas_compatible       boolean     NOT NULL DEFAULT false,
  certificate_lineage    jsonb       NOT NULL DEFAULT '{}',
  authority_metadata     jsonb       NOT NULL DEFAULT '{}',
  transport_metadata     jsonb       NOT NULL DEFAULT '{}',
  revoked_at             timestamptz,
  revocation_reason      text,
  metadata               jsonb       NOT NULL DEFAULT '{}',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_endpoint_trust_fingerprint      CHECK (length(trust_fingerprint) = 64),
  CONSTRAINT chk_endpoint_identity_hash          CHECK (length(endpoint_identity_hash) = 64),
  CONSTRAINT chk_endpoint_revocation             CHECK (
    (revoked_at IS NULL AND revocation_reason IS NULL) OR
    (revoked_at IS NOT NULL)
  )
);

ALTER TABLE regulatory_endpoints ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read endpoint registry (platform-level, no org scope)
CREATE POLICY regulatory_endpoints_select ON regulatory_endpoints
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY regulatory_endpoints_service ON regulatory_endpoints
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── register_regulatory_endpoint ─────────────────────────────────────────────
-- Registers a new trusted regulatory endpoint.
-- trust_fingerprint      = SHA-256(p_trust_material ?? p_endpoint_key)
-- endpoint_identity_hash = SHA-256(canonical_jsonb of 5 identity fields) — replay-safe

CREATE OR REPLACE FUNCTION register_regulatory_endpoint(
  p_endpoint_key       text,
  p_authority_name     text,
  p_protocol           text,
  p_endpoint_version   text    DEFAULT 'v1',
  p_eidas_compatible   boolean DEFAULT false,
  p_trust_material     text    DEFAULT NULL,
  p_authority_metadata jsonb   DEFAULT '{}',
  p_transport_metadata jsonb   DEFAULT '{}',
  p_actor_id           uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trust_fingerprint      text;
  v_endpoint_identity_hash text;
  v_new_id                 uuid;
BEGIN
  -- trust_fingerprint: SHA-256 of trust material (or endpoint_key as fallback)
  v_trust_fingerprint := encode(
    sha256(COALESCE(p_trust_material, p_endpoint_key)::bytea),
    'hex'
  );

  -- endpoint_identity_hash: deterministic, replay-safe, covers all identity fields
  v_endpoint_identity_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'endpoint_key',      canonical_text(p_endpoint_key),
      'authority_name',    canonical_text(p_authority_name),
      'protocol',          canonical_text(p_protocol),
      'endpoint_version',  canonical_text(COALESCE(p_endpoint_version, 'v1')),
      'trust_fingerprint', v_trust_fingerprint
    ))::text::bytea
  ), 'hex');

  v_new_id := gen_random_uuid();

  INSERT INTO regulatory_endpoints (
    id, endpoint_key, authority_name, protocol, endpoint_version,
    trust_fingerprint, endpoint_identity_hash, is_active, eidas_compatible,
    authority_metadata, transport_metadata, metadata
  ) VALUES (
    v_new_id, p_endpoint_key, p_authority_name, p_protocol,
    COALESCE(p_endpoint_version, 'v1'),
    v_trust_fingerprint, v_endpoint_identity_hash, true,
    COALESCE(p_eidas_compatible, false),
    COALESCE(p_authority_metadata, '{}'),
    COALESCE(p_transport_metadata, '{}'),
    '{}'
  );

  RETURN jsonb_build_object(
    'id',                     v_new_id,
    'endpoint_key',           p_endpoint_key,
    'trust_fingerprint',      v_trust_fingerprint,
    'endpoint_identity_hash', v_endpoint_identity_hash
  );
END;
$$;

-- ── verify_endpoint_trust ─────────────────────────────────────────────────────
-- Re-derives endpoint_identity_hash from stored columns and compares.
-- identity_hash_match is reported separately from is_active (is_valid = both).

CREATE OR REPLACE FUNCTION verify_endpoint_trust(p_endpoint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ep                       regulatory_endpoints%ROWTYPE;
  v_recomputed_identity_hash text;
  v_identity_hash_match      boolean;
BEGIN
  SELECT * INTO v_ep FROM regulatory_endpoints WHERE id = p_endpoint_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Regulatory endpoint not found: %', p_endpoint_id;
  END IF;

  v_recomputed_identity_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'endpoint_key',      canonical_text(v_ep.endpoint_key),
      'authority_name',    canonical_text(v_ep.authority_name),
      'protocol',          canonical_text(v_ep.protocol),
      'endpoint_version',  canonical_text(v_ep.endpoint_version),
      'trust_fingerprint', v_ep.trust_fingerprint
    ))::text::bytea
  ), 'hex');

  v_identity_hash_match := (v_recomputed_identity_hash = v_ep.endpoint_identity_hash);

  RETURN jsonb_build_object(
    'is_valid',             v_identity_hash_match AND v_ep.is_active,
    'endpoint_id',          v_ep.id,
    'endpoint_key',         v_ep.endpoint_key,
    'authority_name',       v_ep.authority_name,
    'is_active',            v_ep.is_active,
    'eidas_compatible',     v_ep.eidas_compatible,
    'identity_hash_match',  v_identity_hash_match,
    'revoked_at',           v_ep.revoked_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION register_regulatory_endpoint TO service_role;
GRANT EXECUTE ON FUNCTION verify_endpoint_trust        TO authenticated, service_role;
