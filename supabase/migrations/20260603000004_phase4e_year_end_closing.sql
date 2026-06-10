-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260603000004_phase4e_year_end_closing.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4E — Fiscal Year Close Engine
--
-- New table:
--   fiscal_years   — fiscal year definitions per organization
--
-- Extends financial_periods:
--   fiscal_year_id     — FK to fiscal_years (which fiscal year this period belongs to)
--   is_year_end_period — true for the last period in the fiscal year
--
-- SECURITY DEFINER functions:
--   create_fiscal_year(p_org_id, p_year_number, p_year_start, p_year_end, p_actor_id)
--     → Creates a fiscal year record. Returns fiscal_year_id.
--
--   assign_period_to_fiscal_year(p_period_id, p_fiscal_year_id, p_is_year_end, p_actor_id)
--     → Links a financial period to a fiscal year.
--
--   validate_fiscal_year_for_close(p_fiscal_year_id, p_actor_id)
--     → Checks: all non-year-end periods are locked; year-end period is soft-closed.
--       Returns JSONB checklist.
--
--   post_retained_earnings_entry(p_fiscal_year_id, p_actor_id)
--     → Posts the year-end closing journal entry to the year-end period:
--         DR each 3xxx-8xxx account with credit balance (revenue accounts)
--         CR each 3xxx-8xxx account with debit balance (expense accounts)
--         Net profit → CR 2091 (Balanserade vinstmedel)
--         Net loss   → DR 2091
--       Uses BAS 2020 conventions. Returns the journal_entry_id.
--       Idempotent: returns existing entry if already posted.
--
--   close_fiscal_year(p_fiscal_year_id, p_actor_id)
--     → Validates → posts retained earnings → marks fiscal_year.status = 'closed'.
--       Emits FiscalYear.Closed event.
--       The year-end period must be soft-closed ('closed') when this runs.
--       The caller should then hard_close_period() the year-end period separately.
--
--   rollover_opening_balances(p_fiscal_year_id, p_target_period_id, p_actor_id)
--     → Copies closing_balances from the year-end period as opening_balances
--       in the target (new fiscal year's first) period.
--       INSERT ON CONFLICT DO UPDATE to handle periods with early postings.
--       Returns count of accounts rolled over.
--
-- View:
--   v_fiscal_year_overview  — fiscal year status with all period summaries
--
-- Swedish BAS retained earnings accounts:
--   2091 = Balanserade vinstmedel (Retained earnings / accumulated profit)
--   3xxx = Revenue accounts (credit-normal; closing_balance < 0 when they have activity)
--   4xxx-8xxx = Expense/cost accounts (debit-normal; closing_balance > 0 when they have activity)
--
-- Retained earnings formula:
--   For each income statement account in year-end period:
--     Revenue (3xxx, CB < 0): DR abs(CB) to zero it out
--     Expense (4xxx-8xxx, CB > 0): CR CB to zero it out
--   Net: if total_DR > total_CR → profit → CR 2091 by the difference
--        if total_CR > total_DR → loss   → DR 2091 by the difference
--        if equal → no 2091 line needed (breakeven)
--
-- Dependencies:
--   20260603000003_phase4e_financial_close_engine.sql
--   20260602000001_phase4d_ledger_core.sql
--   20260602000002_phase4d_posting_engine.sql  — post_journal_entry
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: fiscal_years table ────────────────────────────────────────────

CREATE TABLE public.fiscal_years (
  id                         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id            uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  year_number                int         NOT NULL CHECK (year_number >= 2020 AND year_number <= 2099),
  year_start                 date        NOT NULL,
  year_end                   date        NOT NULL,
  status                     text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','closing','closed')),
  retained_earnings_entry_id uuid        REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  closed_at                  timestamptz,
  closed_by                  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                      text,
  metadata                   jsonb       NOT NULL DEFAULT '{}',
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT fy_dates_check     CHECK (year_end > year_start),
  CONSTRAINT fy_org_year_unique UNIQUE (organization_id, year_number)
);

CREATE TRIGGER set_fiscal_years_updated_at
  BEFORE UPDATE ON public.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.fiscal_years IS
  'Fiscal year definitions per organization. '
  'Typically January 1 – December 31 but Swedish BFL allows non-calendar fiscal years. '
  'A fiscal year is closed by close_fiscal_year() after all periods are locked.';
COMMENT ON COLUMN public.fiscal_years.retained_earnings_entry_id IS
  'Journal entry that closes income/expense accounts to 2091. Set by post_retained_earnings_entry().';
COMMENT ON COLUMN public.fiscal_years.status IS
  '''open'' = active; ''closing'' = close in progress; ''closed'' = fully closed and locked.';

ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fy_org_select" ON public.fiscal_years FOR SELECT
  USING (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:year_end:manage'));

CREATE POLICY "fy_org_read_also" ON public.fiscal_years FOR SELECT
  USING (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:close:read'));

GRANT SELECT, INSERT, UPDATE ON public.fiscal_years TO authenticated;
GRANT ALL                     ON public.fiscal_years TO service_role;

-- ── Section 2: Extend financial_periods ──────────────────────────────────────

ALTER TABLE public.financial_periods
  ADD COLUMN IF NOT EXISTS fiscal_year_id     uuid    REFERENCES public.fiscal_years(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_year_end_period boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.financial_periods.fiscal_year_id     IS 'Which fiscal year this period belongs to.';
COMMENT ON COLUMN public.financial_periods.is_year_end_period IS 'True for the last period in the fiscal year (year-end close target).';

-- ── Section 3: create_fiscal_year ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_fiscal_year(
  p_org_id      uuid,
  p_year_number int,
  p_year_start  date,
  p_year_end    date,
  p_notes       text DEFAULT NULL,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy_id uuid;
BEGIN
  IF p_year_end <= p_year_start THEN
    RAISE EXCEPTION 'FISCAL_YEAR_INVALID_DATES: year_end must be after year_start'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_year_number < 2020 OR p_year_number > 2099 THEN
    RAISE EXCEPTION 'FISCAL_YEAR_INVALID_NUMBER: year_number must be between 2020 and 2099'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO fiscal_years (organization_id, year_number, year_start, year_end, notes, created_by)
  VALUES (p_org_id, p_year_number, p_year_start, p_year_end, p_notes, p_actor_id)
  RETURNING id INTO v_fy_id;

  RETURN v_fy_id;
END;
$$;

COMMENT ON FUNCTION public.create_fiscal_year(uuid,int,date,date,text,uuid) IS
  'Creates a new fiscal year record. Returns fiscal_year_id.';

GRANT EXECUTE ON FUNCTION public.create_fiscal_year(uuid,int,date,date,text,uuid) TO authenticated, service_role;

-- ── Section 4: assign_period_to_fiscal_year ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_period_to_fiscal_year(
  p_period_id     uuid,
  p_fiscal_year_id uuid,
  p_is_year_end   boolean DEFAULT false,
  p_actor_id      uuid    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period financial_periods%ROWTYPE;
  v_fy     fiscal_years%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_fy FROM fiscal_years WHERE id = p_fiscal_year_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % not found', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_fy.organization_id <> v_period.organization_id THEN
    RAISE EXCEPTION 'FISCAL_YEAR_ORG_MISMATCH: fiscal year and period belong to different organizations'
      USING ERRCODE = 'P0001';
  END IF;

  -- If marking as year-end, ensure no other period in this fiscal year is also year-end
  IF p_is_year_end THEN
    UPDATE financial_periods
    SET is_year_end_period = false, updated_at = now()
    WHERE fiscal_year_id = p_fiscal_year_id AND is_year_end_period = true AND id <> p_period_id;
  END IF;

  UPDATE financial_periods
  SET fiscal_year_id     = p_fiscal_year_id,
      is_year_end_period = p_is_year_end,
      updated_at         = now()
  WHERE id = p_period_id;
END;
$$;

COMMENT ON FUNCTION public.assign_period_to_fiscal_year(uuid,uuid,boolean,uuid) IS
  'Links a financial_period to a fiscal_year. '
  'If p_is_year_end = true, clears is_year_end_period on any other period in the same fiscal year.';

GRANT EXECUTE ON FUNCTION public.assign_period_to_fiscal_year(uuid,uuid,boolean,uuid) TO authenticated, service_role;

-- ── Section 5: validate_fiscal_year_for_close ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_fiscal_year_for_close(
  p_fiscal_year_id  uuid,
  p_actor_id        uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy               fiscal_years%ROWTYPE;
  v_checks           jsonb := '[]'::jsonb;
  v_all_passed       boolean := true;
  v_period_count     int := 0;
  v_unlocked_count   int := 0;
  v_year_end_count   int := 0;
  v_year_end_status  text;
  v_has_entries      boolean := false;
BEGIN
  SELECT * INTO v_fy FROM fiscal_years WHERE id = p_fiscal_year_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % not found', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_fy.status = 'closed' THEN
    RAISE EXCEPTION 'FISCAL_YEAR_ALREADY_CLOSED: fiscal year % is already closed', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Count periods and check statuses
  SELECT COUNT(*) INTO v_period_count
  FROM financial_periods WHERE fiscal_year_id = p_fiscal_year_id;

  -- Check 1: at least one period assigned
  v_checks := v_checks || jsonb_build_object(
    'check', 'has_periods',
    'passed', v_period_count > 0,
    'message', format('%s financial periods assigned to this fiscal year', v_period_count)
  );
  IF v_period_count = 0 THEN v_all_passed := false; END IF;

  -- Check 2: exactly one year-end period
  SELECT COUNT(*) INTO v_year_end_count
  FROM financial_periods WHERE fiscal_year_id = p_fiscal_year_id AND is_year_end_period = true;

  v_checks := v_checks || jsonb_build_object(
    'check', 'exactly_one_year_end_period',
    'passed', v_year_end_count = 1,
    'message', format('%s period(s) marked as year-end (expected exactly 1)', v_year_end_count)
  );
  IF v_year_end_count <> 1 THEN v_all_passed := false; END IF;

  -- Check 3: year-end period is soft-closed (status='closed') for posting
  IF v_year_end_count = 1 THEN
    SELECT status INTO v_year_end_status
    FROM financial_periods WHERE fiscal_year_id = p_fiscal_year_id AND is_year_end_period = true;

    v_checks := v_checks || jsonb_build_object(
      'check', 'year_end_period_closable',
      'passed', v_year_end_status IN ('closed','open'),
      'message', format('Year-end period status: % (must be open or closed, not locked)', v_year_end_status)
    );
    IF v_year_end_status NOT IN ('closed','open') THEN v_all_passed := false; END IF;
  END IF;

  -- Check 4: all non-year-end periods are locked
  SELECT COUNT(*) INTO v_unlocked_count
  FROM financial_periods
  WHERE fiscal_year_id = p_fiscal_year_id
    AND is_year_end_period = false
    AND status <> 'locked';

  v_checks := v_checks || jsonb_build_object(
    'check', 'all_prior_periods_locked',
    'passed', v_unlocked_count = 0,
    'message', format('%s non-year-end periods are not yet locked', v_unlocked_count)
  );
  IF v_unlocked_count > 0 THEN v_all_passed := false; END IF;

  -- Check 5: retained earnings entry not already posted
  v_checks := v_checks || jsonb_build_object(
    'check', 'retained_earnings_not_posted',
    'passed', v_fy.retained_earnings_entry_id IS NULL,
    'message', CASE WHEN v_fy.retained_earnings_entry_id IS NULL
               THEN 'Retained earnings entry not yet posted'
               ELSE format('Retained earnings entry already posted: %s', v_fy.retained_earnings_entry_id) END
  );

  RETURN jsonb_build_object(
    'fiscal_year_id', p_fiscal_year_id,
    'year_number',    v_fy.year_number,
    'status',         v_fy.status,
    'checks',         v_checks,
    'all_passed',     v_all_passed,
    'validated_at',   now()
  );
END;
$$;

COMMENT ON FUNCTION public.validate_fiscal_year_for_close(uuid,uuid) IS
  'Validates that all fiscal year close prerequisites are met. Returns JSONB checklist.';

GRANT EXECUTE ON FUNCTION public.validate_fiscal_year_for_close(uuid,uuid) TO authenticated, service_role;

-- ── Section 6: post_retained_earnings_entry ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_retained_earnings_entry(
  p_fiscal_year_id  uuid,
  p_actor_id        uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy              fiscal_years%ROWTYPE;
  v_year_end_period financial_periods%ROWTYPE;
  v_lines           jsonb := '[]'::jsonb;
  v_line_num        int := 1;
  v_total_debit     numeric(12,2) := 0;
  v_total_credit    numeric(12,2) := 0;
  v_net             numeric(12,2);
  v_entry_id        uuid;
  v_ab              RECORD;
BEGIN
  SELECT * INTO v_fy FROM fiscal_years WHERE id = p_fiscal_year_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % not found', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_fy.retained_earnings_entry_id IS NOT NULL THEN
    RETURN v_fy.retained_earnings_entry_id;  -- Idempotent
  END IF;

  SELECT * INTO v_year_end_period
  FROM financial_periods
  WHERE fiscal_year_id = p_fiscal_year_id AND is_year_end_period = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NO_YEAR_END_PERIOD: no year-end period assigned to fiscal year %',
      p_fiscal_year_id USING ERRCODE = 'P0001';
  END IF;
  IF v_year_end_period.status = 'locked' THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: year-end period % is already locked. '
      'Retained earnings must be posted before hard-closing the year-end period.',
      v_year_end_period.id USING ERRCODE = 'P0001';
  END IF;

  -- Build closing lines: sweep all income statement accounts (3xxx – 8xxx)
  FOR v_ab IN
    SELECT account_code, closing_balance
    FROM account_balances
    WHERE financial_period_id = v_year_end_period.id
      AND account_code >= '3' AND account_code < '9'
      AND ABS(closing_balance) >= 0.01
    ORDER BY account_code
  LOOP
    IF v_ab.closing_balance < 0 THEN
      -- Revenue account (credit-normal): DR to zero it out
      v_lines := v_lines || jsonb_build_object(
        'account_code',  v_ab.account_code,
        'debit_amount',  ABS(v_ab.closing_balance),
        'credit_amount', 0,
        'description',   'Årets stängning — ' || v_ab.account_code
      );
      v_total_debit := v_total_debit + ABS(v_ab.closing_balance);
    ELSE
      -- Expense account (debit-normal): CR to zero it out
      v_lines := v_lines || jsonb_build_object(
        'account_code',  v_ab.account_code,
        'debit_amount',  0,
        'credit_amount', v_ab.closing_balance,
        'description',   'Årets stängning — ' || v_ab.account_code
      );
      v_total_credit := v_total_credit + v_ab.closing_balance;
    END IF;
  END LOOP;

  -- Net profit/loss to 2091 (Balanserade vinstmedel)
  v_net := v_total_debit - v_total_credit;

  IF ABS(v_net) >= 0.01 THEN
    IF v_net > 0 THEN
      -- Profit: CR 2091
      v_lines := v_lines || jsonb_build_object(
        'account_code',  '2091',
        'debit_amount',  0,
        'credit_amount', v_net,
        'description',   'Balanserat resultat — vinst'
      );
    ELSE
      -- Loss: DR 2091
      v_lines := v_lines || jsonb_build_object(
        'account_code',  '2091',
        'debit_amount',  ABS(v_net),
        'credit_amount', 0,
        'description',   'Balanserat resultat — förlust'
      );
    END IF;
  END IF;

  IF jsonb_array_length(v_lines) < 2 THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NO_INCOME_ACCOUNTS: no income statement accounts with balances found '
      'in year-end period % for fiscal year %', v_year_end_period.id, p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;

  v_entry_id := public.post_journal_entry(
    p_org_id             => v_fy.organization_id,
    p_period_id          => v_year_end_period.id,
    p_entry_type         => 'closing',
    p_entry_date         => v_year_end_period.period_end,
    p_description        => format('Årets bokslutspost — räkenskapsår %s', v_fy.year_number),
    p_lines              => v_lines,
    p_source_event_type  => 'FiscalYear.Close',
    p_source_entity_type => 'fiscal_year',
    p_source_entity_id   => p_fiscal_year_id,
    p_voucher_series     => 'A',
    p_actor_id           => p_actor_id
  );

  UPDATE fiscal_years
  SET retained_earnings_entry_id = v_entry_id,
      updated_at                 = now()
  WHERE id = p_fiscal_year_id;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_retained_earnings_entry(uuid,uuid) IS
  'Posts the year-end closing journal entry: zeros all income statement accounts (3xxx-8xxx) '
  'and transfers net result to 2091 (Balanserade vinstmedel). '
  'entry_type = closing. Idempotent: returns existing entry_id if already posted.';

GRANT EXECUTE ON FUNCTION public.post_retained_earnings_entry(uuid,uuid) TO authenticated, service_role;

-- ── Section 7: close_fiscal_year ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.close_fiscal_year(
  p_fiscal_year_id  uuid,
  p_actor_id        uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy         fiscal_years%ROWTYPE;
  v_validation jsonb;
  v_entry_id   uuid;
BEGIN
  SELECT * INTO v_fy FROM fiscal_years WHERE id = p_fiscal_year_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % not found', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_fy.status = 'closed' THEN
    RAISE EXCEPTION 'FISCAL_YEAR_ALREADY_CLOSED: fiscal year % is already closed', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate prerequisites
  v_validation := public.validate_fiscal_year_for_close(p_fiscal_year_id, p_actor_id);
  IF NOT (v_validation->>'all_passed')::boolean THEN
    RAISE EXCEPTION 'FISCAL_YEAR_CLOSE_BLOCKED: validation checks failed for fiscal year %: %',
      p_fiscal_year_id, v_validation->'checks'
      USING ERRCODE = 'P0001';
  END IF;

  -- Post retained earnings (idempotent)
  v_entry_id := public.post_retained_earnings_entry(p_fiscal_year_id, p_actor_id);

  -- Mark fiscal year as closed
  UPDATE fiscal_years
  SET status    = 'closed',
      closed_at = now(),
      closed_by = p_actor_id,
      retained_earnings_entry_id = v_entry_id,
      updated_at = now()
  WHERE id = p_fiscal_year_id;

  -- Emit outbox event
  PERFORM public.insert_outbox_event(
    'FiscalYear.Closed',
    'accounting'::public.event_channel,
    jsonb_build_object(
      'fiscal_year_id', p_fiscal_year_id,
      'year_number',    v_fy.year_number,
      'entry_id',       v_entry_id,
      'closed_by',      p_actor_id
    ),
    v_fy.organization_id
  );
END;
$$;

COMMENT ON FUNCTION public.close_fiscal_year(uuid,uuid) IS
  'Orchestrates fiscal year close: validates prerequisites, posts retained earnings '
  'to account 2091, marks fiscal_year.status = closed. '
  'After this, call hard_close_period() on the year-end period and rollover_opening_balances().';

GRANT EXECUTE ON FUNCTION public.close_fiscal_year(uuid,uuid) TO authenticated, service_role;

-- ── Section 8: rollover_opening_balances ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rollover_opening_balances(
  p_fiscal_year_id   uuid,
  p_target_period_id uuid,
  p_actor_id         uuid DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy               fiscal_years%ROWTYPE;
  v_year_end_period  financial_periods%ROWTYPE;
  v_target_period    financial_periods%ROWTYPE;
  v_count            int := 0;
  v_ab               RECORD;
BEGIN
  SELECT * INTO v_fy FROM fiscal_years WHERE id = p_fiscal_year_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % not found', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_year_end_period
  FROM financial_periods
  WHERE fiscal_year_id = p_fiscal_year_id AND is_year_end_period = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NO_YEAR_END_PERIOD: no year-end period found for fiscal year %',
      p_fiscal_year_id USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_target_period FROM financial_periods WHERE id = p_target_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: target period % not found', p_target_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_target_period.organization_id <> v_fy.organization_id THEN
    RAISE EXCEPTION 'PERIOD_ORG_MISMATCH: target period belongs to a different organization'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_target_period.period_start < v_year_end_period.period_end THEN
    RAISE EXCEPTION 'ROLLOVER_DATE_CONFLICT: target period starts before year-end period ends; '
      'opening balance rollover must target a future period'
      USING ERRCODE = 'P0001';
  END IF;

  -- Roll over each account balance from year-end period to target period
  FOR v_ab IN
    SELECT account_code, closing_balance
    FROM account_balances
    WHERE financial_period_id = v_year_end_period.id
    ORDER BY account_code
  LOOP
    INSERT INTO account_balances (
      organization_id, financial_period_id, account_code,
      opening_balance, closing_balance, transaction_count
    ) VALUES (
      v_fy.organization_id,
      p_target_period_id,
      v_ab.account_code,
      v_ab.closing_balance,
      v_ab.closing_balance,  -- closing = opening when no movements yet
      0
    )
    ON CONFLICT (organization_id, financial_period_id, account_code) DO UPDATE
      SET opening_balance  = EXCLUDED.opening_balance,
          -- Recalculate closing = new opening + existing movements
          closing_balance  = EXCLUDED.opening_balance
                             + account_balances.debit_movement
                             - account_balances.credit_movement,
          updated_at       = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.rollover_opening_balances(uuid,uuid,uuid) IS
  'Copies year-end period closing_balances as opening_balances for the target (new) period. '
  'Uses INSERT ON CONFLICT DO UPDATE to handle periods with existing early postings. '
  'Returns count of accounts rolled over. '
  'Income statement accounts (3xxx-8xxx) will have closing_balance = 0 after year-end close, '
  'so their opening_balance in the new period is correctly 0.';

GRANT EXECUTE ON FUNCTION public.rollover_opening_balances(uuid,uuid,uuid) TO authenticated, service_role;

-- ── Section 9: v_fiscal_year_overview ─────────────────────────────────────────

CREATE VIEW public.v_fiscal_year_overview
WITH (security_invoker = true)
AS
SELECT
  fy.id                           AS fiscal_year_id,
  fy.organization_id,
  fy.year_number,
  fy.year_start,
  fy.year_end,
  fy.status                       AS fiscal_year_status,
  fy.retained_earnings_entry_id,
  fy.closed_at,
  -- Period counts
  COUNT(fp.id)                    AS total_periods,
  COUNT(fp.id) FILTER (WHERE fp.status = 'open')   AS open_periods,
  COUNT(fp.id) FILTER (WHERE fp.status = 'closed') AS soft_closed_periods,
  COUNT(fp.id) FILTER (WHERE fp.status = 'locked') AS hard_closed_periods,
  -- Year-end period — correlated scalar subqueries because is_year_end_period = true
  -- matches at most one period per fiscal year (enforced by assign_period_to_fiscal_year).
  -- MAX(uuid) has no defined aggregate in PostgreSQL; MAX(text) on status has no fiscal
  -- ordering meaning. Both are 1:0-1 lookups, not aggregates.
  (SELECT fp2.id
   FROM public.financial_periods fp2
   WHERE fp2.fiscal_year_id = fy.id AND fp2.is_year_end_period = true
   LIMIT 1)                                                     AS year_end_period_id,
  (SELECT fp2.status::text
   FROM public.financial_periods fp2
   WHERE fp2.fiscal_year_id = fy.id AND fp2.is_year_end_period = true
   LIMIT 1)                                                     AS year_end_period_status,
  MIN(fp.period_start) AS first_period_start,
  MAX(fp.period_end)   AS last_period_end,
  -- Amendment totals
  COALESCE(SUM(fp.amendment_count), 0) AS total_amendments
FROM public.fiscal_years fy
LEFT JOIN public.financial_periods fp ON fp.fiscal_year_id = fy.id
GROUP BY
  fy.id, fy.organization_id, fy.year_number, fy.year_start, fy.year_end,
  fy.status, fy.retained_earnings_entry_id, fy.closed_at;

COMMENT ON VIEW public.v_fiscal_year_overview IS
  'Fiscal year status with all period counts, year-end period status, and amendment summary. '
  'SECURITY INVOKER — RLS enforced via underlying tables.';

GRANT SELECT ON public.v_fiscal_year_overview TO authenticated, service_role;
