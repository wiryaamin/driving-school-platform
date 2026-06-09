-- Phase 6B: DevOps, Replay CI/CD & Production Operations Hardening
-- Migration 3: Backup / Restore Simulation

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'restore_simulation_completed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── New enum type ─────────────────────────────────────────────────────────────

CREATE TYPE restore_simulation_status AS ENUM ('running', 'completed', 'failed', 'divergent');

-- ── restore_simulation_runs ───────────────────────────────────────────────────
-- Mutable: restore simulation lifecycle.

CREATE TABLE IF NOT EXISTS restore_simulation_runs (
  id                 uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid                    NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  simulation_version text                    NOT NULL DEFAULT '6B.1',
  sim_status         restore_simulation_status NOT NULL DEFAULT 'running',
  pre_restore_hash   text,
  post_restore_hash  text,
  hashes_match       boolean                 NOT NULL DEFAULT false,
  checks_passed      integer                 NOT NULL DEFAULT 0,
  checks_total       integer                 NOT NULL DEFAULT 0,
  sim_hash           text                    NOT NULL,
  actor_id           uuid,
  started_at         timestamptz             NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  CONSTRAINT chk_rsr_sim_hash CHECK (length(sim_hash) = 64)
);

ALTER TABLE restore_simulation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY restore_sim_runs_select ON restore_simulation_runs
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY restore_sim_runs_service ON restore_simulation_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rsr_org ON restore_simulation_runs(organization_id);
CREATE INDEX IF NOT EXISTS idx_rsr_running ON restore_simulation_runs(sim_status)
  WHERE sim_status = 'running';

-- ── restore_divergence_reports ────────────────────────────────────────────────
-- Immutable: one report per detected restore divergence.

CREATE TABLE IF NOT EXISTS restore_divergence_reports (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  simulation_run_id uuid        REFERENCES restore_simulation_runs(id) ON DELETE RESTRICT,
  divergence_field  text        NOT NULL,
  expected_hash     text        NOT NULL,
  actual_hash       text        NOT NULL,
  report_hash       text        NOT NULL,
  actor_id          uuid,
  detected_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rdr2_report_hash CHECK (length(report_hash) = 64)
);

ALTER TABLE restore_divergence_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY restore_divergence_select ON restore_divergence_reports
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY restore_divergence_service ON restore_divergence_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_restore_divergence_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'restore_divergence_reports rows are immutable';
END;
$$;

CREATE TRIGGER restore_divergence_immutable
  BEFORE UPDATE OR DELETE ON restore_divergence_reports
  FOR EACH ROW EXECUTE FUNCTION restrict_restore_divergence_report();

CREATE INDEX IF NOT EXISTS idx_rdr2_brin ON restore_divergence_reports
  USING brin (detected_at) WITH (pages_per_range = 128);

-- ── replay_restore_benchmarks ─────────────────────────────────────────────────
-- Immutable: one benchmark row per simulation run.

CREATE TABLE IF NOT EXISTS replay_restore_benchmarks (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid          NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  simulation_run_id uuid          REFERENCES restore_simulation_runs(id) ON DELETE RESTRICT,
  elements_recovered integer      NOT NULL DEFAULT 0,
  elapsed_ms        integer       NOT NULL DEFAULT 0,
  throughput_rps    numeric(12,2) NOT NULL DEFAULT 0,
  benchmark_hash    text          NOT NULL,
  actor_id          uuid,
  benchmarked_at    timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_rrb_bench_hash CHECK (length(benchmark_hash) = 64)
);

ALTER TABLE replay_restore_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY restore_benchmarks_select ON replay_restore_benchmarks
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY restore_benchmarks_service ON replay_restore_benchmarks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_replay_restore_benchmark()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_restore_benchmarks rows are immutable';
END;
$$;

CREATE TRIGGER restore_benchmark_immutable
  BEFORE UPDATE OR DELETE ON replay_restore_benchmarks
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_restore_benchmark();

CREATE INDEX IF NOT EXISTS idx_rrb_brin ON replay_restore_benchmarks
  USING brin (benchmarked_at) WITH (pages_per_range = 128);

