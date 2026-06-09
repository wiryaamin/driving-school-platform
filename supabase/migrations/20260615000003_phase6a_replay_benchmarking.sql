-- Phase 6A: Platform Stabilization
-- Migration 3: Replay Benchmarking — performance profiles, throughput, chronology scaling

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'replay_benchmark_completed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── replay_benchmark_runs ─────────────────────────────────────────────────────
-- Mutable: each benchmarking execution result.

CREATE TABLE IF NOT EXISTS replay_benchmark_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  benchmark_type  text        NOT NULL
                    CHECK (benchmark_type IN ('chain_hash', 'temporal_snapshot', 'replay_certificate',
                                              'serializer_validation', 'full_harness')),
  scale_factor    integer     NOT NULL DEFAULT 1,
  elements_tested integer     NOT NULL DEFAULT 0,
  execution_ms    numeric     NOT NULL DEFAULT 0,
  throughput_rps  numeric,
  benchmark_hash  text        NOT NULL,
  actor_id        uuid,
  executed_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rbr_benchmark_hash CHECK (length(benchmark_hash) = 64)
);

CREATE INDEX idx_replay_benchmark_runs_org_type ON replay_benchmark_runs (organization_id, benchmark_type);
CREATE INDEX idx_brin_replay_benchmark_executed ON replay_benchmark_runs
  USING brin (executed_at) WITH (pages_per_range = 128);

ALTER TABLE replay_benchmark_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_benchmark_runs_select ON replay_benchmark_runs
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY replay_benchmark_runs_service ON replay_benchmark_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── replay_performance_profiles ───────────────────────────────────────────────
-- Mutable: aggregated latency percentiles per benchmark type.

CREATE TABLE IF NOT EXISTS replay_performance_profiles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  benchmark_type  text        NOT NULL,
  p50_ms          numeric     NOT NULL DEFAULT 0,
  p95_ms          numeric     NOT NULL DEFAULT 0,
  p99_ms          numeric     NOT NULL DEFAULT 0,
  max_ms          numeric     NOT NULL DEFAULT 0,
  sample_count    integer     NOT NULL DEFAULT 0,
  profile_hash    text        NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rpp_profile_hash CHECK (length(profile_hash) = 64)
);

ALTER TABLE replay_performance_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_performance_profiles_select ON replay_performance_profiles
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY replay_performance_profiles_service ON replay_performance_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── chronology_scaling_profiles ───────────────────────────────────────────────
-- Mutable: scaling profile capturing throughput by record count tier.

CREATE TABLE IF NOT EXISTS chronology_scaling_profiles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  record_count    integer     NOT NULL,
  hash_time_ms    numeric     NOT NULL DEFAULT 0,
  throughput_rps  numeric     NOT NULL DEFAULT 0,
  projected_1m_ms numeric     NOT NULL DEFAULT 0,
  profile_hash    text        NOT NULL,
  profiled_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_csp_profile_hash CHECK (length(profile_hash) = 64)
);

ALTER TABLE chronology_scaling_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY chronology_scaling_profiles_select ON chronology_scaling_profiles
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY chronology_scaling_profiles_service ON chronology_scaling_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── benchmark_replay_engine ───────────────────────────────────────────────────
-- Measures generate_temporal_chain_hash throughput for N-element arrays.
-- clock_timestamp() is used only for elapsed measurement (not in hash computations).

CREATE OR REPLACE FUNCTION benchmark_replay_engine(
  p_org_id       uuid,
  p_scale_factor integer DEFAULT 1,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start      timestamptz;
  v_end        timestamptz;
  v_elapsed_ms numeric;
  v_n          integer := LEAST(GREATEST(COALESCE(p_scale_factor, 1) * 100, 100), 10000);
  v_result     text;
  v_throughput numeric;
  v_bench_hash text;
  v_new_id     uuid;
  v_projected  numeric;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_start := clock_timestamp();
  SELECT generate_temporal_chain_hash(
    ARRAY(SELECT 'bench-hash-' || gs::text FROM generate_series(1, v_n) gs)
  ) INTO v_result;
  v_end := clock_timestamp();

  v_elapsed_ms := ROUND(EXTRACT(EPOCH FROM (v_end - v_start)) * 1000, 3);
  v_throughput := CASE WHEN v_elapsed_ms > 0 THEN ROUND((v_n * 1000.0) / v_elapsed_ms, 2) ELSE 0 END;
  v_projected  := CASE WHEN v_throughput > 0 THEN ROUND(1000000.0 * 1000 / v_throughput, 0) ELSE NULL END;

  v_bench_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|chain_hash|' || v_n::text || '|' ||
     v_elapsed_ms::text || '|' || v_throughput::text)::bytea
  ), 'hex');

  INSERT INTO replay_benchmark_runs (
    organization_id, benchmark_type, scale_factor, elements_tested,
    execution_ms, throughput_rps, benchmark_hash, actor_id
  ) VALUES (p_org_id, 'chain_hash', p_scale_factor, v_n, v_elapsed_ms, v_throughput, v_bench_hash, p_actor_id)
  RETURNING id INTO v_new_id;

  -- Also record scaling profile
  INSERT INTO chronology_scaling_profiles (
    organization_id, record_count, hash_time_ms, throughput_rps, projected_1m_ms, profile_hash
  ) VALUES (p_org_id, v_n, v_elapsed_ms, v_throughput, COALESCE(v_projected, 0), v_bench_hash);

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'replay_benchmark_completed', 'regulatory_audit_export', v_new_id, p_actor_id,
    jsonb_build_object('benchmark_type', 'chain_hash', 'elements', v_n,
                       'elapsed_ms', v_elapsed_ms, 'throughput_rps', v_throughput));

  RETURN jsonb_build_object(
    'benchmark_id',     v_new_id,
    'benchmark_type',   'chain_hash',
    'elements_tested',  v_n,
    'execution_ms',     v_elapsed_ms,
    'throughput_rps',   v_throughput,
    'projected_1m_ms',  v_projected,
    'benchmark_hash',   v_bench_hash
  );
