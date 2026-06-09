-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260603000001_phase4e_reconciliation_core.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4E — Reconciliation & Financial Close Engine (Core Tables)
--
-- Establishes the core infrastructure for reconciliation and period close:
--   bank_statement_imports   — imported bank statement headers per organization
--   bank_statement_lines     — individual statement transaction entries
--   reconciliation_runs      — one record per reconciliation job per type/period
--   reconciliation_items     — matched pairs within a bank reconciliation run
--
-- Extends financial_periods with close management tracking columns.
--
-- New permissions:
--   finance:reconciliation:read   — view reconciliation runs and bank imports
--   finance:reconciliation:manage — import bank statements and run reconciliations
--   finance:close:read            — view period close status and readiness
--   finance:close:manage          — soft-close, reopen, and hard-close periods
--   finance:year_end:manage       — create fiscal years and run year-end close
--
-- Design principles:
--   • Bank reconciliation is line-by-line (payment ↔ bank statement line)
--   • AR / VAT / deferred reconciliation are summary checks (result in JSONB)
--   • Reconciliation items are created atomically on confirm_bank_reconciliation()
--   • All RLS policies use auth_organization_id() + has_permission()
--
-- Dependencies:
--   20260530000001_phase4a_commercial_core.sql  — financial_periods, payments
--   20260602000001_phase4d_ledger_core.sql      — has_permission, auth_organization_id
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ─────────────────────────────────────────────────────

CREATE TYPE public.bank_statement_status AS ENUM (
  'imported',    -- File imported; lines available for matching
  'reconciling', -- Auto/manual matching in progress
  'reconciled',  -- All lines matched or ignored; awaiting final confirmation
  'confirmed'    -- Reconciliation confirmed and finalized
);

CREATE TYPE public.bank_line_status AS ENUM (
  'unmatched',  -- No payment match found yet
  'matched',    -- Matched to a payment record; pending confirmation
  'confirmed',  -- Match confirmed by user
  'exception',  -- Disputed or unresolvable; requires manual review
  'ignored'     -- Intentionally excluded (bank fees, inter-account transfers, etc.)
);

CREATE TYPE public.reconciliation_type AS ENUM (
  'bank',                -- Bank statement entries vs payment records (line-level)
  'accounts_receivable', -- AR ledger account 1510 vs open invoice outstanding balances
  'vat',                 -- VAT ledger account 2610 vs filed VAT period totals
  'deferred_revenue',    -- Deferred revenue account 2970 vs recognition schedule balances
  'ledger_integrity'     -- Full 12-point ledger consistency validation
);

CREATE TYPE public.reconciliation_run_status AS ENUM (
  'pending',      -- Run created; processing not yet started
  'in_progress',  -- Matching or validation running
  'needs_review', -- Unmatched or exception items require human attention
  'completed',    -- All items resolved; result_summary available
  'confirmed'     -- Reconciliation confirmed and closed
);

CREATE TYPE public.reconciliation_item_status AS ENUM (
  'matched',         -- Ledger item matched to external item; amounts agree within tolerance
  'exception',       -- Mismatch or variance outside acceptable tolerance
  'manual_override', -- Human confirmed the match despite a variance
  'ignored'          -- Excluded from this reconciliation run
);

-- ── Section 2: Extend financial_periods ──────────────────────────────────────
-- Add close management tracking columns.
-- fiscal_year_id and is_year_end_period are added in migration 4 when fiscal_years is created.

ALTER TABLE public.financial_periods
  ADD COLUMN IF NOT EXISTS amendment_count    int         NOT NULL DEFAULT 0 CHECK (amendment_count >= 0),
  ADD COLUMN IF NOT EXISTS close_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS close_validated_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.financial_periods.amendment_count    IS
  'Number of amendment journals posted to this period after soft-close. '
  'Incremented atomically by post_amendment_journal().';
COMMENT ON COLUMN public.financial_periods.close_validated_at IS
  'Timestamp of the last passing validate_period_for_close() run on this period.';
COMMENT ON COLUMN public.financial_periods.close_validated_by IS
  'User who ran the last passing validate_period_for_close().';

-- ── Section 3: bank_statement_imports ────────────────────────────────────────

