-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260604000005_phase4f_regulatory_exports.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4F — AGI Export Infrastructure & Regulatory Audit Exports
--
-- Implements objectives 5 (AGI export), 12 (regulatory audit exports):
--
--   agi_exports       — Arbetsgivardeklaration på individnivå headers
--   agi_export_lines  — Per-employee AGI detail lines (immutable once finalized)
--   regulatory_audit_exports — Immutable audit trail snapshots
--
-- SECURITY DEFINER functions:
--   generate_agi_export(...)             → Build AGI from payroll run + compute SHA-256
--   lock_agi_export(...)                 → Mark as submitted to Skatteverket (irreversible)
--   verify_agi_export_integrity(...)     → SHA-256 hash verification
--   generate_regulatory_audit_export(...)→ Create an immutable audit export snapshot
--   complete_tax_remittance(...)         → Mark remittance as fully completed
--
-- Swedish regulatory context:
--   AGI = Arbetsgivardeklaration på individnivå. Monthly individual-level
--   employer tax declaration filed with Skatteverket by the 12th of next month.
--   Contains: organization number, declaration month, and per-employee:
--   personnummer, gross pay (kontant ersättning), withheld tax (avdragen preliminärskatt),
--   employer contributions, and taxable benefits.
--
-- Immutability:
--   agi_export_lines: blocked once parent agi_export is 'finalized' or 'submitted'
--   regulatory_audit_exports: fully immutable (no UPDATE or DELETE ever)
--
-- Dependencies:
--   20260604000001_phase4f_payroll_core.sql
--   20260604000002_phase4f_payroll_posting_engine.sql
--   pgcrypto extension (for SHA-256, already enabled in Phase 4E)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: AGI Exports ────────────────────────────────────────────────────

CREATE TABLE public.agi_exports (
  id                    uuid                       NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid                       NOT NULL REFERENCES public.organizations(id)     ON DELETE RESTRICT,
  financial_period_id   uuid                                REFERENCES public.financial_periods(id)  ON DELETE RESTRICT,
  payroll_run_id        uuid                                REFERENCES public.payroll_runs(id)        ON DELETE RESTRICT,
  declaration_month     date                       NOT NULL, -- first day of the declaration month
  total_gross           numeric(12,2)              NOT NULL DEFAULT 0 CHECK (total_gross >= 0),
  total_withheld_tax    numeric(12,2)              NOT NULL DEFAULT 0 CHECK (total_withheld_tax >= 0),
  total_employer_contrib numeric(12,2)             NOT NULL DEFAULT 0 CHECK (total_employer_contrib >= 0),
  total_benefits        numeric(12,2)              NOT NULL DEFAULT 0 CHECK (total_benefits >= 0),
  employee_count        int                        NOT NULL DEFAULT 0 CHECK (employee_count >= 0),
  status                public.agi_export_status   NOT NULL DEFAULT 'draft',
  content_hash          text,                       -- SHA-256 of canonical export content
  submitted_at          timestamptz,
  submitted_by          uuid                                REFERENCES auth.users(id) ON DELETE SET NULL,
  skatteverket_receipt  text,                       -- reference number from Skatteverket
  notes                 text,
  metadata              jsonb                      NOT NULL DEFAULT '{}',
  created_at            timestamptz                NOT NULL DEFAULT now(),
  created_by            uuid                                REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT agi_one_per_run UNIQUE (payroll_run_id),
  CONSTRAINT agi_declaration_month_is_month_start
    CHECK (EXTRACT(DAY FROM declaration_month) = 1)
);

COMMENT ON TABLE public.agi_exports IS
  'Arbetsgivardeklaration på individnivå (AGI) export headers. '
  'One AGI export per payroll run. Once finalized, SHA-256 hash seals the content. '
  'Once submitted, the export is immutable (lines are locked).';
COMMENT ON COLUMN public.agi_exports.declaration_month IS
  'First day of the AGI declaration month (e.g. 2026-01-01 = January 2026). '
  'Filing due date is the 12th of the following month.';
COMMENT ON COLUMN public.agi_exports.content_hash IS
  'SHA-256 hash of canonical AGI content (sorted by employee_id). '
  'Used by verify_agi_export_integrity() for tamper detection.';

-- ── Section 2: AGI Export Lines ───────────────────────────────────────────────