END;
$$;

-- ── benchmark_temporal_snapshots ──────────────────────────────────────────────
-- Measures time to compute N snapshot_hash derivations (canonical_jsonb + sha256).

CREATE OR REPLACE FUNCTION benchmark_temporal_snapshots(
  p_org_id       uuid,
  p_scale_factor integer DEFAULT 1,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start      timestamptz;
  v_end        timestamptz;
  v_elapsed_ms numeric;
  v_n          integer := LEAST(GREATEST(COALESCE(p_scale_factor, 1) * 100, 100), 5000);
  v_throughput numeric;
  v_bench_hash text;
  v_new_id     uuid;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_start := clock_timestamp();
  PERFORM count(*) FROM (
    SELECT encode(sha256(
      canonical_jsonb(jsonb_build_object(
        'org_id',           canonical_uuid(p_org_id),
        'entity_id',        canonical_uuid(gen_random_uuid()),
        'entity_type',      canonical_text('agi_submission'),
        'at_timestamp',     canonical_text((TIMESTAMPTZ '2026-01-01T00:00:00Z' + (gs || ' hours')::interval)::text),
        'snapshot_version', '5F.1'
      ))::text::bytea
    ), 'hex')
    FROM generate_series(1, v_n) gs
  ) sub;
  v_end := clock_timestamp();

  v_elapsed_ms := ROUND(EXTRACT(EPOCH FROM (v_end - v_start)) * 1000, 3);
  v_throughput := CASE WHEN v_elapsed_ms > 0 THEN ROUND((v_n * 1000.0) / v_elapsed_ms, 2) ELSE 0 END;

  v_bench_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|temporal_snapshot|' || v_n::text || '|' || v_elapsed_ms::text)::bytea
  ), 'hex');

  INSERT INTO replay_benchmark_runs (
    organization_id, benchmark_type, scale_factor, elements_tested,
    execution_ms, throughput_rps, benchmark_hash, actor_id
  ) VALUES (p_org_id, 'temporal_snapshot', p_scale_factor, v_n, v_elapsed_ms, v_throughput, v_bench_hash, p_actor_id)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'benchmark_id', v_new_id, 'benchmark_type', 'temporal_snapshot',
    'elements_tested', v_n, 'execution_ms', v_elapsed_ms,
    'throughput_rps', v_throughput, 'benchmark_hash', v_bench_hash
  );
END;
$$;

-- ── benchmark_replay_certificates ────────────────────────────────────────────
-- Measures time to compute N replay certificate hash derivations (6-field canonical_jsonb + sha256).

CREATE OR REPLACE FUNCTION benchmark_replay_certificates(
  p_org_id       uuid,
  p_scale_factor integer DEFAULT 1,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start      timestamptz;
  v_end        timestamptz;
  v_elapsed_ms numeric;
  v_n          integer := LEAST(GREATEST(COALESCE(p_scale_factor, 1) * 100, 100), 5000);
  v_throughput numeric;
  v_bench_hash text;
  v_new_id     uuid;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_start := clock_timestamp();
  PERFORM count(*) FROM (
    SELECT encode(sha256(
      canonical_jsonb(jsonb_build_object(
        'org_id',       canonical_uuid(p_org_id),
        'entity_id',    canonical_uuid(gen_random_uuid()),
        'entity_type',  canonical_text('agi_submission'),
        'at_timestamp', canonical_text((TIMESTAMPTZ '2026-01-01T00:00:00Z' + (gs || ' hours')::interval)::text),
        'is_valid',     (gs % 2 = 0),
        'cert_version', '5F.1'
      ))::text::bytea
    ), 'hex')
    FROM generate_series(1, v_n) gs
  ) sub;
  v_end := clock_timestamp();

  v_elapsed_ms := ROUND(EXTRACT(EPOCH FROM (v_end - v_start)) * 1000, 3);
  v_throughput := CASE WHEN v_elapsed_ms > 0 THEN ROUND((v_n * 1000.0) / v_elapsed_ms, 2) ELSE 0 END;

  v_bench_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|replay_certificate|' || v_n::text || '|' || v_elapsed_ms::text)::bytea
  ), 'hex');

  INSERT INTO replay_benchmark_runs (
    organization_id, benchmark_type, scale_factor, elements_tested,
    execution_ms, throughput_rps, benchmark_hash, actor_id
  ) VALUES (p_org_id, 'replay_certificate', p_scale_factor, v_n, v_elapsed_ms, v_throughput, v_bench_hash, p_actor_id)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'benchmark_id', v_new_id, 'benchmark_type', 'replay_certificate',
    'elements_tested', v_n, 'execution_ms', v_elapsed_ms,
    'throughput_rps', v_throughput, 'benchmark_hash', v_bench_hash
  );
