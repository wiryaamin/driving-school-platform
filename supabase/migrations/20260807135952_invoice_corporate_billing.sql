-- ════════════════════════════════════════════════════════════════════════════
-- Corporate invoice billing party
--
-- corporate_customers (20260613000100) and the student→company link
-- (20260702000008, students.corporate_customer_id) have been fully wired
-- for a while: staff can link a student to a company, and a company's own
-- detail page lists its linked students. But invoices.student_id is the
-- only party ever recorded on an invoice — nothing about who's actually
-- responsible for payment. A linked student's lessons still invoice the
-- individual, defeating the entire purpose of "Företagskunder": a company
-- that sponsors an employee's training has no way to actually get billed.
--
-- Fix: an additive, nullable corporate_customer_id on invoices — WHO PAYS,
-- distinct from student_id (WHO THE LESSON WAS FOR, which stays required —
-- Swedish invoicing still needs a real underlying service recipient).
-- Defaulted from the student's current company link at invoice-creation
-- time (both creation paths: create_invoice_from_order() below, and the
-- direct-insert POST /invoices handler in invoices/index.ts) — staff can
-- still override or clear it, same as any other invoice field.
--
-- create_invoice_from_order() below is otherwise an EXACT copy of the
-- version in 20260701000003_cl2_create_invoice_from_order.sql — every step,
-- comment, and the VAT/line-type mapping logic is unchanged. Only two
-- additions: a v_corporate_id lookup, and that value added to the Step 5
-- INSERT's column/value lists. This is deliberately a byte-for-byte replay
-- of the existing function rather than a rewrite, to avoid the exact risk
-- CLAUDE.md warns about for this codebase's finance layer — introducing an
-- error into invoice issuance (VAT freezing, gap-free numbering, the
-- Invoice.Issued → BAS/ledger/SIE4 chain) while trying to add one column.
--
-- Deliberately NOT touched in this pass: automatic discount application
-- from corporate_contracts.discount_pct. Exact discount amount interacting
-- with VAT is a genuine pricing/legal-correctness question, not a safe
-- default to compute silently — staff apply it manually via invoice line
-- items, same as today. Also not touched: invoice PDF/display layout,
-- dunning routing to a corporate contact instead of the student.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS corporate_customer_id uuid
    REFERENCES public.corporate_customers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.invoices.corporate_customer_id IS
  'Who is billed for this invoice, when different from the student it is '
  'for (student_id). NULL = the student themselves pays, same as before '
  'this column existed. Defaulted from students.corporate_customer_id at '
  'creation time in both invoice-creation paths; staff may override.';

CREATE INDEX IF NOT EXISTS idx_invoices_corporate_customer_id
  ON public.invoices(corporate_customer_id)
  WHERE corporate_customer_id IS NOT NULL;

-- ── create_invoice_from_order(): exact copy of 20260701000003's version, ─────
-- plus the corporate_customer_id lookup and column (marked "-- NEW" below).

CREATE OR REPLACE FUNCTION public.create_invoice_from_order(
  p_order_id      uuid,
  p_enrollment_id uuid    DEFAULT NULL,
  p_actor_id      uuid    DEFAULT NULL,
  p_actor_email   text    DEFAULT NULL,
  p_due_date      date    DEFAULT NULL,
  p_notes         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- invoices.student_id is NOT NULL — must catch null before the INSERT or
  -- the constraint violation will surface as an uncaught PG error.
  IF v_order.student_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_STUDENT: order % has no student reference. The student may have been deleted after order creation.',
      p_order_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Step 4: Validate at least one line item exists ────────────────────────
  -- issue_invoice() raises INVOICE_NO_LINES on empty invoices. Fail early with
  -- a more specific message tied to the order.
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE order_id = p_order_id LIMIT 1
  ) THEN
    RAISE EXCEPTION 'ORDER_NO_ITEMS: order % has no line items to invoice',
      p_order_id
      USING ERRCODE = 'P0001';
  END IF;

  -- NEW: reuse the student's real, already-linked company — never asked
  -- about again, never guessed. NULL if the student has no company link.
  SELECT corporate_customer_id INTO v_corporate_id
  FROM   public.students
  WHERE  id = v_order.student_id;

  -- ── Step 5: Insert draft invoice ─────────────────────────────────────────
  -- subtotal_amount, vat_amount, total_amount, outstanding_amount are NOT set here.
  -- issue_invoice() (Step 7) recomputes and freezes them from line items.
  -- student_package_id is intentionally NULL — System A field, not used for
  -- enrollment-path invoices.
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
  -- VAT rate: sourced exclusively from orders.vat_rate (pricing snapshot at
  -- enrollment time). Never read from vat_rates table or package_offerings.
  --
  -- Quantity: always positive (order_items CHECK quantity > 0).
  -- Discounts express negativity via negative unit_price, never negative quantity.
  --
  -- vat_amount and line_total are left at DEFAULT 0; issue_invoice() will freeze
  -- them with: vat_amount = quantity * unit_price * vat_rate
  --            line_total = quantity * unit_price
  FOR v_item IN
    SELECT *
    FROM   public.order_items
    WHERE  order_id = p_order_id
    ORDER  BY sort_order ASC, created_at ASC
  LOOP
    -- Map order_items.item_type → invoice_line_type enum
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
  -- issue_invoice() (Phase 4A) atomically:
  --   • locks the invoice FOR UPDATE (same txn, no contention)
  --   • freezes vat_amount and line_total on every line item
  --   • generates the gap-free invoice number via invoice_number_sequences
  --   • sets status='issued', issued_at, issued_by, all amount columns
  --   • publishes Invoice.Issued to event_outbox (triggers BAS/ledger/SIE4/VAT)
  SELECT public.issue_invoice(v_invoice_id, p_actor_id)
  INTO   v_invoice_number;

  -- Read frozen totals for the return value
  SELECT total_amount, currency
  INTO   v_total_amount, v_currency
  FROM   public.invoices
  WHERE  id = v_invoice_id;

  -- ── Step 8: Link invoice to order ─────────────────────────────────────────
  -- Uses the order lock already held from Step 1 — no new lock acquisition.
  UPDATE public.orders
  SET
    invoice_id = v_invoice_id,
    updated_at = now(),
    updated_by = p_actor_id
  WHERE id = p_order_id;

  -- ── Step 9: Advance order status to pending_payment ───────────────────────
  -- update_order_status() validates the transition, stamps confirmed_at, and
  -- publishes a 'payment_initiated' event to order_events.
  -- The FOR UPDATE in update_order_status() is a no-op here (same txn, same lock).
  -- Order is currently 'draft' — the transition is valid.
  PERFORM public.update_order_status(
    p_order_id,
    v_order.organization_id,
    'pending_payment',
    p_actor_id,
    p_actor_email
  );

  -- ── Step 10: Emit enrollment audit event (conditional) ────────────────────
  -- Only emitted when this call originates from an enrollment conversion.
  -- Non-enrollment-path orders (future use) pass p_enrollment_id = NULL.
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
$$;

COMMENT ON FUNCTION public.create_invoice_from_order IS
  'Creates a draft invoice from a paid/pending order, copying order_items '
  'to invoice_line_items, then issues it. Idempotent via orders.invoice_id. '
  'corporate_customer_id is defaulted from the order student''s current '
  'company link (students.corporate_customer_id) — staff can still change '
  'the billing party on the invoice afterward.';

REVOKE ALL    ON FUNCTION public.create_invoice_from_order(uuid, uuid, uuid, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_order(uuid, uuid, uuid, text, date, text) TO authenticated, service_role;
