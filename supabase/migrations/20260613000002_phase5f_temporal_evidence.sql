-- Phase 5F: Temporal Evidence & Cryptographic Replay Integrity
-- Step 2: Temporal Evidence Records, Signature Registry, Chronology Lineage

-- ── temporal_evidence_records ─────────────────────────────────────────────────
-- Immutable: once issued, temporal evidence cannot be altered.
-- timestamp_value             = supplied by caller (NEVER now()) — required for deterministic replay
-- signature_payload_hash      = SHA-256(canonical_jsonb of 5 authority-signed fields)
-- evidence_hash               = SHA-256(canonical_jsonb of 7 fields incl. signature_payload_hash + version)
-- temporal_nonrepudiation_hash = generate_nonrepudiation_hash(entity_id, evidence_hash, timestamp_signature)
-- chronology_hash             = generate_temporal_chain_hash([prior_chronology_hash?, evidence_hash])

CREATE TABLE temporal_evidence_records (
  id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id              uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type                  filing_entity_type NOT NULL,
  entity_id                    uuid        NOT NULL,
  authority_id                 uuid        NOT NULL REFERENCES timestamp_authorities(id) ON DELETE RESTRICT,
  timestamp_value              timestamptz NOT NULL,
  payload_hash                 text        NOT NULL,
  evidence_hash                text        NOT NULL,
  signature_payload_hash       text        NOT NULL,
  temporal_nonrepudiation_hash text        NOT NULL,
  timestamp_signature          text        NOT NULL,
  chronology_hash              text        NOT NULL,
  serializer_version           text        NOT NULL DEFAULT '5F.1',
  actor_id                     uuid        REFERENCES auth.users(id),
  metadata                     jsonb       NOT NULL DEFAULT '{}',
  recorded_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_ter_evidence_hash    CHECK (length(evidence_hash) = 64),
  CONSTRAINT chk_ter_sig_hash         CHECK (length(signature_payload_hash) = 64),
  CONSTRAINT chk_ter_nrhash           CHECK (length(temporal_nonrepudiation_hash) = 64),
  CONSTRAINT chk_ter_chronology_hash  CHECK (length(chronology_hash) = 64)
);

ALTER TABLE temporal_evidence_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY temporal_evidence_records_select ON temporal_evidence_records
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY temporal_evidence_records_service ON temporal_evidence_records
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION prevent_temporal_evidence_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'temporal_evidence_records are immutable and cannot be % after creation', TG_OP;
END;
$$;

CREATE TRIGGER trg_temporal_evidence_immutable
BEFORE UPDATE OR DELETE ON temporal_evidence_records
FOR EACH ROW EXECUTE FUNCTION prevent_temporal_evidence_modification();

-- ── timestamp_signature_registry ─────────────────────────────────────────────
-- Immutable authority-centric view of signatures issued.
-- Links each signature to the authority that issued it for cross-reference.
-- signature_payload_hash and nonrepudiation_hash mirror temporal_evidence_records
-- enabling authority-side audit without reading the org-scoped evidence table.

CREATE TABLE timestamp_signature_registry (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id           uuid        NOT NULL REFERENCES temporal_evidence_records(id) ON DELETE RESTRICT,
  authority_id          uuid        NOT NULL REFERENCES timestamp_authorities(id) ON DELETE RESTRICT,
  signature_algorithm   text        NOT NULL DEFAULT 'sha256-keyed',
  signature_value       text        NOT NULL,
  signature_payload_hash text       NOT NULL,
  nonrepudiation_hash   text        NOT NULL,
  verified_at           timestamptz,
  metadata              jsonb       NOT NULL DEFAULT '{}',
  registered_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_tsr_sig_hash  CHECK (length(signature_payload_hash) = 64),
  CONSTRAINT chk_tsr_nrhash    CHECK (length(nonrepudiation_hash) = 64)
);

ALTER TABLE timestamp_signature_registry ENABLE ROW LEVEL SECURITY;

-- Platform-level: authenticated users can read signature registry
CREATE POLICY timestamp_signature_registry_select ON timestamp_signature_registry
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY timestamp_signature_registry_service ON timestamp_signature_registry
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION prevent_signature_registry_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'timestamp_signature_registry records are immutable and cannot be % after creation', TG_OP;
END;
$$;

CREATE TRIGGER trg_signature_registry_immutable
BEFORE UPDATE OR DELETE ON timestamp_signature_registry
FOR EACH ROW EXECUTE FUNCTION prevent_signature_registry_modification();

-- ── chronology_lineage ────────────────────────────────────────────────────────
-- Append-only, immutable: the tamper-evident chain of temporal evidence for each entity.
-- chronology_hash = generate_temporal_chain_hash([prior_chronology_hash?, evidence_hash])
-- sequence_number is monotonically increasing per (organization_id, entity_id).
-- prior_chronology_hash = NULL for the first entry (genesis fold only).

