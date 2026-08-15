-- SECURITY REMEDIATION WAVE 2C-A — FINANCIAL READ / CROSS-TENANT DATA
-- LEAKAGE HARDENING
--
-- Fixes the 10 finance-domain SECURITY DEFINER READ/report functions found
-- still exposed to `anon`/unauthenticated `authenticated` callers (grant
-- inventory re-verified live for this wave, not assumed from the Wave 2B
-- report's "~40 deferred" estimate — the true still-exposed finance-domain
-- count was 104, of which these 10 are the genuine invoice/payment/refund/
-- VAT/aging/reconciliation/dashboard read-and-report functions; the rest
-- are either the ~15-function replay/compliance report subsystem (out of
-- scope per CLAUDE.md's anti-overengineering guardrail against replay
-- infrastructure and this wave's explicit boundary), scheduling/platform
-- dashboards unrelated to finance, or trigger functions unreachable via
-- RPC).
--
-- Every one of these 10 took an organization id (directly as a parameter,
-- or via the p_period_id it derives one from) with no verification that it
-- matched the caller's own organization — an ordinary authenticated user
-- of ANY tenant could call any of them with someone else's org/period id
-- and read that tenant's real revenue, outstanding balances, VAT
-- liability, refund totals, or reconciliation state.
--
-- Fix pattern:
--   - finance_dashboard_snapshot, validate_balance_reconstruction,
--     validate_opening_balances: direct p_org_id parameter, PL/pgSQL —
--     early RAISE EXCEPTION guard (same shape as Wave 2B's allocate_payment/
--     process_refund/import_bank_statement).
--   - generate_reconciliation_report: entity-derived org (via
--     financial_periods.organization_id), PL/pgSQL — merged not-found/
--     wrong-org exception reusing the function's own existing message, same
--     pattern as Wave 2B's soft_close_period/reconcile_accounts_receivable.
--   - get_aging_report, get_vat_summary, overdue_invoice_summary,
--     payment_reconciliation_summary, refund_metrics_summary,
--     vat_liability_summary: these are all `LANGUAGE sql` set-returning
--     functions, not plpgsql — they cannot RAISE EXCEPTION mid-query.
--     Consistent with this wave's Phase 10 instruction ("a nonexistent
--     entity and an entity belonging to another organization should not
--     unnecessarily produce distinguishable responses" and Phase 12's
--     explicit "DENIED or zero rows" acceptance criterion for reads), the
--     fix adds `AND (p_org_id = auth_organization_id() OR
--     is_trusted_service_context())` to every WHERE clause (all four
--     branches of payment_reconciliation_summary's UNION ALL) — a
--     cross-tenant or spoofed-org call returns an empty result set instead
--     of an error, which is the correct, unsurprising behaviour for a
--     report widget and requires no LANGUAGE change or restructuring of
--     the existing query shape.
--
-- No aggregation logic, computed columns, bucket definitions, or table
-- schema changed anywhere in this migration.
--
-- WAVE 2A LESSON reapplied: every REVOKE below explicitly includes PUBLIC,
-- anon, and authenticated together; every grant is re-verified live via
-- has_function_privilege() after applying this migration.
--
-- Reuses public.is_trusted_service_context() from Wave 2B
-- (20260815180000) as instructed — no new service-role mechanism created.
-- None of these 10 functions currently has a real service_role caller
-- (all reachable callers in supabase/functions use createClient with the
-- anon key + forwarded Authorization header = `authenticated`, confirmed
-- by reading reports/index.ts, reconciliation/index.ts, payroll/index.ts,
-- ledger-replay/index.ts, financial-close/index.ts directly) — the
-- service-role bypass is included anyway for architectural consistency
-- with every other function fixed in this security program, at zero
-- marginal risk since it only ever evaluates true for a call actually
-- carrying a service_role JWT.

-- ============================================================================
-- A. DIRECT p_org_id PARAMETER, PL/pgSQL — early exception guard
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finance_dashboard_snapshot(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.validate_balance_reconstruction(p_org_id uuid, p_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_replay_result  jsonb;
  v_run_id         uuid;
  v_divergences    jsonb := '[]'::jsonb;
  v_total_accounts int   := 0;
  v_div_count      int   := 0;
  v_status         text;
  v_rec            record;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;

  -- Run the storage-light replay
  v_replay_result := public.replay_period_state(p_org_id, p_period_id, p_actor_id);
  v_run_id        := (v_replay_result->>'replay_run_id')::uuid;

  -- Collect divergences from replay_validation_deltas (storage-light approach)
  FOR v_rec IN
    SELECT
      account_code,
      delta_type,
      ledger_balance,
      cache_balance,
      delta_amount
    FROM public.replay_validation_deltas
    WHERE replay_run_id = v_run_id
    ORDER BY delta_amount DESC NULLS LAST
  LOOP
    v_divergences := v_divergences || jsonb_build_array(jsonb_build_object(
      'account_code',   v_rec.account_code,
      'delta_type',     v_rec.delta_type,
      'ledger_balance', v_rec.ledger_balance,
      'cache_balance',  v_rec.cache_balance,
      'delta_amount',   v_rec.delta_amount
    ));
    v_div_count := v_div_count + 1;
  END LOOP;

  v_total_accounts := (v_replay_result->>'accounts_reconstructed')::int;
  v_status := CASE WHEN v_div_count = 0 THEN 'valid' ELSE 'divergences_found' END;

  RETURN jsonb_build_object(
    'status',           v_status,
    'replay_run_id',    v_run_id,
    'period_id',        p_period_id,
    'total_accounts',   v_total_accounts,
    'divergence_count', v_div_count,
    'divergences',      v_divergences,
    'replay_hash',      v_replay_result->>'replay_hash',
    'validated_at',     now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_opening_balances(p_org_id uuid, p_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period        financial_periods%ROWTYPE;
  v_ob_entry_id   uuid;
  v_ob_debit      numeric(12,2) := 0;
  v_ob_credit     numeric(12,2) := 0;
  v_prior_period  uuid;
  v_checks        jsonb := '[]'::jsonb;
  v_all_passed    boolean;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
  END IF;

  -- Check 1: OB journal entry exists
  SELECT id INTO v_ob_entry_id
  FROM   journal_entries
  WHERE  organization_id    = p_org_id
    AND  source_entity_id   = p_period_id
    AND  entry_type         = 'opening_balance'
    AND  status             = 'posted'
  LIMIT 1;

  v_checks := v_checks || jsonb_build_object(
    'check',   'opening_balance_entry_exists',
    'passed',  v_ob_entry_id IS NOT NULL,
    'message', CASE WHEN v_ob_entry_id IS NOT NULL
               THEN 'Opening balance entry exists: ' || v_ob_entry_id
               ELSE 'No opening balance entry found for period ' || p_period_id END
  );

  -- Check 2: OB entry is balanced
  IF v_ob_entry_id IS NOT NULL THEN
    SELECT total_debit, total_credit INTO v_ob_debit, v_ob_credit
    FROM   journal_entries WHERE id = v_ob_entry_id;

    v_checks := v_checks || jsonb_build_object(
      'check',   'opening_balance_balanced',
      'passed',  v_ob_debit = v_ob_credit,
      'message', format('OB total_debit=%s total_credit=%s — %s',
                   v_ob_debit, v_ob_credit,
                   CASE WHEN v_ob_debit = v_ob_credit THEN 'balanced' ELSE 'UNBALANCED' END)
    );
  END IF;

  -- Check 3: Reconciles with prior period closing balances (if a prior period exists)
  SELECT id INTO v_prior_period
  FROM   financial_periods
  WHERE  organization_id = p_org_id
    AND  period_end      < v_period.period_start
  ORDER  BY period_end DESC
  LIMIT  1;

  IF v_prior_period IS NOT NULL AND v_ob_entry_id IS NOT NULL THEN
    DECLARE
      v_prior_closing  numeric(12,2);
      v_ob_total       numeric(12,2);
      v_match          boolean;
    BEGIN
      SELECT ABS(SUM(closing_balance)) INTO v_prior_closing
      FROM   account_balances
      WHERE  organization_id     = p_org_id
        AND  financial_period_id = v_prior_period;

      -- OB total should equal prior period's absolute closing balance sum (within rounding)
      v_ob_total := v_ob_debit; -- = v_ob_credit for balanced OB
      v_match    := ABS(v_prior_closing - v_ob_total) < 1; -- within 1 unit rounding tolerance

      v_checks := v_checks || jsonb_build_object(
        'check',          'agrees_with_prior_period',
        'passed',         v_match,
        'prior_period_id', v_prior_period,
        'message', format('Prior period closing sum=%s, OB total=%s — %s',
                     v_prior_closing, v_ob_total,
                     CASE WHEN v_match THEN 'agrees' ELSE 'DISAGREES (check rounding)' END)
      );
    END;
  END IF;

  SELECT bool_and((c->>'passed')::boolean) INTO v_all_passed FROM jsonb_array_elements(v_checks) AS c;

  RETURN jsonb_build_object(
    'period_id',       p_period_id,
    'period_start',    v_period.period_start,
    'period_status',   v_period.status,
    'ob_entry_id',     v_ob_entry_id,
    'checks',          v_checks,
    'all_passed',      COALESCE(v_all_passed, false),
    'validated_at',    now()
  );
END;
$function$;

-- ============================================================================
-- B. ENTITY-DERIVED ORG (financial_periods), PL/pgSQL — merged not-found/
--    wrong-org exception reusing the existing message
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_reconciliation_report(p_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period        financial_periods%ROWTYPE;
  v_debit         numeric(14,2) := 0;
  v_credit        numeric(14,2) := 0;
  v_last_check    ledger_consistency_checks%ROWTYPE;
  v_last_snap     period_audit_snapshots%ROWTYPE;
  v_rr_bank       reconciliation_runs%ROWTYPE;
  v_rr_ar         reconciliation_runs%ROWTYPE;
  v_rr_vat        reconciliation_runs%ROWTYPE;
  v_rr_def        reconciliation_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_period.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Trial balance
  SELECT COALESCE(SUM(debit_movement),0), COALESCE(SUM(credit_movement),0)
  INTO v_debit, v_credit
  FROM account_balances WHERE financial_period_id = p_period_id;

  -- Latest consistency check
  SELECT * INTO v_last_check
  FROM ledger_consistency_checks
  WHERE financial_period_id = p_period_id
  ORDER BY created_at DESC LIMIT 1;

  -- Latest hard_close or soft_close snapshot
  SELECT * INTO v_last_snap
  FROM period_audit_snapshots
  WHERE financial_period_id = p_period_id
  ORDER BY captured_at DESC LIMIT 1;

  -- Latest reconciliation run per type
  SELECT * INTO v_rr_bank
  FROM reconciliation_runs
  WHERE financial_period_id = p_period_id AND reconciliation_type = 'bank'
  ORDER BY started_at DESC LIMIT 1;

  SELECT * INTO v_rr_ar
  FROM reconciliation_runs
  WHERE financial_period_id = p_period_id AND reconciliation_type = 'accounts_receivable'
  ORDER BY started_at DESC LIMIT 1;

  SELECT * INTO v_rr_vat
  FROM reconciliation_runs
  WHERE financial_period_id = p_period_id AND reconciliation_type = 'vat'
  ORDER BY started_at DESC LIMIT 1;

  SELECT * INTO v_rr_def
  FROM reconciliation_runs
  WHERE financial_period_id = p_period_id AND reconciliation_type = 'deferred_revenue'
  ORDER BY started_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'generated_at',   now(),
    'period', jsonb_build_object(
      'id',          v_period.id,
      'name',        v_period.name,
      'period_start', v_period.period_start,
      'period_end',  v_period.period_end,
      'status',      v_period.status,
      'amendment_count', v_period.amendment_count
    ),
    'trial_balance', jsonb_build_object(
      'total_debit',  v_debit,
      'total_credit', v_credit,
      'variance',     v_debit - v_credit,
      'is_balanced',  ABS(v_debit - v_credit) < 0.01
    ),
    'reconciliations', jsonb_build_object(
      'bank', CASE WHEN v_rr_bank.id IS NOT NULL THEN jsonb_build_object(
        'run_id', v_rr_bank.id, 'is_reconciled', v_rr_bank.is_reconciled,
        'variance', v_rr_bank.variance_amount, 'status', v_rr_bank.status,
        'completed_at', v_rr_bank.completed_at
      ) ELSE NULL END,
      'accounts_receivable', CASE WHEN v_rr_ar.id IS NOT NULL THEN jsonb_build_object(
        'run_id', v_rr_ar.id, 'is_reconciled', v_rr_ar.is_reconciled,
        'variance', v_rr_ar.variance_amount, 'result', v_rr_ar.result_summary
      ) ELSE NULL END,
      'vat', CASE WHEN v_rr_vat.id IS NOT NULL THEN jsonb_build_object(
        'run_id', v_rr_vat.id, 'is_reconciled', v_rr_vat.is_reconciled,
        'variance', v_rr_vat.variance_amount, 'result', v_rr_vat.result_summary
      ) ELSE NULL END,
      'deferred_revenue', CASE WHEN v_rr_def.id IS NOT NULL THEN jsonb_build_object(
        'run_id', v_rr_def.id, 'is_reconciled', v_rr_def.is_reconciled,
        'variance', v_rr_def.variance_amount, 'result', v_rr_def.result_summary
      ) ELSE NULL END
    ),
    'consistency_check', CASE WHEN v_last_check.id IS NOT NULL THEN jsonb_build_object(
      'check_id',     v_last_check.id,
      'check_type',   v_last_check.check_type,
      'passed',       v_last_check.passed,
      'total_checks', v_last_check.total_checks,
      'passed_checks', v_last_check.passed_checks,
      'failed_checks', v_last_check.failed_checks,
      'run_at',       v_last_check.created_at
    ) ELSE NULL END,
    'audit_snapshot', CASE WHEN v_last_snap.id IS NOT NULL THEN jsonb_build_object(
      'snapshot_id',   v_last_snap.id,
      'snapshot_type', v_last_snap.snapshot_type,
      'is_balanced',   v_last_snap.is_balanced,
      'content_hash',  v_last_snap.content_hash,
      'captured_at',   v_last_snap.captured_at
    ) ELSE NULL END
  );
END;
$function$;

-- ============================================================================
-- C. LANGUAGE sql SET-RETURNING REPORTS — WHERE-clause org guard, empty
--    result set (not an exception) for cross-tenant/spoofed calls
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_aging_report(p_org_id uuid)
 RETURNS TABLE(aging_bucket text, invoice_count bigint, outstanding_amount numeric, currency text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN i.due_date IS NULL OR i.due_date >= now()::date THEN 'current'
      WHEN (now()::date - i.due_date) BETWEEN 1  AND 30   THEN '1_30_days'
      WHEN (now()::date - i.due_date) BETWEEN 31 AND 60   THEN '31_60_days'
      WHEN (now()::date - i.due_date) BETWEEN 61 AND 90   THEN '61_90_days'
      ELSE '90_plus_days'
    END                                                  AS aging_bucket,
    COUNT(*)                                             AS invoice_count,
    COALESCE(SUM(i.outstanding_amount), 0)               AS outstanding_amount,
    i.currency
  FROM invoices i
  WHERE i.organization_id    = p_org_id
    AND (p_org_id = public.auth_organization_id() OR public.is_trusted_service_context())
    AND i.outstanding_amount > 0
    AND i.status NOT IN ('void', 'draft')
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
$function$;

CREATE OR REPLACE FUNCTION public.get_vat_summary(p_org_id uuid, p_from_date date, p_to_date date)
 RETURNS TABLE(month_start date, currency text, invoice_count bigint, total_subtotal numeric, total_vat numeric, total_gross numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    DATE_TRUNC('month', i.issued_at)::date AS month_start,
    i.currency,
    COUNT(*)                               AS invoice_count,
    COALESCE(SUM(i.subtotal_amount), 0)    AS total_subtotal,
    COALESCE(SUM(i.vat_amount), 0)         AS total_vat,
    COALESCE(SUM(i.total_amount), 0)       AS total_gross
  FROM invoices i
  WHERE i.organization_id = p_org_id
    AND (p_org_id = public.auth_organization_id() OR public.is_trusted_service_context())
    AND i.issued_at::date  BETWEEN p_from_date AND p_to_date
    AND i.status          IN ('issued', 'paid', 'partially_paid')
  GROUP BY DATE_TRUNC('month', i.issued_at), i.currency
  ORDER BY month_start;
$function$;

CREATE OR REPLACE FUNCTION public.overdue_invoice_summary(p_org_id uuid)
 RETURNS TABLE(aging_bucket text, invoice_count bigint, outstanding_amount numeric, legal_count bigint, currency text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND  (p_org_id = public.auth_organization_id() OR public.is_trusted_service_context())
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
$function$;

CREATE OR REPLACE FUNCTION public.payment_reconciliation_summary(p_org_id uuid)
 RETURNS TABLE(metric text, invoice_count bigint, payment_count bigint, total_amount numeric, currency text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Confirmed payments (all time)
  SELECT
    'confirmed_payments'::text,
    COUNT(DISTINCT invoice_id)::bigint,
    COUNT(*)::bigint,
    COALESCE(SUM(amount), 0)::numeric(12,2),
    COALESCE(MIN(currency), 'SEK')
  FROM   payments
  WHERE  organization_id = p_org_id
    AND  (p_org_id = public.auth_organization_id() OR public.is_trusted_service_context())
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
    AND  (p_org_id = public.auth_organization_id() OR public.is_trusted_service_context())

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
    AND  (p_org_id = public.auth_organization_id() OR public.is_trusted_service_context())
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
    AND  (p_org_id = public.auth_organization_id() OR public.is_trusted_service_context())
    AND  refund_status   = 'completed';
$function$;

CREATE OR REPLACE FUNCTION public.refund_metrics_summary(p_org_id uuid, p_from_date date, p_to_date date)
 RETURNS TABLE(reason_code text, refund_count bigint, total_amount numeric, credit_quantity bigint, currency text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    r.reason_code::text,
    COUNT(*)                                AS refund_count,
    COALESCE(SUM(r.refund_amount), 0)       AS total_amount,
    COALESCE(SUM(r.credit_quantity), 0)     AS credit_quantity,
    COALESCE(MIN(inv.currency), 'SEK')      AS currency
  FROM   refunds r
  JOIN   invoices inv ON inv.id = r.invoice_id
  WHERE  r.organization_id    = p_org_id
    AND  (p_org_id = public.auth_organization_id() OR public.is_trusted_service_context())
    AND  r.refund_status      = 'completed'
    AND  r.processed_at::date BETWEEN p_from_date AND p_to_date
  GROUP  BY r.reason_code, inv.currency
  ORDER  BY SUM(r.refund_amount) DESC NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.vat_liability_summary(p_org_id uuid, p_from_date date, p_to_date date)
 RETURNS TABLE(month_start date, invoice_count bigint, net_subtotal numeric, total_vat numeric, total_gross numeric, effective_vat_rate numeric, currency text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND  (p_org_id = public.auth_organization_id() OR public.is_trusted_service_context())
    AND  i.issued_at::date  BETWEEN p_from_date AND p_to_date
    AND  i.status IN ('issued', 'paid', 'partially_paid')
  GROUP  BY DATE_TRUNC('month', i.issued_at), i.currency
  ORDER  BY month_start;
$function$;

-- ============================================================================
-- D. GRANTS — PUBLIC, anon, and authenticated explicitly revoked together
--    (Wave 2A lesson); authenticated + service_role granted back (all 10
--    have real `authenticated`-role callers via anon-key + forwarded-header
--    Edge Functions, confirmed by reading reports/index.ts,
--    reconciliation/index.ts, payroll/index.ts, ledger-replay/index.ts,
--    financial-close/index.ts directly).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.finance_dashboard_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_dashboard_snapshot(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.validate_balance_reconstruction(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_balance_reconstruction(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.validate_opening_balances(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_opening_balances(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_reconciliation_report(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_reconciliation_report(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_aging_report(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_aging_report(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_vat_summary(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vat_summary(uuid, date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.overdue_invoice_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overdue_invoice_summary(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.payment_reconciliation_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_reconciliation_summary(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.refund_metrics_summary(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_metrics_summary(uuid, date, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.vat_liability_summary(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vat_liability_summary(uuid, date, date) TO authenticated, service_role;
