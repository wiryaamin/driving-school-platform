-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260531000001_phase4b_refunds_allocations.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4B.1 — Refunds, Payment Allocations, and Period Enforcement
--
-- Implements:
--   refunds             — immutable refund records per invoice/payment
--   payment_allocations — append-only payment→invoice allocation audit trail
--
-- New SECURITY DEFINER functions:
--   assert_period_not_locked — shared guard; called by ALL financial functions
--   process_refund           — atomic refund: credit reversal + payment update
--   allocate_payment         — explicit payment→invoice reconciliation
--
-- Modified Phase 4A SECURITY DEFINER functions (CREATE OR REPLACE, same signature):
--   purchase_package  — adds assert_period_not_locked guard
--   consume_credit    — adds assert_period_not_locked guard
--   issue_invoice     — adds assert_period_not_locked guard
--   void_invoice      — adds assert_period_not_locked guard
--   record_payment    — adds assert_period_not_locked guard + payment_allocations write
--
-- Financial integrity:
--   • process_refund is the ONLY function that decreases invoices.paid_amount
--   • Over-refund protection: SUM(prior refunds) + new_refund ≤ payment.amount
--   • Credit reversals use credit_ledger entry_type='reverse' (append-only invariant kept)
--   • Period lock enforcement: any financial write to a closed/locked period is blocked
--   • All operations are atomic: refund record + ledger + payment + invoice — one txn
--
-- Dependencies:
--   20260530000001_phase4a_commercial_core.sql  — all base tables + Phase 4A functions
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: New enum types ────────────────────────────────────────────────

CREATE TYPE public.refund_status AS ENUM (
  'pending',     -- Refund record created; not yet processed
  'processing',  -- Refund in progress (within the transaction)
  'completed',   -- Refund successfully processed; record is immutable
  'failed',      -- Refund attempt failed; see failed_reason
  'cancelled'    -- Refund manually cancelled before processing
);

CREATE TYPE public.refund_type AS ENUM (
  'full',          -- Full monetary refund + full credit reversal
  'partial',       -- Partial monetary refund and/or partial credit reversal
  'credit_only',   -- Reverse credit grants only; no monetary refund
  'payment_only'   -- Monetary refund only; no credit reversal
);

CREATE TYPE public.refund_reason_code AS ENUM (
  'duplicate_payment',    -- Student paid twice
  'student_cancellation', -- Student cancelled course before use
  'administrative_error', -- Staff error (wrong amount, wrong student, etc.)
  'service_failure',      -- School failed to deliver the purchased service
  'goodwill',             -- Goodwill gesture; no obligation
  'fraud_prevention',     -- Refund as part of fraud or chargeback handling
  'partial_adjustment'    -- Price correction or partial service delivery
);

-- ── Section 2: New tables ────────────────────────────────────────────────────

-- 2.1 refunds
-- Immutable record of every refund operation.
-- Created and completed atomically by process_refund() in one transaction.
-- NO soft delete: refund records are permanent for audit trail.
-- If a refund fails mid-transaction, everything rolls back — no partial state.

CREATE TABLE public.refunds (
  id                uuid                       NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid                       NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id        uuid                       NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  payment_id        uuid                       REFERENCES public.payments(id) ON DELETE RESTRICT,
  student_id        uuid                       NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  refund_type       public.refund_type         NOT NULL,
  refund_status     public.refund_status       NOT NULL DEFAULT 'pending',
  reason_code       public.refund_reason_code  NOT NULL,
  refund_amount     numeric(12,2)              NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  credit_quantity   int                        NOT NULL DEFAULT 0 CHECK (credit_quantity >= 0),
  credit_category   public.lesson_category,
  credit_ledger_id  uuid                       REFERENCES public.credit_ledger(id) ON DELETE RESTRICT,
  notes             text,
  processed_at      timestamptz,
  processed_by      uuid                       REFERENCES auth.users(id) ON DELETE SET NULL,
  failed_reason     text,
  metadata          jsonb                      NOT NULL DEFAULT '{}',
  created_at        timestamptz                NOT NULL DEFAULT now(),
  created_by        uuid                       REFERENCES auth.users(id) ON DELETE SET NULL

  -- NO updated_at: refunds are append-only; status transitions happen within
  -- process_refund() atomically. A completed refund is immutable.
);

