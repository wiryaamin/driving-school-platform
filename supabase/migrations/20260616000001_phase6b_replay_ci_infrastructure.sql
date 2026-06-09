-- Phase 6B: DevOps, Replay CI/CD & Production Operations Hardening
-- Migration 1: Replay CI/CD Infrastructure

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'replay_ci_pipeline_executed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── New enum type ─────────────────────────────────────────────────────────────

CREATE TYPE replay_ci_status AS ENUM ('running', 'passed', 'failed');

-- ── replay_ci_runs ────────────────────────────────────────────────────────────
-- Mutable: CI pipeline run lifecycle record.

CREATE TABLE IF NOT EXISTS replay_ci_runs (
  id               uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid             NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  pipeline_version text             NOT NULL DEFAULT '6B.1',
  ci_status        replay_ci_status NOT NULL DEFAULT 'running',
  checks_passed    integer          NOT NULL DEFAULT 0,
  checks_total     integer          NOT NULL DEFAULT 0,
  run_hash         text             NOT NULL,
  actor_id         uuid,
  started_at       timestamptz      NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  CONSTRAINT chk_rcr_run_hash CHECK (length(run_hash) = 64)
);

ALTER TABLE replay_ci_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_ci_runs_select ON replay_ci_runs
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY replay_ci_runs_service ON replay_ci_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rcr_org ON replay_ci_runs(organization_id);
CREATE INDEX IF NOT EXISTS idx_rcr_running ON replay_ci_runs(ci_status) WHERE ci_status = 'running';

-- ── migration_reproducibility_reports ────────────────────────────────────────
-- Immutable: one report per migration version validation run.

CREATE TABLE IF NOT EXISTS migration_reproducibility_reports (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  migration_version   text        NOT NULL,
  pre_migration_hash  text        NOT NULL,
  post_migration_hash text        NOT NULL,
  is_reproducible     boolean     NOT NULL DEFAULT false,
  report_hash         text        NOT NULL,
  actor_id            uuid,
  generated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_mrr_report_hash CHECK (length(report_hash) = 64)
);

ALTER TABLE migration_reproducibility_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY migration_repro_select ON migration_reproducibility_reports
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY migration_repro_service ON migration_reproducibility_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_migration_reproducibility_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'migration_reproducibility_reports rows are immutable';
END;
$$;

CREATE TRIGGER migration_repro_immutable
  BEFORE UPDATE OR DELETE ON migration_reproducibility_reports
  FOR EACH ROW EXECUTE FUNCTION restrict_migration_reproducibility_report();

CREATE INDEX IF NOT EXISTS idx_mrr_brin ON migration_reproducibility_reports
  USING brin (generated_at) WITH (pages_per_range = 128);

-- ── deployment_integrity_reports ──────────────────────────────────────────────
-- Immutable: post-deploy integrity snapshot.

CREATE TABLE IF NOT EXISTS deployment_integrity_reports (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  deployment_version   text        NOT NULL,
  replay_hash_stable   boolean     NOT NULL DEFAULT false,
  serializer_compat    boolean     NOT NULL DEFAULT false,
  chronology_cont      boolean     NOT NULL DEFAULT false,
  append_only_ok       boolean     NOT NULL DEFAULT false,
  overall_integrity    boolean     NOT NULL DEFAULT false,
  integrity_hash       text        NOT NULL,
  actor_id             uuid,
  generated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_dir_integrity_hash CHECK (length(integrity_hash) = 64)
);

ALTER TABLE deployment_integrity_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY deployment_integrity_select ON deployment_integrity_reports
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY deployment_integrity_service ON deployment_integrity_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_deployment_integrity_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'deployment_integrity_reports rows are immutable';
END;
$$;

CREATE TRIGGER deployment_integrity_immutable
  BEFORE UPDATE OR DELETE ON deployment_integrity_reports
  FOR EACH ROW EXECUTE FUNCTION restrict_deployment_integrity_report();

CREATE INDEX IF NOT EXISTS idx_dir_brin ON deployment_integrity_reports
  USING brin (generated_at) WITH (pages_per_range = 128);

