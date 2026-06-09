-- Phase 5D: Transport Trust & Regulatory Delivery
-- Step 4: Validation Suite + Seed Data + Indexes

-- ── run_phase5d_validation_suite ──────────────────────────────────────────────
-- 11 IMMUTABLE property tests covering:
--   delivery chain determinism, order-sensitivity, genesis isolation,
--   cross-chain distinction (all 3 seeds), length coverage, consistency.
-- No DB reads — safe for parallel queries and index expressions.

CREATE OR REPLACE FUNCTION run_phase5d_validation_suite()
RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $func$
WITH
delivery_chain_tests(test_name, actual, expected) AS (VALUES
  (
    'delivery_chain_empty_not_null',
    CASE WHEN generate_delivery_chain_hash(ARRAY[]::text[]) IS NOT NULL
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'delivery_chain_empty_is_64_chars',
    CASE WHEN length(generate_delivery_chain_hash(ARRAY[]::text[])) = 64
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'delivery_chain_singleton_is_64_chars',
    CASE WHEN length(generate_delivery_chain_hash(ARRAY['abc'::text])) = 64
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'delivery_chain_order_sensitive',
    CASE WHEN generate_delivery_chain_hash(ARRAY['a'::text, 'b'::text])
              <> generate_delivery_chain_hash(ARRAY['b'::text, 'a'::text])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'delivery_chain_deterministic',
    CASE WHEN generate_delivery_chain_hash(ARRAY['x'::text, 'y'::text])
              = generate_delivery_chain_hash(ARRAY['x'::text, 'y'::text])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'delivery_chain_differs_from_trust_chain_singleton',
    CASE WHEN generate_delivery_chain_hash(ARRAY['x'::text])
              <> generate_trust_chain_hash(ARRAY['x'::text])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'delivery_chain_differs_from_export_chain_singleton',
    CASE WHEN generate_delivery_chain_hash(ARRAY['x'::text])
              <> generate_export_chain_hash(ARRAY['x'::text])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'delivery_chain_empty_differs_from_trust_chain_empty',
    CASE WHEN generate_delivery_chain_hash(ARRAY[]::text[])
              <> generate_trust_chain_hash(ARRAY[]::text[])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'delivery_chain_additional_element_changes_hash',
    CASE WHEN generate_delivery_chain_hash(ARRAY['a'::text, 'b'::text])
              <> generate_delivery_chain_hash(ARRAY['a'::text])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'delivery_chain_four_elements_is_64_chars',
    CASE WHEN length(generate_delivery_chain_hash(
           ARRAY['h1'::text, 'h2'::text, 'h3'::text, 'h4'::text]
         )) = 64
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'all_three_genesis_seeds_distinct_on_empty',
    CASE WHEN
      generate_delivery_chain_hash(ARRAY[]::text[]) <>
        generate_trust_chain_hash(ARRAY[]::text[]) AND
      generate_delivery_chain_hash(ARRAY[]::text[]) <>
        generate_export_chain_hash(ARRAY[]::text[]) AND
      generate_trust_chain_hash(ARRAY[]::text[]) <>
        generate_export_chain_hash(ARRAY[]::text[])
    THEN 'ok' ELSE 'fail' END,
    'ok'
  )
),
results AS (
  SELECT
    test_name,
    actual = expected AS passed,
    actual,
    expected
  FROM delivery_chain_tests
)
SELECT jsonb_build_object(
  'suite',      'phase5d_validation',
  'total',      COUNT(*),
  'passed',     SUM(CASE WHEN passed THEN 1 ELSE 0 END),
  'failed',     SUM(CASE WHEN NOT passed THEN 1 ELSE 0 END),
  'all_passed', BOOL_AND(passed),
  'results',    jsonb_agg(jsonb_build_object(
    'test',     test_name,
    'passed',   passed,
    'actual',   actual,
    'expected', expected
  ) ORDER BY test_name)
)
FROM results
$func$;

GRANT EXECUTE ON FUNCTION run_phase5d_validation_suite()
  TO authenticated, service_role;

-- ── Seed: regulatory_endpoints ────────────────────────────────────────────────

