-- Phase 5B: Filing Certification & Regulatory Sealing — Evidence Packages
--
-- Tables:    regulatory_evidence_packages (immutable, reproducible)
-- Functions: generate_export_chain_hash (IMMUTABLE)
--            build_certification_manifest (IMMUTABLE)
--            build_regulatory_evidence_package (SECURITY DEFINER)
--
-- Evidence packages are reproducible: given the same entity state and certification
-- history, build_regulatory_evidence_package always assembles the same manifest and
-- the same evidence_hash.

-- ── regulatory_evidence_packages (immutable) ─────────────────────────────────

CREATE TABLE regulatory_evidence_packages (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type             filing_entity_type NOT NULL,
  entity_id               uuid        NOT NULL,
  manifest                jsonb       NOT NULL,
  evidence_hash           text        NOT NULL CHECK (length(evidence_hash) = 64),
  certification_ids       jsonb       NOT NULL DEFAULT '[]',
  snapshot_ids            jsonb       NOT NULL DEFAULT '[]',
  assertion_ids           jsonb       NOT NULL DEFAULT '[]',
  chain_hash              text        NOT NULL,
  serialization_profile   text        NOT NULL DEFAULT 'serialization_standards_v1',
  replay_profile          text        NOT NULL DEFAULT 'replay_safe_json_v1',
  package_version         text        NOT NULL DEFAULT '5B.1',
  assembled_at            timestamptz NOT NULL DEFAULT now(),
  assembled_by            uuid        REFERENCES auth.users(id)
);

COMMENT ON TABLE regulatory_evidence_packages IS
  'Immutable Phase 5B regulatory evidence packages for regulator audit reconstruction. '
  'manifest: canonical manifest (build_certification_manifest output). '
  'evidence_hash = SHA-256 of canonical_jsonb(manifest)::text. '
  'chain_hash = generate_export_chain_hash over all certification_hashes in certified_at order. '
  'Reproducible: same entity state + same certifications always yields same evidence_hash.';

CREATE OR REPLACE FUNCTION prevent_evidence_package_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'regulatory_evidence_packages are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER regulatory_evidence_packages_immutable
  BEFORE UPDATE OR DELETE ON regulatory_evidence_packages
  FOR EACH ROW EXECUTE FUNCTION prevent_evidence_package_mutation();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE regulatory_evidence_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY regulatory_evidence_packages_select ON regulatory_evidence_packages
  FOR SELECT USING (
    organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid
  );

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT            ON regulatory_evidence_packages TO authenticated;
GRANT SELECT, INSERT    ON regulatory_evidence_packages TO service_role;

-- ── generate_export_chain_hash() ─────────────────────────────────────────────
-- Computes a sequential chained hash over an ordered array of hash strings.
-- genesis seed = SHA-256('genesis')
-- chain_i     = SHA-256(chain_{i-1} || '|' || hashes[i])  for i = 1..N
-- Order-sensitive: [a,b] ≠ [b,a].  NULL or empty array returns genesis hash.
-- Returns a 64-character lowercase hex SHA-256 string.

