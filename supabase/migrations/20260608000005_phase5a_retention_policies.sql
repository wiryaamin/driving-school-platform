-- Phase 5A: Bokföringslagen Retention Policy Governance
-- Tables:    retention_policies, retention_enforcement_log (immutable)
-- Functions: enforce_retention_policy

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE retention_policy_type AS ENUM (
  'accounting_records',   -- Bokföringslagen SFS 1999:1078: 7 years
  'invoices',             -- Bokföringslagen: 7 years
  'bank_statements',      -- Bokföringslagen: 7 years
  'payroll_records',      -- Employer obligation: 10 years
  'tax_declarations',     -- 7 years
  'vat_records',          -- 7 years
  'employee_records',     -- 10 years
  'contracts'             -- 10 years recommended
);

CREATE TYPE retention_enforcement_outcome AS ENUM (
  'compliant',
  'violation',
  'warning',
  'pending_review'
);

-- ── retention_policies ────────────────────────────────────────────────────────

CREATE TABLE retention_policies (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  policy_type       retention_policy_type NOT NULL,
  retention_years   integer     NOT NULL CHECK (retention_years > 0),
  legal_basis       text        NOT NULL,
  applies_to_table  text        NOT NULL,
  applies_to_column text,
  is_active         boolean     NOT NULL DEFAULT true,
  effective_from    date        NOT NULL DEFAULT CURRENT_DATE,
  effective_to      date,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, policy_type, applies_to_table)
);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY retention_policies_select ON retention_policies
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE TRIGGER set_retention_policies_updated_at
  BEFORE UPDATE ON retention_policies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── retention_enforcement_log (fully immutable) ───────────────────────────────

CREATE TABLE retention_enforcement_log (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  policy_id             uuid        NOT NULL REFERENCES retention_policies(id) ON DELETE RESTRICT,
  policy_type           retention_policy_type NOT NULL,
  check_date            date        NOT NULL DEFAULT CURRENT_DATE,
  reference_date        date        NOT NULL,
  earliest_allowed_date date        NOT NULL,
  outcome               retention_enforcement_outcome NOT NULL,
  violation_details     text,
  records_checked       integer     NOT NULL DEFAULT 0,
  records_at_risk       integer     NOT NULL DEFAULT 0,
  enforced_by           uuid        REFERENCES auth.users(id),
  metadata              jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE retention_enforcement_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY retention_enforcement_log_select ON retention_enforcement_log
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE OR REPLACE FUNCTION prevent_retention_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'retention_enforcement_log entries are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER retention_enforcement_log_immutable
  BEFORE UPDATE OR DELETE ON retention_enforcement_log
  FOR EACH ROW EXECUTE FUNCTION prevent_retention_log_mutation();

-- ── enforce_retention_policy() ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_retention_policy(
  p_org_id         uuid,
  p_policy_type    retention_policy_type,
  p_reference_date date DEFAULT CURRENT_DATE,
  p_actor_id       uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy           record;
  v_log_id           uuid;
  v_earliest         date;
  v_records_checked  integer := 0;
  v_records_at_risk  integer := 0;
  v_outcome          retention_enforcement_outcome := 'compliant';
  v_violation        text;
BEGIN
  SELECT * INTO v_policy
  FROM retention_policies
  WHERE organization_id = p_org_id
    AND policy_type = p_policy_type
    AND is_active = true
    AND effective_from <= p_reference_date
    AND (effective_to IS NULL OR effective_to >= p_reference_date);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'pending_review',
      'message', 'No active retention policy found for type: ' || p_policy_type::text
    );
  END IF;

  v_earliest := p_reference_date - make_interval(years => v_policy.retention_years);

  CASE p_policy_type
    WHEN 'accounting_records', 'invoices', 'vat_records', 'tax_declarations' THEN
      -- Count all posted journal entries (immutable — cannot be deleted)
      SELECT COUNT(*) INTO v_records_checked
      FROM journal_entries
      WHERE organization_id = p_org_id
        AND status = 'posted'
        AND entry_date >= v_earliest;
      -- Journal entries are immutable so no records can be at risk of premature deletion
      v_records_at_risk := 0;
      v_outcome         := 'compliant';

    WHEN 'payroll_records', 'employee_records' THEN
      SELECT COUNT(*) INTO v_records_checked
      FROM payroll_runs
      WHERE organization_id = p_org_id
        AND pay_date >= v_earliest;
      -- Check for soft-deleted payroll runs within retention window
      SELECT COUNT(*) INTO v_records_at_risk
      FROM payroll_runs
      WHERE organization_id = p_org_id
        AND pay_date >= v_earliest
        AND deleted_at IS NOT NULL;
      IF v_records_at_risk > 0 THEN
        v_outcome   := 'violation';
        v_violation := format('%s payroll records deleted within %s-year retention period',
          v_records_at_risk, v_policy.retention_years);
      END IF;

    WHEN 'vat_records' THEN
      SELECT COUNT(*) INTO v_records_checked
      FROM vat_periods
      WHERE organization_id = p_org_id
        AND period_start >= v_earliest;
      v_records_at_risk := 0;
      v_outcome         := 'compliant';

    ELSE
      v_records_checked := 0;
      v_outcome         := 'compliant';
  END CASE;

  -- Log the enforcement run
  INSERT INTO retention_enforcement_log (
    organization_id, policy_id, policy_type,
    reference_date, earliest_allowed_date,
    outcome, violation_details,
    records_checked, records_at_risk,
    enforced_by
  ) VALUES (
    p_org_id, v_policy.id, p_policy_type,
    p_reference_date, v_earliest,
    v_outcome, v_violation,
    v_records_checked, v_records_at_risk,
    p_actor_id
  ) RETURNING id INTO v_log_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (
    p_org_id,
    CASE WHEN v_outcome = 'violation'
         THEN 'retention_violation_detected'::compliance_event_type
         ELSE 'retention_policy_enforced'::compliance_event_type END,
    'retention_policy', v_policy.id,
    p_actor_id,
    jsonb_build_object('outcome', v_outcome, 'records_at_risk', v_records_at_risk)
  );

  RETURN jsonb_build_object(
    'log_id',           v_log_id,
    'policy_type',      p_policy_type,
    'outcome',          v_outcome,
    'records_checked',  v_records_checked,
    'records_at_risk',  v_records_at_risk,
    'earliest_date',    v_earliest,
    'violation',        v_violation
  );
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON retention_policies       TO authenticated, service_role;
GRANT SELECT ON retention_enforcement_log TO authenticated, service_role;
