-- Phase 5B: Filing Certification & Regulatory Sealing — Lineage Verification
--
-- Tables:    export_lineage_records (immutable, chained per entity)
-- Functions: verify_export_lineage (SECURITY DEFINER)
--            generate_replay_certificate (SECURITY DEFINER)
--
-- export_lineage_records chains canonical_hash values for each entity in an
-- append-only structure. verify_export_lineage detects: hash chain breaks,
-- canonical hash divergence from current entity state, and serializer version
-- incompatibilities. generate_replay_certificate runs the full replay pipeline:
-- assert → snapshot → certify → lineage → evidence package.

-- ── export_lineage_records (immutable, append-only per entity) ────────────────

CREATE TABLE export_lineage_records (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type         filing_entity_type NOT NULL,
  entity_id           uuid        NOT NULL,
  source_hash         text        NOT NULL,
  canonical_hash      text        NOT NULL,
  certification_hash  text,
  chain_hash          text        NOT NULL,
  prior_lineage_id    uuid        REFERENCES export_lineage_records(id) ON DELETE RESTRICT,
  serializer_version  text        NOT NULL DEFAULT 'serialization_standards_v1',
  replay_profile      text        NOT NULL DEFAULT 'replay_safe_json_v1',
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  recorded_by         uuid        REFERENCES auth.users(id)
);

COMMENT ON TABLE export_lineage_records IS
  'Immutable Phase 5B export lineage — one record per certification event per entity. '
  'chain_hash = SHA-256(prior_chain_hash|canonical_hash), starting from ''genesis''. '
  'verify_export_lineage re-derives each chain_hash and checks canonical_hash is current. '
  'Detects: chain breaks, canonical hash divergence, serializer version incompatibility.';

CREATE OR REPLACE FUNCTION prevent_export_lineage_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'export_lineage_records are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER export_lineage_records_immutable
  BEFORE UPDATE OR DELETE ON export_lineage_records
  FOR EACH ROW EXECUTE FUNCTION prevent_export_lineage_mutation();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE export_lineage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY export_lineage_records_select ON export_lineage_records
  FOR SELECT USING (
    organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid
  );

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT            ON export_lineage_records TO authenticated;
GRANT SELECT, INSERT    ON export_lineage_records TO service_role;

-- ── verify_export_lineage() ───────────────────────────────────────────────────
-- Reads all export_lineage_records for an entity in recorded_at order.
-- For each record, re-derives chain_hash from prior chain + stored canonical_hash.
-- Checks each stored chain_hash against the expected re-derived value.
-- Compares latest stored canonical_hash against current entity state.
-- Flags known vs unknown serializer_version values.
-- Returns: {valid, entity_type, entity_id, lineage_count, chain_breaks,
--           hash_mismatches, version_issues, current_canonical_hash,
--           issues[], lineage_chain[]}

