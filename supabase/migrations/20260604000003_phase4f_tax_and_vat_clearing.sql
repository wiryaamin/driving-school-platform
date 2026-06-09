-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260604000003_phase4f_tax_and_vat_clearing.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4F — Tax Remittance & Multi-VAT Clearing
--
-- Implements Skatteverket remittance accounting (objective 7) and
-- multi-VAT-rate clearing infrastructure (objectives 6, 9):
--
--   tax_remittances   — Skatteverket payroll tax remittance records
--                       (withheld preliminary tax + employer contributions)
--   vat_clearing_runs — Multi-rate VAT clearing operations
--                       (handles 2610/25%, 2612/12%, 2621/6%, 2640 input)
--
-- SECURITY DEFINER posting functions:
--   create_tax_remittance(...)          → Create remittance header
--   post_tax_clearing_journal(...)      → DR 2710 + DR 2731 / CR 1630
--   post_tax_payment_journal(...)       → DR 1630 / CR 1930 (bank payment)
--   create_vat_clearing_run(...)        → Compute net VAT position from balances
--   post_vat_clearing_journal(...)      → Multi-rate clearing to 2650
--   post_vat_payment_journal(...)       → DR 2650 / CR 1930 (or DR 1930 / CR 2650 for refund)
--
-- VAT clearing balance proofs (multi-rate):
--   Payable:  DR 2610 + DR 2612 + DR 2621 = CR 2640 + CR 2650          ✓
--   Refund:   DR 2610 + DR 2612 + DR 2621 + DR 2650 = CR 2640          ✓
--
-- Tax clearing balance proof:
--   DR 2710 (withheld) + DR 2731 (contrib) = CR 1630 (total)           ✓
--
-- Views:
--   v_skatteverket_remittance_status — overdue remittances + status
--   v_vat_clearing_summary           — VAT position by clearing run
--
-- Dependencies:
--   20260604000001_phase4f_payroll_core.sql
--   20260602000002_phase4d_posting_engine.sql — post_journal_entry
--   20260602000001_phase4d_ledger_core.sql    — account_balances
--   20260601000002_phase4c_vat_and_periods.sql — vat_periods
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Tax Remittances ────────────────────────────────────────────────
-- Records the employer's monthly Skatteverket remittance:
-- withheld preliminary income tax (personalskatt) + employer contributions
-- (arbetsgivaravgifter). Two-step posting: clear liabilities → pay bank.

CREATE TABLE public.tax_remittances (
  id                        uuid                            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id           uuid                            NOT NULL REFERENCES public.organizations(id)     ON DELETE RESTRICT,
  financial_period_id       uuid                                     REFERENCES public.financial_periods(id)  ON DELETE RESTRICT,
  payroll_run_id            uuid                                     REFERENCES public.payroll_runs(id)       ON DELETE RESTRICT,
  declaration_period_start  date                            NOT NULL,
  declaration_period_end    date                            NOT NULL,
  due_date                  date,
  withheld_tax_amount       numeric(12,2)                   NOT NULL DEFAULT 0 CHECK (withheld_tax_amount >= 0),
  employer_contrib_amount   numeric(12,2)                   NOT NULL DEFAULT 0 CHECK (employer_contrib_amount >= 0),
  total_amount              numeric(12,2)                   NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status                    public.tax_remittance_status    NOT NULL DEFAULT 'pending',
  clearing_entry_id         uuid                                     REFERENCES public.journal_entries(id)   ON DELETE RESTRICT,
  payment_entry_id          uuid                                     REFERENCES public.journal_entries(id)   ON DELETE RESTRICT,
  payment_date              date,
  payment_reference         text,
  skatteverket_reference    text,
  notes                     text,
  metadata                  jsonb                           NOT NULL DEFAULT '{}',
  created_at                timestamptz                     NOT NULL DEFAULT now(),
  created_by                uuid                                     REFERENCES auth.users(id)               ON DELETE SET NULL,

  CONSTRAINT tr_total_consistent CHECK (total_amount = withheld_tax_amount + employer_contrib_amount),
  CONSTRAINT tr_dates_order       CHECK (declaration_period_end >= declaration_period_start)
);

