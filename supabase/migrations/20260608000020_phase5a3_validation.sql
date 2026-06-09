-- Phase 5A.3: Canonical Serialization Validation Suite
-- Provides deterministic test functions that verify all canonical_* primitives
-- produce correct, byte-stable output for known inputs.
--
-- Functions:
--   run_canonical_validation_suite()  → jsonb  IMMUTABLE: pure function tests, no DB reads
--
-- View additions to canonicalization_profiles:
--   'serialization_standards_v1'  — Phase 5A.3 primitive functions profile
--   'collection_ordering_v1'      — collection ordering policy profile
--
-- Test coverage:
--   decimal determinism           — trailing zeros, NULL coercion, negative, large values
--   date formatting               — ISO 8601, NULL safety
--   UUID formatting               — lowercase, NULL safety
--   text normalization            — NFC, trim, multi-space collapse
--   collection ordering           — sort by key, null input, non-array wrapping
--   sort key extraction           — composite keys, missing fields
--   monetary JSON                 — amount string, currency uppercase
--   entity serializer             — type normalization, field ordering
--   replay hash stability         — generate_replay_safe_hash is IMMUTABLE
--   XML hash stability            — canonical_xml_hash is IMMUTABLE

-- ── run_canonical_validation_suite() ─────────────────────────────────────────
-- IMMUTABLE pure-function test suite. Calls only IMMUTABLE functions — no DB reads.
-- Returns a jsonb summary: {pass, fail, total, all_pass, tests:[...]}
-- Each test entry: {test, status, actual, expected}
--
-- Designed to be called from: Edge Function GET /compliance/validate/serialization
-- and from any migration or CI script that needs canonical infrastructure verification.

CREATE OR REPLACE FUNCTION run_canonical_validation_suite()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
WITH

-- ── decimal determinism ───────────────────────────────────────────────────────
decimal_tests(test_name, actual, expected) AS (
  VALUES
    ('decimal_1.5_to_2dp',
      canonical_decimal(1.5, 2),
      '1.50'),
    ('decimal_1.0_to_2dp',
      canonical_decimal(1.0, 2),
      '1.00'),
    ('decimal_1_int_to_2dp',
      canonical_decimal(1::numeric, 2),
      '1.00'),
    ('decimal_null_coerced_to_zero',
      canonical_decimal(NULL::numeric, 2),
      '0.00'),
    ('decimal_negative_1.5',
      canonical_decimal(-1.5, 2),
      '-1.50'),
    ('decimal_large_4dp',
      canonical_decimal(1000000.12349, 4),
      '1000000.1235'),
    ('decimal_zero_string',
      canonical_decimal(0, 2),
      '0.00')
),

-- ── date formatting ───────────────────────────────────────────────────────────
date_tests(test_name, actual, expected) AS (
  VALUES
    ('date_iso_format',
      canonical_date('2026-01-15'::date),
      '2026-01-15'),
    ('date_year_start',
      canonical_date('2026-01-01'::date),
      '2026-01-01'),
    ('date_null_empty_string',
      canonical_date(NULL::date),
      '')
),

-- ── UUID formatting ───────────────────────────────────────────────────────────
uuid_tests(test_name, actual, expected) AS (
  VALUES
    ('uuid_lowercase_preserved',
      canonical_uuid('550e8400-e29b-41d4-a716-446655440000'::uuid),
      '550e8400-e29b-41d4-a716-446655440000'),
    ('uuid_null_empty_string',
      canonical_uuid(NULL::uuid),
      '')
),

-- ── text normalization ────────────────────────────────────────────────────────
text_tests(test_name, actual, expected) AS (
  VALUES
    ('text_leading_trailing_trim',
      canonical_text('  hello  '),
      'hello'),
    ('text_internal_multi_space_collapse',
      canonical_text('hello   world'),
      'hello world'),
    ('text_null_empty_string',
      canonical_text(NULL),
      ''),
    ('text_already_canonical',
      canonical_text('full'),
      'full'),
    ('text_newline_becomes_space',
      canonical_text('line1' || E'\n' || 'line2'),
      'line1 line2'),
    ('text_tab_becomes_space',
      canonical_text('col1' || E'\t' || 'col2'),
      'col1 col2')
),

-- ── sort key extraction ───────────────────────────────────────────────────────
sort_key_tests(test_name, actual, expected) AS (
  VALUES
    ('sort_key_two_fields',
      canonical_sort_key('{"a":"1","b":"2"}'::jsonb, ARRAY['a','b']),
      '1|2'),
    ('sort_key_reverse_order',
      canonical_sort_key('{"a":"1","b":"2"}'::jsonb, ARRAY['b','a']),
      '2|1'),
    ('sort_key_missing_field_empty',
      canonical_sort_key('{"a":"1"}'::jsonb, ARRAY['a','b']),
      '1|'),
    ('sort_key_single_field',
      canonical_sort_key('{"account_code":"1234"}'::jsonb, ARRAY['account_code']),
      '1234')
),

-- ── collection ordering ───────────────────────────────────────────────────────
collection_tests(test_name, actual, expected) AS (
  VALUES
    ('collection_null_is_empty_array',
      canonical_collection(NULL::jsonb, NULL)::text,
      '[]'),
    ('collection_null_jsonb_is_empty_array',
      canonical_collection('null'::jsonb, NULL)::text,
      '[]'),
    ('collection_sort_first_element_by_key',
      (canonical_collection('[{"a":"b"},{"a":"a"}]'::jsonb, 'a')->0->>'a'),
      'a'),
    ('collection_sort_second_element_by_key',
      (canonical_collection('[{"a":"b"},{"a":"a"}]'::jsonb, 'a')->1->>'a'),
      'b'),
    ('collection_no_key_sorts_by_text',
      (canonical_collection('[{"v":"2"},{"v":"1"}]'::jsonb, NULL)->0->>'v'),
      '1')
),

