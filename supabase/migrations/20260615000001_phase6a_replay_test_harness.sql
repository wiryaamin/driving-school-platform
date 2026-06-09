-- Phase 6A: Platform Stabilization, Deterministic Replay Harness & Operational Resilience
-- Migration 1: Replay Test Harness Infrastructure

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'replay_test_executed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── replay_test_runs ──────────────────────────────────────────────────────────
-- Mutable: tracks each harness execution; updated on completion.

CREATE TABLE IF NOT EXISTS replay_test_runs (
  id              uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type     filing_entity_type NOT NULL,
  entity_id       uuid               NOT NULL,
  test_type       text               NOT NULL DEFAULT 'full_chronology',
  run_status      text               NOT NULL DEFAULT 'running'
                    CHECK (run_status IN ('running', 'completed', 'failed')),
  test_count      integer            NOT NULL DEFAULT 0,
  passed_count    integer            NOT NULL DEFAULT 0,
  failed_count    integer            NOT NULL DEFAULT 0,
  run_hash        text,
  actor_id        uuid,
  started_at      timestamptz        NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  metadata        jsonb              NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_replay_test_runs_org_entity ON replay_test_runs (organization_id, entity_id);
CREATE INDEX idx_brin_replay_test_runs_started ON replay_test_runs
  USING brin (started_at) WITH (pages_per_range = 128);

ALTER TABLE replay_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_test_runs_select ON replay_test_runs
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY replay_test_runs_service ON replay_test_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── replay_test_results ───────────────────────────────────────────────────────
-- Append-only: one record per test check per run; immutable once written.

CREATE TABLE IF NOT EXISTS replay_test_results (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid        NOT NULL REFERENCES replay_test_runs(id) ON DELETE RESTRICT,
  test_name           text        NOT NULL,
  test_passed         boolean     NOT NULL,
  expected_hash       text,
  actual_hash         text,
  divergence_detected boolean     NOT NULL DEFAULT false,
  result_details      jsonb       NOT NULL DEFAULT '{}',
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rtr_expected_len CHECK (expected_hash IS NULL OR length(expected_hash) = 64),
  CONSTRAINT chk_rtr_actual_len   CHECK (actual_hash   IS NULL OR length(actual_hash)   = 64)
);

CREATE OR REPLACE FUNCTION restrict_replay_test_result()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_test_results is append-only: % is not permitted', TG_OP;
END;
$$;

CREATE TRIGGER trg_replay_test_results_immutable
  BEFORE UPDATE OR DELETE ON replay_test_results
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_test_result();

CREATE INDEX idx_replay_test_results_run_id ON replay_test_results (run_id);

ALTER TABLE replay_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_test_results_select ON replay_test_results
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM replay_test_runs r
    WHERE r.id = run_id
      AND r.organization_id = (current_setting('app.current_org_id', true))::uuid
  ));
CREATE POLICY replay_test_results_service ON replay_test_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── replay_reproducibility_reports ───────────────────────────────────────────
-- Immutable: comparison result of two harness runs.

CREATE TABLE IF NOT EXISTS replay_reproducibility_reports (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  run_id_1         uuid        NOT NULL REFERENCES replay_test_runs(id),
  run_id_2         uuid        NOT NULL REFERENCES replay_test_runs(id),
  all_hashes_match boolean     NOT NULL,
  divergence_count integer     NOT NULL DEFAULT 0,
  report_hash      text        NOT NULL,
  generated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rrr_report_hash CHECK (length(report_hash) = 64)
);

CREATE OR REPLACE FUNCTION restrict_reproducibility_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_reproducibility_reports is immutable';
END;
$$;

CREATE TRIGGER trg_reproducibility_reports_immutable
  BEFORE UPDATE OR DELETE ON replay_reproducibility_reports
  FOR EACH ROW EXECUTE FUNCTION restrict_reproducibility_report();

ALTER TABLE replay_reproducibility_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reproducibility_reports_select ON replay_reproducibility_reports
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY reproducibility_reports_service ON replay_reproducibility_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── replay_chain_drift_reports ────────────────────────────────────────────────
-- Immutable: records baseline vs current hash comparison; drift detection.

CREATE TABLE IF NOT EXISTS replay_chain_drift_reports (
  id              uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type     filing_entity_type NOT NULL,
  entity_id       uuid               NOT NULL,
  baseline_hash   text               NOT NULL,
  current_hash    text               NOT NULL,
  drift_detected  boolean            NOT NULL,
  report_hash     text               NOT NULL,
  detected_at     timestamptz        NOT NULL DEFAULT now(),
  actor_id        uuid,
  CONSTRAINT chk_rcdr_baseline  CHECK (length(baseline_hash) = 64),
  CONSTRAINT chk_rcdr_current   CHECK (length(current_hash)  = 64),
  CONSTRAINT chk_rcdr_report    CHECK (length(report_hash)   = 64)
);

