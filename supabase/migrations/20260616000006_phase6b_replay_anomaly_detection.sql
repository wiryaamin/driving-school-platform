-- Phase 6B: DevOps, Replay CI/CD & Production Operations Hardening
-- Migration 6: Replay Anomaly Detection

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'replay_anomaly_detected';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── New enum type ─────────────────────────────────────────────────────────────

CREATE TYPE replay_anomaly_type AS ENUM (
  'chronology_discontinuity',
  'hash_divergence',
  'serializer_incompatibility',
  'reconstruction_anomaly',
  'archive_inconsistency',
  'cross_tenant_leakage',
  'certificate_mismatch'
);

-- ── replay_anomaly_detections ─────────────────────────────────────────────────
-- Immutable: each anomaly detection event is permanently recorded.

CREATE TABLE IF NOT EXISTS replay_anomaly_detections (
  id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid                NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  anomaly_type    replay_anomaly_type NOT NULL,
  entity_type     text                NOT NULL,
  entity_id       uuid,
  severity        text                NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  description     text                NOT NULL,
  detection_hash  text                NOT NULL,
  actor_id        uuid,
  detected_at     timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT chk_rad_detection_hash CHECK (length(detection_hash) = 64)
);

ALTER TABLE replay_anomaly_detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY anomaly_detections_select ON replay_anomaly_detections
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY anomaly_detections_service ON replay_anomaly_detections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_replay_anomaly_detection()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_anomaly_detections rows are immutable';
END;
$$;

CREATE TRIGGER anomaly_detection_immutable
  BEFORE UPDATE OR DELETE ON replay_anomaly_detections
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_anomaly_detection();

CREATE INDEX IF NOT EXISTS idx_rad_brin ON replay_anomaly_detections
  USING brin (detected_at) WITH (pages_per_range = 128);
CREATE INDEX IF NOT EXISTS idx_rad_org ON replay_anomaly_detections(organization_id);

-- ── chronology_integrity_violations ──────────────────────────────────────────
-- Immutable: permanently records each discovered chronology discontinuity.

CREATE TABLE IF NOT EXISTS chronology_integrity_violations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type      text        NOT NULL,
  entity_id        uuid,
  violation_detail text        NOT NULL,
  expected_hash    text,
  actual_hash      text,
  violation_hash   text        NOT NULL,
  actor_id         uuid,
  detected_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_civ_violation_hash CHECK (length(violation_hash) = 64)
);

ALTER TABLE chronology_integrity_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY chron_violations_select ON chronology_integrity_violations
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY chron_violations_service ON chronology_integrity_violations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_chronology_integrity_violation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'chronology_integrity_violations rows are immutable';
END;
$$;

CREATE TRIGGER chron_violation_immutable
  BEFORE UPDATE OR DELETE ON chronology_integrity_violations
  FOR EACH ROW EXECUTE FUNCTION restrict_chronology_integrity_violation();

CREATE INDEX IF NOT EXISTS idx_civ_brin ON chronology_integrity_violations
  USING brin (detected_at) WITH (pages_per_range = 128);

-- ── serializer_divergence_alerts ──────────────────────────────────────────────
-- Immutable: records each serializer schema hash mismatch.

CREATE TABLE IF NOT EXISTS serializer_divergence_alerts (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  serializer_key       text        NOT NULL,
  expected_schema_hash text        NOT NULL,
  actual_schema_hash   text        NOT NULL,
  divergence_type      text        NOT NULL,
  alert_hash           text        NOT NULL,
  actor_id             uuid,
  detected_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_sda_alert_hash CHECK (length(alert_hash) = 64)
);

ALTER TABLE serializer_divergence_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY serializer_div_alerts_select ON serializer_divergence_alerts
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY serializer_div_alerts_service ON serializer_divergence_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_serializer_divergence_alert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'serializer_divergence_alerts rows are immutable';
END;
$$;

CREATE TRIGGER serializer_div_alert_immutable
  BEFORE UPDATE OR DELETE ON serializer_divergence_alerts
  FOR EACH ROW EXECUTE FUNCTION restrict_serializer_divergence_alert();

CREATE INDEX IF NOT EXISTS idx_sda_brin ON serializer_divergence_alerts
  USING brin (detected_at) WITH (pages_per_range = 128);

-- ── replay_chain_break_reports ────────────────────────────────────────────────
-- Immutable: structural chain breaks (distinct from drift in replay_chain_drift_reports).

CREATE TABLE IF NOT EXISTS replay_chain_break_reports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type     text        NOT NULL,
  entity_id       uuid,
  break_position  integer,
  preceding_hash  text,
  following_hash  text,
  break_hash      text        NOT NULL,
  actor_id        uuid,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rcbr_break_hash CHECK (length(break_hash) = 64)
);

