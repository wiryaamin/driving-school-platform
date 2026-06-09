-- Phase 6B: DevOps, Replay CI/CD & Production Operations Hardening
-- Migration 5: Operational Observability

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'operational_metrics_collected';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── replay_operational_metrics ────────────────────────────────────────────────
-- Immutable: one snapshot per collection run.

CREATE TABLE IF NOT EXISTS replay_operational_metrics (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid          NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  metric_type           text          NOT NULL DEFAULT 'operational_snapshot',
  replay_throughput_rps numeric(12,2) NOT NULL DEFAULT 0,
  replay_latency_ms     integer       NOT NULL DEFAULT 0,
  divergence_count      integer       NOT NULL DEFAULT 0,
  error_count           integer       NOT NULL DEFAULT 0,
  elements_processed    integer       NOT NULL DEFAULT 0,
  metrics_hash          text          NOT NULL,
  actor_id              uuid,
  collected_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_rom_metrics_hash CHECK (length(metrics_hash) = 64)
);

ALTER TABLE replay_operational_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_op_metrics_select ON replay_operational_metrics
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY replay_op_metrics_service ON replay_operational_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_replay_operational_metric()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_operational_metrics rows are immutable';
END;
$$;

CREATE TRIGGER replay_op_metrics_immutable
  BEFORE UPDATE OR DELETE ON replay_operational_metrics
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_operational_metric();

CREATE INDEX IF NOT EXISTS idx_rom_brin ON replay_operational_metrics
  USING brin (collected_at) WITH (pages_per_range = 128);
CREATE INDEX IF NOT EXISTS idx_rom_org ON replay_operational_metrics(organization_id);

-- ── chronology_health_metrics ─────────────────────────────────────────────────
-- Immutable: one measurement per growth-rate collection.

CREATE TABLE IF NOT EXISTS chronology_health_metrics (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid          NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  total_entries       bigint        NOT NULL DEFAULT 0,
  growth_rate_per_day numeric(12,4) NOT NULL DEFAULT 0,
  chain_gap_count     integer       NOT NULL DEFAULT 0,
  last_chain_hash     text,
  health_score        integer       NOT NULL DEFAULT 100
                      CHECK (health_score BETWEEN 0 AND 100),
  metric_hash         text          NOT NULL,
  actor_id            uuid,
  measured_at         timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_chm_metric_hash CHECK (length(metric_hash) = 64)
);

ALTER TABLE chronology_health_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY chron_health_metrics_select ON chronology_health_metrics
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY chron_health_metrics_service ON chronology_health_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_chronology_health_metric()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'chronology_health_metrics rows are immutable';
END;
$$;

CREATE TRIGGER chron_health_metric_immutable
  BEFORE UPDATE OR DELETE ON chronology_health_metrics
  FOR EACH ROW EXECUTE FUNCTION restrict_chronology_health_metric();

CREATE INDEX IF NOT EXISTS idx_chm_brin ON chronology_health_metrics
  USING brin (measured_at) WITH (pages_per_range = 128);

-- ── replay_integrity_alerts ───────────────────────────────────────────────────
-- Partial mutability: alert_source immutable; resolved_at settable.

CREATE TABLE IF NOT EXISTS replay_integrity_alerts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  alert_source    text        NOT NULL,
  alert_message   text        NOT NULL,
  severity        text        NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  alert_hash      text        NOT NULL,
  resolved_at     timestamptz,
  actor_id        uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ria_alert_hash CHECK (length(alert_hash) = 64)
);

ALTER TABLE replay_integrity_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_integrity_alerts_select ON replay_integrity_alerts
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY replay_integrity_alerts_service ON replay_integrity_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_replay_integrity_alert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'replay_integrity_alerts rows cannot be deleted';
  END IF;
  IF OLD.alert_source <> NEW.alert_source THEN
    RAISE EXCEPTION 'replay_integrity_alerts: alert_source is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER replay_integrity_alert_restrict
  BEFORE UPDATE OR DELETE ON replay_integrity_alerts
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_integrity_alert();

CREATE INDEX IF NOT EXISTS idx_ria_brin ON replay_integrity_alerts
  USING brin (created_at) WITH (pages_per_range = 128);
CREATE INDEX IF NOT EXISTS idx_ria_unresolved ON replay_integrity_alerts(organization_id)
  WHERE resolved_at IS NULL;

-- ── replay_observability_profiles ────────────────────────────────────────────
-- Mutable: one row per org, upserted on each metric collection.

CREATE TABLE IF NOT EXISTS replay_observability_profiles (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid          NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  total_metrics_collected bigint        NOT NULL DEFAULT 0,
  avg_throughput_rps      numeric(12,2) NOT NULL DEFAULT 0,
  avg_latency_ms          integer       NOT NULL DEFAULT 0,
  total_divergences       bigint        NOT NULL DEFAULT 0,
  total_errors            bigint        NOT NULL DEFAULT 0,
  last_health_score       integer       NOT NULL DEFAULT 100,
  last_collected_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_rop_unique UNIQUE (organization_id)
);

