-- Phase 5C: Cryptographic Trust & Authority Submission
-- Step 1: Signature Core — signing key registry, certificate signatures

-- ── Extend compliance_event_type ─────────────────────────────────────────────

ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'certificate_signed';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'authority_receipt_registered';
ALTER TYPE compliance_event_type ADD VALUE IF NOT EXISTS 'submission_envelope_sealed';

-- ── eIDAS signature levels ────────────────────────────────────────────────────

CREATE TYPE eidas_level_type AS ENUM ('AdES', 'AdES_QC', 'QES');

-- ── signing_key_registry ──────────────────────────────────────────────────────
-- Mutable: keys can be rotated and revoked; key_fingerprint never changes after creation

CREATE TABLE signing_key_registry (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id            text        NOT NULL UNIQUE,
  algorithm         text        NOT NULL DEFAULT 'sha256-keyed',
  version           text        NOT NULL DEFAULT 'v1',
  is_active         boolean     NOT NULL DEFAULT true,
  eidas_compatible  boolean     NOT NULL DEFAULT false,
  key_fingerprint   text        NOT NULL,
  activated_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  revocation_reason text,
  metadata          jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_signing_key_fingerprint CHECK (length(key_fingerprint) = 64),
  CONSTRAINT chk_signing_key_revocation CHECK (
    (revoked_at IS NULL AND revocation_reason IS NULL) OR
    (revoked_at IS NOT NULL)
  )
);

ALTER TABLE signing_key_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY signing_key_registry_select ON signing_key_registry
  FOR SELECT TO authenticated USING (is_active = true);

-- ── certificate_signatures ────────────────────────────────────────────────────
-- Immutable: signatures cannot be modified or deleted once recorded

CREATE TABLE certificate_signatures (
  id                      uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid              NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  certification_id        uuid              NOT NULL REFERENCES regulatory_certifications(id) ON DELETE RESTRICT,
  signing_key_id          text              NOT NULL REFERENCES signing_key_registry(key_id),
  algorithm               text              NOT NULL,
  signature_version       text              NOT NULL DEFAULT 'sigv1',
  signature_payload_hash  text              NOT NULL,
  signature_value         text              NOT NULL,
  eidas_level             eidas_level_type,
  actor_id                uuid              REFERENCES auth.users(id),
  metadata                jsonb             NOT NULL DEFAULT '{}',
  signed_at               timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT chk_certificate_signature_payload_hash CHECK (length(signature_payload_hash) = 64),
  CONSTRAINT chk_certificate_signature_value        CHECK (length(signature_value) = 64)
);

ALTER TABLE certificate_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY certificate_signatures_select ON certificate_signatures
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE OR REPLACE FUNCTION prevent_certificate_signature_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'certificate_signatures is immutable'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER certificate_signatures_immutable
  BEFORE UPDATE OR DELETE ON certificate_signatures
  FOR EACH ROW EXECUTE FUNCTION prevent_certificate_signature_modification();

-- ── generate_signature_payload ────────────────────────────────────────────────
-- Returns canonical deterministic jsonb of the fields that will be signed.
-- All fields are timestamp-free: identical certification state → identical payload.

