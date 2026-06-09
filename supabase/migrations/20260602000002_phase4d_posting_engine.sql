-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260602000002_phase4d_posting_engine.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4D — Double-Entry Posting Engine
--
-- Core SECURITY DEFINER functions for posting business events to the ledger:
--
--   find_period_for_date(org_id, date)
--     → Helper: find financial_period covering a given date (or NULL)
--
--   post_journal_entry(p_org_id, p_period_id, p_entry_type, p_entry_date,
--                      p_description, p_lines, p_source_event_type,
--                      p_source_entity_type, p_source_entity_id,
--                      p_voucher_series, p_reversal_of_entry_id,
--                      p_correction_of_entry_id, p_actor_id)
--     → Core atomic posting: validates balance, assigns voucher number,
--       inserts journal_entry + journal_lines, updates account_balances,
--       emits Journal.Posted event.
--
--   post_invoice_journal_entry(p_invoice_id, p_actor_id)
--     → Posts AR entry when an invoice is issued:
--         DR 1510 Kundfordringar  (total_amount)
--         CR 2970 Förutbetalda intäkter (subtotal, for package invoices)
--         CR 3041 Körlektioner          (subtotal, for direct invoices)
--         CR 2610 Utgående moms 25%     (vat_amount, if > 0)
--
--   post_payment_journal_entry(p_payment_id, p_actor_id)
--     → Posts cash receipt when payment is confirmed:
--         DR 1930 Bank            (amount)
--         CR 1510 Kundfordringar  (amount)
--
--   post_void_journal_entry(p_invoice_id, p_actor_id)
--     → Finds the original invoice journal entry and creates a reversal.
--
-- All functions are idempotent: posting the same source entity twice returns
-- the existing entry_id without creating a duplicate.
--
-- Dependencies:
--   20260602000001_phase4d_ledger_core.sql
--   20260530000001_phase4a_commercial_core.sql  — invoices, payments, financial_periods
--   20260601000001_phase4c_swedish_finance_foundation.sql — platform_bas_event_mappings
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. find_period_for_date ───────────────────────────────────────────────────
-- Returns the financial_period_id covering p_date for the org, or NULL if none.
-- Returns the most recent period whose date range contains p_date.
-- Does NOT filter by status — callers check for locked status separately.