CREATE TABLE chronology_lineage (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type           filing_entity_type NOT NULL,
  entity_id             uuid        NOT NULL,
  sequence_number       integer     NOT NULL,
  evidence_id           uuid        NOT NULL REFERENCES temporal_evidence_records(id) ON DELETE RESTRICT,
  timestamp_value       timestamptz NOT NULL,
  chronology_hash       text        NOT NULL,
  prior_chronology_hash text,
  metadata              jsonb       NOT NULL DEFAULT '{}',
  appended_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_cl_chronology_hash  CHECK (length(chronology_hash) = 64),
  CONSTRAINT chk_cl_prior_hash       CHECK (prior_chronology_hash IS NULL OR length(prior_chronology_hash) = 64),
  UNIQUE (organization_id, entity_id, sequence_number)
);

ALTER TABLE chronology_lineage ENABLE ROW LEVEL SECURITY;

CREATE POLICY chronology_lineage_select ON chronology_lineage
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY chronology_lineage_service ON chronology_lineage
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION prevent_chronology_lineage_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'chronology_lineage records are immutable and cannot be % after creation', TG_OP;
END;
$$;

CREATE TRIGGER trg_chronology_lineage_immutable
BEFORE UPDATE OR DELETE ON chronology_lineage
FOR EACH ROW EXECUTE FUNCTION prevent_chronology_lineage_modification();

-- ── issue_timestamp_evidence ──────────────────────────────────────────────────
-- Issues temporal evidence: records the authority-signed timestamp for an entity payload.
-- p_timestamp_value MUST be supplied by the caller — NEVER now() — to ensure
-- deterministic replay: the same timestamp always re-derives the same hashes.
-- Also populates timestamp_signature_registry and chronology_lineage.

CREATE OR REPLACE FUNCTION issue_timestamp_evidence(
  p_org_id              uuid,
  p_entity_type         filing_entity_type,
  p_entity_id           uuid,
  p_authority_id        uuid,
  p_timestamp_value     timestamptz,
  p_payload_hash        text,
  p_timestamp_signature text,
  p_actor_id            uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_authority              timestamp_authorities%ROWTYPE;
  v_signature_payload_hash text;
  v_evidence_hash          text;
  v_nonrepudiation_hash    text;
  v_prior_chronology_hash  text;
  v_sequence_number        integer;
  v_chronology_hash        text;
  v_new_id                 uuid;
  v_registry_id            uuid;
BEGIN
  SELECT * INTO v_authority FROM timestamp_authorities WHERE id = p_authority_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timestamp authority not found: %', p_authority_id;
  END IF;

  -- signature_payload_hash: canonical jsonb of 5 fields the authority signed
  -- p_timestamp_value::text serializes the supplied (non-volatile) timestamp
  v_signature_payload_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'entity_id',       canonical_uuid(p_entity_id),
      'entity_type',     canonical_text(p_entity_type::text),
      'timestamp_value', canonical_text(p_timestamp_value::text),
      'authority_id',    canonical_uuid(p_authority_id),
      'payload_hash',    COALESCE(p_payload_hash, '')
    ))::text::bytea
  ), 'hex');

  -- evidence_hash: canonical jsonb of 7 fields (includes signature_payload_hash + version)
  -- Broader than signature_payload_hash — covers the full evidence identity
  v_evidence_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'entity_id',              canonical_uuid(p_entity_id),
      'entity_type',            canonical_text(p_entity_type::text),
      'timestamp_value',        canonical_text(p_timestamp_value::text),
      'authority_id',           canonical_uuid(p_authority_id),
      'payload_hash',           COALESCE(p_payload_hash, ''),
      'signature_payload_hash', v_signature_payload_hash,
      'evidence_version',       '5F.1'
    ))::text::bytea
  ), 'hex');

  -- temporal_nonrepudiation_hash: reuses IMMUTABLE generate_nonrepudiation_hash (Phase 5E)
  v_nonrepudiation_hash := generate_nonrepudiation_hash(
    p_entity_id::text,
    v_evidence_hash,
    p_timestamp_signature
  );

  -- Chronology: find the prior entry for this entity in chronology_lineage
  SELECT cl.chronology_hash, cl.sequence_number
  INTO v_prior_chronology_hash, v_sequence_number
  FROM chronology_lineage cl
  WHERE cl.organization_id = p_org_id AND cl.entity_id = p_entity_id
  ORDER BY cl.sequence_number DESC
  LIMIT 1;

  v_sequence_number := COALESCE(v_sequence_number, 0) + 1;

  -- chronology_hash: temporal chain from prior (or genesis on first entry) + evidence_hash
  v_chronology_hash := generate_temporal_chain_hash(
    CASE
      WHEN v_prior_chronology_hash IS NOT NULL
      THEN ARRAY[v_prior_chronology_hash, v_evidence_hash]
      ELSE ARRAY[v_evidence_hash]
    END
  );

  v_new_id := gen_random_uuid();

  INSERT INTO temporal_evidence_records (
    id, organization_id, entity_type, entity_id,
    authority_id, timestamp_value, payload_hash,
    evidence_hash, signature_payload_hash, temporal_nonrepudiation_hash,
    timestamp_signature, chronology_hash, actor_id
  ) VALUES (
    v_new_id, p_org_id, p_entity_type, p_entity_id,
    p_authority_id, p_timestamp_value, COALESCE(p_payload_hash, ''),
    v_evidence_hash, v_signature_payload_hash, v_nonrepudiation_hash,
    p_timestamp_signature, v_chronology_hash, p_actor_id
  );

  -- Authority-centric signature registry entry
  v_registry_id := gen_random_uuid();
  INSERT INTO timestamp_signature_registry (
    id, evidence_id, authority_id, signature_algorithm,
    signature_value, signature_payload_hash, nonrepudiation_hash
  ) VALUES (
    v_registry_id, v_new_id, p_authority_id, 'sha256-keyed',
    p_timestamp_signature, v_signature_payload_hash, v_nonrepudiation_hash
  );

  -- Append immutable chronology_lineage entry
  INSERT INTO chronology_lineage (
    organization_id, entity_type, entity_id,
    sequence_number, evidence_id, timestamp_value,
    chronology_hash, prior_chronology_hash
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    v_sequence_number, v_new_id, p_timestamp_value,
    v_chronology_hash, v_prior_chronology_hash
  );

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'temporal_evidence_issued',
    p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'evidence_id',                v_new_id::text,
      'evidence_hash',              v_evidence_hash,
      'chronology_hash',            v_chronology_hash,
      'temporal_nonrepudiation_hash', v_nonrepudiation_hash,
      'sequence_number',            v_sequence_number
    )
  );

  RETURN jsonb_build_object(
    'id',                           v_new_id,
    'evidence_hash',                v_evidence_hash,
    'signature_payload_hash',       v_signature_payload_hash,
    'temporal_nonrepudiation_hash', v_nonrepudiation_hash,
    'chronology_hash',              v_chronology_hash,
    'sequence_number',              v_sequence_number
  );
