-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701000008_blocker2_void_commercial_status_reset.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Sprint:    PRR Blocker 2 — Student Commercial Status Reset After Invoice Void
--
-- PRR FINDING (Blocker 2):
--   void_invoice() (20260701000005, ST-7 fix) correctly resets:
--     orders.invoice_id → NULL
--     orders.status     → 'draft'
--   but does NOT reset:
--     students.commercial_status → (unchanged, remains 'awaiting_payment')
--
--   After a void, the student has no outstanding invoice. Retaining
--   'awaiting_payment' is semantically incorrect. It manifests as:
--     • Inflated "awaiting payment" counts on dashboards
--     • Spurious dunning triggers (payment reminders, overdue escalations)
--       for students with no invoice to pay
--     • Incorrect revenue forecasting (phantom expected payments)
--     • Finance reconciliation mismatch between student status count
--       and outstanding invoice total
--
-- CORRECT POST-VOID STUDENT STATUS:
--   'aktiverad_ej_fakturerad' — "activated, not yet invoiced"
--
--   Rationale:
--     After void the enrollment is NOT undone. enrollment_requests.status
--     remains 'converted'. student_package_assignments row is retained.
--     The student IS enrolled and activated. What is no longer true:
--     there is an outstanding invoice. 'aktiverad_ej_fakturerad' is the
--     exact status set by convert_enrollment_to_student() at the moment
--     of enrollment conversion — before any invoice was ever issued.
--     Resetting to this status after void restores the pre-invoice anchor
--     state consistently with the established lifecycle.
--
-- LIFECYCLE AFTER THIS FIX:
--
--   Enrollment conversion:
--     students.commercial_status → 'aktiverad_ej_fakturerad'   (CL-3)
--
--   Invoice issuance (create_invoice_from_order):
--     students.commercial_status → 'awaiting_payment'           (CL-3 / Edge Fn)
--
--   Invoice void (this migration):
--     students.commercial_status → 'aktiverad_ej_fakturerad'   ← NEW
--
--   Replacement invoice issued:
--     students.commercial_status → 'awaiting_payment'           (CL-3 / Edge Fn, unchanged)
--
--   The void creates a reversible pause. Dunning exclusion is immediate.
--   Reinvoice restores the awaiting_payment bucket without any additional work.
--
-- CONDITIONALITY:
--   The status reset fires only within the existing D2.1 block:
--     IF v_invoice.order_id IS NOT NULL THEN   ← protects System A path
--       IF FOUND THEN                           ← order was still linked to this invoice
--         ... (order reset, event) ...
--         IF v_invoice.student_id IS NOT NULL THEN  ← defensive null guard
--           PERFORM set_student_commercial_status(..., 'aktiverad_ej_fakturerad');
--
--   This gating is identical in structure to the existing D2.1 order reset.
--   The concurrent-reinvoice guard (AND invoice_id = p_invoice_id in the
--   SELECT FOR UPDATE) ensures the status reset does NOT fire when a
--   concurrent replacement invoice has already been linked — in that case
--   FOUND is false and the entire D2.1 block is skipped.
--
-- SYSTEM A INVOICE COMPATIBILITY:
--   Invoices with order_id IS NULL (System A path) bypass the outer
--   IF v_invoice.order_id IS NOT NULL block entirely. The commercial status
--   reset is a no-op for all System A voids. System A behavior is unchanged.
--
-- EXISTING STUCK STUDENTS:
--   This migration is forward-looking. Students currently stuck in
--   'awaiting_payment' with no linked invoice due to prior void operations
--   will NOT be automatically corrected. Run the following after deploying
--   this migration (via service_role in Dashboard SQL Editor):
--
--     UPDATE public.students s
--     SET    commercial_status = 'aktiverad_ej_fakturerad',
--            updated_at        = now()
--     WHERE  s.commercial_status = 'awaiting_payment'
--       AND  NOT EXISTS (
--              SELECT 1
--              FROM   public.invoices i
--              WHERE  i.student_id      = s.id
--                AND  i.organization_id = s.organization_id
--                AND  i.status          = 'issued'
--            );
--
--   Scope this to the affected organization_id if possible to minimize blast
--   radius. Verify the affected row count before executing.
--
-- WHAT IS UNCHANGED:
--   - void_invoice() signature (uuid, uuid, text) — identical
--   - void_invoice() return type (timestamptz) — identical
--   - All existing callers — unmodified; they receive correct behavior
--   - invoice status guard (only 'draft'/'issued' can be voided)
--   - Invoice.Voided outbox event — still emitted, payload unchanged
--   - invoice_voided_order_reset order event — still emitted, payload unchanged
--   - SECURITY DEFINER / SET search_path = public — unchanged
--   - REVOKE / GRANT set — unchanged
--   - All other SECURITY DEFINER functions
--   - All RLS policies
--   - All reporting views
--   - All accounting/VAT/SIE4 chains
--
-- DEPENDENCY:
--   set_student_commercial_status(uuid, uuid, text) — 20260701000004
--   void_invoice(uuid, uuid, text) prior body     — 20260701000005
--   Both must be applied before this migration.
--
-- ROLLBACK:
--   Re-apply the void_invoice() body from 20260701000005. The commercial
--   status on students that were voided between deployment and rollback
--   will remain 'aktiverad_ej_fakturerad' — which is operationally correct
--   and does not need to be reversed (it is the right state).
-- ════════════════════════════════════════════════════════════════════════════