CREATE OR REPLACE FUNCTION public.find_period_for_date(
  p_org_id uuid,
  p_date   date
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM   public.financial_periods
  WHERE  organization_id = p_org_id
    AND  period_start   <= p_date
    AND  period_end     >= p_date
  ORDER  BY period_start DESC
  LIMIT  1;
$$;

COMMENT ON FUNCTION public.find_period_for_date(uuid, date) IS
  'Returns the financial_period_id covering p_date for the org. '
  'NULL if no period covers the date. Does not filter by period status.';

GRANT EXECUTE ON FUNCTION public.find_period_for_date(uuid, date) TO authenticated, service_role;

-- ── 2. post_journal_entry ─────────────────────────────────────────────────────
-- Core atomic double-entry posting function.
--
-- p_lines JSONB array format:
--   [
--     { "account_code": "1510", "debit_amount": 1250.00, "credit_amount": 0,
--       "description": "...", "vat_rate_code": null, "vat_amount": null },
--     { "account_code": "2970", "debit_amount": 0, "credit_amount": 1000.00,
--       "description": "...", "vat_rate_code": null, "vat_amount": null },
--     { "account_code": "2610", "debit_amount": 0, "credit_amount": 250.00,
--       "description": "...", "vat_rate_code": "SE25", "vat_amount": 250.00 }
--   ]
--
-- Invariants enforced:
--   1. At least 2 lines required
--   2. Each line: debit_amount XOR credit_amount (never both, never zero)
--   3. sum(debit_amount) = sum(credit_amount) — entry must balance
--   4. Period (if provided) must not be locked
--   5. Voucher number assigned gap-free from ledger_voucher_sequences
--   6. account_balances updated atomically per line
--   7. Journal.Posted event emitted

CREATE OR REPLACE FUNCTION public.post_journal_entry(
  p_org_id                  uuid,
  p_period_id               uuid,
  p_entry_type              public.journal_entry_type,
  p_entry_date              date,
  p_description             text,
  p_lines                   jsonb,
  p_source_event_type       text   DEFAULT NULL,
  p_source_entity_type      text   DEFAULT NULL,
  p_source_entity_id        uuid   DEFAULT NULL,
  p_voucher_series          text   DEFAULT 'A',
  p_reversal_of_entry_id    uuid   DEFAULT NULL,
  p_correction_of_entry_id  uuid   DEFAULT NULL,
  p_actor_id                uuid   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id       uuid;
  v_line           jsonb;
  v_line_number    int          := 1;
  v_total_debit    numeric(12,2) := 0;
  v_total_credit   numeric(12,2) := 0;
  v_debit          numeric(12,2);
  v_credit         numeric(12,2);
  v_vat_amount     numeric(12,2);
  v_vat_code       text;
  v_account_code   text;
  v_description    text;
  v_voucher_num    int;
  v_fiscal_year    int;
BEGIN
  -- 1. Validate lines array
  IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'LEDGER_INVALID_LINES: journal entry requires at least 2 lines, got %',
      COALESCE(jsonb_array_length(p_lines)::text, 'null')
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Validate each line and accumulate totals
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_debit        := COALESCE((v_line->>'debit_amount')::numeric,  0);
    v_credit       := COALESCE((v_line->>'credit_amount')::numeric, 0);
    v_account_code := v_line->>'account_code';

    IF v_account_code IS NULL OR v_account_code = '' THEN
      RAISE EXCEPTION 'LEDGER_MISSING_ACCOUNT: each line must have a non-empty account_code'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'LEDGER_NEGATIVE_AMOUNT: line amounts must be non-negative (account: %)', v_account_code
        USING ERRCODE = 'P0001';
    END IF;
    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'LEDGER_DUAL_SIDED_LINE: account % cannot have both debit and credit amounts', v_account_code
        USING ERRCODE = 'P0001';
    END IF;
    IF v_debit = 0 AND v_credit = 0 THEN
      RAISE EXCEPTION 'LEDGER_ZERO_LINE: account % must have a non-zero amount', v_account_code
        USING ERRCODE = 'P0001';
    END IF;

    v_total_debit  := v_total_debit  + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  -- 3. Enforce debit = credit balance
  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'LEDGER_IMBALANCED: total debit (%) ≠ total credit (%) — journal entry rejected. '
      'A double-entry ledger requires every entry to balance.',
      v_total_debit, v_total_credit
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Check period is not locked (if period provided)
  IF p_period_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM financial_periods
      WHERE  id = p_period_id AND status = 'locked'
    ) THEN
      RAISE EXCEPTION 'PERIOD_LOCKED: financial period % is locked; no new postings permitted',
        p_period_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 5. Assign gap-free voucher number from ledger_voucher_sequences
  v_fiscal_year := EXTRACT(YEAR FROM p_entry_date)::int;

  INSERT INTO ledger_voucher_sequences (organization_id, fiscal_year, voucher_series, last_number)
  VALUES (p_org_id, v_fiscal_year, p_voucher_series, 1)
  ON CONFLICT (organization_id, fiscal_year, voucher_series) DO UPDATE
    SET last_number = ledger_voucher_sequences.last_number + 1,
        updated_at  = now()
  RETURNING last_number INTO v_voucher_num;

  -- 6. Create journal entry header directly as 'posted' (no draft intermediate state)
  INSERT INTO journal_entries (
    organization_id,
    financial_period_id,
    entry_type,
    status,
    voucher_series,
    voucher_number,
    entry_date,
    description,
    source_event_type,
    source_entity_type,
    source_entity_id,
    reversal_of_entry_id,
    correction_of_entry_id,
    total_debit,
    total_credit,
    posted_at,
    posted_by,
    created_by
  ) VALUES (
    p_org_id,
    p_period_id,
    p_entry_type,
    'posted',
    p_voucher_series,
    v_voucher_num,
    p_entry_date,
    p_description,
    p_source_event_type,
    p_source_entity_type,
    p_source_entity_id,
    p_reversal_of_entry_id,
    p_correction_of_entry_id,
    v_total_debit,
    v_total_credit,
    now(),
    p_actor_id,
    p_actor_id
  ) RETURNING id INTO v_entry_id;

  -- 7. Insert journal lines and update account_balances atomically
  v_line_number := 1;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_debit        := COALESCE((v_line->>'debit_amount')::numeric,  0);
    v_credit       := COALESCE((v_line->>'credit_amount')::numeric, 0);
    v_account_code := v_line->>'account_code';
    v_description  := COALESCE(v_line->>'description', '');
    v_vat_code     := v_line->>'vat_rate_code';
    v_vat_amount   := CASE WHEN (v_line->>'vat_amount') IS NOT NULL
                           THEN (v_line->>'vat_amount')::numeric
                           ELSE NULL END;

    INSERT INTO journal_lines (
      organization_id, entry_id, line_number,
      account_code, debit_amount, credit_amount,
      vat_rate_code, vat_amount, description
    ) VALUES (
      p_org_id, v_entry_id, v_line_number,
      v_account_code, v_debit, v_credit,
      v_vat_code, v_vat_amount, v_description
    );

    -- Update account_balances cache (only when period is known)
    IF p_period_id IS NOT NULL THEN
      INSERT INTO account_balances (
        organization_id, financial_period_id, account_code,
        opening_balance, debit_movement, credit_movement,
        closing_balance, transaction_count, last_entry_id
      ) VALUES (
        p_org_id, p_period_id, v_account_code,
        0, v_debit, v_credit,
        v_debit - v_credit,
        1, v_entry_id
      )
      ON CONFLICT (organization_id, financial_period_id, account_code) DO UPDATE
        SET debit_movement   = account_balances.debit_movement  + v_debit,
            credit_movement  = account_balances.credit_movement + v_credit,
            closing_balance  = account_balances.opening_balance
                               + account_balances.debit_movement  + v_debit
                               - account_balances.credit_movement - v_credit,
            transaction_count = account_balances.transaction_count + 1,
            last_entry_id    = v_entry_id,
            updated_at       = now();
    END IF;

    v_line_number := v_line_number + 1;
  END LOOP;

  -- 8. Emit Journal.Posted event
  PERFORM insert_outbox_event(
    'Journal.Posted',
    'accounting',
    jsonb_build_object(
      'entry_id',             v_entry_id,
      'entry_type',           p_entry_type,
      'entry_date',           p_entry_date,
      'voucher_series',       p_voucher_series,
      'voucher_number',       v_voucher_num,
      'total_debit',          v_total_debit,
      'source_event_type',    p_source_event_type,
      'source_entity_type',   p_source_entity_type,
      'source_entity_id',     p_source_entity_id,
      'reversal_of_entry_id', p_reversal_of_entry_id
    ),
    p_org_id,
    NULL
  );

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_journal_entry(uuid, uuid, public.journal_entry_type, date, text, jsonb, text, text, uuid, text, uuid, uuid, uuid) IS
  'Core double-entry posting function. Validates balance, assigns voucher number, '
  'inserts journal_entry + journal_lines, updates account_balances, emits Journal.Posted. '
  'Raises LEDGER_IMBALANCED if sum(debit) ≠ sum(credit). '
  'Raises PERIOD_LOCKED if the target period is locked.';

GRANT EXECUTE ON FUNCTION public.post_journal_entry(uuid, uuid, public.journal_entry_type, date, text, jsonb, text, text, uuid, text, uuid, uuid, uuid)
  TO authenticated, service_role;

-- ── 3. post_invoice_journal_entry ─────────────────────────────────────────────
-- Posts the accounts-receivable journal entry when an invoice is issued.
--
-- Package invoices (student_package_id IS NOT NULL):
--   DR 1510 Kundfordringar      (total_amount)
--   CR 2970 Förutbetalda int.  (subtotal_amount — deferred revenue)
--   CR 2610 Utgående moms 25%  (vat_amount — if > 0)
--
-- Direct invoices (no package):
--   DR 1510 Kundfordringar      (total_amount)
--   CR 3041 Körlektioner        (subtotal_amount — recognized immediately)
--   CR 2610 Utgående moms 25%  (vat_amount — if > 0)
--
-- Idempotent: if an entry for this invoice already exists, returns it unchanged.

CREATE OR REPLACE FUNCTION public.post_invoice_journal_entry(
  p_invoice_id uuid,
  p_actor_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice        invoices%ROWTYPE;
  v_period_id      uuid;
  v_entry_id       uuid;
  v_revenue_acct   text;
  v_lines          jsonb;
  v_inv_date       date;
  v_mapping        platform_bas_event_mappings%ROWTYPE;
  v_vat_account    text := '2610';
BEGIN
  -- 1. Idempotency check: return existing entry if already posted
  SELECT id INTO v_entry_id
  FROM   journal_entries
  WHERE  organization_id    = (SELECT organization_id FROM invoices WHERE id = p_invoice_id)
    AND  source_entity_type = 'invoice'
    AND  source_entity_id   = p_invoice_id
    AND  entry_type         = 'standard'
    AND  status             = 'posted'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_entry_id;
  END IF;

  -- 2. Fetch and validate invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: invoice % not found', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.status NOT IN ('issued', 'paid', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'INVOICE_NOT_ISSUED: invoice % has status %; must be issued/paid/overdue to post',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Determine revenue account based on invoice type
  IF v_invoice.student_package_id IS NOT NULL THEN
    -- Package invoice → deferred revenue (2970 Förutbetalda intäkter)
    v_revenue_acct := '2970';
  ELSE
    -- Direct service invoice → recognize immediately (3041 Körlektioner)
    v_revenue_acct := '3041';
  END IF;

  -- 4. Look up VAT account from platform_bas_event_mappings (default 2610 for SE25)
  SELECT * INTO v_mapping
  FROM   platform_bas_event_mappings
  WHERE  event_type = 'Invoice.Issued'
    AND  is_active  = true
  LIMIT 1;

  -- If mapping has a different credit account (for direct invoices), use it
  -- Otherwise fall back to our logic above
  -- We use the mapping's debit account for AR (1510) for consistency

  -- 5. Build lines array
  v_inv_date := COALESCE(v_invoice.issued_at::date, CURRENT_DATE);

  IF v_invoice.vat_amount > 0 THEN
    -- Three-line entry: AR / Revenue / VAT
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code',  '1510',
        'debit_amount',  v_invoice.total_amount,
        'credit_amount', 0,
        'description',   'Kundfordringar: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
      ),
      jsonb_build_object(
        'account_code',  v_revenue_acct,
        'debit_amount',  0,
        'credit_amount', v_invoice.subtotal_amount,
        'description',   CASE v_revenue_acct
                           WHEN '2970' THEN 'Förutbetalda intäkter: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
                           ELSE             'Körlektioner: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
                         END
      ),
      jsonb_build_object(
        'account_code',  v_vat_account,
        'debit_amount',  0,
        'credit_amount', v_invoice.vat_amount,
        'description',   'Utgående moms: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text),
        'vat_rate_code', 'SE25',
        'vat_amount',    v_invoice.vat_amount
      )
    );
  ELSE
    -- Two-line entry: AR / Revenue (zero VAT)
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code',  '1510',
        'debit_amount',  v_invoice.total_amount,
        'credit_amount', 0,
        'description',   'Kundfordringar: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
      ),
      jsonb_build_object(
        'account_code',  v_revenue_acct,
        'debit_amount',  0,
        'credit_amount', v_invoice.total_amount,
        'description',   CASE v_revenue_acct
                           WHEN '2970' THEN 'Förutbetalda intäkter: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
                           ELSE             'Körlektioner: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
                         END
      )
    );
  END IF;

  -- 6. Resolve financial period
  v_period_id := find_period_for_date(v_invoice.organization_id, v_inv_date);

  -- 7. Post journal entry
  v_entry_id := post_journal_entry(
    p_org_id               := v_invoice.organization_id,
    p_period_id            := v_period_id,
    p_entry_type           := 'standard',
    p_entry_date           := v_inv_date,
    p_description          := 'Invoice: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text),
    p_lines                := v_lines,
    p_source_event_type    := 'Invoice.Issued',
    p_source_entity_type   := 'invoice',
    p_source_entity_id     := p_invoice_id,
    p_actor_id             := p_actor_id
  );

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_invoice_journal_entry(uuid, uuid) IS
  'Posts the AR journal entry for an issued invoice. '
  'Package invoices use 2970 Förutbetalda intäkter (deferred revenue). '
  'Direct invoices use 3041 Körlektioner (immediate recognition). '
  'Idempotent: returns existing entry_id if already posted.';

