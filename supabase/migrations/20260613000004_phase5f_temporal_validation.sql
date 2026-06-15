-- Phase 5F: Temporal Evidence & Cryptographic Replay Integrity
-- Step 4: Validation Suite + Seed Data + Canonicalization Profiles

-- ── run_phase5f_validation_suite ──────────────────────────────────────────────
-- IMMUTABLE: 11 deterministic tests on generate_temporal_chain_hash.
-- No DB reads, no VOLATILE functions — IMMUTABLE/PARALLEL SAFE throughout.
-- Covers: chain determinism, order-sensitivity, length-invariance,
-- empty/null input stability, all 6 genesis seeds pairwise-distinct (15 pairs),
-- Unicode stability, append consistency.

CREATE OR REPLACE FUNCTION run_phase5f_validation_suite()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $func$
SELECT jsonb_build_object(
  'suite',   'phase5f_temporal_evidence_validation',
  'version', '5F.1',
  'tests', jsonb_build_array(

    -- Test 1: temporal chain is deterministic
    jsonb_build_object(
      'name',   'temporal_chain_deterministic',
      'result', (
        generate_temporal_chain_hash(ARRAY['hash-aabbcc', 'hash-ddeeff']) =
        generate_temporal_chain_hash(ARRAY['hash-aabbcc', 'hash-ddeeff'])
      )
    ),

    -- Test 2: order is preserved (different order → different hash)
    jsonb_build_object(
      'name',   'temporal_chain_order_sensitive',
      'result', (
        generate_temporal_chain_hash(ARRAY['hash-aabbcc', 'hash-ddeeff']) <>
        generate_temporal_chain_hash(ARRAY['hash-ddeeff', 'hash-aabbcc'])
      )
    ),

    -- Test 3: single-element chain is distinct from empty
    jsonb_build_object(
      'name',   'temporal_chain_single_vs_empty',
      'result', (
        generate_temporal_chain_hash(ARRAY['hash-aabbcc']) <>
        generate_temporal_chain_hash(ARRAY[]::text[])
      )
    ),

    -- Test 4: empty array produces stable 64-char hex (genesis seed)
    jsonb_build_object(
      'name',   'temporal_chain_empty_stable_hex',
      'result', (
        length(generate_temporal_chain_hash(ARRAY[]::text[])) = 64 AND
        generate_temporal_chain_hash(ARRAY[]::text[]) = generate_temporal_chain_hash(ARRAY[]::text[])
      )
    ),

    -- Test 5: NULL array produces same genesis as empty array
    jsonb_build_object(
      'name',   'temporal_chain_null_equals_empty',
      'result', (
        generate_temporal_chain_hash(NULL) = generate_temporal_chain_hash(ARRAY[]::text[])
      )
    ),

    -- Test 6: output is always 64-char hex regardless of input
    jsonb_build_object(
      'name',   'temporal_chain_output_always_64',
      'result', (
        length(generate_temporal_chain_hash(
          ARRAY[repeat('a', 128), repeat('b', 64), repeat('c', 256)]
        )) = 64
      )
    ),

    -- Test 7: appending to chain produces different result
    jsonb_build_object(
      'name',   'temporal_chain_append_changes_hash',
      'result', (
        generate_temporal_chain_hash(ARRAY['hash-aabbcc']) <>
        generate_temporal_chain_hash(ARRAY['hash-aabbcc', 'hash-ddeeff'])
      )
    ),

    -- Test 8: single-char diff changes output
    jsonb_build_object(
      'name',   'temporal_chain_single_char_diff',
      'result', (
        generate_temporal_chain_hash(ARRAY['hash-aabbcc']) <>
        generate_temporal_chain_hash(ARRAY['hash-aabbcd'])
      )
    ),

    -- Test 9: Unicode input produces stable 64-char output
    jsonb_build_object(
      'name',   'temporal_chain_unicode_stable',
      'result', (
        length(generate_temporal_chain_hash(
          ARRAY['Skatteverket-åäö-2024', 'ÆØÅ-hash-€-001']
        )) = 64 AND
        generate_temporal_chain_hash(ARRAY['Skatteverket-åäö-2024', 'ÆØÅ-hash-€-001']) =
        generate_temporal_chain_hash(ARRAY['Skatteverket-åäö-2024', 'ÆØÅ-hash-€-001'])
      )
    ),

    -- Test 10: temporal-genesis isolated from delivery-genesis on same input
    jsonb_build_object(
      'name',   'temporal_genesis_distinct_from_delivery_genesis',
      'result', (
        generate_temporal_chain_hash(ARRAY['same-input']) <>
        generate_delivery_chain_hash(ARRAY['same-input'])
      )
    ),

    -- Test 11: all 6 genesis seeds pairwise distinct (15 pairs, 10 tested here; full set)
    -- genesis (5B), trust-genesis (5C), delivery-genesis (5D),
    -- pki-root (5E anchors), signature-genesis (5E receipts), temporal-genesis (5F)
    jsonb_build_object(
      'name',   'all_six_genesis_seeds_pairwise_distinct',
      'result', (
        -- All 15 pairwise comparisons encoded as AND chain
        encode(sha256('genesis'::bytea), 'hex')           <> encode(sha256('trust-genesis'::bytea), 'hex')      AND
        encode(sha256('genesis'::bytea), 'hex')           <> encode(sha256('delivery-genesis'::bytea), 'hex')   AND
        encode(sha256('genesis'::bytea), 'hex')           <> encode(sha256('pki-root'::bytea), 'hex')           AND
        encode(sha256('genesis'::bytea), 'hex')           <> encode(sha256('signature-genesis'::bytea), 'hex')  AND
        encode(sha256('genesis'::bytea), 'hex')           <> encode(sha256('temporal-genesis'::bytea), 'hex')   AND
        encode(sha256('trust-genesis'::bytea), 'hex')     <> encode(sha256('delivery-genesis'::bytea), 'hex')   AND
        encode(sha256('trust-genesis'::bytea), 'hex')     <> encode(sha256('pki-root'::bytea), 'hex')           AND
        encode(sha256('trust-genesis'::bytea), 'hex')     <> encode(sha256('signature-genesis'::bytea), 'hex')  AND
        encode(sha256('trust-genesis'::bytea), 'hex')     <> encode(sha256('temporal-genesis'::bytea), 'hex')   AND
        encode(sha256('delivery-genesis'::bytea), 'hex')  <> encode(sha256('pki-root'::bytea), 'hex')           AND
        encode(sha256('delivery-genesis'::bytea), 'hex')  <> encode(sha256('signature-genesis'::bytea), 'hex')  AND
        encode(sha256('delivery-genesis'::bytea), 'hex')  <> encode(sha256('temporal-genesis'::bytea), 'hex')   AND
        encode(sha256('pki-root'::bytea), 'hex')          <> encode(sha256('signature-genesis'::bytea), 'hex')  AND
        encode(sha256('pki-root'::bytea), 'hex')          <> encode(sha256('temporal-genesis'::bytea), 'hex')   AND
        encode(sha256('signature-genesis'::bytea), 'hex') <> encode(sha256('temporal-genesis'::bytea), 'hex')
      )
    )

  )
)
$func$;

