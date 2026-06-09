-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260604000001_phase4f_payroll_core.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4F — Swedish Tax, Payroll & Regulatory Accounting (Core)
--
-- Implements the structural foundation for Swedish payroll accounting:
--   • 4 new enum types for payroll and tax lifecycle states
--   • 9 new BAS 2020 accounts (equity 2091/2099, multi-VAT 2612/2621,
--     payroll liabilities 2710/2731/2732/2940, payroll expense 7210)
--   • payroll_bas_rules — BAS automation rule registry (objective 8)
--   • payroll_runs — immutable payroll period headers
--   • payroll_entries — individual employee payroll lines with
--     immutability guard: blocked once parent run is posted
--
-- Accounting invariants:
--   • Payroll entries satisfy: net_pay = gross_salary - withheld_tax
--   • withheld_tax <= gross_salary enforced by CHECK constraint
--   • Once a run reaches 'posted' status, all entries are immutable
--   • Corrections require a new run with run_type='correction'
--
-- Swedish regulatory BAS accounts for payroll:
--   7010: Löner (salaries expense)
--   7210: Sociala avgifter enligt lag (employer contributions expense)
--   2710: Personalskatt (withheld preliminary income tax liability)
--   2731: Lagstadgade sociala avgifter (employer contributions liability)
--   2940: Upplupna löner (accrued net salaries payable)
--   1630: Avräkning för skatter (Skattekonto clearing)
--
-- Dependencies:
--   20260530000001_phase4a_commercial_core.sql   — financial_periods
--   20260601000001_phase4c_swedish_finance_foundation.sql — bas_account_catalog
--   20260602000001_phase4d_ledger_core.sql        — journal_entries
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ────────────────────────────────────────────────────

CREATE TYPE public.payroll_run_status AS ENUM (
  'draft',       -- Being assembled; entries can be added/modified
  'ready',       -- Validated, totals locked, awaiting post
  'posted',      -- Journal entry created; entries immutable
  'reversed',    -- A full reversal has been posted
  'corrected'    -- A correction run supersedes this run
);

CREATE TYPE public.payroll_run_type AS ENUM (
  'regular',       -- Standard monthly payroll
  'supplementary', -- Extra payments (bonuses, back-pay)
  'correction'     -- Corrects a prior posted run
);

CREATE TYPE public.tax_remittance_status AS ENUM (
  'pending',          -- Remittance created, not yet cleared in ledger
  'clearing_posted',  -- Liability accounts cleared to 1630
  'payment_posted',   -- 1630 paid to Skatteverket (bank)
  'completed',        -- Fully paid and reconciled
  'cancelled'         -- Cancelled before posting
);

CREATE TYPE public.agi_export_status AS ENUM (
  'draft',      -- Being built; lines can change
  'finalized',  -- Hash computed; ready to file
  'submitted',  -- Filed with Skatteverket; immutable
  'amended'     -- A correction AGI supersedes this one
);

-- ── Section 2: BAS 2020 Account Seeds (Phase 4F accounts) ────────────────────

INSERT INTO public.bas_account_catalog
  (account_code, account_name, account_name_en, account_type, normal_balance, sort_order)
VALUES
  -- Equity (used in year-end close; referenced by Phase 4E post_retained_earnings_entry)
  ('2091', 'Balanserade vinstmedel',          'Retained earnings',                          'equity',    'credit', 2091),
  ('2099', 'Årets resultat',                  'Current year result',                        'equity',    'credit', 2099),

  -- Multi-VAT output accounts (enables 12% and 6% rate infrastructure)
  ('2612', 'Utgående moms, 12%',              'Output VAT 12%',                             'vat',       'credit', 2612),
  ('2621', 'Utgående moms, 6%',               'Output VAT 6%',                              'vat',       'credit', 2621),

  -- Payroll liability accounts
  ('2710', 'Personalskatt',                   'Personnel withholding tax',                  'liability', 'credit', 2710),
  ('2731', 'Lagstadgade sociala avgifter',    'Statutory social contributions liability',   'liability', 'credit', 2731),
  ('2732', 'Semesterlöneskuld',               'Accrued vacation pay liability',             'liability', 'credit', 2732),
  ('2940', 'Upplupna löner',                  'Accrued salaries payable',                   'liability', 'credit', 2940),

  -- Payroll expense account
  ('7210', 'Sociala avgifter enligt lag',     'Statutory social contributions expense',     'expense',   'debit',  7210)
ON CONFLICT (account_code) DO NOTHING;

