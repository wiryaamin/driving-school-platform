-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260602000001_phase4d_ledger_core.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4D — Double-Entry Ledger Core
--
-- Implements the immutable double-entry accounting engine core:
--   ledger_voucher_sequences  — gap-free voucher numbering per (org, year, series)
--   journal_entries           — immutable voucher headers (verifikat)
--   journal_lines             — immutable debit/credit lines (kontorader)
--   account_balances          — running balance cache per (org, period, account)
--
-- Accounting invariants enforced at DB level:
--   • journal_entries and journal_lines are immutable once created (UPDATE/DELETE blocked)
--   • Balanced entries: total_debit = total_credit (enforced at posting time + CHECK)
--   • Voucher numbers are gap-free (sequential within org + fiscal year + series)
--   • account_balances maintained atomically by post_journal_entry() SECURITY DEFINER
--   • Period lock check: posting to a locked period raises an exception
--
-- Accounting principles:
--   closing_balance = opening_balance + debit_movement - credit_movement
--   For debit-normal accounts (assets/expenses): positive closing = debit balance
--   For credit-normal accounts (liabilities/equity/revenue): negative closing = credit balance
--   Interpretation is done at reporting time by joining bas_account_catalog.normal_balance
--
-- Reversal model:
--   Reversals create NEW journal entries with entry_type='reversal'
--   and reversal_of_entry_id pointing to the original.
--   Original entries are NEVER modified — their effective status is derived via VIEW.
--
-- Dependencies:
--   20260530000001_phase4a_commercial_core.sql   — financial_periods
--   20260601000002_phase4c_vat_and_periods.sql   — vat_rates
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ────────────────────────────────────────────────────

CREATE TYPE public.journal_entry_type AS ENUM (
  'standard',        -- Normal business-event posting (invoice, payment, etc.)
  'reversal',        -- Full reversal of a prior posted entry (all debits↔credits swapped)
  'correction',      -- Corrective re-posting after a reversal
  'opening_balance', -- Opening balance entry for a new financial period
  'closing',         -- Period-closing entry (allocate profit/loss to equity)
  'manual'           -- Manual journal entry posted directly by an accountant
);

CREATE TYPE public.journal_entry_status AS ENUM (
  'draft',   -- Entry being built; balance not yet enforced; not included in reports
  'posted'   -- Entry is posted, balanced, voucher-numbered, and immutable
);

-- ── Section 2: Ledger Voucher Sequences ──────────────────────────────────────
-- Gap-free voucher numbering per (org, fiscal_year, series).
-- Mirrors the invoice_number_sequences pattern from Phase 4A.
-- Updated atomically by post_journal_entry() via INSERT ON CONFLICT DO UPDATE.

CREATE TABLE public.ledger_voucher_sequences (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fiscal_year      int         NOT NULL CHECK (fiscal_year >= 2020 AND fiscal_year <= 2099),
  voucher_series   text        NOT NULL DEFAULT 'A',
  last_number      int         NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lvs_unique UNIQUE (organization_id, fiscal_year, voucher_series)
);

COMMENT ON TABLE public.ledger_voucher_sequences IS
  'Gap-free voucher counter per (org, fiscal_year, series). '
  'Updated atomically by post_journal_entry() via INSERT ON CONFLICT DO UPDATE. '
  'Series A = general; M = manual corrections.';

CREATE TRIGGER set_ledger_voucher_sequences_updated_at
  BEFORE UPDATE ON public.ledger_voucher_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Section 3: Journal Entries (Verifikat) ────────────────────────────────────
-- Core immutable voucher records. A journal entry is posted directly as 'posted'
-- with total_debit = total_credit enforced. Once posted, all fields are frozen.
-- Reversals create NEW entries (entry_type='reversal'); originals are never mutated.

CREATE TABLE public.journal_entries (
  id                      uuid                        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id         uuid                        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  financial_period_id     uuid                        REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  entry_type              public.journal_entry_type   NOT NULL DEFAULT 'standard',
  status                  public.journal_entry_status NOT NULL DEFAULT 'draft',
  voucher_series          text                        NOT NULL DEFAULT 'A',
  voucher_number          int                         CHECK (voucher_number IS NULL OR voucher_number >= 1),
  entry_date              date                        NOT NULL,
  description             text                        NOT NULL DEFAULT '',
  source_event_type       text,
  source_entity_type      text,
  source_entity_id        uuid,
  reversal_of_entry_id    uuid                        REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  correction_of_entry_id  uuid                        REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  total_debit             numeric(12,2)               NOT NULL DEFAULT 0 CHECK (total_debit >= 0),
  total_credit            numeric(12,2)               NOT NULL DEFAULT 0 CHECK (total_credit >= 0),
  posted_at               timestamptz,
  posted_by               uuid                        REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                   text,
  metadata                jsonb                       NOT NULL DEFAULT '{}',
  created_at              timestamptz                 NOT NULL DEFAULT now(),
  created_by              uuid                        REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT je_balance_posted_check
    CHECK (status = 'draft' OR total_debit = total_credit),
  CONSTRAINT je_posted_has_voucher
    CHECK (status = 'draft' OR voucher_number IS NOT NULL)
);

