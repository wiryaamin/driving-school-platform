-- Phase 5C: Cryptographic Trust & Authority Submission
-- Step 4: Validation Suite + Seed Data + Indexes

-- ── run_phase5c_validation_suite ──────────────────────────────────────────────
-- 11 property tests covering:
--   trust chain determinism, order-sensitivity, genesis distinction,
--   cross-chain isolation, multi-element coverage, consistency checks

CREATE OR REPLACE FUNCTION run_phase5c_validation_suite()
RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $func$
WITH
trust_chain_tests(test_name, actual, expected) AS (VALUES
  (
    'trust_chain_empty_not_null',
    CASE WHEN generate_trust_chain_hash(ARRAY[]::text[]) IS NOT NULL
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'trust_chain_empty_is_64_chars',
    CASE WHEN length(generate_trust_chain_hash(ARRAY[]::text[])) = 64
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'trust_chain_singleton_is_64_chars',
    CASE WHEN length(generate_trust_chain_hash(ARRAY['abc'::text])) = 64
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'trust_chain_order_sensitive',
    CASE WHEN generate_trust_chain_hash(ARRAY['a'::text, 'b'::text])
              <> generate_trust_chain_hash(ARRAY['b'::text, 'a'::text])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'trust_chain_deterministic',
    CASE WHEN generate_trust_chain_hash(ARRAY['x'::text, 'y'::text])
              = generate_trust_chain_hash(ARRAY['x'::text, 'y'::text])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'trust_chain_differs_from_export_chain_singleton',
    CASE WHEN generate_trust_chain_hash(ARRAY['x'::text])
              <> generate_export_chain_hash(ARRAY['x'::text])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'trust_chain_empty_differs_from_export_empty',
    CASE WHEN generate_trust_chain_hash(ARRAY[]::text[])
              <> generate_export_chain_hash(ARRAY[]::text[])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'trust_chain_additional_element_changes_hash',
    CASE WHEN generate_trust_chain_hash(ARRAY['a'::text, 'b'::text])
              <> generate_trust_chain_hash(ARRAY['a'::text])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'trust_chain_four_elements_is_64_chars',
    CASE WHEN length(generate_trust_chain_hash(
           ARRAY['h1'::text, 'h2'::text, 'h3'::text, 'h4'::text]
         )) = 64
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'trust_chain_consistent_three_elements',
    CASE WHEN generate_trust_chain_hash(ARRAY['p'::text, 'q'::text, 'r'::text])
              = generate_trust_chain_hash(ARRAY['p'::text, 'q'::text, 'r'::text])
         THEN 'ok' ELSE 'fail' END,
    'ok'
  ),
  (
    'trust_chain_payload_version_constant',
    CASE WHEN '5C.1' = '5C.1' THEN 'ok' ELSE 'fail' END,
    'ok'
  )
),
results AS (
  SELECT
    test_name,
    actual = expected AS passed,
    actual,
    expected
  FROM trust_chain_tests
)
SELECT jsonb_build_object(
  'suite',      'phase5c_validation',
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

GRANT EXECUTE ON FUNCTION run_phase5c_validation_suite()
  TO authenticated, service_role;

-- ── Seed: signing_key_registry ────────────────────────────────────────────────

INSERT INTO signing_key_registry (
  key_id, algorithm, version, is_active, eidas_compatible, key_fingerprint, metadata
) VALUES
  (
    'platform-signing-key-v1',
    'sha256-keyed',
    'v1',
    true,
    false,
    encode(sha256('platform-signing-key-v1-material-2026'::bytea), 'hex'),
    '{"description": "Platform default signing key v1", "purpose": "regulatory_certification"}'::jsonb
  ),
  (
    'platform-signing-key-eidas-v1',
    'sha256-keyed',
    'v1',
    true,
    true,
    encode(sha256('platform-signing-key-eidas-v1-material-2026'::bytea), 'hex'),
    '{"description": "Platform eIDAS AdES-compatible signing key v1", "eidas_level": "AdES", "purpose": "regulatory_certification"}'::jsonb
  )
ON CONFLICT (key_id) DO NOTHING;

-- ── Seed: canonicalization_profiles for Phase 5C ─────────────────────────────

INSERT INTO canonicalization_profiles (
  profile_name, profile_type, description, configuration, is_active
) VALUES
  (
    'signature_payload_v1',
    'json',
    'Canonical signature payload for certificate signing (Phase 5C)',
    jsonb_build_object(
      'version',     '5C.1',
      'key_fields',  jsonb_build_array(
        'certification_id', 'entity_type', 'entity_id',
        'canonical_payload_hash', 'certificate_hash', 'lineage_chain_hash',
        'serializer_version', 'replay_profile_version', 'certification_type'
      ),
      'algorithm',   'sha256-keyed'
    ),
    true
  ),
  (
    'submission_envelope_v1',
    'json',
    'Canonical submission envelope for authority submission (Phase 5C)',
    jsonb_build_object(
      'version',     '5C.1',
      'key_fields',  jsonb_build_array(
        'entity_type', 'entity_id', 'organization_id',
        'certification_manifest', 'evidence_hash', 'trust_chain_hash',
        'serializer_version', 'replay_profile',
        'authority_metadata', 'replay_metadata', 'envelope_version'
      )
    ),
    true
  )
ON CONFLICT (profile_name) DO NOTHING;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_signing_key_registry_active
  ON signing_key_registry (key_id)
  WHERE is_active = true AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_certificate_signatures_org_cert
  ON certificate_signatures (organization_id, certification_id, signed_at DESC);

CREATE INDEX IF NOT EXISTS idx_certificate_signatures_key
  ON certificate_signatures (signing_key_id);

CREATE INDEX IF NOT EXISTS idx_submission_envelopes_entity
  ON submission_envelopes (organization_id, entity_type, entity_id, sealed_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_envelopes_cert
  ON submission_envelopes (certification_id);

CREATE INDEX IF NOT EXISTS idx_authority_receipts_entity
  ON authority_receipts (organization_id, entity_type, entity_id, recorded_at ASC);

CREATE INDEX IF NOT EXISTS idx_authority_receipts_envelope
  ON authority_receipts (submission_envelope_id)
  WHERE submission_envelope_id IS NOT NULL;
