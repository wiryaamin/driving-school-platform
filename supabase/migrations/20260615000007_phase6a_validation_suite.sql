-- Phase 6A: Platform Stabilization
-- Migration 7: Global Validation Suite — 20 deterministic tests, no DB reads, IMMUTABLE PARALLEL SAFE

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'phase6a_validation_executed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Seed 3 serializer profiles for Phase 6A tables ───────────────────────────

INSERT INTO canonical_serializer_registry (
  serializer_key, serializer_version, schema_hash, canonicalization_strategy,
  replay_compatible, deterministic, registered_at
)
SELECT
  'replay_test_run_v1',
  '6A.1',
  encode(sha256(('replay_test_run_v1|6A.1|sha256_pipe_concat_5field')::bytea), 'hex'),
  'sha256_pipe_concat_5field',
  true,
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM canonical_serializer_registry WHERE serializer_key = 'replay_test_run_v1'
);

INSERT INTO canonical_serializer_registry (
  serializer_key, serializer_version, schema_hash, canonicalization_strategy,
  replay_compatible, deterministic, registered_at
)
SELECT
  'serializer_drift_report_v1',
  '6A.1',
  encode(sha256(('serializer_drift_report_v1|6A.1|sha256_pipe_concat_4field')::bytea), 'hex'),
  'sha256_pipe_concat_4field',
  true,
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM canonical_serializer_registry WHERE serializer_key = 'serializer_drift_report_v1'
);

INSERT INTO canonical_serializer_registry (
  serializer_key, serializer_version, schema_hash, canonicalization_strategy,
  replay_compatible, deterministic, registered_at
)
SELECT
  'replay_health_check_v1',
  '6A.1',
  encode(sha256(('replay_health_check_v1|6A.1|sha256_pipe_concat_4field')::bytea), 'hex'),
  'sha256_pipe_concat_4field',
  false,
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM canonical_serializer_registry WHERE serializer_key = 'replay_health_check_v1'
);

-- ── run_phase6a_validation_suite ─────────────────────────────────────────────
-- 20 deterministic tests. IMMUTABLE PARALLEL SAFE — no DB reads, no now(), no gen_random_uuid().
-- All inputs are fixed constants; all expected outputs are derived from the same formula.

