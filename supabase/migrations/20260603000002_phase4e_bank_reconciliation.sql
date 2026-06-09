-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260603000002_phase4e_bank_reconciliation.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4E — Bank & Domain Reconciliation Functions
--
-- SECURITY DEFINER functions:
--   import_bank_statement(...)            — import statement header + lines
--   auto_match_bank_lines(...)            — match lines to payments by amount + date
--   manual_match_bank_line(...)           — manually assign a payment to a bank line
--   unmatch_bank_line(...)                — revert a matched line to unmatched
--   confirm_bank_reconciliation(...)      — finalize import; create run + items
--   reconcile_accounts_receivable(...)    — 1510 ledger vs open invoice balances
--   reconcile_vat_period(...)             — 2610 ledger vs VAT period total
--   reconcile_deferred_revenue(...)       — 2970 ledger vs unrecognized schedules
--
-- Views (SECURITY INVOKER):
--   v_bank_reconciliation_summary         — per-import match statistics
--   v_reconciliation_status               — per-period reconciliation coverage
--
-- Matching algorithm for auto_match_bank_lines:
--   For each unmatched bank line with amount > 0 (inflow):
--     Find confirmed payments in the same org with:
--       payment.amount = bank_line.amount
--       payment.paid_at::date BETWEEN line.transaction_date - 5 AND line.transaction_date + 5
--       NOT already matched to another bank line
--     If exactly 1 match: auto-match (status='matched')
--     Otherwise: leave as unmatched
--
-- AR reconciliation formula:
--   ledger_balance (1510 closing) = SUM(invoices.outstanding_amount) for non-void invoices
--   variance = ledger_balance − sum_outstanding
--
-- Deferred revenue reconciliation formula:
--   ledger_balance = account 2970 closing_balance (negative for credit-normal accounts)
--   expected = −SUM(deferred_revenue_schedules.total_deferred_net − recognized_amount_net)
--   variance = ledger_balance − expected
--
-- Dependencies:
--   20260603000001_phase4e_reconciliation_core.sql
--   20260530000001_phase4a_commercial_core.sql  — invoices, payments, financial_periods
--   20260602000001_phase4d_ledger_core.sql      — account_balances
--   20260602000004_phase4d_revenue_recognition.sql — deferred_revenue_schedules
--   20260601000002_phase4c_vat_and_periods.sql  — vat_periods
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. import_bank_statement ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.import_bank_statement(
  p_org_id               uuid,
  p_bank_account_number  text,
  p_bank_name            text,
  p_statement_date       date,
  p_period_start         date,
  p_period_end           date,
  p_opening_balance      numeric,
  p_closing_balance      numeric,
  p_currency             text,
  p_lines                jsonb,
  p_actor_id             uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_import_id  uuid;
  v_line       jsonb;
  v_line_num   int := 1;
BEGIN
  IF p_bank_account_number IS NULL OR p_bank_account_number = '' THEN
    RAISE EXCEPTION 'BANK_RECON_INVALID: bank_account_number is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'BANK_RECON_INVALID_DATES: period_end must be >= period_start' USING ERRCODE = 'P0001';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'BANK_RECON_NO_LINES: at least one bank statement line is required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO bank_statement_imports (
    organization_id, bank_account_number, bank_name, statement_date,
    period_start, period_end, opening_balance, closing_balance, currency,
    total_lines, imported_by
  ) VALUES (
    p_org_id, p_bank_account_number, p_bank_name, p_statement_date,
    p_period_start, p_period_end,
    COALESCE(p_opening_balance, 0), COALESCE(p_closing_balance, 0),
    COALESCE(p_currency, 'SEK'),
    jsonb_array_length(p_lines), p_actor_id
  ) RETURNING id INTO v_import_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'transaction_date') IS NULL THEN
      RAISE EXCEPTION 'BANK_RECON_INVALID_LINE: line % missing transaction_date', v_line_num
        USING ERRCODE = 'P0001';
    END IF;
    IF (v_line->>'amount') IS NULL THEN
      RAISE EXCEPTION 'BANK_RECON_INVALID_LINE: line % missing amount', v_line_num
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO bank_statement_lines (
      organization_id, import_id, line_number,
      transaction_date, value_date, amount, balance_after,
      reference, description, counterpart_name, counterpart_account
    ) VALUES (
      p_org_id, v_import_id, v_line_num,
      (v_line->>'transaction_date')::date,
      NULLIF(v_line->>'value_date',       '')::date,
      (v_line->>'amount')::numeric,
      NULLIF(v_line->>'balance_after',    '')::numeric,
      v_line->>'reference',
      COALESCE(v_line->>'description', ''),
      v_line->>'counterpart_name',
      v_line->>'counterpart_account'
    );
    v_line_num := v_line_num + 1;
  END LOOP;

  RETURN v_import_id;
