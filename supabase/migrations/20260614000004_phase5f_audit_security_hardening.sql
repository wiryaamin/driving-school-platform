-- Phase 5F-Audit: Temporal Replay Hardening & Deterministic Evidence Stabilization
-- Step 4: SECURITY DEFINER Hardening

-- ── internal_temporal_security schema ────────────────────────────────────────
-- Isolation namespace for all replay-security assertion functions.
-- SECURITY DEFINER functions that validate org context, actor identity,
-- and cross-org replay access live here.

CREATE SCHEMA IF NOT EXISTS internal_temporal_security;

-- Revoke default public access to the security schema
REVOKE ALL ON SCHEMA internal_temporal_security FROM PUBLIC;
GRANT USAGE ON SCHEMA internal_temporal_security TO service_role;

-- ── assert_temporal_security_context ─────────────────────────────────────────
-- Security guard for replay-sensitive operations.
-- Validates:
--   1. Actor provided or JWT uid present (no anonymous execution)
--   2. Org context matches p_org_id (no cross-org access)
--   3. Org ID is a valid non-null UUID (not platform sentinel for org-scoped ops)
--   4. Cross-org replay escalation rejected (p_org_id must match JWT claim)
--   5. Platform-sentinel org_id ('00000000-...') rejected for org-scoped assertions
--
-- Raises EXCEPTION on any violation.
-- Returns jsonb with context summary on success.