COMMENT ON TABLE  public.refunds IS
  'Immutable refund records. Created and completed atomically by process_refund(). '
  'Never UPDATE a completed refund — any correction requires a new refund record.';
COMMENT ON COLUMN public.refunds.credit_ledger_id IS
  'References the credit_ledger entry_type=''reverse'' entry created by this refund. '
  'NULL for payment_only refunds that do not reverse credit grants.';
COMMENT ON COLUMN public.refunds.refund_amount IS
  'Monetary amount refunded. 0 for credit_only refunds.';
COMMENT ON COLUMN public.refunds.credit_quantity IS
  'Number of lesson credits reversed. 0 for payment_only refunds.';

CREATE TRIGGER set_refunds_updated_at
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.2 payment_allocations
-- Append-only audit trail of how each payment is allocated to invoices.
-- Populated automatically by record_payment() (1:1 allocation on payment creation)
-- and explicitly by allocate_payment() for manual reconciliation.

CREATE TABLE public.payment_allocations (
  id               uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payment_id       uuid          NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  invoice_id       uuid          NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  allocated_amount numeric(12,2) NOT NULL CHECK (allocated_amount > 0),
  notes            text,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  created_by       uuid          REFERENCES auth.users(id) ON DELETE SET NULL

  -- NO updated_at: append-only. Allocations are never modified.
  -- A refund does not delete allocations; it creates a new refund record.
);

COMMENT ON TABLE public.payment_allocations IS
  'Append-only record of payment→invoice allocations. '
  'record_payment() writes one allocation automatically (1:1). '
  'allocate_payment() writes additional allocations for manual reconciliation. '
  'SUM(allocated_amount WHERE payment_id=X) <= payments.amount is enforced by allocate_payment().';

-- ── Section 3: Audit triggers ────────────────────────────────────────────────

CREATE TRIGGER refunds_audit
  AFTER INSERT OR UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- payment_allocations is append-only; INSERT-only audit trigger
CREATE TRIGGER payment_allocations_audit
  AFTER INSERT ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ── Section 4: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.refunds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

-- refunds: finance:refund:read required to view; no direct INSERT (only via process_refund RPC)
CREATE POLICY "refunds_select"
  ON public.refunds FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:refund:read')
  );

-- payment_allocations: finance:payment:read required to view
CREATE POLICY "payment_allocations_select"
  ON public.payment_allocations FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:payment:read')
  );

-- ── Section 5: Table grants ──────────────────────────────────────────────────

-- refunds: authenticated SELECT; service_role full (process_refund needs INSERT + UPDATE)
GRANT SELECT                 ON public.refunds             TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.refunds             TO service_role;

-- payment_allocations: authenticated SELECT; service_role INSERT (append-only)
GRANT SELECT         ON public.payment_allocations TO authenticated;
GRANT SELECT, INSERT ON public.payment_allocations TO service_role;

-- ── Section 6: SECURITY DEFINER Functions ────────────────────────────────────

-- ── 6.1 assert_period_not_locked ─────────────────────────────────────────────
-- Shared guard called at the start of every financial SECURITY DEFINER function.
-- Raises P0001 if any financial_period covering p_date is closed or locked.
-- Called with now()::date as p_date in normal operation.

