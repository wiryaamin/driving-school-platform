-- Phase 6A: Platform Stabilization
-- Migration 5: Tenant Isolation Validation — cross-tenant replay boundary enforcement

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'tenant_isolation_validated';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── New enum type ─────────────────────────────────────────────────────────────

CREATE TYPE replay_access_violation_type AS ENUM (
  'cross_tenant_replay',
  'unauthorized_chronology',
  'escalated_access'
);

-- ── tenant_isolation_test_runs ────────────────────────────────────────────────
-- Mutable: isolation test execution state.

CREATE TABLE IF NOT EXISTS tenant_isolation_test_runs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  test_type          text        NOT NULL DEFAULT 'cross_tenant_replay',
  test_status        text        NOT NULL DEFAULT 'running'
                       CHECK (test_status IN ('running', 'completed', 'failed')),
  isolation_verified boolean     NOT NULL DEFAULT false,
  checks_passed      integer     NOT NULL DEFAULT 0,
  checks_total       integer     NOT NULL DEFAULT 0,
  test_hash          text,
  actor_id           uuid,
  executed_at        timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  metadata           jsonb       NOT NULL DEFAULT '{}'
);

ALTER TABLE tenant_isolation_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_test_runs_select ON tenant_isolation_test_runs
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY tenant_isolation_test_runs_service ON tenant_isolation_test_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── replay_access_violations ──────────────────────────────────────────────────
-- Immutable: each recorded cross-tenant access violation attempt.

CREATE TABLE IF NOT EXISTS replay_access_violations (
  id                  uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  requesting_org_id   uuid                        NOT NULL,
  target_org_id       uuid                        NOT NULL,
  attempted_entity_id uuid,
  violation_type      replay_access_violation_type NOT NULL,
  violation_hash      text                        NOT NULL,
  detected_at         timestamptz                 NOT NULL DEFAULT now(),
  CONSTRAINT chk_rav_violation_hash CHECK (length(violation_hash) = 64)
);

CREATE OR REPLACE FUNCTION restrict_replay_access_violation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_access_violations is immutable';
END;
$$;

CREATE TRIGGER trg_replay_access_violations_immutable
  BEFORE UPDATE OR DELETE ON replay_access_violations
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_access_violation();

CREATE INDEX idx_brin_replay_access_violations_detected ON replay_access_violations
  USING brin (detected_at) WITH (pages_per_range = 128);

-- ── chronology_isolation_reports ─────────────────────────────────────────────
-- Immutable: per-entity isolation assessment result.

CREATE TABLE IF NOT EXISTS chronology_isolation_reports (
  id                           uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id              uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type                  filing_entity_type NOT NULL,
  entity_id                    uuid               NOT NULL,
  isolation_verified           boolean            NOT NULL,
  cross_tenant_access_attempted boolean           NOT NULL DEFAULT false,
  report_hash                  text               NOT NULL,
  generated_at                 timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT chk_cir_report_hash CHECK (length(report_hash) = 64)
);

CREATE OR REPLACE FUNCTION restrict_chronology_isolation_report()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'chronology_isolation_reports is immutable';
END;
$$;

CREATE TRIGGER trg_chronology_isolation_reports_immutable
  BEFORE UPDATE OR DELETE ON chronology_isolation_reports
  FOR EACH ROW EXECUTE FUNCTION restrict_chronology_isolation_report();

ALTER TABLE chronology_isolation_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY chronology_isolation_reports_select ON chronology_isolation_reports
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY chronology_isolation_reports_service ON chronology_isolation_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── validate_tenant_replay_isolation ─────────────────────────────────────────
-- 3-check isolation audit: chronology, evidence, and snapshot records are org-scoped.

