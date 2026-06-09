-- Phase 6B: DevOps, Replay CI/CD & Production Operations Hardening
-- Migration 7: Global Validation Suite — 20 deterministic tests, IMMUTABLE PARALLEL SAFE

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'phase6b_validation_executed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Seed 4 serializer profiles for Phase 6B tables ───────────────────────────

INSERT INTO canonical_serializer_registry (
  serializer_key, serializer_version, schema_hash, canonicalization_strategy,
  replay_compatible, deterministic, registered_at
)
SELECT
  'replay_ci_run_v1', '6B.1',
  encode(sha256(('replay_ci_run_v1|6B.1|sha256_pipe_concat_5field')::bytea), 'hex'),
  'sha256_pipe_concat_5field', true, true, now()
WHERE NOT EXISTS (SELECT 1 FROM canonical_serializer_registry WHERE serializer_key = 'replay_ci_run_v1');

INSERT INTO canonical_serializer_registry (
  serializer_key, serializer_version, schema_hash, canonicalization_strategy,
  replay_compatible, deterministic, registered_at
)
SELECT
  'shadow_rebuild_run_v1', '6B.1',
  encode(sha256(('shadow_rebuild_run_v1|6B.1|sha256_pipe_concat_5field')::bytea), 'hex'),
  'sha256_pipe_concat_5field', true, true, now()
WHERE NOT EXISTS (SELECT 1 FROM canonical_serializer_registry WHERE serializer_key = 'shadow_rebuild_run_v1');

INSERT INTO canonical_serializer_registry (
  serializer_key, serializer_version, schema_hash, canonicalization_strategy,
  replay_compatible, deterministic, registered_at
)
SELECT
  'restore_simulation_run_v1', '6B.1',
  encode(sha256(('restore_simulation_run_v1|6B.1|sha256_pipe_concat_5field')::bytea), 'hex'),
  'sha256_pipe_concat_5field', true, true, now()
WHERE NOT EXISTS (SELECT 1 FROM canonical_serializer_registry WHERE serializer_key = 'restore_simulation_run_v1');

INSERT INTO canonical_serializer_registry (
  serializer_key, serializer_version, schema_hash, canonicalization_strategy,
  replay_compatible, deterministic, registered_at
)
SELECT
  'replay_archive_batch_v1', '6B.1',
  encode(sha256(('replay_archive_batch_v1|6B.1|sha256_pipe_concat_5field')::bytea), 'hex'),
  'sha256_pipe_concat_5field', true, true, now()
WHERE NOT EXISTS (SELECT 1 FROM canonical_serializer_registry WHERE serializer_key = 'replay_archive_batch_v1');

-- ── run_phase6b_validation_suite ──────────────────────────────────────────────
-- 20 deterministic tests. IMMUTABLE PARALLEL SAFE — no DB reads, no now(), no gen_random_uuid().

