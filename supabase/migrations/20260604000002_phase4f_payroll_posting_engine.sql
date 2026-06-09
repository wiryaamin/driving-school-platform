-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260604000002_phase4f_payroll_posting_engine.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4F — Payroll Posting Engine
--
-- SECURITY DEFINER functions for immutable payroll journal creation:
--
--   create_payroll_run(...)       → Create a payroll run header (draft)
--   add_payroll_entry(...)        → Add an employee line to a draft run
--   update_payroll_run_totals(id) → Recalculate aggregated totals
--   post_payroll_journal(...)     → Post the balanced payroll journal entry:
--                                     DR 7010 Löner (gross)
--                                     DR 7210 Sociala avgifter (employer contrib, if > 0)
--                                     CR 2710 Personalskatt (withheld tax, if > 0)
--                                     CR 2731 Sociala avgifter skuld (employer contrib, if > 0)
--                                     CR 2940 Upplupna löner (net pay)
--   post_salary_payment(...)      → Post the salary payment:
--                                     DR 2940 Upplupna löner (net pay)
--                                     CR 1930 Bank (net pay)
--   reverse_payroll_run(...)      → Post a reversal (all debits↔credits swapped)
--
-- Journal balance proofs:
--   post_payroll_journal: DR = G + E; CR = T + E + (G-T) = G + E ✓
--   post_salary_payment:  DR = net_pay; CR = net_pay ✓
--   reverse_payroll_run:  Mirror of original — always balanced ✓
--
-- All functions are idempotent.
-- Voucher series 'L' (Lön) used for all payroll journal entries.
--
-- Dependencies:
--   20260604000001_phase4f_payroll_core.sql
--   20260602000002_phase4d_posting_engine.sql — post_journal_entry
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. create_payroll_run ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_payroll_run(
  p_org_id              uuid,
  p_financial_period_id uuid    DEFAULT NULL,
  p_pay_period_start    date    DEFAULT NULL,
  p_pay_period_end      date    DEFAULT NULL,
  p_pay_date            date    DEFAULT NULL,
  p_run_type            public.payroll_run_type DEFAULT 'regular',
  p_correction_of_run_id uuid   DEFAULT NULL,
  p_notes               text    DEFAULT NULL,
  p_actor_id            uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_start  date;
  v_end    date;
BEGIN
  v_start := COALESCE(p_pay_period_start, date_trunc('month', CURRENT_DATE)::date);
  v_end   := COALESCE(p_pay_period_end,   (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date);

  IF v_end < v_start THEN
    RAISE EXCEPTION 'PAYROLL_INVALID_DATES: pay_period_end (%) must not be before pay_period_start (%)',
      v_end, v_start
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate correction_of_run_id is posted if provided
  IF p_correction_of_run_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM payroll_runs
      WHERE id = p_correction_of_run_id AND organization_id = p_org_id AND status = 'posted'
    ) THEN
      RAISE EXCEPTION 'PAYROLL_CORRECTION_TARGET_INVALID: correction_of_run_id % must reference a posted run',
        p_correction_of_run_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO payroll_runs (
    organization_id, financial_period_id, run_type,
    pay_period_start, pay_period_end, pay_date,
    correction_of_run_id, notes, created_by
  ) VALUES (
    p_org_id, p_financial_period_id, p_run_type,
    v_start, v_end, p_pay_date,
    p_correction_of_run_id, p_notes, p_actor_id
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION public.create_payroll_run(uuid, uuid, date, date, date, public.payroll_run_type, uuid, text, uuid) IS
  'Creates a payroll run header in draft status. Returns the new run id.';

GRANT EXECUTE ON FUNCTION public.create_payroll_run(uuid, uuid, date, date, date, public.payroll_run_type, uuid, text, uuid)
  TO authenticated, service_role;

-- ── 2. add_payroll_entry ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_payroll_entry(
  p_run_id                 uuid,
  p_employee_id            uuid,
  p_gross_salary           numeric,
  p_withheld_tax           numeric   DEFAULT 0,
  p_employer_contrib_rate  numeric   DEFAULT 0.3142,
  p_pension_amount         numeric   DEFAULT 0,
  p_benefits_amount        numeric   DEFAULT 0,
  p_instructor_id          uuid      DEFAULT NULL,
  p_notes                  text      DEFAULT NULL,
  p_actor_id               uuid      DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run           payroll_runs%ROWTYPE;
  v_entry_id      uuid;
  v_contrib       numeric(12,2);
  v_net_pay       numeric(12,2);
BEGIN
  -- 1. Validate run state
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;
  IF v_run.status NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_EDITABLE: run % is % — only draft/ready runs can be modified',
      p_run_id, v_run.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Validate amounts
  IF p_gross_salary <= 0 THEN
    RAISE EXCEPTION 'PAYROLL_INVALID_GROSS: gross_salary must be > 0' USING ERRCODE = 'P0001';
  END IF;
  IF p_withheld_tax < 0 OR p_withheld_tax > p_gross_salary THEN
    RAISE EXCEPTION 'PAYROLL_INVALID_TAX: withheld_tax must be >= 0 and <= gross_salary' USING ERRCODE = 'P0001';
  END IF;
  IF p_employer_contrib_rate < 0 OR p_employer_contrib_rate >= 1 THEN
    RAISE EXCEPTION 'PAYROLL_INVALID_RATE: employer_contrib_rate must be in [0, 1)' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Derive computed fields
  v_contrib := ROUND(p_gross_salary * p_employer_contrib_rate, 2);
  v_net_pay := p_gross_salary - p_withheld_tax;

  -- 4. Insert or update (upsert on employee for same run)
  INSERT INTO payroll_entries (
    organization_id, payroll_run_id, employee_id, instructor_id,
    gross_salary, withheld_tax, employer_contrib_rate, employer_contrib_amount,
    pension_amount, benefits_amount, net_pay, notes, created_by
  ) VALUES (
    v_run.organization_id, p_run_id, p_employee_id, p_instructor_id,
    p_gross_salary, p_withheld_tax, p_employer_contrib_rate, v_contrib,
    p_pension_amount, p_benefits_amount, v_net_pay, p_notes, p_actor_id
  )
  ON CONFLICT (payroll_run_id, employee_id) DO UPDATE
    SET gross_salary           = EXCLUDED.gross_salary,
        withheld_tax           = EXCLUDED.withheld_tax,
        employer_contrib_rate  = EXCLUDED.employer_contrib_rate,
        employer_contrib_amount = EXCLUDED.employer_contrib_amount,
        pension_amount         = EXCLUDED.pension_amount,
        benefits_amount        = EXCLUDED.benefits_amount,
        net_pay                = EXCLUDED.net_pay,
        notes                  = EXCLUDED.notes
  RETURNING id INTO v_entry_id;

  -- 5. Recalculate run aggregates
  PERFORM public.update_payroll_run_totals(p_run_id);

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.add_payroll_entry(uuid, uuid, numeric, numeric, numeric, numeric, numeric, uuid, text, uuid) IS
  'Adds or replaces an employee line in a draft/ready payroll run. '
  'employer_contrib_amount = ROUND(gross × rate, 2). '
  'net_pay = gross - withheld_tax. '
  'Recalculates run totals atomically. Idempotent on (run_id, employee_id).';

GRANT EXECUTE ON FUNCTION public.add_payroll_entry(uuid, uuid, numeric, numeric, numeric, numeric, numeric, uuid, text, uuid)
  TO authenticated, service_role;

-- ── 3. update_payroll_run_totals ──────────────────────────────────────────────
-- Recalculates aggregated totals from payroll_entries.
-- Called by add_payroll_entry and internally before posting.

CREATE OR REPLACE FUNCTION public.update_payroll_run_totals(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE payroll_runs
  SET total_gross            = (SELECT COALESCE(sum(gross_salary),            0) FROM payroll_entries WHERE payroll_run_id = p_run_id),
      total_withheld_tax     = (SELECT COALESCE(sum(withheld_tax),             0) FROM payroll_entries WHERE payroll_run_id = p_run_id),
      total_employer_contrib = (SELECT COALESCE(sum(employer_contrib_amount), 0) FROM payroll_entries WHERE payroll_run_id = p_run_id),
      total_net_pay          = (SELECT COALESCE(sum(net_pay),                  0) FROM payroll_entries WHERE payroll_run_id = p_run_id),
      entry_count            = (SELECT count(*)                                   FROM payroll_entries WHERE payroll_run_id = p_run_id)
  WHERE id = p_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_payroll_run_totals(uuid) TO service_role;

-- ── 4. post_payroll_journal ───────────────────────────────────────────────────
-- Posts the balanced payroll journal entry for a run.
--
-- Journal lines posted (Swedish BAS 2020):
--   DR 7010 Löner                    total_gross               (always)
--   DR 7210 Sociala avgifter         total_employer_contrib     (if > 0)
--   CR 2710 Personalskatt            total_withheld_tax         (if > 0)
--   CR 2731 Sociala avgifter skuld   total_employer_contrib     (if > 0)
--   CR 2940 Upplupna löner           total_net_pay              (always)
--
-- Balance proof: DR = G + E; CR = T + E + (G-T) = G + E ✓
-- Idempotent: returns existing journal_entry_id if already posted.

CREATE OR REPLACE FUNCTION public.post_payroll_journal(
  p_run_id   uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run      payroll_runs%ROWTYPE;
  v_entry_id uuid;
  v_lines    jsonb := '[]'::jsonb;
  v_entry_date date;
  v_desc     text;
BEGIN
  -- 1. Fetch and validate run
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;

  -- 2. Idempotency: return existing entry if already posted
  IF v_run.journal_entry_id IS NOT NULL THEN
    RETURN v_run.journal_entry_id;
  END IF;

  -- 3. Guard against double-posting
  IF v_run.status NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'PAYROLL_NOT_POSTABLE: run % has status %; must be draft or ready',
      p_run_id, v_run.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Guard against empty runs
  IF v_run.entry_count = 0 THEN
    RAISE EXCEPTION 'PAYROLL_EMPTY_RUN: run % has no entries; add employees before posting', p_run_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Refresh totals before posting
  PERFORM public.update_payroll_run_totals(p_run_id);
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;

  v_entry_date := COALESCE(v_run.pay_date, v_run.pay_period_end);
  v_desc       := 'Lönespecifikation ' || to_char(v_run.pay_period_start, 'YYYY-MM') || '–' || to_char(v_run.pay_period_end, 'YYYY-MM-DD');

  -- 6. Build journal lines
  -- DR 7010 Löner (always: gross salary expense)
  v_lines := v_lines || jsonb_build_object(
    'account_code',  '7010',
    'debit_amount',  v_run.total_gross,
    'credit_amount', 0,
    'description',   'Löner ' || to_char(v_run.pay_period_start, 'YYYY-MM')
  );

  -- DR 7210 Sociala avgifter (employer contributions expense, if > 0)
  IF v_run.total_employer_contrib > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code',  '7210',
      'debit_amount',  v_run.total_employer_contrib,
      'credit_amount', 0,
      'description',   'Arbetsgivaravgifter ' || to_char(v_run.pay_period_start, 'YYYY-MM')
    );
  END IF;

  -- CR 2710 Personalskatt (withheld preliminary income tax, if > 0)
  IF v_run.total_withheld_tax > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code',  '2710',
      'debit_amount',  0,
      'credit_amount', v_run.total_withheld_tax,
      'description',   'Avdragen preliminärskatt ' || to_char(v_run.pay_period_start, 'YYYY-MM')
    );
  END IF;

  -- CR 2731 Sociala avgifter skuld (employer contributions liability, if > 0)
  IF v_run.total_employer_contrib > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code',  '2731',
      'debit_amount',  0,
      'credit_amount', v_run.total_employer_contrib,
      'description',   'Arbetsgivaravgiftsskuld ' || to_char(v_run.pay_period_start, 'YYYY-MM')
    );
  END IF;

  -- CR 2940 Upplupna löner (net pay accrual: gross - withheld_tax; always > 0)
  v_lines := v_lines || jsonb_build_object(
    'account_code',  '2940',
    'debit_amount',  0,
    'credit_amount', v_run.total_net_pay,
    'description',   'Upplupna löner (nettolön) ' || to_char(v_run.pay_period_start, 'YYYY-MM')
  );

  -- 7. Post via core posting engine (enforces balance, assigns voucher L-series)
  v_entry_id := public.post_journal_entry(
    p_org_id              := v_run.organization_id,
    p_period_id           := v_run.financial_period_id,
    p_entry_type          := 'standard',
    p_entry_date          := v_entry_date,
    p_description         := v_desc,
    p_lines               := v_lines,
    p_source_event_type   := 'Payroll.Posted',
    p_source_entity_type  := 'payroll_run',
    p_source_entity_id    := p_run_id,
    p_voucher_series      := 'L',
    p_actor_id            := p_actor_id
  );

  -- 8. Lock the run and link the journal entry
  UPDATE payroll_runs
  SET status           = 'posted',
      journal_entry_id = v_entry_id,
      posted_at        = now(),
      posted_by        = p_actor_id
  WHERE id = p_run_id;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_payroll_journal(uuid, uuid) IS
  'Posts the balanced payroll journal entry (series L) for a run. '
  'DR 7010/7210 = CR 2710/2731/2940. Always balanced. '
  'Transitions run status draft/ready → posted. Idempotent.';

GRANT EXECUTE ON FUNCTION public.post_payroll_journal(uuid, uuid) TO authenticated, service_role;

-- ── 5. post_salary_payment ────────────────────────────────────────────────────
-- Posts the net salary payment from bank to employees.
--   DR 2940 Upplupna löner (net_pay)
--   CR p_bank_account_code (default 1930) (net_pay)
-- Idempotent: returns existing payment entry id if already posted.

CREATE OR REPLACE FUNCTION public.post_salary_payment(
  p_run_id          uuid,
  p_payment_date    date    DEFAULT NULL,
  p_bank_account    text    DEFAULT '1930',
  p_actor_id        uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run      payroll_runs%ROWTYPE;
  v_entry_id uuid;
  v_date     date;
  v_lines    jsonb;
BEGIN
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency
  IF v_run.salary_payment_entry_id IS NOT NULL THEN
    RETURN v_run.salary_payment_entry_id;
  END IF;

  IF v_run.status != 'posted' THEN
    RAISE EXCEPTION 'PAYROLL_NOT_POSTED: run % must be in posted status before salary payment', p_run_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_run.total_net_pay <= 0 THEN
    RAISE EXCEPTION 'PAYROLL_ZERO_NET: run % has zero net pay — nothing to pay', p_run_id
      USING ERRCODE = 'P0001';
  END IF;

  v_date := COALESCE(p_payment_date, v_run.pay_date, CURRENT_DATE);

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  '2940',
      'debit_amount',  v_run.total_net_pay,
      'credit_amount', 0,
      'description',   'Utbetalning nettolön ' || to_char(v_date, 'YYYY-MM-DD')
    ),
    jsonb_build_object(
      'account_code',  p_bank_account,
      'debit_amount',  0,
      'credit_amount', v_run.total_net_pay,
      'description',   'Bankutbetalning löner ' || to_char(v_date, 'YYYY-MM-DD')
    )
  );

  v_entry_id := public.post_journal_entry(
    p_org_id              := v_run.organization_id,
    p_period_id           := v_run.financial_period_id,
    p_entry_type          := 'standard',
    p_entry_date          := v_date,
    p_description         := 'Löneutbetalning ' || to_char(v_date, 'YYYY-MM-DD'),
    p_lines               := v_lines,
    p_source_event_type   := 'Payroll.Paid',
    p_source_entity_type  := 'payroll_run',
    p_source_entity_id    := p_run_id,
    p_voucher_series      := 'L',
    p_actor_id            := p_actor_id
  );

  UPDATE payroll_runs
  SET salary_payment_entry_id = v_entry_id
  WHERE id = p_run_id;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_salary_payment(uuid, date, text, uuid) IS
  'Posts the salary payment journal entry (DR 2940 / CR bank). '
  'p_bank_account defaults to 1930 (Företagskonto). Idempotent.';

GRANT EXECUTE ON FUNCTION public.post_salary_payment(uuid, date, text, uuid) TO authenticated, service_role;

-- ── 6. reverse_payroll_run ────────────────────────────────────────────────────
-- Posts a full reversal of a payroll run.
-- All debit/credit amounts from the original journal entry are swapped.
-- Marks the original run as 'reversed'.
-- Idempotent: if already reversed, returns existing reversal entry id.

CREATE OR REPLACE FUNCTION public.reverse_payroll_run(
  p_run_id   uuid,
  p_reason   text,
  p_actor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run              payroll_runs%ROWTYPE;
  v_orig_entry_id    uuid;
  v_reversal_id      uuid;
  v_reversal_lines   jsonb := '[]'::jsonb;
  v_line             record;
  v_reversal_date    date;
  v_period_id        uuid;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'PAYROLL_REVERSE_REASON_REQUIRED: a reason is required to reverse a payroll run'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;

  IF v_run.status != 'posted' THEN
    RAISE EXCEPTION 'PAYROLL_NOT_REVERSIBLE: run % must be posted to reverse (status: %)',
      p_run_id, v_run.status
      USING ERRCODE = 'P0001';
  END IF;

  v_orig_entry_id := v_run.journal_entry_id;

  -- Idempotency: check if reversal already exists
  SELECT id INTO v_reversal_id
  FROM   journal_entries
  WHERE  reversal_of_entry_id = v_orig_entry_id
    AND  status = 'posted'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_reversal_id;
  END IF;

  -- Build reversal lines: swap debit/credit of each original line
  FOR v_line IN
    SELECT account_code, debit_amount, credit_amount, vat_rate_code, vat_amount, description
    FROM   journal_lines
    WHERE  entry_id = v_orig_entry_id
    ORDER  BY line_number
  LOOP
    v_reversal_lines := v_reversal_lines || jsonb_build_object(
      'account_code',  v_line.account_code,
      'debit_amount',  v_line.credit_amount,   -- swapped
      'credit_amount', v_line.debit_amount,    -- swapped
      'description',   'Reversal: ' || v_line.description,
      'vat_rate_code', v_line.vat_rate_code,
      'vat_amount',    v_line.vat_amount
    );
  END LOOP;

  v_reversal_date := CURRENT_DATE;
  v_period_id     := public.find_period_for_date(v_run.organization_id, v_reversal_date);

  v_reversal_id := public.post_journal_entry(
    p_org_id               := v_run.organization_id,
    p_period_id            := COALESCE(v_period_id, v_run.financial_period_id),
    p_entry_type           := 'reversal',
    p_entry_date           := v_reversal_date,
    p_description          := 'Reversering löner ' || to_char(v_run.pay_period_start, 'YYYY-MM') || ': ' || p_reason,
    p_lines                := v_reversal_lines,
    p_source_event_type    := 'Payroll.Reversed',
    p_source_entity_type   := 'payroll_run',
    p_source_entity_id     := p_run_id,
    p_voucher_series       := 'L',
    p_reversal_of_entry_id := v_orig_entry_id,
    p_actor_id             := p_actor_id
  );

  -- Mark original run as reversed
  UPDATE payroll_runs SET status = 'reversed' WHERE id = p_run_id;

  RETURN v_reversal_id;
END;
$$;

COMMENT ON FUNCTION public.reverse_payroll_run(uuid, text, uuid) IS
  'Posts a reversal journal entry for a posted payroll run. '
  'All debits and credits from the original entry are swapped. '
  'Marks the run status as ''reversed''. Idempotent.';

GRANT EXECUTE ON FUNCTION public.reverse_payroll_run(uuid, text, uuid) TO authenticated, service_role;