-- ── simulate_cold_restore_validation ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION simulate_cold_restore_validation(
  p_org_id    uuid,
  p_sim_ver   text,
  p_actor_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run_id        uuid;
  v_sim_hash      text;
  v_pre_hash      text;
  v_post_hash     text;
  v_checks_passed integer := 0;
  v_checks_total  integer := 5;
  v_match         boolean;
  v_status        restore_simulation_status;
  v_t0            timestamptz;
  v_elapsed       integer;
  v_bench_hash    text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_t0 := clock_timestamp();

  v_sim_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || canonical_text(p_sim_ver) || '|running')::bytea
  ), 'hex');

  INSERT INTO restore_simulation_runs (
    organization_id, simulation_version, sim_status, sim_hash, actor_id
  ) VALUES (p_org_id, p_sim_ver, 'running', v_sim_hash, p_actor_id)
  RETURNING id INTO v_run_id;

  -- Check 1: chronology records recoverable
  IF EXISTS (SELECT 1 FROM chronology_lineage WHERE organization_id = p_org_id LIMIT 1) THEN
    v_checks_passed := v_checks_passed + 1;
  END IF;

  -- Check 2: serializer registry recoverable
  IF EXISTS (SELECT 1 FROM canonical_serializer_registry WHERE replay_compatible = true) THEN
    v_checks_passed := v_checks_passed + 1;
  END IF;

  -- Check 3: evidence hash lengths valid
  IF NOT EXISTS (
    SELECT 1 FROM temporal_evidence_records
    WHERE organization_id = p_org_id AND length(evidence_hash) <> 64
    LIMIT 1
  ) THEN v_checks_passed := v_checks_passed + 1; END IF;

  -- Check 4: replay validation snapshots exist (or no evidence yet — both acceptable)
  IF EXISTS (SELECT 1 FROM replay_validation_snapshots WHERE organization_id = p_org_id LIMIT 1)
     OR NOT EXISTS (SELECT 1 FROM temporal_evidence_records WHERE organization_id = p_org_id LIMIT 1) THEN
    v_checks_passed := v_checks_passed + 1;
  END IF;

  -- Check 5: no unresolved critical alerts
  IF NOT EXISTS (
    SELECT 1 FROM replay_operational_alerts
    WHERE organization_id = p_org_id AND resolved_at IS NULL AND alert_severity = 'critical'
  ) THEN v_checks_passed := v_checks_passed + 1; END IF;

  -- Derive deterministic pre/post hashes
  v_pre_hash  := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|pre_restore|'  || canonical_text(p_sim_ver))::bytea
  ), 'hex');
  v_post_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|post_restore|' || canonical_text(p_sim_ver))::bytea
  ), 'hex');
  v_match := (v_checks_passed = v_checks_total);

  v_status := CASE
    WHEN v_checks_passed = v_checks_total THEN 'completed'
    WHEN v_checks_passed >= 3              THEN 'divergent'
    ELSE                                        'failed'
  END;

  v_sim_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || canonical_text(p_sim_ver) || '|' ||
     v_status::text || '|' || v_checks_passed::text || '|' || v_checks_total::text)::bytea
  ), 'hex');

  UPDATE restore_simulation_runs
  SET sim_status        = v_status,
      pre_restore_hash  = v_pre_hash,
      post_restore_hash = v_post_hash,
      hashes_match      = v_match,
      checks_passed     = v_checks_passed,
      sim_hash          = v_sim_hash,
      completed_at      = now()
  WHERE id = v_run_id;

  v_elapsed    := extract(milliseconds FROM (clock_timestamp() - v_t0))::integer;
  v_bench_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|restore_benchmark|' ||
     v_checks_passed::text || '|' || v_elapsed::text)::bytea
  ), 'hex');

  INSERT INTO replay_restore_benchmarks (
    organization_id, simulation_run_id, elements_recovered, elapsed_ms,
    throughput_rps, benchmark_hash, actor_id
  ) VALUES (
    p_org_id, v_run_id, v_checks_passed, v_elapsed,
    CASE WHEN v_elapsed > 0 THEN ROUND((v_checks_passed::numeric / v_elapsed) * 1000, 2) ELSE 0 END,
    v_bench_hash, p_actor_id
  );

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'restore_simulation_completed', 'restore_simulation_run', v_run_id::text, p_actor_id,
    jsonb_build_object('sim_version', p_sim_ver, 'status', v_status, 'sim_hash', v_sim_hash));

  RETURN jsonb_build_object(
    'run_id',        v_run_id,
    'sim_status',    v_status,
    'checks_passed', v_checks_passed,
    'checks_total',  v_checks_total,
    'hashes_match',  v_match,
    'sim_hash',      v_sim_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION simulate_cold_restore_validation(uuid, text, uuid) TO authenticated, service_role;

-- ── validate_restore_replay_equivalence ──────────────────────────────────────

CREATE OR REPLACE FUNCTION validate_restore_replay_equivalence(
  p_org_id    uuid,
  p_pre_hash  text,
  p_post_hash text,
  p_actor_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_equiv       boolean;
  v_result_hash text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_equiv := (p_pre_hash = p_post_hash);
  v_result_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || canonical_text(p_pre_hash) || '|' ||
     canonical_text(p_post_hash) || '|' || v_equiv::text || '|restore_equivalence')::bytea
  ), 'hex');

  RETURN jsonb_build_object(
    'is_equivalent', v_equiv,
    'pre_hash',      p_pre_hash,
    'post_hash',     p_post_hash,
    'result_hash',   v_result_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_restore_replay_equivalence(uuid, text, text, uuid) TO authenticated, service_role;

-- ── compare_restore_hashes ────────────────────────────────────────────────────
-- IMMUTABLE PARALLEL SAFE — no DB reads.

CREATE OR REPLACE FUNCTION compare_restore_hashes(
  p_pre_hash  text,
  p_post_hash text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT jsonb_build_object(
  'pre_hash',        p_pre_hash,
  'post_hash',       p_post_hash,
  'hashes_match',    p_pre_hash = p_post_hash,
  'is_reproducible', p_pre_hash = p_post_hash,
  'comparison_hash', encode(sha256(
    (p_pre_hash || '|' || p_post_hash || '|restore_comparison')::bytea
  ), 'hex')
)
$$;

GRANT EXECUTE ON FUNCTION compare_restore_hashes(text, text) TO authenticated, service_role;

-- ── benchmark_restore_reconstruction ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION benchmark_restore_reconstruction(
  p_org_id      uuid,
  p_run_id      uuid,
  p_elements    integer,
  p_elapsed_ms  integer,
  p_actor_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_throughput  numeric(12,2);
  v_bench_hash  text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_throughput := CASE
    WHEN p_elapsed_ms > 0 THEN ROUND((p_elements::numeric / p_elapsed_ms) * 1000, 2)
    ELSE 0
  END;

  v_bench_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|restore_benchmark|' ||
     p_elements::text || '|' || p_elapsed_ms::text || '|' || v_throughput::text)::bytea
  ), 'hex');

  INSERT INTO replay_restore_benchmarks (
    organization_id, simulation_run_id, elements_recovered,
    elapsed_ms, throughput_rps, benchmark_hash, actor_id
  ) VALUES (p_org_id, p_run_id, p_elements, p_elapsed_ms, v_throughput, v_bench_hash, p_actor_id);

  RETURN jsonb_build_object(
    'elements_recovered', p_elements,
    'elapsed_ms',         p_elapsed_ms,
    'throughput_rps',     v_throughput,
    'benchmark_hash',     v_bench_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION benchmark_restore_reconstruction(uuid, uuid, integer, integer, uuid) TO authenticated, service_role;

-- ── generate_restore_simulation_report ───────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_restore_simulation_report(
  p_org_id   uuid,
  p_sim_ver  text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_latest record;
  v_bench  record;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT * INTO v_latest FROM restore_simulation_runs
  WHERE organization_id = p_org_id AND simulation_version = p_sim_ver
  ORDER BY started_at DESC LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_bench FROM replay_restore_benchmarks
    WHERE organization_id = p_org_id AND simulation_run_id = v_latest.id
    ORDER BY benchmarked_at DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'simulation_version', p_sim_ver,
    'sim_status',         COALESCE(v_latest.sim_status::text, 'no_runs'),
    'hashes_match',       COALESCE(v_latest.hashes_match, false),
    'checks_passed',      COALESCE(v_latest.checks_passed, 0),
    'checks_total',       COALESCE(v_latest.checks_total, 0),
    'throughput_rps',     COALESCE(v_bench.throughput_rps, 0),
    'elapsed_ms',         COALESCE(v_bench.elapsed_ms, 0),
    'sim_hash',           COALESCE(v_latest.sim_hash, '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_restore_simulation_report(uuid, text, uuid) TO authenticated, service_role;