CREATE TABLE public.agi_export_lines (
  id                    uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid          NOT NULL REFERENCES public.organizations(id)     ON DELETE RESTRICT,
  agi_export_id         uuid          NOT NULL REFERENCES public.agi_exports(id)       ON DELETE RESTRICT,
  payroll_entry_id      uuid          NOT NULL REFERENCES public.payroll_entries(id)   ON DELETE RESTRICT,
  employee_id           uuid          NOT NULL REFERENCES public.profiles(id)          ON DELETE RESTRICT,
  gross_salary          numeric(12,2) NOT NULL,
  withheld_tax          numeric(12,2) NOT NULL DEFAULT 0,
  employer_contrib      numeric(12,2) NOT NULL DEFAULT 0,
  benefits_amount       numeric(12,2) NOT NULL DEFAULT 0,
  pension_amount        numeric(12,2) NOT NULL DEFAULT 0,
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT agi_line_unique UNIQUE (agi_export_id, payroll_entry_id)
);

COMMENT ON TABLE public.agi_export_lines IS
  'Per-employee AGI detail lines. Immutable once parent export is finalized. '
  'gross_salary = kontant ersättning, withheld_tax = avdragen preliminärskatt, '
  'employer_contrib = arbetsgivaravgifter. One row per payroll_entry in the run.';

-- Immutability trigger: block mutations once export is finalized or submitted
CREATE OR REPLACE FUNCTION public.prevent_finalized_agi_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status public.agi_export_status;
BEGIN
  SELECT status INTO v_status
  FROM   public.agi_exports
  WHERE  id = COALESCE(OLD.agi_export_id, NEW.agi_export_id);

  IF v_status IN ('finalized', 'submitted') THEN
    RAISE EXCEPTION
      'AGI_EXPORT_IMMUTABLE: AGI export lines cannot be modified or deleted once '
      'the export is finalized. Create an amended export if corrections are needed.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agi_export_lines_immutability
  BEFORE UPDATE OR DELETE ON public.agi_export_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_agi_mutation();

-- ── Section 3: Regulatory Audit Exports ──────────────────────────────────────
-- Immutable audit snapshots for regulatory reporting.
-- Once created, no UPDATE or DELETE is permitted.
-- Used for: payroll_register, trial_balance, general_ledger exports.