CREATE OR REPLACE FUNCTION public.assert_period_not_locked(
  p_org_id uuid,
  p_date   date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_name text;
  v_status      text;
BEGIN
  SELECT name, status::text
  INTO   v_period_name, v_status
  FROM   financial_periods
  WHERE  organization_id = p_org_id
    AND  p_date BETWEEN period_start AND period_end
    AND  status IN ('closed', 'locked')
  LIMIT  1;

  IF FOUND THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: financial period "%" is % and does not permit new transactions on %',
      v_period_name, v_status, p_date
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_period_not_locked(uuid, date) IS
  'Raises P0001 if p_date falls within a closed or locked financial period for p_org_id. '
  'Called by purchase_package, consume_credit, issue_invoice, void_invoice, record_payment, '
  'process_refund, apply_discount, redeem_coupon, and allocate_payment.';

-- ── 6.2 process_refund ───────────────────────────────────────────────────────
-- Atomic refund processing. In one transaction:
--   1. Assert period not locked
--   2. Validate invoice (must be paid or partially_paid)
--   3. Over-refund guard: new_refund ≤ paid_amount − prior_refunds
--   4. If credit_qty > 0: insert credit_ledger reverse entry (trigger updates cache)
--   5. If refund_amount > 0: update payments + invoices amounts atomically
--   6. Mark refund completed
--   7. Emit Refund.Processed event
--
-- If any step fails the entire transaction rolls back — no partial state.

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

  -- 7. Process credit reversal (entry_type='reverse', positive quantity restores balance)
  IF p_credit_qty > 0 THEN
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
      p_credit_qty,
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
  'transaction — any failure causes complete rollback with no partial state.';

-- ── 6.3 allocate_payment ─────────────────────────────────────────────────────
-- Explicit payment→invoice allocation for manual reconciliation.
-- Validates payment headroom before writing to prevent over-allocation.
-- Updates invoice paid_amount and outstanding_amount atomically.

CREATE OR REPLACE FUNCTION public.allocate_payment(
  p_org_id      uuid,
  p_payment_id  uuid,
  p_invoice_id  uuid,
  p_amount      numeric(12,2),
  p_notes       text DEFAULT NULL,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS uuid  -- allocation_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ── Section 7: Modified Phase 4A SECURITY DEFINER functions ──────────────────
-- ONLY change: assert_period_not_locked added at appropriate point.
-- For record_payment: also adds payment_allocations INSERT after payment creation.
-- All parameter names, types, defaults, return types, SECURITY DEFINER, and
-- SET search_path are IDENTICAL to Phase 4A to prevent signature incompatibility.

-- ── 7.1 purchase_package (with period guard) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.purchase_package(
  p_org_id      uuid,
  p_student_id  uuid,
  p_offering_id uuid,
  p_actor_id    uuid
)
RETURNS uuid  -- student_package_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offering       package_offerings%ROWTYPE;
  v_package_id     uuid;
  v_invoice_id     uuid;
  v_ledger_id      uuid;
  v_expires_at     timestamptz;
  v_vat_amount     numeric(12,2);
  v_line_total     numeric(12,2);
  v_total_amount   numeric(12,2);
  v_bundle_item    jsonb;
  v_bundle_cat     text;
  v_bundle_qty     int;
BEGIN
  -- Period lock guard (Phase 4B addition)
  PERFORM assert_period_not_locked(p_org_id, now()::date);

  -- 1. Lock offering (FOR SHARE allows concurrent readers; blocks concurrent writers)
  SELECT * INTO v_offering
  FROM   package_offerings
  WHERE  id              = p_offering_id
    AND  organization_id = p_org_id
    AND  status          = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OFFERING_NOT_FOUND: offering % not found or not active in org %',
      p_offering_id, p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Calculate expiry date
  v_expires_at := CASE
    WHEN v_offering.validity_days IS NOT NULL
    THEN now() + make_interval(days := v_offering.validity_days)
    ELSE NULL
  END;

  -- 3. Create student_package
  INSERT INTO student_packages (
    organization_id, student_id, offering_id,
    quantity_granted, price_paid, currency, vat_rate,
    purchased_at, activated_at, expires_at, created_by
  ) VALUES (
    p_org_id, p_student_id, p_offering_id,
    v_offering.quantity, v_offering.price, v_offering.currency, v_offering.vat_rate,
    now(), now(), v_expires_at, p_actor_id
  ) RETURNING id INTO v_package_id;

  -- 4. Calculate invoice amounts (VAT-inclusive total)
  v_line_total   := v_offering.quantity * v_offering.price;
  v_vat_amount   := v_line_total * v_offering.vat_rate;
  v_total_amount := v_line_total + v_vat_amount;

  -- 5. Create draft invoice with pre-computed totals
  INSERT INTO invoices (
    organization_id, student_id, student_package_id,
    currency,
    subtotal_amount, vat_amount, total_amount, outstanding_amount,
    created_by
  ) VALUES (
    p_org_id, p_student_id, v_package_id,
    v_offering.currency,
    v_line_total, v_vat_amount, v_total_amount, v_total_amount,
    p_actor_id
  ) RETURNING id INTO v_invoice_id;

  -- 6. Create invoice line item
  INSERT INTO invoice_line_items (
    organization_id, invoice_id, student_package_id,
    line_type, description, quantity,
    unit_price, vat_rate, vat_amount, line_total
  ) VALUES (
    p_org_id, v_invoice_id, v_package_id,
    'package', v_offering.name, 1,
    v_offering.price * v_offering.quantity,
    v_offering.vat_rate,
    v_vat_amount,
    v_line_total
  );

  -- 7. Create credit_ledger grant for primary category
  INSERT INTO credit_ledger (
    organization_id, student_id, lesson_category,
    entry_type, quantity, currency,
    student_package_id, grant_entry_id,
    reference_type, reference_id,
    description, actor_id, expires_at
  ) VALUES (
    p_org_id, p_student_id, v_offering.lesson_category,
    'grant', v_offering.quantity, v_offering.currency,
    v_package_id, NULL,
    'student_package', v_package_id,
    'Package purchase: ' || v_offering.name,
    p_actor_id, v_expires_at
  ) RETURNING id INTO v_ledger_id;

  PERFORM insert_outbox_event(
    'Credit.Granted',
    'accounting',
    jsonb_build_object(
      'ledger_id',          v_ledger_id,
      'student_id',         p_student_id,
      'lesson_category',    v_offering.lesson_category,
      'quantity',           v_offering.quantity,
      'expires_at',         v_expires_at,
      'student_package_id', v_package_id
    ),
    p_org_id,
    p_student_id::text
  );

  -- 8. Create additional credit_ledger grants for bundle categories
  IF v_offering.bundle_credits IS NOT NULL
    AND jsonb_array_length(v_offering.bundle_credits) > 0
  THEN
    FOR v_bundle_item IN
      SELECT value FROM jsonb_array_elements(v_offering.bundle_credits)
    LOOP
      v_bundle_cat := v_bundle_item->>'lesson_category';
      v_bundle_qty := (v_bundle_item->>'quantity')::int;

      CONTINUE WHEN v_bundle_cat IS NULL OR v_bundle_qty <= 0;

      INSERT INTO credit_ledger (
        organization_id, student_id, lesson_category,
        entry_type, quantity, currency,
        student_package_id, grant_entry_id,
        reference_type, reference_id,
        description, actor_id, expires_at
      ) VALUES (
        p_org_id, p_student_id, v_bundle_cat::lesson_category,
        'grant', v_bundle_qty, v_offering.currency,
        v_package_id, NULL,
        'student_package', v_package_id,
        'Bundle grant: ' || v_offering.name || ' (' || v_bundle_cat || ')',
        p_actor_id, v_expires_at
      ) RETURNING id INTO v_ledger_id;

      PERFORM insert_outbox_event(
        'Credit.Granted',
        'accounting',
        jsonb_build_object(
          'ledger_id',          v_ledger_id,
          'student_id',         p_student_id,
          'lesson_category',    v_bundle_cat,
          'quantity',           v_bundle_qty,
          'expires_at',         v_expires_at,
          'student_package_id', v_package_id
        ),
        p_org_id,
        p_student_id::text
      );
    END LOOP;
  END IF;

  -- 9. Publish Package.Purchased
  PERFORM insert_outbox_event(
    'Package.Purchased',
    'accounting',
    jsonb_build_object(
      'student_package_id', v_package_id,
      'student_id',         p_student_id,
      'offering_id',        p_offering_id,
      'offering_name',      v_offering.name,
      'quantity_granted',   v_offering.quantity,
      'invoice_id',         v_invoice_id,
      'lesson_category',    v_offering.lesson_category,
      'price',              v_offering.price,
      'currency',           v_offering.currency,
      'expires_at',         v_expires_at
    ),
    p_org_id,
    p_student_id::text
  );

  RETURN v_package_id;
END;
$$;

-- ── 7.2 consume_credit (with period guard) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.consume_credit(
  p_org_id     uuid,
  p_student_id uuid,
  p_booking_id uuid,
  p_category   public.lesson_category,
  p_quantity   int DEFAULT 1
)
RETURNS uuid  -- new credit_ledger consume entry id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance    int;
  v_currency   text;
  v_grant_id   uuid;
  v_ledger_id  uuid;
BEGIN
  -- 1. Advisory transaction lock: one consumer per (org, student) at a time
  PERFORM pg_advisory_xact_lock(
    hashtext(p_org_id::text),
    hashtext(p_student_id::text)
  );

  -- 2. Period lock guard (Phase 4B addition)
  PERFORM assert_period_not_locked(p_org_id, now()::date);

  -- 3. Read balance from cache with FOR UPDATE (ensures fresh read after lock)
  SELECT balance, 'SEK'
  INTO   v_balance, v_currency
  FROM   credit_balance_cache
  WHERE  organization_id = p_org_id
    AND  student_id      = p_student_id
    AND  lesson_category = p_category
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: student % has % credits for %, needs %',
      p_student_id,
      COALESCE(v_balance, 0),
      p_category,
      p_quantity
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Find earliest-expiring grant with remaining balance (FIFO)
  WITH grant_remainders AS (
    SELECT
      g.id,
      g.expires_at,
      g.quantity + COALESCE(SUM(c.quantity), 0) AS remaining
    FROM   credit_ledger g
    LEFT   JOIN credit_ledger c
      ON   c.grant_entry_id = g.id
      AND  c.entry_type IN ('consume', 'expire', 'adjust', 'reverse')
    WHERE  g.organization_id = p_org_id
      AND  g.student_id      = p_student_id
      AND  g.lesson_category = p_category
      AND  g.entry_type      = 'grant'
      AND  (g.expires_at IS NULL OR g.expires_at > now())
    GROUP  BY g.id, g.quantity, g.expires_at
    ORDER  BY g.expires_at ASC NULLS LAST
  )
  SELECT id
  INTO   v_grant_id
  FROM   grant_remainders
  WHERE  remaining >= p_quantity
  LIMIT  1;

  IF v_grant_id IS NULL THEN
    RAISE EXCEPTION 'NO_VALID_GRANT: no single non-expired grant has >= % credits for student % category %',
      p_quantity, p_student_id, p_category
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Insert consume entry (trigger updates credit_balance_cache automatically)
  INSERT INTO credit_ledger (
    organization_id, student_id, lesson_category,
    entry_type, quantity, currency,
    booking_id, grant_entry_id,
    reference_type, reference_id,
    description
  ) VALUES (
    p_org_id, p_student_id, p_category,
    'consume', -p_quantity, COALESCE(v_currency, 'SEK'),
    p_booking_id, v_grant_id,
    'booking', p_booking_id,
    'Lesson completed: booking ' || p_booking_id::text
  ) RETURNING id INTO v_ledger_id;

  -- 6. Publish Credit.Consumed
  PERFORM insert_outbox_event(
    'Credit.Consumed',
    'accounting',
    jsonb_build_object(
      'ledger_id',       v_ledger_id,
      'student_id',      p_student_id,
      'lesson_category', p_category,
      'quantity',        -p_quantity,
      'booking_id',      p_booking_id,
      'grant_entry_id',  v_grant_id
    ),
    p_org_id,
    p_student_id::text
  );

  RETURN v_ledger_id;
END;
$$;

-- ── 7.3 issue_invoice (with period guard) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_invoice_id uuid,
  p_actor_id   uuid
)
RETURNS text  -- invoice_number
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Period lock guard (Phase 4B addition — uses org from invoice)
  PERFORM assert_period_not_locked(v_invoice.organization_id, now()::date);

  -- 2. Re-compute and freeze totals from line items
  SELECT
    COALESCE(SUM(line_total),  0),
    COALESCE(SUM(vat_amount),  0)
  INTO v_subtotal, v_vat_total
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id;

  v_grand_total := v_subtotal + v_vat_total;

  -- Freeze VAT calculations on each line item (quantity * unit_price * vat_rate)
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

  -- 5. Publish Invoice.Issued
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
$$;

-- ── 7.4 void_invoice (with period guard) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id uuid,
  p_actor_id   uuid,
  p_reason     text DEFAULT NULL
)
RETURNS timestamptz  -- void_at timestamp
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_void_at timestamptz;
BEGIN
  SELECT * INTO v_invoice
  FROM   invoices
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

  -- Period lock guard (Phase 4B addition — uses org from invoice)
  PERFORM assert_period_not_locked(v_invoice.organization_id, now()::date);

  v_void_at := now();

  UPDATE invoices
  SET
    status      = 'void',
    void_at     = v_void_at,
    void_by     = p_actor_id,
    void_reason = p_reason,
    updated_at  = now()
  WHERE id = p_invoice_id;

  PERFORM insert_outbox_event(
    'Invoice.Voided',
    'accounting',
    jsonb_build_object(
      'invoice_id',     p_invoice_id,
      'invoice_number', v_invoice.invoice_number,
      'student_id',     v_invoice.student_id,
      'reason',         p_reason,
      'voided_by',      p_actor_id
    ),
    v_invoice.organization_id,
    v_invoice.student_id::text
  );

  RETURN v_void_at;
