-- Phase 6A: Platform Stabilization
-- Migration 6: Operational Resilience — health checks, integrity scans, alerts, resilience profiles

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'replay_health_check_completed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── New enum types ─────────────────────────────────────────────────────────────

CREATE TYPE replay_alert_type AS ENUM (
  'chronology_corruption',
  'replay_drift',
  'serializer_incompatibility',
  'replay_certificate_mismatch',
  'snapshot_divergence',
  'replay_chain_discontinuity',
  'tenant_isolation_failure'
);

CREATE TYPE replay_health_status AS ENUM (
  'healthy',
  'degraded',
  'critical'
);

-- ── replay_health_checks ──────────────────────────────────────────────────────
-- Mutable: health check state record updated in place per run.

CREATE TABLE IF NOT EXISTS replay_health_checks (
  id              uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  check_type      text               NOT NULL DEFAULT 'full_health',
  health_status   replay_health_status NOT NULL DEFAULT 'healthy',
  checks_passed   integer            NOT NULL DEFAULT 0,
  checks_total    integer            NOT NULL DEFAULT 0,
  health_hash     text               NOT NULL,
  actor_id        uuid,
  checked_at      timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT chk_rhc_health_hash CHECK (length(health_hash) = 64)
);

ALTER TABLE replay_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_health_checks_select ON replay_health_checks
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY replay_health_checks_service ON replay_health_checks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_brin_replay_health_checks_at ON replay_health_checks
  USING brin (checked_at) WITH (pages_per_range = 128);

-- ── chronology_integrity_scans ────────────────────────────────────────────────
-- Immutable: each scan of the chronology chain records its verdict.

CREATE TABLE IF NOT EXISTS chronology_integrity_scans (
  id                   uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type          filing_entity_type NOT NULL,
  entity_id            uuid               NOT NULL,
  sequences_scanned    integer            NOT NULL DEFAULT 0,
  gaps_detected        integer            NOT NULL DEFAULT 0,
  corruptions_detected integer            NOT NULL DEFAULT 0,
  scan_hash            text               NOT NULL,
  scanned_at           timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT chk_cis_scan_hash CHECK (length(scan_hash) = 64)
);

CREATE OR REPLACE FUNCTION restrict_chronology_integrity_scan()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'chronology_integrity_scans is immutable';
END;
$$;

CREATE TRIGGER trg_chronology_integrity_scans_immutable
  BEFORE UPDATE OR DELETE ON chronology_integrity_scans
  FOR EACH ROW EXECUTE FUNCTION restrict_chronology_integrity_scan();

ALTER TABLE chronology_integrity_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY chronology_integrity_scans_select ON chronology_integrity_scans
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY chronology_integrity_scans_service ON chronology_integrity_scans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_brin_chronology_integrity_scans_at ON chronology_integrity_scans
  USING brin (scanned_at) WITH (pages_per_range = 128);

-- ── replay_operational_alerts ─────────────────────────────────────────────────
-- Append-only with partial mutability: rows cannot be deleted or have alert_type changed,
-- but resolved_at may be set to mark resolution.

CREATE TABLE IF NOT EXISTS replay_operational_alerts (
  id              uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  alert_type      replay_alert_type  NOT NULL,
  alert_severity  text               NOT NULL DEFAULT 'warning'
                    CHECK (alert_severity IN ('info', 'warning', 'critical')),
  alert_message   text               NOT NULL,
  resolved_at     timestamptz,
  alert_hash      text               NOT NULL,
  created_at      timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT chk_roa_alert_hash CHECK (length(alert_hash) = 64)
);

CREATE OR REPLACE FUNCTION restrict_replay_operational_alert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'replay_operational_alerts rows cannot be deleted';
  END IF;
  -- UPDATE: only resolved_at may change
  IF OLD.alert_type <> NEW.alert_type THEN
    RAISE EXCEPTION 'replay_operational_alerts: alert_type is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_replay_operational_alerts_partial_immutable
  BEFORE UPDATE OR DELETE ON replay_operational_alerts
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_operational_alert();

ALTER TABLE replay_operational_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_operational_alerts_select ON replay_operational_alerts
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY replay_operational_alerts_service ON replay_operational_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_brin_replay_operational_alerts_at ON replay_operational_alerts
  USING brin (created_at) WITH (pages_per_range = 128);
CREATE INDEX idx_replay_operational_alerts_unresolved ON replay_operational_alerts (organization_id)
  WHERE resolved_at IS NULL;

-- ── replay_resilience_profiles ────────────────────────────────────────────────
-- Mutable: one row per org, upserted after each health check.