CREATE OR REPLACE FUNCTION verify_export_lineage(
  p_org_id      uuid,
  p_entity_type filing_entity_type,
  p_entity_id   uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec              record;
  v_prior_chain      text    := 'genesis';
  v_expected_chain   text;
  v_current_hash     text;
  v_latest_stored    text;
  v_lineage_count    int     := 0;
  v_chain_breaks     int     := 0;
  v_hash_mismatches  int     := 0;
  v_version_issues   int     := 0;
  v_issues           jsonb   := '[]'::jsonb;
  v_lineage_chain    jsonb   := '[]'::jsonb;
  v_is_valid         boolean;
BEGIN
  -- Get current canonical hash for the entity (best-effort)
  BEGIN
    SELECT generate_replay_safe_hash(
      p_entity_type::text, p_entity_id,
      build_canonical_payload(p_entity_type::text, p_entity_id, p_org_id)
    ) INTO v_current_hash;
  EXCEPTION WHEN OTHERS THEN
    v_current_hash := NULL;
  END;

  -- Walk lineage records in recorded_at ASC order
  FOR v_rec IN
    SELECT * FROM export_lineage_records
    WHERE entity_type    = p_entity_type
      AND entity_id      = p_entity_id
      AND organization_id = p_org_id
    ORDER BY recorded_at ASC
  LOOP
    v_lineage_count := v_lineage_count + 1;

    -- Re-derive expected chain hash from prior chain + stored canonical_hash
    v_expected_chain := encode(sha256((
      COALESCE(v_prior_chain, 'genesis') || '|' || v_rec.canonical_hash
    )::bytea), 'hex');

    -- Check 1: chain hash continuity
    IF v_rec.chain_hash <> v_expected_chain THEN
      v_chain_breaks := v_chain_breaks + 1;
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'issue_type',      'chain_break',
        'lineage_id',      v_rec.id,
        'recorded_at',     v_rec.recorded_at,
        'stored_chain',    v_rec.chain_hash,
        'expected_chain',  v_expected_chain
      ));
    END IF;

    -- Check 2: serializer version compatibility
    IF v_rec.serializer_version NOT IN (
      'serialization_standards_v1', 'replay_safe_json_v1', '5B.1'
    ) THEN
      v_version_issues := v_version_issues + 1;
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'issue_type',          'version_incompatible',
        'lineage_id',          v_rec.id,
        'serializer_version',  v_rec.serializer_version
      ));
    END IF;

    -- Build lineage view entry
    v_lineage_chain := v_lineage_chain || jsonb_build_array(jsonb_build_object(
      'lineage_id',         v_rec.id,
      'canonical_hash',     v_rec.canonical_hash,
      'chain_hash',         v_rec.chain_hash,
      'chain_valid',        (v_rec.chain_hash = v_expected_chain),
      'certification_hash', v_rec.certification_hash,
      'serializer_version', v_rec.serializer_version,
      'recorded_at',        v_rec.recorded_at
    ));

    -- Advance prior_chain using stored value (prevents cascading false positives)
    v_prior_chain := v_rec.chain_hash;
    v_latest_stored := v_rec.canonical_hash;
  END LOOP;

  -- Check if latest stored canonical_hash matches current entity state
  IF v_lineage_count > 0
    AND v_current_hash IS NOT NULL
    AND v_latest_stored IS NOT NULL
    AND v_latest_stored <> v_current_hash
  THEN
    v_hash_mismatches := v_hash_mismatches + 1;
    v_issues := v_issues || jsonb_build_array(jsonb_build_object(
      'issue_type',        'canonical_hash_diverged',
      'stored_canonical',  v_latest_stored,
      'current_canonical', v_current_hash
    ));
  END IF;

  v_is_valid := (v_chain_breaks = 0 AND v_hash_mismatches = 0 AND v_version_issues = 0);

  RETURN jsonb_build_object(
    'valid',                  v_is_valid,
    'entity_type',            p_entity_type,
    'entity_id',              p_entity_id,
    'lineage_count',          v_lineage_count,
    'chain_breaks',           v_chain_breaks,
    'hash_mismatches',        v_hash_mismatches,
    'version_issues',         v_version_issues,
    'current_canonical_hash', v_current_hash,
    'issues',                 v_issues,
    'lineage_chain',          v_lineage_chain
  );
END;
$$;

-- ── generate_replay_certificate() ────────────────────────────────────────────
-- Full deterministic replay verification pipeline:
--   1. assert_replay_determinism — log assertion result
--   2. create_certification_snapshot — capture canonical entity state
--   3. certify_regulatory_filing (replay_verified) — seal with certificate_hash
--   4. Append export_lineage_records entry (chains to prior lineage)
--   5. build_regulatory_evidence_package — assemble full evidence package
-- Logs: 'replay_certificate_generated' compliance event.
-- Returns: {certification_id, snapshot_id, lineage_id, evidence_id,
--           certificate_hash, canonical_hash, chain_hash, evidence_hash,
--           assertion_status, assertion_id, entity_type, entity_id}