END;
$$;

-- ── benchmark_serializer_validation ──────────────────────────────────────────
-- Measures time to compute N serializer schema_hash derivations.

CREATE OR REPLACE FUNCTION benchmark_serializer_validation(
  p_org_id       uuid,
  p_scale_factor integer DEFAULT 1,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start      timestamptz;
  v_end        timestamptz;
  v_elapsed_ms numeric;
  v_n          integer := LEAST(GREATEST(COALESCE(p_scale_factor, 1) * 100, 100), 5000);
  v_throughput numeric;
  v_bench_hash text;
  v_new_id     uuid;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_start := clock_timestamp();
  PERFORM count(*) FROM (
    SELECT encode(sha256(
      ('bench_serializer_' || gs::text || '|6A.1|sha256_pipe_concat_bench')::bytea
    ), 'hex')
    FROM generate_series(1, v_n) gs
  ) sub;
  v_end := clock_timestamp();

  v_elapsed_ms := ROUND(EXTRACT(EPOCH FROM (v_end - v_start)) * 1000, 3);
  v_throughput := CASE WHEN v_elapsed_ms > 0 THEN ROUND((v_n * 1000.0) / v_elapsed_ms, 2) ELSE 0 END;

  v_bench_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|serializer_validation|' || v_n::text || '|' || v_elapsed_ms::text)::bytea
  ), 'hex');

  INSERT INTO replay_benchmark_runs (
    organization_id, benchmark_type, scale_factor, elements_tested,
    execution_ms, throughput_rps, benchmark_hash, actor_id
  ) VALUES (p_org_id, 'serializer_validation', p_scale_factor, v_n, v_elapsed_ms, v_throughput, v_bench_hash, p_actor_id)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'benchmark_id', v_new_id, 'benchmark_type', 'serializer_validation',
    'elements_tested', v_n, 'execution_ms', v_elapsed_ms,
    'throughput_rps', v_throughput, 'benchmark_hash', v_bench_hash
  );
END;
$$;

-- ── generate_replay_performance_report ───────────────────────────────────────
-- Aggregates benchmark runs into latency percentiles and stores a performance profile.

CREATE OR REPLACE FUNCTION generate_replay_performance_report(
  p_org_id         uuid,
  p_benchmark_type text DEFAULT NULL,
  p_actor_id       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p50         numeric;
  v_p95         numeric;
  v_p99         numeric;
  v_max         numeric;
  v_count       integer;
  v_profile_hash text;
  v_new_id      uuid;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY execution_ms),
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_ms),
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_ms),
    MAX(execution_ms),
    COUNT(*)::integer
  INTO v_p50, v_p95, v_p99, v_max, v_count
  FROM replay_benchmark_runs
  WHERE organization_id = p_org_id
    AND (p_benchmark_type IS NULL OR benchmark_type = p_benchmark_type);

  v_profile_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || COALESCE(p_benchmark_type, 'all') || '|' ||
     COALESCE(v_p50::text, '0') || '|' || COALESCE(v_p99::text, '0') || '|' ||
     COALESCE(v_count::text, '0'))::bytea
  ), 'hex');

  INSERT INTO replay_performance_profiles (
    organization_id, benchmark_type, p50_ms, p95_ms, p99_ms, max_ms, sample_count, profile_hash
  ) VALUES (
    p_org_id, COALESCE(p_benchmark_type, 'all'),
    COALESCE(v_p50, 0), COALESCE(v_p95, 0), COALESCE(v_p99, 0), COALESCE(v_max, 0),
    COALESCE(v_count, 0), v_profile_hash
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'profile_id',    v_new_id,
    'benchmark_type', COALESCE(p_benchmark_type, 'all'),
    'p50_ms',        v_p50,
    'p95_ms',        v_p95,
    'p99_ms',        v_p99,
    'max_ms',        v_max,
    'sample_count',  v_count,
    'profile_hash',  v_profile_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION benchmark_replay_engine            TO service_role;
GRANT EXECUTE ON FUNCTION benchmark_temporal_snapshots       TO service_role;
GRANT EXECUTE ON FUNCTION benchmark_replay_certificates      TO service_role;
GRANT EXECUTE ON FUNCTION benchmark_serializer_validation    TO service_role;
GRANT EXECUTE ON FUNCTION generate_replay_performance_report TO service_role;
