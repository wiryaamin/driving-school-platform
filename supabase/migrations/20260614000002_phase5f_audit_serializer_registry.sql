-- Phase 5F-Audit: Temporal Replay Hardening & Deterministic Evidence Stabilization
-- Step 2: Canonical Serializer Registry

-- ── canonical_serializer_registry ────────────────────────────────────────────
-- Central registry of every canonicalization/serializer profile used by the
-- replay and temporal evidence infrastructure.
-- ALL replay validation functions must verify serializer compatibility before
-- re-deriving hashes.
-- schema_hash = SHA-256(serializer_key || '|' || serializer_version || '|' || canonicalization_strategy)

CREATE TABLE canonical_serializer_registry (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  serializer_key                  text        NOT NULL UNIQUE,
  serializer_version              text        NOT NULL,
  canonicalization_strategy       text        NOT NULL,
  replay_compatible               boolean     NOT NULL DEFAULT true,
  deterministic                   boolean     NOT NULL DEFAULT true,
  introduced_phase                text        NOT NULL,
  deprecated_phase                text,
  replay_notes                    text,
  schema_hash                     text        NOT NULL,
  chronology_compatible           boolean     NOT NULL DEFAULT true,
  evidence_compatible             boolean     NOT NULL DEFAULT true,
  trust_reconstruction_compatible boolean     NOT NULL DEFAULT true,
  created_at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_csr_schema_hash  CHECK (length(schema_hash) = 64),
  CONSTRAINT chk_csr_key_nonempty CHECK (length(serializer_key) > 0)
);

ALTER TABLE canonical_serializer_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY canonical_serializer_registry_select ON canonical_serializer_registry
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY canonical_serializer_registry_service ON canonical_serializer_registry
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── register_serializer_profile ───────────────────────────────────────────────
-- Registers a serializer profile in canonical_serializer_registry.
-- schema_hash = SHA-256(serializer_key || '|' || serializer_version || '|' || canonicalization_strategy)

CREATE OR REPLACE FUNCTION register_serializer_profile(
  p_serializer_key                  text,
  p_serializer_version              text,
  p_canonicalization_strategy       text,
  p_introduced_phase                text,
  p_replay_compatible               boolean     DEFAULT true,
  p_deterministic                   boolean     DEFAULT true,
  p_chronology_compatible           boolean     DEFAULT true,
  p_evidence_compatible             boolean     DEFAULT true,
  p_trust_reconstruction_compatible boolean     DEFAULT true,
  p_replay_notes                    text        DEFAULT NULL,
  p_actor_id                        uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_schema_hash text;
  v_new_id      uuid;
BEGIN
  v_schema_hash := encode(sha256((
    COALESCE(p_serializer_key, '') || '|' ||
    COALESCE(p_serializer_version, '') || '|' ||
    COALESCE(p_canonicalization_strategy, '')
  )::bytea), 'hex');

  v_new_id := gen_random_uuid();

  INSERT INTO canonical_serializer_registry (
    id, serializer_key, serializer_version, canonicalization_strategy,
    replay_compatible, deterministic, introduced_phase,
    replay_notes, schema_hash,
    chronology_compatible, evidence_compatible, trust_reconstruction_compatible
  ) VALUES (
    v_new_id, p_serializer_key, p_serializer_version, p_canonicalization_strategy,
    COALESCE(p_replay_compatible, true), COALESCE(p_deterministic, true),
    p_introduced_phase, p_replay_notes, v_schema_hash,
    COALESCE(p_chronology_compatible, true),
    COALESCE(p_evidence_compatible, true),
    COALESCE(p_trust_reconstruction_compatible, true)
  )
  ON CONFLICT (serializer_key) DO NOTHING;

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'serializer_profile_registered',
    'regulatory_audit_export',
    v_new_id,
    p_actor_id,
    jsonb_build_object(
      'serializer_key',     p_serializer_key,
      'serializer_version', p_serializer_version,
      'schema_hash',        v_schema_hash,
      'introduced_phase',   p_introduced_phase
    )
  );

  RETURN jsonb_build_object(
    'id',              v_new_id,
    'serializer_key',  p_serializer_key,
    'schema_hash',     v_schema_hash
  );
END;
$$;

-- ── validate_serializer_compatibility ─────────────────────────────────────────
-- Verifies that a given serializer_key exists, is replay-compatible,
-- deterministic, and compatible with the requested context (chronology/evidence/trust).