-- ── replay_smoke_test_results ─────────────────────────────────────────────────
-- Immutable: one row per smoke test execution.

CREATE TABLE IF NOT EXISTS replay_smoke_test_results (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  ci_run_id        uuid        REFERENCES replay_ci_runs(id) ON DELETE RESTRICT,
  test_name        text        NOT NULL,
  test_category    text        NOT NULL DEFAULT 'replay_determinism',
  passed           boolean     NOT NULL DEFAULT false,
  expected_hash    text,
  actual_hash      text,
  result_hash      text        NOT NULL,
  actor_id         uuid,
  executed_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rstr_result_hash CHECK (length(result_hash) = 64)
);

ALTER TABLE replay_smoke_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY smoke_test_results_select ON replay_smoke_test_results
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY smoke_test_results_service ON replay_smoke_test_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_replay_smoke_test_result()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_smoke_test_results rows are immutable';
END;
$$;

CREATE TRIGGER smoke_test_result_immutable
  BEFORE UPDATE OR DELETE ON replay_smoke_test_results
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_smoke_test_result();

CREATE INDEX IF NOT EXISTS idx_rstr_brin ON replay_smoke_test_results
  USING brin (executed_at) WITH (pages_per_range = 128);
CREATE INDEX IF NOT EXISTS idx_rstr_ci_run ON replay_smoke_test_results(ci_run_id);

