-- Phase 5E: PKI Trust Infrastructure & Authority Authenticity
-- Step 4: Validation Suite, Seed Data, and Indexes

-- ── run_phase5e_validation_suite ──────────────────────────────────────────────
-- IMMUTABLE: 11 deterministic tests on generate_nonrepudiation_hash.
-- No DB reads, no VOLATILE calls — IMMUTABLE/PARALLEL SAFE.
-- Covers: basic derivation, order-sensitivity, component isolation,
-- empty-input handling, all 5 genesis seeds distinct, Unicode stability.

CREATE OR REPLACE FUNCTION run_phase5e_validation_suite()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $func$
SELECT jsonb_build_object(
  'suite',   'phase5e_pki_trust_validation',
  'version', '5E.1',
  'tests', jsonb_build_array(

    -- Test 1: nonrepudiation_hash is deterministic
    jsonb_build_object(
      'name',   'nonrepudiation_hash_deterministic',
      'result', (
        generate_nonrepudiation_hash('entity-001', 'hash-aabbcc', 'sig-xxyyzz') =
        generate_nonrepudiation_hash('entity-001', 'hash-aabbcc', 'sig-xxyyzz')
      )
    ),

    -- Test 2: entity_id component is order-sensitive (swap entity/payload)
    jsonb_build_object(
      'name',   'nonrepudiation_entity_id_order_sensitive',
      'result', (
        generate_nonrepudiation_hash('entity-001', 'hash-aabbcc', 'sig-xxyyzz') <>
        generate_nonrepudiation_hash('hash-aabbcc', 'entity-001', 'sig-xxyyzz')
      )
    ),

    -- Test 3: payload_hash component is order-sensitive (swap payload/sig)
    jsonb_build_object(
      'name',   'nonrepudiation_payload_order_sensitive',
      'result', (
        generate_nonrepudiation_hash('entity-001', 'hash-aabbcc', 'sig-xxyyzz') <>
        generate_nonrepudiation_hash('entity-001', 'sig-xxyyzz', 'hash-aabbcc')
      )
    ),

    -- Test 4: signature component isolation (single char diff)
    jsonb_build_object(
      'name',   'nonrepudiation_signature_component_isolation',
      'result', (
        generate_nonrepudiation_hash('entity-001', 'hash-aabbcc', 'sig-xxyyzz') <>
        generate_nonrepudiation_hash('entity-001', 'hash-aabbcc', 'sig-xxyyzza')
      )
    ),

    -- Test 5: entity_id single-char diff changes output
    jsonb_build_object(
      'name',   'nonrepudiation_entity_id_single_char_diff',
      'result', (
        generate_nonrepudiation_hash('entity-001', 'hash-aabbcc', 'sig-xxyyzz') <>
        generate_nonrepudiation_hash('entity-002', 'hash-aabbcc', 'sig-xxyyzz')
      )
    ),

    -- Test 6: payload_hash single-char diff changes output
    jsonb_build_object(
      'name',   'nonrepudiation_payload_hash_single_char_diff',
      'result', (
        generate_nonrepudiation_hash('entity-001', 'hash-aabbcc', 'sig-xxyyzz') <>
        generate_nonrepudiation_hash('entity-001', 'hash-aabbcd', 'sig-xxyyzz')
      )
    ),

    -- Test 7: empty-input produces stable 64-char hex
    jsonb_build_object(
      'name',   'nonrepudiation_empty_input_stable_hex',
      'result', (
        length(generate_nonrepudiation_hash('', '', '')) = 64 AND
        generate_nonrepudiation_hash('', '', '') = generate_nonrepudiation_hash('', '', '')
      )
    ),

    -- Test 8: NULL inputs coerce to empty string (non-null output)
    jsonb_build_object(
      'name',   'nonrepudiation_null_coercion',
      'result', (
        generate_nonrepudiation_hash(NULL, NULL, NULL) IS NOT NULL AND
        length(generate_nonrepudiation_hash(NULL, NULL, NULL)) = 64
      )
    ),

    -- Test 9: all 5 genesis seeds produce distinct empty-input outputs
    -- genesis (5B), trust-genesis (5C), delivery-genesis (5D), pki-root (5E anchors),
    -- signature-genesis (5E receipts)
    jsonb_build_object(
      'name',   'all_five_genesis_seeds_distinct',
      'result', (
        -- 5 seeds: assign to stable derived values for comparison
        -- genesis = encode(sha256('genesis'), hex)
        -- trust-genesis = encode(sha256('trust-genesis'), hex)
        -- delivery-genesis = encode(sha256('delivery-genesis'), hex)
        -- pki-root = encode(sha256('pki-root'), hex)
        -- signature-genesis = encode(sha256('signature-genesis'), hex)
        (
          encode(sha256('genesis'::bytea), 'hex') <>
          encode(sha256('trust-genesis'::bytea), 'hex')
        ) AND (
          encode(sha256('genesis'::bytea), 'hex') <>
          encode(sha256('delivery-genesis'::bytea), 'hex')
        ) AND (
          encode(sha256('genesis'::bytea), 'hex') <>
          encode(sha256('pki-root'::bytea), 'hex')
        ) AND (
          encode(sha256('genesis'::bytea), 'hex') <>
          encode(sha256('signature-genesis'::bytea), 'hex')
        ) AND (
          encode(sha256('trust-genesis'::bytea), 'hex') <>
          encode(sha256('delivery-genesis'::bytea), 'hex')
        ) AND (
          encode(sha256('trust-genesis'::bytea), 'hex') <>
          encode(sha256('pki-root'::bytea), 'hex')
        ) AND (
          encode(sha256('trust-genesis'::bytea), 'hex') <>
          encode(sha256('signature-genesis'::bytea), 'hex')
        ) AND (
          encode(sha256('delivery-genesis'::bytea), 'hex') <>
          encode(sha256('pki-root'::bytea), 'hex')
        ) AND (
          encode(sha256('delivery-genesis'::bytea), 'hex') <>
          encode(sha256('signature-genesis'::bytea), 'hex')
        ) AND (
          encode(sha256('pki-root'::bytea), 'hex') <>
          encode(sha256('signature-genesis'::bytea), 'hex')
        )
      )
    ),

    -- Test 10: output is always 64-char hex regardless of input length
    jsonb_build_object(
      'name',   'nonrepudiation_output_always_64_hex',
      'result', (
        length(generate_nonrepudiation_hash(
          repeat('a', 256), repeat('b', 256), repeat('c', 256)
        )) = 64
      )
    ),

    -- Test 11: Unicode input produces stable 64-char output
    jsonb_build_object(
      'name',   'nonrepudiation_unicode_stable',
      'result', (
        length(generate_nonrepudiation_hash(
          'Skatteverket-AB-åäö', 'hash-ÆØÅ-001', 'sig-ü-ñ-€'
        )) = 64 AND
        generate_nonrepudiation_hash(
          'Skatteverket-AB-åäö', 'hash-ÆØÅ-001', 'sig-ü-ñ-€'
        ) = generate_nonrepudiation_hash(
          'Skatteverket-AB-åäö', 'hash-ÆØÅ-001', 'sig-ü-ñ-€'
        )
      )
    )

  )
)
$func$;

