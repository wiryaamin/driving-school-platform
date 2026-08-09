-- =============================================================================
-- Payroll & Tax Clearing — Tenant Account Resolution
--
-- Continuing the finance-domain impact analysis: payroll accounts
-- (7010/7210/2710/2731/2940) and the tax settlement account (1630) were
-- grepped against every finance migration — unlike AR/VAT-output/deferred-
-- revenue, NOTHING outside payroll_posting_engine.sql and
-- tax_and_vat_clearing.sql itself references these codes. No financial
-- close check, audit snapshot, or reconciliation function depends on them.
-- They are genuinely isolated, same safety class as Payment.Cash.* — safe
-- to resolve per-tenant via the same resolve_org_bas_account() mechanism.
--
-- VAT clearing accounts (2610/2612/2621/2640/2650) are NOT included here —
-- create_vat_clearing_run() reads account_balances WHERE account_code IN
-- (those exact codes) to compute the net VAT position; that read would
-- silently break for any tenant who remapped one of them. Left fixed.
-- =============================================================================

-- ─── Platform default templates ────────────────────────────────────────────

INSERT INTO public.platform_bas_event_mappings
  (event_type, account_debit, account_credit, vat_rate_code, description)
VALUES
  ('Payroll.Salary',                  '7010', '7010', NULL, 'Lön (bruttolön)'),
  ('Payroll.EmployerContribExpense',  '7210', '7210', NULL, 'Sociala avgifter (kostnad)'),
  ('Payroll.WithheldTaxLiability',    '2710', '2710', NULL, 'Personalskatt (skuld)'),
  ('Payroll.EmployerContribLiability','2731', '2731', NULL, 'Sociala avgifter (skuld)'),
  ('Payroll.AccruedSalary',           '2940', '2940', NULL, 'Upplupna löner (nettolön)'),
  ('Tax.ClearingAccount',             '1630', '1630', NULL, 'Avräkning för skatter och avgifter'),
  ('Treasury.BankAccount',            '1930', '1930', NULL, 'Huvudkonto för löne- och skatteutbetalningar')
ON CONFLICT (event_type) DO NOTHING;

-- ─── post_payroll_journal ───────────────────────────────────────────────────

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
  v_run        payroll_runs%ROWTYPE;
  v_entry_id   uuid;
  v_lines      jsonb := '[]'::jsonb;
  v_entry_date date;
  v_desc       text;
  v_acct_salary   text;
  v_acct_contrib_exp  text;
  v_acct_tax_liab     text;
  v_acct_contrib_liab text;
  v_acct_accrued      text;
BEGIN
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;

  IF v_run.journal_entry_id IS NOT NULL THEN
    RETURN v_run.journal_entry_id;
  END IF;

  IF v_run.status NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'PAYROLL_NOT_POSTABLE: run % has status %; must be draft or ready',
      p_run_id, v_run.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_run.entry_count = 0 THEN
    RAISE EXCEPTION 'PAYROLL_EMPTY_RUN: run % has no entries; add employees before posting', p_run_id
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.update_payroll_run_totals(p_run_id);
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;

  v_entry_date := COALESCE(v_run.pay_date, v_run.pay_period_end);
  v_desc       := 'Lönespecifikation ' || to_char(v_run.pay_period_start, 'YYYY-MM') || '–' || to_char(v_run.pay_period_end, 'YYYY-MM-DD');

  v_acct_salary       := resolve_org_bas_account(v_run.organization_id, 'Payroll.Salary');
  v_acct_contrib_exp  := resolve_org_bas_account(v_run.organization_id, 'Payroll.EmployerContribExpense');
  v_acct_tax_liab     := resolve_org_bas_account(v_run.organization_id, 'Payroll.WithheldTaxLiability');
  v_acct_contrib_liab := resolve_org_bas_account(v_run.organization_id, 'Payroll.EmployerContribLiability');
  v_acct_accrued      := resolve_org_bas_account(v_run.organization_id, 'Payroll.AccruedSalary');

  v_lines := v_lines || jsonb_build_object(
    'account_code',  v_acct_salary,
    'debit_amount',  v_run.total_gross,
    'credit_amount', 0,
    'description',   'Löner ' || to_char(v_run.pay_period_start, 'YYYY-MM')
  );

  IF v_run.total_employer_contrib > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code',  v_acct_contrib_exp,
      'debit_amount',  v_run.total_employer_contrib,
      'credit_amount', 0,
      'description',   'Arbetsgivaravgifter ' || to_char(v_run.pay_period_start, 'YYYY-MM')
    );
  END IF;

  IF v_run.total_withheld_tax > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code',  v_acct_tax_liab,
      'debit_amount',  0,
      'credit_amount', v_run.total_withheld_tax,
      'description',   'Avdragen preliminärskatt ' || to_char(v_run.pay_period_start, 'YYYY-MM')
    );
  END IF;

  IF v_run.total_employer_contrib > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code',  v_acct_contrib_liab,
      'debit_amount',  0,
      'credit_amount', v_run.total_employer_contrib,
      'description',   'Arbetsgivaravgiftsskuld ' || to_char(v_run.pay_period_start, 'YYYY-MM')
    );
  END IF;

  v_lines := v_lines || jsonb_build_object(
    'account_code',  v_acct_accrued,
    'debit_amount',  0,
    'credit_amount', v_run.total_net_pay,
    'description',   'Upplupna löner (nettolön) ' || to_char(v_run.pay_period_start, 'YYYY-MM')
  );

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
  'Posts the balanced payroll journal entry (series L) for a run. Accounts are tenant-'
  'resolved via resolve_org_bas_account() (Payroll.Salary/EmployerContribExpense/'
  'WithheldTaxLiability/EmployerContribLiability/AccruedSalary) — isolated accounts, no '
  'other finance subsystem depends on their specific codes. Always balanced. Idempotent.';