CREATE TABLE public.bank_statement_imports (
  id                   uuid                         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid                         NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  bank_account_number  text                         NOT NULL,
  bank_name            text,
  statement_date       date                         NOT NULL,
  period_start         date                         NOT NULL,
  period_end           date                         NOT NULL,
  opening_balance      numeric(14,2)                NOT NULL DEFAULT 0,
  closing_balance      numeric(14,2)                NOT NULL DEFAULT 0,
  currency             text                         NOT NULL DEFAULT 'SEK',
  total_lines          int                          NOT NULL DEFAULT 0 CHECK (total_lines >= 0),
  status               public.bank_statement_status NOT NULL DEFAULT 'imported',
  file_reference       text,
  imported_by          uuid                         REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at          timestamptz                  NOT NULL DEFAULT now(),
  confirmed_at         timestamptz,
  confirmed_by         uuid                         REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                text,
  metadata             jsonb                        NOT NULL DEFAULT '{}',
  created_at           timestamptz                  NOT NULL DEFAULT now(),
  updated_at           timestamptz                  NOT NULL DEFAULT now(),

  CONSTRAINT bsi_period_dates_check CHECK (period_end >= period_start)
);

CREATE TRIGGER set_bank_statement_imports_updated_at
  BEFORE UPDATE ON public.bank_statement_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.bank_statement_imports IS
  'Bank statement import headers per organization. '
  'Lines are in bank_statement_lines. '
  'Reconciliation is complete when all lines are matched, ignored, or confirmed.';

-- ── Section 4: bank_statement_lines ──────────────────────────────────────────

CREATE TABLE public.bank_statement_lines (
  id                  uuid                    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid                    NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  import_id           uuid                    NOT NULL REFERENCES public.bank_statement_imports(id) ON DELETE CASCADE,
  line_number         int                     NOT NULL CHECK (line_number >= 1),
  transaction_date    date                    NOT NULL,
  value_date          date,
  amount              numeric(14,2)           NOT NULL,
  balance_after       numeric(14,2),
  reference           text,
  description         text                    NOT NULL DEFAULT '',
  counterpart_name    text,
  counterpart_account text,
  status              public.bank_line_status NOT NULL DEFAULT 'unmatched',
  payment_id          uuid                    REFERENCES public.payments(id) ON DELETE SET NULL,
  matched_at          timestamptz,
  matched_by          uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  match_method        text                    CHECK (match_method IN ('automatic', 'manual')),
  match_notes         text,
  metadata            jsonb                   NOT NULL DEFAULT '{}',
  created_at          timestamptz             NOT NULL DEFAULT now(),
  updated_at          timestamptz             NOT NULL DEFAULT now(),

  CONSTRAINT bsl_unique_line UNIQUE (import_id, line_number)
);

CREATE TRIGGER set_bank_statement_lines_updated_at
  BEFORE UPDATE ON public.bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.bank_statement_lines IS
  'Individual bank statement entries. '
  'amount > 0 = inflow (money received: customer payment). '
  'amount < 0 = outflow (money sent: supplier or bank fee). '
  'Matched to payment records via auto_match_bank_lines() or manual_match_bank_line().';
COMMENT ON COLUMN public.bank_statement_lines.payment_id IS
  'Set when this line is matched to a payments record.';
