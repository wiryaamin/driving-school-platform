-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260530000002_phase4a_commercial_indexes.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4A — Commercial Foundation (Indexes)
--
-- Performance indexes for all Phase 4A commercial tables.
-- Separated from the core migration for clarity and faster iteration.
-- Dependencies: 20260530000001_phase4a_commercial_core.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ── package_catalog ──────────────────────────────────────────────────────────

-- Active offerings per org — main admin list query
CREATE INDEX package_catalog_org_active_idx
  ON public.package_catalog (organization_id, is_active)
  WHERE is_active = true AND organization_id IS NOT NULL;

-- Category-scoped lookup (e.g., "all driving packages")
CREATE INDEX package_catalog_org_category_idx
  ON public.package_catalog (organization_id, lesson_category)
  WHERE organization_id IS NOT NULL;

-- System-wide templates (org_id IS NULL)
CREATE INDEX package_catalog_system_category_idx
  ON public.package_catalog (lesson_category)
  WHERE organization_id IS NULL;

-- ── package_offerings ────────────────────────────────────────────────────────

-- Active offerings per org — student-facing purchase list
CREATE INDEX package_offerings_org_active_idx
  ON public.package_offerings (organization_id, status, sort_order)
  WHERE status = 'active';

-- Category filter on active offerings
CREATE INDEX package_offerings_org_category_idx
  ON public.package_offerings (organization_id, lesson_category)
  WHERE status = 'active';

-- Catalog source tracking
CREATE INDEX package_offerings_catalog_idx
  ON public.package_offerings (catalog_id)
  WHERE catalog_id IS NOT NULL;

-- ── student_packages ─────────────────────────────────────────────────────────

-- Primary: org + student wallet listing
CREATE INDEX student_packages_org_student_idx
  ON public.student_packages (organization_id, student_id, status);

-- Active packages for a student (balance checks, booking eligibility)
CREATE INDEX student_packages_student_active_idx
  ON public.student_packages (organization_id, student_id)
  WHERE status = 'active';

-- Offering source tracking + analytics
CREATE INDEX student_packages_offering_idx
  ON public.student_packages (offering_id);

-- Upcoming expiries (maintenance tick + reminders)
CREATE INDEX student_packages_expires_idx
  ON public.student_packages (expires_at, organization_id)
  WHERE expires_at IS NOT NULL AND status = 'active';

-- ── credit_ledger ────────────────────────────────────────────────────────────
-- Note: All queries on credit_ledger go through SECURITY DEFINER functions
-- or are read-only wallet/history fetches. Indexes optimise both paths.

-- Primary balance query: (org, student, category) — covers consume_credit CTE
CREATE INDEX credit_ledger_org_student_cat_idx
  ON public.credit_ledger (organization_id, student_id, lesson_category, entry_type, expires_at);

-- FIFO grant traversal: for each grant, find its consume/expire children
CREATE INDEX credit_ledger_grant_entry_idx
  ON public.credit_ledger (grant_entry_id)
  WHERE grant_entry_id IS NOT NULL;

-- Booking linkage: find all consume entries for a booking
CREATE INDEX credit_ledger_booking_idx
  ON public.credit_ledger (booking_id)
  WHERE booking_id IS NOT NULL;

-- Student package linkage: find all grants for a purchased package
CREATE INDEX credit_ledger_student_package_idx
  ON public.credit_ledger (student_package_id)
  WHERE student_package_id IS NOT NULL;

-- Expiry sweep: find expired grants for maintenance tick (expire_stale_credits)
CREATE INDEX credit_ledger_expired_grants_idx
  ON public.credit_ledger (expires_at, organization_id)
  WHERE entry_type = 'grant' AND expires_at IS NOT NULL;

-- Chronological ledger history per student (wallet history API)
CREATE INDEX credit_ledger_student_time_idx
  ON public.credit_ledger (organization_id, student_id, created_at DESC);

-- ── credit_balance_cache ─────────────────────────────────────────────────────
-- Primary UNIQUE constraint already covers (org, student, category).
-- Add student-scoped index for multi-category wallet summary query.

CREATE INDEX credit_balance_cache_student_idx
  ON public.credit_balance_cache (organization_id, student_id);

-- ── invoices ─────────────────────────────────────────────────────────────────

-- Student invoice history
CREATE INDEX invoices_org_student_idx
  ON public.invoices (organization_id, student_id, created_at DESC);

-- Status-based admin lists (outstanding, overdue, etc.)
CREATE INDEX invoices_org_status_idx
  ON public.invoices (organization_id, status);

-- Invoice number lookup (display, search)
CREATE INDEX invoices_org_number_idx
  ON public.invoices (organization_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

-- Overdue detection: invoices past due_date with outstanding balance
CREATE INDEX invoices_overdue_idx
  ON public.invoices (due_date, organization_id)
  WHERE status IN ('issued', 'partially_paid') AND due_date IS NOT NULL;

-- Package linkage: find invoice for a student_package
CREATE INDEX invoices_student_package_idx
  ON public.invoices (student_package_id)
  WHERE student_package_id IS NOT NULL;

-- ── invoice_line_items ───────────────────────────────────────────────────────

-- Primary: all lines for an invoice
CREATE INDEX invoice_line_items_invoice_idx
  ON public.invoice_line_items (invoice_id, sort_order);

-- Package linkage
CREATE INDEX invoice_line_items_student_package_idx
  ON public.invoice_line_items (student_package_id)
  WHERE student_package_id IS NOT NULL;

-- ── invoice_number_sequences ─────────────────────────────────────────────────
-- UNIQUE constraint on (organization_id, year) already covers the primary lookup.
-- No additional index needed.

-- ── payments ─────────────────────────────────────────────────────────────────

-- Primary: all payments for an invoice
CREATE INDEX payments_invoice_idx
  ON public.payments (invoice_id, created_at DESC);

-- Student payment history
CREATE INDEX payments_org_student_idx
  ON public.payments (organization_id, student_id, created_at DESC);

-- Status-based queries (pending, failed payments requiring follow-up)
CREATE INDEX payments_org_status_idx
  ON public.payments (organization_id, status)
  WHERE status IN ('pending', 'failed');

-- Provider reference lookup (Swish/Stripe reconciliation)
CREATE INDEX payments_provider_ref_idx
  ON public.payments (provider_reference)
  WHERE provider_reference IS NOT NULL;

-- ── financial_periods ────────────────────────────────────────────────────────

-- Period status list (open/closed/locked management view)
CREATE INDEX financial_periods_org_status_idx
  ON public.financial_periods (organization_id, status);

-- Date range lookup
CREATE INDEX financial_periods_org_dates_idx
  ON public.financial_periods (organization_id, period_start, period_end);