-- ── Blocker 2: void_invoice() — commercial status reset ──────────────────────
-- Full replacement of void_invoice() (currently at 20260701000005 body).
-- Sole change: adds PERFORM set_student_commercial_status() within the D2.1
-- IF FOUND block, after the order reset and audit event, before the
-- Invoice.Voided outbox emit.
--
-- All other blocks (invoice status guard, invoice UPDATE, D2.1 order reset,
-- order event emit, outbox event) are preserved verbatim from 20260701000005.

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

  -- ── Load and lock the invoice row ─────────────────────────────────────────
  SELECT * INTO v_invoice
  FROM   public.invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Guard: only draft and issued invoices may be voided ───────────────────
  -- paid, partially_paid, overdue, void — all rejected.
  -- This guard also indirectly protects the commercial status reset:
  -- if the invoice is paid, the student is 'commercially_active' or
  -- 'partially_paid', and we must not reset them. The guard ensures
  -- we never reach the status reset for post-payment invoices.
  IF v_invoice.status NOT IN ('draft', 'issued') THEN
    RAISE EXCEPTION 'CANNOT_VOID: invoice % has status %; only draft/issued invoices can be voided',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  v_void_at := now();

  -- ── Void the invoice (immutable finance record update) ────────────────────
  -- order_id and student_id are intentionally preserved per Bokföringslagen:
  -- the void invoice must remain traceable to its originating order and student.
  UPDATE public.invoices
  SET
    status      = 'void',
    void_at     = v_void_at,
    void_by     = p_actor_id,
    void_reason = p_reason,
    updated_at  = now()
  WHERE id = p_invoice_id;

  -- ── D2.1 block: order reset + commercial status reset ────────────────────
  -- Fires only for order-linked invoices (order_id IS NOT NULL).
  -- System A invoices (order_id IS NULL) skip this block entirely.
  --
  -- Inner SELECT FOR UPDATE locks the order row only when the order still
  -- references THIS invoice (AND invoice_id = p_invoice_id). If a concurrent
  -- reinvoice has already linked a replacement invoice, FOUND is false and
  -- this entire inner block is skipped — preserving the new link and the
  -- advanced commercial status without interference.
  IF v_invoice.order_id IS NOT NULL THEN
    SELECT status INTO v_prev_status
    FROM   public.orders
    WHERE  id         = v_invoice.order_id
      AND  invoice_id = p_invoice_id
    FOR UPDATE;

    IF FOUND THEN

      -- Restore order status to 'draft' so create_invoice_from_order()
      -- accepts this order for a replacement invoice.
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

      -- Emit order timeline event for the status reset.
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

      -- ── Blocker 2 fix: reset student commercial status ──────────────────
      -- The invoice has been voided and the order has been reset to draft.
      -- No outstanding invoice now exists for this student on this order.
      -- Reset commercial_status to 'aktiverad_ej_fakturerad' (enrolled,
      -- not yet invoiced) — the pre-invoice anchor state established at
      -- enrollment conversion.
      --
      -- This fires only here (FOUND = true, order still linked to this
      -- invoice) — not in the concurrent-reinvoice branch (FOUND = false),
      -- where the replacement invoice has already set awaiting_payment.
      --
      -- When a replacement invoice is subsequently issued via
      -- create_invoice_from_order(), the enrollments Edge Function will
      -- advance commercial_status back to 'awaiting_payment' via
      -- set_student_commercial_status(), restoring the normal state.
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
  -- Triggers accounting reversal chain (BAS posting, ledger reversal, VAT).
  -- Payload is unchanged from 20260701000005 — accounting integration is
  -- not affected by the commercial status reset above.
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