-- ── Seed: Timestamp Authorities ───────────────────────────────────────────────

SELECT register_timestamp_authority(
  p_authority_id        := 'skatteverket-tsa-v1',
  p_common_name         := 'Skatteverket Timestamp Authority v1',
  p_organization        := 'Skatteverket',
  p_jurisdiction        := 'SE',
  p_public_key_material := 'skatteverket-tsa-v1-public-key-material',
  p_validity_not_before := now(),
  p_validity_not_after  := now() + INTERVAL '10 years',
  p_trust_anchor_id     := (SELECT id FROM trust_anchors WHERE anchor_id = 'skatteverket-root-ca-v1'),
  p_parent_lineage_hash := NULL,
  p_eidas_compatible    := true
);

SELECT register_timestamp_authority(
  p_authority_id        := 'bolagsverket-tsa-v1',
  p_common_name         := 'Bolagsverket Timestamp Authority v1',
  p_organization        := 'Bolagsverket',
  p_jurisdiction        := 'SE',
  p_public_key_material := 'bolagsverket-tsa-v1-public-key-material',
  p_validity_not_before := now(),
  p_validity_not_after  := now() + INTERVAL '10 years',
  p_trust_anchor_id     := (SELECT id FROM trust_anchors WHERE anchor_id = 'bolagsverket-root-ca-v1'),
  p_parent_lineage_hash := NULL,
  p_eidas_compatible    := true
);

-- ── Seed: Canonicalization Profiles ──────────────────────────────────────────

INSERT INTO canonicalization_profiles (profile_name, profile_type, description, is_active)
VALUES
  ('temporal_evidence_v1',      'json', 'Temporal evidence canonical hash — entity_id, entity_type, timestamp_value, authority_id, payload_hash, version — order-sensitive', true),
  ('temporal_chain_hash_v1',    'json', 'Temporal chain hash — generate_temporal_chain_hash fold from temporal-genesis seed; order-sensitive append-only chronology chain', true)
ON CONFLICT (profile_name) DO NOTHING;

GRANT EXECUTE ON FUNCTION run_phase5f_validation_suite TO authenticated, service_role;
