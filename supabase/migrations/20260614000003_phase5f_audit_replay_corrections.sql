-- Phase 5F-Audit: Temporal Replay Hardening & Deterministic Evidence Stabilization
-- Step 3: Replay Correctness Fixes
--
-- PROBLEM: reconstruct_historical_trust_state, create_temporal_snapshot, and
-- generate_temporal_replay_certificate all used `registered_at <= p_at_timestamp`
-- to look up certificate_chains. This is incorrect for replay:
--
--   registered_at = when the row was inserted into the DB (operational metadata)
--   validity_not_before / validity_not_after = when the certificate was actually valid
--
-- A certificate imported late (delayed import) has registered_at AFTER the
-- historical timestamp being validated, even though validity_not_before was in
-- the past. Using registered_at would falsely report "no certificate at that time."
--
-- FIX: all three functions now look up certificate_chains using validity windows:
--   WHERE validity_not_before <= p_at_timestamp AND validity_not_after > p_at_timestamp
--
-- This matches the intent: "which certificate was VALID at this historical timestamp?"
-- regardless of when it was registered.

-- ── reconstruct_historical_trust_state (CORRECTED) ────────────────────────────

CREATE OR REPLACE FUNCTION reconstruct_historical_trust_state(
  p_org_id       uuid,
  p_entity_type  filing_entity_type,
  p_entity_id    uuid,
  p_at_timestamp timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot  temporal_trust_snapshots%ROWTYPE;
  v_evidence  temporal_evidence_records%ROWTYPE;
  v_authority timestamp_authorities%ROWTYPE;
  v_chain     certificate_chains%ROWTYPE;
  v_anchor    trust_anchors%ROWTYPE;
  v_found_evidence  boolean := false;
  v_found_chain     boolean := false;
  v_found_authority boolean := false;
BEGIN
  -- Primary: find immutable snapshot closest to (but not after) p_at_timestamp
  SELECT * INTO v_snapshot
  FROM temporal_trust_snapshots
  WHERE organization_id = p_org_id
    AND entity_id        = p_entity_id
    AND snapshot_timestamp <= p_at_timestamp
  ORDER BY snapshot_timestamp DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'reconstructed_at',        p_at_timestamp,
      'source',                  'temporal_snapshot',
      'snapshot_id',             v_snapshot.id,
      'snapshot_timestamp',      v_snapshot.snapshot_timestamp,
      'trust_anchor_state',      v_snapshot.trust_anchor_state,
      'certificate_chain_state', v_snapshot.certificate_chain_state,
      'authority_state',         v_snapshot.authority_state,
      'revocation_state',        v_snapshot.revocation_state,
      'snapshot_hash',           v_snapshot.snapshot_hash
    );
  END IF;

  -- Fallback: reconstruct from live tables bounded by p_at_timestamp.
  -- Use validity windows (not registered_at) so delayed-import certificates
  -- are correctly reflected at their historical validity time.

  -- Latest temporal evidence for this entity at/before p_at_timestamp
  SELECT * INTO v_evidence
  FROM temporal_evidence_records
  WHERE organization_id = p_org_id
    AND entity_id        = p_entity_id
    AND timestamp_value <= p_at_timestamp
  ORDER BY timestamp_value DESC
  LIMIT 1;

  IF FOUND THEN
    v_found_evidence := true;
    SELECT * INTO v_authority FROM timestamp_authorities WHERE id = v_evidence.authority_id;
    IF FOUND THEN v_found_authority := true; END IF;
  END IF;

  -- Certificate chain valid at p_at_timestamp (validity window, not registered_at)
  SELECT cc.* INTO v_chain
  FROM certificate_chains cc
  WHERE cc.validity_not_before <= p_at_timestamp
    AND cc.validity_not_after  >  p_at_timestamp
  ORDER BY cc.validity_not_before DESC
  LIMIT 1;

  IF FOUND THEN
    v_found_chain := true;
    SELECT * INTO v_anchor FROM trust_anchors WHERE id = v_chain.trust_anchor_id;
  END IF;

  RETURN jsonb_build_object(
    'reconstructed_at', p_at_timestamp,
    'source',           'live_tables',
    'warning',          'No temporal snapshot found; reconstruction from live tables may be incomplete',
    'trust_anchor_state', CASE WHEN v_found_chain AND v_anchor.id IS NOT NULL
      THEN jsonb_build_object(
        'anchor_id',          v_anchor.anchor_id,
        'common_name',        v_anchor.common_name,
        'is_active',          v_anchor.is_active,
        'revoked_at',         v_anchor.revoked_at,
        'trust_identity_hash', v_anchor.trust_identity_hash
      )
      ELSE NULL END,
    'certificate_chain_state', CASE WHEN v_found_chain
      THEN jsonb_build_object(
        'chain_id',          v_chain.chain_id,
        'certificate_hash',  v_chain.certificate_hash,
        'revocation_state',  v_chain.revocation_state,
        'revoked_at',        v_chain.revoked_at,
        'validity_not_after', v_chain.validity_not_after
      )
      ELSE NULL END,
    'authority_state', CASE WHEN v_found_authority
      THEN jsonb_build_object(
        'authority_id',           v_authority.authority_id,
        'common_name',            v_authority.common_name,
        'authority_status',       v_authority.authority_status,
        'revoked_at',             v_authority.revoked_at,
        'authority_identity_hash', v_authority.authority_identity_hash
      )
      ELSE NULL END,
    'revocation_state', CASE WHEN v_found_chain
      THEN jsonb_build_object(
        'cert_revoked_at',        v_chain.revoked_at,
        'cert_revocation_state',  v_chain.revocation_state,
        'cert_revocation_reason', v_chain.revocation_reason
      )
      ELSE NULL END
  );
