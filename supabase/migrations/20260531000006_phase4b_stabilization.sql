-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260531000006_phase4b_stabilization.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4B.6 — Forward-Only Stabilization
--
-- This migration corrects four integrity issues discovered in Phase 4B without
-- modifying any prior migration file. All changes are purely additive or are
-- CREATE OR REPLACE replacements with identical signatures.
--
-- Changes:
--   TASK 1 — Drop invalid set_refunds_updated_at trigger on refunds
--            (refunds has no updated_at column; trigger was a defect)
--
--   TASK 2 — Add prevent_completed_refund_mutation() + BEFORE UPDATE trigger
--            (enforces refund immutability once status = 'completed')
--
--   TASK 3 — CREATE OR REPLACE allocate_payment() with pg_advisory_xact_lock
--            (serialises concurrent allocation headroom reads on same payment)
--
--   TASK 4 — CREATE OR REPLACE apply_discount() with corrected scope JOIN path
--            (invoice_line_items → student_packages → package_offerings)
--
-- Migration-chain integrity:
--   Depends on:  20260531000001_phase4b_refunds_allocations.sql
--                20260531000002_phase4b_discounts_promotions.sql
--   No schema DDL (no new tables, no new columns, no enum changes).
--   All CREATE OR REPLACE functions preserve exact signatures from Phase 4B.
--   All GRANTs and COMMENTs are re-applied for correctness.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- TASK 1: Remove invalid updated_at trigger from refunds
-- ════════════════════════════════════════════════════════════════════════════
--
-- The refunds table is intentionally append-only (no updated_at column).
-- Phase 4B migration 001 accidentally created set_refunds_updated_at which
-- calls set_updated_at() — that function writes NEW.updated_at = now().
-- Since the column does not exist, any UPDATE on refunds would raise:
--   "ERROR: record 'new' has no field 'updated_at'"
-- process_refund() performs two UPDATEs on the refunds row (credit_ledger_id
-- link and status=completed), so this trigger would abort every refund.
--
-- The audit trigger (refunds_audit AFTER INSERT OR UPDATE) is NOT touched.

DROP TRIGGER IF EXISTS set_refunds_updated_at ON public.refunds;


-- ════════════════════════════════════════════════════════════════════════════
-- TASK 2: Enforce refund immutability after completion
-- ════════════════════════════════════════════════════════════════════════════
--
-- A completed refund is an accounting fact and must never change.
-- process_refund() performs the following UPDATE sequence on the refunds row:
--   a) UPDATE SET credit_ledger_id = ... (while status = 'processing')
--   b) UPDATE SET refund_status = 'completed', processed_at = ..., processed_by = ...
-- Both are explicitly allowed (OLD.refund_status != 'completed').
-- Once step (b) commits, no further UPDATE is possible.
--
-- Execution order for any UPDATE on refunds:
--   1. BEFORE UPDATE: prevent_completed_refund_mutation fires — aborts if completed
--   2. UPDATE proceeds (row is written)
--   3. AFTER  UPDATE: refunds_audit fires (audit trail written)
-- The audit trigger is never reached for blocked mutations.

CREATE OR REPLACE FUNCTION public.prevent_completed_refund_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.refund_status = 'completed' THEN
    RAISE EXCEPTION 'REFUND_IMMUTABLE: refund % is completed and cannot be modified',
      OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_completed_refund_mutation() IS
  'BEFORE UPDATE guard on refunds. Raises P0001 if the row is already completed. '
  'Allows all mutations while status is pending/processing/failed/cancelled. '
  'process_refund() relies on being able to UPDATE a processing row (credit_ledger_id '
  'link + status transition to completed) — both are permitted because OLD.refund_status '
  'is ''processing'' at the point of both updates within the same transaction.';

CREATE TRIGGER refunds_immutability_guard
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.prevent_completed_refund_mutation();

COMMENT ON TRIGGER refunds_immutability_guard ON public.refunds IS
  'Fires BEFORE any UPDATE on refunds. Aborts the update if the row is already completed. '
  'Must fire before the AFTER INSERT OR UPDATE audit trigger (refunds_audit). '
  'PostgreSQL fires BEFORE triggers before AFTER triggers — order is correct.';


