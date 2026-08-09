-- =============================================================================
-- Refund Journal Posting — Closing a Real Gap Found During Impact Analysis
--
-- process_refund() (20260721000001) correctly updates refunds/payments/
-- invoices and the credit_ledger, but never posts anything to the general
-- ledger. For a monetary refund, that means the bank/cash control account
-- stays overstated forever (money genuinely left the account but no journal
-- line ever records it) and revenue/VAT are never corrected — a real
-- compliance gap, not a hardcoding gap. A platform_bas_event_mappings row
-- for 'Refund.Processed' (debit 3041, credit 1930) has existed since Phase
-- 4C, seeded for exactly this purpose, but nothing ever consumed it.
--
-- post_refund_journal_entry() composes from the SAME resolved accounts as
-- invoice/payment posting rather than the old flat Refund.Processed mapping
-- (deactivated below) — one consistent resolution mechanism, not a second
-- one: Revenue.Direct/Deferred (matching whichever the original invoice
-- used) and Payment.Cash.<method> (matching the original payment's method)
-- are tenant-resolved; VAT.Output25 stays platform-fixed, same reasoning as
-- post_invoice_journal_entry (VAT is cross-cutting — see 20260724000008).
--
-- Entry (for a monetary refund of amount A on an invoice with VAT ratio r):
--   DR Revenue.{Direct|Deferred}   A × (1 - r)
--   DR VAT.Output25                A × r          (only if the invoice had VAT)
--   CR Payment.Cash.<method>       A
-- Proportional split mirrors how the original invoice itself was split into
-- subtotal + VAT. Credit-only refunds (refund_amount = 0 — no money moved,
-- pure credit_ledger restoration) have nothing to post; the function raises
-- a clear, distinct error rather than silently no-op'ing, so a caller never
-- mistakes "nothing to do" for "it worked."
-- =============================================================================

CREATE OR REPLACE FUNCTION public.post_refund_journal_entry(
  p_refund_id uuid,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund       refunds%ROWTYPE;
  v_invoice      invoices%ROWTYPE;
  v_payment      payments%ROWTYPE;
  v_entry_id     uuid;
  v_lines        jsonb;
  v_refund_date  date;
  v_cash_acct    text;
  v_revenue_acct text;
  v_vat_acct     text := '2610';  -- Platform-fixed — see post_invoice_journal_entry.
  v_vat_portion  numeric(12,2) := 0;
  v_net_portion  numeric(12,2);
BEGIN
  -- 1. Idempotency check
  SELECT id INTO v_entry_id
  FROM   journal_entries
  WHERE  source_entity_type = 'refund'
    AND  source_entity_id   = p_refund_id
    AND  entry_type         = 'standard'
    AND  status             = 'posted'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_entry_id;
  END IF;

  -- 2. Fetch and validate refund
  SELECT * INTO v_refund FROM refunds WHERE id = p_refund_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFUND_NOT_FOUND: refund % not found', p_refund_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_refund.refund_status != 'completed' THEN
    RAISE EXCEPTION 'REFUND_NOT_COMPLETED: refund % has status %; must be completed to post',
      p_refund_id, v_refund.refund_status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_refund.refund_amount <= 0 THEN
    RAISE EXCEPTION 'REFUND_NOTHING_TO_POST: refund % has no monetary amount (credit-only refund) — nothing to post to the ledger',
      p_refund_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_refund.payment_id IS NULL THEN
    RAISE EXCEPTION 'REFUND_NO_PAYMENT: refund % has a monetary amount but no linked payment', p_refund_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = v_refund.invoice_id;
  SELECT * INTO v_payment FROM payments WHERE id = v_refund.payment_id;

  v_refund_date := COALESCE(v_refund.processed_at::date, CURRENT_DATE);

  -- 3. Proportional VAT/net split, mirroring the original invoice's own ratio.
  IF v_invoice.vat_amount > 0 AND v_invoice.total_amount > 0 THEN
    v_vat_portion := ROUND(v_refund.refund_amount * (v_invoice.vat_amount / v_invoice.total_amount), 2);
  END IF;
  v_net_portion := v_refund.refund_amount - v_vat_portion;

  -- 4. Resolve accounts — same resolution mechanism and same accounts as
  --    post_invoice_journal_entry / post_payment_journal_entry, not a
  --    separate mapping.
  IF v_invoice.student_package_id IS NOT NULL THEN
    v_revenue_acct := '2970';
  ELSE
    v_revenue_acct := resolve_org_bas_account(v_refund.organization_id, 'Revenue.Direct');
  END IF;

  v_cash_acct := resolve_org_bas_account(
    v_refund.organization_id,
    'Payment.Cash.' || v_payment.payment_method::text,
    'Payment.Cash.default'
  );

  -- 5. Build lines
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_revenue_acct,
      'debit_amount',  v_net_portion,
      'credit_amount', 0,
      'description',   'Återbetalning — intäktskorrigering: ' || COALESCE(v_invoice.invoice_number, v_refund.invoice_id::text)
    )
  );

  IF v_vat_portion > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code',  v_vat_acct,
      'debit_amount',  v_vat_portion,
      'credit_amount', 0,
      'description',   'Återbetalning — momskorrigering: ' || COALESCE(v_invoice.invoice_number, v_refund.invoice_id::text),
      'vat_rate_code', 'SE25',
      'vat_amount',    v_vat_portion
    );
  END IF;

  v_lines := v_lines || jsonb_build_object(
    'account_code',  v_cash_acct,
    'debit_amount',  0,
    'credit_amount', v_refund.refund_amount,
    'description',   'Återbetalning utbetald: ' || COALESCE(v_invoice.invoice_number, v_refund.invoice_id::text)
  );

  -- 6. Post
  v_entry_id := post_journal_entry(
    p_org_id              := v_refund.organization_id,
    p_period_id           := find_period_for_date(v_refund.organization_id, v_refund_date),
    p_entry_type          := 'standard',
    p_entry_date          := v_refund_date,
    p_description         := 'Refund: ' || COALESCE(v_invoice.invoice_number, v_refund.invoice_id::text),
    p_lines               := v_lines,
    p_source_event_type   := 'Refund.Processed',
    p_source_entity_type  := 'refund',
    p_source_entity_id    := p_refund_id,
    p_actor_id            := p_actor_id
  );

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_refund_journal_entry(uuid, uuid) IS
  'Posts the reversing journal entry for a completed monetary refund: DR Revenue (tenant-'
  'resolved Direct / fixed Deferred, proportional net) + DR VAT.Output25 (fixed, proportional '
  'VAT) / CR Payment.Cash.<method> (tenant-resolved, matching the original payment). '
  'Credit-only refunds (refund_amount = 0) have nothing to post and raise '
  'REFUND_NOTHING_TO_POST rather than silently no-op. Idempotent.';

GRANT EXECUTE ON FUNCTION public.post_refund_journal_entry(uuid, uuid) TO authenticated, service_role;

-- The old flat mapping is superseded by composing from the same resolved
-- accounts invoice/payment posting already use — deactivate, not delete.
UPDATE public.platform_bas_event_mappings
SET is_active = false
WHERE event_type = 'Refund.Processed';
