-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260531000007_phase4b_reporting_views.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4B.7 — Financial Reporting Views
--
-- Creates five operational reporting views using the finance_*_v naming
-- convention (distinct from the aggregated v_* views in migration 004).
-- These views expose per-row detail for operational reporting, reconciliation
-- dashboards, and accounting workflows.
--
-- Views created:
--   finance_invoice_aging_v      — per-invoice aging with refund/alloc/dunning detail
--   finance_payment_allocations_v — allocation detail with payment + invoice context
--   finance_refund_summary_v      — completed refunds with invoice/payment context
--   finance_vat_summary_v         — per-invoice VAT breakdown for Swedish reporting
--   finance_revenue_summary_v     — per-payment revenue rows matched to financial periods
--
-- Design principles:
--   • All views use WITH (security_invoker = true) — RLS on underlying tables
--     enforces tenant isolation without explicit WHERE org clauses.
--   • Views are read-only projections; no mutable financial logic.
--   • Deterministic: no volatile functions other than now() for aging calculation.
--   • LEFT JOINs for optional relationships (dunning state, allocations, refunds)
--     so missing rows produce NULL rather than dropping invoice rows.
--
-- Permission dependencies (enforced by SECURITY INVOKER RLS):
--   finance_invoice_aging_v       — finance:invoice:read (+ optional payment/refund/dunning)
--   finance_payment_allocations_v — finance:payment:read + finance:invoice:read
--   finance_refund_summary_v      — finance:refund:read + finance:invoice:read
--   finance_vat_summary_v         — finance:invoice:read
--   finance_revenue_summary_v     — finance:payment:read + finance:invoice:read + period read
--
-- Dependencies:
--   20260531000006_phase4b_stabilization.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ── View 1: finance_invoice_aging_v ──────────────────────────────────────────
-- Per-invoice aging detail. Includes:
--   • All invoices (excluding void/draft)
--   • Days overdue and aging bucket classification
--   • Aggregated payment allocation total (total_allocated)
--   • Aggregated completed refund total (total_refunded)
--   • Current dunning stage and legal escalation flag
--
-- The allocation/refund aggregates use derived table joins (GROUP BY)
-- rather than correlated subqueries for better query plan efficiency.
--
-- Soft-deleted data: excluded via status NOT IN ('void', 'draft').

CREATE OR REPLACE VIEW public.finance_invoice_aging_v
  WITH (security_invoker = true)
AS
SELECT
  inv.id                                      AS invoice_id,
  inv.organization_id,
  inv.student_id,
  inv.student_package_id,
  inv.invoice_number,
  inv.status,
  inv.currency,
  inv.total_amount,
  inv.subtotal_amount,
  inv.vat_amount,
  inv.paid_amount,
  inv.outstanding_amount,
  inv.issued_at,
  inv.due_date,
  inv.paid_at,
  CASE
    WHEN inv.due_date IS NULL OR inv.due_date >= now()::date THEN 0
    ELSE (now()::date - inv.due_date)::int
  END                                         AS days_overdue,
  CASE
    WHEN inv.due_date IS NULL OR inv.due_date >= now()::date THEN 'current'
    WHEN (now()::date - inv.due_date) BETWEEN 1  AND 30    THEN '1_30_days'
    WHEN (now()::date - inv.due_date) BETWEEN 31 AND 60    THEN '31_60_days'
    WHEN (now()::date - inv.due_date) BETWEEN 61 AND 90    THEN '61_90_days'
    ELSE '90_plus_days'
  END                                         AS aging_bucket,
  COALESCE(pa_agg.total_allocated, 0)         AS total_allocated,
  COALESCE(ref_agg.total_refunded, 0)         AS total_refunded,
  ids.current_stage_number                    AS dunning_stage,
  ids.is_escalated_legal                      AS is_legal_escalated,
  ids.next_action_at                          AS dunning_next_action_at,
  inv.created_at,
  inv.updated_at