CREATE OR REPLACE FUNCTION generate_replay_certificate(
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
  v_assertion      jsonb;
  v_snapshot_id    uuid;
  v_cert_result    jsonb;
  v_cert_id        uuid;
  v_cert_hash      text;
  v_canonical_hash text;
  v_filing_hash    text;
  v_prior_lineage  uuid;
  v_prior_chain    text;
  v_chain_hash     text;
  v_lineage_id     uuid;
  v_evidence       jsonb;
BEGIN
  -- Step 1: Assert replay determinism
  v_assertion := assert_replay_determinism(p_org_id, p_entity_type::text, p_entity_id);

  -- Step 2: Create certification snapshot
  v_snapshot_id := create_certification_snapshot(
    p_org_id, p_entity_type::text, p_entity_id, p_actor_id
  );

  -- Step 3: Certify with replay_verified type
  v_cert_result    := certify_regulatory_filing(
    p_org_id, p_entity_type, p_entity_id,
    'replay_verified', 'generated via generate_replay_certificate', p_actor_id
  );
  v_cert_id        := (v_cert_result->>'certification_id')::uuid;
  v_cert_hash      := v_cert_result->>'certificate_hash';
  v_canonical_hash := v_cert_result->>'canonical_payload_hash';

  -- Retrieve entity's stored filing hash for lineage record
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

  -- Find prior lineage record to chain
  SELECT id, chain_hash
  INTO   v_prior_lineage, v_prior_chain
  FROM   export_lineage_records
  WHERE  entity_type    = p_entity_type
    AND  entity_id      = p_entity_id
    AND  organization_id = p_org_id
  ORDER  BY recorded_at DESC LIMIT 1;

  -- Chain hash for this lineage record
  v_chain_hash := encode(sha256((
    COALESCE(v_prior_chain, 'genesis') || '|' || v_canonical_hash
  )::bytea), 'hex');

  -- Step 4: Record in export_lineage_records
  INSERT INTO export_lineage_records (
    organization_id, entity_type, entity_id,
    source_hash, canonical_hash, certification_hash,
    chain_hash, prior_lineage_id, recorded_by
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    COALESCE(v_filing_hash, ''), v_canonical_hash, v_cert_hash,
    v_chain_hash, v_prior_lineage, p_actor_id
  ) RETURNING id INTO v_lineage_id;

  -- Step 5: Build evidence package
  v_evidence := build_regulatory_evidence_package(p_org_id, p_entity_type, p_entity_id, p_actor_id);

  -- Log replay certificate generated event
  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'replay_certificate_generated', p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'certification_id',  v_cert_id,
      'snapshot_id',       v_snapshot_id,
      'lineage_id',        v_lineage_id,
      'evidence_id',       v_evidence->>'evidence_id',
      'certificate_hash',  v_cert_hash,
      'canonical_hash',    v_canonical_hash,
      'assertion_status',  v_assertion->>'assertion_status'
    )
  );

  RETURN jsonb_build_object(
    'certification_id',  v_cert_id,
    'snapshot_id',       v_snapshot_id,
    'lineage_id',        v_lineage_id,
    'evidence_id',       v_evidence->>'evidence_id',
    'certificate_hash',  v_cert_hash,
    'canonical_hash',    v_canonical_hash,
    'chain_hash',        v_chain_hash,
    'evidence_hash',     v_evidence->>'evidence_hash',
    'assertion_status',  v_assertion->>'assertion_status',
    'assertion_id',      v_assertion->>'assertion_id',
    'entity_type',       p_entity_type,
    'entity_id',         p_entity_id
  );
END;
$$;

-- ── Function grants ───────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION verify_export_lineage(uuid, filing_entity_type, uuid)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION generate_replay_certificate(uuid, filing_entity_type, uuid, uuid)
  TO service_role;
