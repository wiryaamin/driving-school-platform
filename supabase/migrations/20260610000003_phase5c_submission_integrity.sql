-- Phase 5C: Cryptographic Trust & Authority Submission
-- Step 3: Trust Chain Hash + Submission Envelope Builder + Integrity Verification

-- ── generate_trust_chain_hash ─────────────────────────────────────────────────
-- IMMUTABLE: SHA-256 recursive chain anchored at 'trust-genesis'.
-- Distinct from generate_export_chain_hash ('genesis') — same input produces different output.
-- Order-sensitive: ARRAY['a','b'] != ARRAY['b','a']

CREATE OR REPLACE FUNCTION generate_trust_chain_hash(p_hashes text[])
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $func$
WITH RECURSIVE chain AS (
  SELECT 0 AS idx,
    encode(sha256('trust-genesis'::bytea), 'hex') AS h
  UNION ALL
  SELECT c.idx + 1,
    encode(
      sha256((c.h || '|' || COALESCE(p_hashes[c.idx + 1], ''))::bytea),
      'hex'
    )
  FROM chain c
  WHERE c.idx < cardinality(COALESCE(p_hashes, ARRAY[]::text[]))
)
SELECT h FROM chain ORDER BY idx DESC LIMIT 1
$func$;

-- ── build_submission_envelope ─────────────────────────────────────────────────
-- Builds a deterministic sealed envelope from the latest certification + evidence package.
-- envelope_hash = SHA-256(canonical_jsonb(envelope_content)::text) — timestamp-free.
-- trust_chain_hash covers: canonical_payload → certificate → lineage → evidence.

CREATE OR REPLACE FUNCTION build_submission_envelope(
  p_org_id      uuid,
  p_entity_type filing_entity_type,
  p_entity_id   uuid,
  p_actor_id    uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cert             regulatory_certifications%ROWTYPE;
  v_evidence         regulatory_evidence_packages%ROWTYPE;
  v_manifest         jsonb;
  v_trust_chain_hash text;
  v_envelope_content jsonb;
  v_envelope_hash    text;
  v_envelope_id      uuid;
  v_evidence_id_text text;
  v_evidence_hash    text;
BEGIN
  SELECT * INTO v_cert
  FROM regulatory_certifications
  WHERE organization_id = p_org_id
    AND entity_type     = p_entity_type
    AND entity_id       = p_entity_id
  ORDER BY certified_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no certification found for %::%', p_entity_type, p_entity_id;
  END IF;

  SELECT * INTO v_evidence
  FROM regulatory_evidence_packages
  WHERE organization_id = p_org_id
    AND entity_type     = p_entity_type
    AND entity_id       = p_entity_id
  ORDER BY assembled_at DESC
  LIMIT 1;

  v_evidence_hash    := COALESCE(v_evidence.evidence_hash, '');
  v_evidence_id_text := CASE WHEN v_evidence.id IS NOT NULL THEN v_evidence.id::text ELSE NULL END;

  -- Trust chain anchors: canonical_payload → certificate → lineage → evidence
  v_trust_chain_hash := generate_trust_chain_hash(ARRAY[
    v_cert.canonical_payload_hash,
    v_cert.certificate_hash,
    v_cert.lineage_chain_hash,
    v_evidence_hash
  ]);

  v_manifest := build_certification_manifest(
    v_cert.entity_type::text,
    v_cert.entity_id,
    v_cert.canonical_payload_hash,
    v_cert.certificate_hash,
    v_cert.lineage_chain_hash,
    to_jsonb(ARRAY[v_cert.id::text]),
    CASE WHEN v_evidence.id IS NOT NULL
         THEN to_jsonb(ARRAY[v_evidence.id::text])
         ELSE '[]'::jsonb END,
    '[]'::jsonb,
    v_cert.serializer_version,
    v_cert.replay_profile_version
  );

  v_envelope_content := canonical_jsonb(jsonb_build_object(
    'entity_type',            canonical_text(p_entity_type::text),
    'entity_id',              canonical_uuid(p_entity_id),
    'organization_id',        canonical_uuid(p_org_id),
    'certification_manifest', v_manifest,
    'evidence_hash',          v_evidence_hash,
    'trust_chain_hash',       v_trust_chain_hash,
    'serializer_version',     canonical_text(v_cert.serializer_version),
    'replay_profile',         canonical_text(v_cert.replay_profile_version),
    'authority_metadata',     '{}'::jsonb,
    'replay_metadata',        jsonb_build_object(
      'certification_id',    v_cert.id::text,
      'evidence_package_id', v_evidence_id_text
    ),
    'envelope_version',       '5C.1'
  ));

  v_envelope_hash := encode(sha256(v_envelope_content::text::bytea), 'hex');

  INSERT INTO submission_envelopes (
    organization_id, entity_type, entity_id,
    certification_id, evidence_package_id,
    canonical_payload_hash, certification_manifest,
    evidence_hash, trust_chain_hash,
    serializer_version, replay_profile,
    authority_metadata, replay_metadata,
    envelope_hash, actor_id
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    v_cert.id, v_evidence.id,
    v_cert.canonical_payload_hash, v_manifest,
    v_evidence_hash, v_trust_chain_hash,
    v_cert.serializer_version, v_cert.replay_profile_version,
    '{}'::jsonb,
    jsonb_build_object(
      'certification_id',    v_cert.id::text,
      'evidence_package_id', v_evidence_id_text
    ),
    v_envelope_hash, p_actor_id
  ) RETURNING id INTO v_envelope_id;

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'submission_envelope_sealed',
    p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'envelope_id',      v_envelope_id,
      'envelope_hash',    v_envelope_hash,
      'trust_chain_hash', v_trust_chain_hash
    )
  );

  RETURN jsonb_build_object(
    'envelope_id',         v_envelope_id,
    'entity_type',         p_entity_type,
    'entity_id',           p_entity_id,
    'envelope_hash',       v_envelope_hash,
    'trust_chain_hash',    v_trust_chain_hash,
    'certification_id',    v_cert.id,
    'evidence_package_id', v_evidence.id,
    'envelope_version',    '5C.1',
    'sealed_at',           now()
  );
