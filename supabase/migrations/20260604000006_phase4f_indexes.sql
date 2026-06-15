-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260604000006_phase4f_indexes.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4F — Performance Indexes for all Phase 4F tables
-- ════════════════════════════════════════════════════════════════════════════

-- ── payroll_runs ─────────────────────────────────────────────────────────────
CREATE INDEX idx_payroll_runs_org       ON public.payroll_runs (organization_id);
CREATE INDEX idx_payroll_runs_period    ON public.payroll_runs (financial_period_id);
CREATE INDEX idx_payroll_runs_status    ON public.payroll_runs (status);
CREATE INDEX idx_payroll_runs_pay_date  ON public.payroll_runs (pay_date);
CREATE INDEX idx_payroll_runs_org_status ON public.payroll_runs (organization_id, status);
CREATE INDEX idx_payroll_runs_correction ON public.payroll_runs (correction_of_run_id)
  WHERE correction_of_run_id IS NOT NULL;

-- ── payroll_entries ───────────────────────────────────────────────────────────
CREATE INDEX idx_payroll_entries_run     ON public.payroll_entries (payroll_run_id);
CREATE INDEX idx_payroll_entries_org     ON public.payroll_entries (organization_id);
CREATE INDEX idx_payroll_entries_employee ON public.payroll_entries (employee_id);
CREATE INDEX idx_payroll_entries_instructor ON public.payroll_entries (instructor_id)
  WHERE instructor_id IS NOT NULL;

-- ── tax_remittances ───────────────────────────────────────────────────────────
CREATE INDEX idx_tax_remittances_org     ON public.tax_remittances (organization_id);
CREATE INDEX idx_tax_remittances_period  ON public.tax_remittances (financial_period_id);
CREATE INDEX idx_tax_remittances_run     ON public.tax_remittances (payroll_run_id)
  WHERE payroll_run_id IS NOT NULL;
CREATE INDEX idx_tax_remittances_status  ON public.tax_remittances (status);
CREATE INDEX idx_tax_remittances_due     ON public.tax_remittances (due_date)
  WHERE status NOT IN ('completed', 'cancelled');

-- ── vat_clearing_runs ─────────────────────────────────────────────────────────
CREATE INDEX idx_vat_clearing_org        ON public.vat_clearing_runs (organization_id);
CREATE INDEX idx_vat_clearing_period     ON public.vat_clearing_runs (financial_period_id);
CREATE INDEX idx_vat_clearing_vat_period ON public.vat_clearing_runs (vat_period_id);
CREATE INDEX idx_vat_clearing_status     ON public.vat_clearing_runs (status);

-- ── agi_exports ───────────────────────────────────────────────────────────────
CREATE INDEX idx_agi_exports_org         ON public.agi_exports (organization_id);
CREATE INDEX idx_agi_exports_period      ON public.agi_exports (financial_period_id);
CREATE INDEX idx_agi_exports_status      ON public.agi_exports (status);
CREATE INDEX idx_agi_exports_decl_month  ON public.agi_exports (declaration_month);
CREATE INDEX idx_agi_exports_org_month   ON public.agi_exports (organization_id, declaration_month);

-- ── agi_export_lines ──────────────────────────────────────────────────────────
CREATE INDEX idx_agi_export_lines_export   ON public.agi_export_lines (agi_export_id);
CREATE INDEX idx_agi_export_lines_employee ON public.agi_export_lines (employee_id);
CREATE INDEX idx_agi_export_lines_entry    ON public.agi_export_lines (payroll_entry_id);

-- ── regulatory_audit_exports ──────────────────────────────────────────────────
CREATE INDEX idx_reg_audit_org         ON public.regulatory_audit_exports (organization_id);
CREATE INDEX idx_reg_audit_period      ON public.regulatory_audit_exports (financial_period_id);
CREATE INDEX idx_reg_audit_type        ON public.regulatory_audit_exports (export_type);
CREATE INDEX idx_reg_audit_status      ON public.regulatory_audit_exports (status);
CREATE INDEX idx_reg_audit_date        ON public.regulatory_audit_exports (export_date);

-- payroll_bas_rules is a global reference table (no organization_id / event_type columns).