COMMENT ON TABLE public.tax_remittances IS
  'Monthly Skatteverket payroll tax remittances. '
  'Two-step: (1) post_tax_clearing_journal clears 2710/2731 → 1630; '
  '(2) post_tax_payment_journal pays 1630 → 1930 (bank). '
  'total_amount = withheld_tax_amount + employer_contrib_amount.';
COMMENT ON COLUMN public.tax_remittances.declaration_period_start IS
  'The payroll month this remittance covers (first day of month).';
COMMENT ON COLUMN public.tax_remittances.due_date IS
  'Skatteverket due date — typically the 12th of the following month (exceptions exist).';

CREATE TRIGGER set_tax_remittances_updated_at
  BEFORE UPDATE ON public.tax_remittances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Section 2: VAT Clearing Runs ─────────────────────────────────────────────
-- Records each VAT period clearing operation.
-- Reads account_balances for 2610/2612/2621 (output) and 2640 (input) to
-- derive the net VAT position, then posts the multi-rate clearing journal.

CREATE TABLE public.vat_clearing_runs (
  id                   uuid                            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid                            NOT NULL REFERENCES public.organizations(id)     ON DELETE RESTRICT,
  vat_period_id        uuid                                     REFERENCES public.vat_periods(id)        ON DELETE RESTRICT,
  financial_period_id  uuid                                     REFERENCES public.financial_periods(id)  ON DELETE RESTRICT,
  run_date             date                            NOT NULL DEFAULT CURRENT_DATE,
  output_vat_25        numeric(12,2)                   NOT NULL DEFAULT 0 CHECK (output_vat_25 >= 0),
  output_vat_12        numeric(12,2)                   NOT NULL DEFAULT 0 CHECK (output_vat_12 >= 0),
  output_vat_6         numeric(12,2)                   NOT NULL DEFAULT 0 CHECK (output_vat_6 >= 0),
  total_output_vat     numeric(12,2)                   NOT NULL DEFAULT 0 CHECK (total_output_vat >= 0),
  total_input_vat      numeric(12,2)                   NOT NULL DEFAULT 0 CHECK (total_input_vat >= 0),
  net_vat_payable      numeric(12,2)                   NOT NULL DEFAULT 0,  -- negative = refund owed
  status               public.tax_remittance_status    NOT NULL DEFAULT 'pending',
  clearing_entry_id    uuid                                     REFERENCES public.journal_entries(id)   ON DELETE RESTRICT,
  payment_entry_id     uuid                                     REFERENCES public.journal_entries(id)   ON DELETE RESTRICT,
  payment_date         date,
  notes                text,
  metadata             jsonb                           NOT NULL DEFAULT '{}',
  created_at           timestamptz                     NOT NULL DEFAULT now(),
  created_by           uuid                                     REFERENCES auth.users(id)               ON DELETE SET NULL,

  CONSTRAINT vcr_output_sum CHECK (total_output_vat = output_vat_25 + output_vat_12 + output_vat_6),
  CONSTRAINT vcr_net_check   CHECK (net_vat_payable = total_output_vat - total_input_vat)
);

COMMENT ON TABLE public.vat_clearing_runs IS
  'Multi-rate VAT clearing operations. '
  'output_vat_25 from 2610, output_vat_12 from 2612, output_vat_6 from 2621, '
  'total_input_vat from 2640. net_vat_payable = total_output - total_input. '
  'Negative net_vat_payable means a VAT refund is owed by Skatteverket.';
COMMENT ON COLUMN public.vat_clearing_runs.net_vat_payable IS
  'Positive = payable to Skatteverket. Negative = refund owed from Skatteverket.';

CREATE TRIGGER set_vat_clearing_runs_updated_at
  BEFORE UPDATE ON public.vat_clearing_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Section 3: RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.tax_remittances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_clearing_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_remittances_org_read"
  ON public.tax_remittances FOR SELECT
  USING (organization_id = public.auth_organization_id() AND public.has_permission('finance:tax:read'));

CREATE POLICY "vat_clearing_runs_org_read"
  ON public.vat_clearing_runs FOR SELECT
  USING (organization_id = public.auth_organization_id() AND public.has_permission('finance:tax:read'));