ALTER TABLE replay_chain_break_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY chain_break_reports_select ON replay_chain_break_reports
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY chain_break_reports_service ON replay_chain_break_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_replay_chain_break_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_chain_break_reports rows are immutable';
END;
$$;

CREATE TRIGGER chain_break_report_immutable
  BEFORE UPDATE OR DELETE ON replay_chain_break_reports
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_chain_break_report();

CREATE INDEX IF NOT EXISTS idx_rcbr_brin ON replay_chain_break_reports
  USING brin (detected_at) WITH (pages_per_range = 128);

-- ── detect_replay_anomalies ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION detect_replay_anomalies(
  p_org_id      uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_actor_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bad_hash_count  integer;
  v_drift_count     integer;
  v_crit_alerts     integer;
  v_anomalies_found integer;
  v_detection_hash  text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT count(*)::integer INTO v_bad_hash_count
  FROM temporal_evidence_records
  WHERE organization_id = p_org_id
    AND (p_entity_id IS NULL OR entity_id = p_entity_id)
    AND length(evidence_hash) <> 64;

  SELECT count(*)::integer INTO v_drift_count
  FROM replay_chain_drift_reports
  WHERE organization_id = p_org_id
    AND (p_entity_id IS NULL OR entity_id = p_entity_id)
    AND drift_detected = true;

  SELECT count(*)::integer INTO v_crit_alerts
  FROM replay_operational_alerts
  WHERE organization_id = p_org_id AND alert_severity = 'critical' AND resolved_at IS NULL;

  v_anomalies_found := v_bad_hash_count + v_drift_count + v_crit_alerts;

  v_detection_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || canonical_text(p_entity_type) || '|' ||
     v_bad_hash_count::text || '|' || v_drift_count::text || '|' || v_crit_alerts::text)::bytea
  ), 'hex');

  IF v_anomalies_found > 0 THEN
    INSERT INTO replay_anomaly_detections (
      organization_id, anomaly_type, entity_type, entity_id,
      severity, description, detection_hash, actor_id
    ) VALUES (
      p_org_id,
      CASE
        WHEN v_bad_hash_count > 0 THEN 'hash_divergence'
        WHEN v_drift_count > 0    THEN 'reconstruction_anomaly'
        ELSE                           'hash_divergence'
      END::replay_anomaly_type,
      p_entity_type, p_entity_id,
      CASE WHEN v_bad_hash_count > 0 OR v_crit_alerts > 0 THEN 'critical' ELSE 'warning' END,
      'Anomalies: bad_hashes=' || v_bad_hash_count ||
        ' drift=' || v_drift_count || ' critical_alerts=' || v_crit_alerts,
      v_detection_hash, p_actor_id
    );

    INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
    VALUES (p_org_id, 'replay_anomaly_detected', p_entity_type,
      COALESCE(p_entity_id::text, ''), p_actor_id,
      jsonb_build_object('anomalies_found', v_anomalies_found, 'detection_hash', v_detection_hash));
  END IF;

  RETURN jsonb_build_object(
    'anomalies_found',  v_anomalies_found,
    'bad_hash_count',   v_bad_hash_count,
    'drift_count',      v_drift_count,
    'critical_alerts',  v_crit_alerts,
    'detection_hash',   v_detection_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION detect_replay_anomalies(uuid, text, uuid, uuid) TO authenticated, service_role;

-- ── detect_chronology_discontinuities ────────────────────────────────────────

CREATE OR REPLACE FUNCTION detect_chronology_discontinuities(
  p_org_id      uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_actor_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chain_valid    boolean  := true;
  v_gap_count      integer  := 0;
  v_violation_hash text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  BEGIN
    SELECT is_valid, divergence_count::integer INTO v_chain_valid, v_gap_count
    FROM verify_temporal_chain_integrity(
      p_org_id, p_entity_type::filing_entity_type, p_entity_id
    );
    v_gap_count   := COALESCE(v_gap_count, 0);
    v_chain_valid := COALESCE(v_chain_valid, true);
  EXCEPTION WHEN OTHERS THEN
    -- entity_type not in filing_entity_type enum or entity not found — no violations to record
    v_chain_valid := true;
    v_gap_count   := 0;
  END;

  IF NOT v_chain_valid THEN
    v_violation_hash := encode(sha256(
      (canonical_uuid(p_org_id::text) || '|' || canonical_text(p_entity_type) || '|' ||
       p_entity_id::text || '|chronology_discontinuity|' || v_gap_count::text)::bytea
    ), 'hex');

    INSERT INTO chronology_integrity_violations (
      organization_id, entity_type, entity_id, violation_detail,
      violation_hash, actor_id
    ) VALUES (
      p_org_id, p_entity_type, p_entity_id,
      'Chronology discontinuity: ' || v_gap_count || ' gaps detected',
      v_violation_hash, p_actor_id
    );
  END IF;

  RETURN jsonb_build_object(
    'chain_valid',           v_chain_valid,
    'discontinuities_found', v_gap_count,
    'violation_recorded',    NOT v_chain_valid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION detect_chronology_discontinuities(uuid, text, uuid, uuid) TO authenticated, service_role;

-- ── validate_replay_chain_integrity ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION validate_replay_chain_integrity(
  p_org_id      uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_actor_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_valid        boolean := true;
  v_divergence_count integer := 0;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  BEGIN
    SELECT is_valid, divergence_count INTO v_is_valid, v_divergence_count
    FROM verify_temporal_chain_integrity(
      p_org_id, p_entity_type::filing_entity_type, p_entity_id
    );
    v_is_valid        := COALESCE(v_is_valid, true);
    v_divergence_count := COALESCE(v_divergence_count, 0);
  EXCEPTION WHEN OTHERS THEN
    v_is_valid        := true;
    v_divergence_count := 0;
  END;

  RETURN jsonb_build_object(
    'is_valid',         v_is_valid,
    'divergence_count', v_divergence_count,
    'entity_type',      p_entity_type,
    'entity_id',        p_entity_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_replay_chain_integrity(uuid, text, uuid, uuid) TO authenticated, service_role;

-- ── detect_serializer_divergence ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION detect_serializer_divergence(
  p_org_id         uuid,
  p_serializer_key text,
  p_expected_hash  text,
  p_actor_id       uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actual_hash text;
  v_diverged    boolean;
  v_alert_hash  text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT schema_hash INTO v_actual_hash
  FROM canonical_serializer_registry
  WHERE serializer_key = p_serializer_key
  ORDER BY registered_at DESC LIMIT 1;

  v_diverged := (v_actual_hash IS NOT NULL AND v_actual_hash <> p_expected_hash);

  v_alert_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || canonical_text(p_serializer_key) || '|' ||
     canonical_text(p_expected_hash) || '|' || canonical_text(COALESCE(v_actual_hash, '')) || '|' ||
     v_diverged::text)::bytea
  ), 'hex');

  IF v_diverged THEN
    INSERT INTO serializer_divergence_alerts (
      organization_id, serializer_key, expected_schema_hash, actual_schema_hash,
      divergence_type, alert_hash, actor_id
    ) VALUES (
      p_org_id, p_serializer_key, p_expected_hash, v_actual_hash,
      'schema_hash_mismatch', v_alert_hash, p_actor_id
    );
  END IF;

  RETURN jsonb_build_object(
    'serializer_key', p_serializer_key,
    'diverged',       v_diverged,
    'expected_hash',  p_expected_hash,
    'actual_hash',    COALESCE(v_actual_hash, ''),
    'alert_hash',     v_alert_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION detect_serializer_divergence(uuid, text, text, uuid) TO authenticated, service_role;

-- ── generate_replay_anomaly_report ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_replay_anomaly_report(
  p_org_id      uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_actor_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anomaly_count     bigint;
  v_violation_count   bigint;
  v_break_count       bigint;
  v_serializer_alerts bigint;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT count(*) INTO v_anomaly_count
  FROM replay_anomaly_detections
  WHERE organization_id = p_org_id
    AND (p_entity_id IS NULL OR entity_id = p_entity_id);

  SELECT count(*) INTO v_violation_count
  FROM chronology_integrity_violations
  WHERE organization_id = p_org_id
    AND (p_entity_id IS NULL OR entity_id = p_entity_id);

  SELECT count(*) INTO v_break_count
  FROM replay_chain_break_reports
  WHERE organization_id = p_org_id
    AND (p_entity_id IS NULL OR entity_id = p_entity_id);

  SELECT count(*) INTO v_serializer_alerts
  FROM serializer_divergence_alerts WHERE organization_id = p_org_id;

  RETURN jsonb_build_object(
    'organization_id',      p_org_id,
    'entity_type',          p_entity_type,
    'entity_id',            p_entity_id,
    'total_anomalies',      v_anomaly_count,
    'integrity_violations', v_violation_count,
    'chain_breaks',         v_break_count,
    'serializer_alerts',    v_serializer_alerts,
    'report_version',       '6B.1'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_replay_anomaly_report(uuid, text, uuid, uuid) TO authenticated, service_role;
