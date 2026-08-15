-- SECURITY REMEDIATION WAVE 2B — FINANCE / LEDGER AUTHORIZATION HARDENING
--
-- Extends the Wave 2A confused-deputy fix (post_invoice_journal_entry,
-- post_payment_journal_entry, post_refund_journal_entry,
-- post_void_journal_entry, reverse_journal_entry, correct_journal_entry —
-- 20260815170000/20260815171000) to the remaining 30 highest-severity
-- finance/ledger SECURITY DEFINER functions: direct money movement
-- (invoice issue/void, payment record/allocate, refund, order status),
-- the full GL-posting family (payroll, tax, VAT clearing, depreciation,
-- accrual, deferred revenue, revenue recognition), financial period /
-- fiscal year close-and-reopen, and bank statement import / reconciliation
-- confirmation.
--
-- Every one of these functions is SECURITY DEFINER and, before this
-- migration, was reachable via PostgREST RPC by any `authenticated` caller
-- (several also by `anon`) with no verification that the organization the
-- function operates on belongs to the caller. Where the function derives
-- its organization from a target entity (invoice/payment/asset/period/
-- payroll run/etc.), the existing SELECT ... WHERE id = p_x had no
-- organization filter at all, or had one but never checked the caller's
-- own organization against it. Where the function takes an organization id
-- directly as a parameter (p_org_id / p_organization_id), that parameter
-- was never checked against the caller's own organization — a caller could
-- supply ANY org id.
--
-- Fix pattern (identical to Wave 2A, reapplied here):
--   1. Entity-derived org: after the entity is fetched/locked, add a
--      follow-up check re-using the SAME exception code/message the
--      function already raises for "not found", so a wrong-org caller and
--      a genuinely-missing-record caller are indistinguishable (no
--      cross-tenant existence oracle). public.is_trusted_service_context() bypasses,
--      matching every other check in this codebase.
--   2. Direct org parameter: add an early check that p_org_id /
--      p_organization_id matches public.auth_organization_id(), unless
--      platform admin.
--   3. Actor identity: where the function accepts p_actor_id, add a check
--      that it matches auth.uid() unless NULL or platform admin — mirrors
--      the LEDGER_ACTOR_MISMATCH pattern from Wave 2A.
--
-- No business logic, computation, error-message wording (for legitimate
-- callers), or table schema is changed anywhere in this migration — only
-- authorization checks are inserted, and only grants are narrowed.
--
-- WAVE 2A LESSON (explicitly reapplied here): the very first version of
-- Wave 2A's grant fix revoked EXECUTE from `anon` only, leaving `PUBLIC`
-- untouched — since every one of these functions still carries its
-- original implicit PUBLIC grant (never revoked before this wave), a
-- REVOKE ... FROM anon alone would leave `anon` (and every other role)
-- still able to execute via the broader PUBLIC grant. Every REVOKE below
-- explicitly includes PUBLIC, anon, and authenticated together, and every
-- grant is re-verified live via has_function_privilege() after applying
-- this migration — see the Wave 2B report for the verification matrix.