GRANT EXECUTE ON FUNCTION public.post_invoice_journal_entry(uuid, uuid)
  TO authenticated, service_role;

-- ── 4. post_payment_journal_entry ─────────────────────────────────────────────
-- Posts the cash receipt journal entry when a payment is confirmed.
--
--   DR 1930 Bank (or appropriate cash account based on payment_method)
--   CR 1510 Kundfordringar
--
-- Idempotent: returns existing entry_id if already posted.

CREATE OR REPLACE FUNCTION public.post_payment_journal_entry(
  p_payment_id uuid,
  p_actor_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment     payments%ROWTYPE;
  v_period_id   uuid;
  v_entry_id    uuid;
  v_cash_acct   text;
  v_lines       jsonb;
  v_pay_date    date;
BEGIN
  -- 1. Idempotency check
  SELECT je.id INTO v_entry_id
  FROM   journal_entries je
  JOIN   payments p ON p.organization_id = je.organization_id
  WHERE  p.id                   = p_payment_id
    AND  je.source_entity_type  = 'payment'
    AND  je.source_entity_id    = p_payment_id
    AND  je.entry_type          = 'standard'
    AND  je.status              = 'posted'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_entry_id;
  END IF;

  -- 2. Fetch and validate payment
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: payment % not found', p_payment_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.status NOT IN ('confirmed', 'refunded', 'partially_refunded') THEN
    RAISE EXCEPTION 'PAYMENT_NOT_CONFIRMED: payment % has status %; must be confirmed to post',
      p_payment_id, v_payment.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Determine cash account based on payment method
  v_cash_acct := CASE v_payment.payment_method
    WHEN 'bank_transfer'  THEN '1920'  -- PlusGirot / BankGiro
    WHEN 'swish'          THEN '1930'  -- Bank / Swish clearing
    WHEN 'card'           THEN '1930'
    WHEN 'stripe'         THEN '1930'
    WHEN 'manual'         THEN '1930'
    ELSE                       '1930'
  END;

  -- 4. Build lines
  v_pay_date := COALESCE(v_payment.confirmed_at::date, CURRENT_DATE);

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_cash_acct,
      'debit_amount',  v_payment.amount,
      'credit_amount', 0,
      'description',   'Betalning mottagen: ' || COALESCE(v_payment.provider_reference, p_payment_id::text)
    ),
    jsonb_build_object(
      'account_code',  '1510',
      'debit_amount',  0,
      'credit_amount', v_payment.amount,
      'description',   'Reglering kundfordran: ' || COALESCE(v_payment.provider_reference, p_payment_id::text)
    )
  );

  -- 5. Resolve period
  v_period_id := find_period_for_date(v_payment.organization_id, v_pay_date);

  -- 6. Post
  v_entry_id := post_journal_entry(
    p_org_id              := v_payment.organization_id,
    p_period_id           := v_period_id,
    p_entry_type          := 'standard',
    p_entry_date          := v_pay_date,
    p_description         := 'Payment: ' || COALESCE(v_payment.provider_reference, p_payment_id::text),
    p_lines               := v_lines,
    p_source_event_type   := 'Payment.Received',
    p_source_entity_type  := 'payment',
    p_source_entity_id    := p_payment_id,
    p_actor_id            := p_actor_id
  );

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_payment_journal_entry(uuid, uuid) IS
  'Posts the cash receipt journal entry for a confirmed payment. '
  'DR bank account / CR 1510 Kundfordringar. '
  'Bank account varies by payment_method (1920 for BankGiro/PlusGiro, 1930 for others). '
  'Idempotent: returns existing entry_id if already posted.';

