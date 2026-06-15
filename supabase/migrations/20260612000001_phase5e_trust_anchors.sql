-- Phase 5E: PKI Trust Infrastructure & Authority Authenticity
-- Step 1: Trust Anchors

-- ── New compliance_event_type values ─────────────────────────────────────────

ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'trust_anchor_registered';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'certificate_chain_registered';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'signed_receipt_registered';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'transport_authenticity_verified';

-- ── Phase 5E enum ─────────────────────────────────────────────────────────────

CREATE TYPE certificate_revocation_state AS ENUM (
  'active',
  'revoked',
  'suspended',
  'expired'
);

-- ── trust_anchors ─────────────────────────────────────────────────────────────
-- Mutable: anchors can be revoked or expire.
-- anchor_fingerprint    = SHA-256(trust_material ?? public_key_material || '|' || anchor_id)
-- trust_identity_hash   = SHA-256(canonical_jsonb of 5 identity fields) — replay-safe
-- certificate_lineage_hash = SHA-256(parent_lineage_hash ?? 'pki-root' || '|' || anchor_fingerprint)
--
-- Root CA: parent_lineage_hash = NULL → 'pki-root' seed used.
-- Intermediate CA: parent_lineage_hash = parent anchor's certificate_lineage_hash.

CREATE TABLE trust_anchors (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_id                text        NOT NULL UNIQUE,
  common_name              text        NOT NULL,
  organization             text        NOT NULL,
  jurisdiction             text        NOT NULL DEFAULT 'SE',
  anchor_fingerprint       text        NOT NULL,
  trust_identity_hash      text        NOT NULL,
  public_key_material      text        NOT NULL,
  validity_not_before      timestamptz NOT NULL,
  validity_not_after       timestamptz NOT NULL,
  is_active                boolean     NOT NULL DEFAULT true,
  revoked_at               timestamptz,
  revocation_reason        text,
  certificate_lineage_hash text        NOT NULL,
  eidas_compatible         boolean     NOT NULL DEFAULT false,
  metadata                 jsonb       NOT NULL DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_trust_anchor_fingerprint       CHECK (length(anchor_fingerprint) = 64),
  CONSTRAINT chk_trust_identity_hash            CHECK (length(trust_identity_hash) = 64),
  CONSTRAINT chk_trust_lineage_hash             CHECK (length(certificate_lineage_hash) = 64),
  CONSTRAINT chk_trust_anchor_validity          CHECK (validity_not_before < validity_not_after),
  CONSTRAINT chk_trust_anchor_revocation        CHECK (
    (revoked_at IS NULL AND revocation_reason IS NULL) OR
    (revoked_at IS NOT NULL)
  )
);

ALTER TABLE trust_anchors ENABLE ROW LEVEL SECURITY;

-- Platform-level: any authenticated user can read trust anchors
CREATE POLICY trust_anchors_select ON trust_anchors
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY trust_anchors_service ON trust_anchors
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── register_trust_anchor ─────────────────────────────────────────────────────
-- Registers a CA trust anchor (root or intermediate).
-- anchor_fingerprint      = SHA-256(trust_material ?? public_key_material || '|' || anchor_id)
-- trust_identity_hash     = SHA-256(canonical_jsonb of 5 canonical identity fields) — deterministic
-- certificate_lineage_hash = SHA-256(parent_lineage_hash ?? pki-root-seed || '|' || anchor_fingerprint)
-- 'pki-root' seed is distinct from all delivery/trust/export chain seeds.

CREATE OR REPLACE FUNCTION register_trust_anchor(
  p_anchor_id             text,
  p_common_name           text,
  p_organization          text,
  p_public_key_material   text,
  p_validity_not_before   timestamptz,
  p_validity_not_after    timestamptz,
  p_jurisdiction          text        DEFAULT 'SE',
  p_eidas_compatible      boolean     DEFAULT false,
  p_trust_material        text        DEFAULT NULL,
  p_parent_lineage_hash   text        DEFAULT NULL,
  p_actor_id              uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anchor_fingerprint       text;
  v_trust_identity_hash      text;
  v_certificate_lineage_hash text;
  v_new_id                   uuid;
BEGIN
  -- anchor_fingerprint: SHA-256 of trust material (or public key) plus anchor_id
  v_anchor_fingerprint := encode(sha256((
    COALESCE(p_trust_material, p_public_key_material) || '|' || p_anchor_id
  )::bytea), 'hex');

  -- trust_identity_hash: deterministic canonical hash of 5 identity fields
  v_trust_identity_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'anchor_id',          canonical_text(p_anchor_id),
      'common_name',        canonical_text(p_common_name),
      'organization',       canonical_text(p_organization),
      'jurisdiction',       canonical_text(COALESCE(p_jurisdiction, 'SE')),
      'anchor_fingerprint', v_anchor_fingerprint
    ))::text::bytea
  ), 'hex');

  -- certificate_lineage_hash: chain from parent (or 'pki-root' for root CAs)
  v_certificate_lineage_hash := encode(sha256((
    COALESCE(
      p_parent_lineage_hash,
      encode(sha256('pki-root'::bytea), 'hex')
    ) || '|' || v_anchor_fingerprint
  )::bytea), 'hex');

  v_new_id := gen_random_uuid();

  INSERT INTO trust_anchors (
    id, anchor_id, common_name, organization, jurisdiction,
    anchor_fingerprint, trust_identity_hash, public_key_material,
    validity_not_before, validity_not_after, is_active, eidas_compatible,
    certificate_lineage_hash, metadata
  ) VALUES (
    v_new_id, p_anchor_id, p_common_name, p_organization,
    COALESCE(p_jurisdiction, 'SE'),
    v_anchor_fingerprint, v_trust_identity_hash,
    COALESCE(p_public_key_material, ''),
    p_validity_not_before, p_validity_not_after, true,
    COALESCE(p_eidas_compatible, false),
    v_certificate_lineage_hash, '{}'
  );

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'trust_anchor_registered',
    'regulatory_audit_export',
    v_new_id,
    p_actor_id,
    jsonb_build_object(
      'anchor_id',               p_anchor_id,
      'anchor_fingerprint',      v_anchor_fingerprint,
      'trust_identity_hash',     v_trust_identity_hash,
      'certificate_lineage_hash', v_certificate_lineage_hash
    )
  );

  RETURN jsonb_build_object(
    'id',                      v_new_id,
    'anchor_id',               p_anchor_id,
    'anchor_fingerprint',      v_anchor_fingerprint,
    'trust_identity_hash',     v_trust_identity_hash,
    'certificate_lineage_hash', v_certificate_lineage_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION register_trust_anchor TO service_role;