CREATE TABLE IF NOT EXISTS replay_resilience_profiles (
  id                  uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  last_health_status  replay_health_status NOT NULL DEFAULT 'healthy',
  last_checked_at     timestamptz        NOT NULL DEFAULT now(),
  total_replays       bigint             NOT NULL DEFAULT 0,
  successful_replays  bigint             NOT NULL DEFAULT 0,
  failed_replays      bigint             NOT NULL DEFAULT 0,
  UNIQUE (organization_id)
);

ALTER TABLE replay_resilience_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_resilience_profiles_select ON replay_resilience_profiles
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY replay_resilience_profiles_service ON replay_resilience_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── run_replay_health_check ───────────────────────────────────────────────────
-- 5-check health assessment; derives health_status; upserts resilience profile.

CREATE OR REPLACE FUNCTION run_replay_health_check(
  p_org_id   uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_checks_pass  integer := 0;
  v_checks_total integer := 5;
  v_status       replay_health_status;
  v_health_hash  text;
  v_new_id       uuid;
  v_chron_exists boolean;
  v_reg_valid    boolean;
  v_hashes_valid boolean;
  v_snapshots_ok boolean;
  v_no_crit_alts boolean;
  v_reg_count    integer;
  v_bad_hashes   integer;
  v_evidence_cnt integer;
  v_snap_cnt     integer;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  -- Check 1: org has chronology entries
  SELECT COUNT(*)::integer INTO v_reg_count
  FROM chronology_lineage WHERE organization_id = p_org_id;
  v_chron_exists := v_reg_count > 0;
  IF v_chron_exists THEN v_checks_pass := v_checks_pass + 1; END IF;

  -- Check 2: serializer registry has at least one replay-compatible + deterministic entry
  SELECT COUNT(*)::integer INTO v_reg_count
  FROM canonical_serializer_registry
  WHERE replay_compatible = true AND deterministic = true;
  v_reg_valid := v_reg_count > 0;
  IF v_reg_valid THEN v_checks_pass := v_checks_pass + 1; END IF;

  -- Check 3: evidence records have valid (64-char) hash lengths
  SELECT COUNT(*)::integer INTO v_bad_hashes
  FROM temporal_evidence_records
  WHERE organization_id = p_org_id
    AND (length(evidence_hash) <> 64 OR length(chronology_hash) <> 64);
  v_hashes_valid := v_bad_hashes = 0;
  IF v_hashes_valid THEN v_checks_pass := v_checks_pass + 1; END IF;

  -- Check 4: replay_validation_snapshots exist OR no evidence yet (both acceptable)
  SELECT COUNT(*)::integer INTO v_evidence_cnt
  FROM temporal_evidence_records WHERE organization_id = p_org_id;
  SELECT COUNT(*)::integer INTO v_snap_cnt
  FROM replay_validation_snapshots WHERE organization_id = p_org_id;
  v_snapshots_ok := v_evidence_cnt = 0 OR v_snap_cnt > 0;
  IF v_snapshots_ok THEN v_checks_pass := v_checks_pass + 1; END IF;

  -- Check 5: no unresolved critical alerts
  SELECT COUNT(*)::integer INTO v_reg_count
  FROM replay_operational_alerts
  WHERE organization_id = p_org_id AND alert_severity = 'critical' AND resolved_at IS NULL;
  v_no_crit_alts := v_reg_count = 0;
  IF v_no_crit_alts THEN v_checks_pass := v_checks_pass + 1; END IF;

  v_status := CASE
    WHEN v_checks_pass = 5 THEN 'healthy'::replay_health_status
    WHEN v_checks_pass >= 3 THEN 'degraded'::replay_health_status
    ELSE 'critical'::replay_health_status
  END;

  v_health_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || v_status::text || '|' ||
     v_checks_pass::text || '|' || v_checks_total::text)::bytea
  ), 'hex');

  INSERT INTO replay_health_checks (
    organization_id, check_type, health_status, checks_passed, checks_total, health_hash, actor_id
  ) VALUES (
    p_org_id, 'full_health', v_status, v_checks_pass, v_checks_total, v_health_hash, p_actor_id
  ) RETURNING id INTO v_new_id;

  INSERT INTO replay_resilience_profiles (organization_id, last_health_status, last_checked_at, total_replays)
  VALUES (p_org_id, v_status, now(), 1)
  ON CONFLICT (organization_id) DO UPDATE SET
    last_health_status = EXCLUDED.last_health_status,
    last_checked_at    = EXCLUDED.last_checked_at,
    total_replays      = replay_resilience_profiles.total_replays + 1,
    successful_replays = replay_resilience_profiles.successful_replays +
                         CASE WHEN EXCLUDED.last_health_status = 'healthy' THEN 1 ELSE 0 END,
    failed_replays     = replay_resilience_profiles.failed_replays +
                         CASE WHEN EXCLUDED.last_health_status = 'critical' THEN 1 ELSE 0 END;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'replay_health_check_completed', 'regulatory_audit_export', v_new_id, p_actor_id,
    jsonb_build_object('health_status', v_status, 'checks_passed', v_checks_pass,
                       'health_hash', v_health_hash));

  RETURN jsonb_build_object(
    'check_id',       v_new_id,
    'health_status',  v_status,
    'checks_passed',  v_checks_pass,
    'checks_total',   v_checks_total,
    'health_hash',    v_health_hash,
    'chron_exists',   v_chron_exists,
    'reg_valid',      v_reg_valid,
    'hashes_valid',   v_hashes_valid,
    'snapshots_ok',   v_snapshots_ok,
    'no_crit_alerts', v_no_crit_alts
  );