CREATE OR REPLACE FUNCTION generate_export_chain_hash(p_hashes text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
WITH RECURSIVE chain AS (
  SELECT 0 AS idx,
    encode(sha256('genesis'::bytea), 'hex') AS h
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
$$;

-- ── build_certification_manifest() ───────────────────────────────────────────
-- Assembles a canonical manifest jsonb from pre-loaded component data.
-- IMMUTABLE: depends only on its arguments — no DB reads.
-- Caller loads the data (canonical_hash, cert IDs, etc.) and passes it in.
-- Used by build_regulatory_evidence_package to produce a reproducible manifest.

CREATE OR REPLACE FUNCTION build_certification_manifest(
  p_entity_type          text,
  p_entity_id            uuid,
  p_canonical_hash       text,
  p_certificate_hash     text,
  p_lineage_chain_hash   text,
  p_certification_ids    jsonb,
  p_snapshot_ids         jsonb,
  p_assertion_ids        jsonb,
  p_serializer_version   text,
  p_replay_profile       text
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT canonical_jsonb(jsonb_build_object(
  'entity_type',          canonical_text(COALESCE(p_entity_type, '')),
  'entity_id',            canonical_uuid(p_entity_id),
  'canonical_hash',       COALESCE(p_canonical_hash, ''),
  'certificate_hash',     COALESCE(p_certificate_hash, ''),
  'lineage_chain_hash',   COALESCE(p_lineage_chain_hash, ''),
  'certification_ids',    canonical_collection(COALESCE(p_certification_ids, '[]'::jsonb)),
  'snapshot_ids',         canonical_collection(COALESCE(p_snapshot_ids, '[]'::jsonb)),
  'assertion_ids',        canonical_collection(COALESCE(p_assertion_ids, '[]'::jsonb)),
  'serializer_version',   canonical_text(COALESCE(p_serializer_version, '')),
  'replay_profile',       canonical_text(COALESCE(p_replay_profile, '')),
  'manifest_version',     '5B.1'
))
$$;

-- ── build_regulatory_evidence_package() ──────────────────────────────────────
-- Assembles an immutable, reproducible evidence package for an entity.
-- Collects: all regulatory certifications, certification snapshots, and replay
--           assertions for this entity.
-- Computes: chain_hash over all certification_hashes in certified_at order.
-- Builds:   manifest via build_certification_manifest (IMMUTABLE, canonical).
-- Seals:    evidence_hash = SHA-256 of canonical_jsonb(manifest)::text.
-- Returns:  {evidence_id, entity_type, entity_id, evidence_hash, chain_hash, manifest}

CREATE OR REPLACE FUNCTION build_regulatory_evidence_package(
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
  v_cert_ids      jsonb;
  v_cert_hashes   text[];
  v_snapshot_ids  jsonb;
  v_assertion_ids jsonb;
  v_canonical     jsonb;
  v_payload_hash  text;
  v_latest_cert   record;
  v_chain_hash    text;
  v_manifest      jsonb;
  v_evidence_hash text;
  v_pkg_id        uuid;
BEGIN
  -- Collect all certification IDs and their hashes (oldest-first for chain)
  SELECT
    jsonb_agg(id            ORDER BY certified_at ASC),
    array_agg(certificate_hash ORDER BY certified_at ASC)
  INTO v_cert_ids, v_cert_hashes
  FROM regulatory_certifications
  WHERE entity_type    = p_entity_type
    AND entity_id      = p_entity_id
    AND organization_id = p_org_id;

  v_cert_ids    := COALESCE(v_cert_ids,    '[]'::jsonb);
  v_cert_hashes := COALESCE(v_cert_hashes, ARRAY[]::text[]);

  -- Collect all snapshot IDs for this entity
  SELECT jsonb_agg(id ORDER BY created_at ASC)
  INTO v_snapshot_ids
  FROM certification_snapshots
  WHERE entity_type   = p_entity_type::text
    AND entity_id     = p_entity_id
    AND organization_id = p_org_id;

  v_snapshot_ids := COALESCE(v_snapshot_ids, '[]'::jsonb);

  -- Collect all assertion IDs for this entity
  SELECT jsonb_agg(id ORDER BY asserted_at ASC)
  INTO v_assertion_ids
  FROM replay_assertions
  WHERE entity_type   = p_entity_type::text
    AND entity_id     = p_entity_id
    AND organization_id = p_org_id;

  v_assertion_ids := COALESCE(v_assertion_ids, '[]'::jsonb);

  -- Build canonical payload and compute its hash
  v_canonical    := build_canonical_payload(p_entity_type::text, p_entity_id, p_org_id);
  v_payload_hash := generate_replay_safe_hash(p_entity_type::text, p_entity_id, v_canonical);

  -- Latest certification for manifest header
  SELECT * INTO v_latest_cert
  FROM regulatory_certifications
  WHERE entity_type    = p_entity_type
    AND entity_id      = p_entity_id
    AND organization_id = p_org_id
  ORDER BY certified_at DESC LIMIT 1;

  -- Sequential chain hash over all certification hashes
  v_chain_hash := generate_export_chain_hash(v_cert_hashes);

  -- Build canonical manifest (IMMUTABLE — reproducible)
  v_manifest := build_certification_manifest(
    p_entity_type::text,
    p_entity_id,
    v_payload_hash,
    COALESCE(v_latest_cert.certificate_hash,    ''),
    v_chain_hash,
    v_cert_ids,
    v_snapshot_ids,
    v_assertion_ids,
    'serialization_standards_v1',
    'replay_safe_json_v1'
  );

  -- Evidence hash: SHA-256 of canonical manifest (reproducible)
  v_evidence_hash := encode(
    sha256(canonical_jsonb(v_manifest)::text::bytea),
    'hex'
  );

  INSERT INTO regulatory_evidence_packages (
    organization_id, entity_type, entity_id,
    manifest, evidence_hash,
    certification_ids, snapshot_ids, assertion_ids,
    chain_hash, assembled_by
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    v_manifest, v_evidence_hash,
    v_cert_ids, v_snapshot_ids, v_assertion_ids,
    v_chain_hash, p_actor_id
  ) RETURNING id INTO v_pkg_id;

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'evidence_package_assembled', p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'evidence_package_id', v_pkg_id,
      'evidence_hash',       v_evidence_hash,
      'chain_hash',          v_chain_hash,
      'certification_count', jsonb_array_length(v_cert_ids)
    )
  );

  RETURN jsonb_build_object(
    'evidence_id',   v_pkg_id,
    'entity_type',   p_entity_type,
    'entity_id',     p_entity_id,
    'evidence_hash', v_evidence_hash,
    'chain_hash',    v_chain_hash,
    'manifest',      v_manifest
  );
END;
$$;

-- ── Function grants ───────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION generate_export_chain_hash(text[])
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION build_certification_manifest(
  text, uuid, text, text, text, jsonb, jsonb, jsonb, text, text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION build_regulatory_evidence_package(
  uuid, filing_entity_type, uuid, uuid
) TO service_role;
