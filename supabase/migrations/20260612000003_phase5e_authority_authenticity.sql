-- Phase 5E: PKI Trust Infrastructure & Authority Authenticity
-- Step 3: Signed Authority Receipts + Non-Repudiation + Transport Authenticity

-- ── signed_authority_receipts ─────────────────────────────────────────────────
-- Immutable: once recorded, signatures cannot be altered.
-- signature_payload_hash      = SHA-256(canonical_jsonb of 7 authority_receipt fields)
-- nonrepudiation_hash         = generate_nonrepudiation_hash(entity_id, payload_hash, signature)
-- transport_signature_lineage = SHA-256(prior_lineage ?? signature-genesis || '|' || nonrepudiation_hash)
-- 'signature-genesis' is the 5th distinct chain seed, isolated from delivery/trust/export/pki-root.

CREATE TABLE signed_authority_receipts (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  authority_receipt_id        uuid        NOT NULL REFERENCES authority_receipts(id) ON DELETE RESTRICT,
  certificate_chain_id        uuid        REFERENCES certificate_chains(id) ON DELETE RESTRICT,
  detached_signature          text        NOT NULL,
  signature_algorithm         text        NOT NULL DEFAULT 'sha256-keyed',
  signature_payload_hash      text        NOT NULL,
  nonrepudiation_hash         text        NOT NULL,
  transport_signature_lineage text        NOT NULL,
  authority_certificate_ref   text,
  verified_at                 timestamptz,
  actor_id                    uuid        REFERENCES auth.users(id),
  metadata                    jsonb       NOT NULL DEFAULT '{}',
  recorded_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_sar_payload_hash  CHECK (length(signature_payload_hash) = 64),
  CONSTRAINT chk_sar_nrhash        CHECK (length(nonrepudiation_hash) = 64),
  CONSTRAINT chk_sar_lineage_hash  CHECK (length(transport_signature_lineage) = 64)
);

ALTER TABLE signed_authority_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY signed_authority_receipts_select ON signed_authority_receipts
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY signed_authority_receipts_service ON signed_authority_receipts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION prevent_signed_receipt_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'signed_authority_receipts records are immutable and cannot be % after creation', TG_OP;
END;
$$;

CREATE TRIGGER trg_signed_authority_receipts_immutable
BEFORE UPDATE OR DELETE ON signed_authority_receipts
FOR EACH ROW EXECUTE FUNCTION prevent_signed_receipt_modification();

-- ── generate_nonrepudiation_hash ──────────────────────────────────────────────
-- IMMUTABLE: deterministic SHA-256 over entity_id, payload_hash, signature_value.
-- Used in both register and verify to guarantee identical re-derivation.
-- All three inputs are order-sensitive — swapping any two produces a different hash.