END;
$$;

-- ── validate_chronology_integrity ─────────────────────────────────────────────
-- Wraps verify_temporal_chain_integrity; records immutable scan result.

CREATE OR REPLACE FUNCTION validate_chronology_integrity(
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
  v_chain_result     jsonb;
  v_sequences_scanned integer;
  v_gaps             integer;
  v_corruptions      integer;
  v_scan_hash        text;
  v_new_id           uuid;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_chain_result := verify_temporal_chain_integrity(p_org_id, p_entity_type, p_entity_id);

  SELECT COUNT(*)::integer INTO v_sequences_scanned
  FROM chronology_lineage
  WHERE organization_id = p_org_id AND entity_type = p_entity_type AND entity_id = p_entity_id;

  v_gaps        := CASE WHEN (v_chain_result->>'sequence_gap')::boolean THEN 1 ELSE 0 END;
  v_corruptions := COALESCE((v_chain_result->>'divergences')::integer, 0);

  v_scan_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || canonical_uuid(p_entity_id) || '|' ||
     v_sequences_scanned::text || '|' || v_gaps::text || '|' || v_corruptions::text)::bytea
  ), 'hex');

  INSERT INTO chronology_integrity_scans (
    organization_id, entity_type, entity_id,
    sequences_scanned, gaps_detected, corruptions_detected, scan_hash
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    v_sequences_scanned, v_gaps, v_corruptions, v_scan_hash
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'scan_id',           v_new_id,
    'chain_valid',       (v_chain_result->>'is_valid')::boolean,
    'sequences_scanned', v_sequences_scanned,
    'gaps_detected',     v_gaps,
    'corruptions',       v_corruptions,
    'scan_hash',         v_scan_hash
  );
END;
$$;

-- ── detect_replay_chain_corruption ───────────────────────────────────────────
-- Calls verify_temporal_chain_integrity; inserts critical alert if corrupted.