CREATE OR REPLACE FUNCTION internal_temporal_security.assert_temporal_security_context(
  p_org_id   uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal_temporal_security, public, pg_temp
AS $$
DECLARE
  v_jwt_org_id   text;
  v_jwt_uid      text;
  v_context_org  uuid;
BEGIN
  -- Check 1: no anonymous execution
  v_jwt_uid := current_setting('request.jwt.claims', true)::jsonb ->> 'sub';
  IF p_actor_id IS NULL AND (v_jwt_uid IS NULL OR v_jwt_uid = '') THEN
    RAISE EXCEPTION 'temporal_security: anonymous execution rejected — actor_id or JWT uid required';
  END IF;

  -- Check 2: org context GUC must be set for org-scoped operations
  v_jwt_org_id := current_setting('app.current_org_id', true);
  IF v_jwt_org_id IS NULL OR v_jwt_org_id = '' THEN
    RAISE EXCEPTION 'temporal_security: org context not set — app.current_org_id required';
  END IF;

  -- Check 3: parse and validate org context
  BEGIN
    v_context_org := v_jwt_org_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'temporal_security: invalid app.current_org_id format: %', v_jwt_org_id;
  END;

  -- Check 4: reject platform sentinel for org-scoped replay assertions
  IF p_org_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'temporal_security: platform sentinel UUID rejected for org-scoped replay assertion';
  END IF;

  -- Check 5: cross-org replay escalation check
  IF v_context_org <> p_org_id THEN
    RAISE EXCEPTION 'temporal_security: cross-org replay access rejected — context org % does not match requested org %',
      v_context_org, p_org_id;
  END IF;

  RETURN jsonb_build_object(
    'context_valid',  true,
    'org_id',         p_org_id,
    'context_org_id', v_context_org,
    'actor_resolved', COALESCE(p_actor_id::text, v_jwt_uid)
  );
END;
$$;

-- Public wrapper — accessible to authenticated + service_role
CREATE OR REPLACE FUNCTION assert_temporal_security_context(
  p_org_id   uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);
END;
$$;

-- ── Hardened issue_timestamp_evidence ────────────────────────────────────────
-- Re-declares issue_timestamp_evidence with security context assertion.
-- Rejects: anonymous callers, cross-org access, missing org context.

CREATE OR REPLACE FUNCTION issue_timestamp_evidence(
  p_org_id              uuid,
  p_entity_type         filing_entity_type,
  p_entity_id           uuid,
  p_authority_id        uuid,
  p_timestamp_value     timestamptz,
  p_payload_hash        text,
  p_timestamp_signature text,
  p_actor_id            uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_authority              timestamp_authorities%ROWTYPE;
  v_signature_payload_hash text;
  v_evidence_hash          text;
  v_nonrepudiation_hash    text;
  v_prior_chronology_hash  text;
  v_sequence_number        integer;
  v_chronology_hash        text;
  v_new_id                 uuid;
  v_registry_id            uuid;
BEGIN
  -- Security assertion: reject anonymous / cross-org execution
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT * INTO v_authority FROM timestamp_authorities WHERE id = p_authority_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timestamp authority not found: %', p_authority_id;
  END IF;

  -- Reject revoked or suspended authorities
  IF v_authority.authority_status <> 'active' THEN
    RAISE EXCEPTION 'Timestamp authority is not active: % (status: %)',
      v_authority.authority_id, v_authority.authority_status;
  END IF;

  -- signature_payload_hash: 5 fields the authority signed; timestamp_value is supplied
  v_signature_payload_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'entity_id',       canonical_uuid(p_entity_id),
      'entity_type',     canonical_text(p_entity_type::text),
      'timestamp_value', canonical_text(p_timestamp_value::text),
      'authority_id',    canonical_uuid(p_authority_id),
      'payload_hash',    COALESCE(p_payload_hash, '')
    ))::text::bytea
  ), 'hex');

  -- evidence_hash: 7 fields including signature_payload_hash + version
  v_evidence_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'entity_id',              canonical_uuid(p_entity_id),
      'entity_type',            canonical_text(p_entity_type::text),
      'timestamp_value',        canonical_text(p_timestamp_value::text),
      'authority_id',           canonical_uuid(p_authority_id),
      'payload_hash',           COALESCE(p_payload_hash, ''),
      'signature_payload_hash', v_signature_payload_hash,
      'evidence_version',       '5F.1'
    ))::text::bytea
  ), 'hex');

  -- temporal_nonrepudiation_hash: reuses IMMUTABLE generate_nonrepudiation_hash (Phase 5E)
  v_nonrepudiation_hash := generate_nonrepudiation_hash(
    p_entity_id::text,
    v_evidence_hash,
    p_timestamp_signature
  );

  -- Chronology: find the prior entry for this entity
  SELECT cl.chronology_hash, cl.sequence_number
  INTO v_prior_chronology_hash, v_sequence_number
  FROM chronology_lineage cl
  WHERE cl.organization_id = p_org_id AND cl.entity_id = p_entity_id
  ORDER BY cl.sequence_number DESC
  LIMIT 1;

  v_sequence_number := COALESCE(v_sequence_number, 0) + 1;

  v_chronology_hash := generate_temporal_chain_hash(
    CASE
      WHEN v_prior_chronology_hash IS NOT NULL
      THEN ARRAY[v_prior_chronology_hash, v_evidence_hash]
      ELSE ARRAY[v_evidence_hash]
    END
  );

  v_new_id := gen_random_uuid();

  INSERT INTO temporal_evidence_records (
    id, organization_id, entity_type, entity_id,
    authority_id, timestamp_value, payload_hash,
    evidence_hash, signature_payload_hash, temporal_nonrepudiation_hash,
    timestamp_signature, chronology_hash, actor_id
  ) VALUES (
    v_new_id, p_org_id, p_entity_type, p_entity_id,
    p_authority_id, p_timestamp_value, COALESCE(p_payload_hash, ''),
    v_evidence_hash, v_signature_payload_hash, v_nonrepudiation_hash,
    p_timestamp_signature, v_chronology_hash, p_actor_id
  );

  v_registry_id := gen_random_uuid();
  INSERT INTO timestamp_signature_registry (
    id, evidence_id, authority_id, signature_algorithm,
    signature_value, signature_payload_hash, nonrepudiation_hash
  ) VALUES (
    v_registry_id, v_new_id, p_authority_id, 'sha256-keyed',
    p_timestamp_signature, v_signature_payload_hash, v_nonrepudiation_hash
  );

  INSERT INTO chronology_lineage (
    organization_id, entity_type, entity_id,
    sequence_number, evidence_id, timestamp_value,
    chronology_hash, prior_chronology_hash
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    v_sequence_number, v_new_id, p_timestamp_value,
    v_chronology_hash, v_prior_chronology_hash
  );

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'temporal_evidence_issued',
    p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'evidence_id',                  v_new_id::text,
      'evidence_hash',                v_evidence_hash,
      'chronology_hash',              v_chronology_hash,
      'temporal_nonrepudiation_hash', v_nonrepudiation_hash,
      'sequence_number',              v_sequence_number
    )
  );

  RETURN jsonb_build_object(
    'id',                           v_new_id,
    'evidence_hash',                v_evidence_hash,
    'signature_payload_hash',       v_signature_payload_hash,
    'temporal_nonrepudiation_hash', v_nonrepudiation_hash,
    'chronology_hash',              v_chronology_hash,
    'sequence_number',              v_sequence_number
  );