INSERT INTO regulatory_endpoints (
  endpoint_key, authority_name, protocol, endpoint_version,
  eidas_compatible, trust_fingerprint, endpoint_identity_hash,
  authority_metadata, transport_metadata
) VALUES
  (
    'skatteverket-agi-v1',
    'Skatteverket',
    'https',
    'v1',
    false,
    encode(sha256('skatteverket-agi-v1-trust-2026'::bytea), 'hex'),
    encode(sha256(canonical_jsonb(jsonb_build_object(
      'endpoint_key',     canonical_text('skatteverket-agi-v1'),
      'authority_name',   canonical_text('Skatteverket'),
      'protocol',         canonical_text('https'),
      'endpoint_version', canonical_text('v1'),
      'trust_fingerprint', encode(sha256('skatteverket-agi-v1-trust-2026'::bytea), 'hex')
    ))::text::bytea), 'hex'),
    '{"system": "AGI", "country": "SE"}'::jsonb,
    '{"timeout_ms": 30000, "retry_max": 3}'::jsonb
  ),
  (
    'skatteverket-vat-v1',
    'Skatteverket',
    'https',
    'v1',
    false,
    encode(sha256('skatteverket-vat-v1-trust-2026'::bytea), 'hex'),
    encode(sha256(canonical_jsonb(jsonb_build_object(
      'endpoint_key',     canonical_text('skatteverket-vat-v1'),
      'authority_name',   canonical_text('Skatteverket'),
      'protocol',         canonical_text('https'),
      'endpoint_version', canonical_text('v1'),
      'trust_fingerprint', encode(sha256('skatteverket-vat-v1-trust-2026'::bytea), 'hex')
    ))::text::bytea), 'hex'),
    '{"system": "VAT", "country": "SE"}'::jsonb,
    '{"timeout_ms": 30000, "retry_max": 3}'::jsonb
  ),
  (
    'bolagsverket-saft-v1',
    'Bolagsverket',
    'sftp',
    'v1',
    true,
    encode(sha256('bolagsverket-saft-v1-trust-2026'::bytea), 'hex'),
    encode(sha256(canonical_jsonb(jsonb_build_object(
      'endpoint_key',     canonical_text('bolagsverket-saft-v1'),
      'authority_name',   canonical_text('Bolagsverket'),
      'protocol',         canonical_text('sftp'),
      'endpoint_version', canonical_text('v1'),
      'trust_fingerprint', encode(sha256('bolagsverket-saft-v1-trust-2026'::bytea), 'hex')
    ))::text::bytea), 'hex'),
    '{"system": "SAF-T", "country": "SE"}'::jsonb,
    '{"timeout_ms": 60000, "retry_max": 5}'::jsonb
  )
ON CONFLICT (endpoint_key) DO NOTHING;

-- ── Seed: canonicalization_profiles for Phase 5D ─────────────────────────────

INSERT INTO canonicalization_profiles (
  profile_name, profile_type, description, configuration, is_active
) VALUES
  (
    'transport_manifest_v1',
    'json',
    'Canonical transport manifest for regulatory delivery (Phase 5D)',
    jsonb_build_object(
      'version',    '5D.1',
      'key_fields', jsonb_build_array(
        'entity_type', 'entity_id', 'organization_id',
        'envelope_hash', 'trust_chain_hash',
        'endpoint_key', 'authority_name', 'protocol', 'endpoint_identity_hash',
        'serializer_version', 'replay_profile', 'manifest_version'
      ),
      'algorithm',  'sha256'
    ),
    true
  ),
  (
    'delivery_chain_v1',
    'json',
    'Delivery chain hash profile with delivery-genesis seed (Phase 5D)',
    jsonb_build_object(
      'version',   '5D.1',
      'genesis',   'delivery-genesis',
      'algorithm', 'sha256',
      'note',      'Distinct from trust-genesis (5C) and genesis (export chain)'
    ),
    true
  )
ON CONFLICT (profile_name) DO NOTHING;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_regulatory_endpoints_active
  ON regulatory_endpoints (is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_regulatory_endpoints_key
  ON regulatory_endpoints (endpoint_key);

CREATE INDEX IF NOT EXISTS idx_transport_manifests_org_entity
  ON transport_manifests (organization_id, entity_type, entity_id, sealed_at DESC);

CREATE INDEX IF NOT EXISTS idx_transport_manifests_envelope
  ON transport_manifests (submission_envelope_id);

CREATE INDEX IF NOT EXISTS idx_transport_manifests_endpoint
  ON transport_manifests (endpoint_id);

CREATE INDEX IF NOT EXISTS idx_submission_deliveries_org_entity
  ON submission_deliveries (organization_id, entity_type, entity_id, initiated_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_deliveries_manifest
  ON submission_deliveries (transport_manifest_id);

CREATE INDEX IF NOT EXISTS idx_submission_deliveries_status
  ON submission_deliveries (delivery_status);

CREATE INDEX IF NOT EXISTS idx_submission_deliveries_prior
  ON submission_deliveries (prior_delivery_id)
  WHERE prior_delivery_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_delivery
  ON delivery_attempts (delivery_id, attempt_number);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_outcome
  ON delivery_attempts (attempt_outcome);