COMMENT ON COLUMN public.bank_statement_lines.match_method IS
  '''automatic'' = matched by auto_match_bank_lines(); ''manual'' = matched by a user.';

-- ── Section 5: reconciliation_runs ───────────────────────────────────────────

CREATE TABLE public.reconciliation_runs (
  id                       uuid                             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id          uuid                             NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  financial_period_id      uuid                             REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  reconciliation_type      public.reconciliation_type       NOT NULL,
  status                   public.reconciliation_run_status NOT NULL DEFAULT 'pending',
  bank_statement_import_id uuid                             REFERENCES public.bank_statement_imports(id) ON DELETE SET NULL,
  total_items              int                              NOT NULL DEFAULT 0 CHECK (total_items >= 0),
  matched_items            int                              NOT NULL DEFAULT 0 CHECK (matched_items >= 0),
  unmatched_items          int                              NOT NULL DEFAULT 0 CHECK (unmatched_items >= 0),
  exception_items          int                              NOT NULL DEFAULT 0 CHECK (exception_items >= 0),
  result_summary           jsonb                            NOT NULL DEFAULT '{}',
  is_reconciled            boolean                          NOT NULL DEFAULT false,
  variance_amount          numeric(14,2),
  started_at               timestamptz                      NOT NULL DEFAULT now(),
  completed_at             timestamptz,
  actor_id                 uuid                             REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                    text,
  metadata                 jsonb                            NOT NULL DEFAULT '{}',
  created_at               timestamptz                      NOT NULL DEFAULT now(),
  updated_at               timestamptz                      NOT NULL DEFAULT now()
);

CREATE TRIGGER set_reconciliation_runs_updated_at
  BEFORE UPDATE ON public.reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.reconciliation_runs IS
  'One record per reconciliation execution per type per organization. '
  'result_summary stores the full reconciliation detail as JSONB for non-bank types. '
  'For bank reconciliation, individual matches are in reconciliation_items.';
COMMENT ON COLUMN public.reconciliation_runs.variance_amount IS
  'Numeric variance between ledger and external source. NULL for non-amount-based checks.';

-- ── Section 6: reconciliation_items ──────────────────────────────────────────

CREATE TABLE public.reconciliation_items (
  id                   uuid                             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid                             NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  run_id               uuid                             NOT NULL REFERENCES public.reconciliation_runs(id) ON DELETE CASCADE,
  ledger_entity_type   text                             NOT NULL CHECK (ledger_entity_type IN ('payment','invoice','journal_entry','account_balance')),
  ledger_entity_id     uuid                             NOT NULL,
  external_entity_type text                             CHECK (external_entity_type IN ('bank_statement_line','vat_entry','deferred_schedule')),
  external_entity_id   uuid,
  external_reference   text,
  ledger_amount        numeric(14,2)                    NOT NULL,
  external_amount      numeric(14,2),
  variance             numeric(14,2),
  status               public.reconciliation_item_status NOT NULL DEFAULT 'matched',
  match_method         text                             CHECK (match_method IN ('automatic','manual')),
  matched_at           timestamptz                      NOT NULL DEFAULT now(),
  matched_by           uuid                             REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                text,
  metadata             jsonb                            NOT NULL DEFAULT '{}',
  created_at           timestamptz                      NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reconciliation_items IS
  'Individual matched pairs within a reconciliation_run. '
  'Primarily used for bank reconciliation: payment (ledger) ↔ bank_statement_line (external). '
  'variance = ledger_amount - external_amount; NULL if no external amount available.';

-- ── Section 7: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_items   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bsi_org_select" ON public.bank_statement_imports FOR SELECT
  USING (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:reconciliation:read'));

CREATE POLICY "bsi_org_insert" ON public.bank_statement_imports FOR INSERT
  WITH CHECK (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:reconciliation:manage'));

CREATE POLICY "bsi_org_update" ON public.bank_statement_imports FOR UPDATE
  USING (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:reconciliation:manage'));

CREATE POLICY "bsl_org_select" ON public.bank_statement_lines FOR SELECT
  USING (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:reconciliation:read'));

CREATE POLICY "bsl_org_insert" ON public.bank_statement_lines FOR INSERT
  WITH CHECK (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:reconciliation:manage'));

CREATE POLICY "bsl_org_update" ON public.bank_statement_lines FOR UPDATE
  USING (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:reconciliation:manage'));

CREATE POLICY "rr_org_select" ON public.reconciliation_runs FOR SELECT
  USING (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:reconciliation:read'));

CREATE POLICY "ri_org_select" ON public.reconciliation_items FOR SELECT
  USING (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:reconciliation:read'));

-- ── Section 8: Table Grants ───────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.bank_statement_imports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.bank_statement_lines   TO authenticated;
GRANT SELECT                  ON public.reconciliation_runs    TO authenticated;
GRANT SELECT                  ON public.reconciliation_items   TO authenticated;
GRANT ALL                     ON public.bank_statement_imports TO service_role;
GRANT ALL                     ON public.bank_statement_lines   TO service_role;
GRANT ALL                     ON public.reconciliation_runs    TO service_role;
GRANT ALL                     ON public.reconciliation_items   TO service_role;

-- ── Section 9: Permissions ────────────────────────────────────────────────────

INSERT INTO public.permissions (code, domain, resource, action, description) VALUES
  ('finance:reconciliation:read',   'finance', 'reconciliation', 'read',     'View reconciliation runs and bank statement imports'),
  ('finance:reconciliation:manage', 'finance', 'reconciliation', 'manage',   'Import bank statements and run reconciliations'),
  ('finance:close:read',            'finance', 'close',          'read',     'View period close status and readiness checks'),
  ('finance:close:manage',          'finance', 'close',          'manage',   'Soft-close, reopen, and hard-close financial periods'),
  ('finance:year_end:manage',       'finance', 'year_end',       'manage',   'Create fiscal years and run year-end close')
ON CONFLICT (code) DO NOTHING;

-- org_owner, org_admin, finance_admin get full access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin', 'finance_admin')
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:reconciliation:read', 'finance:reconciliation:manage',
    'finance:close:read', 'finance:close:manage',
    'finance:year_end:manage'
  ])
ON CONFLICT DO NOTHING;

-- org_manager gets read-only on reconciliation and close status
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_manager'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY['finance:reconciliation:read', 'finance:close:read'])
ON CONFLICT DO NOTHING;
