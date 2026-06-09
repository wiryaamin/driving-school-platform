-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260604000004_phase4f_year_opening_balances.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4F — Fiscal Opening Balance Carry-Forward & Trial Balance
--
-- Implements formal opening balance journal entries (objective 10) and
-- retained earnings automation (objective 11):
--
--   post_opening_balance_entry(...)  → Posts entry_type='opening_balance' (series 'O')
--                                      for audit-trail-visible OB recording.
--                                      Use when starting on platform mid-year.
--   validate_opening_balances(...)   → Checks OB entry exists, is balanced,
--                                      and optionally agrees with prior period.
--   post_year_end_profit_transfer(...) → Transfers 2099 Årets resultat → 2091
--                                       Balanserade vinstmedel at year start.
--                                       Complements Phase 4E post_retained_earnings_entry.
--
-- Views:
--   v_trial_balance              — Full trial balance per (org, period, account)
--   v_opening_balance_status     — Per period: whether OB entry exists
--
-- Relationship with Phase 4E:
--   Phase 4E rollover_opening_balances() → updates account_balances cache for next period
--   Phase 4F post_opening_balance_entry() → posts formal OB journal entry for audit trail
--   These are complementary; for new-org onboarding use post_opening_balance_entry;
--   for ongoing year-end close use rollover_opening_balances (already in Phase 4E).
--
-- Dependencies:
--   20260602000002_phase4d_posting_engine.sql — post_journal_entry
--   20260602000001_phase4d_ledger_core.sql    — account_balances, journal_entries
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: post_opening_balance_entry ─────────────────────────────────────
-- Posts a formal opening balance journal entry for a new period.
-- Used when onboarding a new organization mid-year with existing balances.
-- The OB entry is posted as entry_type='opening_balance' with voucher series 'O'.
--
-- p_balances JSONB format (same as post_journal_entry p_lines):
--   [{ "account_code": "1930", "debit_amount": 150000, "credit_amount": 0, "description": "Bank" },
--    { "account_code": "2091", "debit_amount": 0, "credit_amount": 150000, "description": "Eget kapital" }]
--
-- Invariants:
--   1. p_balances must be a valid balanced double-entry array (sum DR = sum CR)
--   2. Idempotent: if an OB entry already exists for (org, period), returns it
--   3. The target period must not be locked

