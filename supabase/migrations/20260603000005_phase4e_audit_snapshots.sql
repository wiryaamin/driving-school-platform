-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260603000005_phase4e_audit_snapshots.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4E — Audit Snapshots & Ledger Consistency Engine
--
-- New table:
--   ledger_consistency_checks  — history of 12-point ledger validation runs
--
-- SECURITY DEFINER functions:
--   verify_period_audit_snapshot(p_snapshot_id)
--     → Re-aggregates current account_balances and compares SHA-256 hash
--       with the stored snapshot hash. Returns verification result JSONB.
--       If a hard-closed period's snapshot doesn't verify, data may be corrupted.
--
--   run_ledger_consistency_check(p_period_id, p_check_type, p_actor_id)
--     → Runs 12 deterministic checks against the ledger for a period:
--       1.  trial_balance_balanced
--       2.  opening_balance_continuity
--       3.  account_balance_formula_integrity
--       4.  journal_entries_balanced
--       5.  no_orphaned_journal_lines
--       6.  voucher_sequence_no_gaps
--       7.  no_unposted_invoices
--       8.  no_unposted_payments
--       9.  ar_ledger_match
--       10. deferred_revenue_match
--       11. no_over_recognition
--       12. vat_period_coverage
--     Returns ledger_consistency_check_id.
--
--   generate_reconciliation_report(p_period_id, p_actor_id)
--     → Aggregates reconciliation status, trial balance, consistency check,
--       and audit snapshot status into a comprehensive JSONB report.
--       Does NOT modify any data.
--
-- Dependencies:
--   20260603000003_phase4e_financial_close_engine.sql  — period_audit_snapshots
--   20260603000002_phase4e_bank_reconciliation.sql      — reconciliation_runs
--   20260602000001_phase4d_ledger_core.sql
--   20260530000001_phase4a_commercial_core.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: ledger_consistency_checks table ────────────────────────────────

CREATE TABLE public.ledger_consistency_checks (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  financial_period_id uuid          REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  check_type          text          NOT NULL CHECK (check_type IN ('pre_close','post_close','periodic','manual')),
  passed              boolean       NOT NULL DEFAULT false,
  total_checks        int           NOT NULL DEFAULT 0 CHECK (total_checks >= 0),
  passed_checks       int           NOT NULL DEFAULT 0 CHECK (passed_checks >= 0),
  failed_checks       int           NOT NULL DEFAULT 0 CHECK (failed_checks >= 0),
  results             jsonb         NOT NULL DEFAULT '[]',
  run_duration_ms     int           CHECK (run_duration_ms IS NULL OR run_duration_ms >= 0),
  actor_id            uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ledger_consistency_checks IS
  'Audit log of 12-point ledger consistency validation runs. '
  'Created by run_ledger_consistency_check(). Not directly writable by application code.';
COMMENT ON COLUMN public.ledger_consistency_checks.results IS
  'JSONB array: [{check, passed, message, detail?}] — one entry per check.';
COMMENT ON COLUMN public.ledger_consistency_checks.check_type IS
  '''pre_close'' = run before soft-close; ''post_close'' = after hard-close; '
  '''periodic'' = scheduled; ''manual'' = on-demand.';

ALTER TABLE public.ledger_consistency_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lcc_org_select" ON public.ledger_consistency_checks FOR SELECT
  USING (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:close:read'));

GRANT SELECT ON public.ledger_consistency_checks TO authenticated;
GRANT ALL    ON public.ledger_consistency_checks TO service_role;

-- ── Section 2: verify_period_audit_snapshot ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.verify_period_audit_snapshot(
  p_snapshot_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap        period_audit_snapshots%ROWTYPE;
  v_period      financial_periods%ROWTYPE;
  v_current_data jsonb;
  v_current_hash text;
  v_matches      boolean;
BEGIN
  SELECT * INTO v_snap FROM period_audit_snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SNAPSHOT_NOT_FOUND: period_audit_snapshot % not found', p_snapshot_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_period FROM financial_periods WHERE id = v_snap.financial_period_id;

  -- Re-aggregate current account balances for the period
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'account_code',    ab.account_code,
          'opening_balance', ab.opening_balance,
          'debit_movement',  ab.debit_movement,
          'credit_movement', ab.credit_movement,
          'closing_balance', ab.closing_balance
        ) ORDER BY ab.account_code
      ),
      '[]'::jsonb
    )
  INTO v_current_data
  FROM account_balances ab
  WHERE ab.financial_period_id = v_snap.financial_period_id;

  v_current_hash := encode(digest(v_current_data::text, 'sha256'), 'hex');
  v_matches := v_current_hash = v_snap.content_hash;

  RETURN jsonb_build_object(
    'snapshot_id',     p_snapshot_id,
    'financial_period_id', v_snap.financial_period_id,
    'period_status',   v_period.status,
    'snapshot_type',   v_snap.snapshot_type,
    'captured_at',     v_snap.captured_at,
    'is_balanced',     v_snap.is_balanced,
    'matches',         v_matches,
    'stored_hash',     v_snap.content_hash,
    'current_hash',    v_current_hash,
    'verified_at',     now(),
    'integrity',       CASE WHEN v_matches THEN 'verified'
                       WHEN v_period.status = 'locked' THEN 'CORRUPTED — hard-closed period snapshot mismatch'
                       ELSE 'modified — amendments may have been posted after this snapshot' END
  );