-- Seed new platform BAS event mappings for payroll events
INSERT INTO public.platform_bas_event_mappings
  (event_type, account_debit, account_credit, vat_rate_code, description)
VALUES
  ('Payroll.Posted',      '7010', '2940', NULL, 'Löner bokförda — lönekostnad / upplupna löner'),
  ('Payroll.Paid',        '2940', '1930', NULL, 'Löner utbetalda — upplupna löner / bank'),
  ('Tax.Cleared',         '2710', '1630', NULL, 'Personalskatt avräknad — mot skattekonto'),
  ('Tax.Paid',            '1630', '1930', NULL, 'Skatteverket betalat — skattekonto / bank'),
  ('VAT.Cleared',         '2610', '2650', NULL, 'Momsredovisning — utgående moms / momsredovisningskonto'),
  ('VAT.Paid',            '2650', '1930', NULL, 'Moms betald — momsredovisningskonto / bank')
ON CONFLICT (event_type) DO NOTHING;

-- ── Section 3: Payroll BAS Automation Rules (Objective 8) ────────────────────
-- Maps payroll event types to standard Swedish BAS debit/credit accounts.
-- Read by the posting engine to derive journal lines deterministically.
-- This table is the audit-reproducible source of truth for BAS automation.

CREATE TABLE public.payroll_bas_rules (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_code      text        NOT NULL UNIQUE,
  rule_name      text        NOT NULL,
  account_debit  text        NOT NULL REFERENCES public.bas_account_catalog(account_code),
  account_credit text        NOT NULL REFERENCES public.bas_account_catalog(account_code),
  description    text,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payroll_bas_rules IS
  'Swedish BAS automation rule registry for payroll postings. '
  'Maps payroll event types to standard BAS 2020 debit/credit account pairs. '
  'Read by the posting engine — changes here affect all future payroll journals.';

INSERT INTO public.payroll_bas_rules
  (rule_code, rule_name, account_debit, account_credit, description)
VALUES
  ('SALARY_EXPENSE',           'Salary expense accrual',          '7010', '2940',
   'Löner: DR 7010 Löner / CR 2940 Upplupna löner'),
  ('EMPLOYER_CONTRIB_EXPENSE', 'Employer contribution expense',   '7210', '2731',
   'Arbetsgivaravgifter: DR 7210 Sociala avgifter / CR 2731 Avgiftsskuld'),
  ('SALARY_PAYMENT',           'Salary net payment to bank',      '2940', '1930',
   'Utbetalning: DR 2940 Upplupna löner / CR 1930 Bank'),
  ('TAX_CLEARING',             'Withheld-tax clearing',           '2710', '1630',
   'Skatteavräkning: DR 2710 Personalskatt / CR 1630 Skattekonto'),
  ('CONTRIB_CLEARING',         'Employer contribution clearing',  '2731', '1630',
   'Avgiftsavräkning: DR 2731 Sociala avgifter / CR 1630 Skattekonto'),
  ('SKATTEVERKET_PAYMENT',     'Payment to Skatteverket',         '1630', '1930',
   'Skattebetalning: DR 1630 Skattekonto / CR 1930 Bank'),
  ('VAT_CLEARING_25',          'Output VAT 25% clearing',         '2610', '2650',
   'Momsavräkning 25%: DR 2610 Utgående moms / CR 2650 Momsredovisning'),
  ('VAT_CLEARING_12',          'Output VAT 12% clearing',         '2612', '2650',
   'Momsavräkning 12%: DR 2612 Utgående moms / CR 2650 Momsredovisning'),
  ('VAT_CLEARING_6',           'Output VAT 6% clearing',          '2621', '2650',
   'Momsavräkning 6%: DR 2621 Utgående moms / CR 2650 Momsredovisning'),
  ('VAT_INPUT_CLEARING',       'Input VAT clearing',              '2650', '2640',
   'Ingående momsavräkning: DR 2650 / CR 2640 Ingående moms'),
  ('VAT_PAYMENT',              'VAT payment to Skatteverket',     '2650', '1930',
   'Momsbetalning: DR 2650 Momsredovisning / CR 1930 Bank')
ON CONFLICT (rule_code) DO NOTHING;

-- ── Section 4: Payroll Runs ───────────────────────────────────────────────────
-- Header record for each payroll processing run.
-- Once status reaches 'posted', the run becomes the source of truth for
-- the corresponding journal entry. Corrections require a new run.

CREATE TABLE public.payroll_runs (
  id                       uuid                      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id          uuid                      NOT NULL REFERENCES public.organizations(id)       ON DELETE RESTRICT,
  financial_period_id      uuid                               REFERENCES public.financial_periods(id)   ON DELETE RESTRICT,
  run_type                 public.payroll_run_type   NOT NULL DEFAULT 'regular',
  pay_period_start         date                      NOT NULL,
  pay_period_end           date                      NOT NULL,
  pay_date                 date,
  status                   public.payroll_run_status NOT NULL DEFAULT 'draft',
  total_gross              numeric(12,2)             NOT NULL DEFAULT 0  CHECK (total_gross >= 0),
  total_withheld_tax       numeric(12,2)             NOT NULL DEFAULT 0  CHECK (total_withheld_tax >= 0),
  total_employer_contrib   numeric(12,2)             NOT NULL DEFAULT 0  CHECK (total_employer_contrib >= 0),
  total_net_pay            numeric(12,2)             NOT NULL DEFAULT 0  CHECK (total_net_pay >= 0),
  entry_count              int                       NOT NULL DEFAULT 0  CHECK (entry_count >= 0),
  journal_entry_id         uuid                               REFERENCES public.journal_entries(id)     ON DELETE RESTRICT,
  salary_payment_entry_id  uuid                               REFERENCES public.journal_entries(id)     ON DELETE RESTRICT,
  correction_of_run_id     uuid                               REFERENCES public.payroll_runs(id)        ON DELETE RESTRICT,
  notes                    text,
  metadata                 jsonb                     NOT NULL DEFAULT '{}',
  created_at               timestamptz               NOT NULL DEFAULT now(),
  created_by               uuid                               REFERENCES auth.users(id)                 ON DELETE SET NULL,
  posted_at                timestamptz,
  posted_by                uuid                               REFERENCES auth.users(id)                 ON DELETE SET NULL,

  CONSTRAINT pr_date_order   CHECK (pay_period_end >= pay_period_start),
  CONSTRAINT pr_posted_check CHECK (status = 'draft' OR status = 'ready' OR journal_entry_id IS NOT NULL OR status IN ('reversed', 'corrected'))
);

COMMENT ON TABLE public.payroll_runs IS
  'Payroll processing run headers. One run per payroll period per org. '
  'Once status=''posted'', the run is immutable and drives the journal entry. '
  'Corrections create a new run with run_type=''correction'' referencing correction_of_run_id. '
  'Voucher series ''L'' (Lön) used for payroll journal entries.';

CREATE TRIGGER set_payroll_runs_updated_at
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Section 5: Payroll Entries ────────────────────────────────────────────────
-- Per-employee payroll lines within a run.
-- Immutable once the parent run reaches 'posted', 'reversed', or 'corrected'.
-- net_pay = gross_salary - withheld_tax enforced as CHECK constraint.

CREATE TABLE public.payroll_entries (
  id                       uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id          uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payroll_run_id           uuid          NOT NULL REFERENCES public.payroll_runs(id)  ON DELETE RESTRICT,
  employee_id              uuid          NOT NULL REFERENCES public.profiles(id)      ON DELETE RESTRICT,
  instructor_id            uuid                   REFERENCES public.instructors(id)   ON DELETE SET NULL,
  gross_salary             numeric(12,2) NOT NULL CHECK (gross_salary > 0),
  withheld_tax             numeric(12,2) NOT NULL DEFAULT 0 CHECK (withheld_tax >= 0),
  employer_contrib_rate    numeric(5,4)  NOT NULL DEFAULT 0.3142
                                         CHECK (employer_contrib_rate >= 0 AND employer_contrib_rate < 1),
  employer_contrib_amount  numeric(12,2) NOT NULL DEFAULT 0 CHECK (employer_contrib_amount >= 0),
  pension_amount           numeric(12,2) NOT NULL DEFAULT 0 CHECK (pension_amount >= 0),
  benefits_amount          numeric(12,2) NOT NULL DEFAULT 0 CHECK (benefits_amount >= 0),
  net_pay                  numeric(12,2) NOT NULL DEFAULT 0 CHECK (net_pay >= 0),
  notes                    text,
  metadata                 jsonb         NOT NULL DEFAULT '{}',
  created_at               timestamptz   NOT NULL DEFAULT now(),
  created_by               uuid                   REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT pe_run_employee_unique UNIQUE (payroll_run_id, employee_id),
  CONSTRAINT pe_tax_not_exceed_gross CHECK (withheld_tax <= gross_salary),
  CONSTRAINT pe_net_consistent       CHECK (net_pay = gross_salary - withheld_tax)
);

COMMENT ON TABLE public.payroll_entries IS
  'Per-employee payroll lines. Immutable once parent run is posted. '
  'net_pay = gross_salary - withheld_tax is enforced as a CHECK constraint. '
  'employer_contrib_amount is calculated as gross_salary × employer_contrib_rate '
  'and stored explicitly for audit reproducibility. '
  'Default employer_contrib_rate=0.3142 reflects Swedish arbetsgivaravgifter 31.42%.';
COMMENT ON COLUMN public.payroll_entries.employer_contrib_rate IS
  'Swedish arbetsgivaravgifter rate (default 31.42%). '
  'Stored explicitly per entry for regulatory audit reproducibility.';
COMMENT ON COLUMN public.payroll_entries.benefits_amount IS
  'Skattepliktiga förmåner (taxable benefits). Included in gross for AGI reporting.';

-- ── Section 6: Payroll Entries Immutability ────────────────────────────────────
-- Block UPDATE and DELETE once the parent run is posted, reversed, or corrected.
-- This enforces the "no destructive payroll edits" invariant at the DB level.

CREATE OR REPLACE FUNCTION public.prevent_posted_payroll_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_run_status public.payroll_run_status;
BEGIN
  SELECT status INTO v_run_status
  FROM   public.payroll_runs
  WHERE  id = COALESCE(OLD.payroll_run_id, NEW.payroll_run_id);

  IF v_run_status IN ('posted', 'reversed', 'corrected') THEN
    RAISE EXCEPTION
      'PAYROLL_ENTRY_IMMUTABLE: payroll entries cannot be modified or deleted '
      'once the run is posted. Use reverse_payroll_run() or create a correction run.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_posted_payroll_entry_mutation() IS
  'BEFORE UPDATE OR DELETE guard on payroll_entries. '
  'Blocks mutations when the parent run is posted, reversed, or corrected.';

CREATE TRIGGER payroll_entries_immutability
  BEFORE UPDATE OR DELETE ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_payroll_entry_mutation();

-- ── Section 7: Row Level Security ─────────────────────────────────────────────

ALTER TABLE public.payroll_bas_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_entries   ENABLE ROW LEVEL SECURITY;

-- payroll_bas_rules: platform-global reference data, all authenticated users can read
CREATE POLICY "payroll_bas_rules_read"
  ON public.payroll_bas_rules FOR SELECT
  USING (is_active = true);

CREATE POLICY "payroll_runs_org_read"
  ON public.payroll_runs FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:payroll:read')
  );