END;
$$;

-- ── create_temporal_snapshot (CORRECTED) ──────────────────────────────────────

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
  -- Temporal evidence at/before p_at_timestamp
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

  -- Certificate chain valid at p_at_timestamp (validity window, not registered_at)
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

  -- snapshot_hash: deterministic from 5 fields; uses p_at_timestamp::text (supplied, not volatile)
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

-- ── generate_temporal_replay_certificate (CORRECTED) ─────────────────────────
-- Replaces registered_at lookup with validity window lookup for certificate_chains.

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
  -- Step 1: Create immutable snapshot at p_at_timestamp (NOT now())
  v_snapshot_result := create_temporal_snapshot(p_org_id, p_entity_type, p_entity_id, p_at_timestamp, p_actor_id);
  v_snapshot_id := (v_snapshot_result->>'id')::uuid;

  -- Step 2: Verify chronology chain integrity (IMMUTABLE re-derivation, no now())
  v_chain_result := verify_temporal_chain_integrity(p_org_id, p_entity_type, p_entity_id);

  -- Find certificate chain valid at p_at_timestamp (validity window, not registered_at)
  SELECT cc.* INTO v_chain
  FROM certificate_chains cc
  WHERE cc.validity_not_before <= p_at_timestamp
    AND cc.validity_not_after  >  p_at_timestamp
  ORDER BY cc.validity_not_before DESC
  LIMIT 1;
  IF FOUND THEN v_chain_found := true; END IF;

  -- Step 3 & 4: Certificate + revocation at p_at_timestamp (NOT now())
  IF v_chain_found THEN
    v_cert_at_result   := validate_certificate_at_timestamp(v_chain.id, p_at_timestamp);
    v_revoke_at_result := validate_revocation_at_timestamp(v_chain.id, p_at_timestamp);
  ELSE
    v_cert_at_result   := jsonb_build_object('is_valid', false, 'error', 'No certificate valid at timestamp');
    v_revoke_at_result := jsonb_build_object('is_valid', false, 'error', 'No certificate valid at timestamp');
  END IF;

  -- Step 5: Temporal nonrepudiation for latest evidence at/before p_at_timestamp
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

  -- Tally checks
  IF (v_chain_result->>'is_valid')::boolean     THEN v_checks_passed := v_checks_passed + 1; END IF;
  IF (v_cert_at_result->>'is_valid')::boolean   THEN v_checks_passed := v_checks_passed + 1; END IF;
  IF (v_revoke_at_result->>'is_valid')::boolean THEN v_checks_passed := v_checks_passed + 1; END IF;
  IF (v_nonrep_result->>'is_valid')::boolean    THEN v_checks_passed := v_checks_passed + 1; END IF;
  IF v_snapshot_id IS NOT NULL                  THEN v_checks_passed := v_checks_passed + 1; END IF;

  v_is_valid := (v_checks_passed = v_checks_total);

  -- validation_hash: p_at_timestamp::text is supplied (not volatile)
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
      'replay_cert_id',    v_new_id::text,
      'certificate_hash',  v_certificate_hash,
      'is_valid',          v_is_valid,
      'checks_passed',     v_checks_passed,
      'checks_total',      v_checks_total,
      'at_timestamp',      p_at_timestamp
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

GRANT EXECUTE ON FUNCTION reconstruct_historical_trust_state    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_temporal_snapshot              TO service_role;
GRANT EXECUTE ON FUNCTION generate_temporal_replay_certificate  TO service_role;