CREATE OR REPLACE FUNCTION restrict_chain_drift_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_chain_drift_reports is immutable';
END;
$$;

CREATE TRIGGER trg_chain_drift_reports_immutable
  BEFORE UPDATE OR DELETE ON replay_chain_drift_reports
  FOR EACH ROW EXECUTE FUNCTION restrict_chain_drift_report();

ALTER TABLE replay_chain_drift_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY chain_drift_reports_select ON replay_chain_drift_reports
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY chain_drift_reports_service ON replay_chain_drift_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_brin_chain_drift_reports_detected ON replay_chain_drift_reports
  USING brin (detected_at) WITH (pages_per_range = 128);

-- ── run_replay_test ───────────────────────────────────────────────────────────
-- Runs 5 deterministic checks against live temporal infrastructure for an entity.
-- All checks are read-only; results are appended to replay_test_results.

CREATE OR REPLACE FUNCTION run_replay_test(
  p_org_id      uuid,
  p_entity_type filing_entity_type,
  p_entity_id   uuid,
  p_test_type   text DEFAULT 'full_chronology',
  p_actor_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run_id     uuid;
  v_tests_run  integer := 0;
  v_tests_pass integer := 0;
  v_test_name  text;
  v_passed     boolean;
  v_run_hash   text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  INSERT INTO replay_test_runs (organization_id, entity_type, entity_id, test_type, run_status, actor_id)
  VALUES (p_org_id, p_entity_type, p_entity_id, p_test_type, 'running', p_actor_id)
  RETURNING id INTO v_run_id;

  -- Test 1: chronology entries exist for entity
  v_test_name := 'chronology_exists';
  v_passed := EXISTS (
    SELECT 1 FROM chronology_lineage
    WHERE organization_id = p_org_id
      AND entity_type      = p_entity_type
      AND entity_id        = p_entity_id
  );
  v_tests_run := v_tests_run + 1;
  IF v_passed THEN v_tests_pass := v_tests_pass + 1; END IF;
  INSERT INTO replay_test_results (run_id, test_name, test_passed)
  VALUES (v_run_id, v_test_name, v_passed);

  -- Test 2: sequence numbers are strictly monotonically increasing (no gaps)
  v_test_name := 'chronology_sequence_monotonic';
  v_passed := NOT EXISTS (
    SELECT 1 FROM (
      SELECT sequence_number,
             LAG(sequence_number) OVER (ORDER BY sequence_number) AS prev_seq
      FROM chronology_lineage
      WHERE organization_id = p_org_id
        AND entity_type      = p_entity_type
        AND entity_id        = p_entity_id
    ) seq_check
    WHERE prev_seq IS NOT NULL AND sequence_number <> prev_seq + 1
  );
  v_tests_run := v_tests_run + 1;
  IF v_passed THEN v_tests_pass := v_tests_pass + 1; END IF;
  INSERT INTO replay_test_results (run_id, test_name, test_passed, divergence_detected)
  VALUES (v_run_id, v_test_name, v_passed, NOT v_passed);

  -- Test 3: all temporal_evidence_records for org have 64-char evidence_hash
  v_test_name := 'evidence_hash_integrity';
  v_passed := NOT EXISTS (
    SELECT 1 FROM temporal_evidence_records
    WHERE organization_id = p_org_id
      AND (evidence_hash IS NULL OR length(evidence_hash) <> 64)
  );
  v_tests_run := v_tests_run + 1;
  IF v_passed THEN v_tests_pass := v_tests_pass + 1; END IF;
  INSERT INTO replay_test_results (run_id, test_name, test_passed)
  VALUES (v_run_id, v_test_name, v_passed);

  -- Test 4: no duplicate evidence_hash values in org scope
  v_test_name := 'evidence_hash_uniqueness';
  v_passed := NOT EXISTS (
    SELECT evidence_hash FROM temporal_evidence_records
    WHERE organization_id = p_org_id
    GROUP BY evidence_hash
    HAVING COUNT(*) > 1
  );
  v_tests_run := v_tests_run + 1;
  IF v_passed THEN v_tests_pass := v_tests_pass + 1; END IF;
  INSERT INTO replay_test_results (run_id, test_name, test_passed, divergence_detected)
  VALUES (v_run_id, v_test_name, v_passed, NOT v_passed);

  -- Test 5: at least one replay-compatible, deterministic serializer profile is registered
  v_test_name := 'serializer_registry_populated';
  v_passed := EXISTS (
    SELECT 1 FROM canonical_serializer_registry
    WHERE replay_compatible = true AND deterministic = true
  );
  v_tests_run := v_tests_run + 1;
  IF v_passed THEN v_tests_pass := v_tests_pass + 1; END IF;
  INSERT INTO replay_test_results (run_id, test_name, test_passed)
  VALUES (v_run_id, v_test_name, v_passed);

  v_run_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || canonical_uuid(p_entity_id) || '|' ||
     canonical_text(p_test_type) || '|' || v_tests_run::text || '|' || v_tests_pass::text)::bytea
  ), 'hex');

  UPDATE replay_test_runs SET
    run_status   = CASE WHEN v_tests_pass = v_tests_run THEN 'completed' ELSE 'failed' END,
    test_count   = v_tests_run,
    passed_count = v_tests_pass,
    failed_count = v_tests_run - v_tests_pass,
    run_hash     = v_run_hash,
    completed_at = now()
  WHERE id = v_run_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'replay_test_executed', p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object('run_id', v_run_id, 'test_type', p_test_type,
                       'tests_run', v_tests_run, 'tests_passed', v_tests_pass, 'run_hash', v_run_hash));

  RETURN jsonb_build_object(
    'run_id', v_run_id, 'test_type', p_test_type,
    'tests_run', v_tests_run, 'tests_passed', v_tests_pass,
    'tests_failed', v_tests_run - v_tests_pass,
    'all_passed', v_tests_pass = v_tests_run, 'run_hash', v_run_hash
  );
