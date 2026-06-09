-- Phase 5A: AGI Submission Infrastructure + Compliance Event Foundation
-- Tables:    compliance_events (immutable), agi_submissions, agi_submission_lines (immutable),
--            agi_corrections (immutable)
-- Functions: generate_agi_export (CREATE OR REPLACE — adds compliance event),
--            generate_agi_submission, certify_agi_submission, create_agi_correction

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE compliance_event_type AS ENUM (
  'agi_export_generated',
  'agi_export_finalized',
  'agi_submission_generated',
  'agi_submission_certified',
  'agi_correction_created',
  'vat_declaration_generated',
  'vat_declaration_certified',
  'vat_correction_created',
  'saft_export_generated',
  'saft_export_submitted',
  'filing_certified',
  'compliance_hash_generated',
  'retention_policy_enforced',
  'retention_violation_detected'
);

CREATE TYPE agi_submission_status AS ENUM (
  'draft',
  'pending',
  'submitted',
  'accepted',
  'rejected',
  'corrected'
);

CREATE TYPE agi_correction_reason AS ENUM (
  'employee_addition',
  'employee_deletion',
  'amount_correction',
  'period_correction',
  'other'
);

-- ── compliance_events (immutable audit log — must exist before functions) ─────

CREATE TABLE compliance_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  event_type      compliance_event_type NOT NULL,
  entity_type     text        NOT NULL,
  entity_id       uuid        NOT NULL,
  actor_id        uuid        REFERENCES auth.users(id),
  metadata        jsonb       NOT NULL DEFAULT '{}',
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE compliance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_events_select ON compliance_events
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE OR REPLACE FUNCTION prevent_compliance_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'compliance_events are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER compliance_events_immutable
  BEFORE UPDATE OR DELETE ON compliance_events
  FOR EACH ROW EXECUTE FUNCTION prevent_compliance_event_mutation();

-- ── agi_submissions ───────────────────────────────────────────────────────────

CREATE TABLE agi_submissions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  agi_export_id            uuid        NOT NULL REFERENCES agi_exports(id) ON DELETE RESTRICT,
  declaration_period_start date        NOT NULL,
  declaration_period_end   date        NOT NULL,
  submission_status        agi_submission_status NOT NULL DEFAULT 'pending',
  submission_reference     text,
  submission_hash          text        NOT NULL,
  skatteverket_receipt     text,
  accepted_at              timestamptz,
  rejected_at              timestamptz,
  rejection_reason         text,
  correction_of_id         uuid        REFERENCES agi_submissions(id) ON DELETE RESTRICT,
  submitted_at             timestamptz,
  submitted_by             uuid        REFERENCES auth.users(id),
  certified_at             timestamptz,
  certified_by             uuid        REFERENCES auth.users(id),
  certification_hash       text,
  notes                    text,
  metadata                 jsonb       NOT NULL DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid        REFERENCES auth.users(id)
);

ALTER TABLE agi_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY agi_submissions_select ON agi_submissions
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

-- Protect amounts and hash once set
CREATE OR REPLACE FUNCTION prevent_agi_submission_hash_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.submission_hash != OLD.submission_hash OR
     NEW.agi_export_id   != OLD.agi_export_id THEN
    RAISE EXCEPTION 'agi_submission content is immutable once set'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agi_submissions_protect_content
  BEFORE UPDATE ON agi_submissions
  FOR EACH ROW EXECUTE FUNCTION prevent_agi_submission_hash_mutation();

-- ── agi_submission_lines (fully immutable) ────────────────────────────────────