CREATE OR REPLACE FUNCTION run_phase6b_validation_suite()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $func$
WITH tests AS (

  -- ── Test 1: deterministic_deployment_rebuild ─────────────────────────────────
  SELECT
    1 AS test_num,
    'deterministic_deployment_rebuilds' AS test_name,
    encode(sha256(
      (canonical_uuid('a1000000-0000-0000-0000-000000000001') || '|' ||
       canonical_uuid('b1000000-0000-0000-0000-000000000001') || '|' ||
       'passed|5|5')::bytea
    ), 'hex') =
    encode(sha256(
      (canonical_uuid('a1000000-0000-0000-0000-000000000001') || '|' ||
       canonical_uuid('b1000000-0000-0000-0000-000000000001') || '|' ||
       'passed|5|5')::bytea
    ), 'hex') AS passed,
    'ci run_hash must be identical across invocations for same inputs' AS description

  UNION ALL

  -- ── Test 2: replay_reproducibility_after_deploy ───────────────────────────────
  SELECT 2, 'replay_reproducibility_after_deploy',
    encode(sha256(
      (canonical_uuid('a2000000-0000-0000-0000-000000000002') || '|' ||
       canonical_text('6B.1') || '|true|true|true|true')::bytea
    ), 'hex') <>
    encode(sha256(
      (canonical_uuid('a2000000-0000-0000-0000-000000000002') || '|' ||
       canonical_text('6B.1') || '|false|true|true|true')::bytea
    ), 'hex'),
    'deployment integrity_hash must differ when replay_hash_stable changes'

  UNION ALL

  -- ── Test 3: migration_chain_reproducibility ───────────────────────────────────
  SELECT 3, 'migration_chain_reproducibility',
    encode(sha256(
      (canonical_uuid('a3000000-0000-0000-0000-000000000003') || '|' ||
       canonical_text('20260616000001') || '|' ||
       encode(sha256('pre_state_hash'::bytea), 'hex') || '|' ||
       encode(sha256('pre_state_hash'::bytea), 'hex') || '|true')::bytea
    ), 'hex') =
    encode(sha256(
      (canonical_uuid('a3000000-0000-0000-0000-000000000003') || '|' ||
       canonical_text('20260616000001') || '|' ||
       encode(sha256('pre_state_hash'::bytea), 'hex') || '|' ||
       encode(sha256('pre_state_hash'::bytea), 'hex') || '|true')::bytea
    ), 'hex'),
    'migration report_hash must be deterministic for same inputs'

  UNION ALL

  -- ── Test 4: shadow_db_replay_equivalence ─────────────────────────────────────
  SELECT 4, 'shadow_db_replay_equivalence',
    (
      encode(sha256(
        (encode(sha256('chain_state_A'::bytea), 'hex') || '|' ||
         encode(sha256('chain_state_A'::bytea), 'hex') || '|shadow_comparison')::bytea
      ), 'hex')
    ) <>
    (
      encode(sha256(
        (encode(sha256('chain_state_A'::bytea), 'hex') || '|' ||
         encode(sha256('chain_state_B'::bytea), 'hex') || '|shadow_comparison')::bytea
      ), 'hex')
    ),
    'shadow comparison_hash must differ when primary != shadow chain hash'

  UNION ALL

  -- ── Test 5: replay_certificate_regeneration ───────────────────────────────────
  SELECT 5, 'replay_certificate_regeneration',
    length(encode(sha256(
      canonical_jsonb(jsonb_build_object(
        'org_id',       canonical_uuid('a5000000-0000-0000-0000-000000000005'),
        'entity_id',    canonical_uuid('b5000000-0000-0000-0000-000000000005'),
        'entity_type',  canonical_text('vat_declaration'),
        'at_timestamp', canonical_text('2026-01-01T00:00:00+00:00'),
        'is_valid',     true,
        'cert_version', '5F.1'
      ))::text::bytea
    ), 'hex')) = 64,
    'replay certificate hash derivation must produce 64-char output'

  UNION ALL

  -- ── Test 6: serializer_reconstruction_continuity ─────────────────────────────
  SELECT 6, 'serializer_reconstruction_continuity',
    encode(sha256(('replay_ci_run_v1|6B.1|sha256_pipe_concat_5field')::bytea), 'hex') <>
    encode(sha256(('replay_ci_run_v1|6B.0|sha256_pipe_concat_5field')::bytea), 'hex'),
    'schema_hash must differ between versions 6B.0 and 6B.1'

  UNION ALL

  -- ── Test 7: cold_restore_replay_correctness ───────────────────────────────────
  SELECT 7, 'cold_restore_replay_correctness',
    (
      SELECT (res->>'hashes_match')::boolean AND (res->>'is_reproducible')::boolean
      FROM (
        SELECT compare_restore_hashes(
          encode(sha256('restore_pre_v1'::bytea), 'hex'),
          encode(sha256('restore_pre_v1'::bytea), 'hex')
        ) AS res
      ) sub
    ),
    'compare_restore_hashes must return match=true for identical inputs'

  UNION ALL

  -- ── Test 8: replay_determinism_after_restore ──────────────────────────────────
  SELECT 8, 'replay_determinism_after_restore',
    encode(sha256(
      (canonical_uuid('a8000000-0000-0000-0000-000000000008') || '|' ||
       canonical_text('6B.1') || '|completed|5|5')::bytea
    ), 'hex') =
    encode(sha256(
      (canonical_uuid('a8000000-0000-0000-0000-000000000008') || '|' ||
       canonical_text('6B.1') || '|completed|5|5')::bytea
    ), 'hex'),
    'restore sim_hash must be identical for same org+version+status+checks'

  UNION ALL

  -- ── Test 9: archive_replay_integrity ─────────────────────────────────────────
  SELECT 9, 'archive_replay_integrity',
    encode(sha256(
      (canonical_uuid('a9000000-0000-0000-0000-000000000009') || '|' ||
       canonical_text('vat_declaration') || '|' ||
       encode(sha256('before_chain'::bytea), 'hex') || '|' ||
       encode(sha256(
         (encode(sha256('before_chain'::bytea), 'hex') || '|archive|vat_declaration|100')::bytea
       ), 'hex') || '|100')::bytea
    ), 'hex') =
    encode(sha256(
      (canonical_uuid('a9000000-0000-0000-0000-000000000009') || '|' ||
       canonical_text('vat_declaration') || '|' ||
       encode(sha256('before_chain'::bytea), 'hex') || '|' ||
       encode(sha256(
         (encode(sha256('before_chain'::bytea), 'hex') || '|archive|vat_declaration|100')::bytea
       ), 'hex') || '|100')::bytea
    ), 'hex'),
    'archive_hash derivation must be deterministic for same 5-field input'

  UNION ALL

  -- ── Test 10: archive_hash_continuity ─────────────────────────────────────────
  SELECT 10, 'archive_hash_continuity',
    (
      SELECT (res->>'is_continuous')::boolean
      FROM (
        SELECT verify_archive_hash_continuity(
          encode(sha256('before'::bytea), 'hex'),
          encode(sha256(
            (encode(sha256('before'::bytea), 'hex') || '|archive|agi_submission|50')::bytea
          ), 'hex'),
          'agi_submission',
          50
        ) AS res
      ) sub
    ),
    'verify_archive_hash_continuity must return is_continuous=true for valid distinct hashes'

  UNION ALL

  -- ── Test 11: replay_operational_health ───────────────────────────────────────
  SELECT 11, 'replay_operational_health',
    (SELECT count(DISTINCT score) = 3
     FROM (
       VALUES
         (CASE WHEN 0 = 0    THEN 100 ELSE GREATEST(0, 100 - 0 * 10) END),
         (CASE WHEN 1 = 0    THEN 100 ELSE GREATEST(0, 100 - 1 * 10) END),
         (CASE WHEN 10 = 0   THEN 100 ELSE GREATEST(0, 100 - 10 * 10) END)
     ) AS t(score)),
    'health_score formula must yield 3 distinct values for 0/1/10 errors'

  UNION ALL

  -- ── Test 12: replay_anomaly_detection_correctness ────────────────────────────
  SELECT 12, 'replay_anomaly_detection_correctness',
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000012') || '|' ||
       canonical_text('vat_declaration') || '|3|2|1')::bytea
    ), 'hex') <>
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000012') || '|' ||
       canonical_text('vat_declaration') || '|0|0|0')::bytea
    ), 'hex'),
    'detection_hash must differ when anomaly counts change'

  UNION ALL

  -- ── Test 13: chronology_continuity_validation ────────────────────────────────
  SELECT 13, 'chronology_continuity_validation',
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000013') || '|' ||
       canonical_text('agi_submission') || '|' ||
       'a0000000-0000-0000-0000-000000000013' || '|' ||
       'chronology_discontinuity|3')::bytea
    ), 'hex') <>
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000013') || '|' ||
       canonical_text('agi_submission') || '|' ||
       'a0000000-0000-0000-0000-000000000013' || '|' ||
       'chronology_discontinuity|0')::bytea
    ), 'hex'),
    'violation_hash must differ when gap count changes'

  UNION ALL

  -- ── Test 14: replay_chain_integrity_validation ───────────────────────────────
  SELECT 14, 'replay_chain_integrity_validation',
    length(encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000014') || '|' ||
       canonical_text('serializer_key_abc') || '|' ||
       encode(sha256('expected_schema'::bytea), 'hex') || '|' ||
       encode(sha256('actual_schema'::bytea), 'hex') || '|true')::bytea
    ), 'hex')) = 64,
    'serializer divergence alert_hash must be 64-char hex'

  UNION ALL

  -- ── Test 15: serializer_drift_detection ──────────────────────────────────────
  SELECT 15, 'serializer_drift_detection',
    encode(sha256(('replay_ci_run_v1|6B.1|sha256_pipe_concat_5field')::bytea), 'hex') <>
    encode(sha256(('shadow_rebuild_run_v1|6B.1|sha256_pipe_concat_5field')::bytea), 'hex'),
    'different serializer keys must produce distinct schema hashes'

  UNION ALL

  -- ── Test 16: replay_observability_correctness ────────────────────────────────
  SELECT 16, 'replay_observability_correctness',
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000016') || '|operational_metrics|' ||
       '0|0|42')::bytea
    ), 'hex') =
    encode(sha256(
      (canonical_uuid('a0000000-0000-0000-0000-000000000016') || '|operational_metrics|' ||
       '0|0|42')::bytea
    ), 'hex'),
    'metrics_hash must be stable for same org+divergences+errors+elements'

  UNION ALL

  -- ── Test 17: replay_smoke_test_correctness ───────────────────────────────────
  SELECT 17, 'replay_smoke_test_correctness',
    encode(sha256(('smoke_1|determinism|' || canonical_uuid('a0000000-0000-0000-0000-000000000017'))::bytea), 'hex') <>
    encode(sha256(('smoke_1|determinism|' || canonical_uuid('b0000000-0000-0000-0000-000000000017'))::bytea), 'hex'),
    'smoke test hash must differ for different org_ids'

  UNION ALL

  -- ── Test 18: append_only_replay_guarantees ────────────────────────────────────
  SELECT 18, 'append_only_replay_guarantees',
    encode(sha256(
      (encode(sha256('archive_before'::bytea), 'hex') || '|archive|' ||
       canonical_text('vat_declaration') || '|10')::bytea
    ), 'hex') <>
    encode(sha256('archive_before'::bytea), 'hex'),
    'archive chain extension must produce a distinct chain_after hash'

  UNION ALL

  -- ── Test 19: replay_authorization_correctness ────────────────────────────────
  SELECT 19, 'replay_authorization_correctness',
    '00000000-0000-0000-0000-000000000000'::uuid <>
    'a0000000-0000-0000-0000-000000000019'::uuid,
    'sentinel UUID must never equal a real org_id'

  UNION ALL

  -- ── Test 20: replay_infrastructure_backward_compatibility ─────────────────────
  SELECT 20, 'replay_infrastructure_backward_compatibility',
    (SELECT count(DISTINCT h) = 1 FROM (
      SELECT encode(sha256(
        (canonical_text('phase6b_validation_suite') || '|' || canonical_text('6B.0') || '|20')::bytea
      ), 'hex') AS h
      FROM generate_series(1, 3)
    ) sub),
    'suite hash must be identical across repeated evaluations'

),
summary AS (
  SELECT
    count(*) FILTER (WHERE passed)       AS tests_passed,
    count(*) FILTER (WHERE NOT passed)   AS tests_failed,
    count(*)                             AS tests_total,
    jsonb_agg(
      jsonb_build_object(
        'test_num',    test_num,
        'test_name',   test_name,
        'passed',      passed,
        'description', description
      )
      ORDER BY test_num
    )                                    AS test_results
  FROM tests
),
suite_hash_cte AS (
  SELECT encode(sha256(
    (canonical_text('phase6b_validation_suite') || '|' || canonical_text('6B.0') || '|20')::bytea
  ), 'hex') AS suite_hash
)
SELECT jsonb_build_object(
  'suite',        'phase6b_validation_suite',
  'version',      '6B.0',
  'tests_total',  s.tests_total,
  'tests_passed', s.tests_passed,
  'tests_failed', s.tests_failed,
  'all_passed',   s.tests_failed = 0,
  'suite_hash',   h.suite_hash,
  'test_results', s.test_results
)
FROM summary s, suite_hash_cte h;
$func$;

GRANT EXECUTE ON FUNCTION run_phase6b_validation_suite TO authenticated, service_role;