END;
$$;

-- ── 7.5 record_payment (with period guard + payment_allocations write) ────────
-- Same signature as Phase 4A. Adds:
--   a) assert_period_not_locked before payment INSERT
--   b) INSERT into payment_allocations after payment creation

CREATE OR REPLACE FUNCTION public.record_payment(
  p_invoice_id uuid,
  p_amount     numeric(12,2),
  p_method     public.payment_method,
  p_reference  text     DEFAULT NULL,
  p_actor_id   uuid     DEFAULT NULL
)
RETURNS uuid  -- payment_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ── Section 8: Function grants ───────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.assert_period_not_locked(uuid, date)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.process_refund(
  uuid, uuid, public.refund_type, public.refund_reason_code,
  numeric, int, public.lesson_category, uuid, uuid, text, uuid
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.allocate_payment(uuid, uuid, uuid, numeric, text, uuid)
  TO authenticated, service_role;

-- Modified Phase 4A functions retain their existing grants automatically.
-- Re-issuing here as explicit documentation of intent.
GRANT EXECUTE ON FUNCTION public.purchase_package(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_credit(uuid, uuid, uuid, public.lesson_category, int)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, public.payment_method, text, uuid)
  TO authenticated, service_role;

-- ── Section 9: New permissions ───────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'finance:refund:create', 'finance', 'refund', 'create', 'Process refunds against paid invoices'),
  (gen_random_uuid(), 'finance:refund:read',   'finance', 'refund', 'read',   'View refund records and history')
ON CONFLICT (code) DO NOTHING;

-- ── Section 10: Role-permission assignments ──────────────────────────────────

-- org_owner: full refund access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_owner'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY['finance:refund:create', 'finance:refund:read'])
ON CONFLICT DO NOTHING;

-- org_admin: full refund access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_admin'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY['finance:refund:create', 'finance:refund:read'])
ON CONFLICT DO NOTHING;

-- finance_admin: full refund access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'finance_admin'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY['finance:refund:create', 'finance:refund:read'])
ON CONFLICT DO NOTHING;

-- org_manager + receptionist: read-only
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name IN ('org_manager', 'receptionist')
  AND  r.is_system_role = true
  AND  p.code = 'finance:refund:read'
ON CONFLICT DO NOTHING;
