-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260531000008_phase4b_finance_dashboard_rpcs.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4B.8 — Finance Dashboard RPCs
--
-- Creates five SECURITY DEFINER reporting RPCs for the finance dashboard.
-- These RPCs bypass RLS and filter by p_org_id directly. The TypeScript
-- service layer enforces RBAC via assertPermission(ctx, 'finance:report:read')
-- before calling these functions.
--
-- Functions created:
--   finance_dashboard_snapshot(p_org_id)     — consolidated metrics jsonb
--   overdue_invoice_summary(p_org_id)        — aging buckets + legal count
--   vat_liability_summary(p_org_id, from, to) — monthly VAT obligations
--   payment_reconciliation_summary(p_org_id) — payment/allocation/refund metrics
--   refund_metrics_summary(p_org_id, from, to) — refund analytics by reason code
--
-- Design:
--   • SECURITY DEFINER: functions run as owner, bypass RLS, filter by p_org_id
--   • Org isolation: all WHERE clauses include organization_id = p_org_id
--   • Stable return structures: column names and types are versioned in this file
--   • finance_dashboard_snapshot returns jsonb for forward-compatible extensibility
--   • Aggregate functions use COALESCE to return 0 rather than NULL
--
-- RBAC: assertPermission(ctx, 'finance:report:read') at TypeScript service layer.
--       'finance:report:read' was seeded in Phase 4A commercial_core migration.
--
-- Dependencies:
--   20260531000007_phase4b_reporting_views.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ── RPC 1: finance_dashboard_snapshot ────────────────────────────────────────
-- Single-call consolidated snapshot of key finance metrics for the dashboard.
-- Returns a jsonb object with all metrics — allows the frontend to make one
-- RPC call rather than five separate queries.
--
-- Metrics included:
--   total_outstanding         — sum of outstanding_amount on active invoices
--   overdue_invoice_count     — count of invoices with status = 'overdue'
--   overdue_amount            — sum of outstanding_amount on overdue invoices
--   payments_this_month       — sum of confirmed payment amounts this calendar month
--   invoiced_this_month       — sum of invoice totals issued this calendar month
--   refunds_this_month        — sum of completed refund amounts this calendar month
--   unallocated_payments      — sum of unallocated headroom on confirmed payments
--   pending_export_items      — count of accounting queue items not yet exported
--   total_credit_liability    — sum of all positive credit balances (lesson delivery obligation)
--   snapshot_at               — ISO timestamp of when the snapshot was taken
--   period_month_start        — first day of current calendar month (ISO date)
--   currency                  — platform default currency (SEK)

