-- ============================================================
-- Phase 4C — Indexes
-- Performance indexes for all Phase 4C tables.
-- ============================================================

-- ── bas_account_catalog ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bas_account_catalog_code
  ON public.bas_account_catalog (account_code)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_bas_account_catalog_type
  ON public.bas_account_catalog (account_type, normal_balance)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_bas_account_catalog_sort
  ON public.bas_account_catalog (sort_order, account_code);

-- ── vat_rates ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_vat_rates_code
  ON public.vat_rates (rate_code)
  WHERE effective_to IS NULL;

-- ── platform_bas_event_mappings ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_platform_bas_event_mappings_event_type
  ON public.platform_bas_event_mappings (event_type)
  WHERE is_active = true;

-- ── accounting_chart_of_accounts (new BAS columns) ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_bas_debit
  ON public.accounting_chart_of_accounts (bas_account_debit_id)
  WHERE bas_account_debit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_bas_credit
  ON public.accounting_chart_of_accounts (bas_account_credit_id)
  WHERE bas_account_credit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_vat_rate
  ON public.accounting_chart_of_accounts (vat_rate_code)
  WHERE vat_rate_code IS NOT NULL;

-- ── vat_periods ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_vat_periods_org_id
  ON public.vat_periods (organization_id);

CREATE INDEX IF NOT EXISTS idx_vat_periods_org_status
  ON public.vat_periods (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_vat_periods_org_dates
  ON public.vat_periods (organization_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_vat_periods_open
  ON public.vat_periods (organization_id)
  WHERE status = 'open';

-- ── vat_report_entries ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_vat_report_entries_period_id
  ON public.vat_report_entries (vat_period_id);

CREATE INDEX IF NOT EXISTS idx_vat_report_entries_org_id
  ON public.vat_report_entries (organization_id);

CREATE INDEX IF NOT EXISTS idx_vat_report_entries_invoice_id
  ON public.vat_report_entries (invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vat_report_entries_transaction_date
  ON public.vat_report_entries (organization_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_vat_report_entries_source
  ON public.vat_report_entries (source_type, source_id);

-- ── organization_swedish_settings ─────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_swedish_settings_org_id
  ON public.organization_swedish_settings (organization_id);

-- ── invoice_ocr_references ────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_ocr_references_invoice_id
  ON public.invoice_ocr_references (invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_ocr_references_org_id
  ON public.invoice_ocr_references (organization_id);

CREATE INDEX IF NOT EXISTS idx_invoice_ocr_references_ocr_ref
  ON public.invoice_ocr_references (ocr_reference);

-- ── sie4_exports ──────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_sie4_exports_export_run_id
  ON public.sie4_exports (export_run_id);

CREATE INDEX IF NOT EXISTS idx_sie4_exports_org_id
  ON public.sie4_exports (organization_id);

CREATE INDEX IF NOT EXISTS idx_sie4_exports_org_generated_at
  ON public.sie4_exports (organization_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sie4_exports_hash
  ON public.sie4_exports (content_hash);

CREATE INDEX IF NOT EXISTS idx_sie4_exports_date_range
  ON public.sie4_exports (organization_id, from_date, to_date);

-- ── fortnox_customer_sync ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fortnox_customer_sync_org_id
  ON public.fortnox_customer_sync (organization_id);

CREATE INDEX IF NOT EXISTS idx_fortnox_customer_sync_status
  ON public.fortnox_customer_sync (organization_id, sync_status);

CREATE INDEX IF NOT EXISTS idx_fortnox_customer_sync_pending
  ON public.fortnox_customer_sync (organization_id)
  WHERE sync_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_fortnox_customer_sync_student_id
  ON public.fortnox_customer_sync (student_id);

-- ── fortnox_invoice_sync ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fortnox_invoice_sync_org_id
  ON public.fortnox_invoice_sync (organization_id);

CREATE INDEX IF NOT EXISTS idx_fortnox_invoice_sync_status
  ON public.fortnox_invoice_sync (organization_id, sync_status);

CREATE INDEX IF NOT EXISTS idx_fortnox_invoice_sync_pending
  ON public.fortnox_invoice_sync (organization_id)
  WHERE sync_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_fortnox_invoice_sync_invoice_id
  ON public.fortnox_invoice_sync (invoice_id);

-- ── fortnox_payment_sync ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fortnox_payment_sync_org_id
  ON public.fortnox_payment_sync (organization_id);

CREATE INDEX IF NOT EXISTS idx_fortnox_payment_sync_status
  ON public.fortnox_payment_sync (organization_id, sync_status);

CREATE INDEX IF NOT EXISTS idx_fortnox_payment_sync_pending
  ON public.fortnox_payment_sync (organization_id)
  WHERE sync_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_fortnox_payment_sync_payment_id
  ON public.fortnox_payment_sync (payment_id);

-- ── fortnox_export_lineage ────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_fortnox_export_lineage_run_id
  ON public.fortnox_export_lineage (export_run_id);

CREATE INDEX IF NOT EXISTS idx_fortnox_export_lineage_org_id
  ON public.fortnox_export_lineage (organization_id);

CREATE INDEX IF NOT EXISTS idx_fortnox_export_lineage_status
  ON public.fortnox_export_lineage (organization_id, sync_status);