COMMENT ON TABLE public.journal_entries IS
  'Immutable double-entry vouchers (verifikat). '
  'Posted entries are permanent: no UPDATE or DELETE permitted after posting. '
  'Reversals create new entries (entry_type=''reversal'') — originals stay posted. '
  'Effective reversed status is derived via v_journal_entries view.';
COMMENT ON COLUMN public.journal_entries.voucher_number IS
  'Gap-free sequential number within (org, fiscal_year, series). '
  'Set atomically by post_journal_entry() from ledger_voucher_sequences.';
COMMENT ON COLUMN public.journal_entries.source_entity_id IS
  'ID of the source business record (invoice_id, payment_id, etc.).';
COMMENT ON COLUMN public.journal_entries.reversal_of_entry_id IS
  'For reversal entries: points to the original entry being reversed.';

-- Immutability trigger: block ALL UPDATE and DELETE on journal_entries.
-- post_journal_entry() inserts entries directly as ''posted'' — no UPDATE ever needed.
-- Reversals create NEW entries; they do not modify originals.

CREATE OR REPLACE FUNCTION public.prevent_journal_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'JOURNAL_ENTRY_IMMUTABLE: journal entries are permanent records. '
    'To correct a posted entry, use reverse_journal_entry() to create a reversal.'
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.prevent_journal_entry_mutation() IS
  'BEFORE UPDATE OR DELETE guard on journal_entries. '
  'Journal entries are immutable once created — a core accounting principle.';

CREATE TRIGGER journal_entries_immutability
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_journal_entry_mutation();

COMMENT ON TRIGGER journal_entries_immutability ON public.journal_entries IS
  'Blocks ALL UPDATE and DELETE on journal_entries. '
  'Entries are created once (as ''posted'') and never modified.';

-- ── Section 4: Journal Lines (Kontorader) ─────────────────────────────────────
-- Debit and credit lines within a journal entry.
-- Each line has debit_amount > 0 OR credit_amount > 0 (never both, never zero).
-- Sum(debit_amount) = Sum(credit_amount) across all lines of a posted entry.

CREATE TABLE public.journal_lines (
  id               uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  entry_id         uuid          NOT NULL REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  line_number      int           NOT NULL CHECK (line_number >= 1),
  account_code     text          NOT NULL,
  debit_amount     numeric(12,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount    numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  vat_rate_code    text          REFERENCES public.vat_rates(rate_code),
  vat_amount       numeric(12,2)               CHECK (vat_amount IS NULL OR vat_amount >= 0),
  description      text          NOT NULL DEFAULT '',
  metadata         jsonb         NOT NULL DEFAULT '{}',
  created_at       timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT jl_line_unique    UNIQUE (entry_id, line_number),
  CONSTRAINT jl_nonzero_amount CHECK (debit_amount > 0 OR credit_amount > 0),
  CONSTRAINT jl_single_side    CHECK (NOT (debit_amount > 0 AND credit_amount > 0))
);

COMMENT ON TABLE public.journal_lines IS
  'Immutable debit/credit lines per journal entry (kontorader). '
  'Each line has either debit_amount > 0 OR credit_amount > 0 (exclusive). '
  'Sum(debit_amount) = Sum(credit_amount) per entry enforced at posting time. '
  'No UPDATE or DELETE permitted after creation.';
COMMENT ON COLUMN public.journal_lines.account_code IS
  'Swedish BAS account code (e.g. 1510 = Kundfordringar, 1930 = Bank, 2610 = Utgående moms 25%).';
COMMENT ON COLUMN public.journal_lines.vat_rate_code IS
  'Swedish VAT rate code (SE25/SE12/SE6/SE0) from vat_rates. Only on VAT-bearing lines.';

CREATE OR REPLACE FUNCTION public.prevent_journal_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'JOURNAL_LINE_IMMUTABLE: journal lines cannot be modified or deleted. '
    'Use reverse_journal_entry() to correct a posted entry.'
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.prevent_journal_line_mutation() IS
  'BEFORE UPDATE OR DELETE guard on journal_lines.';

CREATE TRIGGER journal_lines_immutability
  BEFORE UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_journal_line_mutation();

-- ── Section 5: Account Balances Cache ────────────────────────────────────────
-- Materialized running balance per (org, financial_period, account_code).
-- Maintained atomically by post_journal_entry() SECURITY DEFINER functions.
-- NEVER write to this table from application code.
--
-- Balance formula (consistent for all account types):
--   closing_balance = opening_balance + debit_movement - credit_movement
--   Positive closing = net debit position (natural for assets/expenses)
--   Negative closing = net credit position (natural for liabilities/equity/revenue)
--   Reported balance = abs(closing_balance); sign interpretation from bas_account_catalog.normal_balance

CREATE TABLE public.account_balances (
  id                   uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  financial_period_id  uuid          NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  account_code         text          NOT NULL,
  opening_balance      numeric(12,2) NOT NULL DEFAULT 0,
  debit_movement       numeric(12,2) NOT NULL DEFAULT 0 CHECK (debit_movement >= 0),
  credit_movement      numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit_movement >= 0),
  closing_balance      numeric(12,2) NOT NULL DEFAULT 0,
  transaction_count    int           NOT NULL DEFAULT 0 CHECK (transaction_count >= 0),
  last_entry_id        uuid          REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  updated_at           timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT account_balances_unique UNIQUE (organization_id, financial_period_id, account_code)
);

