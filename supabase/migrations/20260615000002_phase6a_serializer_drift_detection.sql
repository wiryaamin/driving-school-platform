-- Phase 6A: Platform Stabilization
-- Migration 2: Serializer Drift Detection — schema hash drift, version evolution, compatibility matrix

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'serializer_drift_detected';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── serializer_drift_reports ──────────────────────────────────────────────────
-- Immutable: one record per drift detection event; baseline vs recomputed hash.

CREATE TABLE IF NOT EXISTS serializer_drift_reports (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  serializer_key       text        NOT NULL,
  baseline_schema_hash text        NOT NULL,
  current_schema_hash  text        NOT NULL,
  drift_detected       boolean     NOT NULL,
  drift_type           text        NOT NULL DEFAULT 'none'
                         CHECK (drift_type IN ('hash_mismatch', 'version_mismatch', 'strategy_mismatch', 'none')),
  report_hash          text        NOT NULL,
  detected_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_sdr_baseline   CHECK (length(baseline_schema_hash) = 64),
  CONSTRAINT chk_sdr_current    CHECK (length(current_schema_hash)  = 64),
  CONSTRAINT chk_sdr_report     CHECK (length(report_hash)          = 64)
);

CREATE OR REPLACE FUNCTION restrict_serializer_drift_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'serializer_drift_reports is immutable';
END;
$$;

CREATE TRIGGER trg_serializer_drift_reports_immutable
  BEFORE UPDATE OR DELETE ON serializer_drift_reports
  FOR EACH ROW EXECUTE FUNCTION restrict_serializer_drift_report();

CREATE INDEX idx_serializer_drift_reports_key ON serializer_drift_reports (serializer_key);
CREATE INDEX idx_brin_serializer_drift_detected ON serializer_drift_reports
  USING brin (detected_at) WITH (pages_per_range = 128);

-- ── replay_schema_evolution ───────────────────────────────────────────────────
-- Append-only: records each registered serializer version transition.

CREATE TABLE IF NOT EXISTS replay_schema_evolution (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  serializer_key        text        NOT NULL,
  from_version          text        NOT NULL,
  to_version            text        NOT NULL,
  from_schema_hash      text        NOT NULL,
  to_schema_hash        text        NOT NULL,
  backward_compatible   boolean     NOT NULL DEFAULT true,
  chronology_compatible boolean     NOT NULL DEFAULT true,
  breaking_change       boolean     NOT NULL DEFAULT false,
  evolution_hash        text        NOT NULL,
  registered_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rse_from_hash CHECK (length(from_schema_hash) = 64),
  CONSTRAINT chk_rse_to_hash   CHECK (length(to_schema_hash)   = 64),
  CONSTRAINT chk_rse_evo_hash  CHECK (length(evolution_hash)   = 64)
);

CREATE OR REPLACE FUNCTION restrict_replay_schema_evolution()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_schema_evolution is append-only: % is not permitted', TG_OP;
END;
$$;

CREATE TRIGGER trg_replay_schema_evolution_immutable
  BEFORE UPDATE OR DELETE ON replay_schema_evolution
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_schema_evolution();

CREATE INDEX idx_replay_schema_evolution_key ON replay_schema_evolution (serializer_key);

-- ── serializer_compatibility_matrix ──────────────────────────────────────────
-- Mutable: compatibility relationship between pairs of serializers.

CREATE TABLE IF NOT EXISTS serializer_compatibility_matrix (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  serializer_key_a     text        NOT NULL,
  serializer_key_b     text        NOT NULL,
  compatible           boolean     NOT NULL DEFAULT false,
  compatibility_reason text,
  matrix_hash          text        NOT NULL,
  checked_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_scm_matrix_hash CHECK (length(matrix_hash) = 64),
  UNIQUE (serializer_key_a, serializer_key_b)
);

CREATE INDEX idx_serializer_compat_matrix_keys ON serializer_compatibility_matrix (serializer_key_a, serializer_key_b);

-- ── detect_serializer_drift ───────────────────────────────────────────────────
-- Re-derives schema_hash from canonical_serializer_registry fields; detects mismatch.