CREATE TABLE public.regulatory_audit_exports (
  id                    uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  financial_period_id   uuid          REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  export_type           text NOT NULL CHECK (export_type IN
                          ('agi', 'vat_declaration', 'payroll_register', 'trial_balance', 'general_ledger')),
  export_date           timestamptz NOT NULL DEFAULT now(),
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  content_hash          text,                -- SHA-256 of export content
  row_count             int  NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  status                text NOT NULL DEFAULT 'generated'
                              CHECK (status IN ('generated', 'submitted', 'archived')),
  submitted_at          timestamptz,
  notes                 text,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid         REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.regulatory_audit_exports IS
  'Immutable audit trail exports for regulatory reporting. '
  'No UPDATE or DELETE permitted after creation. '
  'content_hash (SHA-256) provides tamper detection for audit reproducibility.';

-- Full immutability: no UPDATE or DELETE ever
CREATE OR REPLACE FUNCTION public.prevent_regulatory_export_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'REGULATORY_EXPORT_IMMUTABLE: regulatory audit exports cannot be modified or deleted. '
    'They are permanent audit records.'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER regulatory_audit_exports_immutability
  BEFORE UPDATE OR DELETE ON public.regulatory_audit_exports
  FOR EACH ROW EXECUTE FUNCTION public.prevent_regulatory_export_mutation();

-- ── Section 4: RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.agi_exports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agi_export_lines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_audit_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agi_exports_org_read"
  ON public.agi_exports FOR SELECT
  USING (organization_id = public.auth_organization_id() AND public.has_permission('finance:agi:read'));

CREATE POLICY "agi_export_lines_org_read"
  ON public.agi_export_lines FOR SELECT
  USING (organization_id = public.auth_organization_id() AND public.has_permission('finance:agi:read'));

CREATE POLICY "regulatory_audit_exports_org_read"
  ON public.regulatory_audit_exports FOR SELECT
  USING (organization_id = public.auth_organization_id() AND public.has_permission('finance:agi:read'));

GRANT SELECT                 ON public.agi_exports              TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agi_exports              TO service_role;
GRANT SELECT                 ON public.agi_export_lines         TO authenticated;
GRANT SELECT, INSERT         ON public.agi_export_lines         TO service_role;
GRANT SELECT                 ON public.regulatory_audit_exports TO authenticated;
GRANT SELECT, INSERT         ON public.regulatory_audit_exports TO service_role;

-- ── Section 5: generate_agi_export ───────────────────────────────────────────
-- Generates an AGI export from a posted payroll run.
-- Creates agi_exports header + one agi_export_lines row per payroll_entry.
-- Computes SHA-256 hash of canonical sorted content and sets status='finalized'.
-- Idempotent: if export already exists for this run, returns existing id.

CREATE OR REPLACE FUNCTION public.generate_agi_export(
  p_org_id         uuid,
  p_payroll_run_id uuid,
  p_notes          text DEFAULT NULL,
  p_actor_id       uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run          payroll_runs%ROWTYPE;
  v_export_id    uuid;
  v_content_data text;
  v_hash         text;
  v_entry        record;
  v_month        date;
BEGIN
  -- 1. Validate run
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_payroll_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_payroll_run_id USING ERRCODE = 'P0001';
  END IF;
  IF v_run.organization_id != p_org_id THEN
    RAISE EXCEPTION 'PAYROLL_RUN_ORG_MISMATCH' USING ERRCODE = 'P0001';
  END IF;
  IF v_run.status != 'posted' THEN
    RAISE EXCEPTION 'AGI_RUN_NOT_POSTED: payroll run % must be posted to generate AGI export (status: %)',
      p_payroll_run_id, v_run.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Idempotency
  SELECT id INTO v_export_id FROM agi_exports WHERE payroll_run_id = p_payroll_run_id;
  IF FOUND THEN RETURN v_export_id; END IF;

  v_month := date_trunc('month', v_run.pay_period_start)::date;

  -- 3. Create export header
  INSERT INTO agi_exports (
    organization_id, financial_period_id, payroll_run_id,
    declaration_month, total_gross, total_withheld_tax, total_employer_contrib,
    total_benefits, employee_count, status, notes, created_by
  ) VALUES (
    p_org_id, v_run.financial_period_id, p_payroll_run_id,
    v_month, v_run.total_gross, v_run.total_withheld_tax, v_run.total_employer_contrib,
    -- Sum benefits from entries
    (SELECT COALESCE(sum(benefits_amount), 0) FROM payroll_entries WHERE payroll_run_id = p_payroll_run_id),
    v_run.entry_count, 'draft', p_notes, p_actor_id
  ) RETURNING id INTO v_export_id;

  -- 4. Insert lines (one per payroll_entry, sorted by employee_id for determinism)
  INSERT INTO agi_export_lines (
    organization_id, agi_export_id, payroll_entry_id, employee_id,
    gross_salary, withheld_tax, employer_contrib, benefits_amount, pension_amount
  )
  SELECT
    p_org_id, v_export_id, pe.id, pe.employee_id,
    pe.gross_salary, pe.withheld_tax, pe.employer_contrib_amount,
    pe.benefits_amount, pe.pension_amount
  FROM payroll_entries pe
  WHERE pe.payroll_run_id = p_payroll_run_id
  ORDER BY pe.employee_id;

  -- 5. Compute SHA-256 content hash (deterministic canonical form)
  SELECT string_agg(
    pe.employee_id::text || '|' ||
    pe.gross_salary::text || '|' ||
    pe.withheld_tax::text || '|' ||
    pe.employer_contrib_amount::text || '|' ||
    pe.benefits_amount::text,
    chr(10) ORDER BY pe.employee_id
  ) INTO v_content_data
  FROM payroll_entries pe
  WHERE pe.payroll_run_id = p_payroll_run_id;

  v_hash := encode(digest(COALESCE(v_content_data, ''), 'sha256'), 'hex');

  -- 6. Finalize: set hash and status
  UPDATE agi_exports
  SET content_hash = v_hash,
      status       = 'finalized'
  WHERE id = v_export_id;

  RETURN v_export_id;
END;
$$;

COMMENT ON FUNCTION public.generate_agi_export(uuid, uuid, text, uuid) IS
  'Generates an AGI (Arbetsgivardeklaration) export from a posted payroll run. '
  'Creates header + per-employee lines. Computes SHA-256 content hash. '
  'Sets status=finalized. Idempotent: returns existing id if already generated.';

GRANT EXECUTE ON FUNCTION public.generate_agi_export(uuid, uuid, text, uuid) TO authenticated, service_role;

-- ── Section 6: lock_agi_export ────────────────────────────────────────────────
-- Marks an AGI export as submitted to Skatteverket.
-- Once submitted, the export is irreversible (lines are immutable by trigger).
-- To correct, create a new AGI export with run_type='correction' and status='amended'.

CREATE OR REPLACE FUNCTION public.lock_agi_export(
  p_agi_export_id   uuid,
  p_receipt         text    DEFAULT NULL,
  p_actor_id        uuid    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_export agi_exports%ROWTYPE;
BEGIN
  SELECT * INTO v_export FROM agi_exports WHERE id = p_agi_export_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGI_EXPORT_NOT_FOUND: %', p_agi_export_id USING ERRCODE = 'P0001';
  END IF;

  IF v_export.status = 'submitted' THEN
    RETURN; -- Already submitted — idempotent
  END IF;

  IF v_export.status != 'finalized' THEN
    RAISE EXCEPTION 'AGI_EXPORT_NOT_FINALIZABLE: export % must be finalized before submission (status: %)',
      p_agi_export_id, v_export.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_export.content_hash IS NULL THEN
    RAISE EXCEPTION 'AGI_EXPORT_NO_HASH: export % has no content hash — regenerate the export',
      p_agi_export_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE agi_exports
  SET status                = 'submitted',
      submitted_at          = now(),
      submitted_by          = p_actor_id,
      skatteverket_receipt  = COALESCE(p_receipt, skatteverket_receipt)
  WHERE id = p_agi_export_id;
END;
$$;

COMMENT ON FUNCTION public.lock_agi_export(uuid, text, uuid) IS
  'Marks an AGI export as submitted to Skatteverket. Irreversible. '
  'Export must be in finalized status with a content hash. '
  'To correct, set original to amended and generate a new AGI export.';

GRANT EXECUTE ON FUNCTION public.lock_agi_export(uuid, text, uuid) TO authenticated, service_role;

-- ── Section 7: verify_agi_export_integrity ────────────────────────────────────
-- Recomputes the SHA-256 hash from current agi_export_lines and compares
-- with the stored hash. Returns tamper-detection result.

CREATE OR REPLACE FUNCTION public.verify_agi_export_integrity(p_agi_export_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_export       agi_exports%ROWTYPE;
  v_content_data text;
  v_current_hash text;
  v_line_count   int;
BEGIN
  SELECT * INTO v_export FROM agi_exports WHERE id = p_agi_export_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGI_EXPORT_NOT_FOUND: %', p_agi_export_id USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*), string_agg(
    employee_id::text || '|' ||
    gross_salary::text || '|' ||
    withheld_tax::text || '|' ||
    employer_contrib::text || '|' ||
    benefits_amount::text,
    chr(10) ORDER BY employee_id
  )
  INTO v_line_count, v_content_data
  FROM agi_export_lines
  WHERE agi_export_id = p_agi_export_id;

  v_current_hash := encode(digest(COALESCE(v_content_data, ''), 'sha256'), 'hex');

  RETURN jsonb_build_object(
    'agi_export_id',    p_agi_export_id,
    'status',           v_export.status,
    'declaration_month', v_export.declaration_month,
    'line_count',       v_line_count,
    'stored_hash',      v_export.content_hash,
    'current_hash',     v_current_hash,
    'matches',          v_export.content_hash = v_current_hash,
    'integrity',        CASE WHEN v_export.content_hash = v_current_hash THEN 'verified' ELSE 'tampered' END,
    'verified_at',      now()
  );
END;
$$;

COMMENT ON FUNCTION public.verify_agi_export_integrity(uuid) IS
  'Recomputes SHA-256 from agi_export_lines and compares with stored hash. '
  'Returns {matches: bool, integrity: "verified"|"tampered"}.';

GRANT EXECUTE ON FUNCTION public.verify_agi_export_integrity(uuid) TO authenticated, service_role;

-- ── Section 8: generate_regulatory_audit_export ───────────────────────────────
-- Creates an immutable audit snapshot for the given period and export type.
-- Computes a SHA-256 hash of the relevant data for tamper detection.

CREATE OR REPLACE FUNCTION public.generate_regulatory_audit_export(
  p_org_id      uuid,
  p_period_id   uuid,
  p_export_type text,
  p_notes       text DEFAULT NULL,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_export_id   uuid;
  v_period      financial_periods%ROWTYPE;
  v_hash        text;
  v_row_count   int := 0;
  v_data        text;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
  END IF;

  IF p_export_type NOT IN ('agi', 'vat_declaration', 'payroll_register', 'trial_balance', 'general_ledger') THEN
    RAISE EXCEPTION 'UNKNOWN_EXPORT_TYPE: % must be one of: agi, vat_declaration, payroll_register, trial_balance, general_ledger',
      p_export_type
      USING ERRCODE = 'P0001';
  END IF;

  -- Build content hash depending on export type
  CASE p_export_type
    WHEN 'payroll_register' THEN
      SELECT count(*), encode(digest(COALESCE(string_agg(
        pe.id::text || pe.employee_id::text || pe.gross_salary::text,
        '' ORDER BY pe.id), ''), 'sha256'), 'hex')
      INTO v_row_count, v_hash
      FROM payroll_entries pe
      JOIN payroll_runs pr ON pr.id = pe.payroll_run_id
      WHERE pr.organization_id     = p_org_id
        AND pr.financial_period_id = p_period_id
        AND pr.status              = 'posted';

    WHEN 'trial_balance' THEN
      SELECT count(*), encode(digest(COALESCE(string_agg(
        account_code || closing_balance::text,
        '' ORDER BY account_code), ''), 'sha256'), 'hex')
      INTO v_row_count, v_hash
      FROM account_balances
      WHERE organization_id     = p_org_id
        AND financial_period_id = p_period_id;

    WHEN 'general_ledger' THEN
      SELECT count(*), encode(digest(COALESCE(string_agg(
        jl.id::text, '' ORDER BY je.voucher_number, jl.line_number), ''), 'sha256'), 'hex')
      INTO v_row_count, v_hash
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE je.organization_id     = p_org_id
        AND je.financial_period_id = p_period_id
        AND je.status              = 'posted';

    WHEN 'agi' THEN
      SELECT count(*), encode(digest(COALESCE(string_agg(
        ae.id::text || ae.declaration_month::text || ae.total_gross::text,
        '' ORDER BY ae.declaration_month), ''), 'sha256'), 'hex')
      INTO v_row_count, v_hash
      FROM agi_exports ae
      WHERE ae.organization_id     = p_org_id
        AND ae.financial_period_id = p_period_id
        AND ae.status              IN ('finalized', 'submitted');

    WHEN 'vat_declaration' THEN
      SELECT count(*), encode(digest(COALESCE(string_agg(
        vcr.id::text || vcr.net_vat_payable::text,
        '' ORDER BY vcr.run_date), ''), 'sha256'), 'hex')
      INTO v_row_count, v_hash
      FROM vat_clearing_runs vcr
      WHERE vcr.organization_id     = p_org_id
        AND vcr.financial_period_id = p_period_id;
  END CASE;

  INSERT INTO regulatory_audit_exports (
    organization_id, financial_period_id, export_type,
    period_start, period_end, content_hash, row_count,
    status, notes, created_by
  ) VALUES (
    p_org_id, p_period_id, p_export_type,
    v_period.period_start, v_period.period_end,
    v_hash, COALESCE(v_row_count, 0),
    'generated', p_notes, p_actor_id
  ) RETURNING id INTO v_export_id;

  RETURN v_export_id;
END;
$$;

COMMENT ON FUNCTION public.generate_regulatory_audit_export(uuid, uuid, text, text, uuid) IS
  'Creates an immutable regulatory audit snapshot with SHA-256 hash. '
  'export_type: agi | vat_declaration | payroll_register | trial_balance | general_ledger. '
  'Once created, the record is immutable (UPDATE/DELETE blocked by trigger).';

GRANT EXECUTE ON FUNCTION public.generate_regulatory_audit_export(uuid, uuid, text, text, uuid)
  TO authenticated, service_role;

-- ── Section 9: complete_tax_remittance ────────────────────────────────────────
-- Marks a tax remittance as fully completed after payment is posted.

CREATE OR REPLACE FUNCTION public.complete_tax_remittance(
  p_remittance_id uuid,
  p_actor_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tax_remittances
  SET status = 'completed'
  WHERE id     = p_remittance_id
    AND status = 'payment_posted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_CANNOT_COMPLETE: remittance % must be in payment_posted status',
      p_remittance_id
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_tax_remittance(uuid, uuid) TO authenticated, service_role;

-- ── Section 10: Regulatory Views ─────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_agi_export_summary AS
SELECT
  ae.id,
  ae.organization_id,
  ae.payroll_run_id,
  ae.financial_period_id,
  ae.declaration_month,
  to_char(ae.declaration_month, 'YYYY-MM') AS declaration_period,
  ae.total_gross,
  ae.total_withheld_tax,
  ae.total_employer_contrib,
  ae.total_benefits,
  ae.employee_count,
  ae.status,
  ae.submitted_at,
  ae.skatteverket_receipt,
  ae.content_hash IS NOT NULL AS has_integrity_hash,
  ae.created_at
FROM public.agi_exports ae;

COMMENT ON VIEW public.v_agi_export_summary IS
  'AGI export summary with declaration_period formatted as YYYY-MM.';

CREATE OR REPLACE VIEW public.v_payroll_register AS
SELECT
  pr.id              AS run_id,
  pr.organization_id,
  pr.run_type,
  pr.pay_period_start,
  pr.pay_period_end,
  pr.pay_date,
  pr.status          AS run_status,
  pr.total_gross     AS run_total_gross,
  pr.total_withheld_tax AS run_total_withheld_tax,
  pr.total_employer_contrib AS run_total_employer_contrib,
  pr.total_net_pay   AS run_total_net_pay,
  pr.entry_count,
  pe.id              AS entry_id,
  pe.employee_id,
  p.first_name,
  p.last_name,
  p.email,
  pe.gross_salary,
  pe.withheld_tax,
  pe.employer_contrib_rate,
  pe.employer_contrib_amount,
  pe.pension_amount,
  pe.benefits_amount,
  pe.net_pay
FROM public.payroll_runs pr
JOIN public.payroll_entries pe ON pe.payroll_run_id = pr.id
JOIN public.profiles p          ON p.id = pe.employee_id
WHERE pr.status != 'reversed';

COMMENT ON VIEW public.v_payroll_register IS
  'Full payroll register: all non-reversed runs with per-employee detail. '
  'Use for payroll_register regulatory audit exports.';

CREATE OR REPLACE VIEW public.v_regulatory_compliance_status AS
SELECT
  o.id   AS organization_id,
  o.name AS organization_name,
  -- Recent AGI submissions (last 3 months)
  (SELECT count(*) FROM public.agi_exports ae
   WHERE ae.organization_id  = o.id
     AND ae.status           = 'submitted'
     AND ae.declaration_month >= (date_trunc('month', CURRENT_DATE) - interval '3 months')::date
  ) AS agi_submissions_recent_3m,
  -- Overdue tax remittances
  (SELECT count(*) FROM public.tax_remittances tr
   WHERE tr.organization_id = o.id
     AND tr.status NOT IN ('completed', 'cancelled')
     AND tr.due_date IS NOT NULL
     AND tr.due_date < CURRENT_DATE
  ) AS overdue_remittances,
  -- Pending VAT clearings
  (SELECT count(*) FROM public.vat_clearing_runs vcr
   WHERE vcr.organization_id = o.id
     AND vcr.status IN ('pending', 'clearing_posted')
  ) AS pending_vat_clearings,
  -- Last payroll run date
  (SELECT MAX(pay_date) FROM public.payroll_runs pr
   WHERE pr.organization_id = o.id AND pr.status = 'posted'
  ) AS last_payroll_date,
  -- Last AGI submission date
  (SELECT MAX(submitted_at) FROM public.agi_exports ae
   WHERE ae.organization_id = o.id AND ae.status = 'submitted'
  ) AS last_agi_submission_at
FROM public.organizations o
WHERE o.deleted_at IS NULL;

COMMENT ON VIEW public.v_regulatory_compliance_status IS
  'Cross-organization regulatory compliance dashboard. '
  'Shows overdue remittances, pending VAT clearings, and recent AGI submission activity.';

GRANT SELECT ON public.v_agi_export_summary           TO authenticated;
GRANT SELECT ON public.v_payroll_register             TO authenticated;
GRANT SELECT ON public.v_regulatory_compliance_status TO authenticated;