CREATE OR REPLACE FUNCTION validate_tenant_replay_isolation(
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
  v_run_id             uuid;
  v_checks_pass        integer := 0;
  v_checks_total       integer := 3;
  v_test_hash          text;
  v_passed             boolean;
  v_chron_isolated     boolean;
  v_evidence_isolated  boolean;
  v_snapshots_isolated boolean;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  INSERT INTO tenant_isolation_test_runs (organization_id, test_type, actor_id)
  VALUES (p_org_id, 'cross_tenant_replay', p_actor_id)
  RETURNING id INTO v_run_id;

  -- Check 1: no chronology entries for this entity_id belonging to a different org
  v_chron_isolated := NOT EXISTS (
    SELECT 1 FROM chronology_lineage
    WHERE entity_id = p_entity_id AND organization_id <> p_org_id
  );
  IF v_chron_isolated THEN v_checks_pass := v_checks_pass + 1; END IF;

  -- Check 2: no temporal evidence records for this entity_id in another org
  v_evidence_isolated := NOT EXISTS (
    SELECT 1 FROM temporal_evidence_records
    WHERE entity_id = p_entity_id AND organization_id <> p_org_id
  );
  IF v_evidence_isolated THEN v_checks_pass := v_checks_pass + 1; END IF;

  -- Check 3: no temporal trust snapshots for this entity_id in another org
  v_snapshots_isolated := NOT EXISTS (
    SELECT 1 FROM temporal_trust_snapshots
    WHERE entity_id = p_entity_id AND organization_id <> p_org_id
  );
  IF v_snapshots_isolated THEN v_checks_pass := v_checks_pass + 1; END IF;

  v_passed := v_checks_pass = v_checks_total;
  v_test_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || canonical_uuid(p_entity_id) || '|' ||
     v_checks_pass::text || '|' || v_checks_total::text || '|' || v_passed::text)::bytea
  ), 'hex');

  UPDATE tenant_isolation_test_runs SET
    test_status        = CASE WHEN v_passed THEN 'completed' ELSE 'failed' END,
    isolation_verified = v_passed,
    checks_passed      = v_checks_pass,
    checks_total       = v_checks_total,
    test_hash          = v_test_hash,
    completed_at       = now()
  WHERE id = v_run_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'tenant_isolation_validated', p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object('run_id', v_run_id, 'isolation_verified', v_passed,
                       'checks_passed', v_checks_pass, 'test_hash', v_test_hash));

  RETURN jsonb_build_object(
    'run_id',             v_run_id,
    'isolation_verified', v_passed,
    'checks_passed',      v_checks_pass,
    'checks_total',       v_checks_total,
    'chron_isolated',     v_chron_isolated,
    'evidence_isolated',  v_evidence_isolated,
    'snapshots_isolated', v_snapshots_isolated,
    'test_hash',          v_test_hash
  );
END;
$$;

-- ── simulate_cross_tenant_access ─────────────────────────────────────────────
-- Records a simulated violation attempt for audit/test purposes.
-- Always returns 'access_denied' — actual isolation is enforced by RLS.