CREATE OR REPLACE FUNCTION generate_nonrepudiation_hash(
  p_entity_id       text,
  p_payload_hash    text,
  p_signature_value text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $func$
SELECT encode(sha256((
  COALESCE(p_entity_id, '')       || '|' ||
  COALESCE(p_payload_hash, '')    || '|' ||
  COALESCE(p_signature_value, '')
)::bytea), 'hex')
$func$;

-- ── register_signed_authority_receipt ────────────────────────────────────────
-- Attaches a detached PKI signature to an authority_receipt.
-- signature_payload_hash covers 7 canonical receipt fields (entity_type, entity_id,
-- authority_name, submission_hash, receipt_hash, org, receipt_id).
-- transport_signature_lineage chains from prior receipt lineage for the entity
-- (or 'signature-genesis' for the first receipt).

CREATE OR REPLACE FUNCTION register_signed_authority_receipt(
  p_org_id                   uuid,
  p_authority_receipt_id     uuid,
  p_detached_signature       text,
  p_certificate_chain_id     uuid DEFAULT NULL,
  p_signature_algorithm      text DEFAULT 'sha256-keyed',
  p_authority_certificate_ref text DEFAULT NULL,
  p_actor_id                 uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_receipt                authority_receipts%ROWTYPE;
  v_signature_payload_hash text;
  v_nonrepudiation_hash    text;
  v_prior_lineage_hash     text;
  v_transport_sig_lineage  text;
  v_new_id                 uuid;
BEGIN
  SELECT * INTO v_receipt
  FROM authority_receipts
  WHERE id = p_authority_receipt_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authority receipt not found: %', p_authority_receipt_id;
  END IF;

  -- signature_payload_hash: canonical jsonb of 7 deterministic receipt fields
  v_signature_payload_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'receipt_id',       canonical_uuid(p_authority_receipt_id),
      'organization_id',  canonical_uuid(p_org_id),
      'entity_type',      canonical_text(v_receipt.entity_type::text),
      'entity_id',        canonical_uuid(v_receipt.entity_id),
      'authority_name',   canonical_text(v_receipt.authority_name),
      'submission_hash',  COALESCE(v_receipt.submission_hash, ''),
      'receipt_hash',     COALESCE(v_receipt.receipt_hash, '')
    ))::text::bytea
  ), 'hex');

  -- nonrepudiation_hash: IMMUTABLE, order-sensitive
  v_nonrepudiation_hash := generate_nonrepudiation_hash(
    v_receipt.entity_id::text,
    v_signature_payload_hash,
    p_detached_signature
  );

  -- transport_signature_lineage: chain from prior lineage for this entity
  SELECT sar.transport_signature_lineage INTO v_prior_lineage_hash
  FROM signed_authority_receipts sar
  JOIN authority_receipts ar ON ar.id = sar.authority_receipt_id
  WHERE sar.organization_id = p_org_id
    AND ar.entity_id = v_receipt.entity_id
  ORDER BY sar.recorded_at DESC
  LIMIT 1;

  v_transport_sig_lineage := encode(sha256((
    COALESCE(
      v_prior_lineage_hash,
      encode(sha256('signature-genesis'::bytea), 'hex')
    ) || '|' || v_nonrepudiation_hash
  )::bytea), 'hex');

  v_new_id := gen_random_uuid();

  INSERT INTO signed_authority_receipts (
    id, organization_id, authority_receipt_id, certificate_chain_id,
    detached_signature, signature_algorithm,
    signature_payload_hash, nonrepudiation_hash, transport_signature_lineage,
    authority_certificate_ref, actor_id
  ) VALUES (
    v_new_id, p_org_id, p_authority_receipt_id, p_certificate_chain_id,
    p_detached_signature, COALESCE(p_signature_algorithm, 'sha256-keyed'),
    v_signature_payload_hash, v_nonrepudiation_hash, v_transport_sig_lineage,
    p_authority_certificate_ref, p_actor_id
  );

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'signed_receipt_registered',
    v_receipt.entity_type::text, v_receipt.entity_id, p_actor_id,
    jsonb_build_object(
      'signed_receipt_id',          v_new_id::text,
      'signature_payload_hash',     v_signature_payload_hash,
      'nonrepudiation_hash',        v_nonrepudiation_hash,
      'transport_signature_lineage', v_transport_sig_lineage
    )
  );

  RETURN jsonb_build_object(
    'id',                          v_new_id,
    'signature_payload_hash',      v_signature_payload_hash,
    'nonrepudiation_hash',         v_nonrepudiation_hash,
    'transport_signature_lineage', v_transport_sig_lineage
  );
END;
$$;

-- ── verify_authority_signature ────────────────────────────────────────────────
-- Re-derives signature_payload_hash and nonrepudiation_hash from stored receipt fields.
-- payload_hash_match = true → receipt content unchanged since signing.
-- nonrepudiation_match = true → signature + entity_id + payload form intact triangle.

