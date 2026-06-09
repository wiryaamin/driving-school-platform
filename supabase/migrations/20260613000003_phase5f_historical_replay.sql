-- Phase 5F: Temporal Evidence & Cryptographic Replay Integrity
-- Step 3: Historical Replay Tables + Replay Functions

-- ── temporal_trust_snapshots ──────────────────────────────────────────────────
-- Immutable: captures trust state at a supplied historical timestamp.
-- snapshot_timestamp = p_at_timestamp supplied by caller (NOT now()).
-- snapshot_hash = SHA-256(canonical_jsonb of 5 deterministic fields including at_timestamp).
-- Enables reconstruct_historical_trust_state to read frozen state rather than live tables.

CREATE TABLE temporal_trust_snapshots (
  id                      uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type             filing_entity_type NOT NULL,
  entity_id               uuid               NOT NULL,
  snapshot_timestamp      timestamptz        NOT NULL,
  trust_anchor_state      jsonb              NOT NULL DEFAULT '{}',
  certificate_chain_state jsonb              NOT NULL DEFAULT '{}',
  authority_state         jsonb              NOT NULL DEFAULT '{}',
  revocation_state        jsonb              NOT NULL DEFAULT '{}',
  snapshot_hash           text               NOT NULL,
  temporal_evidence_id    uuid               REFERENCES temporal_evidence_records(id) ON DELETE RESTRICT,
  actor_id                uuid               REFERENCES auth.users(id),
  metadata                jsonb              NOT NULL DEFAULT '{}',
  created_at              timestamptz        NOT NULL DEFAULT now(),

  CONSTRAINT chk_tts_snapshot_hash CHECK (length(snapshot_hash) = 64)
);

ALTER TABLE temporal_trust_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY temporal_trust_snapshots_select ON temporal_trust_snapshots
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY temporal_trust_snapshots_service ON temporal_trust_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION prevent_temporal_snapshot_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'temporal_trust_snapshots records are immutable and cannot be % after creation', TG_OP;
END;
$$;

CREATE TRIGGER trg_temporal_trust_snapshots_immutable
BEFORE UPDATE OR DELETE ON temporal_trust_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_temporal_snapshot_modification();

-- ── replay_validation_snapshots ───────────────────────────────────────────────
-- Immutable: records the result of each generate_temporal_replay_certificate call.
-- validation_timestamp = historical point-in-time validated (NOT now()).
-- validation_hash      = SHA-256(canonical_jsonb of deterministic validation identity fields).

CREATE TABLE replay_validation_snapshots (
  id                   uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type          filing_entity_type NOT NULL,
  entity_id            uuid               NOT NULL,
  validation_timestamp timestamptz        NOT NULL,
  validation_result    jsonb              NOT NULL DEFAULT '{}',
  validation_hash      text               NOT NULL,
  checks_passed        integer            NOT NULL DEFAULT 0,
  checks_total         integer            NOT NULL DEFAULT 0,
  is_valid             boolean            NOT NULL DEFAULT false,
  temporal_snapshot_id uuid               REFERENCES temporal_trust_snapshots(id) ON DELETE RESTRICT,
  actor_id             uuid               REFERENCES auth.users(id),
  metadata             jsonb              NOT NULL DEFAULT '{}',
  validated_at         timestamptz        NOT NULL DEFAULT now(),

  CONSTRAINT chk_rvs_validation_hash CHECK (length(validation_hash) = 64)
);

ALTER TABLE replay_validation_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY replay_validation_snapshots_select ON replay_validation_snapshots
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY replay_validation_snapshots_service ON replay_validation_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION prevent_replay_validation_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_validation_snapshots records are immutable and cannot be % after creation', TG_OP;
END;
$$;

CREATE TRIGGER trg_replay_validation_snapshots_immutable
BEFORE UPDATE OR DELETE ON replay_validation_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_replay_validation_modification();

