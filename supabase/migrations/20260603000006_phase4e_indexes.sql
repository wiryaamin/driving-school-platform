-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260603000006_phase4e_indexes.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4E — Performance Indexes
--
-- All Phase 4E performance indexes across:
--   bank_statement_imports      (4 indexes)
--   bank_statement_lines        (6 indexes)
--   reconciliation_runs         (5 indexes)
--   reconciliation_items        (4 indexes)
--   period_audit_snapshots      (4 indexes + 3 partial unique)
--   ledger_consistency_checks   (3 indexes)
--   fiscal_years                (2 indexes)
--   financial_periods ext.      (2 indexes for new columns)
--
-- Total: ~33 indexes
-- ════════════════════════════════════════════════════════════════════════════

-- ── bank_statement_imports ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bsi_org
  ON public.bank_statement_imports (organization_id);

CREATE INDEX IF NOT EXISTS idx_bsi_org_status
  ON public.bank_statement_imports (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_bsi_period_dates
  ON public.bank_statement_imports (organization_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_bsi_imported_at
  ON public.bank_statement_imports (organization_id, imported_at DESC);

-- ── bank_statement_lines ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bsl_import
  ON public.bank_statement_lines (import_id);

CREATE INDEX IF NOT EXISTS idx_bsl_org_status
  ON public.bank_statement_lines (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_bsl_payment
  ON public.bank_statement_lines (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bsl_transaction_date
  ON public.bank_statement_lines (import_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_bsl_unmatched
  ON public.bank_statement_lines (organization_id, transaction_date)
  WHERE status = 'unmatched';

CREATE INDEX IF NOT EXISTS idx_bsl_amount_date
  ON public.bank_statement_lines (organization_id, amount, transaction_date)
  WHERE status IN ('unmatched', 'matched');

-- ── reconciliation_runs ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_rr_org
  ON public.reconciliation_runs (organization_id);

CREATE INDEX IF NOT EXISTS idx_rr_period_type
  ON public.reconciliation_runs (financial_period_id, reconciliation_type);

CREATE INDEX IF NOT EXISTS idx_rr_org_type_started
  ON public.reconciliation_runs (organization_id, reconciliation_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_rr_import
  ON public.reconciliation_runs (bank_statement_import_id)
  WHERE bank_statement_import_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rr_status
  ON public.reconciliation_runs (organization_id, status)
  WHERE status IN ('pending','in_progress','needs_review');

-- ── reconciliation_items ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ri_run
  ON public.reconciliation_items (run_id);

CREATE INDEX IF NOT EXISTS idx_ri_ledger_entity
  ON public.reconciliation_items (organization_id, ledger_entity_type, ledger_entity_id);

CREATE INDEX IF NOT EXISTS idx_ri_external_entity
  ON public.reconciliation_items (external_entity_type, external_entity_id)
  WHERE external_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ri_status
  ON public.reconciliation_items (run_id, status);

-- ── period_audit_snapshots ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pas_period
  ON public.period_audit_snapshots (financial_period_id);

CREATE INDEX IF NOT EXISTS idx_pas_org_type
  ON public.period_audit_snapshots (organization_id, snapshot_type);

CREATE INDEX IF NOT EXISTS idx_pas_captured_at
  ON public.period_audit_snapshots (organization_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_pas_content_hash
  ON public.period_audit_snapshots (content_hash);

-- Partial unique indexes: only one soft_close / hard_close / year_end snapshot per period
CREATE UNIQUE INDEX IF NOT EXISTS idx_pas_period_soft_close_unique
  ON public.period_audit_snapshots (financial_period_id)
  WHERE snapshot_type = 'soft_close';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pas_period_hard_close_unique
  ON public.period_audit_snapshots (financial_period_id)
  WHERE snapshot_type = 'hard_close';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pas_period_year_end_unique
  ON public.period_audit_snapshots (financial_period_id)
  WHERE snapshot_type = 'year_end';

-- ── ledger_consistency_checks ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_lcc_period
  ON public.ledger_consistency_checks (financial_period_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lcc_org_type
  ON public.ledger_consistency_checks (organization_id, check_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lcc_failed
  ON public.ledger_consistency_checks (organization_id, created_at DESC)
  WHERE passed = false;

-- ── fiscal_years ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fy_org_status
  ON public.fiscal_years (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_fy_org_year
  ON public.fiscal_years (organization_id, year_number);

-- ── financial_periods (new columns from Phase 4E) ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fp_fiscal_year
  ON public.financial_periods (fiscal_year_id)
  WHERE fiscal_year_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fp_year_end
  ON public.financial_periods (fiscal_year_id, is_year_end_period)
  WHERE is_year_end_period = true;
