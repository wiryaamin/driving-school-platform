-- Phase 5B: Filing Certification & Regulatory Sealing — Certification Core
--
-- Tables:    regulatory_certifications (immutable, hash-chained)
-- Functions: certify_regulatory_filing, generate_filing_certificate, verify_filing_certificate
-- Enum updates: compliance_event_type (evidence_package_assembled, replay_certificate_generated)
--
-- certificate_hash = SHA-256(entity_id|entity_type|canonical_payload_hash|
--                             certification_type|reason|lineage_chain_hash)
-- Timestamp-free: identical entity state always yields identical certificate_hash.
-- lineage_chain_hash chains through prior_certification_id — append-only per entity.

-- ── Enum extensions ───────────────────────────────────────────────────────────

ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'evidence_package_assembled';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'replay_certificate_generated';

-- ── regulatory_certification_type enum ───────────────────────────────────────

CREATE TYPE regulatory_certification_type AS ENUM (
  'regulatory_seal',       -- entity sealed as ready-to-file
  'replay_verified',       -- hash verified via deterministic replay
  'authority_submitted',   -- submitted to authority with receipt
  'lineage_anchored'       -- anchored into the export lineage chain
);

-- ── regulatory_certifications (fully immutable) ───────────────────────────────

CREATE TABLE regulatory_certifications (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type             filing_entity_type NOT NULL,
  entity_id               uuid        NOT NULL,
  certification_type      regulatory_certification_type NOT NULL DEFAULT 'regulatory_seal',
  canonical_payload_hash  text        NOT NULL,
  serializer_version      text        NOT NULL DEFAULT 'serialization_standards_v1',
  replay_profile_version  text        NOT NULL DEFAULT 'replay_safe_json_v1',
  lineage_chain_hash      text        NOT NULL,
  prior_certification_id  uuid        REFERENCES regulatory_certifications(id) ON DELETE RESTRICT,
  filing_hash             text,
  certificate_hash        text        NOT NULL CHECK (length(certificate_hash) = 64),
  certification_reason    text        NOT NULL DEFAULT '',
  actor_id                uuid        REFERENCES auth.users(id),
  metadata                jsonb       NOT NULL DEFAULT '{}',
  certified_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE regulatory_certifications IS
  'Immutable Phase 5B regulatory certifications with append-only hash chain linkage. '
  'certificate_hash = SHA-256(entity_id|entity_type|canonical_payload_hash|cert_type|reason|chain). '
  'lineage_chain_hash = SHA-256(prior_chain_hash|canonical_payload_hash). '
  'Timestamp-free: identical entity state + reason always yields identical certificate_hash.';

CREATE OR REPLACE FUNCTION prevent_regulatory_certification_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'regulatory_certifications are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER regulatory_certifications_immutable
  BEFORE UPDATE OR DELETE ON regulatory_certifications
  FOR EACH ROW EXECUTE FUNCTION prevent_regulatory_certification_mutation();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE regulatory_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY regulatory_certifications_select ON regulatory_certifications
  FOR SELECT USING (
    organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid
  );

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT            ON regulatory_certifications TO authenticated;
GRANT SELECT, INSERT    ON regulatory_certifications TO service_role;

-- ── certify_regulatory_filing() ───────────────────────────────────────────────
-- Builds canonical payload, computes canonical_payload_hash via generate_replay_safe_hash,
-- chains to prior certification for this entity (or starts genesis chain),
-- seals the record with a timestamp-free certificate_hash.
-- Returns: {certification_id, entity_type, entity_id, certification_type,
--           certificate_hash, canonical_payload_hash, lineage_chain_hash,
--           prior_certification_id, certification_reason}

CREATE OR REPLACE FUNCTION certify_regulatory_filing(
  p_org_id             uuid,
  p_entity_type        filing_entity_type,
  p_entity_id          uuid,
  p_certification_type regulatory_certification_type DEFAULT 'regulatory_seal',
  p_reason             text DEFAULT '',
  p_actor_id           uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical     jsonb;
  v_payload_hash  text;
  v_filing_hash   text;
  v_prior_id      uuid;
  v_prior_chain   text;
  v_chain_hash    text;
  v_cert_hash     text;
  v_cert_id       uuid;
BEGIN
  -- Build canonical payload via Phase 5A.2 dispatcher
  v_canonical := build_canonical_payload(p_entity_type::text, p_entity_id, p_org_id);

  -- Timestamp-free canonical payload hash
  v_payload_hash := generate_replay_safe_hash(p_entity_type::text, p_entity_id, v_canonical);

  -- Retrieve entity's stored filing hash
  CASE p_entity_type
    WHEN 'agi_submission' THEN
      SELECT submission_hash INTO v_filing_hash
      FROM agi_submissions WHERE id = p_entity_id AND organization_id = p_org_id;
    WHEN 'vat_declaration' THEN
      SELECT declaration_hash INTO v_filing_hash
      FROM vat_declarations WHERE id = p_entity_id AND organization_id = p_org_id;
    WHEN 'saf_t_export' THEN
      SELECT content_hash INTO v_filing_hash
      FROM saf_t_exports WHERE id = p_entity_id AND organization_id = p_org_id;
    ELSE
      v_filing_hash := NULL;
  END CASE;

  -- Chain to prior certification for this entity (if any)
  SELECT id, lineage_chain_hash
  INTO   v_prior_id, v_prior_chain
  FROM   regulatory_certifications
  WHERE  entity_type = p_entity_type
    AND  entity_id   = p_entity_id
    AND  organization_id = p_org_id
  ORDER  BY certified_at DESC LIMIT 1;

  -- Lineage chain hash: SHA-256(prior_chain_hash|canonical_payload_hash)
  v_chain_hash := encode(sha256((
    COALESCE(v_prior_chain, 'genesis') || '|' || v_payload_hash
  )::bytea), 'hex');

  -- Certificate hash: timestamp-free, fully deterministic
  v_cert_hash := encode(sha256((
    canonical_uuid(p_entity_id)                                 || '|' ||
    canonical_text(p_entity_type::text)                         || '|' ||
    v_payload_hash                                              || '|' ||
    canonical_text(p_certification_type::text)                  || '|' ||
    canonical_text(COALESCE(p_reason, ''))                      || '|' ||
    v_chain_hash
  )::bytea), 'hex');

  INSERT INTO regulatory_certifications (
    organization_id, entity_type, entity_id,
    certification_type, canonical_payload_hash,
    lineage_chain_hash, prior_certification_id,
    filing_hash, certificate_hash,
    certification_reason, actor_id
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    p_certification_type, v_payload_hash,
    v_chain_hash, v_prior_id,
    v_filing_hash, v_cert_hash,
    COALESCE(p_reason, ''), p_actor_id
  ) RETURNING id INTO v_cert_id;

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'filing_certified', p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'certification_id',       v_cert_id,
      'certificate_hash',       v_cert_hash,
      'canonical_payload_hash', v_payload_hash,
      'certification_type',     p_certification_type
    )
  );

  RETURN jsonb_build_object(
    'certification_id',       v_cert_id,
    'entity_type',            p_entity_type,
    'entity_id',              p_entity_id,
    'certification_type',     p_certification_type,
    'certificate_hash',       v_cert_hash,
    'canonical_payload_hash', v_payload_hash,
    'lineage_chain_hash',     v_chain_hash,
    'prior_certification_id', v_prior_id,
    'certification_reason',   COALESCE(p_reason, '')
  );