CREATE OR REPLACE FUNCTION generate_signature_payload(
  p_certification_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cert regulatory_certifications%ROWTYPE;
BEGIN
  SELECT * INTO v_cert
  FROM regulatory_certifications
  WHERE id = p_certification_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'certification not found: %', p_certification_id;
  END IF;

  RETURN canonical_jsonb(jsonb_build_object(
    'certification_id',       canonical_uuid(p_certification_id),
    'entity_type',            canonical_text(v_cert.entity_type::text),
    'entity_id',              canonical_uuid(v_cert.entity_id),
    'organization_id',        canonical_uuid(v_cert.organization_id),
    'canonical_payload_hash', COALESCE(v_cert.canonical_payload_hash, ''),
    'certificate_hash',       COALESCE(v_cert.certificate_hash, ''),
    'lineage_chain_hash',     COALESCE(v_cert.lineage_chain_hash, ''),
    'serializer_version',     canonical_text(COALESCE(v_cert.serializer_version, '')),
    'replay_profile_version', canonical_text(COALESCE(v_cert.replay_profile_version, '')),
    'certification_type',     canonical_text(v_cert.certification_type::text),
    'payload_version',        '5C.1'
  ));
END;
$$;

-- ── sign_regulatory_certificate ───────────────────────────────────────────────
-- Creates an immutable signature record for a regulatory certification.
-- signature_value = SHA-256(key_fingerprint || '|' || signature_payload_hash)
-- Replace inner SHA-256 with RSA/ECDSA via HSM for eIDAS production deployments.

CREATE OR REPLACE FUNCTION sign_regulatory_certificate(
  p_org_id         uuid,
  p_cert_id        uuid,
  p_signing_key_id text,
  p_actor_id       uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key          signing_key_registry%ROWTYPE;
  v_cert         regulatory_certifications%ROWTYPE;
  v_payload      jsonb;
  v_payload_hash text;
  v_sig_value    text;
  v_sig_id       uuid;
  v_eidas_level  eidas_level_type;
BEGIN
  SELECT * INTO v_key
  FROM signing_key_registry
  WHERE key_id = p_signing_key_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signing key not found or inactive: %', p_signing_key_id;
  END IF;

  SELECT * INTO v_cert
  FROM regulatory_certifications
  WHERE id = p_cert_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'certification not found: %', p_cert_id;
  END IF;

  v_payload      := generate_signature_payload(p_cert_id);
  v_payload_hash := encode(sha256(canonical_jsonb(v_payload)::text::bytea), 'hex');

  -- Keyed hash using key_fingerprint as signing material
  v_sig_value := encode(
    sha256((v_key.key_fingerprint || '|' || v_payload_hash)::bytea),
    'hex'
  );

  IF v_key.eidas_compatible THEN
    v_eidas_level := 'AdES';
  END IF;

  INSERT INTO certificate_signatures (
    organization_id, certification_id, signing_key_id, algorithm,
    signature_version, signature_payload_hash, signature_value,
    eidas_level, actor_id
  ) VALUES (
    p_org_id, p_cert_id, p_signing_key_id, v_key.algorithm,
    'sigv1', v_payload_hash, v_sig_value,
    v_eidas_level, p_actor_id
  ) RETURNING id INTO v_sig_id;

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'certificate_signed',
    'certificate_signature', v_sig_id,
    p_actor_id,
    jsonb_build_object(
      'certification_id', p_cert_id,
      'signing_key_id',   p_signing_key_id,
      'algorithm',        v_key.algorithm
    )
  );

  RETURN jsonb_build_object(
    'signature_id',           v_sig_id,
    'certification_id',       p_cert_id,
    'signing_key_id',         p_signing_key_id,
    'algorithm',              v_key.algorithm,
    'signature_version',      'sigv1',
    'signature_payload_hash', v_payload_hash,
    'signature_value',        v_sig_value,
    'eidas_level',            v_eidas_level,
    'signed_at',              now()
  );
END;
$$;

-- ── verify_certificate_signature ──────────────────────────────────────────────
-- Re-derives signature_value from stored key_fingerprint and payload_hash.
-- A signature can be cryptographically valid even if the key was later revoked;
-- callers should check key_active separately when enforcing revocation policy.

CREATE OR REPLACE FUNCTION verify_certificate_signature(
  p_signature_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sig          certificate_signatures%ROWTYPE;
  v_key          signing_key_registry%ROWTYPE;
  v_expected_sig text;
  v_is_valid     boolean;
BEGIN
  SELECT * INTO v_sig
  FROM certificate_signatures
  WHERE id = p_signature_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signature not found: %', p_signature_id;
  END IF;

  SELECT * INTO v_key
  FROM signing_key_registry
  WHERE key_id = v_sig.signing_key_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_valid',     false,
      'signature_id', p_signature_id,
      'error',        'signing key not found: ' || v_sig.signing_key_id
    );
  END IF;

  v_expected_sig := encode(
    sha256((v_key.key_fingerprint || '|' || v_sig.signature_payload_hash)::bytea),
    'hex'
  );
  v_is_valid := (v_sig.signature_value = v_expected_sig);

  RETURN jsonb_build_object(
    'is_valid',           v_is_valid,
    'signature_id',       p_signature_id,
    'certification_id',   v_sig.certification_id,
    'signing_key_id',     v_sig.signing_key_id,
    'algorithm',          v_sig.algorithm,
    'signature_version',  v_sig.signature_version,
    'eidas_level',        v_sig.eidas_level,
    'key_active',         v_key.is_active,
    'signature_matches',  v_is_valid,
    'signed_at',          v_sig.signed_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_signature_payload(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sign_regulatory_certificate(uuid, uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION verify_certificate_signature(uuid)
  TO authenticated, service_role;