CREATE OR REPLACE FUNCTION public.finance_dashboard_snapshot(
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_outstanding    numeric(12,2);
  v_overdue_count        bigint;
  v_overdue_amount       numeric(12,2);
  v_payments_this_month  numeric(12,2);
  v_invoiced_this_month  numeric(12,2);
  v_refunds_this_month   numeric(12,2);
  v_unallocated          numeric(12,2);
  v_pending_exports      bigint;
  v_credit_liability     bigint;
  v_month_start          date;
BEGIN
  v_month_start := DATE_TRUNC('month', now())::date;

  -- Total outstanding on all active invoices
  SELECT COALESCE(SUM(outstanding_amount), 0)
  INTO   v_total_outstanding
  FROM   invoices
  WHERE  organization_id  = p_org_id
    AND  outstanding_amount > 0
    AND  status NOT IN ('void', 'draft');

  -- Overdue invoice count and amount
  SELECT COUNT(*), COALESCE(SUM(outstanding_amount), 0)
  INTO   v_overdue_count, v_overdue_amount
  FROM   invoices
  WHERE  organization_id  = p_org_id
    AND  status           = 'overdue'
    AND  outstanding_amount > 0;

  -- Confirmed payments received this calendar month
  SELECT COALESCE(SUM(amount), 0)
  INTO   v_payments_this_month
  FROM   payments
  WHERE  organization_id = p_org_id
    AND  status          = 'confirmed'
    AND  confirmed_at::date >= v_month_start;

  -- Invoices issued this calendar month (excludes void/draft)
  SELECT COALESCE(SUM(total_amount), 0)
  INTO   v_invoiced_this_month
  FROM   invoices
  WHERE  organization_id = p_org_id
    AND  issued_at::date  >= v_month_start
    AND  status IN ('issued', 'paid', 'partially_paid', 'overdue');

  -- Completed refunds this calendar month
  SELECT COALESCE(SUM(refund_amount), 0)
  INTO   v_refunds_this_month
  FROM   refunds
  WHERE  organization_id = p_org_id
    AND  refund_status   = 'completed'
    AND  processed_at::date >= v_month_start;

  -- Unallocated headroom: confirmed payments where total_allocated < amount
  SELECT COALESCE(SUM(pay.amount - COALESCE(alloc.alloc_sum, 0)), 0)
  INTO   v_unallocated
  FROM   payments pay
  LEFT JOIN (
    SELECT payment_id, SUM(allocated_amount) AS alloc_sum
    FROM   payment_allocations
    GROUP  BY payment_id
  ) alloc ON alloc.payment_id = pay.id
  WHERE  pay.organization_id = p_org_id
    AND  pay.status          = 'confirmed'
    AND  (pay.amount - COALESCE(alloc.alloc_sum, 0)) > 0.005;

  -- Pending accounting export items
  SELECT COUNT(*)
  INTO   v_pending_exports
  FROM   accounting_export_queue
  WHERE  organization_id = p_org_id
    AND  exported_at     IS NULL;

  -- Total credit liability (sum of positive credit balances — future delivery obligation)
  SELECT COALESCE(SUM(GREATEST(balance, 0)), 0)::bigint
  INTO   v_credit_liability
  FROM   credit_balance_cache
  WHERE  organization_id = p_org_id
    AND  balance         > 0;

  RETURN jsonb_build_object(
    'total_outstanding',     v_total_outstanding,
    'overdue_invoice_count', v_overdue_count,
    'overdue_amount',        v_overdue_amount,
    'payments_this_month',   v_payments_this_month,
    'invoiced_this_month',   v_invoiced_this_month,
    'refunds_this_month',    v_refunds_this_month,
    'unallocated_payments',  v_unallocated,
    'pending_export_items',  v_pending_exports,
    'total_credit_liability',v_credit_liability,
    'snapshot_at',           now()::text,
    'period_month_start',    v_month_start::text,
    'currency',              'SEK'
  );
END;
$$;

COMMENT ON FUNCTION public.finance_dashboard_snapshot(uuid) IS
  'Consolidated finance dashboard snapshot. Returns all key metrics in a single jsonb call. '
  'SECURITY DEFINER — TypeScript layer must assertPermission(ctx, ''finance:report:read'').';

GRANT EXECUTE ON FUNCTION public.finance_dashboard_snapshot(uuid)
  TO authenticated, service_role;


-- ── RPC 2: overdue_invoice_summary ───────────────────────────────────────────
-- Aging buckets for outstanding invoices, extended with legal escalation count.
-- Complements the existing get_aging_report (Phase 4B.4) with the addition of
-- legal_count per bucket — critical for collections workflow visibility.

CREATE OR REPLACE FUNCTION public.overdue_invoice_summary(
  p_org_id uuid
)
RETURNS TABLE (
  aging_bucket       text,
  invoice_count      bigint,
  outstanding_amount numeric(12,2),
  legal_count        bigint,
  currency           text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN i.due_date IS NULL OR i.due_date >= now()::date THEN 'current'
      WHEN (now()::date - i.due_date) BETWEEN 1  AND 30   THEN '1_30_days'
      WHEN (now()::date - i.due_date) BETWEEN 31 AND 60   THEN '31_60_days'
      WHEN (now()::date - i.due_date) BETWEEN 61 AND 90   THEN '61_90_days'
      ELSE '90_plus_days'
    END                                               AS aging_bucket,
    COUNT(*)                                          AS invoice_count,
    COALESCE(SUM(i.outstanding_amount), 0)            AS outstanding_amount,
    COUNT(*) FILTER (
      WHERE ids.is_escalated_legal IS TRUE
    )                                                 AS legal_count,
    i.currency
  FROM   invoices i
  LEFT JOIN invoice_dunning_state ids ON ids.invoice_id = i.id
  WHERE  i.organization_id    = p_org_id
    AND  i.outstanding_amount > 0
    AND  i.status NOT IN ('void', 'draft')
  GROUP BY
    CASE
      WHEN i.due_date IS NULL OR i.due_date >= now()::date THEN 'current'
      WHEN (now()::date - i.due_date) BETWEEN 1  AND 30   THEN '1_30_days'
      WHEN (now()::date - i.due_date) BETWEEN 31 AND 60   THEN '31_60_days'
      WHEN (now()::date - i.due_date) BETWEEN 61 AND 90   THEN '61_90_days'
      ELSE '90_plus_days'
    END,
    i.currency
  ORDER BY aging_bucket;
$$;

COMMENT ON FUNCTION public.overdue_invoice_summary(uuid) IS
  'Aging buckets for outstanding invoices with legal escalation count per bucket. '
  'Extends get_aging_report with legal_count column. '
  'SECURITY DEFINER — TypeScript layer must assertPermission(ctx, ''finance:report:read'').';

GRANT EXECUTE ON FUNCTION public.overdue_invoice_summary(uuid)
  TO authenticated, service_role;


-- ── RPC 3: vat_liability_summary ─────────────────────────────────────────────
-- Monthly VAT obligations for the specified date range.
-- Swedish driving schools are subject to Swedish VAT (moms).
-- This RPC supports the quarterly momsdeklaration (VAT return) workflow.
--
-- The effective_vat_rate column is the actual weighted average VAT rate
-- applied across all invoices in that month, which may differ from the
-- nominal 25% if any invoices have non-standard VAT rates.

CREATE OR REPLACE FUNCTION public.vat_liability_summary(
  p_org_id    uuid,
  p_from_date date,
  p_to_date   date
)
RETURNS TABLE (
  month_start        date,
  invoice_count      bigint,
  net_subtotal       numeric(12,2),
  total_vat          numeric(12,2),
  total_gross        numeric(12,2),
  effective_vat_rate numeric(6,4),
  currency           text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    DATE_TRUNC('month', i.issued_at)::date          AS month_start,
    COUNT(*)                                         AS invoice_count,
    COALESCE(SUM(i.subtotal_amount), 0)              AS net_subtotal,
    COALESCE(SUM(i.vat_amount), 0)                   AS total_vat,
    COALESCE(SUM(i.total_amount), 0)                 AS total_gross,
    ROUND(
      COALESCE(SUM(i.vat_amount), 0)
      / NULLIF(COALESCE(SUM(i.subtotal_amount), 0), 0),
      4
    )                                                AS effective_vat_rate,
    i.currency
  FROM   invoices i
  WHERE  i.organization_id = p_org_id
    AND  i.issued_at::date  BETWEEN p_from_date AND p_to_date
    AND  i.status IN ('issued', 'paid', 'partially_paid')
  GROUP  BY DATE_TRUNC('month', i.issued_at), i.currency
  ORDER  BY month_start;
$$;

COMMENT ON FUNCTION public.vat_liability_summary(uuid, date, date) IS
  'Monthly VAT obligations for Swedish moms reporting. '
  'Returns net_subtotal (excl. VAT), total_vat, total_gross, and effective rate per month. '
  'SECURITY DEFINER — TypeScript layer must assertPermission(ctx, ''finance:report:read'').';

GRANT EXECUTE ON FUNCTION public.vat_liability_summary(uuid, date, date)
  TO authenticated, service_role;


-- ── RPC 4: payment_reconciliation_summary ────────────────────────────────────
-- Four key reconciliation metrics for the organisation:
--   confirmed_payments    — total confirmed payment amounts + count
--   total_allocated       — total amount allocated to invoices + distinct payment/invoice counts
--   outstanding_receivable — sum of outstanding invoice balances + count
--   completed_refunds     — total completed refund amounts + count
--
-- These four metrics together give a reconciliation picture:
--   confirmed_payments − completed_refunds − total_allocated ≈ unallocated headroom
--   outstanding_receivable shows what is still owed by students

CREATE OR REPLACE FUNCTION public.payment_reconciliation_summary(
  p_org_id uuid
)
RETURNS TABLE (
  metric          text,
  invoice_count   bigint,
  payment_count   bigint,
  total_amount    numeric(12,2),
  currency        text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Confirmed payments (all time)
  SELECT
    'confirmed_payments'::text,
    COUNT(DISTINCT invoice_id)::bigint,
    COUNT(*)::bigint,
    COALESCE(SUM(amount), 0)::numeric(12,2),
    COALESCE(MIN(currency), 'SEK')
  FROM   payments
  WHERE  organization_id = p_org_id
    AND  status IN ('confirmed', 'partially_refunded', 'refunded')

  UNION ALL

  -- Total allocated to invoices
  SELECT
    'total_allocated'::text,
    COUNT(DISTINCT invoice_id)::bigint,
    COUNT(DISTINCT payment_id)::bigint,
    COALESCE(SUM(allocated_amount), 0)::numeric(12,2),
    'SEK'
  FROM   payment_allocations
  WHERE  organization_id = p_org_id

  UNION ALL

  -- Outstanding receivable
  SELECT
    'outstanding_receivable'::text,
    COUNT(*)::bigint,
    0::bigint,
    COALESCE(SUM(outstanding_amount), 0)::numeric(12,2),
    COALESCE(MIN(currency), 'SEK')
  FROM   invoices
  WHERE  organization_id   = p_org_id
    AND  outstanding_amount > 0
    AND  status NOT IN ('void', 'draft')

  UNION ALL

  -- Completed refunds
  SELECT
    'completed_refunds'::text,
    COUNT(DISTINCT invoice_id)::bigint,
    COUNT(*)::bigint,
    COALESCE(SUM(refund_amount), 0)::numeric(12,2),
    'SEK'
  FROM   refunds
  WHERE  organization_id = p_org_id
    AND  refund_status   = 'completed';
$$;

COMMENT ON FUNCTION public.payment_reconciliation_summary(uuid) IS
  'Four reconciliation metrics: confirmed_payments, total_allocated, '
  'outstanding_receivable, completed_refunds. '
  'SECURITY DEFINER — TypeScript layer must assertPermission(ctx, ''finance:report:read'').';

GRANT EXECUTE ON FUNCTION public.payment_reconciliation_summary(uuid)
  TO authenticated, service_role;


-- ── RPC 5: refund_metrics_summary ────────────────────────────────────────────
-- Refund analytics by reason_code for the specified date range.
-- Helps identify patterns: duplicate_payment spikes may indicate billing issues;
-- service_failure spikes may indicate operational problems.
--
-- Returns rows grouped by reason_code and currency, ordered by total_amount DESC.
-- p_from_date / p_to_date filter on processed_at (when the refund completed),
-- not created_at, because only completed refunds are meaningful for analytics.

CREATE OR REPLACE FUNCTION public.refund_metrics_summary(
  p_org_id    uuid,
  p_from_date date,
  p_to_date   date
)
RETURNS TABLE (
  reason_code     text,
  refund_count    bigint,
  total_amount    numeric(12,2),
  credit_quantity bigint,
  currency        text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.reason_code::text,
    COUNT(*)                                AS refund_count,
    COALESCE(SUM(r.refund_amount), 0)       AS total_amount,
    COALESCE(SUM(r.credit_quantity), 0)     AS credit_quantity,
    COALESCE(MIN(inv.currency), 'SEK')      AS currency
  FROM   refunds r
  JOIN   invoices inv ON inv.id = r.invoice_id
  WHERE  r.organization_id    = p_org_id
    AND  r.refund_status      = 'completed'
    AND  r.processed_at::date BETWEEN p_from_date AND p_to_date
  GROUP  BY r.reason_code, inv.currency
  ORDER  BY SUM(r.refund_amount) DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.refund_metrics_summary(uuid, date, date) IS
  'Refund analytics by reason_code for the specified date range. '
  'Only completed refunds are included. Filtered on processed_at, not created_at. '
  'SECURITY DEFINER — TypeScript layer must assertPermission(ctx, ''finance:report:read'').';

GRANT EXECUTE ON FUNCTION public.refund_metrics_summary(uuid, date, date)
  TO authenticated, service_role;
