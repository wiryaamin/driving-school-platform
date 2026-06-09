-- Phase 5B: Filing Certification & Regulatory Sealing — Validation Suite + Indexes
--
-- Functions: run_phase5b_validation_suite (IMMUTABLE)
-- Indexes:   all three Phase 5B tables
-- Seeds:     2 new canonicalization_profiles entries

-- ── run_phase5b_validation_suite() ───────────────────────────────────────────
-- IMMUTABLE validation of Phase 5B IMMUTABLE functions.
-- Tests: generate_export_chain_hash (6 tests) + build_certification_manifest (5 tests).
-- Returns: {suite, pass, fail, total, all_pass, tests[]}

CREATE OR REPLACE FUNCTION run_phase5b_validation_suite()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
WITH
-- Fixed test UUID avoids gen_random_uuid() (VOLATILE — forbidden in IMMUTABLE)
test_uuid AS (SELECT '00000000-0000-0000-0000-000000000001'::uuid AS u),

chain_tests(test_name, actual, expected) AS (VALUES
  ('chain_empty_is_not_null',
   CASE WHEN generate_export_chain_hash(ARRAY[]::text[]) IS NOT NULL
        THEN 'ok' ELSE 'fail' END,
   'ok'),
  ('chain_empty_is_64chars',
   CASE WHEN length(generate_export_chain_hash(ARRAY[]::text[])) = 64
        THEN 'ok' ELSE 'fail' END,
   'ok'),
  ('chain_single_is_64chars',
   CASE WHEN length(generate_export_chain_hash(ARRAY['test_hash'::text])) = 64
        THEN 'ok' ELSE 'fail' END,
   'ok'),
  ('chain_deterministic',
   CASE WHEN generate_export_chain_hash(ARRAY['a'::text, 'b'::text, 'c'::text])
             = generate_export_chain_hash(ARRAY['a'::text, 'b'::text, 'c'::text])
        THEN 'ok' ELSE 'fail' END,
   'ok'),
  ('chain_order_sensitive',
   CASE WHEN generate_export_chain_hash(ARRAY['a'::text, 'b'::text])
             <> generate_export_chain_hash(ARRAY['b'::text, 'a'::text])
        THEN 'ok' ELSE 'fail' END,
   'ok'),
  ('chain_null_input_not_null',
   CASE WHEN generate_export_chain_hash(NULL::text[]) IS NOT NULL
        THEN 'ok' ELSE 'fail' END,
   'ok')
),

manifest_tests(test_name, actual, expected) AS (
  SELECT
    'manifest_has_entity_type',
    CASE WHEN build_certification_manifest(
      'agi_submission', u, 'h1', 'c1', 'l1',
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'v1', 'v1'
    ) ? 'entity_type' THEN 'ok' ELSE 'fail' END,
    'ok'
  FROM test_uuid
  UNION ALL
  SELECT
    'manifest_has_canonical_hash',
    CASE WHEN build_certification_manifest(
      'agi_submission', u, 'h1', 'c1', 'l1',
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'v1', 'v1'
    ) ? 'canonical_hash' THEN 'ok' ELSE 'fail' END,
    'ok'
  FROM test_uuid
  UNION ALL
  SELECT
    'manifest_version_is_5b1',
    CASE WHEN build_certification_manifest(
      'agi_submission', u, 'h1', 'c1', 'l1',
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'v1', 'v1'
    ) ->> 'manifest_version' = '5B.1' THEN 'ok' ELSE 'fail' END,
    'ok'
  FROM test_uuid
  UNION ALL
  SELECT
    'manifest_entity_id_is_canonical_uuid',
    CASE WHEN build_certification_manifest(
      'agi_submission', u, 'h1', 'c1', 'l1',
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'v1', 'v1'
    ) ->> 'entity_id' = canonical_uuid(u) THEN 'ok' ELSE 'fail' END,
    'ok'
  FROM test_uuid
  UNION ALL
  SELECT
    'manifest_is_deterministic',
    CASE WHEN build_certification_manifest(
      'agi_submission', u, 'h1', 'c1', 'l1',
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'v1', 'v1'
    ) = build_certification_manifest(
      'agi_submission', u, 'h1', 'c1', 'l1',
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'v1', 'v1'
    ) THEN 'ok' ELSE 'fail' END,
    'ok'
  FROM test_uuid
),

all_tests AS (
  SELECT * FROM chain_tests
  UNION ALL
  SELECT * FROM manifest_tests
),

evaluated AS (
  SELECT test_name, actual, expected,
    CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS status
  FROM all_tests
)

SELECT jsonb_build_object(
  'suite',    'phase5b_filing_certification_v1',
  'pass',     (SELECT count(*) FILTER (WHERE status = 'PASS') FROM evaluated),
  'fail',     (SELECT count(*) FILTER (WHERE status = 'FAIL') FROM evaluated),
  'total',    (SELECT count(*) FROM evaluated),
  'all_pass', NOT EXISTS (SELECT 1 FROM evaluated WHERE status = 'FAIL'),
  'tests',    (
    SELECT jsonb_agg(
      jsonb_build_object(
        'test',     test_name,
        'status',   status,
        'actual',   actual,
        'expected', expected
      )
      ORDER BY test_name
    )
    FROM evaluated
  )
)
$$;

GRANT EXECUTE ON FUNCTION run_phase5b_validation_suite() TO authenticated, service_role;

-- ── canonicalization_profiles seeds ──────────────────────────────────────────

INSERT INTO canonicalization_profiles (profile_name, profile_type, description, configuration)
VALUES
  (
    'regulatory_certification_v1',
    'json',
    'Phase 5B filing certification profile: certificate_hash, lineage_chain_hash, canonical_payload_hash. Timestamp-free.',
    jsonb_build_object(
      'hash_algorithm',     'sha256',
      'hash_inputs',        ARRAY['entity_id', 'entity_type', 'canonical_payload_hash', 'certification_type', 'reason', 'lineage_chain_hash'],
      'excludes',           ARRAY['certified_at', 'created_at'],
      'chain_algorithm',    'sha256_sequential',
      'genesis_seed',       'genesis',
      'serializer_version', 'serialization_standards_v1',
      'phase',              '5B'
    )
  ),
  (
    'export_lineage_v1',
    'json',
    'Phase 5B export lineage profile: sequential chain_hash per entity, serializer_version compatibility.',
    jsonb_build_object(
      'chain_algorithm',     'sha256_sequential',
      'chain_input',         'prior_chain_hash || | || canonical_hash',
      'genesis_seed',        'genesis',
      'valid_versions',      ARRAY['serialization_standards_v1', 'replay_safe_json_v1', '5B.1'],
      'divergence_detection','canonical_hash vs current entity state',
      'phase',               '5B'
    )
  )
ON CONFLICT (profile_name) DO UPDATE SET
  description   = EXCLUDED.description,
  configuration = EXCLUDED.configuration,
  updated_at    = now();

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_regulatory_certifications_entity
  ON regulatory_certifications (organization_id, entity_type, entity_id, certified_at DESC);

CREATE INDEX IF NOT EXISTS idx_regulatory_certifications_prior
  ON regulatory_certifications (prior_certification_id)
  WHERE prior_certification_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_regulatory_evidence_packages_entity
  ON regulatory_evidence_packages (organization_id, entity_type, entity_id, assembled_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_lineage_records_entity
  ON export_lineage_records (organization_id, entity_type, entity_id, recorded_at ASC);

CREATE INDEX IF NOT EXISTS idx_export_lineage_records_prior
  ON export_lineage_records (prior_lineage_id)
  WHERE prior_lineage_id IS NOT NULL;
