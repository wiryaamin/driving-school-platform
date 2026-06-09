-- Phase 6A: Platform Stabilization
-- Migration 4: Backup/Restore Reproducibility Validation

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'restore_validation_completed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── replay_restore_validations ────────────────────────────────────────────────
-- Immutable: records result of post-restore replay hash comparison.

CREATE TABLE IF NOT EXISTS replay_restore_validations (
  id                   uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type          filing_entity_type NOT NULL,
  entity_id            uuid               NOT NULL,
  pre_restore_hash     text               NOT NULL,
  post_restore_hash    text               NOT NULL,
  hashes_match         boolean            NOT NULL,
  continuity_validated boolean            NOT NULL DEFAULT false,
  validation_hash      text               NOT NULL,
  actor_id             uuid,
  validated_at         timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT chk_rrv_pre_hash  CHECK (length(pre_restore_hash)  = 64),
  CONSTRAINT chk_rrv_post_hash CHECK (length(post_restore_hash) = 64),
  CONSTRAINT chk_rrv_val_hash  CHECK (length(validation_hash)   = 64)
);

CREATE OR REPLACE FUNCTION restrict_replay_restore_validation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_restore_validations is immutable';
END;
$$;

CREATE TRIGGER trg_replay_restore_validation_immutable
  BEFORE UPDATE OR DELETE ON replay_restore_validations
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_restore_validation();

ALTER TABLE replay_restore_validations ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_restore_validations_select ON replay_restore_validations
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY replay_restore_validations_service ON replay_restore_validations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── chronology_restore_reports ────────────────────────────────────────────────
-- Immutable: post-restore chain continuity assessment.

CREATE TABLE IF NOT EXISTS chronology_restore_reports (
  id                    uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type           filing_entity_type NOT NULL,
  entity_id             uuid               NOT NULL,
  chain_length          integer            NOT NULL DEFAULT 0,
  sequence_gap_detected boolean            NOT NULL DEFAULT false,
  continuity_hash       text               NOT NULL,
  report_hash           text               NOT NULL,
  generated_at          timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT chk_crr_cont_hash   CHECK (length(continuity_hash) = 64),
  CONSTRAINT chk_crr_report_hash CHECK (length(report_hash)     = 64)
);

CREATE OR REPLACE FUNCTION restrict_chronology_restore_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'chronology_restore_reports is immutable';
END;
$$;

CREATE TRIGGER trg_chronology_restore_report_immutable
  BEFORE UPDATE OR DELETE ON chronology_restore_reports
  FOR EACH ROW EXECUTE FUNCTION restrict_chronology_restore_report();

ALTER TABLE chronology_restore_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY chronology_restore_reports_select ON chronology_restore_reports
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY chronology_restore_reports_service ON chronology_restore_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── backup_reproducibility_reports ───────────────────────────────────────────
-- Immutable: overall backup/restore reproducibility verdict.

CREATE TABLE IF NOT EXISTS backup_reproducibility_reports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  pre_backup_hash    text        NOT NULL,
  post_restore_hash  text        NOT NULL,
  is_reproducible    boolean     NOT NULL,
  divergence_details jsonb       NOT NULL DEFAULT '{}',
  report_hash        text        NOT NULL,
  actor_id           uuid,
  generated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_brr_pre_hash    CHECK (length(pre_backup_hash)   = 64),
  CONSTRAINT chk_brr_post_hash   CHECK (length(post_restore_hash) = 64),
  CONSTRAINT chk_brr_report_hash CHECK (length(report_hash)       = 64)
);

CREATE OR REPLACE FUNCTION restrict_backup_reproducibility_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'backup_reproducibility_reports is immutable';
END;
$$;

CREATE TRIGGER trg_backup_reproducibility_report_immutable
  BEFORE UPDATE OR DELETE ON backup_reproducibility_reports
  FOR EACH ROW EXECUTE FUNCTION restrict_backup_reproducibility_report();