END;
$$;

-- ── verify_timestamp_signature ────────────────────────────────────────────────
-- Re-derives signature_payload_hash from stored evidence fields.
-- Uses stored timestamp_value (supplied at issue time, never now()) for determinism.
-- signature_hash_match = true → evidence fields unchanged since authority signed.

CREATE OR REPLACE FUNCTION verify_timestamp_signature(p_evidence_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evidence            temporal_evidence_records%ROWTYPE;
  v_recomputed_sig_hash text;
  v_sig_hash_match      boolean;
BEGIN
  SELECT * INTO v_evidence FROM temporal_evidence_records WHERE id = p_evidence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Temporal evidence record not found: %', p_evidence_id;
  END IF;

  -- Re-derive signature_payload_hash using same 5-field structure
  -- timestamp_value::text is deterministic (stored, not volatile)
  v_recomputed_sig_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'entity_id',       canonical_uuid(v_evidence.entity_id),
      'entity_type',     canonical_text(v_evidence.entity_type::text),
      'timestamp_value', canonical_text(v_evidence.timestamp_value::text),
      'authority_id',    canonical_uuid(v_evidence.authority_id),
      'payload_hash',    COALESCE(v_evidence.payload_hash, '')
    ))::text::bytea
  ), 'hex');

  v_sig_hash_match := (v_recomputed_sig_hash = v_evidence.signature_payload_hash);

  RETURN jsonb_build_object(
    'is_valid',             v_sig_hash_match,
    'signature_hash_match', v_sig_hash_match,
    'evidence_id',          v_evidence.id,
    'timestamp_value',      v_evidence.timestamp_value
  );
END;
$$;

-- ── verify_temporal_nonrepudiation ────────────────────────────────────────────
-- Re-derives temporal_nonrepudiation_hash using IMMUTABLE generate_nonrepudiation_hash.
-- nonrepudiation_match = true → entity_id + evidence_hash + timestamp_signature intact.

CREATE OR REPLACE FUNCTION verify_temporal_nonrepudiation(p_evidence_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evidence             temporal_evidence_records%ROWTYPE;
  v_recomputed_nrhash    text;
  v_nrhash_match         boolean;
BEGIN
  SELECT * INTO v_evidence FROM temporal_evidence_records WHERE id = p_evidence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Temporal evidence record not found: %', p_evidence_id;
  END IF;

  v_recomputed_nrhash := generate_nonrepudiation_hash(
    v_evidence.entity_id::text,
    v_evidence.evidence_hash,
    v_evidence.timestamp_signature
  );

  v_nrhash_match := (v_recomputed_nrhash = v_evidence.temporal_nonrepudiation_hash);

  RETURN jsonb_build_object(
    'is_valid',             v_nrhash_match,
    'nonrepudiation_match', v_nrhash_match,
    'evidence_id',          v_evidence.id,
    'entity_id',            v_evidence.entity_id,
    'timestamp_value',      v_evidence.timestamp_value
  );
END;
$$;

GRANT EXECUTE ON FUNCTION issue_timestamp_evidence        TO service_role;
GRANT EXECUTE ON FUNCTION verify_timestamp_signature      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION verify_temporal_nonrepudiation  TO authenticated, service_role;