FROM public.invoices inv
LEFT JOIN (
  SELECT
    invoice_id,
    SUM(allocated_amount) AS total_allocated
  FROM   public.payment_allocations
  GROUP  BY invoice_id
) pa_agg ON pa_agg.invoice_id = inv.id
LEFT JOIN (
  SELECT
    invoice_id,
    SUM(refund_amount) AS total_refunded
  FROM   public.refunds
  WHERE  refund_status = 'completed'
  GROUP  BY invoice_id
) ref_agg ON ref_agg.invoice_id = inv.id
LEFT JOIN public.invoice_dunning_state ids ON ids.invoice_id = inv.id
WHERE inv.status NOT IN ('void', 'draft');

COMMENT ON VIEW public.finance_invoice_aging_v IS
  'Per-invoice aging detail. Includes payment allocation totals, completed refund totals, '
  'and dunning state. Uses SECURITY INVOKER — caller needs finance:invoice:read at minimum. '
  'Allocation/refund columns degrade to 0 if caller lacks finance:payment:read or finance:refund:read.';


-- ── View 2: finance_payment_allocations_v ────────────────────────────────────
-- Payment allocation detail with payment and invoice context.
-- Each row = one payment_allocations record with the corresponding
-- payment method, status, and invoice number denormalized.
--
-- Required permissions: finance:payment:read + finance:invoice:read
-- (SECURITY INVOKER enforces this via RLS on payments + invoices + payment_allocations)

CREATE OR REPLACE VIEW public.finance_payment_allocations_v
  WITH (security_invoker = true)
AS
SELECT
  pa.id                       AS allocation_id,
  pa.organization_id,
  pa.payment_id,
  pa.invoice_id,
  pa.allocated_amount,
  pa.notes                    AS allocation_notes,
  pa.created_at               AS allocated_at,
  pa.created_by               AS allocated_by,
  pay.student_id,
  pay.amount                  AS payment_amount,
  pay.payment_method,
  pay.status                  AS payment_status,
  pay.confirmed_at            AS payment_confirmed_at,
  pay.provider_reference,
  inv.invoice_number,
  inv.status                  AS invoice_status,
  inv.total_amount            AS invoice_total,
  inv.paid_amount             AS invoice_paid,
  inv.outstanding_amount      AS invoice_outstanding,
  inv.currency
FROM public.payment_allocations pa
JOIN public.payments pay ON pay.id = pa.payment_id
JOIN public.invoices  inv ON inv.id = pa.invoice_id;

COMMENT ON VIEW public.finance_payment_allocations_v IS
  'Payment allocation detail enriched with payment method/status and invoice number. '
  'One row per allocation record. Uses SECURITY INVOKER — caller needs '
  'finance:payment:read and finance:invoice:read.';


-- ── View 3: finance_refund_summary_v ─────────────────────────────────────────
-- Completed and in-progress refunds with invoice and payment context.
-- Exposes the full lifecycle of each refund (status, reason, amounts)
-- alongside the original invoice and payment details.
--
-- Required permissions: finance:refund:read + finance:invoice:read
-- (payment columns degrade to NULL if caller lacks finance:payment:read)

CREATE OR REPLACE VIEW public.finance_refund_summary_v
  WITH (security_invoker = true)
AS
SELECT
  r.id                        AS refund_id,
  r.organization_id,
  r.invoice_id,
  r.payment_id,
  r.student_id,
  r.refund_type,
  r.refund_status,
  r.reason_code,
  r.refund_amount,
  r.credit_quantity,
  r.credit_category,
  r.credit_ledger_id,
  r.notes                     AS refund_notes,
  r.processed_at,
  r.processed_by,
  r.failed_reason,
  r.created_at,
  r.created_by,
  inv.invoice_number,
  inv.status                  AS invoice_status,
  inv.total_amount            AS invoice_total,
  inv.currency,
  pay.payment_method,
  pay.amount                  AS original_payment_amount,
  pay.confirmed_at            AS payment_confirmed_at
FROM public.refunds r
JOIN public.invoices inv ON inv.id = r.invoice_id
LEFT JOIN public.payments pay ON pay.id = r.payment_id;

COMMENT ON VIEW public.finance_refund_summary_v IS
  'Refunds enriched with invoice and payment context. '
  'All refund statuses included (pending, processing, completed, failed, cancelled). '
  'Payment columns are NULL if caller lacks finance:payment:read. '
  'Uses SECURITY INVOKER — caller needs finance:refund:read and finance:invoice:read.';


