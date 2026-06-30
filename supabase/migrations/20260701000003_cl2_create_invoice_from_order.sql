-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701000003_cl2_create_invoice_from_order.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Sprint:    CL-2 — Commercial Lifecycle Backend Functions
--
-- DELIVERABLES:
--   D2.1  void_invoice() extension
--         Clears orders.invoice_id when an order-linked invoice is voided,
--         restoring the order's ability to be re-invoiced after a corrective void.
--         The conditional AND invoice_id = p_invoice_id guard ensures the clear
--         only fires when the order still references the invoice being voided —
--         not when the order has already been re-linked to a newer invoice.
--
--   D2.2  create_invoice_from_order()
--         New SECURITY DEFINER function. Atomically:
--           1.  Locks the order row (FOR UPDATE) — prevents concurrent duplicates
--           2.  Idempotency check — returns existing issued invoice if already linked
--           3.  Validates student_id IS NOT NULL
--           4.  Validates at least one order_items row exists
--           5.  Inserts draft invoices row (order_id + assignment_id populated)
--           6.  Inserts invoice_line_items from order_items with vat_rate from
--               orders.vat_rate ONLY (pricing snapshot integrity)
--           7.  Calls issue_invoice() — freezes VAT, generates gap-free number,
--               sets status='issued', publishes Invoice.Issued to event_outbox
--           8.  Links orders.invoice_id = new invoice
--           9.  Advances order status to 'pending_payment' via update_order_status()
--           10. Emits 'invoice_created' enrollment event (when enrollment_id provided)
--           11. Returns jsonb result
--
-- DEPENDENCIES (must be applied before this migration):
--   20260530000001_phase4a_commercial_core.sql  — invoices, issue_invoice(), void_invoice()
--   20260630000003_order_management.sql         — orders, order_items, update_order_status()
--   20260630000002_repair_enrollment_sprint2.sql — emit_enrollment_event()
--   20260701000002_cl1_commercial_lifecycle_schema.sql
--     — invoices.order_id, invoices.assignment_id, orders.invoice_id,
--       invoices_order_id_unique, 'invoice_created' constraint
--
-- BACKWARD COMPATIBILITY:
--   void_invoice() signature and return type are unchanged.
--   All existing callers (System A, manual invoices) continue to work unmodified.
--   For invoices with order_id IS NULL, the new extension block is a no-op.
-- ════════════════════════════════════════════════════════════════════════════


-- ── D2.1: void_invoice() extension ───────────────────────────────────────────
-- Replaces the Phase 4A void_invoice() in place. Identical signature and return
-- type. Adds one conditional UPDATE to clear orders.invoice_id after voiding
-- an order-linked invoice, enabling re-invoicing after a corrective void.

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id uuid,
  p_actor_id   uuid,
  p_reason     text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_void_at timestamptz;
BEGIN
  SELECT * INTO v_invoice
  FROM   public.invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.status NOT IN ('draft', 'issued') THEN
    RAISE EXCEPTION 'CANNOT_VOID: invoice % has status %; only draft/issued invoices can be voided',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  v_void_at := now();

  UPDATE public.invoices
  SET
    status      = 'void',
    void_at     = v_void_at,
    void_by     = p_actor_id,
    void_reason = p_reason,
    updated_at  = now()
  WHERE id = p_invoice_id;

  -- D2.1 extension: clear orders.invoice_id so the order can be re-invoiced.
  -- Conditional: only clears when the order still references THIS invoice.
  -- If a newer invoice has already been linked (concurrent re-invoice), the
  -- AND guard produces 0 rows affected — the new link is preserved.
  IF v_invoice.order_id IS NOT NULL THEN
    UPDATE public.orders
    SET
      invoice_id = NULL,
      updated_at = now()
    WHERE id         = v_invoice.order_id
      AND invoice_id = p_invoice_id;
  END IF;

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
$$;

REVOKE ALL    ON FUNCTION public.void_invoice(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, uuid, text) TO authenticated, service_role;


-- ── D2.2: create_invoice_from_order() ────────────────────────────────────────
-- Atomically creates and issues an invoice from a commercial order.
-- Designed for the enrollment conversion path (CL-3) but accepts any valid order.
-- All steps are within a single implicit transaction — any exception rolls back
-- the invoice, line items, order link, status advance, and enrollment event.

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

  -- ── Step 5: Insert draft invoice ─────────────────────────────────────────
  -- subtotal_amount, vat_amount, total_amount, outstanding_amount are NOT set here.
  -- issue_invoice() (Step 7) recomputes and freezes them from line items.
  -- student_package_id is intentionally NULL — System A field, not used for
  -- enrollment-path invoices.
  INSERT INTO public.invoices (
    organization_id,
    student_id,
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

REVOKE ALL    ON FUNCTION public.create_invoice_from_order(uuid, uuid, uuid, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_from_order(uuid, uuid, uuid, text, date, text) TO authenticated, service_role;