GRANT SELECT                 ON public.tax_remittances   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tax_remittances   TO service_role;
GRANT SELECT                 ON public.vat_clearing_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vat_clearing_runs TO service_role;

-- ── Section 4: create_tax_remittance ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_tax_remittance(
  p_org_id                  uuid,
  p_financial_period_id     uuid    DEFAULT NULL,
  p_payroll_run_id          uuid    DEFAULT NULL,
  p_declaration_start       date    DEFAULT NULL,
  p_declaration_end         date    DEFAULT NULL,
  p_due_date                date    DEFAULT NULL,
  p_withheld_tax_amount     numeric DEFAULT 0,
  p_employer_contrib_amount numeric DEFAULT 0,
  p_notes                   text    DEFAULT NULL,
  p_actor_id                uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      uuid;
  v_total   numeric(12,2);
  v_start   date;
  v_end     date;
BEGIN
  v_start := COALESCE(p_declaration_start, date_trunc('month', CURRENT_DATE)::date);
  v_end   := COALESCE(p_declaration_end,   (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date);
  v_total := COALESCE(p_withheld_tax_amount, 0) + COALESCE(p_employer_contrib_amount, 0);

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_ZERO: total remittance amount must be > 0' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO tax_remittances (
    organization_id, financial_period_id, payroll_run_id,
    declaration_period_start, declaration_period_end, due_date,
    withheld_tax_amount, employer_contrib_amount, total_amount,
    notes, created_by
  ) VALUES (
    p_org_id, p_financial_period_id, p_payroll_run_id,
    v_start, v_end, p_due_date,
    COALESCE(p_withheld_tax_amount, 0), COALESCE(p_employer_contrib_amount, 0), v_total,
    p_notes, p_actor_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_tax_remittance(uuid, uuid, uuid, date, date, date, numeric, numeric, text, uuid)
  TO authenticated, service_role;

-- ── Section 5: post_tax_clearing_journal ──────────────────────────────────────
-- Clears the payroll tax liabilities to the Skattekonto (1630).
--   DR 2710 Personalskatt              (withheld_tax_amount, if > 0)
--   DR 2731 Sociala avgifter skuld     (employer_contrib_amount, if > 0)
--   CR 1630 Avräkning för skatter      (total_amount)
-- Balance: DR sum = total = CR ✓
-- Idempotent: returns existing entry if already posted.

CREATE OR REPLACE FUNCTION public.post_tax_clearing_journal(
  p_remittance_id uuid,
  p_actor_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rem      tax_remittances%ROWTYPE;
  v_entry_id uuid;
  v_lines    jsonb := '[]'::jsonb;
  v_desc     text;
BEGIN
  SELECT * INTO v_rem FROM tax_remittances WHERE id = p_remittance_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_NOT_FOUND: %', p_remittance_id USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency
  IF v_rem.clearing_entry_id IS NOT NULL THEN
    RETURN v_rem.clearing_entry_id;
  END IF;

  IF v_rem.status != 'pending' THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_NOT_PENDING: remittance % has status % — must be pending',
      p_remittance_id, v_rem.status
      USING ERRCODE = 'P0001';
  END IF;

  v_desc := 'Skatteavräkning ' || to_char(v_rem.declaration_period_start, 'YYYY-MM');

  -- DR 2710 Personalskatt (if > 0)
  IF v_rem.withheld_tax_amount > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code',  '2710',
      'debit_amount',  v_rem.withheld_tax_amount,
      'credit_amount', 0,
      'description',   'Personalskatt ' || to_char(v_rem.declaration_period_start, 'YYYY-MM')
    );
  END IF;

  -- DR 2731 Sociala avgifter (if > 0)
  IF v_rem.employer_contrib_amount > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code',  '2731',
      'debit_amount',  v_rem.employer_contrib_amount,
      'credit_amount', 0,
      'description',   'Arbetsgivaravgifter ' || to_char(v_rem.declaration_period_start, 'YYYY-MM')
    );
  END IF;

  -- CR 1630 Skattekonto (total)
  v_lines := v_lines || jsonb_build_object(
    'account_code',  '1630',
    'debit_amount',  0,
    'credit_amount', v_rem.total_amount,
    'description',   'Skattekonto avräkning ' || to_char(v_rem.declaration_period_start, 'YYYY-MM')
  );

  v_entry_id := public.post_journal_entry(
    p_org_id             := v_rem.organization_id,
    p_period_id          := v_rem.financial_period_id,
    p_entry_type         := 'standard',
    p_entry_date         := COALESCE(v_rem.declaration_period_end, CURRENT_DATE),
    p_description        := v_desc,
    p_lines              := v_lines,
    p_source_event_type  := 'Tax.Cleared',
    p_source_entity_type := 'tax_remittance',
    p_source_entity_id   := p_remittance_id,
    p_voucher_series     := 'A',
    p_actor_id           := p_actor_id
  );

  UPDATE tax_remittances
  SET status           = 'clearing_posted',
      clearing_entry_id = v_entry_id
  WHERE id = p_remittance_id;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_tax_clearing_journal(uuid, uuid) TO authenticated, service_role;

-- ── Section 6: post_tax_payment_journal ───────────────────────────────────────
-- Posts the actual Skatteverket bank payment.
--   DR 1630 Avräkning för skatter (total_amount)
--   CR 1930 Bank                  (total_amount)
-- Idempotent.

CREATE OR REPLACE FUNCTION public.post_tax_payment_journal(
  p_remittance_id uuid,
  p_payment_date  date DEFAULT NULL,
  p_reference     text DEFAULT NULL,
  p_actor_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rem      tax_remittances%ROWTYPE;
  v_entry_id uuid;
  v_date     date;
  v_lines    jsonb;
BEGIN
  SELECT * INTO v_rem FROM tax_remittances WHERE id = p_remittance_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_NOT_FOUND: %', p_remittance_id USING ERRCODE = 'P0001';
  END IF;

  IF v_rem.payment_entry_id IS NOT NULL THEN RETURN v_rem.payment_entry_id; END IF;

  IF v_rem.status != 'clearing_posted' THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_CLEARING_REQUIRED: remittance % must have clearing_posted status before payment',
      p_remittance_id
      USING ERRCODE = 'P0001';
  END IF;

  v_date := COALESCE(p_payment_date, CURRENT_DATE);

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1630', 'debit_amount', v_rem.total_amount, 'credit_amount', 0,
                       'description', 'Skattekonto betalning ' || to_char(v_date, 'YYYY-MM-DD')),
    jsonb_build_object('account_code', '1930', 'debit_amount', 0, 'credit_amount', v_rem.total_amount,
                       'description', 'Skattebetalning till Skatteverket ' || to_char(v_date, 'YYYY-MM-DD'))
  );

  v_entry_id := public.post_journal_entry(
    p_org_id             := v_rem.organization_id,
    p_period_id          := v_rem.financial_period_id,
    p_entry_type         := 'standard',
    p_entry_date         := v_date,
    p_description        := 'Skattebetalning Skatteverket ' || to_char(v_date, 'YYYY-MM-DD'),
    p_lines              := v_lines,
    p_source_event_type  := 'Tax.Paid',
    p_source_entity_type := 'tax_remittance',
    p_source_entity_id   := p_remittance_id,
    p_voucher_series     := 'A',
    p_actor_id           := p_actor_id
  );

  UPDATE tax_remittances
  SET status               = 'payment_posted',
      payment_entry_id     = v_entry_id,
      payment_date         = v_date,
      payment_reference    = COALESCE(p_reference, payment_reference),
      skatteverket_reference = COALESCE(p_reference, skatteverket_reference)
  WHERE id = p_remittance_id;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_tax_payment_journal(uuid, date, text, uuid) TO authenticated, service_role;