END;
$$;

-- ── Hardened create_temporal_snapshot ────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_temporal_snapshot(
  p_org_id       uuid,
  p_entity_type  filing_entity_type,
  p_entity_id    uuid,
  p_at_timestamp timestamptz,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_evidence      temporal_evidence_records%ROWTYPE;
  v_authority     timestamp_authorities%ROWTYPE;
  v_chain         certificate_chains%ROWTYPE;
  v_anchor        trust_anchors%ROWTYPE;
  v_ta_state      jsonb := '{}';
  v_cc_state      jsonb := '{}';
  v_auth_state    jsonb := '{}';
  v_rev_state     jsonb := '{}';
  v_snapshot_hash text;
  v_new_id        uuid;
  v_evidence_id   uuid;
  v_found_auth    boolean := false;
  v_found_chain   boolean := false;
BEGIN
  -- Security assertion
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT * INTO v_evidence
  FROM temporal_evidence_records
  WHERE organization_id = p_org_id
    AND entity_id        = p_entity_id
    AND timestamp_value <= p_at_timestamp
  ORDER BY timestamp_value DESC
  LIMIT 1;

  IF FOUND THEN
    v_evidence_id := v_evidence.id;
    SELECT * INTO v_authority FROM timestamp_authorities WHERE id = v_evidence.authority_id;
    IF FOUND THEN
      v_found_auth := true;
      v_auth_state := jsonb_build_object(
        'authority_id',            v_authority.authority_id,
        'common_name',             v_authority.common_name,
        'organization',            v_authority.organization,
        'authority_status',        v_authority.authority_status,
        'revoked_at',              v_authority.revoked_at,
        'authority_identity_hash', v_authority.authority_identity_hash,
        'authority_lineage_hash',  v_authority.authority_lineage_hash
      );
    END IF;
  END IF;

  -- Corrected: validity window, not registered_at
  SELECT cc.* INTO v_chain
  FROM certificate_chains cc
  WHERE cc.validity_not_before <= p_at_timestamp
    AND cc.validity_not_after  >  p_at_timestamp
  ORDER BY cc.validity_not_before DESC
  LIMIT 1;

  IF FOUND THEN
    v_found_chain := true;
    SELECT * INTO v_anchor FROM trust_anchors WHERE id = v_chain.trust_anchor_id;
    v_cc_state := jsonb_build_object(
      'chain_id',           v_chain.chain_id,
      'certificate_hash',   v_chain.certificate_hash,
      'revocation_state',   v_chain.revocation_state,
      'revoked_at',         v_chain.revoked_at,
      'validity_not_after', v_chain.validity_not_after
    );
    v_rev_state := jsonb_build_object(
      'cert_revocation_state',  v_chain.revocation_state,
      'cert_revoked_at',        v_chain.revoked_at,
      'cert_revocation_reason', v_chain.revocation_reason
    );
    IF v_anchor.id IS NOT NULL THEN
      v_ta_state := jsonb_build_object(
        'anchor_id',                v_anchor.anchor_id,
        'common_name',              v_anchor.common_name,
        'is_active',                v_anchor.is_active,
        'revoked_at',               v_anchor.revoked_at,
        'trust_identity_hash',      v_anchor.trust_identity_hash,
        'certificate_lineage_hash', v_anchor.certificate_lineage_hash
      );
    END IF;
  END IF;

  v_snapshot_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'org_id',           canonical_uuid(p_org_id),
      'entity_id',        canonical_uuid(p_entity_id),
      'entity_type',      canonical_text(p_entity_type::text),
      'at_timestamp',     canonical_text(p_at_timestamp::text),
      'snapshot_version', '5F.1'
    ))::text::bytea
  ), 'hex');

  v_new_id := gen_random_uuid();

  INSERT INTO temporal_trust_snapshots (
    id, organization_id, entity_type, entity_id,
    snapshot_timestamp, trust_anchor_state, certificate_chain_state,
    authority_state, revocation_state, snapshot_hash,
    temporal_evidence_id, actor_id
  ) VALUES (
    v_new_id, p_org_id, p_entity_type, p_entity_id,
    p_at_timestamp, v_ta_state, v_cc_state,
    v_auth_state, v_rev_state, v_snapshot_hash,
    v_evidence_id, p_actor_id
  );

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'temporal_snapshot_created',
    p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'snapshot_id',   v_new_id::text,
      'snapshot_hash', v_snapshot_hash,
      'at_timestamp',  p_at_timestamp
    )
  );

  RETURN jsonb_build_object(
    'id',                      v_new_id,
    'snapshot_hash',           v_snapshot_hash,
    'snapshot_timestamp',      p_at_timestamp,
    'trust_anchor_state',      v_ta_state,
    'certificate_chain_state', v_cc_state,
    'authority_state',         v_auth_state,
    'revocation_state',        v_rev_state
  );