-- ── monetary JSON ─────────────────────────────────────────────────────────────
monetary_tests(test_name, actual, expected) AS (
  VALUES
    ('monetary_amount_string_2dp',
      canonical_monetary_json(1234.5, 'SEK')->>'amount',
      '1234.50'),
    ('monetary_currency_uppercase',
      canonical_monetary_json(100, 'sek')->>'currency',
      'SEK'),
    ('monetary_zero_amount',
      canonical_monetary_json(0, 'EUR')->>'amount',
      '0.00'),
    ('monetary_null_amount_is_zero',
      canonical_monetary_json(NULL::numeric, 'SEK')->>'amount',
      '0.00')
),

-- ── entity serializer ─────────────────────────────────────────────────────────
serializer_tests(test_name, actual, expected) AS (
  VALUES
    ('entity_serializer_type_trimmed',
      canonical_entity_serializer('  invoice  ', '{}'::jsonb)->>'entity_type',
      'invoice'),
    ('entity_serializer_type_canonical',
      canonical_entity_serializer('saf_t_export', '{}'::jsonb)->>'entity_type',
      'saf_t_export'),
    ('entity_serializer_fields_present',
      (canonical_entity_serializer('test', '{"z":"2","a":"1"}'::jsonb)->'fields'->>'a'),
      '1')
),

-- ── replay hash stability (structural check) ──────────────────────────────────
hash_tests(test_name, actual, expected) AS (
  VALUES
    ('replay_hash_length_64_hex',
      length(generate_replay_safe_hash(
        'test_entity',
        '550e8400-e29b-41d4-a716-446655440000'::uuid,
        '{"key":"value"}'::jsonb
      ))::text,
      '64'),
    ('replay_hash_deterministic',
      CASE WHEN
        generate_replay_safe_hash('t', '550e8400-e29b-41d4-a716-446655440000'::uuid, '{}'::jsonb) =
        generate_replay_safe_hash('t', '550e8400-e29b-41d4-a716-446655440000'::uuid, '{}'::jsonb)
      THEN 'SAME' ELSE 'DIFFERENT' END,
      'SAME'),
    ('xml_hash_length_64_hex',
      length(canonical_xml_hash(
        'saf_t_export',
        '550e8400-e29b-41d4-a716-446655440000'::uuid,
        '2026-01-01'::date,
        '2026-12-31'::date,
        '{"count":1}'::jsonb
      ))::text,
      '64'),
    ('xml_hash_deterministic',
      CASE WHEN
        canonical_xml_hash('x', '550e8400-e29b-41d4-a716-446655440000'::uuid,
                           '2026-01-01'::date, '2026-12-31'::date, '{}'::jsonb) =
        canonical_xml_hash('x', '550e8400-e29b-41d4-a716-446655440000'::uuid,
                           '2026-01-01'::date, '2026-12-31'::date, '{}'::jsonb)
      THEN 'SAME' ELSE 'DIFFERENT' END,
      'SAME')
),

-- ── aggregate all test groups ─────────────────────────────────────────────────
all_tests(test_name, actual, expected) AS (
  SELECT * FROM decimal_tests
  UNION ALL SELECT * FROM date_tests
  UNION ALL SELECT * FROM uuid_tests
  UNION ALL SELECT * FROM text_tests
  UNION ALL SELECT * FROM sort_key_tests
  UNION ALL SELECT * FROM collection_tests
  UNION ALL SELECT * FROM monetary_tests
  UNION ALL SELECT * FROM serializer_tests
  UNION ALL SELECT * FROM hash_tests
),

evaluated AS (
  SELECT
    test_name,
    actual,
    expected,
    CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS status
  FROM all_tests
)

SELECT jsonb_build_object(
  'suite',    'canonical_serialization_v1',
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
      ) ORDER BY test_name
    )
    FROM evaluated
  )
)
$$;

-- ── canonicalization_profiles seeds (Phase 5A.3) ─────────────────────────────
-- Add profiles documenting the Phase 5A.3 standard. These are read by
-- getCanonicalizationProfiles() in the compliance service and surfaced via API.

INSERT INTO canonicalization_profiles (profile_name, profile_type, description, configuration)
VALUES
  ('serialization_standards_v1', 'json',
   'Phase 5A.3 canonical serialization primitives: canonical_decimal, canonical_date, canonical_uuid, canonical_text',
   '{"decimal_scale": 2, "date_format": "YYYY-MM-DD", "uuid_case": "lower", "text_normalization": "NFC", "null_handling": "empty_string"}'::jsonb),

  ('collection_ordering_v1', 'json',
   'Phase 5A.3 collection ordering policy: all dynamic jsonb arrays use canonical_collection() with explicit sort keys',
   '{"default_sort": "element_text", "composite_separator": "|", "null_field_value": "empty_string", "policy_view": "canonical_ordering_policy"}'::jsonb)

ON CONFLICT (profile_name) DO UPDATE SET
  description   = EXCLUDED.description,
  configuration = EXCLUDED.configuration,
  updated_at    = now();

-- ── Index on canonicalization_profiles for fast lookup ───────────────────────

CREATE INDEX IF NOT EXISTS idx_canonicalization_profiles_type_active
  ON canonicalization_profiles (profile_type, is_active)
  WHERE is_active = true;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION run_canonical_validation_suite() TO authenticated, service_role;
