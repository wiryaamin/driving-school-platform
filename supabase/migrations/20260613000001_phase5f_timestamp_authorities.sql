-- Phase 5F: Temporal Evidence & Cryptographic Replay Integrity
-- Step 1: Timestamp Authorities + generate_temporal_chain_hash

-- ── New compliance_event_type values ─────────────────────────────────────────

ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'timestamp_authority_registered';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'temporal_evidence_issued';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'temporal_snapshot_created';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'temporal_replay_certificate_generated';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'temporal_chain_validated';

-- ── Phase 5F enum ─────────────────────────────────────────────────────────────

CREATE TYPE timestamp_authority_status AS ENUM (
  'active',
  'revoked',
  'suspended',
  'expired'
);

-- ── timestamp_authorities ─────────────────────────────────────────────────────
-- Mutable: authorities can be revoked, suspended, or expire.
-- authority_fingerprint   = SHA-256(public_key_material || '|' || authority_id)
-- authority_identity_hash = SHA-256(canonical_jsonb of 6 canonical identity fields) — replay-safe
-- authority_lineage_hash  = SHA-256(parent_lineage_hash ?? 'temporal-genesis' || '|' || authority_fingerprint)
--
-- Root authority: parent_lineage_hash = NULL → 'temporal-genesis' seed used.
-- Derived authority: parent_lineage_hash = parent authority's authority_lineage_hash.

CREATE TABLE timestamp_authorities (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id            text        NOT NULL UNIQUE,
  common_name             text        NOT NULL,
  organization            text        NOT NULL,
  jurisdiction            text        NOT NULL DEFAULT 'SE',
  authority_version       text        NOT NULL DEFAULT '5F.1',
  authority_fingerprint   text        NOT NULL,
  authority_identity_hash text        NOT NULL,
  public_key_material     text        NOT NULL,
  validity_not_before     timestamptz NOT NULL,
  validity_not_after      timestamptz NOT NULL,
  authority_status        timestamp_authority_status NOT NULL DEFAULT 'active',
  revoked_at              timestamptz,
  revocation_reason       text,
  authority_lineage_hash  text        NOT NULL,
  parent_authority_id     text,
  trust_anchor_id         uuid        REFERENCES trust_anchors(id) ON DELETE RESTRICT,
  eidas_compatible        boolean     NOT NULL DEFAULT false,
  metadata                jsonb       NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_ts_auth_fingerprint  CHECK (length(authority_fingerprint) = 64),
  CONSTRAINT chk_ts_auth_identity     CHECK (length(authority_identity_hash) = 64),
  CONSTRAINT chk_ts_auth_lineage      CHECK (length(authority_lineage_hash) = 64),
  CONSTRAINT chk_ts_auth_validity     CHECK (validity_not_before < validity_not_after),
  CONSTRAINT chk_ts_auth_revocation   CHECK (
    revoked_at IS NULL OR revocation_reason IS NOT NULL
  )
);

ALTER TABLE timestamp_authorities ENABLE ROW LEVEL SECURITY;

-- Platform-level: any authenticated user can read timestamp authorities
CREATE POLICY timestamp_authorities_select ON timestamp_authorities
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY timestamp_authorities_service ON timestamp_authorities
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── generate_temporal_chain_hash ──────────────────────────────────────────────
-- IMMUTABLE: SHA-256 recursive chain anchored at 'temporal-genesis'.
-- 6th distinct genesis seed — isolated from genesis/trust-genesis/delivery-genesis/
-- pki-root/signature-genesis. Same input array → different output from all prior chains.
-- Order-sensitive: preserves chronology lineage sequence.