END;
$$;

-- ── run_full_replay_reconstruction ───────────────────────────────────────────
-- Executes generate_temporal_replay_certificate and records the result in harness tables.

CREATE OR REPLACE FUNCTION run_full_replay_reconstruction(
  p_org_id       uuid,
  p_entity_type  filing_entity_type,
  p_entity_id    uuid,
  p_at_timestamp timestamptz,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run_id   uuid;
  v_cert     jsonb;
  v_run_hash text;
  v_passed   boolean;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  INSERT INTO replay_test_runs (organization_id, entity_type, entity_id, test_type, run_status, actor_id)
  VALUES (p_org_id, p_entity_type, p_entity_id, 'full_reconstruction', 'running', p_actor_id)
  RETURNING id INTO v_run_id;

  v_cert   := generate_temporal_replay_certificate(p_org_id, p_entity_type, p_entity_id, p_at_timestamp, p_actor_id);
  v_passed := (v_cert->>'is_valid')::boolean;

  INSERT INTO replay_test_results (run_id, test_name, test_passed, actual_hash, divergence_detected, result_details)
  VALUES (v_run_id, 'temporal_replay_certificate', v_passed,
          v_cert->>'certificate_hash', NOT v_passed, v_cert);

  v_run_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || canonical_uuid(p_entity_id) || '|' ||
     canonical_text(p_at_timestamp::text) || '|' || COALESCE(v_cert->>'certificate_hash', ''))::bytea
  ), 'hex');

  UPDATE replay_test_runs SET
    run_status   = CASE WHEN v_passed THEN 'completed' ELSE 'failed' END,
    test_count   = 1,
    passed_count = CASE WHEN v_passed THEN 1 ELSE 0 END,
    failed_count = CASE WHEN v_passed THEN 0 ELSE 1 END,
    run_hash     = v_run_hash,
    completed_at = now()
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id, 'is_valid', v_passed,
    'certificate_hash', v_cert->>'certificate_hash',
    'run_hash', v_run_hash, 'cert_result', v_cert
  );
END;
$$;

-- ── validate_replay_determinism ───────────────────────────────────────────────
-- Runs generate_temporal_replay_certificate p_iterations times and verifies
-- all resulting certificate_hashes are identical (deterministic replay guarantee).

CREATE OR REPLACE FUNCTION validate_replay_determinism(
  p_org_id       uuid,
  p_entity_type  filing_entity_type,
  p_entity_id    uuid,
  p_at_timestamp timestamptz,
  p_iterations   integer DEFAULT 2,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cert       jsonb;
  v_first_hash text;
  v_curr_hash  text;
  v_all_match  boolean := true;
  v_i          integer;
  v_iters      integer := LEAST(GREATEST(COALESCE(p_iterations, 2), 2), 5);
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  FOR v_i IN 1..v_iters LOOP
    v_cert      := generate_temporal_replay_certificate(p_org_id, p_entity_type, p_entity_id, p_at_timestamp, p_actor_id);
    v_curr_hash := v_cert->>'certificate_hash';
    IF v_i = 1 THEN
      v_first_hash := v_curr_hash;
    ELSIF v_curr_hash IS DISTINCT FROM v_first_hash THEN
      v_all_match := false;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'determinism_verified', v_all_match,
    'iterations',           v_iters,
    'certificate_hash',     v_first_hash,
    'all_identical',        v_all_match
  );