ALTER TABLE backup_reproducibility_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY backup_reproducibility_reports_select ON backup_reproducibility_reports
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY backup_reproducibility_reports_service ON backup_reproducibility_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── validate_replay_after_restore ────────────────────────────────────────────
-- Compares p_pre_restore_hash against current chain tip; records immutable result.

CREATE OR REPLACE FUNCTION validate_replay_after_restore(
  p_org_id           uuid,
  p_entity_type      filing_entity_type,
  p_entity_id        uuid,
  p_pre_restore_hash text,
  p_actor_id         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cl            chronology_lineage%ROWTYPE;
  v_current_hash  text;
  v_hashes_match  boolean;
  v_chain_result  jsonb;
  v_cont_valid    boolean;
  v_val_hash      text;
  v_new_id        uuid;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT * INTO v_cl
  FROM chronology_lineage
  WHERE organization_id = p_org_id AND entity_type = p_entity_type AND entity_id = p_entity_id
  ORDER BY sequence_number DESC
  LIMIT 1;

  v_current_hash := COALESCE(v_cl.chronology_hash, encode(sha256('empty-chain'::bytea), 'hex'));
  v_hashes_match := v_current_hash = p_pre_restore_hash;

  v_chain_result := verify_temporal_chain_integrity(p_org_id, p_entity_type, p_entity_id);
  v_cont_valid   := (v_chain_result->>'is_valid')::boolean;

  v_val_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || canonical_uuid(p_entity_id) || '|' ||
     p_pre_restore_hash || '|' || v_current_hash || '|' || v_hashes_match::text)::bytea
  ), 'hex');

  INSERT INTO replay_restore_validations (
    organization_id, entity_type, entity_id,
    pre_restore_hash, post_restore_hash, hashes_match, continuity_validated,
    validation_hash, actor_id
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    p_pre_restore_hash, v_current_hash, v_hashes_match, v_cont_valid,
    v_val_hash, p_actor_id
  ) RETURNING id INTO v_new_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'restore_validation_completed', p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object('validation_id', v_new_id, 'hashes_match', v_hashes_match,
                       'continuity_valid', v_cont_valid, 'validation_hash', v_val_hash));

  RETURN jsonb_build_object(
    'validation_id',       v_new_id,
    'hashes_match',        v_hashes_match,
    'pre_restore_hash',    p_pre_restore_hash,
    'current_hash',        v_current_hash,
    'continuity_validated', v_cont_valid,
    'validation_hash',     v_val_hash
  );
END;
$$;

-- ── validate_temporal_chain_after_restore ────────────────────────────────────
-- Full chain integrity check post-restore; stores immutable chronology_restore_report.

CREATE OR REPLACE FUNCTION validate_temporal_chain_after_restore(
  p_org_id      uuid,
  p_entity_type filing_entity_type,
  p_entity_id   uuid,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chain_result    jsonb;
  v_chain_length    integer;
  v_seq_gap         boolean;
  v_continuity_hash text;
  v_report_hash     text;
  v_new_id          uuid;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_chain_result := verify_temporal_chain_integrity(p_org_id, p_entity_type, p_entity_id);

  SELECT COUNT(*)::integer INTO v_chain_length
  FROM chronology_lineage
  WHERE organization_id = p_org_id AND entity_type = p_entity_type AND entity_id = p_entity_id;

  v_seq_gap := (v_chain_result->>'sequence_gap')::boolean;

  v_continuity_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || canonical_uuid(p_entity_id) || '|' ||
     v_chain_length::text || '|' || v_seq_gap::text)::bytea
  ), 'hex');

  v_report_hash := encode(sha256(
    (v_continuity_hash || '|' || (v_chain_result->>'is_valid')::text || '|' ||
     (v_chain_result->>'divergences')::text)::bytea
  ), 'hex');

  INSERT INTO chronology_restore_reports (
    organization_id, entity_type, entity_id,
    chain_length, sequence_gap_detected, continuity_hash, report_hash
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    v_chain_length, v_seq_gap, v_continuity_hash, v_report_hash
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'report_id',             v_new_id,
    'chain_valid',           (v_chain_result->>'is_valid')::boolean,
    'chain_length',          v_chain_length,
    'sequence_gap_detected', v_seq_gap,
    'divergences',           v_chain_result->>'divergences',
    'continuity_hash',       v_continuity_hash,
    'report_hash',           v_report_hash
  );