END;
$$;

-- ── Hardened generate_temporal_replay_certificate ─────────────────────────────

CREATE OR REPLACE FUNCTION generate_temporal_replay_certificate(
  p_org_id       uuid,
  p_entity_type  filing_entity_type,
  p_entity_id    uuid,
  p_at_timestamp timestamptz,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot_result   jsonb;
  v_chain_result      jsonb;
  v_cert_at_result    jsonb;
  v_revoke_at_result  jsonb;
  v_nonrep_result     jsonb;
  v_chain             certificate_chains%ROWTYPE;
  v_evidence          temporal_evidence_records%ROWTYPE;
  v_snapshot_id       uuid;
  v_certificate_hash  text;
  v_checks_passed     integer := 0;
  v_checks_total      constant integer := 5;
  v_is_valid          boolean;
  v_new_id            uuid;
  v_chain_found       boolean := false;
  v_evidence_found    boolean := false;
BEGIN
  -- Security assertion: reject anonymous / cross-org
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_snapshot_result := create_temporal_snapshot(p_org_id, p_entity_type, p_entity_id, p_at_timestamp, p_actor_id);
  v_snapshot_id := (v_snapshot_result->>'id')::uuid;

  v_chain_result := verify_temporal_chain_integrity(p_org_id, p_entity_type, p_entity_id);

  -- Corrected: validity window, not registered_at
  SELECT cc.* INTO v_chain
  FROM certificate_chains cc
  WHERE cc.validity_not_before <= p_at_timestamp
    AND cc.validity_not_after  >  p_at_timestamp
  ORDER BY cc.validity_not_before DESC
  LIMIT 1;
  IF FOUND THEN v_chain_found := true; END IF;

  IF v_chain_found THEN
    v_cert_at_result   := validate_certificate_at_timestamp(v_chain.id, p_at_timestamp);
    v_revoke_at_result := validate_revocation_at_timestamp(v_chain.id, p_at_timestamp);
  ELSE
    v_cert_at_result   := jsonb_build_object('is_valid', false, 'error', 'No certificate valid at timestamp');
    v_revoke_at_result := jsonb_build_object('is_valid', false, 'error', 'No certificate valid at timestamp');
  END IF;

  SELECT * INTO v_evidence
  FROM temporal_evidence_records
  WHERE organization_id = p_org_id
    AND entity_id        = p_entity_id
    AND timestamp_value <= p_at_timestamp
  ORDER BY timestamp_value DESC
  LIMIT 1;
  IF FOUND THEN
    v_evidence_found  := true;
    v_nonrep_result   := verify_temporal_nonrepudiation(v_evidence.id);
  ELSE
    v_nonrep_result := jsonb_build_object('is_valid', false, 'warning', 'No temporal evidence found at timestamp');
  END IF;

  IF (v_chain_result->>'is_valid')::boolean     THEN v_checks_passed := v_checks_passed + 1; END IF;
  IF (v_cert_at_result->>'is_valid')::boolean   THEN v_checks_passed := v_checks_passed + 1; END IF;
  IF (v_revoke_at_result->>'is_valid')::boolean THEN v_checks_passed := v_checks_passed + 1; END IF;
  IF (v_nonrep_result->>'is_valid')::boolean    THEN v_checks_passed := v_checks_passed + 1; END IF;
  IF v_snapshot_id IS NOT NULL                  THEN v_checks_passed := v_checks_passed + 1; END IF;

  v_is_valid := (v_checks_passed = v_checks_total);

  v_certificate_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'org_id',       canonical_uuid(p_org_id),
      'entity_id',    canonical_uuid(p_entity_id),
      'entity_type',  canonical_text(p_entity_type::text),
      'at_timestamp', canonical_text(p_at_timestamp::text),
      'is_valid',     v_is_valid,
      'cert_version', '5F.1'
    ))::text::bytea
  ), 'hex');

  v_new_id := gen_random_uuid();
  INSERT INTO replay_validation_snapshots (
    id, organization_id, entity_type, entity_id,
    validation_timestamp, validation_result, validation_hash,
    checks_passed, checks_total, is_valid,
    temporal_snapshot_id, actor_id
  ) VALUES (
    v_new_id, p_org_id, p_entity_type, p_entity_id,
    p_at_timestamp,
    jsonb_build_object(
      'chain_integrity',     v_chain_result,
      'cert_at_timestamp',   v_cert_at_result,
      'revoke_at_timestamp', v_revoke_at_result,
      'nonrepudiation',      v_nonrep_result
    ),
    v_certificate_hash,
    v_checks_passed, v_checks_total, v_is_valid,
    v_snapshot_id, p_actor_id
  );

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'temporal_replay_certificate_generated',
    p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'replay_cert_id',   v_new_id::text,
      'certificate_hash', v_certificate_hash,
      'is_valid',         v_is_valid,
      'checks_passed',    v_checks_passed,
      'checks_total',     v_checks_total,
      'at_timestamp',     p_at_timestamp
    )
  );

  RETURN jsonb_build_object(
    'id',                  v_new_id,
    'is_valid',            v_is_valid,
    'certificate_hash',    v_certificate_hash,
    'at_timestamp',        p_at_timestamp,
    'checks_passed',       v_checks_passed,
    'checks_total',        v_checks_total,
    'snapshot_id',         v_snapshot_id,
    'chain_integrity',     v_chain_result,
    'cert_at_timestamp',   v_cert_at_result,
    'revoke_at_timestamp', v_revoke_at_result,
    'nonrepudiation',      v_nonrep_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION assert_temporal_security_context        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION issue_timestamp_evidence                 TO service_role;
GRANT EXECUTE ON FUNCTION create_temporal_snapshot                 TO service_role;
GRANT EXECUTE ON FUNCTION generate_temporal_replay_certificate     TO service_role;