CREATE OR REPLACE FUNCTION detect_replay_chain_corruption(
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
  v_chain_result jsonb;
  v_is_valid     boolean;
  v_divergences  integer;
  v_alert_hash   text;
  v_alert_id     uuid;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_chain_result := verify_temporal_chain_integrity(p_org_id, p_entity_type, p_entity_id);
  v_is_valid     := (v_chain_result->>'is_valid')::boolean;
  v_divergences  := COALESCE((v_chain_result->>'divergences')::integer, 0);

  IF NOT v_is_valid THEN
    v_alert_hash := encode(sha256(
      (canonical_uuid(p_org_id) || '|' || canonical_uuid(p_entity_id) || '|' ||
       'chronology_corruption' || '|' || v_divergences::text)::bytea
    ), 'hex');

    INSERT INTO replay_operational_alerts (
      organization_id, alert_type, alert_severity, alert_message, alert_hash
    ) VALUES (
      p_org_id, 'chronology_corruption', 'critical',
      'Chronology chain integrity failure: ' || v_divergences::text || ' divergence(s) detected for entity ' || p_entity_id::text,
      v_alert_hash
    ) RETURNING id INTO v_alert_id;
  END IF;

  RETURN jsonb_build_object(
    'corruption_detected', NOT v_is_valid,
    'divergences',         v_divergences,
    'chain_valid',         v_is_valid,
    'alert_created',       v_alert_id IS NOT NULL,
    'alert_id',            v_alert_id,
    'chain_detail',        v_chain_result
  );
END;
$$;

-- ── validate_temporal_snapshot_integrity ─────────────────────────────────────
-- Re-derives snapshot_hash using the 5-field canonical formula; compares to stored.

CREATE OR REPLACE FUNCTION validate_temporal_snapshot_integrity(
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
  v_snap             temporal_trust_snapshots%ROWTYPE;
  v_rederived_hash   text;
  v_hashes_match     boolean;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT * INTO v_snap
  FROM temporal_trust_snapshots
  WHERE organization_id = p_org_id
    AND entity_type     = p_entity_type
    AND entity_id       = p_entity_id
    AND snapshot_timestamp <= p_at_timestamp
  ORDER BY snapshot_timestamp DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'snapshot_found', false,
      'hashes_match',   false,
      'entity_id',      p_entity_id
    );
  END IF;

  -- Re-derive using the canonical 5-field formula established in Phase 5F
  v_rederived_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'org_id',           canonical_uuid(p_org_id),
      'entity_id',        canonical_uuid(p_entity_id),
      'entity_type',      canonical_text(p_entity_type::text),
      'at_timestamp',     canonical_text(p_at_timestamp::text),
      'snapshot_version', '5F.1'
    ))::text::bytea
  ), 'hex');

  v_hashes_match := v_rederived_hash = v_snap.snapshot_hash;

  RETURN jsonb_build_object(
    'snapshot_found',  true,
    'hashes_match',    v_hashes_match,
    'stored_hash',     v_snap.snapshot_hash,
    'rederived_hash',  v_rederived_hash,
    'snapshot_id',     v_snap.id,
    'snapshot_ts',     v_snap.snapshot_timestamp
  );
END;
$$;

-- ── detect_replay_hash_divergence ────────────────────────────────────────────
-- Compares current chain tip hash to supplied baseline; records drift report + optional alert.

CREATE OR REPLACE FUNCTION detect_replay_hash_divergence(
  p_org_id        uuid,
  p_entity_type   filing_entity_type,
  p_entity_id     uuid,
  p_baseline_hash text,
  p_actor_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cl           chronology_lineage%ROWTYPE;
  v_current_hash text;
  v_drift        boolean;
  v_report_hash  text;
  v_report_id    uuid;
  v_alert_hash   text;
  v_alert_id     uuid;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT * INTO v_cl
  FROM chronology_lineage
  WHERE organization_id = p_org_id AND entity_type = p_entity_type AND entity_id = p_entity_id
  ORDER BY sequence_number DESC
  LIMIT 1;

  v_current_hash := COALESCE(v_cl.chronology_hash, encode(sha256('empty-chain'::bytea), 'hex'));
  v_drift        := v_current_hash <> p_baseline_hash;

  v_report_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || canonical_uuid(p_entity_id) || '|' ||
     p_baseline_hash || '|' || v_current_hash || '|' || v_drift::text)::bytea
  ), 'hex');

  -- Always record a drift report (immutable)
  INSERT INTO replay_chain_drift_reports (
    organization_id, entity_type, entity_id,
    baseline_hash, current_hash, drift_detected, report_hash
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    p_baseline_hash, v_current_hash, v_drift, v_report_hash
  ) RETURNING id INTO v_report_id;

  IF v_drift THEN
    v_alert_hash := encode(sha256(
      (canonical_uuid(p_org_id) || '|' || canonical_uuid(p_entity_id) || '|' ||
       'replay_drift' || '|' || v_report_hash)::bytea
    ), 'hex');

    INSERT INTO replay_operational_alerts (
      organization_id, alert_type, alert_severity, alert_message, alert_hash
    ) VALUES (
      p_org_id, 'replay_drift', 'warning',
      'Replay hash divergence detected for entity ' || p_entity_id::text,
      v_alert_hash
    ) RETURNING id INTO v_alert_id;
  END IF;

  RETURN jsonb_build_object(
    'drift_detected',  v_drift,
    'baseline_hash',   p_baseline_hash,
    'current_hash',    v_current_hash,
    'report_hash',     v_report_hash,
    'report_id',       v_report_id,
    'alert_created',   v_alert_id IS NOT NULL,
    'alert_id',        v_alert_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION run_replay_health_check                TO service_role;
GRANT EXECUTE ON FUNCTION validate_chronology_integrity          TO service_role;
GRANT EXECUTE ON FUNCTION detect_replay_chain_corruption         TO service_role;
GRANT EXECUTE ON FUNCTION validate_temporal_snapshot_integrity   TO service_role;
GRANT EXECUTE ON FUNCTION detect_replay_hash_divergence          TO service_role;