CREATE OR REPLACE FUNCTION validate_serializer_compatibility(
  p_serializer_key text,
  p_check_chronology boolean DEFAULT true,
  p_check_evidence   boolean DEFAULT true,
  p_check_trust      boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg canonical_serializer_registry%ROWTYPE;
BEGIN
  SELECT * INTO v_reg FROM canonical_serializer_registry WHERE serializer_key = p_serializer_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_compatible', false,
      'error', 'Serializer not registered: ' || p_serializer_key
    );
  END IF;

  IF NOT v_reg.replay_compatible THEN
    RETURN jsonb_build_object(
      'is_compatible', false,
      'serializer_key', p_serializer_key,
      'error', 'Serializer is not replay-compatible'
    );
  END IF;

  IF NOT v_reg.deterministic THEN
    RETURN jsonb_build_object(
      'is_compatible', false,
      'serializer_key', p_serializer_key,
      'error', 'Serializer is not deterministic'
    );
  END IF;

  IF p_check_chronology AND NOT v_reg.chronology_compatible THEN
    RETURN jsonb_build_object(
      'is_compatible', false,
      'serializer_key', p_serializer_key,
      'error', 'Serializer is not chronology-compatible'
    );
  END IF;

  IF p_check_evidence AND NOT v_reg.evidence_compatible THEN
    RETURN jsonb_build_object(
      'is_compatible', false,
      'serializer_key', p_serializer_key,
      'error', 'Serializer is not evidence-compatible'
    );
  END IF;

  IF p_check_trust AND NOT v_reg.trust_reconstruction_compatible THEN
    RETURN jsonb_build_object(
      'is_compatible', false,
      'serializer_key', p_serializer_key,
      'error', 'Serializer is not trust-reconstruction-compatible'
    );
  END IF;

  RETURN jsonb_build_object(
    'is_compatible',            true,
    'serializer_key',           v_reg.serializer_key,
    'serializer_version',       v_reg.serializer_version,
    'canonicalization_strategy', v_reg.canonicalization_strategy,
    'schema_hash',              v_reg.schema_hash,
    'introduced_phase',         v_reg.introduced_phase,
    'deprecated_phase',         v_reg.deprecated_phase,
    'replay_notes',             v_reg.replay_notes
  );
END;
$$;

-- ── reconstruct_serializer_version ────────────────────────────────────────────
-- Re-derives schema_hash for a given serializer_key + version + strategy combination.
-- Used in replay validation to confirm the serializer profile hasn't changed.

CREATE OR REPLACE FUNCTION reconstruct_serializer_version(
  p_serializer_key            text,
  p_serializer_version        text,
  p_canonicalization_strategy text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg           canonical_serializer_registry%ROWTYPE;
  v_derived_hash  text;
  v_hash_matches  boolean;
BEGIN
  v_derived_hash := encode(sha256((
    COALESCE(p_serializer_key, '') || '|' ||
    COALESCE(p_serializer_version, '') || '|' ||
    COALESCE(p_canonicalization_strategy, '')
  )::bytea), 'hex');

  SELECT * INTO v_reg FROM canonical_serializer_registry WHERE serializer_key = p_serializer_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_valid',          false,
      'serializer_key',    p_serializer_key,
      'derived_schema_hash', v_derived_hash,
      'error', 'Serializer not registered'
    );
  END IF;

  v_hash_matches := (v_derived_hash = v_reg.schema_hash)
    AND (p_serializer_version = v_reg.serializer_version)
    AND (p_canonicalization_strategy = v_reg.canonicalization_strategy);

  RETURN jsonb_build_object(
    'is_valid',                   v_hash_matches,
    'serializer_key',             p_serializer_key,
    'derived_schema_hash',        v_derived_hash,
    'stored_schema_hash',         v_reg.schema_hash,
    'hash_match',                 v_derived_hash = v_reg.schema_hash,
    'version_match',              p_serializer_version = v_reg.serializer_version,
    'strategy_match',             p_canonicalization_strategy = v_reg.canonicalization_strategy,
    'introduced_phase',           v_reg.introduced_phase
  );
END;
$$;

-- ── verify_serializer_replay_compatibility ────────────────────────────────────
-- Full replay compatibility check: schema_hash re-derivation + all compatibility flags.
-- Used by generate_temporal_replay_certificate to confirm serializer stability.