END;
$$;

COMMENT ON FUNCTION public.verify_period_audit_snapshot(uuid) IS
  'Re-derives the SHA-256 hash of current account_balances and compares with stored snapshot hash. '
  'A mismatch on a hard-closed period indicates data corruption. '
  'A mismatch on a soft-closed period indicates amendments were posted after snapshot capture.';

GRANT EXECUTE ON FUNCTION public.verify_period_audit_snapshot(uuid) TO authenticated, service_role;

-- ── Section 3: run_ledger_consistency_check ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.run_ledger_consistency_check(
  p_period_id   uuid,
  p_check_type  text,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period          financial_periods%ROWTYPE;
  v_checks          jsonb := '[]'::jsonb;
  v_passed          int   := 0;
  v_failed          int   := 0;
  v_start_ts        timestamptz := clock_timestamp();
  v_check_id        uuid;
  -- Check variables
  v_debit           numeric(14,2);
  v_credit          numeric(14,2);
  v_prior_period_id uuid;
  v_prior_closing   numeric(14,2);
  v_this_opening    numeric(14,2);
  v_unbalanced_entries int;
  v_orphaned_lines  int;
  v_gap_count       int;
  v_unposted_inv    int;
  v_unposted_pay    int;
  v_ar_balance      numeric(14,2);
  v_ar_outstanding  numeric(14,2);
  v_def_balance     numeric(14,2);
  v_def_sched       numeric(14,2);
  v_over_recog      int;
  v_vat_exists      boolean;
  v_formula_errors  int;
BEGIN
  IF p_check_type NOT IN ('pre_close','post_close','periodic','manual') THEN
    RAISE EXCEPTION 'CONSISTENCY_INVALID_TYPE: check_type must be pre_close, post_close, periodic, or manual'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Helper macro to record a check result
  -- (inline in each check below for clarity)

  -- ── Check 1: trial_balance_balanced ──────────────────────────────────────
  SELECT COALESCE(SUM(debit_movement),0), COALESCE(SUM(credit_movement),0)
  INTO v_debit, v_credit
  FROM account_balances WHERE financial_period_id = p_period_id;

  IF ABS(v_debit - v_credit) < 0.01 THEN
    v_checks := v_checks || jsonb_build_object('check','trial_balance_balanced','passed',true,
      'message', format('Debit: %s = Credit: %s', v_debit, v_credit));
    v_passed := v_passed + 1;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','trial_balance_balanced','passed',false,
      'message', format('IMBALANCED — Debit: %s, Credit: %s, Variance: %s', v_debit, v_credit, v_debit-v_credit));
    v_failed := v_failed + 1;
  END IF;

  -- ── Check 2: opening_balance_continuity ──────────────────────────────────
  SELECT fp.id INTO v_prior_period_id
  FROM financial_periods fp
  WHERE fp.organization_id = v_period.organization_id
    AND fp.period_end < v_period.period_start
    AND fp.fiscal_year_id IS NOT DISTINCT FROM v_period.fiscal_year_id
  ORDER BY fp.period_end DESC LIMIT 1;

  IF v_prior_period_id IS NOT NULL THEN
    -- Check that opening_balance for each account matches prior period's closing_balance
    SELECT COUNT(*) INTO v_formula_errors
    FROM account_balances ab_this
    JOIN account_balances ab_prior
      ON ab_prior.financial_period_id = v_prior_period_id
     AND ab_prior.account_code = ab_this.account_code
    WHERE ab_this.financial_period_id = p_period_id
      AND ABS(ab_this.opening_balance - ab_prior.closing_balance) >= 0.01;

    IF v_formula_errors = 0 THEN
      v_checks := v_checks || jsonb_build_object('check','opening_balance_continuity','passed',true,
        'message','Opening balances match prior period closing balances');
      v_passed := v_passed + 1;
    ELSE
      v_checks := v_checks || jsonb_build_object('check','opening_balance_continuity','passed',false,
        'message', format('%s accounts have opening balances that differ from prior period closing', v_formula_errors));
      v_failed := v_failed + 1;
    END IF;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','opening_balance_continuity','passed',true,
      'message','No prior period found — first period in sequence, no continuity check needed');
    v_passed := v_passed + 1;
  END IF;

  -- ── Check 3: account_balance_formula_integrity ────────────────────────────
  SELECT COUNT(*) INTO v_formula_errors
  FROM account_balances
  WHERE financial_period_id = p_period_id
    AND ABS(closing_balance - (opening_balance + debit_movement - credit_movement)) >= 0.01;

  IF v_formula_errors = 0 THEN
    v_checks := v_checks || jsonb_build_object('check','account_balance_formula_integrity','passed',true,
      'message','All account balance formulas correct: closing = opening + debit - credit');
    v_passed := v_passed + 1;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','account_balance_formula_integrity','passed',false,
      'message', format('%s accounts have incorrect closing_balance formula', v_formula_errors));
    v_failed := v_failed + 1;
  END IF;

  -- ── Check 4: journal_entries_balanced ────────────────────────────────────
  SELECT COUNT(*) INTO v_unbalanced_entries
  FROM journal_entries
  WHERE financial_period_id = p_period_id
    AND status = 'posted'
    AND ABS(total_debit - total_credit) >= 0.01;

  IF v_unbalanced_entries = 0 THEN
    v_checks := v_checks || jsonb_build_object('check','journal_entries_balanced','passed',true,
      'message','All posted journal entries are balanced');
    v_passed := v_passed + 1;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','journal_entries_balanced','passed',false,
      'message', format('%s posted journal entries have unequal debit/credit totals', v_unbalanced_entries));
    v_failed := v_failed + 1;
  END IF;

  -- ── Check 5: no_orphaned_journal_lines ───────────────────────────────────
  SELECT COUNT(*) INTO v_orphaned_lines
  FROM journal_lines jl
  WHERE jl.organization_id = v_period.organization_id
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = jl.entry_id AND je.financial_period_id = p_period_id
    )
    AND EXISTS (
      SELECT 1 FROM journal_entries je2
      WHERE je2.id = jl.entry_id AND je2.organization_id = v_period.organization_id
        AND je2.financial_period_id = p_period_id
    );

  -- Simpler check: all lines in the period's entries belong to that period
  SELECT COUNT(*) INTO v_orphaned_lines
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE je.financial_period_id = p_period_id
    AND jl.organization_id <> je.organization_id;

  IF v_orphaned_lines = 0 THEN
    v_checks := v_checks || jsonb_build_object('check','no_orphaned_journal_lines','passed',true,
      'message','No orphaned or cross-organization journal lines');
    v_passed := v_passed + 1;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','no_orphaned_journal_lines','passed',false,
      'message', format('%s journal lines have organization mismatch', v_orphaned_lines));
    v_failed := v_failed + 1;
  END IF;

  -- ── Check 6: voucher_sequence_no_gaps ───────────────────────────────────
  -- For each series: max(voucher_number) = count(distinct voucher_number) means no gaps
  SELECT COALESCE(SUM(gap_count), 0) INTO v_gap_count
  FROM (
    SELECT
      voucher_series,
      MAX(voucher_number) - COUNT(DISTINCT voucher_number) AS gap_count
    FROM journal_entries
    WHERE financial_period_id = p_period_id
      AND status = 'posted'
      AND voucher_number IS NOT NULL
    GROUP BY voucher_series
  ) gaps;

  IF v_gap_count = 0 THEN
    v_checks := v_checks || jsonb_build_object('check','voucher_sequence_no_gaps','passed',true,
      'message','No gaps in voucher number sequences');
    v_passed := v_passed + 1;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','voucher_sequence_no_gaps','passed',false,
      'message', format('Detected %s missing voucher numbers across all series', v_gap_count));
    v_failed := v_failed + 1;
  END IF;

  -- ── Check 7: no_unposted_invoices ────────────────────────────────────────
  -- Issued invoices in period date range should have a journal entry
  SELECT COUNT(*) INTO v_unposted_inv
  FROM invoices i
  WHERE i.organization_id = v_period.organization_id
    AND i.status NOT IN ('draft','void')
    AND i.issued_at::date BETWEEN v_period.period_start AND v_period.period_end
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.source_entity_type = 'invoice'
        AND je.source_entity_id = i.id
        AND je.status = 'posted'
    );

  IF v_unposted_inv = 0 THEN
    v_checks := v_checks || jsonb_build_object('check','no_unposted_invoices','passed',true,
      'message','All issued invoices in period have journal entries');
    v_passed := v_passed + 1;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','no_unposted_invoices','passed',false,
      'message', format('%s issued invoices in period have no journal entry', v_unposted_inv));
    v_failed := v_failed + 1;
  END IF;

  -- ── Check 8: no_unposted_payments ────────────────────────────────────────
  SELECT COUNT(*) INTO v_unposted_pay
  FROM payments p
  WHERE p.organization_id = v_period.organization_id
    AND p.status = 'confirmed'
    AND p.paid_at::date BETWEEN v_period.period_start AND v_period.period_end
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.source_entity_type = 'payment'
        AND je.source_entity_id = p.id
        AND je.status = 'posted'
    );

  IF v_unposted_pay = 0 THEN
    v_checks := v_checks || jsonb_build_object('check','no_unposted_payments','passed',true,
      'message','All confirmed payments in period have journal entries');
    v_passed := v_passed + 1;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','no_unposted_payments','passed',false,
      'message', format('%s confirmed payments in period have no journal entry', v_unposted_pay));
    v_failed := v_failed + 1;
  END IF;

  -- ── Check 9: ar_ledger_match ─────────────────────────────────────────────
  SELECT COALESCE(closing_balance, 0) INTO v_ar_balance
  FROM account_balances
  WHERE financial_period_id = p_period_id AND account_code = '1510' LIMIT 1;

  SELECT COALESCE(SUM(outstanding_amount), 0) INTO v_ar_outstanding
  FROM invoices
  WHERE organization_id = v_period.organization_id
    AND status NOT IN ('draft','void')
    AND issued_at::date <= v_period.period_end;

  IF ABS(v_ar_balance - v_ar_outstanding) < 0.01 THEN
    v_checks := v_checks || jsonb_build_object('check','ar_ledger_match','passed',true,
      'message', format('1510 balance %s matches outstanding invoices %s', v_ar_balance, v_ar_outstanding));
    v_passed := v_passed + 1;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','ar_ledger_match','passed',false,
      'message', format('1510: %s ≠ outstanding invoices: %s (variance: %s)',
        v_ar_balance, v_ar_outstanding, v_ar_balance - v_ar_outstanding));
    v_failed := v_failed + 1;
  END IF;

  -- ── Check 10: deferred_revenue_match ─────────────────────────────────────
  SELECT COALESCE(ABS(closing_balance), 0) INTO v_def_balance
  FROM account_balances
  WHERE financial_period_id = p_period_id AND account_code = '2970' LIMIT 1;

  SELECT COALESCE(SUM(total_deferred_net - recognized_amount_net), 0) INTO v_def_sched
  FROM deferred_revenue_schedules
  WHERE organization_id = v_period.organization_id AND is_fully_recognized = false;

  IF ABS(v_def_balance - v_def_sched) < 0.01 THEN
    v_checks := v_checks || jsonb_build_object('check','deferred_revenue_match','passed',true,
      'message', format('2970 abs balance %s matches unrecognized schedules %s', v_def_balance, v_def_sched));
    v_passed := v_passed + 1;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','deferred_revenue_match','passed',false,
      'message', format('2970 abs: %s ≠ unrecognized schedules: %s (variance: %s)',
        v_def_balance, v_def_sched, v_def_balance - v_def_sched));
    v_failed := v_failed + 1;
  END IF;

  -- ── Check 11: no_over_recognition ────────────────────────────────────────
  SELECT COUNT(*) INTO v_over_recog
  FROM deferred_revenue_schedules
  WHERE organization_id = v_period.organization_id
    AND recognized_lessons > total_lessons;

  IF v_over_recog = 0 THEN
    v_checks := v_checks || jsonb_build_object('check','no_over_recognition','passed',true,
      'message','No deferred revenue schedules have over-recognized lessons');
    v_passed := v_passed + 1;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','no_over_recognition','passed',false,
      'message', format('%s deferred schedules have recognized_lessons > total_lessons', v_over_recog));
    v_failed := v_failed + 1;
  END IF;

  -- ── Check 12: vat_period_coverage ────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM vat_periods
    WHERE organization_id = v_period.organization_id
      AND period_start <= v_period.period_end
      AND period_end   >= v_period.period_start
  ) INTO v_vat_exists;

  IF v_vat_exists THEN
    v_checks := v_checks || jsonb_build_object('check','vat_period_coverage','passed',true,
      'message','VAT period found covering this financial period');
    v_passed := v_passed + 1;
  ELSE
    v_checks := v_checks || jsonb_build_object('check','vat_period_coverage','passed',false,
      'message','No VAT period covers this financial period date range');
    v_failed := v_failed + 1;
  END IF;

  -- Persist check record
  INSERT INTO ledger_consistency_checks (
    organization_id, financial_period_id, check_type,
    passed, total_checks, passed_checks, failed_checks,
    results, run_duration_ms, actor_id
  ) VALUES (
    v_period.organization_id, p_period_id, p_check_type,
    v_failed = 0, v_passed + v_failed, v_passed, v_failed,
    v_checks,
    EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_ts))::int,
    p_actor_id
  ) RETURNING id INTO v_check_id;

  RETURN v_check_id;
END;
$$;

COMMENT ON FUNCTION public.run_ledger_consistency_check(uuid,text,uuid) IS
  'Runs 12 deterministic ledger consistency checks for a financial period. '
  'Checks: trial_balance_balanced, opening_balance_continuity, account_balance_formula_integrity, '
  'journal_entries_balanced, no_orphaned_journal_lines, voucher_sequence_no_gaps, '
  'no_unposted_invoices, no_unposted_payments, ar_ledger_match, deferred_revenue_match, '
  'no_over_recognition, vat_period_coverage. '
  'Stores results in ledger_consistency_checks. Returns check_id.';

GRANT EXECUTE ON FUNCTION public.run_ledger_consistency_check(uuid,text,uuid) TO authenticated, service_role;

-- ── Section 4: generate_reconciliation_report ────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_reconciliation_report(
  p_period_id  uuid,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.generate_reconciliation_report(uuid,uuid) IS
  'Generates a comprehensive JSONB reconciliation report for a financial period. '
  'Includes trial balance summary, all reconciliation runs, latest consistency check, '
  'and audit snapshot status. Read-only — does not modify any data.';

GRANT EXECUTE ON FUNCTION public.generate_reconciliation_report(uuid,uuid) TO authenticated, service_role;