CREATE POLICY "payroll_entries_org_read"
  ON public.payroll_entries FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:payroll:read')
  );

-- ── Section 8: Table Grants ────────────────────────────────────────────────────

GRANT SELECT                        ON public.payroll_bas_rules TO authenticated, service_role;
GRANT SELECT                        ON public.payroll_runs      TO authenticated;
GRANT SELECT, INSERT, UPDATE        ON public.payroll_runs      TO service_role;
GRANT SELECT                        ON public.payroll_entries   TO authenticated;
GRANT SELECT, INSERT                ON public.payroll_entries   TO service_role;

-- ── Section 9: Permissions ────────────────────────────────────────────────────

INSERT INTO public.permissions (code, domain, resource, action, description) VALUES
  ('finance:payroll:read',   'finance', 'payroll', 'read',   'View payroll runs, entries, and payroll journals'),
  ('finance:payroll:manage', 'finance', 'payroll', 'manage', 'Create and manage payroll runs and entries'),
  ('finance:payroll:post',   'finance', 'payroll', 'post',   'Post payroll journals and salary payments to the ledger'),
  ('finance:tax:read',       'finance', 'tax',     'read',   'View tax remittances and VAT clearing runs'),
  ('finance:tax:manage',     'finance', 'tax',     'manage', 'Create tax remittances and VAT clearing runs'),
  ('finance:agi:read',       'finance', 'agi',     'read',   'View AGI (Arbetsgivardeklaration) exports'),
  ('finance:agi:manage',     'finance', 'agi',     'manage', 'Generate and submit AGI exports to Skatteverket')
ON CONFLICT (code) DO NOTHING;

-- Org owner, org_admin, finance_admin: full payroll access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin', 'finance_admin')
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:payroll:read', 'finance:payroll:manage', 'finance:payroll:post',
    'finance:tax:read',     'finance:tax:manage',
    'finance:agi:read',     'finance:agi:manage'
  ])
ON CONFLICT DO NOTHING;

-- Org manager: read-only access to payroll and tax
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_manager'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:payroll:read', 'finance:tax:read', 'finance:agi:read'
  ])
ON CONFLICT DO NOTHING;