-- ── Section 7: create_vat_clearing_run ────────────────────────────────────────
-- Reads current account_balances to compute the VAT position for a period.
-- Stores the computed amounts; does NOT post the journal (call post_vat_clearing_journal next).
-- The account_balances.closing_balance for credit-normal accounts (2610/2612/2621) is negative.
-- The account_balances.closing_balance for 2640 (debit-normal) is positive.

CREATE OR REPLACE FUNCTION public.create_vat_clearing_run(
  p_org_id             uuid,
  p_financial_period_id uuid,
  p_vat_period_id      uuid    DEFAULT NULL,
  p_run_date           date    DEFAULT NULL,
  p_notes              text    DEFAULT NULL,
  p_actor_id           uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id        uuid;
  v_o25           numeric(12,2) := 0;
  v_o12           numeric(12,2) := 0;
  v_o6            numeric(12,2) := 0;
  v_input         numeric(12,2) := 0;
  v_total_out     numeric(12,2);
  v_net           numeric(12,2);
  v_bal           record;
BEGIN
  IF p_financial_period_id IS NULL THEN
    RAISE EXCEPTION 'VAT_CLEARING_PERIOD_REQUIRED: financial_period_id is required' USING ERRCODE = 'P0001';
  END IF;

  -- Read current closing balances for VAT accounts
  -- Credit-normal accounts (2610/2612/2621) have negative closing_balance when credit balance exists
  -- Debit-normal account (2640) has positive closing_balance when debit balance exists
  FOR v_bal IN
    SELECT account_code, closing_balance
    FROM   account_balances
    WHERE  organization_id     = p_org_id
      AND  financial_period_id = p_financial_period_id
      AND  account_code        IN ('2610', '2612', '2621', '2640')
  LOOP
    CASE v_bal.account_code
      WHEN '2610' THEN v_o25   := ABS(LEAST(v_bal.closing_balance, 0)); -- credit balance → positive amount
      WHEN '2612' THEN v_o12   := ABS(LEAST(v_bal.closing_balance, 0));
      WHEN '2621' THEN v_o6    := ABS(LEAST(v_bal.closing_balance, 0));
      WHEN '2640' THEN v_input := GREATEST(v_bal.closing_balance, 0);   -- debit balance → positive amount
    END CASE;
  END LOOP;

  v_total_out := v_o25 + v_o12 + v_o6;
  v_net       := v_total_out - v_input;

  IF v_total_out = 0 AND v_input = 0 THEN
    RAISE EXCEPTION 'VAT_CLEARING_NOTHING_TO_CLEAR: no VAT balances found for period %', p_financial_period_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO vat_clearing_runs (
    organization_id, vat_period_id, financial_period_id, run_date,
    output_vat_25, output_vat_12, output_vat_6, total_output_vat,
    total_input_vat, net_vat_payable, notes, created_by
  ) VALUES (
    p_org_id, p_vat_period_id, p_financial_period_id, COALESCE(p_run_date, CURRENT_DATE),
    v_o25, v_o12, v_o6, v_total_out,
    v_input, v_net, p_notes, p_actor_id
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_vat_clearing_run(uuid, uuid, uuid, date, text, uuid) TO authenticated, service_role;

-- ── Section 8: post_vat_clearing_journal ──────────────────────────────────────
-- Posts the multi-rate VAT clearing journal:
-- If net_vat_payable > 0 (payable):
--   DR 2610 output_vat_25 + DR 2612 output_vat_12 + DR 2621 output_vat_6 (if > 0)
--   CR 2640 total_input_vat (if > 0)
--   CR 2650 net_vat_payable
-- If net_vat_payable < 0 (refund owed):
--   DR 2610 + DR 2612 + DR 2621
--   DR 2650 abs(net_vat_payable)
--   CR 2640 total_input_vat
-- If net_vat_payable = 0:
--   DR 2610 + DR 2612 + DR 2621
--   CR 2640 total_input_vat (should equal total_output_vat)
-- All cases satisfy: sum(DR) = sum(CR) ✓

CREATE OR REPLACE FUNCTION public.post_vat_clearing_journal(
  p_run_id   uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run      vat_clearing_runs%ROWTYPE;
  v_entry_id uuid;
  v_lines    jsonb := '[]'::jsonb;
  v_net_abs  numeric(12,2);
BEGIN
  SELECT * INTO v_run FROM vat_clearing_runs WHERE id = p_run_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT_CLEARING_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;

  IF v_run.clearing_entry_id IS NOT NULL THEN RETURN v_run.clearing_entry_id; END IF;

  IF v_run.status != 'pending' THEN
    RAISE EXCEPTION 'VAT_CLEARING_NOT_PENDING: run % has status %', p_run_id, v_run.status
      USING ERRCODE = 'P0001';
  END IF;

  -- DR: clear each output VAT account (if balance > 0)
  IF v_run.output_vat_25 > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '2610', 'debit_amount', v_run.output_vat_25, 'credit_amount', 0,
      'description', 'Utgående moms 25% avräkning'
    );
  END IF;
  IF v_run.output_vat_12 > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '2612', 'debit_amount', v_run.output_vat_12, 'credit_amount', 0,
      'description', 'Utgående moms 12% avräkning'
    );
  END IF;
  IF v_run.output_vat_6 > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '2621', 'debit_amount', v_run.output_vat_6, 'credit_amount', 0,
      'description', 'Utgående moms 6% avräkning'
    );
  END IF;

  -- net_vat_payable > 0: CR 2640 (clear input) + CR 2650 (net payable)
  IF v_run.net_vat_payable >= 0 THEN
    IF v_run.total_input_vat > 0 THEN
      v_lines := v_lines || jsonb_build_object(
        'account_code', '2640', 'debit_amount', 0, 'credit_amount', v_run.total_input_vat,
        'description', 'Ingående moms avräkning'
      );
    END IF;
    IF v_run.net_vat_payable > 0 THEN
      v_lines := v_lines || jsonb_build_object(
        'account_code', '2650', 'debit_amount', 0, 'credit_amount', v_run.net_vat_payable,
        'description', 'Momsredovisning netto att betala'
      );
    END IF;
  ELSE
    -- net_vat_payable < 0: DR 2650 (refund receivable) + CR 2640 (clear input)
    v_net_abs := ABS(v_run.net_vat_payable);
    v_lines := v_lines || jsonb_build_object(
      'account_code', '2650', 'debit_amount', v_net_abs, 'credit_amount', 0,
      'description', 'Momsredovisning överskjutande ingående moms (återbetalning)'
    );
    IF v_run.total_input_vat > 0 THEN
      v_lines := v_lines || jsonb_build_object(
        'account_code', '2640', 'debit_amount', 0, 'credit_amount', v_run.total_input_vat,
        'description', 'Ingående moms avräkning'
      );
    END IF;
  END IF;

  v_entry_id := public.post_journal_entry(
    p_org_id             := v_run.organization_id,
    p_period_id          := v_run.financial_period_id,
    p_entry_type         := 'standard',
    p_entry_date         := v_run.run_date,
    p_description        := 'Momsredovisning ' || to_char(v_run.run_date, 'YYYY-MM'),
    p_lines              := v_lines,
    p_source_event_type  := 'VAT.Cleared',
    p_source_entity_type := 'vat_clearing_run',
    p_source_entity_id   := p_run_id,
    p_voucher_series     := 'A',
    p_actor_id           := p_actor_id
  );

  UPDATE vat_clearing_runs
  SET status           = 'clearing_posted',
      clearing_entry_id = v_entry_id
  WHERE id = p_run_id;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_vat_clearing_journal(uuid, uuid) TO authenticated, service_role;