END;
$$;

COMMENT ON FUNCTION public.import_bank_statement(uuid,text,text,date,date,date,numeric,numeric,text,jsonb,uuid) IS
  'Imports a bank statement header and lines. Returns the import_id. '
  'p_lines format: [{transaction_date, amount, reference?, description?, '
  'value_date?, balance_after?, counterpart_name?, counterpart_account?}]';

GRANT EXECUTE ON FUNCTION public.import_bank_statement(uuid,text,text,date,date,date,numeric,numeric,text,jsonb,uuid)
  TO authenticated, service_role;

-- ── 2. auto_match_bank_lines ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_match_bank_lines(
  p_import_id  uuid,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_import      bank_statement_imports%ROWTYPE;
  v_line        bank_statement_lines%ROWTYPE;
  v_payment_id  uuid;
  v_match_count int := 0;
BEGIN
  SELECT * INTO v_import FROM bank_statement_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_RECON_NOT_FOUND: bank_statement_import % not found', p_import_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_import.status = 'confirmed' THEN
    RAISE EXCEPTION 'BANK_RECON_CONFIRMED: import % is already confirmed; cannot re-match', p_import_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE bank_statement_imports
  SET status = 'reconciling', updated_at = now()
  WHERE id = p_import_id;

  FOR v_line IN
    SELECT * FROM bank_statement_lines
    WHERE import_id = p_import_id
      AND status = 'unmatched'
      AND amount > 0
    ORDER BY transaction_date, line_number
  LOOP
    -- Find exactly one matching confirmed payment not already linked
    SELECT p.id INTO v_payment_id
    FROM payments p
    WHERE p.organization_id = v_import.organization_id
      AND p.status = 'confirmed'
      AND p.amount = v_line.amount
      AND p.paid_at::date BETWEEN v_line.transaction_date - 5 AND v_line.transaction_date + 5
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement_lines bsl2
        WHERE bsl2.payment_id = p.id
          AND bsl2.status IN ('matched', 'confirmed')
          AND bsl2.id <> v_line.id
      )
    ORDER BY ABS(p.paid_at::date - v_line.transaction_date)
    LIMIT 2;  -- fetch up to 2 to detect ambiguous matches

    -- Only auto-match if exactly 1 result (LIMIT 2 lets us detect duplicates via count)
    IF FOUND THEN
      -- v_payment_id is set; check there's only one by trying a second fetch
      DECLARE
        v_second_payment_id uuid;
      BEGIN
        SELECT p.id INTO v_second_payment_id
        FROM payments p
        WHERE p.organization_id = v_import.organization_id
          AND p.status = 'confirmed'
          AND p.amount = v_line.amount
          AND p.paid_at::date BETWEEN v_line.transaction_date - 5 AND v_line.transaction_date + 5
          AND NOT EXISTS (
            SELECT 1 FROM bank_statement_lines bsl2
            WHERE bsl2.payment_id = p.id
              AND bsl2.status IN ('matched', 'confirmed')
              AND bsl2.id <> v_line.id
          )
          AND p.id <> v_payment_id;

        IF NOT FOUND THEN
          -- Exactly one match — auto-match
          UPDATE bank_statement_lines
          SET status       = 'matched',
              payment_id   = v_payment_id,
              match_method = 'automatic',
              matched_at   = now(),
              matched_by   = p_actor_id,
              updated_at   = now()
          WHERE id = v_line.id;
          v_match_count := v_match_count + 1;
        END IF;
      END;
    END IF;
  END LOOP;

  RETURN v_match_count;