-- ════════════════════════════════════════════════════════════════════════════
-- TASK 3: Payment allocation concurrency hardening
-- ════════════════════════════════════════════════════════════════════════════
--
-- Race condition in the original allocate_payment():
--   Two concurrent callers both execute:
--     SELECT COALESCE(SUM(allocated_amount), 0) FROM payment_allocations WHERE payment_id = X
--   Both see the same headroom. Both pass the headroom check. Both INSERT allocations.
--   Result: SUM(allocations) > payment.amount — over-allocation.
--
-- Fix: acquire a per-payment advisory transaction lock before reading headroom.
--   pg_advisory_xact_lock(int4, int4) is automatically released at transaction end.
--   Lock key: (hashtext(org_id), hashtext(payment_id)) — namespaced by org to match
--   the pattern used by consume_credit() for credit balance serialisation.
--   FOR UPDATE on the payment row also guards the payment itself; the advisory lock
--   additionally serialises the headroom aggregation across all concurrent callers
--   before the FOR UPDATE row lock is acquired.
--
-- Exact function signature preserved from Phase 4B migration 001:
--   allocate_payment(uuid, uuid, uuid, numeric(12,2), text, uuid) RETURNS uuid
--   SECURITY DEFINER, SET search_path = public
-- Only addition: pg_advisory_xact_lock call at the top of the function body.

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
$$;

COMMENT ON FUNCTION public.allocate_payment(uuid, uuid, uuid, numeric, text, uuid) IS
  'Explicit payment→invoice allocation for manual reconciliation. '
  'Uses pg_advisory_xact_lock to serialise concurrent allocations against the same payment, '
  'preventing headroom race conditions. Lock is released automatically at transaction end. '
  'Validates payment headroom before writing to prevent over-allocation. '
  'Updates invoice paid_amount and outstanding_amount atomically. Emits Payment.Reconciled.';

-- Re-apply grant (unchanged from Phase 4B; explicit for documentation)
GRANT EXECUTE ON FUNCTION public.allocate_payment(uuid, uuid, uuid, numeric, text, uuid)
  TO authenticated, service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- TASK 4: Fix discount scope relationship in apply_discount()
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bug in original apply_discount() scope validation (migration 002):
--
--   WRONG:
--     JOIN package_offerings po ON po.id = ili.student_package_id
--   This joins package_offerings.id against invoice_line_items.student_package_id.
--   But student_package_id references student_packages.id (a different table).
--   UUIDs from student_packages and package_offerings are independent; the join
--   produces zero rows for any real invoice. All offering/catalog/category scope
--   checks always raise DISCOUNT_SCOPE_MISMATCH regardless of actual invoice content.
--
--   CORRECT join chain:
--     invoice_line_items.student_package_id → student_packages.id
--     student_packages.offering_id          → package_offerings.id
--
--   Fix:
--     JOIN student_packages sp ON sp.id  = ili.student_package_id
--     JOIN package_offerings po ON po.id = sp.offering_id
--
-- Exact function signature preserved from Phase 4B migration 002:
--   apply_discount(uuid, uuid, uuid, uuid) RETURNS uuid
--   SECURITY DEFINER, SET search_path = public
-- Only change: three scope EXISTS subqueries use corrected two-hop JOIN.