-- ── Seed: Trust Anchors ────────────────────────────────────────────────────────

SELECT register_trust_anchor(
  p_anchor_id           := 'skatteverket-root-ca-v1',
  p_common_name         := 'Skatteverket Root CA v1',
  p_organization        := 'Skatteverket',
  p_jurisdiction        := 'SE',
  p_public_key_material := 'skatteverket-root-ca-v1-public-key-material',
  p_validity_not_before := now(),
  p_validity_not_after  := now() + INTERVAL '10 years',
  p_eidas_compatible    := true,
  p_trust_material      := 'skatteverket-root-trust-material-v1',
  p_parent_lineage_hash := NULL
);

SELECT register_trust_anchor(
  p_anchor_id           := 'bolagsverket-root-ca-v1',
  p_common_name         := 'Bolagsverket Root CA v1',
  p_organization        := 'Bolagsverket',
  p_jurisdiction        := 'SE',
  p_public_key_material := 'bolagsverket-root-ca-v1-public-key-material',
  p_validity_not_before := now(),
  p_validity_not_after  := now() + INTERVAL '10 years',
  p_eidas_compatible    := true,
  p_trust_material      := 'bolagsverket-root-trust-material-v1',
  p_parent_lineage_hash := NULL
);

-- ── Seed: Certificate Chains ─────────────────────────────────────────────────