END;
$$;

-- ── generate_filing_certificate() ─────────────────────────────────────────────
-- Assembles a sealed certificate document (jsonb) for a regulatory filing.
-- Auto-certifies with 'regulatory_seal' if no certification exists yet.
-- Includes: canonical payload, certificate hash, lineage chain,
--           serializer/replay profile versions, filing hash, actor attribution.

CREATE OR REPLACE FUNCTION generate_filing_certificate(
  p_org_id      uuid,
  p_entity_type filing_entity_type,
  p_entity_id   uuid,
  p_actor_id    uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert      record;
  v_canonical jsonb;
  v_auto      jsonb;
BEGIN
  -- Load latest regulatory certification for this entity
  SELECT * INTO v_cert
  FROM regulatory_certifications
  WHERE entity_type    = p_entity_type
    AND entity_id      = p_entity_id
    AND organization_id = p_org_id
  ORDER BY certified_at DESC LIMIT 1;

  -- Auto-certify if none exists
  IF NOT FOUND THEN
    v_auto := certify_regulatory_filing(
      p_org_id, p_entity_type, p_entity_id,
      'regulatory_seal', 'auto-certified via generate_filing_certificate', p_actor_id
    );
    SELECT * INTO v_cert
    FROM regulatory_certifications
    WHERE id = (v_auto->>'certification_id')::uuid;
  END IF;

  -- Canonical payload for inclusion in the certificate document
  v_canonical := build_canonical_payload(p_entity_type::text, p_entity_id, p_org_id);

  RETURN canonical_jsonb(jsonb_build_object(
    'certificate_id',          v_cert.id,
    'entity_type',             canonical_text(p_entity_type::text),
    'entity_id',               canonical_uuid(p_entity_id),
    'organization_id',         canonical_uuid(p_org_id),
    'certificate_hash',        v_cert.certificate_hash,
    'canonical_payload_hash',  v_cert.canonical_payload_hash,
    'lineage_chain_hash',      v_cert.lineage_chain_hash,
    'serializer_version',      v_cert.serializer_version,
    'replay_profile_version',  v_cert.replay_profile_version,
    'certification_type',      v_cert.certification_type,
    'certification_reason',    v_cert.certification_reason,
    'filing_hash',             v_cert.filing_hash,
    'prior_certification_id',  v_cert.prior_certification_id,
    'canonical_payload',       v_canonical,
    'certified_at',            v_cert.certified_at
  ));
END;
$$;

-- ── verify_filing_certificate() ───────────────────────────────────────────────
-- Re-derives certificate_hash from the stored deterministic fields and compares
-- to the stored value. Also verifies canonical_payload_hash is still current
-- (best-effort — NULL if entity cannot be loaded, e.g. unsupported type).
-- Returns: {valid, certification_id, stored_hash, recomputed_hash,
--           canonical_payload_valid, stored_canonical_hash, current_canonical_hash,
--           serializer_version, certified_at, entity_type, entity_id}

CREATE OR REPLACE FUNCTION verify_filing_certificate(
  p_certification_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert             record;
  v_rehash           text;
  v_is_valid         boolean;
  v_canonical_valid  boolean;
  v_current_hash     text;
BEGIN
  SELECT * INTO v_cert
  FROM regulatory_certifications
  WHERE id = p_certification_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Certification not found: ' || p_certification_id::text
    );
  END IF;

  -- Re-derive certificate_hash from stored deterministic fields (no timestamps)
  v_rehash := encode(sha256((
    canonical_uuid(v_cert.entity_id)                              || '|' ||
    canonical_text(v_cert.entity_type::text)                      || '|' ||
    v_cert.canonical_payload_hash                                 || '|' ||
    canonical_text(v_cert.certification_type::text)               || '|' ||
    canonical_text(COALESCE(v_cert.certification_reason, ''))     || '|' ||
    v_cert.lineage_chain_hash
  )::bytea), 'hex');

  v_is_valid := (v_cert.certificate_hash = v_rehash);

  -- Best-effort: verify canonical_payload_hash against current entity state
  BEGIN
    SELECT generate_replay_safe_hash(
      v_cert.entity_type::text,
      v_cert.entity_id,
      build_canonical_payload(
        v_cert.entity_type::text, v_cert.entity_id, v_cert.organization_id
      )
    ) INTO v_current_hash;
    v_canonical_valid := (v_cert.canonical_payload_hash = v_current_hash);
  EXCEPTION WHEN OTHERS THEN
    v_canonical_valid := NULL;
    v_current_hash    := NULL;
  END;

  RETURN jsonb_build_object(
    'valid',                   v_is_valid,
    'certification_id',        p_certification_id,
    'entity_type',             v_cert.entity_type,
    'entity_id',               v_cert.entity_id,
    'certification_type',      v_cert.certification_type,
    'stored_hash',             v_cert.certificate_hash,
    'recomputed_hash',         v_rehash,
    'canonical_payload_valid', v_canonical_valid,
    'stored_canonical_hash',   v_cert.canonical_payload_hash,
    'current_canonical_hash',  v_current_hash,
    'serializer_version',      v_cert.serializer_version,
    'certified_at',            v_cert.certified_at
  );
END;
$$;

-- ── Function grants ───────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION certify_regulatory_filing(
  uuid, filing_entity_type, uuid, regulatory_certification_type, text, uuid
) TO service_role;

GRANT EXECUTE ON FUNCTION generate_filing_certificate(uuid, filing_entity_type, uuid, uuid)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION verify_filing_certificate(uuid)
  TO authenticated, service_role;