CREATE OR REPLACE FUNCTION public.post_opening_balance_entry(
  p_org_id    uuid,
  p_period_id uuid,
  p_balances  jsonb,
  p_notes     text DEFAULT NULL,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id   uuid;
  v_period     financial_periods%ROWTYPE;
BEGIN
  -- 1. Validate period
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
  END IF;
  IF v_period.organization_id != p_org_id THEN
    RAISE EXCEPTION 'PERIOD_ORG_MISMATCH: period % does not belong to org %', p_period_id, p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Idempotency: return existing OB entry if already posted for this period
  SELECT id INTO v_entry_id
  FROM   journal_entries
  WHERE  organization_id    = p_org_id
    AND  source_entity_type = 'period'
    AND  source_entity_id   = p_period_id
    AND  entry_type         = 'opening_balance'
    AND  status             = 'posted'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_entry_id;
  END IF;

  -- 3. Validate balances array
  IF p_balances IS NULL OR jsonb_array_length(p_balances) < 2 THEN
    RAISE EXCEPTION 'OB_INVALID_BALANCES: opening balance entry requires at least 2 lines'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Post as opening_balance type (post_journal_entry enforces balance + period lock check)
  v_entry_id := public.post_journal_entry(
    p_org_id             := p_org_id,
    p_period_id          := p_period_id,
    p_entry_type         := 'opening_balance',
    p_entry_date         := v_period.period_start,
    p_description        := COALESCE(p_notes, 'Ingående balans ' || to_char(v_period.period_start, 'YYYY-MM-DD')),
    p_lines              := p_balances,
    p_source_event_type  := 'Period.OpeningBalance',
    p_source_entity_type := 'period',
    p_source_entity_id   := p_period_id,
    p_voucher_series     := 'O',
    p_actor_id           := p_actor_id
  );

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_opening_balance_entry(uuid, uuid, jsonb, text, uuid) IS
  'Posts a formal opening balance journal entry (series O, entry_type=opening_balance). '
  'For new-org onboarding with existing balances. Idempotent per (org, period). '
  'p_balances must be a balanced double-entry array identical to post_journal_entry p_lines.';

GRANT EXECUTE ON FUNCTION public.post_opening_balance_entry(uuid, uuid, jsonb, text, uuid)
  TO authenticated, service_role;

-- ── Section 2: validate_opening_balances ──────────────────────────────────────
-- Validates the opening balance state for a given period:
--   check 1: OB journal entry exists
--   check 2: OB entry is balanced (total_debit = total_credit)
--   check 3: OB amounts agree with prior period closing balances (if prior period exists)

CREATE OR REPLACE FUNCTION public.validate_opening_balances(
  p_org_id    uuid,
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period        financial_periods%ROWTYPE;
  v_ob_entry_id   uuid;
  v_ob_debit      numeric(12,2) := 0;
  v_ob_credit     numeric(12,2) := 0;
  v_prior_period  uuid;
  v_checks        jsonb := '[]'::jsonb;
  v_all_passed    boolean;
BEGIN
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
$$;

COMMENT ON FUNCTION public.validate_opening_balances(uuid, uuid) IS
  'Validates opening balance state for a period: entry exists, is balanced, '
  'and optionally reconciles with prior period closing balances.';

GRANT EXECUTE ON FUNCTION public.validate_opening_balances(uuid, uuid) TO authenticated, service_role;

-- ── Section 3: post_year_end_profit_transfer ──────────────────────────────────
-- At the start of a new fiscal year, transfers the prior year profit/loss
-- from 2099 Årets resultat to 2091 Balanserade vinstmedel.
-- This is distinct from Phase 4E post_retained_earnings_entry which sweeps
-- 3xxx-8xxx income statement accounts. This function handles the opening
-- of a new year by moving 2099 to 2091 (the equity reclassification entry).
--
-- Called after: Phase 4E close_fiscal_year() which sets 2091 via P&L sweep.
-- Idempotent: if 2099 balance is zero, returns NULL (nothing to do).

CREATE OR REPLACE FUNCTION public.post_year_end_profit_transfer(
  p_org_id            uuid,
  p_new_period_id     uuid,
  p_prior_period_id   uuid,
  p_actor_id          uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_2099  numeric(12,2) := 0;
  v_entry_id      uuid;
  v_lines         jsonb;
  v_new_period    financial_periods%ROWTYPE;
BEGIN
  SELECT * INTO v_new_period FROM financial_periods WHERE id = p_new_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: new period % not found', p_new_period_id USING ERRCODE = 'P0001';
  END IF;

  -- Read 2099 closing balance from the prior period
  SELECT closing_balance INTO v_balance_2099
  FROM   account_balances
  WHERE  organization_id     = p_org_id
    AND  financial_period_id = p_prior_period_id
    AND  account_code        = '2099';

  -- Nothing to transfer if 2099 has no balance
  IF v_balance_2099 IS NULL OR v_balance_2099 = 0 THEN
    RETURN NULL;
  END IF;

  -- Idempotency: check if transfer already posted
  SELECT id INTO v_entry_id
  FROM   journal_entries
  WHERE  organization_id    = p_org_id
    AND  source_entity_type = 'period'
    AND  source_entity_id   = p_new_period_id
    AND  source_event_type  = 'YearEnd.ProfitTransfer'
    AND  status             = 'posted'
  LIMIT 1;

  IF FOUND THEN RETURN v_entry_id; END IF;

  -- v_balance_2099 is negative for credit balance (profit) in our convention
  -- To transfer profit (credit balance on 2099) to 2091:
  --   DR 2099 abs(balance) — clear the profit account
  --   CR 2091 abs(balance) — accumulate in retained earnings
  -- OR for loss (debit balance on 2099):
  --   DR 2091 abs(balance)
  --   CR 2099 abs(balance)
  DECLARE
    v_amount numeric(12,2) := ABS(v_balance_2099);
    v_dr_acct text;
    v_cr_acct text;
  BEGIN
    IF v_balance_2099 < 0 THEN
      -- Profit (credit balance on 2099): DR 2099, CR 2091
      v_dr_acct := '2099';
      v_cr_acct := '2091';
    ELSE
      -- Loss (debit balance on 2099): DR 2091, CR 2099
      v_dr_acct := '2091';
      v_cr_acct := '2099';
    END IF;

    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_dr_acct, 'debit_amount', v_amount, 'credit_amount', 0,
                         'description', 'Årets resultat omföring ' || to_char(v_new_period.period_start, 'YYYY')),
      jsonb_build_object('account_code', v_cr_acct, 'debit_amount', 0, 'credit_amount', v_amount,
                         'description', 'Balanserade vinstmedel ' || to_char(v_new_period.period_start, 'YYYY'))
    );

    v_entry_id := public.post_journal_entry(
      p_org_id             := p_org_id,
      p_period_id          := p_new_period_id,
      p_entry_type         := 'closing',
      p_entry_date         := v_new_period.period_start,
      p_description        := 'Årets resultat omföres till balanserade vinstmedel ' || to_char(v_new_period.period_start, 'YYYY'),
      p_lines              := v_lines,
      p_source_event_type  := 'YearEnd.ProfitTransfer',
      p_source_entity_type := 'period',
      p_source_entity_id   := p_new_period_id,
      p_voucher_series     := 'O',
      p_actor_id           := p_actor_id
    );
  END;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_year_end_profit_transfer(uuid, uuid, uuid, uuid) IS
  'Transfers 2099 Årets resultat → 2091 Balanserade vinstmedel at new year start. '
  'Complements Phase 4E post_retained_earnings_entry. Returns NULL if 2099 has no balance. '
  'Idempotent per (org, new_period_id).';

GRANT EXECUTE ON FUNCTION public.post_year_end_profit_transfer(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

-- ── Section 4: Views ──────────────────────────────────────────────────────────

-- v_trial_balance: Full trial balance per (org, period, account).
-- Joins account_balances with bas_account_catalog for account metadata.
-- natural_balance = closing_balance in the account's normal sign convention
-- (positive = healthy balance for that account type).

CREATE OR REPLACE VIEW public.v_trial_balance AS
SELECT
  ab.organization_id,
  ab.financial_period_id,
  ab.account_code,
  bac.account_name,
  bac.account_name_en,
  bac.account_type,
  bac.normal_balance,
  ab.opening_balance,
  ab.debit_movement,
  ab.credit_movement,
  ab.closing_balance,
  CASE bac.normal_balance
    WHEN 'debit'  THEN  ab.closing_balance   -- positive = debit balance (natural for assets/expenses)
    WHEN 'credit' THEN -ab.closing_balance   -- positive = credit balance (natural for liabilities/equity/revenue)
    ELSE                ab.closing_balance
  END AS natural_balance,
  ab.transaction_count
FROM public.account_balances ab
LEFT JOIN public.bas_account_catalog bac ON bac.account_code = ab.account_code;

COMMENT ON VIEW public.v_trial_balance IS
  'Full trial balance per (organization, period, account). '
  'natural_balance is closing_balance in the account''s normal sign convention '
  '(positive natural_balance = account has a healthy balance). '
  'Join with financial_periods to filter by date range.';

GRANT SELECT ON public.v_trial_balance TO authenticated;

-- v_opening_balance_status: Per period — whether a formal OB entry exists.

CREATE OR REPLACE VIEW public.v_opening_balance_status AS
SELECT
  fp.id              AS period_id,
  fp.organization_id,
  fp.period_name,
  fp.period_start,
  fp.period_end,
  fp.status          AS period_status,
  je.id              AS ob_entry_id,
  je.voucher_number  AS ob_voucher_number,
  je.total_debit     AS ob_total_debit,
  je.total_credit    AS ob_total_credit,
  je.posted_at       AS ob_posted_at,
  je.posted_by       AS ob_posted_by,
  (je.id IS NOT NULL) AS has_opening_balance_entry
FROM public.financial_periods fp
LEFT JOIN public.journal_entries je
  ON  je.organization_id    = fp.organization_id
  AND je.source_entity_id   = fp.id
  AND je.entry_type         = 'opening_balance'
  AND je.status             = 'posted';

COMMENT ON VIEW public.v_opening_balance_status IS
  'Per financial period: shows whether a formal opening balance journal entry '
  '(entry_type=opening_balance, series O) exists.';

GRANT SELECT ON public.v_opening_balance_status TO authenticated;