-- ── validate_certificate_at_timestamp ────────────────────────────────────────
-- 5-check certificate validation at a historical timestamp.
-- ALL comparisons use p_at_timestamp — NEVER now().
-- Check 1: anchor active at timestamp (not yet revoked before p_at_timestamp)
-- Check 2: certificate within validity window at timestamp
-- Check 3: certificate not yet revoked at timestamp
-- Check 4: certificate_hash re-derivable (deterministic, no timestamp needed)
-- Check 5: trust anchor identity hash re-derivable (tamper detection)

CREATE OR REPLACE FUNCTION validate_certificate_at_timestamp(
  p_chain_id     uuid,
  p_at_timestamp timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chain            certificate_chains%ROWTYPE;
  v_anchor           trust_anchors%ROWTYPE;
  v_checks           jsonb := '[]'::jsonb;
  v_recomputed       text;
  v_anchor_active    boolean;
  v_within_validity  boolean;
  v_not_revoked      boolean;
  v_cert_hash_valid  boolean;
  v_anchor_id_valid  boolean;
  v_all_valid        boolean;
BEGIN
  SELECT * INTO v_chain FROM certificate_chains WHERE id = p_chain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Certificate chain not found: %', p_chain_id;
  END IF;

  SELECT * INTO v_anchor FROM trust_anchors WHERE id = v_chain.trust_anchor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trust anchor not found for chain: %', v_chain.chain_id;
  END IF;

  -- Check 1: anchor active at historical timestamp (not yet revoked before p_at_timestamp)
  v_anchor_active := v_anchor.is_active AND
    (v_anchor.revoked_at IS NULL OR v_anchor.revoked_at > p_at_timestamp);
  v_checks := v_checks || jsonb_build_object(
    'check',        'anchor_active_at_timestamp',
    'result',       v_anchor_active,
    'at_timestamp', p_at_timestamp
  );

  -- Check 2: certificate within validity window at historical timestamp
  v_within_validity := (v_chain.validity_not_before <= p_at_timestamp
    AND v_chain.validity_not_after > p_at_timestamp);
  v_checks := v_checks || jsonb_build_object(
    'check',              'within_validity_at_timestamp',
    'result',             v_within_validity,
    'validity_not_before', v_chain.validity_not_before,
    'validity_not_after',  v_chain.validity_not_after
  );

  -- Check 3: certificate not yet revoked at historical timestamp
  v_not_revoked := (v_chain.revoked_at IS NULL OR v_chain.revoked_at > p_at_timestamp);
  v_checks := v_checks || jsonb_build_object(
    'check',      'not_revoked_at_timestamp',
    'result',     v_not_revoked,
    'revoked_at', v_chain.revoked_at
  );

  -- Check 4: certificate_hash re-derivable (no timestamps — fully deterministic)
  v_recomputed := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'chain_id',            canonical_text(v_chain.chain_id),
      'trust_anchor_id',     canonical_uuid(v_chain.trust_anchor_id),
      'subject_fingerprint', v_chain.subject_fingerprint,
      'issuer_fingerprint',  v_chain.issuer_fingerprint,
      'subject_cn',          canonical_text(v_chain.subject_common_name),
      'issuer_cn',           canonical_text(v_chain.issuer_common_name),
      'algorithm',           canonical_text(v_chain.algorithm),
      'chain_version',       '5E.1'
    ))::text::bytea
  ), 'hex');
  v_cert_hash_valid := (v_recomputed = v_chain.certificate_hash);
  v_checks := v_checks || jsonb_build_object(
    'check', 'certificate_hash_valid', 'result', v_cert_hash_valid
  );

  -- Check 5: trust anchor identity hash re-derivable (tamper detection, no timestamps)
  v_recomputed := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'anchor_id',          canonical_text(v_anchor.anchor_id),
      'common_name',        canonical_text(v_anchor.common_name),
      'organization',       canonical_text(v_anchor.organization),
      'jurisdiction',       canonical_text(v_anchor.jurisdiction),
      'anchor_fingerprint', v_anchor.anchor_fingerprint
    ))::text::bytea
  ), 'hex');
  v_anchor_id_valid := (v_recomputed = v_anchor.trust_identity_hash);
  v_checks := v_checks || jsonb_build_object(
    'check', 'trust_anchor_identity_intact', 'result', v_anchor_id_valid
  );

  v_all_valid := v_anchor_active AND v_within_validity AND v_not_revoked
              AND v_cert_hash_valid AND v_anchor_id_valid;

  RETURN jsonb_build_object(
    'is_valid',     v_all_valid,
    'at_timestamp', p_at_timestamp,
    'chain_id',     v_chain.chain_id,
    'anchor_id',    v_anchor.anchor_id,
    'checks',       v_checks
  );
