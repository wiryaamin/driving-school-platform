-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260531000010_phase4b_export_indexes.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4B.10 — Financial Reporting and Export Performance Indexes
--
-- Performance indexes for:
--   1. accounting_export_entries (new table from migration 009)
--   2. Supporting columns queried by the 5 reporting views (migration 007)
--   3. Supporting columns queried by the 5 dashboard RPCs (migration 008)
--   4. Accounting export queue (already exists, adding export-specific indexes)
--
-- Index naming convention: <table>_<columns>_<purpose>_idx
-- All CREATE INDEX are CONCURRENTLY-safe in migration context (db reset).
--
-- Dependencies:
--   20260531000009_phase4b_accounting_exports.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- Section 1: accounting_export_entries indexes
-- ════════════════════════════════════════════════════════════════════════════

-- Primary access pattern: get all entries for an export run (ordered by sequence)
CREATE INDEX accounting_export_entries_run_seq_idx
  ON public.accounting_export_entries (export_run_id, sequence_number ASC);

-- For RLS and org-scoped access
CREATE INDEX accounting_export_entries_org_idx
  ON public.accounting_export_entries (organization_id);

-- For lineage tracing: which run exported a given queue item?
CREATE INDEX accounting_export_entries_queue_item_idx
  ON public.accounting_export_entries (source_queue_item_id)
  WHERE source_queue_item_id IS NOT NULL;

-- For date range queries (e.g., "all entries in January")
CREATE INDEX accounting_export_entries_tx_date_idx
  ON public.accounting_export_entries (organization_id, transaction_date);

-- For account-based queries (find all entries for a specific BAS account)
CREATE INDEX accounting_export_entries_account_debit_idx
  ON public.accounting_export_entries (organization_id, account_debit);

CREATE INDEX accounting_export_entries_account_credit_idx
  ON public.accounting_export_entries (organization_id, account_credit);


-- ════════════════════════════════════════════════════════════════════════════
-- Section 2: accounting_export_queue — export workflow indexes
-- ════════════════════════════════════════════════════════════════════════════

-- Pending items by date (used by create_accounting_export to snapshot)
-- Partial index: only rows not yet exported — the active working set
CREATE INDEX accounting_export_queue_pending_date_idx
  ON public.accounting_export_queue (organization_id, transaction_date)
  WHERE exported_at IS NULL;

-- For finalize_accounting_export: find items by export_run_id
CREATE INDEX accounting_export_queue_run_id_idx
  ON public.accounting_export_queue (export_run_id)
  WHERE export_run_id IS NOT NULL;

-- For unmapped item count in create_accounting_export
-- Partial: only pending rows with missing account codes
CREATE INDEX accounting_export_queue_unmapped_idx
  ON public.accounting_export_queue (organization_id, transaction_date)
  WHERE exported_at IS NULL
    AND (account_debit IS NULL OR account_credit IS NULL);


-- ════════════════════════════════════════════════════════════════════════════
-- Section 3: Reporting view supporting indexes
-- ════════════════════════════════════════════════════════════════════════════

-- finance_invoice_aging_v / overdue_invoice_summary / finance_dashboard_snapshot
-- invoices.outstanding_amount > 0 scan is the hot path for aging and dashboard
CREATE INDEX invoices_org_outstanding_status_idx
  ON public.invoices (organization_id, status)
  WHERE outstanding_amount > 0
    AND status NOT IN ('void', 'draft');

-- invoices issued this month (dashboard + vat_liability_summary)
CREATE INDEX invoices_org_issued_at_idx
  ON public.invoices (organization_id, issued_at)
  WHERE issued_at IS NOT NULL
    AND status IN ('issued', 'paid', 'partially_paid', 'overdue');

-- invoices overdue (overdue_invoice_summary + dashboard snapshot)
CREATE INDEX invoices_org_overdue_idx
  ON public.invoices (organization_id, outstanding_amount)
  WHERE status = 'overdue'
    AND outstanding_amount > 0;

-- finance_revenue_summary_v / finance_dashboard_snapshot — payments confirmed this month
CREATE INDEX payments_org_confirmed_at_idx
  ON public.payments (organization_id, confirmed_at)
  WHERE status IN ('confirmed', 'partially_refunded', 'refunded');

-- finance_dashboard_snapshot — unallocated headroom calculation
CREATE INDEX payments_org_status_confirmed_idx
  ON public.payments (organization_id)
  WHERE status = 'confirmed';

-- finance_payment_allocations_v — join payment_allocations → payments
CREATE INDEX payment_allocations_payment_id_idx
  ON public.payment_allocations (payment_id);

-- payment_reconciliation_summary — total_allocated aggregate by org
CREATE INDEX payment_allocations_org_idx
  ON public.payment_allocations (organization_id);

-- finance_refund_summary_v / refund_metrics_summary / dashboard snapshot
-- Partial: only completed refunds (the analytically relevant set)
CREATE INDEX refunds_org_completed_processed_idx
  ON public.refunds (organization_id, processed_at)
  WHERE refund_status = 'completed';

-- refund_metrics_summary — group by reason_code
CREATE INDEX refunds_org_reason_code_idx
  ON public.refunds (organization_id, reason_code)
  WHERE refund_status = 'completed';

-- finance_invoice_aging_v — aggregated allocation subtotals per invoice
CREATE INDEX payment_allocations_invoice_id_org_idx
  ON public.payment_allocations (invoice_id);

-- finance_invoice_aging_v — aggregated refund subtotals per invoice
-- Partial: only completed refunds (the billing-relevant set)
CREATE INDEX refunds_invoice_id_completed_idx
  ON public.refunds (invoice_id)
  WHERE refund_status = 'completed';


-- ════════════════════════════════════════════════════════════════════════════
-- Section 4: Finance dashboard and RPC supporting indexes
-- ════════════════════════════════════════════════════════════════════════════

-- credit_balance_cache — dashboard credit liability aggregate
CREATE INDEX credit_balance_cache_org_balance_idx
  ON public.credit_balance_cache (organization_id)
  WHERE balance > 0;

-- accounting_export_queue pending count (dashboard snapshot)
CREATE INDEX accounting_export_queue_org_pending_idx
  ON public.accounting_export_queue (organization_id)
  WHERE exported_at IS NULL;

-- finance_vat_summary_v / vat_liability_summary — issued month grouping
CREATE INDEX invoices_org_issued_month_vat_idx
  ON public.invoices (organization_id, (DATE_TRUNC('month', issued_at)::date))
  WHERE issued_at IS NOT NULL
    AND status IN ('issued', 'paid', 'partially_paid');

-- accounting_export_runs — list runs for org (descending by started_at)
CREATE INDEX accounting_export_runs_org_started_idx
  ON public.accounting_export_runs (organization_id, started_at DESC);

-- Duplicate export guard in create_accounting_export
-- Partial: only completed runs that could block new exports
CREATE INDEX accounting_export_runs_org_format_completed_idx
  ON public.accounting_export_runs (organization_id, format, from_date, to_date)
  WHERE status = 'completed';