-- ── Section 9: post_vat_payment_journal ───────────────────────────────────────
-- Posts the VAT payment to Skatteverket or receives the VAT refund.
-- Payable (net > 0): DR 2650 / CR 1930 (pay Skatteverket)
-- Refund (net < 0):  DR 1930 / CR 2650 (receive refund from Skatteverket)

CREATE OR REPLACE FUNCTION public.post_vat_payment_journal(
  p_run_id       uuid,
  p_payment_date date DEFAULT NULL,
  p_actor_id     uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run      vat_clearing_runs%ROWTYPE;
  v_entry_id uuid;
  v_date     date;
  v_amount   numeric(12,2);
  v_lines    jsonb;
  v_desc     text;
BEGIN
  SELECT * INTO v_run FROM vat_clearing_runs WHERE id = p_run_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT_CLEARING_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;

  IF v_run.payment_entry_id IS NOT NULL THEN RETURN v_run.payment_entry_id; END IF;

  IF v_run.status != 'clearing_posted' THEN
    RAISE EXCEPTION 'VAT_CLEARING_REQUIRED: run % must have clearing_posted status before payment', p_run_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_run.net_vat_payable = 0 THEN
    RAISE EXCEPTION 'VAT_ZERO_NET: net_vat_payable is 0 — no payment or refund needed for run %', p_run_id
      USING ERRCODE = 'P0001';
  END IF;

  v_date   := COALESCE(p_payment_date, CURRENT_DATE);
  v_amount := ABS(v_run.net_vat_payable);

  IF v_run.net_vat_payable > 0 THEN
    -- Pay Skatteverket: DR 2650 / CR 1930
    v_desc  := 'Momsbetalning Skatteverket ' || to_char(v_date, 'YYYY-MM-DD');
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '2650', 'debit_amount', v_amount, 'credit_amount', 0, 'description', v_desc),
      jsonb_build_object('account_code', '1930', 'debit_amount', 0, 'credit_amount', v_amount, 'description', v_desc)
    );
  ELSE
    -- Receive VAT refund: DR 1930 / CR 2650
    v_desc  := 'Momsåterbetalning från Skatteverket ' || to_char(v_date, 'YYYY-MM-DD');
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '1930', 'debit_amount', v_amount, 'credit_amount', 0, 'description', v_desc),
      jsonb_build_object('account_code', '2650', 'debit_amount', 0, 'credit_amount', v_amount, 'description', v_desc)
    );
  END IF;

  v_entry_id := public.post_journal_entry(
    p_org_id             := v_run.organization_id,
    p_period_id          := v_run.financial_period_id,
    p_entry_type         := 'standard',
    p_entry_date         := v_date,
    p_description        := v_desc,
    p_lines              := v_lines,
    p_source_event_type  := 'VAT.Paid',
    p_source_entity_type := 'vat_clearing_run',
    p_source_entity_id   := p_run_id,
    p_voucher_series     := 'A',
    p_actor_id           := p_actor_id
  );

  UPDATE vat_clearing_runs
  SET status           = 'payment_posted',
      payment_entry_id = v_entry_id,
      payment_date     = v_date
  WHERE id = p_run_id;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_vat_payment_journal(uuid, date, uuid) TO authenticated, service_role;