CREATE OR REPLACE FUNCTION public.apply_discount(
  p_org_id      uuid,
  p_invoice_id  uuid,
  p_discount_id uuid,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS uuid  -- discount_application_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice          invoices%ROWTYPE;
  v_discount         discount_definitions%ROWTYPE;
  v_current_subtotal numeric(12,2);
  v_discount_amount  numeric(12,2);
  v_line_item_id     uuid;
  v_application_id   uuid;
BEGIN
  -- 1. Lock and validate invoice
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id              = p_invoice_id
    AND  organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'INVOICE_NOT_DRAFT: discounts can only be applied to draft invoices; invoice % has status %',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Period lock guard
  PERFORM assert_period_not_locked(p_org_id, now()::date);

  -- 2. Validate discount definition
  SELECT * INTO v_discount
  FROM   discount_definitions
  WHERE  id              = p_discount_id
    AND  organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISCOUNT_NOT_FOUND: discount % not found in org %',
      p_discount_id, p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_discount.is_active THEN
    RAISE EXCEPTION 'DISCOUNT_INACTIVE: discount % is not active', p_discount_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_discount.valid_from IS NOT NULL AND now()::date < v_discount.valid_from THEN
    RAISE EXCEPTION 'DISCOUNT_NOT_YET_VALID: discount % is valid from %',
      p_discount_id, v_discount.valid_from
      USING ERRCODE = 'P0001';
  END IF;

  IF v_discount.valid_to IS NOT NULL AND now()::date > v_discount.valid_to THEN
    RAISE EXCEPTION 'DISCOUNT_EXPIRED: discount % expired on %',
      p_discount_id, v_discount.valid_to
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate scope
  --
  -- Correct join chain: invoice_line_items → student_packages → package_offerings
  --   invoice_line_items.student_package_id  references student_packages.id
  --   student_packages.offering_id           references package_offerings.id
  --
  IF v_discount.discount_scope = 'offering' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   invoice_line_items ili
      JOIN   student_packages   sp ON sp.id  = ili.student_package_id
      JOIN   package_offerings  po ON po.id  = sp.offering_id
      WHERE  ili.invoice_id = p_invoice_id
        AND  po.id          = v_discount.scope_reference_id
    ) THEN
      RAISE EXCEPTION 'DISCOUNT_SCOPE_MISMATCH: discount % requires offering % on invoice %',
        p_discount_id, v_discount.scope_reference_id, p_invoice_id
        USING ERRCODE = 'P0001';
    END IF;

  ELSIF v_discount.discount_scope = 'catalog' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   invoice_line_items ili
      JOIN   student_packages   sp ON sp.id  = ili.student_package_id
      JOIN   package_offerings  po ON po.id  = sp.offering_id
      WHERE  ili.invoice_id = p_invoice_id
        AND  po.catalog_id  = v_discount.scope_reference_id
    ) THEN
      RAISE EXCEPTION 'DISCOUNT_SCOPE_MISMATCH: discount % requires catalog % on invoice %',
        p_discount_id, v_discount.scope_reference_id, p_invoice_id
        USING ERRCODE = 'P0001';
    END IF;

  ELSIF v_discount.discount_scope = 'category' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   invoice_line_items ili
      JOIN   student_packages   sp ON sp.id  = ili.student_package_id
      JOIN   package_offerings  po ON po.id  = sp.offering_id
      WHERE  ili.invoice_id     = p_invoice_id
        AND  po.lesson_category = v_discount.scope_category
    ) THEN
      RAISE EXCEPTION 'DISCOUNT_SCOPE_MISMATCH: discount % requires category % on invoice %',
        p_discount_id, v_discount.scope_category, p_invoice_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 4. Compute current subtotal (excluding existing discount lines)
  SELECT COALESCE(SUM(line_total), 0)
  INTO   v_current_subtotal
  FROM   invoice_line_items
  WHERE  invoice_id = p_invoice_id
    AND  line_type <> 'discount';

  -- 5. Calculate discount amount
  IF v_discount.discount_type = 'percentage' THEN
    v_discount_amount := v_current_subtotal * v_discount.discount_value;
    IF v_discount.max_discount_amount IS NOT NULL THEN
      v_discount_amount := LEAST(v_discount_amount, v_discount.max_discount_amount);
    END IF;
  ELSE
    v_discount_amount := v_discount.discount_value;
  END IF;

  v_discount_amount := ROUND(v_discount_amount, 2);

  -- 6. Over-discount protection: discount cannot bring subtotal negative
  IF v_discount_amount > v_current_subtotal THEN
    v_discount_amount := v_current_subtotal;
  END IF;

  IF v_discount_amount <= 0 THEN
    RAISE EXCEPTION 'DISCOUNT_ZERO: computed discount amount is 0 for invoice % with discount %',
      p_invoice_id, p_discount_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Insert discount line item (negative unit_price; vat_rate=0 for discount lines)
  INSERT INTO invoice_line_items (
    organization_id, invoice_id,
    line_type, description,
    quantity, unit_price,
    vat_rate, vat_amount, line_total,
    sort_order
  ) VALUES (
    p_org_id, p_invoice_id,
    'discount',
    v_discount.name,
    1,
    -v_discount_amount,
    0, 0, -v_discount_amount,
    1000
  ) RETURNING id INTO v_line_item_id;

  -- 8. Insert discount_application record
  INSERT INTO discount_applications (
    organization_id, invoice_id, invoice_line_item_id,
    discount_id, coupon_id,
    student_id,
    original_subtotal, discount_amount,
    applied_by
  ) VALUES (
    p_org_id, p_invoice_id, v_line_item_id,
    p_discount_id, NULL,
    v_invoice.student_id,
    v_current_subtotal, v_discount_amount,
    p_actor_id
  ) RETURNING id INTO v_application_id;

  -- 9. Emit Discount.Applied
  PERFORM insert_outbox_event(
    'Discount.Applied',
    'internal',
    jsonb_build_object(
      'application_id',    v_application_id,
      'discount_id',       p_discount_id,
      'discount_name',     v_discount.name,
      'invoice_id',        p_invoice_id,
      'line_item_id',      v_line_item_id,
      'student_id',        v_invoice.student_id,
      'discount_amount',   v_discount_amount,
      'original_subtotal', v_current_subtotal
    ),
    p_org_id,
    v_invoice.student_id::text
  );

  RETURN v_application_id;
END;
$$;

COMMENT ON FUNCTION public.apply_discount(uuid, uuid, uuid, uuid) IS
  'Apply a discount_definition to a draft invoice. '
  'Creates a discount invoice_line_item (negative amount) and a discount_application record. '
  'Scope validation uses the correct join chain: '
  'invoice_line_items → student_packages → package_offerings. '
  'Invoice totals are NOT updated here — issue_invoice() recomputes from all line items.';

-- Re-apply grant (unchanged from Phase 4B; explicit for documentation)
GRANT EXECUTE ON FUNCTION public.apply_discount(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;