CREATE OR REPLACE FUNCTION simulate_cross_tenant_access(
  p_requesting_org_id uuid,
  p_target_org_id     uuid,
  p_entity_id         uuid DEFAULT NULL,
  p_actor_id          uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_violation_hash text;
  v_new_id         uuid;
BEGIN
  v_violation_hash := encode(sha256(
    (canonical_uuid(p_requesting_org_id) || '|' || canonical_uuid(p_target_org_id) || '|' ||
     COALESCE(p_entity_id::text, 'null') || '|cross_tenant_replay')::bytea
  ), 'hex');

  INSERT INTO replay_access_violations (
    requesting_org_id, target_org_id, attempted_entity_id, violation_type, violation_hash
  ) VALUES (
    p_requesting_org_id, p_target_org_id, p_entity_id, 'cross_tenant_replay', v_violation_hash
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'violation_id',   v_new_id,
    'access_result',  'denied',
    'violation_type', 'cross_tenant_replay',
    'violation_hash', v_violation_hash,
    'requesting_org', p_requesting_org_id,
    'target_org',     p_target_org_id
  );
END;
$$;

-- ── validate_security_definer_boundaries ─────────────────────────────────────
-- Verifies GUC context is set, org matches, and no sentinel org is active.

CREATE OR REPLACE FUNCTION validate_security_definer_boundaries(
  p_org_id   uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_guc_org_id    text;
  v_guc_valid     boolean;
  v_org_matches   boolean;
  v_actor_present boolean;
BEGIN
  v_guc_org_id    := current_setting('app.current_org_id', true);
  v_guc_valid     := v_guc_org_id IS NOT NULL AND v_guc_org_id <> '';
  v_org_matches   := v_guc_valid AND (v_guc_org_id::uuid = p_org_id);
  v_actor_present := p_actor_id IS NOT NULL
                  OR current_setting('request.jwt.claims', true) IS NOT NULL;

  RETURN jsonb_build_object(
    'boundary_intact',   v_guc_valid AND v_org_matches,
    'guc_org_set',       v_guc_valid,
    'org_matches',       v_org_matches,
    'actor_context',     v_actor_present,
    'sentinel_rejected', p_org_id <> '00000000-0000-0000-0000-000000000000'::uuid
  );
END;
$$;

-- ── validate_replay_access_controls ──────────────────────────────────────────
-- Audits RLS status of core replay tables; returns per-table result.

CREATE OR REPLACE FUNCTION validate_replay_access_controls(
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
  v_tables_checked text[] := ARRAY[
    'chronology_lineage', 'temporal_evidence_records', 'temporal_trust_snapshots',
    'replay_validation_snapshots', 'replay_test_runs', 'replay_range_windows'
  ];
  v_tbl         text;
  v_rls_enabled boolean;
  v_all_rls     boolean := true;
  v_detail      jsonb := '[]'::jsonb;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  FOREACH v_tbl IN ARRAY v_tables_checked LOOP
    SELECT rowsecurity INTO v_rls_enabled
    FROM pg_tables
    WHERE tablename = v_tbl AND schemaname = 'public';

    IF NOT FOUND OR NOT COALESCE(v_rls_enabled, false) THEN
      v_all_rls := false;
      v_detail  := v_detail || jsonb_build_object('table', v_tbl, 'rls_enabled', false);
    ELSE
      v_detail := v_detail || jsonb_build_object('table', v_tbl, 'rls_enabled', true);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'all_rls_enabled', v_all_rls,
    'tables_checked',  array_length(v_tables_checked, 1),
    'rls_detail',      v_detail
  );
END;
$$;

-- ── generate_tenant_isolation_report ─────────────────────────────────────────
-- Comprehensive isolation assessment combining replay + boundary + access control checks.

CREATE OR REPLACE FUNCTION generate_tenant_isolation_report(
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
  v_isolation_result jsonb;
  v_boundary_result  jsonb;
  v_access_result    jsonb;
  v_overall_isolated boolean;
  v_report_hash      text;
  v_new_id           uuid;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  v_isolation_result := validate_tenant_replay_isolation(p_org_id, p_entity_type, p_entity_id, p_actor_id);
  v_boundary_result  := validate_security_definer_boundaries(p_org_id, p_actor_id);
  v_access_result    := validate_replay_access_controls(p_org_id, p_entity_type, p_entity_id, p_actor_id);

  v_overall_isolated := (v_isolation_result->>'isolation_verified')::boolean
                     AND (v_boundary_result->>'boundary_intact')::boolean
                     AND (v_access_result->>'all_rls_enabled')::boolean;

  v_report_hash := encode(sha256(
    (canonical_uuid(p_org_id) || '|' || canonical_uuid(p_entity_id) || '|' ||
     v_overall_isolated::text || '|tenant_isolation_report')::bytea
  ), 'hex');

  INSERT INTO chronology_isolation_reports (
    organization_id, entity_type, entity_id,
    isolation_verified, cross_tenant_access_attempted, report_hash
  ) VALUES (p_org_id, p_entity_type, p_entity_id, v_overall_isolated, false, v_report_hash)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'report_id',            v_new_id,
    'isolation_verified',   v_overall_isolated,
    'report_hash',          v_report_hash,
    'isolation_detail',     v_isolation_result,
    'boundary_detail',      v_boundary_result,
    'access_control_detail', v_access_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_tenant_replay_isolation     TO service_role;
GRANT EXECUTE ON FUNCTION simulate_cross_tenant_access         TO service_role;
GRANT EXECUTE ON FUNCTION validate_security_definer_boundaries TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION validate_replay_access_controls      TO service_role;
GRANT EXECUTE ON FUNCTION generate_tenant_isolation_report     TO service_role;