END;
$$;

-- ── verify_submission_integrity ───────────────────────────────────────────────
-- Comprehensive integrity check across 5 dimensions:
--   1. envelope_hash re-derivable (tampering detection)
--   2. all certificate signatures cryptographically valid
--   3. all authority receipts hash-verified
--   4. serializer version compatible between envelope and certification
--   5. replay profile consistent between envelope and certification

CREATE OR REPLACE FUNCTION verify_submission_integrity(
  p_org_id      uuid,
  p_entity_type filing_entity_type,
  p_entity_id   uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_envelope            submission_envelopes%ROWTYPE;
  v_recomputed_hash     text;
  v_envelope_content    jsonb;
  v_envelope_valid      boolean;
  v_issues              text[]  := '{}';
  v_checks              jsonb   := '{}';
  v_sig_count           int     := 0;
  v_sig_valid_count     int     := 0;
  v_receipt_count       int     := 0;
  v_receipt_valid_count int     := 0;
  v_cert_serializer     text;
  v_cert_profile        text;
  v_sig_check           jsonb;
  v_receipt_check       jsonb;
  v_rec                 record;
BEGIN
  SELECT * INTO v_envelope
  FROM submission_envelopes
  WHERE organization_id = p_org_id
    AND entity_type     = p_entity_type
    AND entity_id       = p_entity_id
  ORDER BY sealed_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_valid',   false,
      'entity_type', p_entity_type,
      'entity_id',   p_entity_id,
      'error',       'no submission envelope found'
    );
  END IF;

  -- Check 1: Re-derive envelope_hash from stored column values
  -- Must match build_submission_envelope exactly: same canonical structure, same field order
  v_envelope_content := canonical_jsonb(jsonb_build_object(
    'entity_type',            canonical_text(p_entity_type::text),
    'entity_id',              canonical_uuid(p_entity_id),
    'organization_id',        canonical_uuid(p_org_id),
    'certification_manifest', v_envelope.certification_manifest,
    'evidence_hash',          COALESCE(v_envelope.evidence_hash, ''),
    'trust_chain_hash',       COALESCE(v_envelope.trust_chain_hash, ''),
    'serializer_version',     canonical_text(COALESCE(v_envelope.serializer_version, '')),
    'replay_profile',         canonical_text(COALESCE(v_envelope.replay_profile, '')),
    'authority_metadata',     COALESCE(v_envelope.authority_metadata, '{}'::jsonb),
    'replay_metadata',        COALESCE(v_envelope.replay_metadata, '{}'::jsonb),
    'envelope_version',       v_envelope.envelope_version
  ));

  v_recomputed_hash := encode(sha256(v_envelope_content::text::bytea), 'hex');
  v_envelope_valid  := (v_envelope.envelope_hash = v_recomputed_hash);

  IF NOT v_envelope_valid THEN
    v_issues := array_append(v_issues,
      'envelope_hash_mismatch: stored=' || v_envelope.envelope_hash ||
      ' recomputed=' || v_recomputed_hash);
  END IF;

  v_checks := v_checks || jsonb_build_object('envelope_hash_valid', v_envelope_valid);

  -- Check 2: All certificate signatures for this certification
  FOR v_rec IN
    SELECT id FROM certificate_signatures
    WHERE organization_id = p_org_id
      AND certification_id = v_envelope.certification_id
    ORDER BY signed_at ASC
  LOOP
    v_sig_count := v_sig_count + 1;
    v_sig_check := verify_certificate_signature(v_rec.id);
    IF (v_sig_check->>'is_valid')::boolean THEN
      v_sig_valid_count := v_sig_valid_count + 1;
    ELSE
      v_issues := array_append(v_issues, 'signature_invalid: ' || v_rec.id::text);
    END IF;
  END LOOP;

  v_checks := v_checks || jsonb_build_object(
    'signatures_checked',   v_sig_count,
    'signatures_valid',     v_sig_valid_count,
    'all_signatures_valid', (v_sig_count = 0 OR v_sig_count = v_sig_valid_count)
  );

  -- Check 3: All authority receipts for this envelope
  FOR v_rec IN
    SELECT id FROM authority_receipts
    WHERE organization_id      = p_org_id
      AND submission_envelope_id = v_envelope.id
    ORDER BY recorded_at ASC
  LOOP
    v_receipt_count := v_receipt_count + 1;
    v_receipt_check := verify_authority_receipt(v_rec.id);
    IF (v_receipt_check->>'is_valid')::boolean THEN
      v_receipt_valid_count := v_receipt_valid_count + 1;
    ELSE
      v_issues := array_append(v_issues, 'receipt_invalid: ' || v_rec.id::text);
    END IF;
  END LOOP;

  v_checks := v_checks || jsonb_build_object(
    'receipts_checked',   v_receipt_count,
    'receipts_valid',     v_receipt_valid_count,
    'all_receipts_valid', (v_receipt_count = 0 OR v_receipt_count = v_receipt_valid_count)
  );

  -- Check 4: Serializer version compatible with certification
  SELECT serializer_version INTO v_cert_serializer
  FROM regulatory_certifications
  WHERE id = v_envelope.certification_id;

  IF v_cert_serializer IS NOT NULL AND v_cert_serializer <> v_envelope.serializer_version THEN
    v_issues := array_append(v_issues,
      'serializer_version_mismatch: envelope=' || v_envelope.serializer_version ||
      ' cert=' || v_cert_serializer);
  END IF;

  v_checks := v_checks || jsonb_build_object(
    'serializer_version_compatible',
    v_cert_serializer IS NULL OR v_cert_serializer = v_envelope.serializer_version
  );

  -- Check 5: Replay profile consistent with certification
  SELECT replay_profile_version INTO v_cert_profile
  FROM regulatory_certifications
  WHERE id = v_envelope.certification_id;

  IF v_cert_profile IS NOT NULL AND v_cert_profile <> v_envelope.replay_profile THEN
    v_issues := array_append(v_issues,
      'replay_profile_mismatch: envelope=' || v_envelope.replay_profile ||
      ' cert=' || v_cert_profile);
  END IF;

  v_checks := v_checks || jsonb_build_object(
    'replay_profile_consistent',
    v_cert_profile IS NULL OR v_cert_profile = v_envelope.replay_profile
  );

  RETURN jsonb_build_object(
    'is_valid',    array_length(v_issues, 1) IS NULL,
    'entity_type', p_entity_type,
    'entity_id',   p_entity_id,
    'envelope_id', v_envelope.id,
    'issue_count', COALESCE(array_length(v_issues, 1), 0),
    'issues',      to_jsonb(v_issues),
    'checks',      v_checks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_trust_chain_hash(text[])
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION build_submission_envelope(uuid, filing_entity_type, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION verify_submission_integrity(uuid, filing_entity_type, uuid)
  TO authenticated, service_role;