CREATE OR REPLACE FUNCTION verify_authority_signature(p_signed_receipt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_signed              signed_authority_receipts%ROWTYPE;
  v_receipt             authority_receipts%ROWTYPE;
  v_recomputed_payload  text;
  v_recomputed_nrhash   text;
  v_payload_match       boolean;
  v_nrhash_match        boolean;
BEGIN
  SELECT * INTO v_signed FROM signed_authority_receipts WHERE id = p_signed_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signed authority receipt not found: %', p_signed_receipt_id;
  END IF;

  SELECT * INTO v_receipt FROM authority_receipts WHERE id = v_signed.authority_receipt_id;

  -- Re-derive signature_payload_hash using same 7-field structure
  v_recomputed_payload := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'receipt_id',       canonical_uuid(v_signed.authority_receipt_id),
      'organization_id',  canonical_uuid(v_signed.organization_id),
      'entity_type',      canonical_text(v_receipt.entity_type::text),
      'entity_id',        canonical_uuid(v_receipt.entity_id),
      'authority_name',   canonical_text(v_receipt.authority_name),
      'submission_hash',  COALESCE(v_receipt.submission_hash, ''),
      'receipt_hash',     COALESCE(v_receipt.receipt_hash, '')
    ))::text::bytea
  ), 'hex');

  v_payload_match := (v_recomputed_payload = v_signed.signature_payload_hash);

  -- Re-derive nonrepudiation_hash
  v_recomputed_nrhash := generate_nonrepudiation_hash(
    v_receipt.entity_id::text,
    v_recomputed_payload,
    v_signed.detached_signature
  );

  v_nrhash_match := (v_recomputed_nrhash = v_signed.nonrepudiation_hash);

  RETURN jsonb_build_object(
    'is_valid',             v_payload_match AND v_nrhash_match,
    'payload_hash_match',   v_payload_match,
    'nonrepudiation_match', v_nrhash_match,
    'signed_receipt_id',    v_signed.id
  );
END;
$$;

-- ── verify_transport_authenticity ─────────────────────────────────────────────
-- 5-check PKI authenticity verification for the latest delivery of an entity.
-- Check 1: certificate_chain_valid    — full 5-check chain validation
-- Check 2: revocation_status_valid    — chain + anchor + validity window
-- Check 3: authority_signatures_valid — payload_hash re-derivable for all signed receipts
-- Check 4: nonrepudiation_valid       — nonrepudiation_hash re-derivable for all signed receipts
-- Check 5: trust_anchor_identity_intact — anchor trust_identity_hash still re-derivable
--
-- Requires at least one certificate_chain registered for the delivery endpoint.

