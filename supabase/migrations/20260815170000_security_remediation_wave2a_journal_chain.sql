-- Security Remediation Wave 2A — journal/ledger posting authorization chain.
--
-- Wave 1 (20260815150000) restricted post_journal_entry to service_role,
-- closing direct-RPC access to the core ledger primitive. This wave closes
-- the confused-deputy path it deliberately left open: the six wrapper
-- functions below all call post_journal_entry/reverse_journal_entry
-- internally (an owner-level call, unaffected by grants — the function
-- owner always retains implicit EXECUTE on its own functions), and their
-- sole real caller, ledger/index.ts, authenticates via the `authenticated`
-- role (anon key + forwarded JWT), not service_role — so unlike Wave 1's
-- functions, these cannot simply be locked down to service_role without
-- breaking the entire invoice/payment/refund/void/reverse/correct posting
-- UI. Confirmed: ledger/index.ts is their only application caller anywhere
-- in the codebase, and it rejects any request with no Authorization header
-- before reaching these routes at all — no legitimate anon caller exists.
--
-- Each function already correctly derives its target's organization_id
-- from the entity row itself (invoice/payment/refund/journal_entries) —
-- there is no p_org_id parameter for a caller to spoof. The gap is narrower
-- and more insidious: nothing ever checks that the derived organization
-- matches the CALLING USER's own organization. An authenticated user of
-- any organization who supplies another organization's invoice/payment/
-- refund/entry id gets a journal entry posted for that other organization,
-- entirely bypassing ledger/index.ts's own hasPerm() check (which only
-- verifies the caller holds the permission in their own org, never that
-- the target entity belongs to it).
--
-- Fix, applied identically to all six: resolve the target entity first,
-- then authorize (organization match via auth_organization_id(), platform
-- admin bypass via is_platform_admin() — the same helpers already used
-- throughout this platform's RLS and authorization code), before any
-- idempotency check or mutation. The authorization and not-found cases are
-- merged into one generic exception, deliberately not distinguishing
-- "doesn't exist" from "exists but isn't yours" — the same principle
-- already established for soft_delete in Wave 1, avoiding a cross-tenant
-- existence oracle. A second check verifies p_actor_id (where the caller
-- may supply one) matches auth.uid(), so accounting records can't be
-- attributed to a different user than the one actually calling — the
-- Edge Function itself already only ever passes ctx.actorId (its own
-- caller's resolved identity, confirmed in _shared/context.ts), so this
-- only closes the direct-RPC bypass, not a real app-layer gap.
--
-- No business logic, computation, account resolution, or error wording for
-- already-legitimate same-tenant calls changes. No schema change. No RLS
-- change. EXECUTE grants: anon revoked (no legitimate caller); authenticated
-- and service_role retained (ledger/index.ts needs authenticated; no current
-- service-role caller exists, but revoking it serves no purpose either).

-- ── post_invoice_journal_entry(p_invoice_id, p_actor_id) ────────────────────
-- Entity fetch moved ahead of the idempotency check (previously ran first,
-- via a subquery, and could return an existing posted entry's id to a
-- caller who had not yet been authorized against it) — same fetch, same
-- FOR SHARE lock, same NOT FOUND handling, now simply reordered so
-- authorization happens before any information is returned.

CREATE OR REPLACE FUNCTION public.post_invoice_journal_entry(p_invoice_id uuid, p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice        invoices%ROWTYPE;
  v_period_id      uuid;
  v_entry_id       uuid;
  v_revenue_acct   text;
  v_ar_acct        text := '1510';
  v_vat_account    text := '2610';
  v_lines          jsonb;
  v_inv_date       date;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR SHARE;

  IF NOT FOUND OR (
    NOT public.is_platform_admin()
    AND v_invoice.organization_id IS DISTINCT FROM public.auth_organization_id()
  ) THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: invoice % not found or not accessible', p_invoice_id
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NOT NULL
     AND NOT public.is_platform_admin()
     AND p_actor_id IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION 'LEDGER_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_entry_id
  FROM   journal_entries
  WHERE  organization_id    = v_invoice.organization_id
    AND  source_entity_type = 'invoice'
    AND  source_entity_id   = p_invoice_id
    AND  entry_type         = 'standard'
    AND  status             = 'posted'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_entry_id;
  END IF;

  IF v_invoice.status NOT IN ('issued', 'paid', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'INVOICE_NOT_ISSUED: invoice % has status %; must be issued/paid/overdue to post',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

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
$function$;

-- ── post_payment_journal_entry(p_payment_id, p_actor_id) ────────────────────

CREATE OR REPLACE FUNCTION public.post_payment_journal_entry(p_payment_id uuid, p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment     payments%ROWTYPE;
  v_period_id   uuid;
  v_entry_id    uuid;
  v_cash_acct   text;
  v_ar_acct     text := '1510';
  v_lines       jsonb;
  v_pay_date    date;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id FOR SHARE;

  IF NOT FOUND OR (
    NOT public.is_platform_admin()
    AND v_payment.organization_id IS DISTINCT FROM public.auth_organization_id()
  ) THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: payment % not found or not accessible', p_payment_id
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NOT NULL
     AND NOT public.is_platform_admin()
     AND p_actor_id IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION 'LEDGER_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT je.id INTO v_entry_id
  FROM   journal_entries je
  WHERE  je.organization_id     = v_payment.organization_id
    AND  je.source_entity_type  = 'payment'
    AND  je.source_entity_id    = p_payment_id
    AND  je.entry_type          = 'standard'
    AND  je.status              = 'posted'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_entry_id;
  END IF;

  IF v_payment.status NOT IN ('confirmed', 'refunded', 'partially_refunded') THEN
    RAISE EXCEPTION 'PAYMENT_NOT_CONFIRMED: payment % has status %; must be confirmed to post',
      p_payment_id, v_payment.status
      USING ERRCODE = 'P0001';
  END IF;

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
    p_entry_date           := v_pay_date,
    p_description         := 'Payment: ' || COALESCE(v_payment.provider_reference, p_payment_id::text),
    p_lines               := v_lines,
    p_source_event_type   := 'Payment.Received',
    p_source_entity_type  := 'payment',
    p_source_entity_id    := p_payment_id,
    p_actor_id            := p_actor_id
  );

  RETURN v_entry_id;
END;
$function$;

-- ── post_refund_journal_entry(p_refund_id, p_actor_id DEFAULT NULL) ────────

CREATE OR REPLACE FUNCTION public.post_refund_journal_entry(p_refund_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_refund       refunds%ROWTYPE;
  v_invoice      invoices%ROWTYPE;
  v_payment      payments%ROWTYPE;
  v_entry_id     uuid;
  v_lines        jsonb;
  v_refund_date  date;
  v_cash_acct    text;
  v_revenue_acct text;
  v_vat_acct     text := '2610';
  v_vat_portion  numeric(12,2) := 0;
  v_net_portion  numeric(12,2);
BEGIN
  SELECT * INTO v_refund FROM refunds WHERE id = p_refund_id FOR SHARE;

  IF NOT FOUND OR (
    NOT public.is_platform_admin()
    AND v_refund.organization_id IS DISTINCT FROM public.auth_organization_id()
  ) THEN
    RAISE EXCEPTION 'REFUND_NOT_FOUND: refund % not found or not accessible', p_refund_id
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NOT NULL
     AND NOT public.is_platform_admin()
     AND p_actor_id IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION 'LEDGER_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

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

  IF v_invoice.vat_amount > 0 AND v_invoice.total_amount > 0 THEN
    v_vat_portion := ROUND(v_refund.refund_amount * (v_invoice.vat_amount / v_invoice.total_amount), 2);
  END IF;
  v_net_portion := v_refund.refund_amount - v_vat_portion;

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
$function$;

-- ── post_void_journal_entry(p_invoice_id, p_actor_id) ───────────────────────
-- Original code detected a nonexistent invoice indirectly (organization_id
-- stayed NULL, so the subsequent journal-entry lookup found nothing and
-- raised JOURNAL_NOT_FOUND) rather than checking the invoice directly. The
-- authorization check below fires for the same NULL case as well as the
-- wrong-org case, so that indirect not-found behavior is preserved — just
-- reached via the merged, generic exception instead.

CREATE OR REPLACE FUNCTION public.post_void_journal_entry(p_invoice_id uuid, p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice       invoices%ROWTYPE;
  v_orig_entry_id uuid;
  v_reversal_id   uuid;
  v_period_id     uuid;
  v_void_date     date;
  v_line          record;
  v_line_arr      jsonb := '[]'::jsonb;
BEGIN
  SELECT organization_id INTO v_invoice.organization_id
  FROM   invoices WHERE id = p_invoice_id;

  IF NOT public.is_platform_admin()
     AND v_invoice.organization_id IS DISTINCT FROM public.auth_organization_id()
  THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND: no posted journal entry found for invoice %', p_invoice_id
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NOT NULL
     AND NOT public.is_platform_admin()
     AND p_actor_id IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION 'LEDGER_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

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

  SELECT id INTO v_reversal_id
  FROM   journal_entries
  WHERE  reversal_of_entry_id = v_orig_entry_id
    AND  status = 'posted'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_reversal_id;
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  v_void_date := COALESCE(v_invoice.void_at::date, CURRENT_DATE);

  FOR v_line IN
    SELECT account_code, debit_amount, credit_amount, vat_rate_code, vat_amount, description
    FROM   journal_lines
    WHERE  entry_id = v_orig_entry_id
    ORDER  BY line_number
  LOOP
    v_line_arr := v_line_arr || jsonb_build_object(
      'account_code',  v_line.account_code,
      'debit_amount',  v_line.credit_amount,
      'credit_amount', v_line.debit_amount,
      'description',   'Reversal: ' || v_line.description,
      'vat_rate_code', v_line.vat_rate_code,
      'vat_amount',    v_line.vat_amount
    );
  END LOOP;

  v_period_id := find_period_for_date(v_invoice.organization_id, v_void_date);

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
$function$;

-- ── reverse_journal_entry(p_entry_id, p_reversal_date, p_reason, p_actor_id) ─

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(
  p_entry_id uuid,
  p_reversal_date date DEFAULT CURRENT_DATE,
  p_reason text DEFAULT 'Manual reversal'::text,
  p_actor_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_original     journal_entries%ROWTYPE;
  v_reversal_id  uuid;
  v_period_id    uuid;
  v_line_arr     jsonb := '[]'::jsonb;
  v_line         record;
BEGIN
  SELECT * INTO v_original FROM journal_entries WHERE id = p_entry_id;

  IF NOT FOUND OR (
    NOT public.is_platform_admin()
    AND v_original.organization_id IS DISTINCT FROM public.auth_organization_id()
  ) THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND: journal entry % not found or not accessible', p_entry_id
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NOT NULL
     AND NOT public.is_platform_admin()
     AND p_actor_id IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION 'LEDGER_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_original.status <> 'posted' THEN
    RAISE EXCEPTION 'JOURNAL_NOT_POSTED: entry % has status %; only posted entries can be reversed',
      p_entry_id, v_original.status
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE  reversal_of_entry_id = p_entry_id
      AND  status = 'posted'
  ) THEN
    RAISE EXCEPTION 'JOURNAL_ALREADY_REVERSED: entry % has already been reversed',
      p_entry_id
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_line IN
    SELECT account_code, debit_amount, credit_amount, vat_rate_code, vat_amount, description
    FROM   journal_lines
    WHERE  entry_id = p_entry_id
    ORDER  BY line_number
  LOOP
    v_line_arr := v_line_arr || jsonb_build_object(
      'account_code',  v_line.account_code,
      'debit_amount',  v_line.credit_amount,
      'credit_amount', v_line.debit_amount,
      'description',   'Reversal: ' || v_line.description,
      'vat_rate_code', v_line.vat_rate_code,
      'vat_amount',    v_line.vat_amount
    );
  END LOOP;

  v_period_id := find_period_for_date(v_original.organization_id, p_reversal_date);

  v_reversal_id := post_journal_entry(
    p_org_id               := v_original.organization_id,
    p_period_id            := v_period_id,
    p_entry_type           := 'reversal',
    p_entry_date           := p_reversal_date,
    p_description          := 'Reversal of voucher ' || v_original.voucher_series || v_original.voucher_number::text
                              || ': ' || p_reason,
    p_lines                := v_line_arr,
    p_source_event_type    := 'Journal.Reversed',
    p_source_entity_type   := 'journal_entry',
    p_source_entity_id     := p_entry_id,
    p_voucher_series       := 'M',
    p_reversal_of_entry_id := p_entry_id,
    p_actor_id             := p_actor_id
  );

  RETURN v_reversal_id;
END;
$function$;

-- ── correct_journal_entry(p_entry_id, p_new_lines, p_reason, p_correction_date, p_actor_id) ─
-- Its own explicit check here is defense-in-depth on top of the check now
-- inside reverse_journal_entry (which this function calls internally via
-- PERFORM — a plain SQL call, so the internal RAISE EXCEPTION logic just
-- added to reverse_journal_entry still fires even though grants themselves
-- don't apply to owner-level calls). Rejecting immediately here, before
-- ever calling reverse_journal_entry, is clearer than relying on that.

CREATE OR REPLACE FUNCTION public.correct_journal_entry(
  p_entry_id uuid,
  p_new_lines jsonb,
  p_reason text DEFAULT 'Correction'::text,
  p_correction_date date DEFAULT CURRENT_DATE,
  p_actor_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_original      journal_entries%ROWTYPE;
  v_period_id     uuid;
  v_correction_id uuid;
BEGIN
  SELECT * INTO v_original FROM journal_entries WHERE id = p_entry_id;

  IF NOT FOUND OR (
    NOT public.is_platform_admin()
    AND v_original.organization_id IS DISTINCT FROM public.auth_organization_id()
  ) THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND: journal entry % not found or not accessible', p_entry_id
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NOT NULL
     AND NOT public.is_platform_admin()
     AND p_actor_id IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION 'LEDGER_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  PERFORM reverse_journal_entry(p_entry_id, p_correction_date, p_reason || ' (reversal step)', p_actor_id);

  v_period_id := find_period_for_date(v_original.organization_id, p_correction_date);

  v_correction_id := post_journal_entry(
    p_org_id                 := v_original.organization_id,
    p_period_id              := v_period_id,
    p_entry_type             := 'correction',
    p_entry_date             := p_correction_date,
    p_description            := 'Correction of voucher ' || v_original.voucher_series || v_original.voucher_number::text
                                || ': ' || p_reason,
    p_lines                  := p_new_lines,
    p_source_event_type      := 'Journal.Corrected',
    p_source_entity_type     := 'journal_entry',
    p_source_entity_id       := p_entry_id,
    p_voucher_series         := 'M',
    p_correction_of_entry_id := p_entry_id,
    p_actor_id               := p_actor_id
  );

  RETURN v_correction_id;
END;
$function$;

-- ── Grants: revoke anon (no legitimate caller), keep authenticated + service_role ──

REVOKE EXECUTE ON FUNCTION public.post_invoice_journal_entry(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_payment_journal_entry(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_refund_journal_entry(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_void_journal_entry(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reverse_journal_entry(uuid, date, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.correct_journal_entry(uuid, jsonb, text, date, uuid) FROM anon;
