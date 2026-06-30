-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701000005_fix_void_reinvoice_lifecycle.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Sprint:    ST-7 — Commercial Lifecycle Reinvoice Repair
--
-- ROOT CAUSE (ST-7 FAILURE):
--   The enrollment reinvoice flow (void existing invoice → create replacement)
--   failed at the create-replacement step with two independent defects:
--
--   DEFECT-1: void_invoice() (CL-2, 20260701000003) clears orders.invoice_id
--   to NULL but does NOT reset orders.status from 'pending_payment' to 'draft'.
--   create_invoice_from_order() raises INCONSISTENT_STATE when it finds
--   orders.status = 'pending_payment' AND orders.invoice_id IS NULL, because
--   that combination implies a prior run advanced the order but failed to link
--   an invoice — an unresolvable state under the original design.
--   After a void, however, that combination is intentional and safe: the void
--   cleared the invoice link, and the order should accept a replacement.
--   Fix: reset orders.status to 'draft' alongside the invoice_id clear.
--
--   DEFECT-2: invoices_order_id_unique (CL-1, 20260701000002) is a partial
--   unique index on invoices(order_id) WHERE order_id IS NOT NULL.
--   When an order-linked invoice is voided, the void invoice retains its
--   order_id (immutable finance record). The partial index covers void invoices,
--   so inserting a replacement invoice for the same order_id raises a unique
--   constraint violation before the row is even written.
--   Fix: recreate the index excluding void invoices from the uniqueness scope.
--
-- COMPATIBILITY AMENDMENT:
--   Fix A emits a new order timeline event 'invoice_voided_order_reset' via
--   emit_order_event(). The chk_order_event_type CHECK constraint on order_events
--   (20260630000003) did not include this value — any emit call would fail with
--   a constraint violation and roll back the entire void transaction, leaving
--   the invoice un-voided. The constraint must be extended before void_invoice()
--   is replaced.
--
-- DEPLOYMENT ORDER (single atomic migration):
--   1. Fix B  — Replace invoices_order_id_unique (unblocks INSERT of replacement)
--   2. Compat — Extend chk_order_event_type       (enables new event type)
--   3. Fix A  — Replace void_invoice()             (status reset + event emit)
--
-- PRESERVATION GUARANTEES:
--   - All existing event types in chk_order_event_type are preserved unchanged.
--   - void_invoice() signature (uuid, uuid, text) and return type (timestamptz)
--     are unchanged. All existing callers continue to work unmodified.
--   - For invoices with order_id IS NULL, the D2.1 block remains a no-op.
--   - create_invoice_from_order() behavior, INCONSISTENT_STATE guard,
--     invoice numbering sequence, enrollment event integrity, and financial
--     posting integrity are all unmodified.
--   - No Edge Functions, RLS policies, reporting views, or finance exports
--     are modified by this migration.
-- ════════════════════════════════════════════════════════════════════════════


-- ── Fix B: Replace invoices_order_id_unique ───────────────────────────────────
-- DEFECT-2 repair: the original partial index (WHERE order_id IS NOT NULL)
-- covered void invoices. A void invoice retains its order_id (immutable finance
-- record), so the index blocked INSERT of a replacement invoice for the same
-- order_id with a unique constraint violation.
--
-- The replacement index adds AND status <> 'void' to the partial condition.
-- This excludes void invoices from the uniqueness scope while preserving the
-- guarantee that at most one active (non-void) invoice exists per order at any
-- time. Gap-free invoice numbering and financial integrity are unaffected:
-- issue_invoice() enforces those invariants independently of this index.

DROP INDEX IF EXISTS public.invoices_order_id_unique;

CREATE UNIQUE INDEX invoices_order_id_unique
  ON public.invoices (order_id)
  WHERE (order_id IS NOT NULL AND status <> 'void');


-- ── Compatibility Amendment: Extend chk_order_event_type ─────────────────────
-- Adds 'invoice_voided_order_reset' to the allowed event type vocabulary.
--
-- Original set (20260630000003, unchanged through 20260630000004):
--   order_created, order_updated, payment_initiated, payment_completed,
--   payment_failed, refunded, cancelled
--
-- New set adds: invoice_voided_order_reset
--
-- This amendment must precede the void_invoice() replacement below. If the
-- function were replaced first and emitted the new event type before the
-- constraint was extended, the INSERT into order_events would fail on the CHECK
-- and roll back the void transaction.

ALTER TABLE public.order_events
  DROP CONSTRAINT chk_order_event_type;

ALTER TABLE public.order_events
  ADD CONSTRAINT chk_order_event_type CHECK (event_type IN (
    'order_created',
    'order_updated',
    'payment_initiated',
    'payment_completed',
    'payment_failed',
    'refunded',
    'cancelled',
    'invoice_voided_order_reset'
  ));


-- ── Fix A: void_invoice() — reinvoice-safe replacement ───────────────────────
-- DEFECT-1 repair: extends the D2.1 order-reset block to also reset
-- orders.status from 'pending_payment' to 'draft' when clearing the invoice
-- link. This restores the order to a state that create_invoice_from_order()
-- accepts for re-invoicing.
--
-- New behaviour compared to the CL-2 version (20260701000003):
--   1. SELECT … FOR UPDATE on orders captures the current status and acquires
--      the row lock in a single statement. The AND invoice_id = p_invoice_id
--      guard ensures the block only fires when the order still references THIS
--      invoice (concurrent-reinvoice safety is preserved).
--   2. status is reset to 'draft' when the captured status is 'pending_payment'
--      (the normal post-invoice state). All other status values are left
--      unchanged as a defensive guard for unexpected order states.
--   3. An 'invoice_voided_order_reset' event is emitted to order_events with
--      the invoice_id, order_id, previous status, and reset status in metadata.
--      The chk_order_event_type constraint was extended above to allow this type.
--
-- Unchanged from CL-2:
--   - Invoice SET void / void_at / void_by / void_reason block.
--   - insert_outbox_event('Invoice.Voided') block.
--   - Signature, return type, SECURITY DEFINER, search_path, GRANT set.
--   - For invoices with order_id IS NULL the entire D2.1 block is a no-op.

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
  v_invoice      invoices%ROWTYPE;
  v_void_at      timestamptz;
  v_prev_status  text;
  v_reset_status text;
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

  -- D2.1 extension (ST-7 DEFECT-1 repair):
  -- Clear orders.invoice_id and reset orders.status when an order-linked
  -- invoice is voided.
  --
  -- SELECT FOR UPDATE locks the order row only when invoice_id = p_invoice_id.
  -- If a concurrent re-invoice has already linked a replacement invoice, the
  -- SELECT returns NOT FOUND and this entire block is skipped — the new link
  -- is preserved without interference.
  IF v_invoice.order_id IS NOT NULL THEN
    SELECT status INTO v_prev_status
    FROM   public.orders
    WHERE  id         = v_invoice.order_id
      AND  invoice_id = p_invoice_id
    FOR UPDATE;

    IF FOUND THEN
      -- DEFECT-1 fix: pending_payment → draft restores the order to a state
      -- that create_invoice_from_order() accepts for replacement invoice creation.
      -- All other status values are left unchanged (defensive; in normal flow
      -- the order will always be pending_payment when its invoice is void-eligible).
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
    END IF;
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