CREATE OR REPLACE FUNCTION generate_temporal_chain_hash(p_hashes text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $func$
WITH RECURSIVE chain AS (
  SELECT 0 AS idx,
         encode(sha256('temporal-genesis'::bytea), 'hex') AS h
  UNION ALL
  SELECT c.idx + 1,
         encode(
           sha256((c.h || '|' || COALESCE(p_hashes[c.idx + 1], ''))::bytea),
           'hex'
         )
  FROM chain c
  WHERE c.idx < cardinality(COALESCE(p_hashes, ARRAY[]::text[]))
)
SELECT h FROM chain ORDER BY idx DESC LIMIT 1
$func$;

-- ── register_timestamp_authority ─────────────────────────────────────────────
-- Registers a timestamp authority (root or derived).
-- authority_fingerprint   = SHA-256(public_key_material || '|' || authority_id)
-- authority_identity_hash = SHA-256(canonical_jsonb of 6 canonical identity fields)
-- authority_lineage_hash  = SHA-256(parent_lineage_hash ?? temporal-genesis-seed || '|' || authority_fingerprint)
-- Platform events use organization_id = '00000000-0000-0000-0000-000000000000'.

CREATE OR REPLACE FUNCTION register_timestamp_authority(
  p_authority_id        text,
  p_common_name         text,
  p_organization        text,
  p_jurisdiction        text        DEFAULT 'SE',
  p_public_key_material text,
  p_validity_not_before timestamptz,
  p_validity_not_after  timestamptz,
  p_trust_anchor_id     uuid        DEFAULT NULL,
  p_parent_lineage_hash text        DEFAULT NULL,
  p_eidas_compatible    boolean     DEFAULT false,
  p_actor_id            uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_authority_fingerprint   text;
  v_authority_identity_hash text;
  v_authority_lineage_hash  text;
  v_new_id                  uuid;
BEGIN
  -- authority_fingerprint: SHA-256 of public key material plus authority_id
  v_authority_fingerprint := encode(sha256((
    COALESCE(p_public_key_material, '') || '|' || p_authority_id
  )::bytea), 'hex');

  -- authority_identity_hash: deterministic canonical hash of 6 identity fields
  v_authority_identity_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'authority_id',   canonical_text(p_authority_id),
      'common_name',    canonical_text(p_common_name),
      'organization',   canonical_text(p_organization),
      'jurisdiction',   canonical_text(COALESCE(p_jurisdiction, 'SE')),
      'version',        '5F.1',
      'fingerprint',    v_authority_fingerprint
    ))::text::bytea
  ), 'hex');

  -- authority_lineage_hash: chain from parent (or 'temporal-genesis' for root authorities)
  v_authority_lineage_hash := encode(sha256((
    COALESCE(
      p_parent_lineage_hash,
      encode(sha256('temporal-genesis'::bytea), 'hex')
    ) || '|' || v_authority_fingerprint
  )::bytea), 'hex');

  v_new_id := gen_random_uuid();

  INSERT INTO timestamp_authorities (
    id, authority_id, common_name, organization, jurisdiction, authority_version,
    authority_fingerprint, authority_identity_hash, public_key_material,
    validity_not_before, validity_not_after,
    authority_lineage_hash, trust_anchor_id, eidas_compatible, metadata
  ) VALUES (
    v_new_id, p_authority_id, p_common_name, p_organization,
    COALESCE(p_jurisdiction, 'SE'), '5F.1',
    v_authority_fingerprint, v_authority_identity_hash,
    COALESCE(p_public_key_material, ''),
    p_validity_not_before, p_validity_not_after,
    v_authority_lineage_hash, p_trust_anchor_id,
    COALESCE(p_eidas_compatible, false), '{}'
  );

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'timestamp_authority_registered',
    'regulatory_audit_export',
    v_new_id,
    p_actor_id,
    jsonb_build_object(
      'authority_id',            p_authority_id,
      'authority_fingerprint',   v_authority_fingerprint,
      'authority_identity_hash', v_authority_identity_hash,
      'authority_lineage_hash',  v_authority_lineage_hash
    )
  );

  RETURN jsonb_build_object(
    'id',                      v_new_id,
    'authority_id',            p_authority_id,
    'authority_fingerprint',   v_authority_fingerprint,
    'authority_identity_hash', v_authority_identity_hash,
    'authority_lineage_hash',  v_authority_lineage_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_temporal_chain_hash    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION register_timestamp_authority    TO service_role;