END;
$$;

-- ── compare_replay_runs ───────────────────────────────────────────────────────
-- Compares run-level and per-test results between two harness runs.

CREATE OR REPLACE FUNCTION compare_replay_runs(
  p_run_id_1 uuid,
  p_run_id_2 uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run1       replay_test_runs%ROWTYPE;
  v_run2       replay_test_runs%ROWTYPE;
  v_divergences integer := 0;
  v_test_name   text;
  v_r1_passed   boolean;
  v_r2_passed   boolean;
  v_detail      jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_run1 FROM replay_test_runs WHERE id = p_run_id_1;
  SELECT * INTO v_run2 FROM replay_test_runs WHERE id = p_run_id_2;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'One or both replay run IDs not found';
  END IF;

  IF v_run1.run_hash IS DISTINCT FROM v_run2.run_hash THEN
    v_divergences := v_divergences + 1;
    v_detail := v_detail || jsonb_build_object('field', 'run_hash', 'run_1', v_run1.run_hash, 'run_2', v_run2.run_hash);
  END IF;

  IF v_run1.passed_count IS DISTINCT FROM v_run2.passed_count THEN
    v_divergences := v_divergences + 1;
    v_detail := v_detail || jsonb_build_object('field', 'passed_count', 'run_1', v_run1.passed_count, 'run_2', v_run2.passed_count);
  END IF;

  FOR v_test_name IN
    SELECT DISTINCT test_name FROM replay_test_results
    WHERE run_id IN (p_run_id_1, p_run_id_2)
  LOOP
    SELECT test_passed INTO v_r1_passed FROM replay_test_results WHERE run_id = p_run_id_1 AND test_name = v_test_name LIMIT 1;
    SELECT test_passed INTO v_r2_passed FROM replay_test_results WHERE run_id = p_run_id_2 AND test_name = v_test_name LIMIT 1;
    IF v_r1_passed IS DISTINCT FROM v_r2_passed THEN
      v_divergences := v_divergences + 1;
      v_detail := v_detail || jsonb_build_object('test', v_test_name,
        'run_1_passed', v_r1_passed, 'run_2_passed', v_r2_passed);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'all_hashes_match', v_divergences = 0,
    'divergence_count', v_divergences,
    'run_1_hash',       v_run1.run_hash,
    'run_2_hash',       v_run2.run_hash,
    'detail',           v_detail
  );
END;
$$;

-- ── generate_replay_reproducibility_report ────────────────────────────────────
-- Compares two harness runs and stores an immutable reproducibility report.

CREATE OR REPLACE FUNCTION generate_replay_reproducibility_report(
  p_org_id   uuid,
  p_run_id_1 uuid,
  p_run_id_2 uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_comparison  jsonb;
  v_run1        replay_test_runs%ROWTYPE;
  v_run2        replay_test_runs%ROWTYPE;
  v_report_hash text;
  v_new_id      uuid;
  v_all_match   boolean;
  v_div_count   integer;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_comparison := compare_replay_runs(p_run_id_1, p_run_id_2);
  v_all_match  := (v_comparison->>'all_hashes_match')::boolean;
  v_div_count  := (v_comparison->>'divergence_count')::integer;

  SELECT * INTO v_run1 FROM replay_test_runs WHERE id = p_run_id_1;
  SELECT * INTO v_run2 FROM replay_test_runs WHERE id = p_run_id_2;

  v_report_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || p_run_id_1::text || '|' || p_run_id_2::text || '|' ||
     COALESCE(v_run1.run_hash, '') || '|' || COALESCE(v_run2.run_hash, '') || '|' || v_all_match::text)::bytea
  ), 'hex');

  INSERT INTO replay_reproducibility_reports
    (organization_id, run_id_1, run_id_2, all_hashes_match, divergence_count, report_hash)
  VALUES (p_org_id, p_run_id_1, p_run_id_2, v_all_match, v_div_count, v_report_hash)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'report_id', v_new_id, 'all_hashes_match', v_all_match,
    'divergence_count', v_div_count, 'report_hash', v_report_hash,
    'comparison', v_comparison
  );
END;
$$;

GRANT EXECUTE ON FUNCTION run_replay_test                        TO service_role;
GRANT EXECUTE ON FUNCTION run_full_replay_reconstruction         TO service_role;
GRANT EXECUTE ON FUNCTION validate_replay_determinism            TO service_role;
GRANT EXECUTE ON FUNCTION compare_replay_runs                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION generate_replay_reproducibility_report TO service_role;