CREATE OR REPLACE FUNCTION verify_serializer_replay_compatibility(p_serializer_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg           canonical_serializer_registry%ROWTYPE;
  v_recheck_hash  text;
  v_hash_valid    boolean;
BEGIN
  SELECT * INTO v_reg FROM canonical_serializer_registry WHERE serializer_key = p_serializer_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_replay_safe', false,
      'error', 'Serializer not registered: ' || COALESCE(p_serializer_key, '(null)')
    );
  END IF;

  v_recheck_hash := encode(sha256((
    v_reg.serializer_key || '|' ||
    v_reg.serializer_version || '|' ||
    v_reg.canonicalization_strategy
  )::bytea), 'hex');

  v_hash_valid := (v_recheck_hash = v_reg.schema_hash);

  RETURN jsonb_build_object(
    'is_replay_safe',               v_hash_valid AND v_reg.replay_compatible AND v_reg.deterministic,
    'serializer_key',               v_reg.serializer_key,
    'schema_hash_valid',            v_hash_valid,
    'replay_compatible',            v_reg.replay_compatible,
    'deterministic',                v_reg.deterministic,
    'chronology_compatible',        v_reg.chronology_compatible,
    'evidence_compatible',          v_reg.evidence_compatible,
    'trust_reconstruction_compatible', v_reg.trust_reconstruction_compatible,
    'deprecated_phase',             v_reg.deprecated_phase,
    'serializer_version',           v_reg.serializer_version,
    'introduced_phase',             v_reg.introduced_phase
  );
END;
$$;

GRANT EXECUTE ON FUNCTION register_serializer_profile               TO service_role;
GRANT EXECUTE ON FUNCTION validate_serializer_compatibility          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reconstruct_serializer_version             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION verify_serializer_replay_compatibility     TO authenticated, service_role;

-- ── Seed: Canonical Serializer Registry ──────────────────────────────────────
-- Backfill all temporal evidence and PKI serializer profiles used by Phase 5E + 5F.

SELECT register_serializer_profile(
  p_serializer_key                  := 'temporal_evidence_v1',
  p_serializer_version              := '5F.1',
  p_canonicalization_strategy       := 'canonical_jsonb_7field',
  p_introduced_phase                := '5F',
  p_replay_compatible               := true,
  p_deterministic                   := true,
  p_chronology_compatible           := true,
  p_evidence_compatible             := true,
  p_trust_reconstruction_compatible := true,
  p_replay_notes                    := 'entity_id + entity_type + timestamp_value + authority_id + payload_hash + signature_payload_hash + evidence_version=5F.1'
);

SELECT register_serializer_profile(
  p_serializer_key                  := 'temporal_chain_hash_v1',
  p_serializer_version              := '5F.1',
  p_canonicalization_strategy       := 'recursive_sha256_temporal_genesis',
  p_introduced_phase                := '5F',
  p_replay_compatible               := true,
  p_deterministic                   := true,
  p_chronology_compatible           := true,
  p_evidence_compatible             := true,
  p_trust_reconstruction_compatible := true,
  p_replay_notes                    := 'generate_temporal_chain_hash — temporal-genesis seed; order-sensitive; cardinality-aware'
);

SELECT register_serializer_profile(
  p_serializer_key                  := 'pki_trust_anchor_v1',
  p_serializer_version              := '5E.1',
  p_canonicalization_strategy       := 'canonical_jsonb_5field',
  p_introduced_phase                := '5E',
  p_replay_compatible               := true,
  p_deterministic                   := true,
  p_chronology_compatible           := false,
  p_evidence_compatible             := false,
  p_trust_reconstruction_compatible := true,
  p_replay_notes                    := 'anchor_id + common_name + organization + jurisdiction + anchor_fingerprint; pki-root seed'
);

SELECT register_serializer_profile(
  p_serializer_key                  := 'nonrepudiation_hash_v1',
  p_serializer_version              := '5E.1',
  p_canonicalization_strategy       := 'sha256_pipe_concat_3field',
  p_introduced_phase                := '5E',
  p_replay_compatible               := true,
  p_deterministic                   := true,
  p_chronology_compatible           := false,
  p_evidence_compatible             := true,
  p_trust_reconstruction_compatible := false,
  p_replay_notes                    := 'entity_id || | || payload_hash || | || signature_value; IMMUTABLE generate_nonrepudiation_hash'
);