GRANT EXECUTE ON FUNCTION public.post_payroll_journal(uuid, uuid) TO authenticated, service_role;

-- ─── post_salary_payment ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_salary_payment(
  p_run_id          uuid,
  p_payment_date    date    DEFAULT NULL,
  p_bank_account    text    DEFAULT NULL,
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
  v_acct_accrued text;
  v_bank_acct    text;
BEGIN
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;

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

  v_acct_accrued := resolve_org_bas_account(v_run.organization_id, 'Payroll.AccruedSalary');
  -- Explicit p_bank_account (if a caller ever supplies one) still wins; otherwise
  -- resolve the tenant's configured treasury account.
  v_bank_acct    := COALESCE(p_bank_account, resolve_org_bas_account(v_run.organization_id, 'Treasury.BankAccount'));

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_acct_accrued,
      'debit_amount',  v_run.total_net_pay,
      'credit_amount', 0,
      'description',   'Utbetalning nettolön ' || to_char(v_date, 'YYYY-MM-DD')
    ),
    jsonb_build_object(
      'account_code',  v_bank_acct,
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
  'Posts the salary payment journal entry (DR Payroll.AccruedSalary / CR bank). Bank '
  'account is tenant-resolved via Treasury.BankAccount unless p_bank_account is '
  'explicitly supplied. Idempotent.';

GRANT EXECUTE ON FUNCTION public.post_salary_payment(uuid, date, text, uuid) TO authenticated, service_role;

-- ─── post_tax_clearing_journal ───────────────────────────────────────────────

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
  v_acct_tax_liab     text;
  v_acct_contrib_liab text;
  v_acct_clearing     text;
BEGIN
  SELECT * INTO v_rem FROM tax_remittances WHERE id = p_remittance_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_NOT_FOUND: %', p_remittance_id USING ERRCODE = 'P0001';
  END IF;

  IF v_rem.clearing_entry_id IS NOT NULL THEN
    RETURN v_rem.clearing_entry_id;
  END IF;

  IF v_rem.status != 'pending' THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_NOT_PENDING: remittance % has status % — must be pending',
      p_remittance_id, v_rem.status
      USING ERRCODE = 'P0001';
  END IF;

  v_desc := 'Skatteavräkning ' || to_char(v_rem.declaration_period_start, 'YYYY-MM');

  v_acct_tax_liab     := resolve_org_bas_account(v_rem.organization_id, 'Payroll.WithheldTaxLiability');
  v_acct_contrib_liab := resolve_org_bas_account(v_rem.organization_id, 'Payroll.EmployerContribLiability');
  v_acct_clearing     := resolve_org_bas_account(v_rem.organization_id, 'Tax.ClearingAccount');

  IF v_rem.withheld_tax_amount > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code',  v_acct_tax_liab,
      'debit_amount',  v_rem.withheld_tax_amount,
      'credit_amount', 0,
      'description',   'Personalskatt ' || to_char(v_rem.declaration_period_start, 'YYYY-MM')
    );
  END IF;

  IF v_rem.employer_contrib_amount > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code',  v_acct_contrib_liab,
      'debit_amount',  v_rem.employer_contrib_amount,
      'credit_amount', 0,
      'description',   'Arbetsgivaravgifter ' || to_char(v_rem.declaration_period_start, 'YYYY-MM')
    );
  END IF;

  v_lines := v_lines || jsonb_build_object(
    'account_code',  v_acct_clearing,
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
    p_actor_id            := p_actor_id
  );

  UPDATE tax_remittances
  SET status           = 'clearing_posted',
      clearing_entry_id = v_entry_id
  WHERE id = p_remittance_id;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_tax_clearing_journal(uuid, uuid) IS
  'Posts the Skatteverket tax clearing journal entry. Accounts are tenant-resolved via '
  'resolve_org_bas_account() (Payroll.WithheldTaxLiability/EmployerContribLiability, '
  'Tax.ClearingAccount). Idempotent.';

GRANT EXECUTE ON FUNCTION public.post_tax_clearing_journal(uuid, uuid) TO authenticated, service_role;

-- ─── post_tax_payment_journal ────────────────────────────────────────────────
-- Signature/status/field-updates preserved exactly from the original
-- (20260604000003) — only the two hardcoded account_code literals change.

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
  v_acct_clearing text;
  v_bank_acct     text;
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

  v_acct_clearing := resolve_org_bas_account(v_rem.organization_id, 'Tax.ClearingAccount');
  v_bank_acct     := resolve_org_bas_account(v_rem.organization_id, 'Treasury.BankAccount');

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_acct_clearing, 'debit_amount', v_rem.total_amount, 'credit_amount', 0,
                       'description', 'Skattekonto betalning ' || to_char(v_date, 'YYYY-MM-DD')),
    jsonb_build_object('account_code', v_bank_acct, 'debit_amount', 0, 'credit_amount', v_rem.total_amount,
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