GRANT EXECUTE ON FUNCTION public.post_payment_journal_entry(uuid, uuid)
  TO authenticated, service_role;

-- ── 5. post_void_journal_entry ────────────────────────────────────────────────
-- Posts a reversal for a voided invoice.
-- Finds the original AR journal entry for the invoice and reverses it.
-- If no prior posting exists, raises JOURNAL_NOT_FOUND.
-- Idempotent: if a reversal for this invoice already exists, returns it.

CREATE OR REPLACE FUNCTION public.post_void_journal_entry(
  p_invoice_id uuid,
  p_actor_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice       invoices%ROWTYPE;
  v_orig_entry_id uuid;
  v_reversal_id   uuid;
  v_period_id     uuid;
  v_void_date     date;
  v_orig_lines    jsonb;
  v_reversal_lines jsonb;
  v_line          record;
  v_line_arr      jsonb := '[]'::jsonb;
BEGIN
  -- 1. Find original invoice journal entry
  SELECT organization_id INTO v_invoice.organization_id
  FROM   invoices WHERE id = p_invoice_id;

  SELECT id INTO v_orig_entry_id
  FROM   journal_entries
  WHERE  organization_id    = v_invoice.organization_id
    AND  source_entity_type = 'invoice'
    AND  source_entity_id   = p_invoice_id
    AND  entry_type         = 'standard'
    AND  status             = 'posted'
  LIMIT 1;

  IF v_orig_entry_id IS NULL THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND: no posted journal entry found for invoice %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Idempotency: check if reversal already exists
  SELECT id INTO v_reversal_id
  FROM   journal_entries
  WHERE  reversal_of_entry_id = v_orig_entry_id
    AND  status = 'posted'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_reversal_id;
  END IF;

  -- 3. Fetch invoice for void date
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  v_void_date := COALESCE(v_invoice.void_at::date, CURRENT_DATE);

  -- 4. Build reversal lines: swap debit and credit of each original line
  FOR v_line IN
    SELECT account_code, debit_amount, credit_amount, vat_rate_code, vat_amount, description
    FROM   journal_lines
    WHERE  entry_id = v_orig_entry_id
    ORDER  BY line_number
  LOOP
    v_line_arr := v_line_arr || jsonb_build_object(
      'account_code',  v_line.account_code,
      'debit_amount',  v_line.credit_amount,   -- swapped
      'credit_amount', v_line.debit_amount,    -- swapped
      'description',   'Reversal: ' || v_line.description,
      'vat_rate_code', v_line.vat_rate_code,
      'vat_amount',    v_line.vat_amount
    );
  END LOOP;

  -- 5. Resolve period
  v_period_id := find_period_for_date(v_invoice.organization_id, v_void_date);

  -- 6. Post reversal
  v_reversal_id := post_journal_entry(
    p_org_id               := v_invoice.organization_id,
    p_period_id            := v_period_id,
    p_entry_type           := 'reversal',
    p_entry_date           := v_void_date,
    p_description          := 'Void: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text),
    p_lines                := v_line_arr,
    p_source_event_type    := 'Invoice.Voided',
    p_source_entity_type   := 'invoice',
    p_source_entity_id     := p_invoice_id,
    p_voucher_series       := 'A',
    p_reversal_of_entry_id := v_orig_entry_id,
    p_actor_id             := p_actor_id
  );

  RETURN v_reversal_id;
END;
$$;

COMMENT ON FUNCTION public.post_void_journal_entry(uuid, uuid) IS
  'Posts a reversal journal entry for a voided invoice. '
  'All debits and credits from the original entry are swapped. '
  'Idempotent: returns existing reversal_id if already reversed.';

GRANT EXECUTE ON FUNCTION public.post_void_journal_entry(uuid, uuid)
  TO authenticated, service_role;