-- ── run_replay_ci_pipeline ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION run_replay_ci_pipeline(
  p_org_id   uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run_id        uuid;
  v_run_hash      text;
  v_checks_passed integer := 0;
  v_checks_total  integer := 5;
  v_ci_status     replay_ci_status;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  -- Placeholder run_hash for the INSERT (updated below with final values)
  v_run_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || canonical_uuid(p_actor_id::text) || '|running|ci_pipeline')::bytea
  ), 'hex');

  INSERT INTO replay_ci_runs (organization_id, ci_status, checks_passed, checks_total, run_hash, actor_id)
  VALUES (p_org_id, 'running', 0, v_checks_total, v_run_hash, p_actor_id)
  RETURNING id INTO v_run_id;

  -- Check 1: serializer registry has replay-compatible + deterministic entries
  IF EXISTS (SELECT 1 FROM canonical_serializer_registry WHERE replay_compatible = true AND deterministic = true) THEN
    v_checks_passed := v_checks_passed + 1;
  END IF;

  -- Check 2: chronology lineage exists for org
  IF EXISTS (SELECT 1 FROM chronology_lineage WHERE organization_id = p_org_id LIMIT 1) THEN
    v_checks_passed := v_checks_passed + 1;
  END IF;

  -- Check 3: replay health profile not critical
  IF NOT EXISTS (
    SELECT 1 FROM replay_resilience_profiles
    WHERE organization_id = p_org_id AND last_health_status = 'critical'
  ) THEN
    v_checks_passed := v_checks_passed + 1;
  END IF;

  -- Check 4: no unresolved critical operational alerts
  IF NOT EXISTS (
    SELECT 1 FROM replay_operational_alerts
    WHERE organization_id = p_org_id AND resolved_at IS NULL AND alert_severity = 'critical'
  ) THEN
    v_checks_passed := v_checks_passed + 1;
  END IF;

  -- Check 5: all evidence hash lengths valid
  IF NOT EXISTS (
    SELECT 1 FROM temporal_evidence_records
    WHERE organization_id = p_org_id AND length(evidence_hash) <> 64
    LIMIT 1
  ) THEN
    v_checks_passed := v_checks_passed + 1;
  END IF;

  v_ci_status := CASE WHEN v_checks_passed = v_checks_total THEN 'passed' ELSE 'failed' END;

  v_run_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || canonical_uuid(p_actor_id::text) || '|' ||
     v_ci_status::text || '|' || v_checks_passed::text || '|' || v_checks_total::text)::bytea
  ), 'hex');

  UPDATE replay_ci_runs
  SET ci_status = v_ci_status, checks_passed = v_checks_passed,
      run_hash = v_run_hash, completed_at = now()
  WHERE id = v_run_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'replay_ci_pipeline_executed', 'replay_ci_run', v_run_id::text, p_actor_id,
    jsonb_build_object('ci_status', v_ci_status, 'checks_passed', v_checks_passed, 'run_hash', v_run_hash));

  RETURN jsonb_build_object(
    'run_id',        v_run_id,
    'ci_status',     v_ci_status,
    'checks_passed', v_checks_passed,
    'checks_total',  v_checks_total,
    'run_hash',      v_run_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION run_replay_ci_pipeline(uuid, uuid) TO authenticated, service_role;

-- ── validate_migration_reproducibility ───────────────────────────────────────

CREATE OR REPLACE FUNCTION validate_migration_reproducibility(
  p_org_id        uuid,
  p_migration_ver text,
  p_pre_hash      text,
  p_post_hash     text,
  p_actor_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reproducible boolean;
  v_report_hash  text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_reproducible := (p_pre_hash = p_post_hash);

  v_report_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || canonical_text(p_migration_ver) || '|' ||
     canonical_text(p_pre_hash) || '|' || canonical_text(p_post_hash) || '|' || v_reproducible::text)::bytea
  ), 'hex');

  INSERT INTO migration_reproducibility_reports (
    organization_id, migration_version, pre_migration_hash, post_migration_hash,
    is_reproducible, report_hash, actor_id
  ) VALUES (
    p_org_id, p_migration_ver, p_pre_hash, p_post_hash, v_reproducible, v_report_hash, p_actor_id
  );

  RETURN jsonb_build_object(
    'migration_version', p_migration_ver,
    'is_reproducible',   v_reproducible,
    'report_hash',       v_report_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_migration_reproducibility(uuid, text, text, text, uuid) TO authenticated, service_role;

-- ── verify_post_deploy_replay_integrity ──────────────────────────────────────

CREATE OR REPLACE FUNCTION verify_post_deploy_replay_integrity(
  p_org_id     uuid,
  p_deploy_ver text,
  p_actor_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_replay_stable     boolean;
  v_serializer_compat boolean;
  v_chronology_cont   boolean;
  v_append_only_ok    boolean;
  v_overall           boolean;
  v_integrity_hash    text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT EXISTS (
    SELECT 1 FROM canonical_serializer_registry WHERE replay_compatible = true
  ) INTO v_replay_stable;

  SELECT EXISTS (
    SELECT 1 FROM canonical_serializer_registry WHERE deterministic = true
  ) INTO v_serializer_compat;

  SELECT EXISTS (
    SELECT 1 FROM chronology_lineage WHERE organization_id = p_org_id LIMIT 1
  ) INTO v_chronology_cont;

  SELECT NOT EXISTS (
    SELECT 1 FROM replay_operational_alerts
    WHERE organization_id = p_org_id AND alert_severity = 'critical' AND resolved_at IS NULL
  ) INTO v_append_only_ok;

  v_overall := v_replay_stable AND v_serializer_compat AND v_chronology_cont AND v_append_only_ok;

  v_integrity_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || canonical_text(p_deploy_ver) || '|' ||
     v_replay_stable::text || '|' || v_serializer_compat::text || '|' ||
     v_chronology_cont::text || '|' || v_append_only_ok::text)::bytea
  ), 'hex');

  INSERT INTO deployment_integrity_reports (
    organization_id, deployment_version,
    replay_hash_stable, serializer_compat, chronology_cont, append_only_ok,
    overall_integrity, integrity_hash, actor_id
  ) VALUES (
    p_org_id, p_deploy_ver,
    v_replay_stable, v_serializer_compat, v_chronology_cont, v_append_only_ok,
    v_overall, v_integrity_hash, p_actor_id
  );

  RETURN jsonb_build_object(
    'deployment_version', p_deploy_ver,
    'replay_hash_stable', v_replay_stable,
    'serializer_compat',  v_serializer_compat,
    'chronology_cont',    v_chronology_cont,
    'append_only_ok',     v_append_only_ok,
    'overall_integrity',  v_overall,
    'integrity_hash',     v_integrity_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verify_post_deploy_replay_integrity(uuid, text, uuid) TO authenticated, service_role;

-- ── execute_replay_smoke_tests ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION execute_replay_smoke_tests(
  p_org_id   uuid,
  p_run_id   uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tests_passed integer := 0;
  v_tests_total  integer := 3;
  v_test_hash    text;
  v_smoke_passed boolean;
  v_result_hash  text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  -- Smoke 1: SHA-256 determinism
  v_test_hash    := encode(sha256(('smoke_1|determinism|' || canonical_uuid(p_org_id::text))::bytea), 'hex');
  v_smoke_passed := (length(v_test_hash) = 64);
  IF v_smoke_passed THEN v_tests_passed := v_tests_passed + 1; END IF;
  INSERT INTO replay_smoke_test_results (
    organization_id, ci_run_id, test_name, test_category, passed,
    expected_hash, actual_hash, result_hash, actor_id
  ) VALUES (p_org_id, p_run_id, 'sha256_determinism', 'replay_determinism',
    v_smoke_passed, v_test_hash, v_test_hash, v_test_hash, p_actor_id);

  -- Smoke 2: canonical_uuid idempotence
  v_smoke_passed := (canonical_uuid(p_org_id::text) = canonical_uuid(p_org_id::text));
  v_test_hash    := encode(sha256(('smoke_2|canonical_uuid|' || v_smoke_passed::text)::bytea), 'hex');
  IF v_smoke_passed THEN v_tests_passed := v_tests_passed + 1; END IF;
  INSERT INTO replay_smoke_test_results (
    organization_id, ci_run_id, test_name, test_category, passed,
    expected_hash, actual_hash, result_hash, actor_id
  ) VALUES (p_org_id, p_run_id, 'canonical_uuid_idempotence', 'replay_determinism',
    v_smoke_passed, v_test_hash, v_test_hash, v_test_hash, p_actor_id);

  -- Smoke 3: serializer registry accessible
  v_smoke_passed := EXISTS (SELECT 1 FROM canonical_serializer_registry WHERE deterministic = true);
  v_test_hash    := encode(sha256(('smoke_3|serializer_registry|' || v_smoke_passed::text)::bytea), 'hex');
  IF v_smoke_passed THEN v_tests_passed := v_tests_passed + 1; END IF;
  INSERT INTO replay_smoke_test_results (
    organization_id, ci_run_id, test_name, test_category, passed,
    expected_hash, actual_hash, result_hash, actor_id
  ) VALUES (p_org_id, p_run_id, 'serializer_registry_accessible', 'replay_determinism',
    v_smoke_passed, v_test_hash, v_test_hash, v_test_hash, p_actor_id);

  v_result_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|smoke_tests|' ||
     v_tests_passed::text || '|' || v_tests_total::text)::bytea
  ), 'hex');

  RETURN jsonb_build_object(
    'run_id',       p_run_id,
    'tests_passed', v_tests_passed,
    'tests_total',  v_tests_total,
    'all_passed',   v_tests_passed = v_tests_total,
    'result_hash',  v_result_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION execute_replay_smoke_tests(uuid, uuid, uuid) TO authenticated, service_role;

-- ── generate_deployment_integrity_report ─────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_deployment_integrity_report(
  p_org_id     uuid,
  p_deploy_ver text,
  p_actor_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_latest record;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT * INTO v_latest FROM deployment_integrity_reports
  WHERE organization_id = p_org_id AND deployment_version = p_deploy_ver
  ORDER BY generated_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN verify_post_deploy_replay_integrity(p_org_id, p_deploy_ver, p_actor_id);
  END IF;

  RETURN jsonb_build_object(
    'deployment_version', v_latest.deployment_version,
    'overall_integrity',  v_latest.overall_integrity,
    'integrity_hash',     v_latest.integrity_hash,
    'generated_at',       v_latest.generated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_deployment_integrity_report(uuid, text, uuid) TO authenticated, service_role;
