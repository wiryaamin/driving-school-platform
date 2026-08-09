-- =============================================================================
-- MIGRATION: 20260721000001_fix_refund_credit_direction.sql
-- Description:
--   Sprint 4I operational validation (Pilot Validation Tenant, refund
--   workflow) found that process_refund() always inserted a POSITIVE
--   quantity credit_ledger 'reverse' entry whenever credit_qty > 0,
--   regardless of refund_type. That is correct only for refund_type =
--   'credit_only' (no money moves — a pure credit restoration, e.g. waiving
--   a mistaken consumption). For 'full'/'partial' refunds — the standard
--   "student cancels, gets cash back for unused lessons" case — the
--   student is being paid back for credits they will no longer use, so
--   those credits must be REMOVED from their balance. Storing a positive
--   quantity there caused a double-dip: the student received both the cash
--   refund AND additional usable lesson credits. Reproduced live via a
--   partial refund (2250 SEK / 3 credits) on the Pilot Validation Tenant's
--   real student, which raised her credit_ledger balance 20 -> 23 instead
--   of lowering it to 17.
--
--   Fix: sign the credit_ledger quantity off refund_type, which the
--   function already receives — no new inputs, no schema change.
--
--   Also corrects the one bad ledger entry this reproduction created
--   (append-only table — corrected via a compensating 'adjust' entry, not
--   a mutation) so the Pilot Validation Tenant's live data reflects the
--   right balance going forward.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.process_refund(
  p_org_id          uuid,
  p_invoice_id      uuid,
  p_refund_type     public.refund_type,
  p_reason_code     public.refund_reason_code,
  p_refund_amount   numeric(12,2)          DEFAULT 0,
  p_credit_qty      int                    DEFAULT 0,
  p_credit_category public.lesson_category DEFAULT NULL,
  p_grant_entry_id  uuid                   DEFAULT NULL,
  p_payment_id      uuid                   DEFAULT NULL,
  p_notes           text                   DEFAULT NULL,
  p_actor_id        uuid                   DEFAULT NULL
)
RETURNS uuid  -- refund_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- 7. Process credit reversal (entry_type='reverse'). Sign depends on
  -- refund_type: 'credit_only' means no money moved — a pure restoration of
  -- previously-consumed credit, so it's positive. Every other refund_type
  -- that touches credits ('full'/'partial') pays the student back in cash
  -- for lessons they will no longer take, so those credits must come OFF
  -- the balance — negative.
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

    -- Link ledger entry to refund record
    UPDATE refunds
    SET credit_ledger_id = v_ledger_id
    WHERE id = v_refund_id;
  END IF;

  -- 8. Process monetary refund
  IF p_refund_amount > 0 THEN
    -- Determine new payment status
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

    -- Update invoice amounts and status
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
$$;

COMMENT ON FUNCTION public.process_refund IS
  'Atomic refund processing. Creates a refund record, reverses credit grants if requested, '
  'updates payment/invoice amounts, and emits Refund.Processed. Entire operation is one '
  'transaction — any failure causes complete rollback with no partial state. Credit reversal '
  'sign depends on refund_type: negative (credits removed) for full/partial cash refunds, '
  'positive (credits restored) only for credit_only.';

-- =============================================================================
-- Data correction: the one refund processed during reproduction on the Pilot
-- Validation Tenant (Sara Svensson, invoice 2026-00001) recorded +3 driving
-- credits instead of -3. credit_ledger is append-only, so this corrects it
-- with a compensating 'adjust' entry rather than mutating the bad row —
-- -6 nets the wrong +3 down to the correct -3 (20 -> 17 total credits).
-- =============================================================================

INSERT INTO credit_ledger (
  organization_id, student_id, lesson_category,
  entry_type, quantity, currency,
  reference_type, reference_id,
  description, actor_id
)
SELECT
  cl.organization_id, cl.student_id, cl.lesson_category,
  'adjust', -6, cl.currency,
  'refund', cl.reference_id,
  'Correction: refund 64db096e-8df5-4c05-bb17-b0a578a28282 recorded +3 credits instead of -3 '
    || '(pre-fix process_refund sign bug, 20260721000001)',
  cl.actor_id
FROM credit_ledger cl
WHERE cl.id = 'b01c901d-b6ee-4844-bfa4-ca2882988c45'
  AND cl.entry_type = 'reverse'
  AND cl.quantity = 3
  AND NOT EXISTS (
    SELECT 1 FROM credit_ledger x
    WHERE x.reference_type = 'refund'
      AND x.reference_id   = cl.reference_id
      AND x.entry_type     = 'adjust'
      AND x.quantity        = -6
  );