END;
$$;

COMMENT ON FUNCTION public.auto_match_bank_lines(uuid,uuid) IS
  'Attempts to auto-match unmatched inflow bank lines to confirmed payments by amount + date proximity (±5 days). '
  'Only matches when exactly one payment candidate exists. Returns count of matched lines.';

GRANT EXECUTE ON FUNCTION public.auto_match_bank_lines(uuid,uuid) TO authenticated, service_role;

-- ── 3. manual_match_bank_line ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.manual_match_bank_line(
  p_line_id    uuid,
  p_payment_id uuid,
  p_notes      text    DEFAULT NULL,
  p_actor_id   uuid    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line    bank_statement_lines%ROWTYPE;
  v_payment payments%ROWTYPE;
BEGIN
  SELECT * INTO v_line FROM bank_statement_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_RECON_LINE_NOT_FOUND: bank statement line % not found', p_line_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_line.status = 'confirmed' THEN
    RAISE EXCEPTION 'BANK_RECON_LINE_CONFIRMED: line % is already confirmed; cannot re-match', p_line_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_RECON_PAYMENT_NOT_FOUND: payment % not found', p_payment_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.organization_id <> v_line.organization_id THEN
    RAISE EXCEPTION 'BANK_RECON_ORG_MISMATCH: payment % belongs to a different organization', p_payment_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE bank_statement_lines
  SET status       = 'matched',
      payment_id   = p_payment_id,
      match_method = 'manual',
      match_notes  = p_notes,
      matched_at   = now(),
      matched_by   = p_actor_id,
      updated_at   = now()
  WHERE id = p_line_id;
END;
$$;

COMMENT ON FUNCTION public.manual_match_bank_line(uuid,uuid,text,uuid) IS
  'Manually assigns a payment to a bank statement line. '
  'Allows matching regardless of amount or date proximity.';

GRANT EXECUTE ON FUNCTION public.manual_match_bank_line(uuid,uuid,text,uuid) TO authenticated, service_role;

-- ── 4. unmatch_bank_line ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unmatch_bank_line(
  p_line_id  uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line bank_statement_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_line FROM bank_statement_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_RECON_LINE_NOT_FOUND: bank statement line % not found', p_line_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_line.status = 'confirmed' THEN
    RAISE EXCEPTION 'BANK_RECON_LINE_CONFIRMED: confirmed line % cannot be unmatched', p_line_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE bank_statement_lines
  SET status       = 'unmatched',
      payment_id   = NULL,
      match_method = NULL,
      match_notes  = NULL,
      matched_at   = NULL,
      matched_by   = NULL,
      updated_at   = now()
  WHERE id = p_line_id;
END;
$$;

COMMENT ON FUNCTION public.unmatch_bank_line(uuid,uuid) IS
  'Reverts a matched or exception bank line back to unmatched status.';

GRANT EXECUTE ON FUNCTION public.unmatch_bank_line(uuid,uuid) TO authenticated, service_role;

-- ── 5. confirm_bank_reconciliation ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_bank_reconciliation(
  p_import_id   uuid,
  p_period_id   uuid,
  p_notes       text DEFAULT NULL,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_import        bank_statement_imports%ROWTYPE;
  v_run_id        uuid;
  v_total         int;
  v_matched       int;
  v_unmatched     int;
  v_exceptions    int;
  v_ignored       int;
  v_line          bank_statement_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_import FROM bank_statement_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_RECON_NOT_FOUND: bank_statement_import % not found', p_import_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_import.status = 'confirmed' THEN
    RAISE EXCEPTION 'BANK_RECON_ALREADY_CONFIRMED: import % is already confirmed', p_import_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Count statuses
  SELECT
    COUNT(*)                                             INTO v_total
  FROM bank_statement_lines WHERE import_id = p_import_id;

  SELECT COUNT(*) INTO v_matched
  FROM bank_statement_lines WHERE import_id = p_import_id AND status IN ('matched','confirmed');

  SELECT COUNT(*) INTO v_unmatched
  FROM bank_statement_lines WHERE import_id = p_import_id AND status = 'unmatched';

  SELECT COUNT(*) INTO v_exceptions
  FROM bank_statement_lines WHERE import_id = p_import_id AND status = 'exception';

  SELECT COUNT(*) INTO v_ignored
  FROM bank_statement_lines WHERE import_id = p_import_id AND status = 'ignored';

  -- Create reconciliation run
  INSERT INTO reconciliation_runs (
    organization_id, financial_period_id, reconciliation_type, status,
    bank_statement_import_id, total_items, matched_items, unmatched_items,
    exception_items, is_reconciled, variance_amount, completed_at, actor_id, notes,
    result_summary
  ) VALUES (
    v_import.organization_id, p_period_id, 'bank', 'confirmed',
    p_import_id, v_total, v_matched, v_unmatched,
    v_exceptions,
    (v_unmatched = 0 AND v_exceptions = 0),
    NULL, now(), p_actor_id, p_notes,
    jsonb_build_object(
      'total_lines',     v_total,
      'matched_lines',   v_matched,
      'unmatched_lines', v_unmatched,
      'exception_lines', v_exceptions,
      'ignored_lines',   v_ignored,
      'is_complete',     (v_unmatched = 0 AND v_exceptions = 0)
    )
  ) RETURNING id INTO v_run_id;

  -- Create reconciliation_items for each matched line
  FOR v_line IN
    SELECT * FROM bank_statement_lines
    WHERE import_id = p_import_id AND status IN ('matched','confirmed') AND payment_id IS NOT NULL
  LOOP
    INSERT INTO reconciliation_items (
      organization_id, run_id,
      ledger_entity_type, ledger_entity_id,
      external_entity_type, external_entity_id,
      external_reference,
      ledger_amount, external_amount, variance,
      status, match_method, matched_at, matched_by, notes
    )
    SELECT
      v_import.organization_id,
      v_run_id,
      'payment',
      v_line.payment_id,
      'bank_statement_line',
      v_line.id,
      v_line.reference,
      p.amount,
      v_line.amount,
      p.amount - v_line.amount,
      CASE WHEN ABS(p.amount - v_line.amount) < 0.01 THEN 'matched' ELSE 'exception' END,
      v_line.match_method,
      v_line.matched_at,
      v_line.matched_by,
      v_line.match_notes
    FROM payments p
    WHERE p.id = v_line.payment_id;

    -- Confirm the line
    UPDATE bank_statement_lines
    SET status = 'confirmed', updated_at = now()
    WHERE id = v_line.id;
  END LOOP;

  -- Finalize import
  UPDATE bank_statement_imports
  SET status       = 'confirmed',
      confirmed_at = now(),
      confirmed_by = p_actor_id,
      updated_at   = now()
  WHERE id = p_import_id;

  RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION public.confirm_bank_reconciliation(uuid,uuid,text,uuid) IS
  'Finalizes a bank statement reconciliation: creates a reconciliation_run record, '
  'creates reconciliation_items for all matched lines, confirms the import. '
  'Returns the reconciliation_run_id.';

GRANT EXECUTE ON FUNCTION public.confirm_bank_reconciliation(uuid,uuid,text,uuid) TO authenticated, service_role;

-- ── 6. reconcile_accounts_receivable ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reconcile_accounts_receivable(
  p_period_id  uuid,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period          financial_periods%ROWTYPE;
  v_ledger_balance  numeric(14,2) := 0;
  v_invoice_total   numeric(14,2) := 0;
  v_variance        numeric(14,2);
  v_is_reconciled   boolean;
  v_run_id          uuid;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Get account 1510 (Kundfordringar) closing balance
  SELECT COALESCE(closing_balance, 0) INTO v_ledger_balance
  FROM account_balances
  WHERE financial_period_id = p_period_id
    AND account_code = '1510'
  LIMIT 1;

  -- Sum of outstanding invoice amounts (non-draft, non-void) up to period end
  SELECT COALESCE(SUM(outstanding_amount), 0) INTO v_invoice_total
  FROM invoices
  WHERE organization_id = v_period.organization_id
    AND status NOT IN ('draft', 'void')
    AND issued_at::date <= v_period.period_end;

  v_variance      := v_ledger_balance - v_invoice_total;
  v_is_reconciled := ABS(v_variance) < 0.01;

  INSERT INTO reconciliation_runs (
    organization_id, financial_period_id, reconciliation_type, status,
    total_items, matched_items, unmatched_items, exception_items,
    is_reconciled, variance_amount, completed_at, actor_id,
    result_summary
  ) VALUES (
    v_period.organization_id, p_period_id, 'accounts_receivable',
    CASE WHEN v_is_reconciled THEN 'completed' ELSE 'needs_review' END,
    1, CASE WHEN v_is_reconciled THEN 1 ELSE 0 END,
    CASE WHEN v_is_reconciled THEN 0 ELSE 1 END, 0,
    v_is_reconciled, v_variance, now(), p_actor_id,
    jsonb_build_object(
      'ledger_account',    '1510',
      'ledger_balance',    v_ledger_balance,
      'invoice_outstanding', v_invoice_total,
      'variance',          v_variance,
      'is_reconciled',     v_is_reconciled,
      'period_end',        v_period.period_end
    )
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION public.reconcile_accounts_receivable(uuid,uuid) IS
  'Compares ledger account 1510 (Kundfordringar) closing balance with the sum of outstanding '
  'invoice balances. Variance < 0.01 SEK is considered reconciled. Returns reconciliation_run_id.';

GRANT EXECUTE ON FUNCTION public.reconcile_accounts_receivable(uuid,uuid) TO authenticated, service_role;

-- ── 7. reconcile_vat_period ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reconcile_vat_period(
  p_vat_period_id       uuid,
  p_financial_period_id uuid,
  p_actor_id            uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fp              financial_periods%ROWTYPE;
  v_vat             vat_periods%ROWTYPE;
  v_ledger_balance  numeric(14,2) := 0;
  v_vat_total       numeric(14,2) := 0;
  v_variance        numeric(14,2);
  v_is_reconciled   boolean;
  v_run_id          uuid;
BEGIN
  SELECT * INTO v_fp FROM financial_periods WHERE id = p_financial_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_financial_period_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_vat FROM vat_periods WHERE id = p_vat_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT_PERIOD_NOT_FOUND: VAT period % not found', p_vat_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_vat.organization_id <> v_fp.organization_id THEN
    RAISE EXCEPTION 'VAT_RECON_ORG_MISMATCH: VAT period and financial period belong to different organizations'
      USING ERRCODE = 'P0001';
  END IF;

  -- Account 2610 (Utgående moms 25%) — credit-normal, so closing_balance is negative
  -- ABS(closing_balance) = total output VAT in ledger
  SELECT COALESCE(ABS(closing_balance), 0) INTO v_ledger_balance
  FROM account_balances
  WHERE financial_period_id = p_financial_period_id
    AND account_code = '2610'
  LIMIT 1;

  v_vat_total     := COALESCE(v_vat.total_output_vat, 0);
  v_variance      := v_ledger_balance - v_vat_total;
  v_is_reconciled := ABS(v_variance) < 0.01;

  INSERT INTO reconciliation_runs (
    organization_id, financial_period_id, reconciliation_type, status,
    total_items, matched_items, unmatched_items, exception_items,
    is_reconciled, variance_amount, completed_at, actor_id,
    result_summary
  ) VALUES (
    v_fp.organization_id, p_financial_period_id, 'vat',
    CASE WHEN v_is_reconciled THEN 'completed' ELSE 'needs_review' END,
    1, CASE WHEN v_is_reconciled THEN 1 ELSE 0 END,
    CASE WHEN v_is_reconciled THEN 0 ELSE 1 END, 0,
    v_is_reconciled, v_variance, now(), p_actor_id,
    jsonb_build_object(
      'ledger_account',     '2610',
      'ledger_vat_balance', v_ledger_balance,
      'vat_period_total',   v_vat_total,
      'vat_period_status',  v_vat.status,
      'variance',           v_variance,
      'is_reconciled',      v_is_reconciled
    )
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION public.reconcile_vat_period(uuid,uuid,uuid) IS
  'Compares ledger account 2610 (Utgående moms 25%) absolute closing balance '
  'with the total_output_vat from the VAT period. Returns reconciliation_run_id.';

GRANT EXECUTE ON FUNCTION public.reconcile_vat_period(uuid,uuid,uuid) TO authenticated, service_role;

-- ── 8. reconcile_deferred_revenue ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reconcile_deferred_revenue(
  p_period_id  uuid,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period          financial_periods%ROWTYPE;
  v_ledger_balance  numeric(14,2) := 0;
  v_schedule_total  numeric(14,2) := 0;
  v_variance        numeric(14,2);
  v_is_reconciled   boolean;
  v_run_id          uuid;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Account 2970 (Förutbetalda intäkter) — credit-normal (liability), closing_balance is negative
  -- ABS(closing_balance) = total deferred obligation in ledger
  SELECT COALESCE(ABS(closing_balance), 0) INTO v_ledger_balance
  FROM account_balances
  WHERE financial_period_id = p_period_id
    AND account_code = '2970'
  LIMIT 1;

  -- Sum of unrecognized deferred revenue across all active schedules
  SELECT COALESCE(SUM(total_deferred_net - recognized_amount_net), 0) INTO v_schedule_total
  FROM deferred_revenue_schedules
  WHERE organization_id = v_period.organization_id
    AND is_fully_recognized = false;

  v_variance      := v_ledger_balance - v_schedule_total;
  v_is_reconciled := ABS(v_variance) < 0.01;

  INSERT INTO reconciliation_runs (
    organization_id, financial_period_id, reconciliation_type, status,
    total_items, matched_items, unmatched_items, exception_items,
    is_reconciled, variance_amount, completed_at, actor_id,
    result_summary
  ) VALUES (
    v_period.organization_id, p_period_id, 'deferred_revenue',
    CASE WHEN v_is_reconciled THEN 'completed' ELSE 'needs_review' END,
    1, CASE WHEN v_is_reconciled THEN 1 ELSE 0 END,
    CASE WHEN v_is_reconciled THEN 0 ELSE 1 END, 0,
    v_is_reconciled, v_variance, now(), p_actor_id,
    jsonb_build_object(
      'ledger_account',         '2970',
      'ledger_deferred_balance', v_ledger_balance,
      'schedule_unrecognized',   v_schedule_total,
      'variance',                v_variance,
      'is_reconciled',           v_is_reconciled
    )
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION public.reconcile_deferred_revenue(uuid,uuid) IS
  'Compares ledger account 2970 (Förutbetalda intäkter) absolute closing balance '
  'with the total unrecognized amount across deferred_revenue_schedules. '
  'Returns reconciliation_run_id.';

GRANT EXECUTE ON FUNCTION public.reconcile_deferred_revenue(uuid,uuid) TO authenticated, service_role;

-- ── 9. v_bank_reconciliation_summary ─────────────────────────────────────────

CREATE VIEW public.v_bank_reconciliation_summary
WITH (security_invoker = true)
AS
SELECT
  bsi.id                  AS import_id,
  bsi.organization_id,
  bsi.bank_account_number,
  bsi.bank_name,
  bsi.period_start,
  bsi.period_end,
  bsi.statement_date,
  bsi.opening_balance,
  bsi.closing_balance,
  bsi.currency,
  bsi.total_lines,
  bsi.status,
  bsi.imported_at,
  bsi.confirmed_at,
  COUNT(bsl.id)                                         AS line_count,
  COUNT(bsl.id) FILTER (WHERE bsl.status = 'matched')   AS matched_count,
  COUNT(bsl.id) FILTER (WHERE bsl.status = 'confirmed') AS confirmed_count,
  COUNT(bsl.id) FILTER (WHERE bsl.status = 'unmatched') AS unmatched_count,
  COUNT(bsl.id) FILTER (WHERE bsl.status = 'exception') AS exception_count,
  COUNT(bsl.id) FILTER (WHERE bsl.status = 'ignored')   AS ignored_count,
  ROUND(
    COUNT(bsl.id) FILTER (WHERE bsl.status IN ('matched','confirmed','ignored')) * 100.0
    / NULLIF(COUNT(bsl.id), 0), 1
  )                                                     AS match_percentage
FROM public.bank_statement_imports bsi
LEFT JOIN public.bank_statement_lines bsl ON bsl.import_id = bsi.id
GROUP BY
  bsi.id, bsi.organization_id, bsi.bank_account_number, bsi.bank_name,
  bsi.period_start, bsi.period_end, bsi.statement_date,
  bsi.opening_balance, bsi.closing_balance, bsi.currency, bsi.total_lines,
  bsi.status, bsi.imported_at, bsi.confirmed_at;

COMMENT ON VIEW public.v_bank_reconciliation_summary IS
  'Per-import bank reconciliation statistics. SECURITY INVOKER — RLS on underlying tables.';

GRANT SELECT ON public.v_bank_reconciliation_summary TO authenticated, service_role;

-- ── 10. v_reconciliation_status ──────────────────────────────────────────────

CREATE VIEW public.v_reconciliation_status
WITH (security_invoker = true)
AS
SELECT
  fp.id                AS period_id,
  fp.organization_id,
  fp.name              AS period_name,
  fp.period_start,
  fp.period_end,
  fp.status            AS period_status,
  -- Latest run per reconciliation type
  MAX(rr.started_at) FILTER (WHERE rr.reconciliation_type = 'bank')                AS bank_last_run,
  BOOL_OR(rr.is_reconciled)  FILTER (WHERE rr.reconciliation_type = 'bank')        AS bank_reconciled,
  MAX(rr.started_at) FILTER (WHERE rr.reconciliation_type = 'accounts_receivable') AS ar_last_run,
  BOOL_OR(rr.is_reconciled)  FILTER (WHERE rr.reconciliation_type = 'accounts_receivable') AS ar_reconciled,
  MAX(rr.started_at) FILTER (WHERE rr.reconciliation_type = 'vat')                 AS vat_last_run,
  BOOL_OR(rr.is_reconciled)  FILTER (WHERE rr.reconciliation_type = 'vat')         AS vat_reconciled,
  MAX(rr.started_at) FILTER (WHERE rr.reconciliation_type = 'deferred_revenue')    AS deferred_last_run,
  BOOL_OR(rr.is_reconciled)  FILTER (WHERE rr.reconciliation_type = 'deferred_revenue') AS deferred_reconciled
FROM public.financial_periods fp
LEFT JOIN public.reconciliation_runs rr
  ON rr.financial_period_id = fp.id
  AND rr.organization_id = fp.organization_id
GROUP BY fp.id, fp.organization_id, fp.name, fp.period_start, fp.period_end, fp.status;

COMMENT ON VIEW public.v_reconciliation_status IS
  'Per-period reconciliation coverage summary across all four reconciliation types. '
  'SECURITY INVOKER — RLS enforced via underlying tables.';

GRANT SELECT ON public.v_reconciliation_status TO authenticated, service_role;