COMMENT ON TABLE public.account_balances IS
  'Materialized balance cache per (org, period, account_code). '
  'closing_balance = opening_balance + debit_movement - credit_movement. '
  'Maintained by post_journal_entry(). Never write directly. '
  'For SIE4: closing_balance maps to #UB amounts.';

CREATE TRIGGER set_account_balances_updated_at
  BEFORE UPDATE ON public.account_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Section 6: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.ledger_voucher_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_balances         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lvs_platform_admin_read"
  ON public.ledger_voucher_sequences FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "je_org_read"
  ON public.journal_entries FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:ledger:read')
  );

CREATE POLICY "jl_org_read"
  ON public.journal_lines FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:ledger:read')
  );

CREATE POLICY "ab_org_read"
  ON public.account_balances FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:ledger:read')
  );

-- ── Section 7: Table Grants ───────────────────────────────────────────────────

GRANT SELECT                  ON public.ledger_voucher_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON public.ledger_voucher_sequences TO service_role;

-- journal_entries: authenticated SELECT only; INSERT via SECURITY DEFINER (no UPDATE/DELETE allowed anywhere)
GRANT SELECT                  ON public.journal_entries TO authenticated;
GRANT SELECT, INSERT          ON public.journal_entries TO service_role;

-- journal_lines: same as journal_entries
GRANT SELECT                  ON public.journal_lines TO authenticated;
GRANT SELECT, INSERT          ON public.journal_lines TO service_role;

-- account_balances: authenticated SELECT; service_role full (INSERT + UPDATE for balance maintenance)
GRANT SELECT                  ON public.account_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON public.account_balances TO service_role;

-- ── Section 8: Permissions ────────────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'finance:ledger:read',    'finance', 'ledger', 'read',    'View journal entries, account balances, and trial balance'),
  (gen_random_uuid(), 'finance:ledger:manage',  'finance', 'ledger', 'manage',  'Post journal entries and manage the accounting ledger'),
  (gen_random_uuid(), 'finance:ledger:void',    'finance', 'ledger', 'void',    'Reverse posted journal entries'),
  (gen_random_uuid(), 'finance:ledger:export',  'finance', 'ledger', 'export',  'Generate SIE4 exports from the journal ledger'),
  (gen_random_uuid(), 'finance:revenue:manage', 'finance', 'revenue','manage',  'Recognize deferred revenue and manage revenue schedules');

-- ── Section 9: Role-permission assignments ───────────────────────────────────

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_owner'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:ledger:read', 'finance:ledger:manage', 'finance:ledger:void',
    'finance:ledger:export', 'finance:revenue:manage'
  ])
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_admin'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:ledger:read', 'finance:ledger:manage', 'finance:ledger:void',
    'finance:ledger:export', 'finance:revenue:manage'
  ])
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'finance_admin'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:ledger:read', 'finance:ledger:manage', 'finance:ledger:void',
    'finance:ledger:export', 'finance:revenue:manage'
  ])
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_manager'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY['finance:ledger:read'])
ON CONFLICT DO NOTHING;
