-- =============================================================================
-- Posting Engine — Resolve BAS Accounts From Tenant Configuration
--
-- Companion to 20260724000005_tenant_bas_account_resolution.sql. Replaces
-- hardcoded BAS account literals in post_invoice_journal_entry and
-- post_payment_journal_entry with calls to resolve_org_bas_account(), so a
-- tenant's Baskonton configuration (accounting_chart_of_accounts) actually
-- governs where transactions post, instead of being silently ignored.
--
-- Unchanged, intentionally: post_journal_entry() (the generic balance/
-- voucher/account_balances core — Platform-owned posting engine mechanics),
-- post_void_journal_entry() (reverses whatever accounts the original entry
-- already used — nothing to resolve), and the business RULES for which
-- account category applies when (e.g. package invoice → deferred revenue,
-- direct invoice → immediate revenue) — those rules stay platform-owned;
-- only which literal BAS code represents each category is now tenant-owned.
-- =============================================================================

-- ── post_invoice_journal_entry ────────────────────────────────────────────────

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
  v_ar_acct        text;
  v_vat_account    text;
  v_lines          jsonb;
  v_inv_date       date;
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

  -- 3. Resolve accounts from this tenant's Chart of Accounts (falls back to
  --    platform templates only if the org has no configured mapping yet).
  --    WHICH category applies (deferred vs. direct revenue) is platform
  --    business logic; WHICH BAS code represents that category is tenant-owned.
  v_ar_acct := resolve_org_bas_account(v_invoice.organization_id, 'AR.Account');

  IF v_invoice.student_package_id IS NOT NULL THEN
    v_revenue_acct := resolve_org_bas_account(v_invoice.organization_id, 'Revenue.Deferred');
  ELSE
    v_revenue_acct := resolve_org_bas_account(v_invoice.organization_id, 'Revenue.Direct');
  END IF;

  v_vat_account := resolve_org_bas_account(v_invoice.organization_id, 'VAT.Output25');

  -- 4. Build lines array
  v_inv_date := COALESCE(v_invoice.issued_at::date, CURRENT_DATE);

  IF v_invoice.vat_amount > 0 THEN
    -- Three-line entry: AR / Revenue / VAT
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
    -- Two-line entry: AR / Revenue (zero VAT)
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

  -- 5. Resolve financial period
  v_period_id := find_period_for_date(v_invoice.organization_id, v_inv_date);

  -- 6. Post journal entry
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
  'Posts the AR journal entry for an issued invoice. Accounts (AR, revenue, VAT) are '
  'resolved per-tenant via resolve_org_bas_account() — see Baskonton settings. '
  'Package invoices use deferred revenue; direct invoices use immediate revenue — '
  'that category rule is platform-owned, the BAS code behind each category is tenant-owned. '
  'Idempotent: returns existing entry_id if already posted.';

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
  v_ar_acct     text;
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

  -- 3. Resolve cash/bank account for this payment method from the tenant's
  --    Chart of Accounts, falling back to Payment.Cash.default for a
  --    payment_method the tenant hasn't specifically mapped.
  v_cash_acct := resolve_org_bas_account(
    v_payment.organization_id,
    'Payment.Cash.' || v_payment.payment_method::text,
    'Payment.Cash.default'
  );
  v_ar_acct := resolve_org_bas_account(v_payment.organization_id, 'AR.Account');

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
      'account_code',  v_ar_acct,
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
  'Posts the cash receipt journal entry for a confirmed payment. Cash/bank account is '
  'resolved per-tenant, per-payment-method via resolve_org_bas_account() (Payment.Cash.<method>, '
  'falling back to Payment.Cash.default) — see Baskonton settings. AR account is likewise '
  'tenant-resolved (AR.Account). Idempotent: returns existing entry_id if already posted.';

GRANT EXECUTE ON FUNCTION public.post_payment_journal_entry(uuid, uuid)
  TO authenticated, service_role;
