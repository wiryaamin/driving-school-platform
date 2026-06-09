-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260602000006_phase4d_indexes.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4D — Ledger Indexes
--
-- Performance indexes for all Phase 4D tables.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ledger_voucher_sequences ──────────────────────────────────────────────────

CREATE INDEX idx_ledger_voucher_seq_org
  ON public.ledger_voucher_sequences (organization_id, fiscal_year, voucher_series);

-- ── journal_entries ───────────────────────────────────────────────────────────

CREATE INDEX idx_je_org_date
  ON public.journal_entries (organization_id, entry_date DESC);

CREATE INDEX idx_je_org_period
  ON public.journal_entries (organization_id, financial_period_id)
  WHERE financial_period_id IS NOT NULL;

CREATE INDEX idx_je_voucher
  ON public.journal_entries (organization_id, voucher_series, voucher_number)
  WHERE status = 'posted';

CREATE INDEX idx_je_source_entity
  ON public.journal_entries (organization_id, source_entity_type, source_entity_id)
  WHERE source_entity_id IS NOT NULL;

CREATE INDEX idx_je_source_event
  ON public.journal_entries (organization_id, source_event_type)
  WHERE source_event_type IS NOT NULL;

CREATE INDEX idx_je_reversal_of
  ON public.journal_entries (reversal_of_entry_id)
  WHERE reversal_of_entry_id IS NOT NULL;

CREATE INDEX idx_je_correction_of
  ON public.journal_entries (correction_of_entry_id)
  WHERE correction_of_entry_id IS NOT NULL;

CREATE INDEX idx_je_entry_type_status
  ON public.journal_entries (organization_id, entry_type, status);

CREATE INDEX idx_je_posted_at
  ON public.journal_entries (organization_id, posted_at DESC)
  WHERE status = 'posted';

-- ── journal_lines ─────────────────────────────────────────────────────────────

CREATE INDEX idx_jl_entry_id
  ON public.journal_lines (entry_id);

CREATE INDEX idx_jl_org_account
  ON public.journal_lines (organization_id, account_code);

CREATE INDEX idx_jl_account_debit
  ON public.journal_lines (account_code, debit_amount)
  WHERE debit_amount > 0;

CREATE INDEX idx_jl_account_credit
  ON public.journal_lines (account_code, credit_amount)
  WHERE credit_amount > 0;

CREATE INDEX idx_jl_vat_rate
  ON public.journal_lines (organization_id, vat_rate_code)
  WHERE vat_rate_code IS NOT NULL;

-- ── account_balances ──────────────────────────────────────────────────────────

CREATE INDEX idx_ab_org_period
  ON public.account_balances (organization_id, financial_period_id);

CREATE INDEX idx_ab_account_period
  ON public.account_balances (account_code, financial_period_id);

CREATE INDEX idx_ab_nonzero_closing
  ON public.account_balances (organization_id, financial_period_id, account_code)
  WHERE closing_balance <> 0;

-- ── deferred_revenue_schedules ────────────────────────────────────────────────

CREATE INDEX idx_drs_org
  ON public.deferred_revenue_schedules (organization_id);

CREATE INDEX idx_drs_invoice
  ON public.deferred_revenue_schedules (invoice_id);

CREATE INDEX idx_drs_package
  ON public.deferred_revenue_schedules (student_package_id);

CREATE INDEX idx_drs_pending
  ON public.deferred_revenue_schedules (organization_id)
  WHERE is_fully_recognized = false;

-- ── revenue_recognition_events ────────────────────────────────────────────────

CREATE INDEX idx_rre_schedule
  ON public.revenue_recognition_events (schedule_id);

CREATE INDEX idx_rre_booking
  ON public.revenue_recognition_events (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX idx_rre_org_date
  ON public.revenue_recognition_events (organization_id, recognition_date DESC);

CREATE INDEX idx_rre_journal_entry
  ON public.revenue_recognition_events (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

-- ── ledger_sie4_exports ───────────────────────────────────────────────────────

CREATE INDEX idx_lse_org
  ON public.ledger_sie4_exports (organization_id, generated_at DESC);

CREATE INDEX idx_lse_period
  ON public.ledger_sie4_exports (financial_period_id);

-- ── Composite indexes for common queries ──────────────────────────────────────

-- SIE4 generation: all posted entries for a period ordered by voucher
CREATE INDEX idx_je_sie4_generation
  ON public.journal_entries (organization_id, financial_period_id, voucher_series, voucher_number)
  WHERE status = 'posted';

-- Trial balance: account movements per period
CREATE INDEX idx_ab_trial_balance
  ON public.account_balances (organization_id, financial_period_id, account_code, closing_balance);

-- Reversal detection: find reversal of a specific entry
CREATE INDEX idx_je_effective_status
  ON public.journal_entries (reversal_of_entry_id, status)
  WHERE reversal_of_entry_id IS NOT NULL AND status = 'posted';
