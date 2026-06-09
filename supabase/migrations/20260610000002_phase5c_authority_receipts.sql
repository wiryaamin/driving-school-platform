-- Phase 5C: Cryptographic Trust & Authority Submission
-- Step 2: Submission Envelopes + Authority Receipts

-- submission_envelopes defined first because authority_receipts references it

-- ── submission_envelopes ──────────────────────────────────────────────────────
-- Immutable: sealed envelopes cannot be modified; deterministic hash enables tampering detection

CREATE TABLE submission_envelopes (
  id                     uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type            filing_entity_type NOT NULL,
  entity_id              uuid               NOT NULL,
  certification_id       uuid               NOT NULL REFERENCES regulatory_certifications(id) ON DELETE RESTRICT,
  evidence_package_id    uuid               REFERENCES regulatory_evidence_packages(id) ON DELETE RESTRICT,
  envelope_version       text               NOT NULL DEFAULT '5C.1',
  canonical_payload_hash text               NOT NULL,
  certification_manifest jsonb              NOT NULL,
  evidence_hash          text               NOT NULL DEFAULT '',
  trust_chain_hash       text               NOT NULL,
  serializer_version     text               NOT NULL DEFAULT 'serialization_standards_v1',
  replay_profile         text               NOT NULL DEFAULT 'replay_safe_json_v1',
  authority_metadata     jsonb              NOT NULL DEFAULT '{}',
  replay_metadata        jsonb              NOT NULL DEFAULT '{}',
  envelope_hash          text               NOT NULL,
  actor_id               uuid               REFERENCES auth.users(id),
  metadata               jsonb              NOT NULL DEFAULT '{}',
  sealed_at              timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT chk_submission_envelope_hash       CHECK (length(envelope_hash) = 64),
  CONSTRAINT chk_submission_trust_chain_hash    CHECK (length(trust_chain_hash) = 64)
);

ALTER TABLE submission_envelopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY submission_envelopes_select ON submission_envelopes
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE OR REPLACE FUNCTION prevent_submission_envelope_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'submission_envelopes is immutable'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER submission_envelopes_immutable
  BEFORE UPDATE OR DELETE ON submission_envelopes
  FOR EACH ROW EXECUTE FUNCTION prevent_submission_envelope_modification();

-- ── authority_receipts ────────────────────────────────────────────────────────
-- Immutable: authority responses preserved verbatim with re-derivable receipt_hash

CREATE TABLE authority_receipts (
  id                       uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type              filing_entity_type NOT NULL,
  entity_id                uuid               NOT NULL,
  submission_envelope_id   uuid               REFERENCES submission_envelopes(id) ON DELETE RESTRICT,
  authority_name           text               NOT NULL,
  authority_reference      text,
  submission_hash          text               NOT NULL,
  receipt_payload          jsonb              NOT NULL DEFAULT '{}',
  receipt_hash             text               NOT NULL,
  acknowledgment_reference text,
  accepted_at              timestamptz,
  rejected_at              timestamptz,
  rejection_reason         text,
  actor_id                 uuid               REFERENCES auth.users(id),
  metadata                 jsonb              NOT NULL DEFAULT '{}',
  recorded_at              timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT chk_authority_receipt_hash    CHECK (length(receipt_hash) = 64),
  CONSTRAINT chk_authority_receipt_outcome CHECK (
    NOT (accepted_at IS NOT NULL AND rejected_at IS NOT NULL)
  )
);

ALTER TABLE authority_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY authority_receipts_select ON authority_receipts
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE OR REPLACE FUNCTION prevent_authority_receipt_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'authority_receipts is immutable'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER authority_receipts_immutable
  BEFORE UPDATE OR DELETE ON authority_receipts
  FOR EACH ROW EXECUTE FUNCTION prevent_authority_receipt_modification();

-- ── register_authority_receipt ────────────────────────────────────────────────
-- Preserves authority response with re-derivable receipt_hash.
-- receipt_hash = SHA-256(canonical_jsonb(receipt_payload) || '|' || submission_hash || '|' || authority_reference)

CREATE OR REPLACE FUNCTION register_authority_receipt(
  p_org_id              uuid,
  p_entity_type         filing_entity_type,
  p_entity_id           uuid,
  p_envelope_id         uuid,
  p_authority_name      text,
  p_authority_reference text,
  p_submission_hash     text,
  p_receipt_payload     jsonb,
  p_acknowledgment_ref  text DEFAULT NULL,
  p_actor_id            uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_receipt_hash text;
  v_receipt_id   uuid;
BEGIN
  v_receipt_hash := encode(sha256((
    canonical_jsonb(COALESCE(p_receipt_payload, '{}'::jsonb))::text || '|' ||
    COALESCE(p_submission_hash, '')                                  || '|' ||
    COALESCE(p_authority_reference, '')
  )::bytea), 'hex');

  INSERT INTO authority_receipts (
    organization_id, entity_type, entity_id,
    submission_envelope_id, authority_name, authority_reference,
    submission_hash, receipt_payload, receipt_hash,
    acknowledgment_reference, actor_id
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    p_envelope_id, p_authority_name, p_authority_reference,
    p_submission_hash,
    COALESCE(p_receipt_payload, '{}'::jsonb),
    v_receipt_hash,
    p_acknowledgment_ref, p_actor_id
  ) RETURNING id INTO v_receipt_id;

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'authority_receipt_registered',
    p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'receipt_id',          v_receipt_id,
      'authority_name',      p_authority_name,
      'authority_reference', p_authority_reference,
      'envelope_id',         p_envelope_id
    )
  );

  RETURN jsonb_build_object(
    'receipt_id',          v_receipt_id,
    'authority_name',      p_authority_name,
    'authority_reference', p_authority_reference,
    'receipt_hash',        v_receipt_hash,
    'recorded_at',         now()
  );
END;
$$;

-- ── verify_authority_receipt ──────────────────────────────────────────────────
-- Re-derives receipt_hash from stored components; detects payload tampering.

CREATE OR REPLACE FUNCTION verify_authority_receipt(
  p_receipt_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_receipt  authority_receipts%ROWTYPE;
  v_expected text;
  v_is_valid boolean;
BEGIN
  SELECT * INTO v_receipt
  FROM authority_receipts
  WHERE id = p_receipt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'authority receipt not found: %', p_receipt_id;
  END IF;

  v_expected := encode(sha256((
    canonical_jsonb(v_receipt.receipt_payload)::text || '|' ||
    COALESCE(v_receipt.submission_hash, '')          || '|' ||
    COALESCE(v_receipt.authority_reference, '')
  )::bytea), 'hex');

  v_is_valid := (v_receipt.receipt_hash = v_expected);

  RETURN jsonb_build_object(
    'is_valid',             v_is_valid,
    'receipt_id',           p_receipt_id,
    'authority_name',       v_receipt.authority_name,
    'authority_reference',  v_receipt.authority_reference,
    'hash_matched',         v_is_valid,
    'stored_hash',          v_receipt.receipt_hash,
    'expected_hash',        v_expected,
    'has_acknowledgment',   v_receipt.acknowledgment_reference IS NOT NULL,
    'recorded_at',          v_receipt.recorded_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION register_authority_receipt(
  uuid, filing_entity_type, uuid, uuid, text, text, text, jsonb, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION verify_authority_receipt(uuid)
  TO authenticated, service_role;