END;
$$;

-- ── compare_pre_post_restore_hashes ──────────────────────────────────────────
-- IMMUTABLE: pure hash comparison; no DB reads required.

CREATE OR REPLACE FUNCTION compare_pre_post_restore_hashes(
  p_pre_hash  text,
  p_post_hash text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $func$
SELECT jsonb_build_object(
  'hashes_match',    p_pre_hash = p_post_hash,
  'is_reproducible', p_pre_hash = p_post_hash,
  'pre_hash',        p_pre_hash,
  'post_hash',       p_post_hash,
  'diff_hash',       encode(sha256((p_pre_hash || '|diff|' || p_post_hash)::bytea), 'hex')
)
$func$;

-- ── validate_restore_reproducibility ─────────────────────────────────────────
-- Full reproducibility check: compares pre-backup hash to post-restore hash; stores report.

CREATE OR REPLACE FUNCTION validate_restore_reproducibility(
  p_org_id           uuid,
  p_pre_backup_hash  text,
  p_post_restore_hash text,
  p_actor_id         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_comparison  jsonb;
  v_is_repr     boolean;
  v_report_hash text;
  v_new_id      uuid;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_comparison := compare_pre_post_restore_hashes(p_pre_backup_hash, p_post_restore_hash);
  v_is_repr    := (v_comparison->>'is_reproducible')::boolean;

  v_report_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || p_pre_backup_hash || '|' ||
     p_post_restore_hash || '|' || v_is_repr::text)::bytea
  ), 'hex');

  INSERT INTO backup_reproducibility_reports (
    organization_id, pre_backup_hash, post_restore_hash, is_reproducible,
    divergence_details, report_hash, actor_id
  ) VALUES (
    p_org_id, p_pre_backup_hash, p_post_restore_hash, v_is_repr,
    CASE WHEN NOT v_is_repr THEN v_comparison ELSE '{}' END,
    v_report_hash, p_actor_id
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'report_id',         v_new_id,
    'is_reproducible',   v_is_repr,
    'pre_backup_hash',   p_pre_backup_hash,
    'post_restore_hash', p_post_restore_hash,
    'report_hash',       v_report_hash
  );
END;
$$;

-- ── generate_restore_integrity_report ────────────────────────────────────────
-- Comprehensive restore assessment: chain integrity + evidence count summary.

CREATE OR REPLACE FUNCTION generate_restore_integrity_report(
  p_org_id      uuid,
  p_entity_type filing_entity_type,
  p_entity_id   uuid,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chain_report   jsonb;
  v_chain_valid    boolean;
  v_chain_length   integer;
  v_evidence_count integer;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_chain_report := validate_temporal_chain_after_restore(p_org_id, p_entity_type, p_entity_id, p_actor_id);
  v_chain_valid  := (v_chain_report->>'chain_valid')::boolean;
  v_chain_length := (v_chain_report->>'chain_length')::integer;

  SELECT COUNT(*)::integer INTO v_evidence_count
  FROM temporal_evidence_records
  WHERE organization_id = p_org_id AND entity_type = p_entity_type AND entity_id = p_entity_id;

  RETURN jsonb_build_object(
    'integrity_verified', v_chain_valid,
    'chain_length',       v_chain_length,
    'evidence_count',     v_evidence_count,
    'chain_report',       v_chain_report,
    'entity_id',          p_entity_id,
    'entity_type',        p_entity_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_replay_after_restore         TO service_role;
GRANT EXECUTE ON FUNCTION validate_temporal_chain_after_restore TO service_role;
GRANT EXECUTE ON FUNCTION compare_pre_post_restore_hashes       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION validate_restore_reproducibility      TO service_role;
GRANT EXECUTE ON FUNCTION generate_restore_integrity_report     TO service_role;