ALTER TABLE replay_observability_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY obs_profiles_select ON replay_observability_profiles
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY obs_profiles_service ON replay_observability_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── collect_replay_operational_metrics ───────────────────────────────────────

CREATE OR REPLACE FUNCTION collect_replay_operational_metrics(
  p_org_id   uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_throughput  numeric(12,2);
  v_latency     integer;
  v_divergences integer;
  v_errors      integer;
  v_elements    integer;
  v_metric_hash text;
  v_t0          timestamptz;
  v_elapsed     integer;
  v_health      integer;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_t0 := clock_timestamp();

  SELECT count(*)::integer INTO v_divergences
  FROM replay_chain_drift_reports
  WHERE organization_id = p_org_id AND drift_detected = true;

  SELECT count(*)::integer INTO v_errors
  FROM replay_operational_alerts
  WHERE organization_id = p_org_id AND alert_severity = 'critical' AND resolved_at IS NULL;

  SELECT count(*)::integer INTO v_elements
  FROM temporal_evidence_records WHERE organization_id = p_org_id;

  v_elapsed    := GREATEST(1, extract(milliseconds FROM (clock_timestamp() - v_t0))::integer);
  v_latency    := v_elapsed;
  v_throughput := ROUND((v_elements::numeric / v_elapsed) * 1000, 2);
  v_health     := CASE WHEN v_errors = 0 THEN 100 ELSE GREATEST(0, 100 - v_errors * 10) END;

  v_metric_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|operational_metrics|' ||
     v_divergences::text || '|' || v_errors::text || '|' || v_elements::text)::bytea
  ), 'hex');

  INSERT INTO replay_operational_metrics (
    organization_id, metric_type, replay_throughput_rps, replay_latency_ms,
    divergence_count, error_count, elements_processed, metrics_hash, actor_id
  ) VALUES (
    p_org_id, 'operational_snapshot', v_throughput, v_latency,
    v_divergences, v_errors, v_elements, v_metric_hash, p_actor_id
  );

  INSERT INTO replay_observability_profiles (
    organization_id, total_metrics_collected, avg_throughput_rps, avg_latency_ms,
    total_divergences, total_errors, last_health_score, last_collected_at
  ) VALUES (p_org_id, 1, v_throughput, v_latency, v_divergences, v_errors, v_health, now())
  ON CONFLICT (organization_id) DO UPDATE
    SET total_metrics_collected = replay_observability_profiles.total_metrics_collected + 1,
        avg_throughput_rps      = ROUND(
          (replay_observability_profiles.avg_throughput_rps + v_throughput) / 2, 2),
        avg_latency_ms          = (replay_observability_profiles.avg_latency_ms + v_latency) / 2,
        total_divergences       = replay_observability_profiles.total_divergences + v_divergences,
        total_errors            = replay_observability_profiles.total_errors + v_errors,
        last_health_score       = v_health,
        last_collected_at       = now();

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'operational_metrics_collected', 'replay_operational_metrics',
    gen_random_uuid()::text, p_actor_id,
    jsonb_build_object('elements', v_elements, 'divergences', v_divergences, 'metric_hash', v_metric_hash));

  RETURN jsonb_build_object(
    'metric_type',        'operational_snapshot',
    'throughput_rps',     v_throughput,
    'latency_ms',         v_latency,
    'divergence_count',   v_divergences,
    'error_count',        v_errors,
    'elements_processed', v_elements,
    'metric_hash',        v_metric_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION collect_replay_operational_metrics(uuid, uuid) TO authenticated, service_role;

-- ── calculate_chronology_growth_rate ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION calculate_chronology_growth_rate(
  p_org_id   uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total       bigint;
  v_age_days    numeric;
  v_growth_rate numeric(12,4);
  v_chain_tip   text;
  v_health      integer;
  v_metric_hash text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT count(*) INTO v_total
  FROM temporal_evidence_records WHERE organization_id = p_org_id;

  SELECT GREATEST(1, extract(epoch FROM (now() - min(recorded_at))) / 86400)
  INTO v_age_days
  FROM temporal_evidence_records WHERE organization_id = p_org_id;

  v_growth_rate := CASE WHEN v_age_days > 0 THEN ROUND(v_total::numeric / v_age_days, 4) ELSE 0 END;

  SELECT COALESCE(max(chronology_hash), '') INTO v_chain_tip
  FROM chronology_lineage WHERE organization_id = p_org_id;

  v_health := CASE
    WHEN v_total = 0           THEN 50
    WHEN v_growth_rate > 1000  THEN 80
    ELSE                            100
  END;

  v_metric_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|growth_rate|' ||
     v_total::text || '|' || v_growth_rate::text)::bytea
  ), 'hex');

  INSERT INTO chronology_health_metrics (
    organization_id, total_entries, growth_rate_per_day, chain_gap_count,
    last_chain_hash, health_score, metric_hash, actor_id
  ) VALUES (p_org_id, v_total, v_growth_rate, 0, v_chain_tip, v_health, v_metric_hash, p_actor_id);

  RETURN jsonb_build_object(
    'total_entries',       v_total,
    'growth_rate_per_day', v_growth_rate,
    'health_score',        v_health,
    'chain_tip',           v_chain_tip,
    'metric_hash',         v_metric_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_chronology_growth_rate(uuid, uuid) TO authenticated, service_role;

-- ── detect_replay_integrity_anomalies ────────────────────────────────────────

CREATE OR REPLACE FUNCTION detect_replay_integrity_anomalies(
  p_org_id   uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bad_hashes      integer;
  v_unresolved_crit integer;
  v_drift_count     integer;
  v_anomaly_count   integer;
  v_alert_hash      text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT count(*)::integer INTO v_bad_hashes
  FROM temporal_evidence_records
  WHERE organization_id = p_org_id AND length(evidence_hash) <> 64;

  SELECT count(*)::integer INTO v_unresolved_crit
  FROM replay_operational_alerts
  WHERE organization_id = p_org_id AND alert_severity = 'critical' AND resolved_at IS NULL;

  SELECT count(*)::integer INTO v_drift_count
  FROM replay_chain_drift_reports WHERE organization_id = p_org_id AND drift_detected = true;

  v_anomaly_count := v_bad_hashes + v_unresolved_crit + v_drift_count;

  IF v_anomaly_count > 0 THEN
    v_alert_hash := encode(sha256(
      (canonical_uuid(p_org_id::text) || '|integrity_anomaly|' ||
       v_bad_hashes::text || '|' || v_unresolved_crit::text || '|' || v_drift_count::text)::bytea
    ), 'hex');

    INSERT INTO replay_integrity_alerts (
      organization_id, alert_source, alert_message, severity, alert_hash, actor_id
    ) VALUES (
      p_org_id,
      'integrity_anomaly_detector',
      'Detected ' || v_anomaly_count || ' anomalies (bad_hashes=' || v_bad_hashes ||
        ' critical_alerts=' || v_unresolved_crit || ' drift_reports=' || v_drift_count || ')',
      CASE WHEN v_bad_hashes > 0 OR v_unresolved_crit > 0 THEN 'critical' ELSE 'warning' END,
      v_alert_hash, p_actor_id
    );
  END IF;

  RETURN jsonb_build_object(
    'anomaly_count',     v_anomaly_count,
    'bad_hash_count',    v_bad_hashes,
    'critical_alerts',   v_unresolved_crit,
    'drift_reports',     v_drift_count,
    'alert_emitted',     v_anomaly_count > 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION detect_replay_integrity_anomalies(uuid, uuid) TO authenticated, service_role;

-- ── validate_operational_replay_health ───────────────────────────────────────

CREATE OR REPLACE FUNCTION validate_operational_replay_health(
  p_org_id   uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile    record;
  v_is_healthy boolean;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT * INTO v_profile FROM replay_observability_profiles WHERE organization_id = p_org_id;

  v_is_healthy := COALESCE(v_profile.last_health_score, 100) >= 80
               AND COALESCE(v_profile.total_errors, 0) = 0;

  RETURN jsonb_build_object(
    'is_healthy',         v_is_healthy,
    'health_score',       COALESCE(v_profile.last_health_score, 100),
    'total_metrics',      COALESCE(v_profile.total_metrics_collected, 0),
    'total_divergences',  COALESCE(v_profile.total_divergences, 0),
    'total_errors',       COALESCE(v_profile.total_errors, 0),
    'avg_throughput_rps', COALESCE(v_profile.avg_throughput_rps, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_operational_replay_health(uuid, uuid) TO authenticated, service_role;

-- ── generate_operability_report ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_operability_report(
  p_org_id   uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_health    jsonb;
  v_growth    jsonb;
  v_anomalies jsonb;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_health    := validate_operational_replay_health(p_org_id, p_actor_id);
  v_growth    := calculate_chronology_growth_rate(p_org_id, p_actor_id);
  v_anomalies := detect_replay_integrity_anomalies(p_org_id, p_actor_id);

  RETURN jsonb_build_object(
    'organization_id', p_org_id,
    'health',          v_health,
    'growth',          v_growth,
    'anomalies',       v_anomalies,
    'report_version',  '6B.1'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_operability_report(uuid, uuid) TO authenticated, service_role;