CREATE TABLE agi_submission_lines (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  submission_id      uuid        NOT NULL REFERENCES agi_submissions(id) ON DELETE RESTRICT,
  agi_export_line_id uuid        REFERENCES agi_export_lines(id) ON DELETE RESTRICT,
  employee_id        uuid        NOT NULL,
  gross_salary       numeric(15,2) NOT NULL DEFAULT 0,
  withheld_tax       numeric(15,2) NOT NULL DEFAULT 0,
  employer_contrib   numeric(15,2) NOT NULL DEFAULT 0,
  benefits_amount    numeric(15,2) NOT NULL DEFAULT 0,
  pension_amount     numeric(15,2) NOT NULL DEFAULT 0,
  is_corrected       boolean     NOT NULL DEFAULT false,
  correction_note    text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agi_submission_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY agi_submission_lines_select ON agi_submission_lines
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE OR REPLACE FUNCTION prevent_agi_submission_line_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'agi_submission_lines are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER agi_submission_lines_immutable
  BEFORE UPDATE OR DELETE ON agi_submission_lines
  FOR EACH ROW EXECUTE FUNCTION prevent_agi_submission_line_mutation();

-- ── agi_corrections (fully immutable) ────────────────────────────────────────

CREATE TABLE agi_corrections (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  original_submission_id   uuid        NOT NULL REFERENCES agi_submissions(id) ON DELETE RESTRICT,
  correction_submission_id uuid        REFERENCES agi_submissions(id) ON DELETE RESTRICT,
  correction_reason        agi_correction_reason NOT NULL,
  correction_description   text        NOT NULL,
  correction_hash          text        NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid        REFERENCES auth.users(id)
);

ALTER TABLE agi_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY agi_corrections_select ON agi_corrections
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE OR REPLACE FUNCTION prevent_agi_correction_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'agi_corrections are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER agi_corrections_immutable
  BEFORE UPDATE OR DELETE ON agi_corrections
  FOR EACH ROW EXECUTE FUNCTION prevent_agi_correction_mutation();

-- ── generate_agi_export (CREATE OR REPLACE — adds Phase 5A compliance event) ─

CREATE OR REPLACE FUNCTION generate_agi_export(
  p_org_id         uuid,
  p_payroll_run_id uuid,
  p_notes          text DEFAULT NULL,
  p_actor_id       uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run          record;
  v_export_id    uuid;
  v_content_hash text;
BEGIN
  SELECT * INTO v_run
  FROM payroll_runs
  WHERE id = p_payroll_run_id
    AND organization_id = p_org_id
    AND status = 'posted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Posted payroll run not found: %', p_payroll_run_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotent: return existing export
  SELECT id INTO v_export_id
  FROM agi_exports
  WHERE organization_id = p_org_id AND payroll_run_id = p_payroll_run_id;
  IF FOUND THEN RETURN v_export_id; END IF;

  -- Canonical hash
  v_content_hash := encode(
    sha256((
      p_org_id::text             || '|' ||
      p_payroll_run_id::text     || '|' ||
      ROUND(v_run.total_gross, 2)::text            || '|' ||
      ROUND(v_run.total_withheld_tax, 2)::text     || '|' ||
      ROUND(v_run.total_employer_contrib, 2)::text
    )::bytea),
    'hex'
  );

  INSERT INTO agi_exports (
    organization_id,
    financial_period_id,
    payroll_run_id,
    declaration_month,
    total_gross,
    total_withheld_tax,
    total_employer_contrib,
    total_benefits,
    employee_count,
    status,
    content_hash,
    notes,
    created_by
  ) VALUES (
    p_org_id,
    v_run.financial_period_id,
    p_payroll_run_id,
    to_char(v_run.pay_period_start, 'YYYY-MM'),
    v_run.total_gross,
    v_run.total_withheld_tax,
    v_run.total_employer_contrib,
    COALESCE((
      SELECT SUM(benefits_amount) FROM payroll_entries
      WHERE payroll_run_id = p_payroll_run_id AND organization_id = p_org_id
    ), 0),
    COALESCE((
      SELECT COUNT(*) FROM payroll_entries
      WHERE payroll_run_id = p_payroll_run_id AND organization_id = p_org_id
    ), 0)::integer,
    'draft',
    v_content_hash,
    p_notes,
    p_actor_id
  ) RETURNING id INTO v_export_id;

  INSERT INTO agi_export_lines (
    organization_id, agi_export_id, payroll_entry_id,
    employee_id, gross_salary, withheld_tax, employer_contrib, benefits_amount, pension_amount
  )
  SELECT
    p_org_id, v_export_id, id,
    employee_id, gross_salary, withheld_tax, employer_contrib_amount, benefits_amount, pension_amount
  FROM payroll_entries
  WHERE payroll_run_id = p_payroll_run_id AND organization_id = p_org_id;

  -- Phase 5A: compliance event
  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'agi_export_generated', 'agi_export', v_export_id, p_actor_id,
    jsonb_build_object('payroll_run_id', p_payroll_run_id, 'content_hash', v_content_hash));

  RETURN v_export_id;
END;
$$;

-- ── generate_agi_submission() ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_agi_submission(
  p_org_id        uuid,
  p_agi_export_id uuid,
  p_actor_id      uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_export        record;
  v_submission_id uuid;
  v_hash          text;
  v_period_start  date;
  v_period_end    date;
BEGIN
  SELECT * INTO v_export
  FROM agi_exports
  WHERE id = p_agi_export_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGI export not found: %', p_agi_export_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_export.status NOT IN ('finalized', 'submitted') THEN
    RAISE EXCEPTION 'AGI export must be finalized before submission (status: %)', v_export.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotent
  SELECT id INTO v_submission_id
  FROM agi_submissions
  WHERE organization_id = p_org_id
    AND agi_export_id = p_agi_export_id
    AND correction_of_id IS NULL;
  IF FOUND THEN RETURN v_submission_id; END IF;

  -- Derive period from declaration_month (format 'YYYY-MM')
  v_period_start := to_date(v_export.declaration_month || '-01', 'YYYY-MM-DD');
  v_period_end   := (v_period_start + interval '1 month - 1 day')::date;

  -- Canonical hash via canonical_accounting_hash (Phase 4H-A function)
  v_hash := canonical_accounting_hash(
    jsonb_build_array(jsonb_build_object(
      'account_code', 'AGI',
      'debit',   ROUND(v_export.total_gross, 2),
      'credit',  ROUND(v_export.total_withheld_tax, 2),
      'balance', ROUND(v_export.total_employer_contrib, 2)
    ))
  );

  INSERT INTO agi_submissions (
    organization_id, agi_export_id,
    declaration_period_start, declaration_period_end,
    submission_status, submission_hash, created_by
  ) VALUES (
    p_org_id, p_agi_export_id,
    v_period_start, v_period_end,
    'pending', v_hash, p_actor_id
  ) RETURNING id INTO v_submission_id;

  INSERT INTO agi_submission_lines (
    organization_id, submission_id, agi_export_line_id,
    employee_id, gross_salary, withheld_tax, employer_contrib, benefits_amount, pension_amount
  )
  SELECT
    p_org_id, v_submission_id, id,
    employee_id, gross_salary, withheld_tax, employer_contrib, benefits_amount, pension_amount
  FROM agi_export_lines
  WHERE agi_export_id = p_agi_export_id AND organization_id = p_org_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'agi_submission_generated', 'agi_submission', v_submission_id, p_actor_id,
    jsonb_build_object('agi_export_id', p_agi_export_id, 'hash', v_hash));

  RETURN v_submission_id;
END;
$$;

-- ── certify_agi_submission() ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION certify_agi_submission(
  p_org_id        uuid,
  p_submission_id uuid,
  p_receipt       text DEFAULT NULL,
  p_actor_id      uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub  record;
  v_hash text;
BEGIN
  SELECT * INTO v_sub
  FROM agi_submissions
  WHERE id = p_submission_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGI submission not found: %', p_submission_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_sub.submission_status NOT IN ('pending', 'submitted') THEN
    RAISE EXCEPTION 'Cannot certify AGI submission in status: %', v_sub.submission_status
      USING ERRCODE = 'check_violation';
  END IF;

  v_hash := encode(
    sha256((
      p_submission_id::text || '|' ||
      v_sub.submission_hash  || '|' ||
      COALESCE(p_receipt, '') || '|' ||
      now()::text
    )::bytea),
    'hex'
  );

  UPDATE agi_submissions SET
    submission_status    = 'submitted',
    skatteverket_receipt = COALESCE(p_receipt, skatteverket_receipt),
    submitted_at         = COALESCE(submitted_at, now()),
    submitted_by         = COALESCE(submitted_by, p_actor_id),
    certified_at         = now(),
    certified_by         = p_actor_id,
    certification_hash   = v_hash
  WHERE id = p_submission_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'agi_submission_certified', 'agi_submission', p_submission_id, p_actor_id,
    jsonb_build_object('certification_hash', v_hash, 'receipt', p_receipt));

  RETURN jsonb_build_object(
    'submission_id',      p_submission_id,
    'certification_hash', v_hash,
    'certified_at',       now()
  );
END;
$$;

-- ── create_agi_correction() ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_agi_correction(
  p_org_id                 uuid,
  p_original_submission_id uuid,
  p_correction_reason      agi_correction_reason,
  p_description            text,
  p_actor_id               uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original  record;
  v_corr_id   uuid;
  v_hash      text;
BEGIN
  SELECT * INTO v_original
  FROM agi_submissions
  WHERE id = p_original_submission_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGI submission not found: %', p_original_submission_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_original.submission_status NOT IN ('submitted', 'accepted', 'rejected') THEN
    RAISE EXCEPTION 'Can only correct submitted/accepted/rejected submissions (status: %)',
      v_original.submission_status USING ERRCODE = 'check_violation';
  END IF;

  v_hash := encode(
    sha256((
      p_original_submission_id::text || '|' ||
      p_correction_reason::text      || '|' ||
      p_description                  || '|' ||
      now()::text
    )::bytea),
    'hex'
  );

  INSERT INTO agi_corrections (
    organization_id, original_submission_id,
    correction_reason, correction_description, correction_hash, created_by
  ) VALUES (
    p_org_id, p_original_submission_id,
    p_correction_reason, p_description, v_hash, p_actor_id
  ) RETURNING id INTO v_corr_id;

  UPDATE agi_submissions SET submission_status = 'corrected'
  WHERE id = p_original_submission_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'agi_correction_created', 'agi_correction', v_corr_id, p_actor_id,
    jsonb_build_object('original_submission_id', p_original_submission_id,
                       'correction_reason', p_correction_reason));

  RETURN v_corr_id;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON compliance_events      TO authenticated, service_role;
GRANT SELECT ON agi_submissions        TO authenticated, service_role;
GRANT SELECT ON agi_submission_lines   TO authenticated, service_role;
GRANT SELECT ON agi_corrections        TO authenticated, service_role;