-- ── Section 10: Views ─────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_skatteverket_remittance_status AS
SELECT
  tr.id,
  tr.organization_id,
  tr.financial_period_id,
  tr.payroll_run_id,
  tr.declaration_period_start,
  tr.declaration_period_end,
  tr.due_date,
  tr.withheld_tax_amount,
  tr.employer_contrib_amount,
  tr.total_amount,
  tr.status,
  tr.payment_date,
  tr.payment_reference,
  tr.skatteverket_reference,
  CASE
    WHEN tr.status NOT IN ('completed', 'cancelled')
     AND tr.due_date IS NOT NULL
     AND tr.due_date < CURRENT_DATE
    THEN CURRENT_DATE - tr.due_date
    ELSE NULL
  END AS days_overdue,
  tr.created_at
FROM public.tax_remittances tr;

COMMENT ON VIEW public.v_skatteverket_remittance_status IS
  'Skatteverket remittance status with days_overdue for unpaid past-due remittances.';

CREATE OR REPLACE VIEW public.v_vat_clearing_summary AS
SELECT
  vcr.id,
  vcr.organization_id,
  vcr.vat_period_id,
  vcr.financial_period_id,
  vcr.run_date,
  vcr.output_vat_25,
  vcr.output_vat_12,
  vcr.output_vat_6,
  vcr.total_output_vat,
  vcr.total_input_vat,
  vcr.net_vat_payable,
  CASE
    WHEN vcr.net_vat_payable > 0 THEN 'payable'
    WHEN vcr.net_vat_payable < 0 THEN 'refund'
    ELSE 'zero'
  END AS position,
  vcr.status,
  vcr.payment_date,
  vcr.created_at
FROM public.vat_clearing_runs vcr;

COMMENT ON VIEW public.v_vat_clearing_summary IS
  'VAT clearing run summary with position indicator (payable/refund/zero).';

GRANT SELECT ON public.v_skatteverket_remittance_status TO authenticated;
GRANT SELECT ON public.v_vat_clearing_summary           TO authenticated;