CREATE OR REPLACE FUNCTION detect_serializer_drift(p_serializer_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg     canonical_serializer_registry%ROWTYPE;
  v_derived text;
  v_drift   boolean;
  v_type    text := 'none';
BEGIN
  SELECT * INTO v_reg FROM canonical_serializer_registry WHERE serializer_key = p_serializer_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serializer not found: %', p_serializer_key;
  END IF;

  -- Re-derive using the same formula as register_serializer_profile
  v_derived := encode(sha256(
    (v_reg.serializer_key || '|' || v_reg.serializer_version || '|' ||
     v_reg.canonicalization_strategy)::bytea
  ), 'hex');

  v_drift := v_derived <> v_reg.schema_hash;
  IF v_drift THEN v_type := 'hash_mismatch'; END IF;

  RETURN jsonb_build_object(
    'serializer_key',     p_serializer_key,
    'drift_detected',     v_drift,
    'drift_type',         v_type,
    'stored_hash',        v_reg.schema_hash,
    'recomputed_hash',    v_derived,
    'hashes_match',       NOT v_drift,
    'serializer_version', v_reg.serializer_version,
    'strategy',           v_reg.canonicalization_strategy
  );
END;
$$;

-- ── verify_schema_hash_integrity ─────────────────────────────────────────────
-- Checks all registered serializer schema_hashes in one pass.

CREATE OR REPLACE FUNCTION verify_schema_hash_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg     canonical_serializer_registry%ROWTYPE;
  v_derived text;
  v_total   integer := 0;
  v_drifted integer := 0;
  v_detail  jsonb := '[]'::jsonb;
BEGIN
  FOR v_reg IN SELECT * FROM canonical_serializer_registry ORDER BY serializer_key LOOP
    v_total   := v_total + 1;
    v_derived := encode(sha256(
      (v_reg.serializer_key || '|' || v_reg.serializer_version || '|' ||
       v_reg.canonicalization_strategy)::bytea
    ), 'hex');
    IF v_derived <> v_reg.schema_hash THEN
      v_drifted := v_drifted + 1;
      v_detail := v_detail || jsonb_build_object(
        'serializer_key', v_reg.serializer_key,
        'stored',         v_reg.schema_hash,
        'recomputed',     v_derived
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'all_intact',    v_drifted = 0,
    'total_checked', v_total,
    'drifted_count', v_drifted,
    'drift_detail',  v_detail
  );
END;
$$;

-- ── compare_serializer_versions ───────────────────────────────────────────────
-- Computes schema_hashes for two versions of the same serializer and compares them.

CREATE OR REPLACE FUNCTION compare_serializer_versions(
  p_serializer_key text,
  p_from_version   text,
  p_to_version     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg       canonical_serializer_registry%ROWTYPE;
  v_strategy  text;
  v_from_hash text;
  v_to_hash   text;
BEGIN
  SELECT * INTO v_reg FROM canonical_serializer_registry WHERE serializer_key = p_serializer_key;
  v_strategy := COALESCE(v_reg.canonicalization_strategy, 'canonical_jsonb');

  v_from_hash := encode(sha256((p_serializer_key || '|' || p_from_version || '|' || v_strategy)::bytea), 'hex');
  v_to_hash   := encode(sha256((p_serializer_key || '|' || p_to_version   || '|' || v_strategy)::bytea), 'hex');

  RETURN jsonb_build_object(
    'serializer_key', p_serializer_key,
    'from_version',   p_from_version,
    'to_version',     p_to_version,
    'from_hash',      v_from_hash,
    'to_hash',        v_to_hash,
    'hashes_differ',  v_from_hash <> v_to_hash,
    'strategy',       v_strategy
  );
END;
$$;

-- ── validate_replay_schema_evolution ─────────────────────────────────────────
-- Records a version evolution entry; validates backward compatibility claim.

CREATE OR REPLACE FUNCTION validate_replay_schema_evolution(
  p_serializer_key      text,
  p_from_version        text,
  p_to_version          text,
  p_backward_compatible boolean DEFAULT true,
  p_breaking_change     boolean DEFAULT false,
  p_actor_id            uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg        canonical_serializer_registry%ROWTYPE;
  v_strategy   text;
  v_from_hash  text;
  v_to_hash    text;
  v_evo_hash   text;
  v_new_id     uuid;
BEGIN
  SELECT * INTO v_reg FROM canonical_serializer_registry WHERE serializer_key = p_serializer_key;
  v_strategy := COALESCE(v_reg.canonicalization_strategy, 'canonical_jsonb');

  v_from_hash := encode(sha256((p_serializer_key || '|' || p_from_version || '|' || v_strategy)::bytea), 'hex');
  v_to_hash   := encode(sha256((p_serializer_key || '|' || p_to_version   || '|' || v_strategy)::bytea), 'hex');

  -- evolution_hash commits to the full transition identity
  v_evo_hash := encode(sha256(
    (p_serializer_key || '|' || p_from_version || '|' || p_to_version || '|' ||
     v_from_hash || '|' || v_to_hash || '|' || COALESCE(p_backward_compatible, true)::text)::bytea
  ), 'hex');

  INSERT INTO replay_schema_evolution (
    serializer_key, from_version, to_version,
    from_schema_hash, to_schema_hash,
    backward_compatible, chronology_compatible, breaking_change, evolution_hash
  ) VALUES (
    p_serializer_key, p_from_version, p_to_version,
    v_from_hash, v_to_hash,
    COALESCE(p_backward_compatible, true),
    COALESCE(p_backward_compatible, true),
    COALESCE(p_breaking_change, false),
    v_evo_hash
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'evolution_id',        v_new_id,
    'serializer_key',      p_serializer_key,
    'from_version',        p_from_version,
    'to_version',          p_to_version,
    'from_hash',           v_from_hash,
    'to_hash',             v_to_hash,
    'evolution_hash',      v_evo_hash,
    'backward_compatible', COALESCE(p_backward_compatible, true),
    'breaking_change',     COALESCE(p_breaking_change, false)
  );
END;
$$;

-- ── generate_serializer_drift_report ─────────────────────────────────────────
-- Runs drift detection and stores an immutable drift report; emits compliance event on drift.

CREATE OR REPLACE FUNCTION generate_serializer_drift_report(
  p_org_id         uuid,
  p_serializer_key text,
  p_actor_id       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_drift_result   jsonb;
  v_reg            canonical_serializer_registry%ROWTYPE;
  v_report_hash    text;
  v_new_id         uuid;
  v_drift_detected boolean;
  v_drift_type     text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_drift_result   := detect_serializer_drift(p_serializer_key);
  v_drift_detected := (v_drift_result->>'drift_detected')::boolean;
  v_drift_type     := CASE WHEN v_drift_detected THEN 'hash_mismatch' ELSE 'none' END;

  SELECT * INTO v_reg FROM canonical_serializer_registry WHERE serializer_key = p_serializer_key;

  v_report_hash := encode(sha256(
    (p_serializer_key || '|' || COALESCE(v_reg.schema_hash, repeat('0', 64)) || '|' ||
     COALESCE(v_drift_result->>'recomputed_hash', repeat('0', 64)) || '|' || v_drift_detected::text)::bytea
  ), 'hex');

  INSERT INTO serializer_drift_reports (
    serializer_key, baseline_schema_hash, current_schema_hash,
    drift_detected, drift_type, report_hash
  ) VALUES (
    p_serializer_key,
    COALESCE(v_reg.schema_hash,                       repeat('0', 64)),
    COALESCE(v_drift_result->>'recomputed_hash',       repeat('0', 64)),
    v_drift_detected, v_drift_type, v_report_hash
  ) RETURNING id INTO v_new_id;

  IF v_drift_detected THEN
    INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
    VALUES (
      COALESCE(p_org_id, '00000000-0000-0000-0000-000000000000'),
      'serializer_drift_detected', 'regulatory_audit_export', v_new_id, p_actor_id,
      jsonb_build_object('serializer_key', p_serializer_key, 'report_hash', v_report_hash, 'drift_type', v_drift_type)
    );
  END IF;

  RETURN jsonb_build_object(
    'report_id',      v_new_id,
    'serializer_key', p_serializer_key,
    'drift_detected', v_drift_detected,
    'drift_type',     v_drift_type,
    'report_hash',    v_report_hash,
    'drift_detail',   v_drift_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION detect_serializer_drift          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION verify_schema_hash_integrity     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION compare_serializer_versions      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION validate_replay_schema_evolution TO service_role;
GRANT EXECUTE ON FUNCTION generate_serializer_drift_report TO service_role;