-- ----------------------------------------------------------------------------
-- Helper: is_trusted_service_context()
--
-- Several of these 30 functions have real callers that invoke them via
-- createServiceClient() with NO forwarded end-user Authorization header
-- (nets-webhook, stripe-webhook -> record_payment, confirmed by reading
-- both files directly). supabase-js authenticates that connection using the
-- static service_role key itself, which is a valid signed JWT carrying
-- {"role":"service_role", ...} but none of the custom claims the auth-hook
-- injects for real user logins (no organization_id, no is_platform_admin).
-- public.auth_organization_id() therefore returns NULL and
-- public.is_platform_admin() returns false for that context — an org check
-- of `NOT is_platform_admin() AND entity.org IS DISTINCT FROM
-- auth_organization_id()` would incorrectly reject this legitimate,
-- fully-trusted internal caller (entity.org IS DISTINCT FROM NULL is true).
--
-- This helper extends the existing is_platform_admin() bypass with a check
-- of the JWT's own 'role' claim, using the exact same
-- current_setting('request.jwt.claims', true) mechanism every other
-- RBAC helper in this codebase already uses (auth_organization_id(),
-- is_platform_admin(), has_permission()) — not a new authorization
-- framework, just the same technique applied to one more claim. current_user
-- cannot be used for this: inside a SECURITY DEFINER function current_user
-- is always the function owner (postgres), not the caller's role.
CREATE OR REPLACE FUNCTION public.is_trusted_service_context()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_platform_admin()
      OR (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role';
$function$;

REVOKE EXECUTE ON FUNCTION public.is_trusted_service_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_trusted_service_context() TO authenticated, service_role;

-- ============================================================================
-- A. INVOICE / PAYMENT / REFUND / ORDER LIFECYCLE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.allocate_payment(p_org_id uuid, p_payment_id uuid, p_invoice_id uuid, p_amount numeric, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment           payments%ROWTYPE;
  v_invoice           invoices%ROWTYPE;
  v_already_allocated numeric(12,2);
  v_headroom          numeric(12,2);
  v_allocation_id     uuid;
  v_new_paid          numeric(12,2);
  v_new_outstanding   numeric(12,2);
  v_new_status        invoice_status;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ALLOCATION_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Serialise concurrent allocations against the same payment.
  -- Prevents two callers from simultaneously passing the headroom check.
  -- Lock is automatically released at transaction end (advisory_xact_lock).
  PERFORM pg_advisory_xact_lock(
    hashtext(p_org_id::text),
    hashtext(p_payment_id::text)
  );

  -- Period lock guard
  PERFORM assert_period_not_locked(p_org_id, now()::date);

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: allocation amount must be positive, got %', p_amount
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock and validate payment
  SELECT * INTO v_payment
  FROM   payments
  WHERE  id              = p_payment_id
    AND  organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: %', p_payment_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.status <> 'confirmed' THEN
    RAISE EXCEPTION 'PAYMENT_NOT_ALLOCATABLE: payment % has status %; expected confirmed',
      p_payment_id, v_payment.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Check payment headroom (total allocated must not exceed payment.amount)
  SELECT COALESCE(SUM(allocated_amount), 0)
  INTO   v_already_allocated
  FROM   payment_allocations
  WHERE  payment_id = p_payment_id;

  v_headroom := v_payment.amount - v_already_allocated;

  IF p_amount > v_headroom THEN
    RAISE EXCEPTION 'ALLOCATION_EXCEEDS_PAYMENT: cannot allocate % against payment % (available headroom: %)',
      p_amount, p_payment_id, v_headroom
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock and validate invoice
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id              = p_invoice_id
    AND  organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.status NOT IN ('issued', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'INVOICE_NOT_PAYABLE: invoice % has status %; expected issued/partially_paid/overdue',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Insert allocation record
  INSERT INTO payment_allocations (
    organization_id, payment_id, invoice_id,
    allocated_amount, notes, created_by
  ) VALUES (
    p_org_id, p_payment_id, p_invoice_id,
    p_amount, p_notes, p_actor_id
  ) RETURNING id INTO v_allocation_id;

  -- Update invoice amounts and status
  v_new_paid        := v_invoice.paid_amount + p_amount;
  v_new_outstanding := v_invoice.total_amount - v_new_paid;
  v_new_status      := CASE
    WHEN v_new_outstanding <= 0 THEN 'paid'::invoice_status
    ELSE                             'partially_paid'::invoice_status
  END;

  UPDATE invoices
  SET
    paid_amount        = v_new_paid,
    outstanding_amount = v_new_outstanding,
    status             = v_new_status,
    paid_at            = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END,
    updated_at         = now()
  WHERE id = p_invoice_id;

  -- Emit Payment.Reconciled
  PERFORM insert_outbox_event(
    'Payment.Reconciled',
    'accounting',
    jsonb_build_object(
      'allocation_id',             v_allocation_id,
      'payment_id',                p_payment_id,
      'invoice_id',                p_invoice_id,
      'allocated_amount',          p_amount,
      'invoice_outstanding_after', v_new_outstanding,
      'student_id',                v_invoice.student_id
    ),
    p_org_id,
    v_invoice.student_id::text
  );

  RETURN v_allocation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid, p_actor_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice      invoices%ROWTYPE;
  v_year         int;
  v_last_num     int;
  v_prefix       text;
  v_inv_num      text;
  v_subtotal     numeric(12,2);
  v_vat_total    numeric(12,2);
  v_grand_total  numeric(12,2);
BEGIN
  -- 1. Lock and fetch invoice
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_invoice.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'INVOICE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'INVOICE_NOT_DRAFT: invoice % has status %, expected draft',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM invoice_line_items WHERE invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'INVOICE_NO_LINES: cannot issue invoice % with no line items',
      p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Period lock guard (Phase 4B addition)
  PERFORM assert_period_not_locked(v_invoice.organization_id, now()::date);

  -- 2. Re-compute and freeze totals from line items
  SELECT
    COALESCE(SUM(line_total),  0),
    COALESCE(SUM(vat_amount),  0)
  INTO v_subtotal, v_vat_total
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id;

  v_grand_total := v_subtotal + v_vat_total;

  -- Freeze VAT calculations on each line item
  UPDATE invoice_line_items
  SET
    vat_amount = quantity * unit_price * vat_rate,
    line_total = quantity * unit_price,
    updated_at = now()
  WHERE invoice_id = p_invoice_id;

  -- Re-read subtotal after freeze
  SELECT
    COALESCE(SUM(line_total),  0),
    COALESCE(SUM(vat_amount),  0)
  INTO v_subtotal, v_vat_total
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id;

  v_grand_total := v_subtotal + v_vat_total;

  -- 3. Generate gap-free invoice number for org + current year
  v_year := EXTRACT(YEAR FROM now())::int;

  INSERT INTO invoice_number_sequences (organization_id, year, last_number, prefix)
  VALUES (v_invoice.organization_id, v_year, 1, '')
  ON CONFLICT (organization_id, year) DO UPDATE
    SET last_number = invoice_number_sequences.last_number + 1,
        updated_at  = now()
  RETURNING last_number, prefix INTO v_last_num, v_prefix;

  v_inv_num := v_prefix || v_year::text || '-' || LPAD(v_last_num::text, 5, '0');

  -- 4. Issue the invoice
  UPDATE invoices
  SET
    status             = 'issued',
    invoice_number     = v_inv_num,
    issued_at          = now(),
    issued_by          = p_actor_id,
    subtotal_amount    = v_subtotal,
    vat_amount         = v_vat_total,
    total_amount       = v_grand_total,
    outstanding_amount = v_grand_total,
    updated_at         = now()
  WHERE id = p_invoice_id;

  -- 5. Generate Swedish OCR payment reference (Phase 4C addition)
  PERFORM issue_ocr_reference(p_invoice_id, v_invoice.organization_id);

  -- 6. Publish Invoice.Issued
  PERFORM insert_outbox_event(
    'Invoice.Issued',
    'accounting',
    jsonb_build_object(
      'invoice_id',      p_invoice_id,
      'invoice_number',  v_inv_num,
      'student_id',      v_invoice.student_id,
      'total_amount',    v_grand_total,
      'vat_amount',      v_vat_total,
      'currency',        v_invoice.currency,
      'issued_by',       p_actor_id
    ),
    v_invoice.organization_id,
    v_invoice.student_id::text
  );

  RETURN v_inv_num;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_order_id uuid, p_enrollment_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid, p_actor_email text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order          public.orders%ROWTYPE;
  v_item           public.order_items%ROWTYPE;
  v_invoice_id     uuid;
  v_invoice_number text;
  v_total_amount   numeric(12,2);
  v_currency       text;
  v_line_type      public.invoice_line_type;
  v_existing       RECORD;
  v_corporate_id   uuid; -- NEW
BEGIN

  -- ── Step 1: Lock order row (prevents concurrent duplicate invocations) ──────
  SELECT * INTO v_order
  FROM   public.orders
  WHERE  id         = p_order_id
    AND  deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: order % does not exist or has been deleted',
      p_order_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_order.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: order % does not exist or has been deleted',
      p_order_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'INVOICE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Terminal status: cannot invoice a cancelled or refunded order.
  IF v_order.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'ORDER_TERMINAL: order % has status % and cannot be invoiced',
      p_order_id, v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Already paid status: a prior payment path was used; surfacing the anomaly
  -- is safer than silently creating a duplicate invoice.
  IF v_order.status IN ('paid', 'partially_paid') THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAID: order % is in status %. An invoice should already exist.',
      p_order_id, v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Step 2: Idempotency check ─────────────────────────────────────────────
  IF v_order.invoice_id IS NOT NULL THEN
    SELECT id, status, invoice_number, total_amount, currency, order_id
    INTO   v_existing
    FROM   public.invoices
    WHERE  id = v_order.invoice_id;

    IF FOUND AND v_existing.status <> 'void' THEN
      -- Existing non-void invoice: return it without creating anything new.
      RETURN jsonb_build_object(
        'invoice_id',     v_existing.id,
        'invoice_number', v_existing.invoice_number,
        'total_amount',   v_existing.total_amount,
        'currency',       v_existing.currency,
        'order_id',       p_order_id,
        'order_number',   v_order.order_number,
        'idempotent',     true
      );
    END IF;

    IF FOUND AND v_existing.status = 'void' THEN
      -- orders.invoice_id points to a void invoice that was not cleared.
      -- void_invoice() (D2.1) should have cleared this. Manual intervention needed.
      RAISE EXCEPTION 'VOID_LOCK: order % references void invoice %. The invoice was voided but orders.invoice_id was not cleared. Contact platform support.',
        p_order_id, v_order.invoice_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Inconsistent state: pending_payment with no invoice means prior run
  -- advanced the order status but did not link an invoice.
  IF v_order.status = 'pending_payment' AND v_order.invoice_id IS NULL THEN
    RAISE EXCEPTION 'INCONSISTENT_STATE: order % is in pending_payment status but has no linked invoice. This state cannot be resolved automatically.',
      p_order_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Step 3: Validate student reference ───────────────────────────────────
  IF v_order.student_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_STUDENT: order % has no student reference. The student may have been deleted after order creation.',
      p_order_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Step 4: Validate at least one line item exists ────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE order_id = p_order_id LIMIT 1
  ) THEN
    RAISE EXCEPTION 'ORDER_NO_ITEMS: order % has no line items to invoice',
      p_order_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT corporate_customer_id INTO v_corporate_id
  FROM   public.students
  WHERE  id = v_order.student_id;

  -- ── Step 5: Insert draft invoice ─────────────────────────────────────────
  INSERT INTO public.invoices (
    organization_id,
    student_id,
    corporate_customer_id, -- NEW
    order_id,
    assignment_id,
    status,
    currency,
    due_date,
    notes,
    created_by,
    updated_by
  ) VALUES (
    v_order.organization_id,
    v_order.student_id,
    v_corporate_id, -- NEW
    p_order_id,
    v_order.assignment_id,
    'draft',
    v_order.currency,
    p_due_date,
    COALESCE(p_notes, v_order.internal_notes),
    p_actor_id,
    p_actor_id
  )
  RETURNING id INTO v_invoice_id;

  -- ── Step 6: Insert line items from order_items ────────────────────────────
  FOR v_item IN
    SELECT *
    FROM   public.order_items
    WHERE  order_id = p_order_id
    ORDER  BY sort_order ASC, created_at ASC
  LOOP
    v_line_type := CASE v_item.item_type
      WHEN 'package'            THEN 'package'::public.invoice_line_type
      WHEN 'campaign_discount'  THEN 'discount'::public.invoice_line_type
      WHEN 'coupon_discount'    THEN 'discount'::public.invoice_line_type
      WHEN 'administrative_fee' THEN 'fee'::public.invoice_line_type
      WHEN 'manual_adjustment'  THEN 'fee'::public.invoice_line_type
      ELSE NULL
    END;

    IF v_line_type IS NULL THEN
      RAISE EXCEPTION 'UNKNOWN_ITEM_TYPE: order_item % has unrecognized item_type "%". Add a mapping or extend order_items.item_type vocabulary.',
        v_item.id, v_item.item_type
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.invoice_line_items (
      organization_id,
      invoice_id,
      line_type,
      description,
      quantity,
      unit_price,
      vat_rate,
      sort_order
    ) VALUES (
      v_order.organization_id,
      v_invoice_id,
      v_line_type,
      v_item.description,
      v_item.quantity,
      v_item.unit_price,
      v_order.vat_rate,
      v_item.sort_order
    );
  END LOOP;

  -- ── Step 7: Issue the invoice ─────────────────────────────────────────────
  SELECT public.issue_invoice(v_invoice_id, p_actor_id)
  INTO   v_invoice_number;

  -- Read frozen totals for the return value
  SELECT total_amount, currency
  INTO   v_total_amount, v_currency
  FROM   public.invoices
  WHERE  id = v_invoice_id;

  -- ── Step 8: Link invoice to order ─────────────────────────────────────────
  UPDATE public.orders
  SET
    invoice_id = v_invoice_id,
    updated_at = now(),
    updated_by = p_actor_id
  WHERE id = p_order_id;

  -- ── Step 9: Advance order status to pending_payment ───────────────────────
  PERFORM public.update_order_status(
    p_order_id,
    v_order.organization_id,
    'pending_payment',
    p_actor_id,
    p_actor_email
  );

  -- ── Step 10: Emit enrollment audit event (conditional) ────────────────────
  IF p_enrollment_id IS NOT NULL THEN
    PERFORM public.emit_enrollment_event(
      v_order.organization_id,
      p_enrollment_id,
      'invoice_created',
      p_actor_id,
      p_actor_email,
      jsonb_build_object(
        'invoice_id',     v_invoice_id,
        'invoice_number', v_invoice_number,
        'total_amount',   v_total_amount,
        'order_id',       p_order_id
      )
    );
  END IF;

  -- ── Step 11: Return ───────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'invoice_id',     v_invoice_id,
    'invoice_number', v_invoice_number,
    'total_amount',   v_total_amount,
    'currency',       v_currency,
    'order_id',       p_order_id,
    'order_number',   v_order.order_number,
    'idempotent',     false
  );

END;
$function$;

CREATE OR REPLACE FUNCTION public.process_refund(p_org_id uuid, p_invoice_id uuid, p_refund_type refund_type, p_reason_code refund_reason_code, p_refund_amount numeric DEFAULT 0, p_credit_qty integer DEFAULT 0, p_credit_category lesson_category DEFAULT NULL::lesson_category, p_grant_entry_id uuid DEFAULT NULL::uuid, p_payment_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice         invoices%ROWTYPE;
  v_payment         payments%ROWTYPE;
  v_refund_id       uuid;
  v_ledger_id       uuid;
  v_ledger_qty      int;
  v_prior_refunds   numeric(12,2);
  v_new_paid        numeric(12,2);
  v_new_outstanding numeric(12,2);
  v_new_inv_status  invoice_status;
  v_new_pay_status  payment_status;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'REFUND_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Period lock guard
  PERFORM assert_period_not_locked(p_org_id, now()::date);

  -- 2. Basic argument validation
  IF p_refund_amount = 0 AND p_credit_qty = 0 THEN
    RAISE EXCEPTION 'INVALID_REFUND: both refund_amount and credit_qty are 0; nothing to refund'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_refund_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_REFUND: refund_amount must be >= 0, got %', p_refund_amount
      USING ERRCODE = 'P0001';
  END IF;

  IF p_credit_qty < 0 THEN
    RAISE EXCEPTION 'INVALID_REFUND: credit_qty must be >= 0, got %', p_credit_qty
      USING ERRCODE = 'P0001';
  END IF;

  IF p_credit_qty > 0 AND p_credit_category IS NULL THEN
    RAISE EXCEPTION 'CREDIT_CATEGORY_REQUIRED: credit_category must be specified when credit_qty > 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Lock and validate invoice
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id              = p_invoice_id
    AND  organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: invoice % not found in org %', p_invoice_id, p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.status NOT IN ('paid', 'partially_paid') THEN
    RAISE EXCEPTION 'INVOICE_NOT_REFUNDABLE: invoice % has status %; must be paid or partially_paid',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Over-refund protection (monetary)
  IF p_refund_amount > 0 THEN
    SELECT COALESCE(SUM(r.refund_amount), 0)
    INTO   v_prior_refunds
    FROM   refunds r
    WHERE  r.invoice_id    = p_invoice_id
      AND  r.refund_status = 'completed';

    IF p_refund_amount > (v_invoice.paid_amount - v_prior_refunds) THEN
      RAISE EXCEPTION 'OVER_REFUND: cannot refund % (paid_amount=%, prior_refunds=%, net_available=%)',
        p_refund_amount,
        v_invoice.paid_amount,
        v_prior_refunds,
        (v_invoice.paid_amount - v_prior_refunds)
        USING ERRCODE = 'P0001';
    END IF;

    -- 5. Resolve payment record (specific or auto-select most recent confirmed)
    IF p_payment_id IS NOT NULL THEN
      SELECT * INTO v_payment
      FROM   payments
      WHERE  id              = p_payment_id
        AND  organization_id = p_org_id
        AND  invoice_id      = p_invoice_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_NOT_FOUND: payment % not found on invoice %',
          p_payment_id, p_invoice_id
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      SELECT * INTO v_payment
      FROM   payments
      WHERE  invoice_id      = p_invoice_id
        AND  organization_id = p_org_id
        AND  status          = 'confirmed'
      ORDER  BY confirmed_at DESC NULLS LAST
      LIMIT  1
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_PAYMENT_FOUND: no confirmed payment on invoice % to apply refund against',
          p_invoice_id
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- 6. Create the refund record (processing state)
  INSERT INTO refunds (
    organization_id, invoice_id, payment_id, student_id,
    refund_type, refund_status, reason_code,
    refund_amount, credit_quantity, credit_category,
    notes, created_by
  ) VALUES (
    p_org_id,
    p_invoice_id,
    CASE WHEN p_refund_amount > 0 THEN v_payment.id ELSE NULL END,
    v_invoice.student_id,
    p_refund_type,
    'processing',
    p_reason_code,
    p_refund_amount,
    p_credit_qty,
    p_credit_category,
    p_notes,
    p_actor_id
  ) RETURNING id INTO v_refund_id;

  -- 7. Process credit reversal
  IF p_credit_qty > 0 THEN
    v_ledger_qty := CASE WHEN p_refund_type = 'credit_only' THEN p_credit_qty ELSE -p_credit_qty END;

    INSERT INTO credit_ledger (
      organization_id, student_id, lesson_category,
      entry_type, quantity, currency,
      grant_entry_id,
      reference_type, reference_id,
      description, actor_id
    ) VALUES (
      p_org_id,
      v_invoice.student_id,
      p_credit_category,
      'reverse',
      v_ledger_qty,
      'SEK',
      p_grant_entry_id,
      'refund',
      v_refund_id,
      'Credit reversal: ' || p_reason_code::text,
      p_actor_id
    ) RETURNING id INTO v_ledger_id;

    UPDATE refunds
    SET credit_ledger_id = v_ledger_id
    WHERE id = v_refund_id;
  END IF;

  -- 8. Process monetary refund
  IF p_refund_amount > 0 THEN
    v_new_pay_status := CASE
      WHEN (v_payment.amount - COALESCE(v_payment.refund_amount, 0) - p_refund_amount) <= 0
      THEN 'refunded'::payment_status
      ELSE 'partially_refunded'::payment_status
    END;

    UPDATE payments
    SET
      refund_amount = COALESCE(refund_amount, 0) + p_refund_amount,
      refunded_at   = now(),
      refunded_by   = p_actor_id,
      status        = v_new_pay_status,
      updated_at    = now()
    WHERE id = v_payment.id;

    v_new_paid        := v_invoice.paid_amount - p_refund_amount;
    v_new_outstanding := v_invoice.total_amount - v_new_paid;
    v_new_inv_status  := CASE
      WHEN v_new_outstanding <= 0 THEN 'paid'::invoice_status
      WHEN v_new_paid > 0         THEN 'partially_paid'::invoice_status
      ELSE                             'issued'::invoice_status
    END;

    UPDATE invoices
    SET
      paid_amount        = v_new_paid,
      outstanding_amount = v_new_outstanding,
      status             = v_new_inv_status,
      paid_at            = CASE WHEN v_new_inv_status = 'paid' THEN paid_at ELSE NULL END,
      updated_at         = now()
    WHERE id = p_invoice_id;
  END IF;

  -- 9. Mark refund completed (immutable after this)
  UPDATE refunds
  SET
    refund_status = 'completed',
    processed_at  = now(),
    processed_by  = p_actor_id
  WHERE id = v_refund_id;

  -- 10. Emit Refund.Processed
  PERFORM insert_outbox_event(
    'Refund.Processed',
    'accounting',
    jsonb_build_object(
      'refund_id',        v_refund_id,
      'invoice_id',       p_invoice_id,
      'payment_id',       CASE WHEN p_refund_amount > 0 THEN v_payment.id ELSE NULL END,
      'student_id',       v_invoice.student_id,
      'refund_type',      p_refund_type,
      'reason_code',      p_reason_code,
      'refund_amount',    p_refund_amount,
      'credit_quantity',  p_credit_qty,
      'credit_category',  p_credit_category,
      'credit_ledger_id', v_ledger_id
    ),
    p_org_id,
    v_invoice.student_id::text
  );

  RETURN v_refund_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_payment(p_invoice_id uuid, p_amount numeric, p_method payment_method, p_reference text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice         invoices%ROWTYPE;
  v_payment_id      uuid;
  v_new_paid        numeric(12,2);
  v_new_outstanding numeric(12,2);
  v_new_status      invoice_status;
BEGIN
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_invoice.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PAYMENT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_invoice.status NOT IN ('issued', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'INVOICE_NOT_PAYABLE: invoice % has status %; expected issued/partially_paid/overdue',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: payment amount must be positive, got %', p_amount
      USING ERRCODE = 'P0001';
  END IF;

  -- Period lock guard (Phase 4B addition)
  PERFORM assert_period_not_locked(v_invoice.organization_id, now()::date);

  -- Insert confirmed payment
  INSERT INTO payments (
    organization_id, invoice_id, student_id,
    payment_method, status, amount, currency,
    provider_reference,
    paid_at, confirmed_at, confirmed_by,
    created_by
  ) VALUES (
    v_invoice.organization_id, p_invoice_id, v_invoice.student_id,
    p_method, 'confirmed', p_amount, v_invoice.currency,
    p_reference,
    now(), now(), p_actor_id,
    p_actor_id
  ) RETURNING id INTO v_payment_id;

  -- Write payment allocation record (Phase 4B addition — enables reconciliation layer)
  INSERT INTO payment_allocations (
    organization_id, payment_id, invoice_id,
    allocated_amount, created_by
  ) VALUES (
    v_invoice.organization_id, v_payment_id, p_invoice_id,
    p_amount, p_actor_id
  );

  -- Update invoice amounts and status
  v_new_paid        := v_invoice.paid_amount + p_amount;
  v_new_outstanding := v_invoice.total_amount - v_new_paid;
  v_new_status      := CASE
    WHEN v_new_outstanding <= 0 THEN 'paid'::invoice_status
    ELSE                             'partially_paid'::invoice_status
  END;

  UPDATE invoices
  SET
    paid_amount        = v_new_paid,
    outstanding_amount = v_new_outstanding,
    status             = v_new_status,
    paid_at            = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END,
    updated_at         = now()
  WHERE id = p_invoice_id;

  -- Publish Payment.Received
  PERFORM insert_outbox_event(
    'Payment.Received',
    'accounting',
    jsonb_build_object(
      'payment_id',  v_payment_id,
      'invoice_id',  p_invoice_id,
      'student_id',  v_invoice.student_id,
      'amount',      p_amount,
      'currency',    v_invoice.currency,
      'method',      p_method,
      'reference',   p_reference
    ),
    v_invoice.organization_id,
    v_invoice.student_id::text
  );

  -- Publish Invoice.Paid if fully settled
  IF v_new_status = 'paid' THEN
    PERFORM insert_outbox_event(
      'Invoice.Paid',
      'accounting',
      jsonb_build_object(
        'invoice_id',     p_invoice_id,
        'invoice_number', v_invoice.invoice_number,
        'student_id',     v_invoice.student_id,
        'total_amount',   v_invoice.total_amount,
        'payment_id',     v_payment_id,
        'currency',       v_invoice.currency
      ),
      v_invoice.organization_id,
      v_invoice.student_id::text
    );
  END IF;

  RETURN v_payment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid, p_organization_id uuid, p_new_status text, p_actor_id uuid DEFAULT NULL::uuid, p_actor_email text DEFAULT NULL::text, p_amount_paid numeric DEFAULT NULL::numeric, p_cancellation_reason text DEFAULT NULL::text, p_internal_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order             RECORD;
  v_asgn              RECORD;
  v_event_type        text;
  v_now               timestamptz := now();
  v_cancelled_count   int         := 0;
BEGIN
  -- Lock the order row for the duration of this transaction.
  SELECT * INTO v_order
  FROM   public.orders
  WHERE  id              = p_order_id
    AND  organization_id = p_organization_id
    AND  deleted_at      IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND p_organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ORDER_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- ── Terminal status guard ────────────────────────────────────────────────────
  IF v_order.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Order is % — terminal status cannot be changed', v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Same-status guard ────────────────────────────────────────────────────────
  IF p_new_status = v_order.status THEN
    RAISE EXCEPTION 'Order is already in status %', p_new_status
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Map new status to audit event type ───────────────────────────────────────
  v_event_type := CASE p_new_status
    WHEN 'pending_payment' THEN 'payment_initiated'
    WHEN 'paid'            THEN 'payment_completed'
    WHEN 'partially_paid'  THEN 'payment_completed'
    WHEN 'cancelled'       THEN 'cancelled'
    WHEN 'refunded'        THEN 'refunded'
    ELSE                        'order_updated'
  END;

  -- ── Update the order row ─────────────────────────────────────────────────────
  UPDATE public.orders
  SET
    status              = p_new_status,
    amount_paid         = COALESCE(p_amount_paid, amount_paid),
    internal_notes      = COALESCE(p_internal_notes, internal_notes),
    cancellation_reason = CASE WHEN p_new_status = 'cancelled'
                               THEN p_cancellation_reason
                               ELSE cancellation_reason
                          END,
    cancelled_by        = CASE WHEN p_new_status = 'cancelled'
                               THEN p_actor_id
                               ELSE cancelled_by
                          END,
    cancelled_at        = CASE WHEN p_new_status = 'cancelled'
                               THEN v_now
                               ELSE cancelled_at
                          END,
    confirmed_at        = CASE WHEN p_new_status = 'pending_payment'
                                AND confirmed_at IS NULL
                               THEN v_now
                               ELSE confirmed_at
                          END,
    paid_at             = CASE WHEN p_new_status = 'paid'
                               THEN v_now
                               ELSE paid_at
                          END,
    updated_by          = p_actor_id,
    updated_at          = v_now
  WHERE id = p_order_id;

  -- ── Emit order timeline event ────────────────────────────────────────────────
  PERFORM public.emit_order_event(
    p_organization_id, p_order_id, v_event_type,
    p_actor_id, p_actor_email,
    jsonb_build_object(
      'previous_status',     v_order.status,
      'new_status',          p_new_status,
      'amount_paid',         COALESCE(p_amount_paid, v_order.amount_paid),
      'cancellation_reason', p_cancellation_reason
    )
  );

  -- ── R-2.1: Cascade cancel linked package assignments ─────────────────────────
  IF p_new_status = 'cancelled' THEN

    FOR v_asgn IN
      SELECT id, student_id, lessons_used
      FROM   public.student_package_assignments
      WHERE  order_id        = p_order_id
        AND  organization_id = p_organization_id
        AND  status          = 'active'
      FOR UPDATE
    LOOP

      UPDATE public.student_package_assignments
      SET
        status              = 'cancelled',
        cancelled_at        = v_now,
        cancelled_by        = p_actor_id,
        cancellation_reason = p_cancellation_reason,
        updated_at          = v_now
      WHERE id = v_asgn.id;

      INSERT INTO public.package_consumption_events (
        organization_id,
        assignment_id,
        student_id,
        event_type,
        credits_delta,
        lessons_used_after,
        actor_id,
        actor_email,
        metadata
      ) VALUES (
        p_organization_id,
        v_asgn.id,
        v_asgn.student_id,
        'package_cancelled',
        0,
        v_asgn.lessons_used,
        p_actor_id,
        p_actor_email,
        jsonb_build_object(
          'order_id',             p_order_id,
          'cancellation_reason',  p_cancellation_reason
        )
      );

      PERFORM public.insert_outbox_event(
        'Package.Cancelled',
        'internal'::public.event_channel,
        jsonb_build_object(
          'assignment_id',        v_asgn.id,
          'student_id',           v_asgn.student_id,
          'order_id',             p_order_id,
          'cancelled_by',         p_actor_id,
          'cancelled_by_email',   p_actor_email,
          'cancellation_reason',  p_cancellation_reason,
          'lessons_used_at_cancel', v_asgn.lessons_used
        ),
        p_organization_id,
        v_asgn.student_id::text
      );

      v_cancelled_count := v_cancelled_count + 1;

    END LOOP;

  END IF;

  -- ── Return ───────────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'order_id',              p_order_id,
    'status',                p_new_status,
    'event_type',            v_event_type,
    'assignments_cancelled', v_cancelled_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id uuid, p_actor_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice      invoices%ROWTYPE;
  v_void_at      timestamptz;
  v_prev_status  text;
  v_reset_status text;
BEGIN

  -- ── Load and lock the invoice row ─────────────────────────────────────────
  SELECT * INTO v_invoice
  FROM   public.invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_invoice.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'INVOICE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- ── Guard: only draft and issued invoices may be voided ───────────────────
  IF v_invoice.status NOT IN ('draft', 'issued') THEN
    RAISE EXCEPTION 'CANNOT_VOID: invoice % has status %; only draft/issued invoices can be voided',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  v_void_at := now();

  -- ── Void the invoice (immutable finance record update) ────────────────────
  UPDATE public.invoices
  SET
    status      = 'void',
    void_at     = v_void_at,
    void_by     = p_actor_id,
    void_reason = p_reason,
    updated_at  = now()
  WHERE id = p_invoice_id;

  -- ── D2.1 block: order reset + commercial status reset ────────────────────
  IF v_invoice.order_id IS NOT NULL THEN
    SELECT status INTO v_prev_status
    FROM   public.orders
    WHERE  id         = v_invoice.order_id
      AND  invoice_id = p_invoice_id
    FOR UPDATE;

    IF FOUND THEN

      v_reset_status := CASE WHEN v_prev_status = 'pending_payment'
                             THEN 'draft'
                             ELSE v_prev_status
                        END;

      UPDATE public.orders
      SET
        invoice_id = NULL,
        status     = v_reset_status,
        updated_at = now()
      WHERE id = v_invoice.order_id;

      PERFORM public.emit_order_event(
        v_invoice.organization_id,
        v_invoice.order_id,
        'invoice_voided_order_reset',
        p_actor_id,
        NULL,
        jsonb_build_object(
          'invoice_id',            p_invoice_id,
          'order_id',              v_invoice.order_id,
          'previous_order_status', v_prev_status,
          'reset_order_status',    v_reset_status
        )
      );

      IF v_invoice.student_id IS NOT NULL THEN
        PERFORM public.set_student_commercial_status(
          v_invoice.organization_id,
          v_invoice.student_id,
          'aktiverad_ej_fakturerad'
        );
      END IF;

    END IF;
  END IF;

  -- ── Invoice.Voided outbox event ───────────────────────────────────────────
  PERFORM public.insert_outbox_event(
    'Invoice.Voided',
    'accounting',
    jsonb_build_object(
      'invoice_id',     p_invoice_id,
      'invoice_number', v_invoice.invoice_number,
      'student_id',     v_invoice.student_id,
      'order_id',       v_invoice.order_id,
      'reason',         p_reason,
      'voided_by',      p_actor_id
    ),
    v_invoice.organization_id,
    v_invoice.student_id::text
  );

  RETURN v_void_at;
END;
$function$;

-- ============================================================================
-- B. GL-POSTING FAMILY (payroll, tax, VAT clearing, depreciation, accrual,
--    deferred revenue, revenue recognition) — same shape/severity as the
--    six journal functions fixed in Wave 2A, extended here.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_recognize_revenue(p_org_id uuid, p_as_of_date date DEFAULT CURRENT_DATE, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking   record;
  v_count     int := 0;
  v_result    uuid;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'REVENUE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  FOR v_booking IN
    SELECT DISTINCT cl.booking_id
    FROM   credit_ledger cl
    WHERE  cl.organization_id = p_org_id
      AND  cl.entry_type      = 'consume'
      AND  cl.booking_id      IS NOT NULL
      AND  cl.created_at::date <= p_as_of_date
      AND  NOT EXISTS (
        SELECT 1 FROM revenue_recognition_events rre
        WHERE  rre.booking_id = cl.booking_id
      )
    ORDER  BY cl.booking_id
    LIMIT  200
  LOOP
    v_result := recognize_lesson_revenue(v_booking.booking_id, p_actor_id);
    IF v_result IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_accrual_release(p_schedule_id uuid, p_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_schedule  public.accrual_schedules%ROWTYPE;
  v_line      public.accrual_release_lines%ROWTYPE;
  v_entry_id  uuid;
  v_lines     jsonb;
BEGIN
  SELECT * INTO v_schedule FROM public.accrual_schedules WHERE id = p_schedule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCRUAL_SCHEDULE_NOT_FOUND: % does not exist', p_schedule_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_schedule.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ACCRUAL_SCHEDULE_NOT_FOUND: % does not exist', p_schedule_id
      USING ERRCODE = 'P0002';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ACCRUAL_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_schedule.status NOT IN ('active') THEN
    RAISE EXCEPTION
      'ACCRUAL_NOT_ACTIVE: schedule status is %, cannot post releases',
      v_schedule.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Next unposted, uncancelled release line
  SELECT * INTO v_line
  FROM   public.accrual_release_lines
  WHERE  accrual_schedule_id = p_schedule_id
    AND  is_posted   = false
    AND  is_cancelled = false
  ORDER  BY period_number ASC
  LIMIT  1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'NO_ACCRUAL_RELEASE_DUE: no pending release lines for schedule %', p_schedule_id
      USING ERRCODE = 'P0001';
  END IF;

  -- DR release_debit_account / CR release_credit_account
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_schedule.release_debit_account,
      'debit_amount',  v_line.release_amount,
      'credit_amount', 0,
      'description',
        v_schedule.description || ' — period ' || v_line.period_number || '/' || v_schedule.release_months
    ),
    jsonb_build_object(
      'account_code',  v_schedule.release_credit_account,
      'debit_amount',  0,
      'credit_amount', v_line.release_amount,
      'description',
        v_schedule.description || ' — period ' || v_line.period_number || '/' || v_schedule.release_months
    )
  );

  v_entry_id := public.post_journal_entry(
    v_schedule.organization_id,
    p_period_id,
    'standard'::public.journal_entry_type,
    v_line.release_date,
    'Periodisering: ' || v_schedule.description
      || ' (' || v_line.period_number || '/' || v_schedule.release_months || ')',
    v_lines,
    'Accrual.Released',
    'accrual_schedule',
    p_schedule_id,
    'P',
    NULL, NULL,
    p_actor_id
  );

  -- Mark line posted
  UPDATE public.accrual_release_lines
  SET is_posted = true, posted_at = now(), journal_entry_id = v_entry_id
  WHERE id = v_line.id;

  -- Update schedule header totals
  UPDATE public.accrual_schedules
  SET released_amount = released_amount + v_line.release_amount,
      months_released = months_released + 1,
      status = CASE
        WHEN (months_released + 1) >= release_months THEN 'fully_released'::public.accrual_status
        ELSE status
      END,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = p_schedule_id;

  RETURN v_entry_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_amendment_journal(p_period_id uuid, p_lines jsonb, p_reason text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period   financial_periods%ROWTYPE;
  v_entry_id uuid;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_period.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'AMENDMENT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'PERIOD_HARD_CLOSED: period % is locked. '
      'Locked periods cannot receive journal entries. '
      'Use reverse_journal_entry() on a prior posted entry if a correction is needed.',
      p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_period.status <> 'closed' THEN
    RAISE EXCEPTION 'PERIOD_NOT_SOFT_CLOSED: amendments can only be posted to soft-closed (closed) periods. '
      'Period % has status %.',
      p_period_id, v_period.status
      USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'AMENDMENT_REASON_REQUIRED: a reason is required for amendment journal entries'
      USING ERRCODE = 'P0001';
  END IF;

  -- Post the journal entry via the core engine (checks balance, assigns voucher, etc.)
  v_entry_id := public.post_journal_entry(
    p_org_id                 => v_period.organization_id,
    p_period_id              => p_period_id,
    p_entry_type             => 'manual',
    p_entry_date             => v_period.period_end,
    p_description            => 'Amendment: ' || p_reason,
    p_lines                  => p_lines,
    p_source_event_type      => 'Period.Amendment',
    p_source_entity_type     => 'financial_period',
    p_source_entity_id       => p_period_id,
    p_voucher_series         => 'M',
    p_reversal_of_entry_id   => NULL,
    p_correction_of_entry_id => NULL,
    p_actor_id               => p_actor_id
  );

  -- Increment amendment counter atomically
  UPDATE financial_periods
  SET amendment_count = amendment_count + 1,
      updated_at      = now()
  WHERE id = p_period_id;

  RETURN v_entry_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_asset_disposal(p_asset_id uuid, p_period_id uuid, p_disposal_type asset_disposal_type, p_disposal_date date, p_proceeds numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset       public.fixed_assets%ROWTYPE;
  v_class       public.fixed_asset_classes%ROWTYPE;
  v_gain_loss   numeric(14,2);
  v_lines       jsonb;
  v_entry_id    uuid;
  v_disposal_id uuid;
  v_bank_acct   text;
BEGIN
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_asset.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ASSET_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_asset.status = 'disposed' THEN
    RAISE EXCEPTION 'ASSET_ALREADY_DISPOSED: asset % is already disposed', p_asset_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_asset.status = 'draft' THEN
    RAISE EXCEPTION 'ASSET_DRAFT: cannot dispose a draft asset'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_proceeds < 0 THEN
    RAISE EXCEPTION 'DISPOSAL_NEGATIVE_PROCEEDS: proceeds must be >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_class FROM public.fixed_asset_classes WHERE id = v_asset.asset_class_id;

  v_gain_loss := p_proceeds - v_asset.net_book_value;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_class.accumulated_depr_account,
      'debit_amount',  v_asset.accumulated_depreciation,
      'credit_amount', 0,
      'description',   'Avyttring ackumulerade avskrivningar: ' || v_asset.asset_name
    ),
    jsonb_build_object(
      'account_code',  v_class.asset_account,
      'debit_amount',  0,
      'credit_amount', v_asset.acquisition_cost,
      'description',   'Avyttring anskaffningsvärde: ' || v_asset.asset_name
    )
  );

  IF p_proceeds > 0 THEN
    v_bank_acct := resolve_org_bas_account(v_asset.organization_id, 'Treasury.BankAccount');
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code',  v_bank_acct,
        'debit_amount',  p_proceeds,
        'credit_amount', 0,
        'description',   'Avyttring likvid: ' || v_asset.asset_name
      )
    );
  END IF;

  IF v_gain_loss > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code',  v_class.disposal_gain_account,
        'debit_amount',  0,
        'credit_amount', v_gain_loss,
        'description',   'Realisationsvinst: ' || v_asset.asset_name
      )
    );
  ELSIF v_gain_loss < 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code',  v_class.disposal_loss_account,
        'debit_amount',  ABS(v_gain_loss),
        'credit_amount', 0,
        'description',   'Realisationsförlust: ' || v_asset.asset_name
      )
    );
  END IF;

  v_entry_id := public.post_journal_entry(
    v_asset.organization_id,
    p_period_id,
    'standard'::public.journal_entry_type,
    p_disposal_date,
    'Avyttring anläggningstillgång: ' || v_asset.asset_name,
    v_lines,
    'FixedAsset.Disposed',
    'fixed_asset',
    p_asset_id,
    'D',
    NULL, NULL,
    p_actor_id
  );

  INSERT INTO public.asset_disposals
    (organization_id, asset_id, disposal_type, disposal_date,
     net_book_value_at_disposal, proceeds, gain_loss, journal_entry_id, notes, created_by)
  VALUES
    (v_asset.organization_id, p_asset_id, p_disposal_type, p_disposal_date,
     v_asset.net_book_value, p_proceeds, v_gain_loss, v_entry_id, p_notes, p_actor_id)
  RETURNING id INTO v_disposal_id;

  UPDATE public.fixed_assets
  SET status          = 'disposed',
      disposal_id     = v_disposal_id,
      net_book_value  = 0,
      updated_by      = p_actor_id,
      updated_at      = now()
  WHERE id = p_asset_id;

  RETURN v_disposal_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_deferred_revenue_entry(p_invoice_id uuid, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice     invoices%ROWTYPE;
  v_package     student_packages%ROWTYPE;
  v_entry_id    uuid;
  v_schedule_id uuid;
  v_per_lesson  numeric(12,2);
BEGIN
  -- 1. Fetch invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: invoice % not found', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_invoice.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: invoice % not found', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'DEFERRED_REVENUE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Post the journal entry (idempotent)
  v_entry_id := post_invoice_journal_entry(p_invoice_id, p_actor_id);

  -- 3. If this is a package invoice, create/update the deferred revenue schedule
  IF v_invoice.student_package_id IS NOT NULL THEN

    -- Idempotency check for schedule
    SELECT id INTO v_schedule_id
    FROM   deferred_revenue_schedules
    WHERE  invoice_id = p_invoice_id;

    IF NOT FOUND THEN
      -- Fetch package details
      SELECT * INTO v_package
      FROM   student_packages
      WHERE  id = v_invoice.student_package_id;

      IF NOT FOUND THEN
        RETURN v_entry_id; -- Package no longer exists; skip schedule creation
      END IF;

      v_per_lesson := ROUND(
        v_invoice.subtotal_amount / GREATEST(v_package.quantity_granted, 1),
        2
      );

      INSERT INTO deferred_revenue_schedules (
        organization_id,
        invoice_id,
        student_package_id,
        total_lessons,
        recognized_lessons,
        total_deferred_net,
        recognized_amount_net,
        per_lesson_amount_net,
        deferral_account,
        recognition_account,
        initial_journal_id,
        created_by
      ) VALUES (
        v_invoice.organization_id,
        p_invoice_id,
        v_invoice.student_package_id,
        v_package.quantity_granted,
        0,
        v_invoice.subtotal_amount,
        0,
        v_per_lesson,
        '2970',
        '3041',
        v_entry_id,
        p_actor_id
      );
    END IF;

  END IF;

  RETURN v_entry_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_depreciation_period(p_asset_id uuid, p_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset     public.fixed_assets%ROWTYPE;
  v_class     public.fixed_asset_classes%ROWTYPE;
  v_schedule  public.depreciation_schedules%ROWTYPE;
  v_entry_id  uuid;
  v_lines     jsonb;
BEGIN
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSET_NOT_FOUND: asset % does not exist', p_asset_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_asset.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ASSET_NOT_FOUND: asset % does not exist', p_asset_id
      USING ERRCODE = 'P0002';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'DEPRECIATION_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_asset.status NOT IN ('active', 'impaired') THEN
    RAISE EXCEPTION
      'ASSET_NOT_DEPRECIABLE: asset status is %. Only active or impaired assets can be depreciated.',
      v_asset.status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_class FROM public.fixed_asset_classes WHERE id = v_asset.asset_class_id;

  SELECT * INTO v_schedule
  FROM   public.depreciation_schedules
  WHERE  asset_id  = p_asset_id
    AND  is_posted = false
  ORDER  BY period_number ASC
  LIMIT  1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'NO_DEPRECIATION_DUE: no unposted depreciation schedule line for asset %', p_asset_id
      USING ERRCODE = 'P0001';
  END IF;

  -- DR depreciation_exp_account / CR accumulated_depr_account
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_class.depreciation_exp_account,
      'debit_amount',  v_schedule.depreciation_amount,
      'credit_amount', 0,
      'description',
        'Avskrivning: ' || v_asset.asset_name
        || ' (' || v_schedule.period_number || '/' || v_asset.useful_life_months || ')'
    ),
    jsonb_build_object(
      'account_code',  v_class.accumulated_depr_account,
      'debit_amount',  0,
      'credit_amount', v_schedule.depreciation_amount,
      'description',   v_asset.asset_name || ' ackumulerade avskrivningar'
    )
  );

  v_entry_id := public.post_journal_entry(
    v_asset.organization_id,
    p_period_id,
    'standard'::public.journal_entry_type,
    v_schedule.schedule_date,
    'Avskrivning ' || v_asset.asset_name
      || ' period ' || v_schedule.period_number || '/' || v_asset.useful_life_months,
    v_lines,
    'FixedAsset.Depreciated',
    'fixed_asset',
    p_asset_id,
    'D',
    NULL, NULL,
    p_actor_id
  );

  -- Mark line posted
  UPDATE public.depreciation_schedules
  SET is_posted = true, posted_at = now(), journal_entry_id = v_entry_id
  WHERE id = v_schedule.id;

  -- Update asset running totals
  UPDATE public.fixed_assets
  SET accumulated_depreciation = accumulated_depreciation + v_schedule.depreciation_amount,
      net_book_value            = net_book_value - v_schedule.depreciation_amount,
      periods_posted            = periods_posted + 1,
      last_depreciation_date    = v_schedule.schedule_date,
      status = CASE
        WHEN (net_book_value - v_schedule.depreciation_amount) <= residual_value + 0.01
        THEN 'fully_depreciated'::public.fixed_asset_status
        ELSE status
      END,
      fully_depreciated_at = CASE
        WHEN (net_book_value - v_schedule.depreciation_amount) <= residual_value + 0.01
          AND fully_depreciated_at IS NULL
        THEN v_schedule.schedule_date
        ELSE fully_depreciated_at
      END,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = p_asset_id;

  RETURN v_entry_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_payroll_journal(p_run_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF NOT public.is_trusted_service_context()
     AND v_run.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PAYROLL_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
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
$function$;

CREATE OR REPLACE FUNCTION public.post_periodic_deferred_release(p_schedule_id uuid, p_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_schedule  public.periodic_deferred_schedules%ROWTYPE;
  v_line      public.periodic_deferred_lines%ROWTYPE;
  v_entry_id  uuid;
  v_lines     jsonb;
BEGIN
  SELECT * INTO v_schedule FROM public.periodic_deferred_schedules WHERE id = p_schedule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEFERRED_SCHEDULE_NOT_FOUND: % does not exist', p_schedule_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_schedule.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'DEFERRED_SCHEDULE_NOT_FOUND: % does not exist', p_schedule_id
      USING ERRCODE = 'P0002';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'DEFERRED_RELEASE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_schedule.is_fully_released THEN
    RAISE EXCEPTION 'DEFERRED_FULLY_RELEASED: schedule % is already fully released', p_schedule_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_line
  FROM   public.periodic_deferred_lines
  WHERE  schedule_id = p_schedule_id
    AND  is_posted   = false
  ORDER  BY period_number ASC
  LIMIT  1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'NO_DEFERRED_RELEASE_DUE: no unposted release lines for schedule %', p_schedule_id
      USING ERRCODE = 'P0001';
  END IF;

  -- DR deferral_account / CR recognition_account
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_schedule.deferral_account,
      'debit_amount',  v_line.release_amount,
      'credit_amount', 0,
      'description',
        'Intäktsavräkning: ' || v_schedule.description
        || ' (' || v_line.period_number || '/' || v_schedule.release_months || ')'
    ),
    jsonb_build_object(
      'account_code',  v_schedule.recognition_account,
      'debit_amount',  0,
      'credit_amount', v_line.release_amount,
      'description',
        'Intäktsavräkning: ' || v_schedule.description
        || ' (' || v_line.period_number || '/' || v_schedule.release_months || ')'
    )
  );

  v_entry_id := public.post_journal_entry(
    v_schedule.organization_id,
    p_period_id,
    'standard'::public.journal_entry_type,
    v_line.release_date,
    'Intäktsavräkning: ' || v_schedule.description
      || ' period ' || v_line.period_number || '/' || v_schedule.release_months,
    v_lines,
    'DeferredRevenue.Released',
    'periodic_deferred_schedule',
    p_schedule_id,
    'P',
    NULL, NULL,
    p_actor_id
  );

  UPDATE public.periodic_deferred_lines
  SET is_posted = true, posted_at = now(), journal_entry_id = v_entry_id
  WHERE id = v_line.id;

  UPDATE public.periodic_deferred_schedules
  SET released_amount    = released_amount + v_line.release_amount,
      months_released    = months_released + 1,
      is_fully_released  = ((months_released + 1) >= release_months),
      updated_by         = p_actor_id,
      updated_at         = now()
  WHERE id = p_schedule_id;

  RETURN v_entry_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_salary_payment(p_run_id uuid, p_payment_date date DEFAULT NULL::date, p_bank_account text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF NOT public.is_trusted_service_context()
     AND v_run.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'SALARY_PAYMENT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
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
$function$;

CREATE OR REPLACE FUNCTION public.post_tax_clearing_journal(p_remittance_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF NOT public.is_trusted_service_context()
     AND v_rem.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_NOT_FOUND: %', p_remittance_id USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'TAX_CLEARING_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
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
$function$;

CREATE OR REPLACE FUNCTION public.post_tax_payment_journal(p_remittance_id uuid, p_payment_date date DEFAULT NULL::date, p_reference text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF NOT public.is_trusted_service_context()
     AND v_rem.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_NOT_FOUND: %', p_remittance_id USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'TAX_PAYMENT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
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
$function$;

CREATE OR REPLACE FUNCTION public.post_vat_clearing_journal(p_run_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF NOT public.is_trusted_service_context()
     AND v_run.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'VAT_CLEARING_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'VAT_CLEARING_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
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
$function$;

CREATE OR REPLACE FUNCTION public.post_vat_payment_journal(p_run_id uuid, p_payment_date date DEFAULT NULL::date, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF NOT public.is_trusted_service_context()
     AND v_run.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'VAT_CLEARING_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'VAT_PAYMENT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
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
    v_desc  := 'Momsbetalning Skatteverket ' || to_char(v_date, 'YYYY-MM-DD');
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '2650', 'debit_amount', v_amount, 'credit_amount', 0, 'description', v_desc),
      jsonb_build_object('account_code', '1930', 'debit_amount', 0, 'credit_amount', v_amount, 'description', v_desc)
    );
  ELSE
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
$function$;

CREATE OR REPLACE FUNCTION public.recognize_lesson_revenue(p_booking_id uuid, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id          uuid;
  v_package_id      uuid;
  v_schedule        deferred_revenue_schedules%ROWTYPE;
  v_entry_id        uuid;
  v_period_id       uuid;
  v_lines           jsonb;
  v_recog_date      date;
BEGIN
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'REVENUE_RECOGNITION_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Idempotency: check if already recognized for this booking
  IF EXISTS (
    SELECT 1 FROM revenue_recognition_events WHERE booking_id = p_booking_id
  ) THEN
    SELECT journal_entry_id INTO v_entry_id
    FROM   revenue_recognition_events WHERE booking_id = p_booking_id LIMIT 1;
    RETURN v_entry_id;
  END IF;

  -- 2. Find student_package_id via credit_ledger chain
  SELECT
    g.organization_id,
    g.student_package_id
  INTO v_org_id, v_package_id
  FROM   credit_ledger consume_e
  JOIN   credit_ledger g ON g.id = consume_e.grant_entry_id
  WHERE  consume_e.booking_id  = p_booking_id
    AND  consume_e.entry_type  = 'consume'
    AND  g.student_package_id  IS NOT NULL
  LIMIT 1;

  IF v_org_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND v_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'REVENUE_RECOGNITION_NOT_FOUND: booking % not found or not accessible', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_package_id IS NULL THEN
    -- No package credit consumed; no deferred revenue to recognize
    RETURN NULL;
  END IF;

  -- 3. Find deferred revenue schedule
  SELECT * INTO v_schedule
  FROM   deferred_revenue_schedules
  WHERE  student_package_id = v_package_id
    AND  organization_id    = v_org_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_schedule.is_fully_recognized THEN
    RETURN NULL;
  END IF;

  -- 4. Build recognition lines
  v_recog_date := CURRENT_DATE;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_schedule.deferral_account,
      'debit_amount',  v_schedule.per_lesson_amount_net,
      'credit_amount', 0,
      'description',   'Intäktsavräkning: lektion ' || p_booking_id::text
    ),
    jsonb_build_object(
      'account_code',  v_schedule.recognition_account,
      'debit_amount',  0,
      'credit_amount', v_schedule.per_lesson_amount_net,
      'description',   'Körlektionsintäkt: lektion ' || p_booking_id::text
    )
  );

  -- 5. Resolve period
  v_period_id := find_period_for_date(v_org_id, v_recog_date);

  -- 6. Post recognition journal entry
  v_entry_id := post_journal_entry(
    p_org_id             := v_org_id,
    p_period_id          := v_period_id,
    p_entry_type         := 'standard',
    p_entry_date         := v_recog_date,
    p_description        := 'Revenue recognition: booking ' || p_booking_id::text,
    p_lines              := v_lines,
    p_source_event_type  := 'Revenue.Recognized',
    p_source_entity_type := 'booking',
    p_source_entity_id   := p_booking_id,
    p_actor_id           := p_actor_id
  );

  -- 7. Record recognition event
  INSERT INTO revenue_recognition_events (
    organization_id, schedule_id, booking_id,
    recognition_date, lessons_recognized, amount_net,
    journal_entry_id, created_by
  ) VALUES (
    v_org_id, v_schedule.id, p_booking_id,
    v_recog_date, 1, v_schedule.per_lesson_amount_net,
    v_entry_id, p_actor_id
  );

  -- 8. Update schedule
  UPDATE deferred_revenue_schedules
  SET
    recognized_lessons    = recognized_lessons    + 1,
    recognized_amount_net = recognized_amount_net + v_schedule.per_lesson_amount_net,
    is_fully_recognized   = (recognized_lessons + 1 >= total_lessons)
  WHERE id = v_schedule.id;

  RETURN v_entry_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_accounts_receivable(p_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period          financial_periods%ROWTYPE;
  v_ledger_balance  numeric(14,2) := 0;
  v_invoice_total   numeric(14,2) := 0;
  v_variance        numeric(14,2);
  v_is_reconciled   boolean;
  v_run_id          uuid;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_period.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'RECONCILIATION_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Get account 1510 (Kundfordringar) closing balance
  SELECT COALESCE(closing_balance, 0) INTO v_ledger_balance
  FROM account_balances
  WHERE financial_period_id = p_period_id
    AND account_code = '1510'
  LIMIT 1;

  -- Sum of outstanding invoice amounts (non-draft, non-void) up to period end
  SELECT COALESCE(SUM(outstanding_amount), 0) INTO v_invoice_total
  FROM invoices
  WHERE organization_id = v_period.organization_id
    AND status NOT IN ('draft', 'void')
    AND issued_at::date <= v_period.period_end;

  v_variance      := v_ledger_balance - v_invoice_total;
  v_is_reconciled := ABS(v_variance) < 0.01;

  INSERT INTO reconciliation_runs (
    organization_id, financial_period_id, reconciliation_type, status,
    total_items, matched_items, unmatched_items, exception_items,
    is_reconciled, variance_amount, completed_at, actor_id,
    result_summary
  ) VALUES (
    v_period.organization_id, p_period_id, 'accounts_receivable',
    CASE WHEN v_is_reconciled THEN 'completed' ELSE 'needs_review' END,
    1, CASE WHEN v_is_reconciled THEN 1 ELSE 0 END,
    CASE WHEN v_is_reconciled THEN 0 ELSE 1 END, 0,
    v_is_reconciled, v_variance, now(), p_actor_id,
    jsonb_build_object(
      'ledger_account',    '1510',
      'ledger_balance',    v_ledger_balance,
      'invoice_outstanding', v_invoice_total,
      'variance',          v_variance,
      'is_reconciled',     v_is_reconciled,
      'period_end',        v_period.period_end
    )
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_deferred_revenue(p_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period          financial_periods%ROWTYPE;
  v_ledger_balance  numeric(14,2) := 0;
  v_schedule_total  numeric(14,2) := 0;
  v_variance        numeric(14,2);
  v_is_reconciled   boolean;
  v_run_id          uuid;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_period.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'RECONCILIATION_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Account 2970 (Förutbetalda intäkter) — credit-normal (liability), closing_balance is negative
  SELECT COALESCE(ABS(closing_balance), 0) INTO v_ledger_balance
  FROM account_balances
  WHERE financial_period_id = p_period_id
    AND account_code = '2970'
  LIMIT 1;

  -- Sum of unrecognized deferred revenue across all active schedules
  SELECT COALESCE(SUM(total_deferred_net - recognized_amount_net), 0) INTO v_schedule_total
  FROM deferred_revenue_schedules
  WHERE organization_id = v_period.organization_id
    AND is_fully_recognized = false;

  v_variance      := v_ledger_balance - v_schedule_total;
  v_is_reconciled := ABS(v_variance) < 0.01;

  INSERT INTO reconciliation_runs (
    organization_id, financial_period_id, reconciliation_type, status,
    total_items, matched_items, unmatched_items, exception_items,
    is_reconciled, variance_amount, completed_at, actor_id,
    result_summary
  ) VALUES (
    v_period.organization_id, p_period_id, 'deferred_revenue',
    CASE WHEN v_is_reconciled THEN 'completed' ELSE 'needs_review' END,
    1, CASE WHEN v_is_reconciled THEN 1 ELSE 0 END,
    CASE WHEN v_is_reconciled THEN 0 ELSE 1 END, 0,
    v_is_reconciled, v_variance, now(), p_actor_id,
    jsonb_build_object(
      'ledger_account',         '2970',
      'ledger_deferred_balance', v_ledger_balance,
      'schedule_unrecognized',   v_schedule_total,
      'variance',                v_variance,
      'is_reconciled',           v_is_reconciled
    )
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

-- ============================================================================
-- C. FINANCIAL PERIOD / FISCAL YEAR CLOSE & REOPEN, BANK STATEMENT IMPORT
--    AND RECONCILIATION CONFIRMATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.close_fiscal_year(p_fiscal_year_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF NOT public.is_trusted_service_context()
     AND v_fy.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % not found', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FISCAL_YEAR_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
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
$function$;

CREATE OR REPLACE FUNCTION public.confirm_bank_reconciliation(p_import_id uuid, p_period_id uuid, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_import        bank_statement_imports%ROWTYPE;
  v_run_id        uuid;
  v_total         int;
  v_matched       int;
  v_unmatched     int;
  v_exceptions    int;
  v_ignored       int;
  v_line          bank_statement_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_import FROM bank_statement_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_RECON_NOT_FOUND: bank_statement_import % not found', p_import_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_import.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'BANK_RECON_NOT_FOUND: bank_statement_import % not found', p_import_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'BANK_RECON_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_import.status = 'confirmed' THEN
    RAISE EXCEPTION 'BANK_RECON_ALREADY_CONFIRMED: import % is already confirmed', p_import_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Count statuses
  SELECT
    COUNT(*)                                             INTO v_total
  FROM bank_statement_lines WHERE import_id = p_import_id;

  SELECT COUNT(*) INTO v_matched
  FROM bank_statement_lines WHERE import_id = p_import_id AND status IN ('matched','confirmed');

  SELECT COUNT(*) INTO v_unmatched
  FROM bank_statement_lines WHERE import_id = p_import_id AND status = 'unmatched';

  SELECT COUNT(*) INTO v_exceptions
  FROM bank_statement_lines WHERE import_id = p_import_id AND status = 'exception';

  SELECT COUNT(*) INTO v_ignored
  FROM bank_statement_lines WHERE import_id = p_import_id AND status = 'ignored';

  -- Create reconciliation run
  INSERT INTO reconciliation_runs (
    organization_id, financial_period_id, reconciliation_type, status,
    bank_statement_import_id, total_items, matched_items, unmatched_items,
    exception_items, is_reconciled, variance_amount, completed_at, actor_id, notes,
    result_summary
  ) VALUES (
    v_import.organization_id, p_period_id, 'bank', 'confirmed',
    p_import_id, v_total, v_matched, v_unmatched,
    v_exceptions,
    (v_unmatched = 0 AND v_exceptions = 0),
    NULL, now(), p_actor_id, p_notes,
    jsonb_build_object(
      'total_lines',     v_total,
      'matched_lines',   v_matched,
      'unmatched_lines', v_unmatched,
      'exception_lines', v_exceptions,
      'ignored_lines',   v_ignored,
      'is_complete',     (v_unmatched = 0 AND v_exceptions = 0)
    )
  ) RETURNING id INTO v_run_id;

  -- Create reconciliation_items for each matched line
  FOR v_line IN
    SELECT * FROM bank_statement_lines
    WHERE import_id = p_import_id AND status IN ('matched','confirmed') AND payment_id IS NOT NULL
  LOOP
    INSERT INTO reconciliation_items (
      organization_id, run_id,
      ledger_entity_type, ledger_entity_id,
      external_entity_type, external_entity_id,
      external_reference,
      ledger_amount, external_amount, variance,
      status, match_method, matched_at, matched_by, notes
    )
    SELECT
      v_import.organization_id,
      v_run_id,
      'payment',
      v_line.payment_id,
      'bank_statement_line',
      v_line.id,
      v_line.reference,
      p.amount,
      v_line.amount,
      p.amount - v_line.amount,
      CASE WHEN ABS(p.amount - v_line.amount) < 0.01 THEN 'matched' ELSE 'exception' END,
      v_line.match_method,
      v_line.matched_at,
      v_line.matched_by,
      v_line.match_notes
    FROM payments p
    WHERE p.id = v_line.payment_id;

    -- Confirm the line
    UPDATE bank_statement_lines
    SET status = 'confirmed', updated_at = now()
    WHERE id = v_line.id;
  END LOOP;

  -- Finalize import
  UPDATE bank_statement_imports
  SET status       = 'confirmed',
      confirmed_at = now(),
      confirmed_by = p_actor_id,
      updated_at   = now()
  WHERE id = p_import_id;

  RETURN v_run_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hard_close_period(p_period_id uuid, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period      financial_periods%ROWTYPE;
  v_validation  jsonb;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_period.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PERIOD_CLOSE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'PERIOD_ALREADY_LOCKED: period % is already hard-closed', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_period.status <> 'closed' THEN
    RAISE EXCEPTION 'PERIOD_NOT_SOFT_CLOSED: period % has status %; must be soft-closed first',
      p_period_id, v_period.status
      USING ERRCODE = 'P0001';
  END IF;

  v_validation := public.validate_period_for_close(p_period_id, p_actor_id);
  IF NOT (v_validation->>'all_passed')::boolean THEN
    RAISE EXCEPTION 'PERIOD_HARD_CLOSE_BLOCKED: all validation checks must pass for hard-close of period %: %',
      p_period_id, v_validation->'checks'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.capture_period_audit_snapshot(p_period_id, 'hard_close', p_notes, p_actor_id);

  UPDATE financial_periods
  SET status     = 'locked',
      locked_at  = now(),
      locked_by  = p_actor_id,
      notes      = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_period_id;

  PERFORM public.insert_outbox_event(
    'Period.HardClosed',
    'accounting'::public.event_channel,
    jsonb_build_object('period_id', p_period_id, 'locked_by', p_actor_id),
    v_period.organization_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.import_bank_statement(p_org_id uuid, p_bank_account_number text, p_bank_name text, p_statement_date date, p_period_start date, p_period_end date, p_opening_balance numeric, p_closing_balance numeric, p_currency text, p_lines jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_import_id  uuid;
  v_line       jsonb;
  v_line_num   int := 1;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'BANK_IMPORT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF p_bank_account_number IS NULL OR p_bank_account_number = '' THEN
    RAISE EXCEPTION 'BANK_RECON_INVALID: bank_account_number is required' USING ERRCODE = 'P0001';
  END IF;
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'BANK_RECON_INVALID_DATES: period_end must be >= period_start' USING ERRCODE = 'P0001';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'BANK_RECON_NO_LINES: at least one bank statement line is required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO bank_statement_imports (
    organization_id, bank_account_number, bank_name, statement_date,
    period_start, period_end, opening_balance, closing_balance, currency,
    total_lines, imported_by
  ) VALUES (
    p_org_id, p_bank_account_number, p_bank_name, p_statement_date,
    p_period_start, p_period_end,
    COALESCE(p_opening_balance, 0), COALESCE(p_closing_balance, 0),
    COALESCE(p_currency, 'SEK'),
    jsonb_array_length(p_lines), p_actor_id
  ) RETURNING id INTO v_import_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF (v_line->>'transaction_date') IS NULL THEN
      RAISE EXCEPTION 'BANK_RECON_INVALID_LINE: line % missing transaction_date', v_line_num
        USING ERRCODE = 'P0001';
    END IF;
    IF (v_line->>'amount') IS NULL THEN
      RAISE EXCEPTION 'BANK_RECON_INVALID_LINE: line % missing amount', v_line_num
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO bank_statement_lines (
      organization_id, import_id, line_number,
      transaction_date, value_date, amount, balance_after,
      reference, description, counterpart_name, counterpart_account
    ) VALUES (
      p_org_id, v_import_id, v_line_num,
      (v_line->>'transaction_date')::date,
      NULLIF(v_line->>'value_date',       '')::date,
      (v_line->>'amount')::numeric,
      NULLIF(v_line->>'balance_after',    '')::numeric,
      v_line->>'reference',
      COALESCE(v_line->>'description', ''),
      v_line->>'counterpart_name',
      v_line->>'counterpart_account'
    );
    v_line_num := v_line_num + 1;
  END LOOP;

  RETURN v_import_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_period_safe(p_org_id uuid, p_period_id uuid, p_reason text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period            record;
  v_blocking_deps     jsonb := '[]'::jsonb;
  v_blocking_count    int   := 0;
  v_downstream        jsonb := '[]'::jsonb;
  v_rec               record;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PERIOD_REOPEN_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_period
  FROM public.financial_periods
  WHERE id = p_period_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % does not exist', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Cannot reopen a locked (hard-closed) period — ever
  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: period % is hard-locked and cannot be reopened. '
      'Hard-closed periods are permanent and immutable.',
      p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Already open — idempotent return
  IF v_period.status = 'open' THEN
    RETURN jsonb_build_object(
      'status',               'already_open',
      'period_id',            p_period_id,
      'downstream_dependents', '[]'::jsonb,
      'reopened_at',          NULL
    );
  END IF;

  -- Find downstream periods that depend on THIS period being closed
  FOR v_rec IN
    SELECT
      fdg.dependent_period_id,
      fp.period_start,
      fp.period_end,
      fp.status,
      fdg.dependency_type
    FROM public.fiscal_dependency_graph fdg
    JOIN public.financial_periods fp
      ON fp.id = fdg.dependent_period_id
    WHERE fdg.required_period_id = p_period_id
      AND fdg.is_active          = true
      AND fp.status IN ('closed', 'locked')
    ORDER BY fp.period_start ASC
  LOOP
    v_downstream := v_downstream || jsonb_build_array(jsonb_build_object(
      'period_id',       v_rec.dependent_period_id,
      'period_start',    v_rec.period_start,
      'period_end',      v_rec.period_end,
      'status',          v_rec.status,
      'dependency_type', v_rec.dependency_type
    ));
    v_blocking_count := v_blocking_count + 1;

    IF v_rec.status = 'locked' THEN
      v_blocking_deps := v_blocking_deps || jsonb_build_array(jsonb_build_object(
        'period_id', v_rec.dependent_period_id,
        'status',    v_rec.status,
        'reason',    'Downstream hard-locked period depends on this period being closed'
      ));
    END IF;
  END LOOP;

  -- Block if any downstream period is hard-locked
  IF jsonb_array_length(v_blocking_deps) > 0 THEN
    RAISE EXCEPTION
      'REOPEN_BLOCKED: period % cannot be reopened. % downstream period(s) depend on it '
      'being closed, including hard-locked periods: %',
      p_period_id, v_blocking_count, v_blocking_deps
      USING ERRCODE = 'P0001';
  END IF;

  -- Perform the reopen: 'closed' → 'open'
  UPDATE public.financial_periods SET
    status    = 'open',
    closed_at = NULL,
    closed_by = NULL,
    notes     = COALESCE(
      notes || E'\nReopened: ' || COALESCE(p_reason, 'no reason given'),
      'Reopened: ' || COALESCE(p_reason, 'no reason given')
    )
  WHERE id              = p_period_id
    AND organization_id = p_org_id
    AND status          = 'closed';

  -- Emit outbox event
  PERFORM public.insert_outbox_event(
    p_event_type       := 'Period.Reopened',
    p_channel          := 'accounting',
    p_organization_id  := p_org_id,
    p_payload          := jsonb_build_object(
      'period_id',  p_period_id,
      'reason',     p_reason,
      'actor_id',   p_actor_id,
      'reopened_at', now()
    )
  );

  RETURN jsonb_build_object(
    'status',                'reopened',
    'period_id',             p_period_id,
    'downstream_dependents', v_downstream,
    'downstream_count',      v_blocking_count,
    'reason',                p_reason,
    'reopened_at',           now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_soft_closed_period(p_period_id uuid, p_reason text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period financial_periods%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_period.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PERIOD_REOPEN_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'PERIOD_HARD_CLOSED: period % is hard-closed (locked). '
      'Hard-closed periods cannot be reopened. Use amendment journals for corrections.',
      p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_period.status <> 'closed' THEN
    RAISE EXCEPTION 'PERIOD_NOT_CLOSED: period % has status %; must be soft-closed to reopen',
      p_period_id, v_period.status
      USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'PERIOD_REOPEN_REASON_REQUIRED: a reason is required to reopen a soft-closed period'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE financial_periods
  SET status     = 'open',
      closed_at  = NULL,
      closed_by  = NULL,
      notes      = COALESCE(notes, '') || ' [Reopened: ' || p_reason || ']',
      updated_at = now()
  WHERE id = p_period_id;

  PERFORM public.insert_outbox_event(
    'Period.Reopened',
    'accounting'::public.event_channel,
    jsonb_build_object('period_id', p_period_id, 'reason', p_reason, 'actor_id', p_actor_id),
    v_period.organization_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_close_period(p_period_id uuid, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period      financial_periods%ROWTYPE;
  v_validation  jsonb;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_period.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PERIOD_CLOSE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_period.status <> 'open' THEN
    RAISE EXCEPTION 'PERIOD_NOT_OPEN: period % has status %; must be open to soft-close',
      p_period_id, v_period.status
      USING ERRCODE = 'P0001';
  END IF;

  v_validation := public.validate_period_for_close(p_period_id, p_actor_id);
  IF NOT (v_validation->>'critical_passed')::boolean THEN
    RAISE EXCEPTION 'PERIOD_CLOSE_BLOCKED: critical validation checks failed for period %: %',
      p_period_id, v_validation->'checks'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.capture_period_audit_snapshot(p_period_id, 'soft_close', p_notes, p_actor_id);

  UPDATE financial_periods
  SET status     = 'closed',
      closed_at  = now(),
      closed_by  = p_actor_id,
      notes      = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_period_id;

  PERFORM public.insert_outbox_event(
    'Period.SoftClosed',
    'accounting'::public.event_channel,
    jsonb_build_object('period_id', p_period_id, 'closed_by', p_actor_id),
    v_period.organization_id
  );
END;
$function$;

-- ============================================================================
-- D. GRANT RESTRICTIONS — every REVOKE explicitly includes PUBLIC, anon, and
--    authenticated together (Wave 2A lesson). All 30 functions above have
--    real `authenticated`-role callers (ledger/index.ts, enrollments,
--    finance UI via PostgREST), so authenticated is kept (grant model B —
--    internal auth check, not service_role-only) alongside service_role.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.allocate_payment(uuid, uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_payment(uuid, uuid, uuid, numeric, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.issue_invoice(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_invoice_from_order(uuid, uuid, uuid, text, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_order(uuid, uuid, uuid, text, date, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.process_refund(uuid, uuid, refund_type, refund_reason_code, numeric, integer, lesson_category, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund(uuid, uuid, refund_type, refund_reason_code, numeric, integer, lesson_category, uuid, uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_payment(uuid, numeric, payment_method, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, payment_method, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_order_status(uuid, uuid, text, uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, uuid, text, uuid, text, numeric, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.void_invoice(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.bulk_recognize_revenue(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_recognize_revenue(uuid, date, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_accrual_release(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_accrual_release(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_amendment_journal(uuid, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_amendment_journal(uuid, jsonb, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_asset_disposal(uuid, uuid, asset_disposal_type, date, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_asset_disposal(uuid, uuid, asset_disposal_type, date, numeric, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_deferred_revenue_entry(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_deferred_revenue_entry(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_depreciation_period(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_depreciation_period(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_payroll_journal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_payroll_journal(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_periodic_deferred_release(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_periodic_deferred_release(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_salary_payment(uuid, date, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_salary_payment(uuid, date, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_tax_clearing_journal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_tax_clearing_journal(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_tax_payment_journal(uuid, date, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_tax_payment_journal(uuid, date, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_vat_clearing_journal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_vat_clearing_journal(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.post_vat_payment_journal(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_vat_payment_journal(uuid, date, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.recognize_lesson_revenue(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recognize_lesson_revenue(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reconcile_accounts_receivable(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_accounts_receivable(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reconcile_deferred_revenue(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_deferred_revenue(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.close_fiscal_year(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_fiscal_year(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.confirm_bank_reconciliation(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_bank_reconciliation(uuid, uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.hard_close_period(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hard_close_period(uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.import_bank_statement(uuid, text, text, date, date, date, numeric, numeric, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_bank_statement(uuid, text, text, date, date, date, numeric, numeric, text, jsonb, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reopen_period_safe(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_period_safe(uuid, uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reopen_soft_closed_period(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_soft_closed_period(uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.soft_close_period(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_close_period(uuid, text, uuid) TO authenticated, service_role;
