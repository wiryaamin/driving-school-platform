-- =============================================================================
-- Finance Domain Full Impact Analysis — Correction + Controlled Extension
--
-- Requested full impact analysis across the finance domain surfaced a real
-- correctness risk introduced by 20260724000006: making AR.Account,
-- VAT.Output25, and Revenue.Deferred tenant-configurable broke an implicit
-- assumption several OTHER subsystems depend on — that AR posts to exactly
-- 1510, output VAT-25 to exactly 2610, and deferred revenue to exactly 2970:
--
--   - financial close engine (20260603000003): ar_reconciled and
--     deferred_revenue_reconciled checks read account_balances WHERE
--     account_code = '1510' / '2970' and compare against invoices /
--     deferred_revenue_schedules. A tenant who remapped AR would silently
--     fail this check forever (0 balance in 1510 vs. real AR sitting
--     elsewhere), even though their books are correct.
--   - audit snapshots (20260603000005): identical 1510/2970 assumption.
--   - bank reconciliation (20260603000002): reconcile_accounts_receivable /
--     reconcile_vat_period / reconcile_deferred_revenue read the same fixed
--     1510/2610/2970 codes.
--   - VAT clearing's own create_vat_clearing_run (20260604000003) reads
--     account_balances WHERE account_code IN ('2610','2612','2621','2640') —
--     internally self-consistent only if those four codes are fixed.
--
-- These are genuinely cross-cutting platform control accounts — multiple
-- independent subsystems assume the code, not just the posting engine.
-- Making them tenant-configurable would require coordinating a rewrite of
-- close/audit/reconciliation/VAT-clearing simultaneously, which is a much
-- larger, higher-risk change than requested and crosses into redesigning
-- already-stable compliance-critical code. Reverting here rather than
-- silently leaving a half-correct state.
--
-- What stays tenant-configurable (re-confirmed safe): Payment.Cash.* and
-- Revenue.Direct — grepped across every finance migration; no other
-- subsystem references either by a hardcoded WHERE/CASE. These accounts are
-- islands, exactly the case resolve_org_bas_account is safe for.
-- =============================================================================

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
  v_ar_acct        text := '1510';  -- Platform-fixed: financial close, audit snapshots,
                                     -- and bank reconciliation all assume AR = 1510.
  v_vat_account    text := '2610';  -- Platform-fixed: bank reconciliation and VAT
                                     -- clearing's own balance read both assume 2610.
  v_lines          jsonb;
  v_inv_date       date;
BEGIN
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

  -- Revenue category is still tenant-resolved — Revenue.Direct/Deferred split
  -- has no cross-subsystem dependent on the specific code for the DIRECT case.
  -- Revenue.Deferred (2970) itself, unlike Direct, IS depended on elsewhere
  -- (close engine, audit snapshots, revenue recognition schedules) — fixed.
  IF v_invoice.student_package_id IS NOT NULL THEN
    v_revenue_acct := '2970';
  ELSE
    v_revenue_acct := resolve_org_bas_account(v_invoice.organization_id, 'Revenue.Direct');
  END IF;

  v_inv_date := COALESCE(v_invoice.issued_at::date, CURRENT_DATE);

  IF v_invoice.vat_amount > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code',  v_ar_acct,
        'debit_amount',  v_invoice.total_amount,
        'credit_amount', 0,
        'description',   'Kundfordringar: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
      ),
      jsonb_build_object(
        'account_code',  v_revenue_acct,
        'debit_amount',  0,
        'credit_amount', v_invoice.subtotal_amount,
        'description',   CASE WHEN v_invoice.student_package_id IS NOT NULL
                           THEN 'Förutbetalda intäkter: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
                           ELSE 'Körlektioner: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
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
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code',  v_ar_acct,
        'debit_amount',  v_invoice.total_amount,
        'credit_amount', 0,
        'description',   'Kundfordringar: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
      ),
      jsonb_build_object(
        'account_code',  v_revenue_acct,
        'debit_amount',  0,
        'credit_amount', v_invoice.total_amount,
        'description',   CASE WHEN v_invoice.student_package_id IS NOT NULL
                           THEN 'Förutbetalda intäkter: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
                           ELSE 'Körlektioner: ' || COALESCE(v_invoice.invoice_number, p_invoice_id::text)
                         END
      )
    );
  END IF;

  v_period_id := find_period_for_date(v_invoice.organization_id, v_inv_date);

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
  'Posts the AR journal entry for an issued invoice. AR (1510) and output VAT 25% (2610) '
  'are platform-fixed — financial close, audit snapshots, bank reconciliation, and VAT '
  'clearing all assume these exact codes for balance verification. Revenue account is '
  'tenant-resolved for direct invoices (Revenue.Direct); deferred revenue (2970) is fixed '
  'for the same cross-subsystem reason as AR/VAT. Idempotent.';

GRANT EXECUTE ON FUNCTION public.post_invoice_journal_entry(uuid, uuid)
  TO authenticated, service_role;

-- ── post_payment_journal_entry ────────────────────────────────────────────────

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
  v_ar_acct     text := '1510';  -- Platform-fixed — see post_invoice_journal_entry comment.
  v_lines       jsonb;
  v_pay_date    date;
BEGIN
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

  -- Cash/bank account per payment method: still tenant-resolved. No other
  -- subsystem in the finance domain reads account_balances filtered by
  -- 1920/1930 — genuinely isolated, matches "Bank and settlement accounts,
  -- Payment method account mappings" in the tenant-owned list.
  v_cash_acct := resolve_org_bas_account(
    v_payment.organization_id,
    'Payment.Cash.' || v_payment.payment_method::text,
    'Payment.Cash.default'
  );

  v_pay_date := COALESCE(v_payment.confirmed_at::date, CURRENT_DATE);

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_cash_acct,
      'debit_amount',  v_payment.amount,
      'credit_amount', 0,
      'description',   'Betalning mottagen: ' || COALESCE(v_payment.provider_reference, p_payment_id::text)
    ),
    jsonb_build_object(
      'account_code',  v_ar_acct,
      'debit_amount',  0,
      'credit_amount', v_payment.amount,
      'description',   'Reglering kundfordran: ' || COALESCE(v_payment.provider_reference, p_payment_id::text)
    )
  );

  v_period_id := find_period_for_date(v_payment.organization_id, v_pay_date);

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
  'Posts the cash receipt journal entry for a confirmed payment. Cash/bank account is '
  'tenant-resolved per payment method (Payment.Cash.<method>, falling back to '
  'Payment.Cash.default). AR (1510) is platform-fixed — see post_invoice_journal_entry. '
  'Idempotent.';

GRANT EXECUTE ON FUNCTION public.post_payment_journal_entry(uuid, uuid)
  TO authenticated, service_role;

-- Deactivate (not delete — preserves audit history) the now-inappropriate
-- template rows so they stop appearing as if they were live configuration.
UPDATE public.platform_bas_event_mappings
SET is_active = false
WHERE event_type IN ('AR.Account', 'VAT.Output25', 'Revenue.Deferred');