END;
$$;

-- ── validate_revocation_at_timestamp ─────────────────────────────────────────
-- Reports revocation picture at historical timestamp. Uses p_at_timestamp — NEVER now().

CREATE OR REPLACE FUNCTION validate_revocation_at_timestamp(
  p_chain_id     uuid,
  p_at_timestamp timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chain               certificate_chains%ROWTYPE;
  v_anchor              trust_anchors%ROWTYPE;
  v_anchor_active_at    boolean;
  v_within_validity_at  boolean;
  v_cert_not_revoked_at boolean;
BEGIN
  SELECT * INTO v_chain FROM certificate_chains WHERE id = p_chain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Certificate chain not found: %', p_chain_id;
  END IF;

  SELECT * INTO v_anchor FROM trust_anchors WHERE id = v_chain.trust_anchor_id;

  v_anchor_active_at    := v_anchor.is_active AND
    (v_anchor.revoked_at IS NULL OR v_anchor.revoked_at > p_at_timestamp);
  v_within_validity_at  := v_chain.validity_not_before <= p_at_timestamp
    AND v_chain.validity_not_after > p_at_timestamp;
  v_cert_not_revoked_at := (v_chain.revoked_at IS NULL OR v_chain.revoked_at > p_at_timestamp);

  RETURN jsonb_build_object(
    'is_valid',             v_anchor_active_at AND v_within_validity_at AND v_cert_not_revoked_at,
    'at_timestamp',         p_at_timestamp,
    'cert_not_revoked_at',  v_cert_not_revoked_at,
    'anchor_active_at',     v_anchor_active_at,
    'within_validity_at',   v_within_validity_at,
    'chain_id',             v_chain.chain_id,
    'revocation_state',     v_chain.revocation_state,
    'cert_revoked_at',      v_chain.revoked_at,
    'anchor_revoked_at',    v_anchor.revoked_at,
    'validity_not_after',   v_chain.validity_not_after
  );
END;
$$;

-- ── reconstruct_historical_trust_state ───────────────────────────────────────
-- Reconstructs trust state at p_at_timestamp using immutable snapshots when available.
-- NEVER uses now() — all lookups are bounded by p_at_timestamp.
-- Primary path: temporal_trust_snapshots (immutable, frozen at capture time).
-- Fallback path: live tables filtered by created_at/registered_at <= p_at_timestamp.

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

  -- Fallback: reconstruct from live tables bounded by p_at_timestamp

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

  -- Latest certificate chain registered at/before p_at_timestamp
  SELECT cc.* INTO v_chain
  FROM certificate_chains cc
  WHERE cc.registered_at <= p_at_timestamp
  ORDER BY cc.registered_at DESC
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

-- ── verify_temporal_chain_integrity ──────────────────────────────────────────
-- Re-derives each chronology_hash from stored evidence_hash and prior_chronology_hash.
-- Uses generate_temporal_chain_hash (IMMUTABLE) — no volatile functions, no now().
-- chain_valid = no divergences AND no sequence gaps AND at least 1 entry found.

CREATE OR REPLACE FUNCTION verify_temporal_chain_integrity(
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
  v_entry      chronology_lineage%ROWTYPE;
  v_evidence   temporal_evidence_records%ROWTYPE;
  v_expected   text;
  v_entries    integer := 0;
  v_divergences integer := 0;
  v_prev_seq   integer := 0;
  v_seq_gap    boolean := false;
  v_detail     jsonb := '[]'::jsonb;
BEGIN
  FOR v_entry IN
    SELECT * FROM chronology_lineage
    WHERE organization_id = p_org_id AND entity_id = p_entity_id
    ORDER BY sequence_number
  LOOP
    v_entries := v_entries + 1;

    -- Check sequence continuity (gaps indicate tampered or missing entries)
    IF v_entries > 1 AND v_entry.sequence_number <> v_prev_seq + 1 THEN
      v_seq_gap := true;
      v_detail := v_detail || jsonb_build_object(
        'sequence_number', v_entry.sequence_number,
        'divergence',      'sequence_gap',
        'expected_seq',    v_prev_seq + 1
      );
    END IF;
    v_prev_seq := v_entry.sequence_number;

    -- Re-derive chronology_hash from stored evidence_hash
    SELECT * INTO v_evidence FROM temporal_evidence_records WHERE id = v_entry.evidence_id;

    v_expected := generate_temporal_chain_hash(
      CASE
        WHEN v_entry.prior_chronology_hash IS NOT NULL
        THEN ARRAY[v_entry.prior_chronology_hash, v_evidence.evidence_hash]
        ELSE ARRAY[v_evidence.evidence_hash]
      END
    );

    IF v_expected <> v_entry.chronology_hash THEN
      v_divergences := v_divergences + 1;
      v_detail := v_detail || jsonb_build_object(
        'sequence_number', v_entry.sequence_number,
        'divergence',      'chronology_hash_mismatch'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'is_valid',        v_divergences = 0 AND NOT v_seq_gap AND v_entries > 0,
    'entries_checked', v_entries,
    'divergences',     v_divergences,
    'sequence_gap',    v_seq_gap,
    'entity_id',       p_entity_id,
    'detail',          v_detail
  );
END;
$$;

-- ── create_temporal_snapshot ─────────────────────────────────────────────────
-- Creates an immutable trust snapshot at p_at_timestamp (NOT now()).
-- snapshot_hash uses canonical_text(p_at_timestamp::text) — deterministic
-- for the supplied timestamp value (never volatile).

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

  -- Latest certificate chain registered at/before p_at_timestamp
  SELECT cc.* INTO v_chain
  FROM certificate_chains cc
  WHERE cc.registered_at <= p_at_timestamp
  ORDER BY cc.registered_at DESC
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

-- ── generate_temporal_replay_certificate ─────────────────────────────────────
-- Comprehensive temporal replay certificate at a historical timestamp.
-- 5 checks — ALL use p_at_timestamp (NOT now()):
-- Check 1: chain_integrity_valid   — chronology chain re-derivable without gaps
-- Check 2: cert_valid_at_timestamp — certificate active at p_at_timestamp
-- Check 3: revoke_valid_at_timestamp — cert/anchor not revoked at p_at_timestamp
-- Check 4: nonrepudiation_valid    — latest evidence nonrepudiation hash intact
-- Check 5: snapshot_created        — immutable snapshot captured
-- validation_hash derived from canonical fields + p_at_timestamp (NOT now()).

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

  -- Find latest certificate chain for cert/revocation checks
  SELECT cc.* INTO v_chain
  FROM certificate_chains cc
  WHERE cc.registered_at <= p_at_timestamp
  ORDER BY cc.registered_at DESC
  LIMIT 1;
  IF FOUND THEN v_chain_found := true; END IF;

  -- Step 3 & 4: Certificate + revocation at p_at_timestamp (NOT now())
  IF v_chain_found THEN
    v_cert_at_result   := validate_certificate_at_timestamp(v_chain.id, p_at_timestamp);
    v_revoke_at_result := validate_revocation_at_timestamp(v_chain.id, p_at_timestamp);
  ELSE
    v_cert_at_result   := jsonb_build_object('is_valid', false, 'error', 'No certificate chain found at timestamp');
    v_revoke_at_result := jsonb_build_object('is_valid', false, 'error', 'No certificate chain found at timestamp');
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

  -- validation_hash: deterministic from canonical fields; p_at_timestamp::text is supplied (not volatile)
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

GRANT EXECUTE ON FUNCTION validate_certificate_at_timestamp     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION validate_revocation_at_timestamp      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reconstruct_historical_trust_state    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION verify_temporal_chain_integrity       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_temporal_snapshot              TO service_role;
GRANT EXECUTE ON FUNCTION generate_temporal_replay_certificate  TO service_role;