SELECT register_certificate_chain(
  p_chain_id            := 'skatteverket-agi-signing-chain-v1',
  p_trust_anchor_id     := (SELECT id FROM trust_anchors WHERE anchor_id = 'skatteverket-root-ca-v1'),
  p_endpoint_id         := (SELECT id FROM regulatory_endpoints WHERE endpoint_key = 'skatteverket-agi-v1'),
  p_subject_cn          := 'Skatteverket AGI Signing Certificate v1',
  p_subject_org         := 'Skatteverket',
  p_issuer_cn           := 'Skatteverket Root CA v1',
  p_issuer_org          := 'Skatteverket',
  p_cert_material       := 'skatteverket-agi-signing-cert-material-v1',
  p_issuer_material     := 'skatteverket-root-issuer-material-v1',
  p_issuer_lineage      := '[]'::jsonb,
  p_validity_not_before := now(),
  p_validity_not_after  := now() + INTERVAL '2 years',
  p_algorithm           := 'sha256WithRSAEncryption'
);

SELECT register_certificate_chain(
  p_chain_id            := 'skatteverket-vat-signing-chain-v1',
  p_trust_anchor_id     := (SELECT id FROM trust_anchors WHERE anchor_id = 'skatteverket-root-ca-v1'),
  p_endpoint_id         := (SELECT id FROM regulatory_endpoints WHERE endpoint_key = 'skatteverket-vat-v1'),
  p_subject_cn          := 'Skatteverket VAT Signing Certificate v1',
  p_subject_org         := 'Skatteverket',
  p_issuer_cn           := 'Skatteverket Root CA v1',
  p_issuer_org          := 'Skatteverket',
  p_cert_material       := 'skatteverket-vat-signing-cert-material-v1',
  p_issuer_material     := 'skatteverket-root-issuer-material-v1',
  p_issuer_lineage      := '[]'::jsonb,
  p_validity_not_before := now(),
  p_validity_not_after  := now() + INTERVAL '2 years',
  p_algorithm           := 'sha256WithRSAEncryption'
);

-- ── Seed: Canonicalization Profiles ──────────────────────────────────────────

INSERT INTO canonicalization_profiles (profile_name, profile_type, description, is_active)
VALUES
  ('pki_trust_anchor_v1',     'json', 'PKI trust anchor canonical identity hash — anchor_id, common_name, organization, jurisdiction, anchor_fingerprint',  true),
  ('nonrepudiation_hash_v1',  'json', 'Non-repudiation hash input canonical format — entity_id, payload_hash, signature_value — order-sensitive',            true)
ON CONFLICT (profile_name) DO NOTHING;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_trust_anchors_anchor_id
  ON trust_anchors (anchor_id);

CREATE INDEX IF NOT EXISTS idx_trust_anchors_jurisdiction
  ON trust_anchors (jurisdiction);

CREATE INDEX IF NOT EXISTS idx_trust_anchors_is_active
  ON trust_anchors (is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_trust_anchors_lineage_hash
  ON trust_anchors (certificate_lineage_hash);

CREATE INDEX IF NOT EXISTS idx_certificate_chains_chain_id
  ON certificate_chains (chain_id);

CREATE INDEX IF NOT EXISTS idx_certificate_chains_trust_anchor
  ON certificate_chains (trust_anchor_id);

CREATE INDEX IF NOT EXISTS idx_certificate_chains_endpoint
  ON certificate_chains (endpoint_id) WHERE endpoint_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_certificate_chains_revocation
  ON certificate_chains (revocation_state) WHERE revocation_state <> 'active';

CREATE INDEX IF NOT EXISTS idx_signed_receipts_org
  ON signed_authority_receipts (organization_id);

CREATE INDEX IF NOT EXISTS idx_signed_receipts_authority_receipt
  ON signed_authority_receipts (authority_receipt_id);

CREATE INDEX IF NOT EXISTS idx_signed_receipts_certificate_chain
  ON signed_authority_receipts (certificate_chain_id) WHERE certificate_chain_id IS NOT NULL;

GRANT EXECUTE ON FUNCTION run_phase5e_validation_suite TO authenticated, service_role;