-- ── View 4: finance_vat_summary_v ────────────────────────────────────────────
-- Per-invoice VAT breakdown for Swedish VAT (moms) reporting.
-- Shows subtotal, VAT amount, total, and effective VAT rate per issued invoice.
-- Restricted to issued/paid/partially_paid invoices (excludes drafts and voids).
--
-- Used for monthly VAT reporting (SKV periodisk sammanställning / momsdeklaration).
-- For management reports use v_vat_summary (aggregated monthly view).
--
-- Required permissions: finance:invoice:read

CREATE OR REPLACE VIEW public.finance_vat_summary_v
  WITH (security_invoker = true)
AS
SELECT
  inv.id                                                AS invoice_id,
  inv.organization_id,
  inv.invoice_number,
  inv.student_id,
  inv.issued_at,
  DATE_TRUNC('month', inv.issued_at)::date              AS issued_month,
  inv.currency,
  inv.subtotal_amount,
  inv.vat_amount,
  inv.total_amount,
  CASE
    WHEN inv.subtotal_amount > 0
    THEN ROUND(inv.vat_amount / inv.subtotal_amount, 4)
    ELSE 0::numeric
  END                                                   AS effective_vat_rate,
  inv.status,
  inv.paid_at
FROM public.invoices inv
WHERE inv.status IN ('issued', 'paid', 'partially_paid')
  AND inv.issued_at IS NOT NULL;

COMMENT ON VIEW public.finance_vat_summary_v IS
  'Per-invoice VAT breakdown for Swedish moms reporting. '
  'Excludes draft and void invoices. Effective VAT rate is vat_amount / subtotal_amount. '
  'For monthly aggregates use the existing v_vat_summary view. '
  'Uses SECURITY INVOKER — caller needs finance:invoice:read.';


-- ── View 5: finance_revenue_summary_v ────────────────────────────────────────
-- Per-payment revenue rows matched to financial periods.
-- Each row = one confirmed payment with the financial period it falls within
-- and the associated invoice. Used for period-based revenue recognition.
--
-- INNER JOINs to financial_periods and invoices mean only payments that:
--   a) fall within a defined financial period, AND
--   b) have an associated invoice
-- are returned. Payments outside any defined period are excluded.
--
-- Required permissions: finance:payment:read + finance:invoice:read
-- (financial_periods RLS: any org member can read — no specific permission required)

CREATE OR REPLACE VIEW public.finance_revenue_summary_v
  WITH (security_invoker = true)
AS
SELECT
  fp.id                       AS period_id,
  fp.organization_id,
  fp.name                     AS period_name,
  fp.period_start,
  fp.period_end,
  fp.status                   AS period_status,
  pay.id                      AS payment_id,
  pay.student_id,
  pay.amount                  AS payment_amount,
  COALESCE(pay.refund_amount, 0) AS refund_amount,
  pay.amount - COALESCE(pay.refund_amount, 0) AS net_payment_amount,
  pay.payment_method,
  pay.status                  AS payment_status,
  pay.confirmed_at            AS payment_confirmed_at,
  inv.id                      AS invoice_id,
  inv.invoice_number,
  inv.total_amount            AS invoice_total,
  inv.subtotal_amount         AS invoice_subtotal,
  inv.vat_amount              AS invoice_vat,
  inv.currency
FROM public.financial_periods fp
JOIN public.payments pay
  ON  pay.organization_id = fp.organization_id
  AND pay.confirmed_at::date BETWEEN fp.period_start AND fp.period_end
  AND pay.status IN ('confirmed', 'partially_refunded', 'refunded')
JOIN public.invoices inv ON inv.id = pay.invoice_id;

COMMENT ON VIEW public.finance_revenue_summary_v IS
  'Per-payment revenue rows matched to financial periods. '
  'Only payments within a defined financial period are included. '
  'Use for period-based revenue recognition and period closure verification. '
  'For aggregated period totals use the existing v_revenue_by_period view. '
  'Uses SECURITY INVOKER — caller needs finance:payment:read and finance:invoice:read.';