CREATE OR REPLACE FUNCTION verify_transport_authenticity(
  p_org_id      uuid,
  p_entity_type filing_entity_type,
  p_entity_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery      submission_deliveries%ROWTYPE;
  v_manifest      transport_manifests%ROWTYPE;
  v_chain         certificate_chains%ROWTYPE;
  v_anchor        trust_anchors%ROWTYPE;
  v_checks        jsonb := '[]'::jsonb;
  v_signed        record;
  v_receipt       authority_receipts%ROWTYPE;
  v_recomputed    text;
  v_chain_result  jsonb;
  v_revoke_result jsonb;
  v_cert_valid    boolean;
  v_revoke_valid  boolean;
  v_sigs_valid    boolean := true;
  v_nrhash_valid  boolean := true;
  v_anchor_valid  boolean;
  v_all_valid     boolean;
  v_signed_count  integer := 0;
BEGIN
  -- Latest delivery for entity
  SELECT sd.* INTO v_delivery
  FROM submission_deliveries sd
  WHERE sd.organization_id = p_org_id
    AND sd.entity_type      = p_entity_type
    AND sd.entity_id        = p_entity_id
  ORDER BY sd.initiated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('is_valid', false, 'error', 'No delivery found for entity');
  END IF;

  SELECT * INTO v_manifest FROM transport_manifests WHERE id = v_delivery.transport_manifest_id;

  -- Certificate chain for endpoint
  SELECT cc.* INTO v_chain
  FROM certificate_chains cc
  WHERE cc.endpoint_id = v_manifest.endpoint_id
  ORDER BY cc.registered_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_valid', false,
      'error',    'No certificate chain registered for endpoint: ' || v_manifest.endpoint_key
    );
  END IF;

  SELECT * INTO v_anchor FROM trust_anchors WHERE id = v_chain.trust_anchor_id;

  -- Check 1: certificate chain valid (delegates to validate_certificate_chain)
  v_chain_result := validate_certificate_chain(v_chain.id);
  v_cert_valid   := (v_chain_result->>'is_valid')::boolean;
  v_checks := v_checks || jsonb_build_object(
    'check', 'certificate_chain_valid', 'result', v_cert_valid
  );

  -- Check 2: revocation status valid
  v_revoke_result := verify_revocation_status(v_chain.id);
  v_revoke_valid  := (v_revoke_result->>'is_valid')::boolean;
  v_checks := v_checks || jsonb_build_object(
    'check', 'revocation_status_valid', 'result', v_revoke_valid,
    'revocation_state', v_revoke_result->>'revocation_state'
  );

  -- Checks 3 & 4: all signed authority receipts for this entity
  FOR v_signed IN
    SELECT sar.*
    FROM signed_authority_receipts sar
    JOIN authority_receipts ar ON ar.id = sar.authority_receipt_id
    WHERE sar.organization_id = p_org_id
      AND ar.entity_id        = p_entity_id
    ORDER BY sar.recorded_at
  LOOP
    v_signed_count := v_signed_count + 1;
    SELECT * INTO v_receipt FROM authority_receipts WHERE id = v_signed.authority_receipt_id;

    -- Re-derive signature_payload_hash
    v_recomputed := encode(sha256(
      canonical_jsonb(jsonb_build_object(
        'receipt_id',       canonical_uuid(v_signed.authority_receipt_id),
        'organization_id',  canonical_uuid(v_signed.organization_id),
        'entity_type',      canonical_text(v_receipt.entity_type::text),
        'entity_id',        canonical_uuid(v_receipt.entity_id),
        'authority_name',   canonical_text(v_receipt.authority_name),
        'submission_hash',  COALESCE(v_receipt.submission_hash, ''),
        'receipt_hash',     COALESCE(v_receipt.receipt_hash, '')
      ))::text::bytea
    ), 'hex');
    IF v_recomputed <> v_signed.signature_payload_hash THEN
      v_sigs_valid := false;
    END IF;

    -- Re-derive nonrepudiation_hash
    v_recomputed := generate_nonrepudiation_hash(
      v_receipt.entity_id::text,
      v_signed.signature_payload_hash,
      v_signed.detached_signature
    );
    IF v_recomputed <> v_signed.nonrepudiation_hash THEN
      v_nrhash_valid := false;
    END IF;
  END LOOP;

  v_checks := v_checks || jsonb_build_object(
    'check',             'authority_signatures_valid',
    'result',            v_sigs_valid,
    'receipts_checked',  v_signed_count
  );
  v_checks := v_checks || jsonb_build_object(
    'check',             'nonrepudiation_valid',
    'result',            v_nrhash_valid,
    'receipts_checked',  v_signed_count
  );

  -- Check 5: trust anchor identity hash re-derivable (detects anchor tampering)
  v_recomputed := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'anchor_id',          canonical_text(v_anchor.anchor_id),
      'common_name',        canonical_text(v_anchor.common_name),
      'organization',       canonical_text(v_anchor.organization),
      'jurisdiction',       canonical_text(v_anchor.jurisdiction),
      'anchor_fingerprint', v_anchor.anchor_fingerprint
    ))::text::bytea
  ), 'hex');
  v_anchor_valid := (v_recomputed = v_anchor.trust_identity_hash);
  v_checks := v_checks || jsonb_build_object(
    'check', 'trust_anchor_identity_intact', 'result', v_anchor_valid,
    'anchor_id', v_anchor.anchor_id
  );

  v_all_valid := v_cert_valid AND v_revoke_valid AND v_sigs_valid
              AND v_nrhash_valid AND v_anchor_valid;

  RETURN jsonb_build_object(
    'is_valid',       v_all_valid,
    'delivery_id',    v_delivery.id,
    'chain_id',       v_chain.chain_id,
    'anchor_id',      v_anchor.anchor_id,
    'signed_receipts', v_signed_count,
    'checks',         v_checks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_nonrepudiation_hash   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION register_signed_authority_receipt TO service_role;
GRANT EXECUTE ON FUNCTION verify_authority_signature      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION verify_transport_authenticity   TO authenticated, service_role;
