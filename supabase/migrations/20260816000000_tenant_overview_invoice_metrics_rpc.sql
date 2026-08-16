-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260816000000_tenant_overview_invoice_metrics_rpc.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
--
-- Fixes a correctness defect identified in the platform architecture/
-- performance audit (Tenant Workspace → Översikt dashboard):
--
--   • The tenant dashboard's overdue-invoice count was derived by fetching
--     only the first 50 "issued" invoices and counting overdue ones among
--     that sample in JavaScript — silently wrong once an org has more than
--     50 open invoices.
--   • The monthly-revenue figure was summed in JavaScript over up to 5000
--     fetched invoice rows instead of a database-side SUM() — wrong past
--     that cap, and wasteful even below it.
--
-- This RPC follows the same established pattern as finance_dashboard_snapshot()
-- (20260531000008_phase4b_finance_dashboard_rpcs.sql): SECURITY DEFINER,
-- explicit p_org_id filter, COALESCE'd aggregates, RBAC enforced by the
-- calling Edge Function (dashboard) rather than by RLS. It is a separate
-- function rather than a reuse of finance_dashboard_snapshot() because the
-- Översikt dashboard's business rules differ from that function's definitions
-- (e.g. "pending"/"overdue" here are derived from status = 'issued' plus a
-- caller-supplied "today" cutoff, not the invoices.status = 'overdue' value
-- finance_dashboard_snapshot() reads) — those existing Översikt rules are
-- preserved exactly, only the row-capped client-side computation is removed.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tenant_overview_invoice_metrics(
  p_org_id     uuid,
  p_today      date,
  p_month_from timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_count  bigint;
  v_overdue_count  bigint;
  v_monthly_amount numeric(12,2);
BEGIN
  -- Pending / overdue open invoices — mirrors the previous logic exactly:
  -- status = 'issued', not voided; "overdue" = due_date before the caller's
  -- "today" cutoff. Both counted server-side, so no row cap applies.
  -- Computed regardless of p_month_from, matching the previous behavior
  -- where the pending/overdue query was independent of the revenue window.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < p_today)
  INTO
    v_pending_count,
    v_overdue_count
  FROM   invoices
  WHERE  organization_id = p_org_id
    AND  status          = 'issued'
    AND  void_at          IS NULL;

  -- Revenue collected this month — mirrors the previous logic exactly:
  -- status in ('paid','partially_paid'), not voided, created this month,
  -- summing paid_amount. Server-side SUM, so no row cap applies. When the
  -- caller omits p_month_from (previously: an empty month_from query param),
  -- the previous implementation reported 0 rather than erroring — preserved
  -- here the same way.
  IF p_month_from IS NOT NULL THEN
    SELECT COALESCE(SUM(paid_amount), 0)
    INTO   v_monthly_amount
    FROM   invoices
    WHERE  organization_id = p_org_id
      AND  status IN ('paid', 'partially_paid')
      AND  void_at          IS NULL
      AND  created_at      >= p_month_from;
  ELSE
    v_monthly_amount := 0;
  END IF;

  RETURN jsonb_build_object(
    'pending_count',   v_pending_count,
    'overdue_count',   v_overdue_count,
    'monthly_revenue', v_monthly_amount
  );
END;
$$;

COMMENT ON FUNCTION public.tenant_overview_invoice_metrics(uuid, date, timestamptz) IS
  'Tenant Översikt dashboard: exact (non-capped) pending/overdue invoice counts and '
  'monthly revenue total, computed server-side. SECURITY DEFINER — the calling '
  '"dashboard" Edge Function must already have verified finance:invoice:read.';

GRANT EXECUTE ON FUNCTION public.tenant_overview_invoice_metrics(uuid, date, timestamptz)
  TO authenticated, service_role;