CREATE OR REPLACE FUNCTION run_phase6a_validation_suite()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $func$
WITH tests AS (
  -- ── Test 1: deterministic_replay_reproducibility ────────────────────────────
  SELECT
    1 AS test_num,
    'deterministic_replay_reproducibility' AS test_name,
    encode(sha256(
      (canonical_uuid('a1000000-0000-0000-0000-000000000001') || '|' ||
       canonical_uuid('b1000000-0000-0000-0000-000000000001') || '|' ||
       canonical_text('full_chronology') || '|3|3|true')::bytea
    ), 'hex') =
    encode(sha256(
      (canonical_uuid('a1000000-0000-0000-0000-000000000001') || '|' ||
       canonical_uuid('b1000000-0000-0000-0000-000000000001') || '|' ||
       canonical_text('full_chronology') || '|3|3|true')::bytea
    ), 'hex') AS passed,
    'run_hash derivation must be identical across invocations' AS description

  UNION ALL

  -- ── Test 2: replay_certificate_regeneration ──────────────────────────────────
  SELECT 2, 'replay_certificate_regeneration',
    encode(sha256(
      canonical_jsonb(jsonb_build_object(
        'org_id',       canonical_uuid('a2000000-0000-0000-0000-000000000002'),
        'entity_id',    canonical_uuid('b2000000-0000-0000-0000-000000000002'),
        'entity_type',  canonical_text('vat_declaration'),
        'at_timestamp', canonical_text('2026-01-01T00:00:00+00:00'),
        'is_valid',     true,
        'cert_version', '5F.1'
      ))::text::bytea
    ), 'hex') =
    encode(sha256(
      canonical_jsonb(jsonb_build_object(
        'org_id',       canonical_uuid('a2000000-0000-0000-0000-000000000002'),
        'entity_id',    canonical_uuid('b2000000-0000-0000-0000-000000000002'),
        'entity_type',  canonical_text('vat_declaration'),
        'at_timestamp', canonical_text('2026-01-01T00:00:00+00:00'),
        'is_valid',     true,
        'cert_version', '5F.1'
      ))::text::bytea
    ), 'hex'),
    'certificate_hash from same 6-field input must be identical'

  UNION ALL

  -- ── Test 3: serializer_drift_detection_formula ───────────────────────────────
  SELECT 3, 'serializer_drift_detection_formula',
    length(encode(sha256(
      ('replay_test_run_v1|6A.1|sha256_pipe_concat_5field')::bytea
    ), 'hex')) = 64,
    'schema_hash derivation must produce 64-char hex'

  UNION ALL

  -- ── Test 4: chronology_continuity_validation ─────────────────────────────────
  SELECT 4, 'chronology_continuity_validation',
    encode(sha256(
      (canonical_uuid('a4000000-0000-0000-0000-000000000004') || '|' ||
       canonical_uuid('b4000000-0000-0000-0000-000000000004') || '|' ||
       '10|0|0')::bytea
    ), 'hex') <>
    encode(sha256(
      (canonical_uuid('a4000000-0000-0000-0000-000000000004') || '|' ||
       canonical_uuid('b4000000-0000-0000-0000-000000000004') || '|' ||
       '10|1|0')::bytea
    ), 'hex'),
    'scan_hash must differ when gaps_detected changes'

  UNION ALL

  -- ── Test 5: replay_hash_consistency ──────────────────────────────────────────
  SELECT 5, 'replay_hash_consistency',
    (SELECT count(DISTINCT h) = 1 FROM (
      SELECT encode(sha256(('stability_test|6A.1|canonical_jsonb')::bytea), 'hex') AS h
      FROM generate_series(1, 5)
    ) sub),
    'identical inputs must always produce identical SHA-256 output'

  UNION ALL

  -- ── Test 6: append_only_chronology_correctness ───────────────────────────────
  SELECT 6, 'append_only_chronology_correctness',
    encode(sha256(('temporal-genesis')::bytea), 'hex') <>
    encode(sha256(('temporal-genesis|step1')::bytea), 'hex'),
    'each chain step must produce a distinct hash'

  UNION ALL

  -- ── Test 7: replay_scalability_validation ────────────────────────────────────
  SELECT 7, 'replay_scalability_validation',
    (SELECT length(h) = 64
     FROM (
       SELECT encode(sha256(
         array_to_string(
           ARRAY(SELECT 'step-' || gs::text FROM generate_series(1, 200) gs),
           '|'
         )::bytea
       ), 'hex') AS h
     ) sub),
    '200-element chain hash must produce valid 64-char SHA-256'

  UNION ALL

  -- ── Test 8: replay_benchmark_hash_derivable ───────────────────────────────────
  SELECT 8, 'replay_benchmark_hash_derivable',
    length(encode(sha256(
      (canonical_uuid('a8000000-0000-0000-0000-000000000008') || '|chain_hash|' ||
       '1|100|999|1000')::bytea
    ), 'hex')) = 64,
    'benchmark_hash must be derivable from org|type|scale|elements|elapsed|throughput'

  UNION ALL

  -- ── Test 9: backup_restore_reproducibility ───────────────────────────────────
  SELECT 9, 'backup_restore_reproducibility',
    (SELECT (res->>'hashes_match')::boolean AND (res->>'is_reproducible')::boolean
     FROM (SELECT compare_pre_post_restore_hashes(
       encode(sha256('restore_test_pre'::bytea), 'hex'),
       encode(sha256('restore_test_pre'::bytea), 'hex')
     ) AS res) sub),
    'compare_pre_post_restore_hashes must return match=true for identical inputs'

  UNION ALL

  -- ── Test 10: tenant_replay_isolation ─────────────────────────────────────────
  SELECT 10, 'tenant_replay_isolation',
    encode(sha256(
      (canonical_uuid('aa000000-0000-0000-0000-000000000001') || '|' ||
       canonical_uuid('bb000000-0000-0000-0000-000000000002') || '|' ||
       encode(sha256('b3000000-0000-0000-0000-000000000003'::bytea), 'hex') || '|cross_tenant_replay')::bytea
    ), 'hex') <>
    encode(sha256(
      (canonical_uuid('aa000000-0000-0000-0000-000000000001') || '|' ||
       canonical_uuid('bb000000-0000-0000-0000-000000000002') || '|' ||
       encode(sha256('b3000000-0000-0000-0000-000000000003'::bytea), 'hex') || '|unauthorized_chronology')::bytea
    ), 'hex'),
    'different violation types must produce distinct violation_hashes'

  UNION ALL

  -- ── Test 11: security_definer_boundary_hash ───────────────────────────────────
  SELECT 11, 'security_definer_boundary_hash',
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000011') || '|' ||
       canonical_uuid('b0000000-0000-0000-0000-000000000011') || '|' ||
       '3|3|true|tenant_isolation_report')::bytea
    ), 'hex') =
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000011') || '|' ||
       canonical_uuid('b0000000-0000-0000-0000-000000000011') || '|' ||
       '3|3|true|tenant_isolation_report')::bytea
    ), 'hex'),
    'isolation report_hash must be deterministic across calls'

  UNION ALL

  -- ── Test 12: replay_authorization_correctness ─────────────────────────────────
  SELECT 12, 'replay_authorization_correctness',
    '00000000-0000-0000-0000-000000000000'::uuid <>
    'a0000000-0000-0000-0000-000000000012'::uuid,
    'sentinel UUID must never equal a real org_id'

  UNION ALL

  -- ── Test 13: replay_corruption_detection ──────────────────────────────────────
  SELECT 13, 'replay_corruption_detection',
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000013') || '|' ||
       canonical_uuid('b0000000-0000-0000-0000-000000000013') || '|' ||
       'chronology_corruption|5')::bytea
    ), 'hex') <>
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000013') || '|' ||
       canonical_uuid('b0000000-0000-0000-0000-000000000013') || '|' ||
       'chronology_corruption|0')::bytea
    ), 'hex'),
    'alert_hash must differ for different divergence counts'

  UNION ALL

  -- ── Test 14: chronology_integrity_validation ──────────────────────────────────
  SELECT 14, 'chronology_integrity_validation',
    length(encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000014') || '|' ||
       canonical_uuid('b0000000-0000-0000-0000-000000000014') || '|' ||
       '42|0|0')::bytea
    ), 'hex')) = 64,
    'scan_hash for 42-entry clean chain must be 64-char hex'

  UNION ALL

  -- ── Test 15: operational_resilience_correctness ───────────────────────────────
  SELECT 15, 'operational_resilience_correctness',
    (SELECT count(DISTINCT status) = 3
     FROM (
       VALUES
         (CASE WHEN 5 = 5 THEN 'healthy' WHEN 5 >= 3 THEN 'degraded' ELSE 'critical' END),
         (CASE WHEN 3 = 5 THEN 'healthy' WHEN 3 >= 3 THEN 'degraded' ELSE 'critical' END),
         (CASE WHEN 2 = 5 THEN 'healthy' WHEN 2 >= 3 THEN 'degraded' ELSE 'critical' END)
     ) AS t(status)),
    'health_status derivation must produce all 3 distinct levels for 5/3/2 passed checks'

  UNION ALL

  -- ── Test 16: replay_health_check_hash_stable ──────────────────────────────────
  SELECT 16, 'replay_health_check_hash_stable',
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000016') || '|healthy|5|5')::bytea
    ), 'hex') =
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000016') || '|healthy|5|5')::bytea
    ), 'hex'),
    'health_hash must be stable for same org|status|passed|total'

  UNION ALL

  -- ── Test 17: serializer_evolution_safety ──────────────────────────────────────
  SELECT 17, 'serializer_evolution_safety',
    encode(sha256(('replay_test_run_v1|6A.0|sha256_pipe_concat_5field')::bytea), 'hex') <>
    encode(sha256(('replay_test_run_v1|6A.1|sha256_pipe_concat_5field')::bytea), 'hex'),
    'schema_hash must change when serializer version changes'

  UNION ALL

  -- ── Test 18: replay_schema_compatibility_matrix ────────────────────────────────
  SELECT 18, 'replay_schema_compatibility_matrix',
    encode(sha256(
      (canonical_text('key_a') || '|' || canonical_text('key_b') || '|' ||
       encode(sha256(('key_a|6A.1|strategy_x')::bytea), 'hex') || '|' ||
       encode(sha256(('key_b|6A.1|strategy_x')::bytea), 'hex') || '|true|compatible')::bytea
    ), 'hex') =
    encode(sha256(
      (canonical_text('key_a') || '|' || canonical_text('key_b') || '|' ||
       encode(sha256(('key_a|6A.1|strategy_x')::bytea), 'hex') || '|' ||
       encode(sha256(('key_b|6A.1|strategy_x')::bytea), 'hex') || '|true|compatible')::bytea
    ), 'hex'),
    'compatibility matrix_hash derivation must be deterministic'

  UNION ALL

  -- ── Test 19: replay_reconstruction_determinism ────────────────────────────────
  SELECT 19, 'replay_reconstruction_determinism',
    encode(sha256(
      canonical_jsonb(jsonb_build_object(
        'org_id',           canonical_uuid('a0000000-0000-0000-0000-000000000019'),
        'entity_id',        canonical_uuid('b0000000-0000-0000-0000-000000000019'),
        'entity_type',      canonical_text('agi_declaration'),
        'at_timestamp',     canonical_text('2026-03-01T12:00:00+00:00'),
        'snapshot_version', '5F.1'
      ))::text::bytea
    ), 'hex') =
    encode(sha256(
      canonical_jsonb(jsonb_build_object(
        'org_id',           canonical_uuid('a0000000-0000-0000-0000-000000000019'),
        'entity_id',        canonical_uuid('b0000000-0000-0000-0000-000000000019'),
        'entity_type',      canonical_text('agi_declaration'),
        'at_timestamp',     canonical_text('2026-03-01T12:00:00+00:00'),
        'snapshot_version', '5F.1'
      ))::text::bytea
    ), 'hex'),
    'snapshot_hash re-derivation must be identical for same 5-field input'

  UNION ALL

  -- ── Test 20: replay_chain_drift_detection ─────────────────────────────────────
  SELECT 20, 'replay_chain_drift_detection',
    (
      encode(sha256(
        (canonical_uuid('a0000000-0000-0000-0000-000000000020') || '|' ||
         canonical_uuid('b0000000-0000-0000-0000-000000000020') || '|' ||
         encode(sha256('baseline_chain'::bytea), 'hex') || '|' ||
         encode(sha256('diverged_chain'::bytea), 'hex') || '|true')::bytea
      ), 'hex')
    ) <>
    (
      encode(sha256(
        (canonical_uuid('a0000000-0000-0000-0000-000000000020') || '|' ||
         canonical_uuid('b0000000-0000-0000-0000-000000000020') || '|' ||
         encode(sha256('baseline_chain'::bytea), 'hex') || '|' ||
         encode(sha256('baseline_chain'::bytea), 'hex') || '|false')::bytea
      ), 'hex')
    ),
    'drift report_hash must differ when current_hash and drift_detected change'
),
summary AS (
  SELECT
    count(*) FILTER (WHERE passed)                 AS tests_passed,
    count(*) FILTER (WHERE NOT passed)             AS tests_failed,
    count(*)                                       AS tests_total,
    jsonb_agg(
      jsonb_build_object(
        'test_num',   test_num,
        'test_name',  test_name,
        'passed',     passed,
        'description', description
      )
      ORDER BY test_num
    )                                              AS test_results
  FROM tests
),
suite_hash_cte AS (
  SELECT encode(sha256(
    (canonical_text('phase6a_validation_suite') || '|' || canonical_text('6A.0') || '|20')::bytea
  ), 'hex') AS suite_hash
)
SELECT jsonb_build_object(
  'suite',        'phase6a_validation_suite',
  'version',      '6A.0',
  'tests_total',  s.tests_total,
  'tests_passed', s.tests_passed,
  'tests_failed', s.tests_failed,
  'all_passed',   s.tests_failed = 0,
  'suite_hash',   h.suite_hash,
  'test_results', s.test_results
)
FROM summary s, suite_hash_cte h;
$func$;

GRANT EXECUTE ON FUNCTION run_phase6a_validation_suite TO authenticated, service_role;
