-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702000002_r2_1_order_cancel_cascade.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Sprint:    RC1 Remediation — R-2.1
--
-- DEFECT (ST-8 FINDING):
--   update_order_status() correctly transitions orders.status to 'cancelled'
--   and emits the 'cancelled' order_events row, but does NOT cascade to linked
--   student_package_assignments rows. Assignments created from the order remain
--   in 'active' status after the order is cancelled, creating orphaned active
--   packages that can still consume lesson credits against a cancelled order.
--
--   Known orphaned assignments (ST-8 B-1 exception register):
--     b2089251-3bb3-4b89-8609-284d8b7aa745
--     241a89e3-a6aa-4081-9a0f-7565ca80746b
--     93ad9721-0b7c-46ad-bfee-596a23884253
--
-- ROOT CAUSE:
--   update_order_status() in 20260630000003 performs no side-effects on
--   student_package_assignments when p_new_status = 'cancelled'. The link
--   between an order and its package assignment is tracked via
--   student_package_assignments.order_id (added in 20260630000005), but the
--   cancellation path never reads or writes through this FK.
--
-- FIX (three parts — all within a single atomic migration):
--
--   A. Add cancellation audit columns to student_package_assignments:
--        cancelled_at        timestamptz
--        cancelled_by        uuid → auth.users (ON DELETE SET NULL)
--        cancellation_reason text
--
--   B. Extend package_consumption_events.chk_pce_type to include
--      'package_cancelled' so the cascade can emit a consumption timeline event.
--
--   C. Replace update_order_status() with an identical body that adds a cascade
--      cancel block: when p_new_status = 'cancelled', all student_package_assignments
--      linked via order_id WHERE status = 'active' are set to 'cancelled', a
--      'package_cancelled' consumption event is emitted per assignment, and a
--      Package.Cancelled outbox event is enqueued per assignment.
--
-- IDEMPOTENCY:
--   The cascade targets only status = 'active' assignments. Already-cancelled,
--   completed, or expired assignments are skipped without error. The function-level
--   guard (terminal status check) prevents double-cancel at the order layer.
--
-- TENANT SAFETY:
--   The cascade SELECT and UPDATE both bind organization_id = p_organization_id.
--   No cross-tenant data is reachable.
--
-- TRANSACTION SCOPE:
--   All changes (order UPDATE, package assignment UPDATEs, consumption events,
--   outbox events, order_events) execute inside the single plpgsql function call,
--   which Supabase/PostgreSQL runs within a single implicit transaction. A failure
--   at any point rolls back the entire cancellation — order + assignments + events.
--
-- EXISTING BEHAVIOR:
--   All non-cancellation paths (draft→pending_payment, pending_payment→paid, etc.)
--   are preserved verbatim. Function signature, return type, GRANT set, and all
--   caller contracts are unchanged.
--
-- BACKWARD COMPATIBILITY:
--   - New columns are nullable with no DEFAULT. All existing rows receive NULL.
--   - The constraint extension is additive — no existing events are invalidated.
--   - Existing callers of update_order_status() require no changes.
--
-- KNOWN EXCEPTIONS (ST-8):
--   The three known exception assignments (b2089251, 241a89e3, 93ad9721) were
--   orphaned by B-1 cleanup operations that ran before this migration existed.
--   They cannot be retroactively fixed by this migration because their source
--   orders are already in terminal status ('cancelled') and update_order_status()
--   rejects re-cancellation of terminal orders. These assignments must be resolved
--   via the R-2.2 cancel API (POST /package-consumption/:id/cancel) once that
--   endpoint is deployed.
-- ════════════════════════════════════════════════════════════════════════════


-- ── A. Cancellation audit columns on student_package_assignments ──────────────
-- All three are nullable. Historical rows (pre-R-2.1) retain NULL — which is
-- correct: they were never cancelled via the order cascade.
-- cancelled_by uses ON DELETE SET NULL so a deleted auth user does not cascade-
-- delete the assignment row (same pattern as assigned_by on the same table).

ALTER TABLE public.student_package_assignments
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by        uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

COMMENT ON COLUMN public.student_package_assignments.cancelled_at IS
  'Populated by update_order_status() cascade when the linked order is cancelled (R-2.1). '
  'NULL for all other status transitions.';

COMMENT ON COLUMN public.student_package_assignments.cancelled_by IS
  'Actor who triggered the order cancellation (propagated from order cancel actor). '
  'ON DELETE SET NULL: preserved for audit even if the auth user is later deleted.';

COMMENT ON COLUMN public.student_package_assignments.cancellation_reason IS
  'Reason text from the order cancellation request, propagated to the assignment.';


-- ── B. Extend package_consumption_events event type constraint ────────────────
-- Current set (from 20260630000006 + 20260630000007):
--   'package_assigned', 'lesson_booked', 'lesson_completed',
--   'credit_consumed', 'credit_reversed', 'package_completed',
--   'package_expired', 'package_reactivated'
--
-- New value: 'package_cancelled'
-- Emitted by the cascade cancel block in update_order_status() (Part C below).

ALTER TABLE public.package_consumption_events
  DROP CONSTRAINT IF EXISTS chk_pce_type;

ALTER TABLE public.package_consumption_events
  ADD CONSTRAINT chk_pce_type CHECK (event_type IN (
    'package_assigned',
    'lesson_booked',
    'lesson_completed',
    'credit_consumed',
    'credit_reversed',
    'package_completed',
    'package_expired',
    'package_reactivated',
    'package_cancelled'
  ));


-- ── C. Replace update_order_status() with cascade cancel support ──────────────
-- Sole addition: cascade cancel block at the end of the 'cancelled' branch.
-- All other logic (terminal status guard, same-status guard, UPDATE, event type
-- mapping, emit_order_event call, return shape) is preserved verbatim from
-- 20260630000003.

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id            uuid,
  p_organization_id     uuid,
  p_new_status          text,
  p_actor_id            uuid    DEFAULT NULL,
  p_actor_email         text    DEFAULT NULL,
  p_amount_paid         numeric DEFAULT NULL,
  p_cancellation_reason text    DEFAULT NULL,
  p_internal_notes      text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- ── Terminal status guard ────────────────────────────────────────────────────
  -- cancelled and refunded are terminal; no further transitions are permitted.
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
  -- When an order is cancelled, all active student_package_assignments that
  -- reference this order via order_id are transitioned to 'cancelled'.
  --
  -- Scope:  status = 'active' only.
  --         Completed, expired, or already-cancelled assignments are skipped.
  -- Lock:   FOR UPDATE on each assignment row prevents concurrent credit
  --         consumption racing the cancellation.
  -- Events: one 'package_cancelled' consumption event + one Package.Cancelled
  --         outbox event per affected assignment.
  --
  -- This block fires only when p_new_status = 'cancelled'. All other status
  -- transitions skip it entirely.
  IF p_new_status = 'cancelled' THEN

    FOR v_asgn IN
      SELECT id, student_id, lessons_used
      FROM   public.student_package_assignments
      WHERE  order_id        = p_order_id
        AND  organization_id = p_organization_id
        AND  status          = 'active'
      FOR UPDATE
    LOOP

      -- Cancel the package assignment with full audit fields.
      UPDATE public.student_package_assignments
      SET
        status              = 'cancelled',
        cancelled_at        = v_now,
        cancelled_by        = p_actor_id,
        cancellation_reason = p_cancellation_reason,
        updated_at          = v_now
      WHERE id = v_asgn.id;

      -- Emit package consumption timeline event.
      -- credits_delta = 0: cancellation does not consume or restore a credit;
      -- it terminates the assignment. lessons_used_after reflects state at cancel.
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

      -- Enqueue Package.Cancelled outbox event for downstream consumers
      -- (notification service, analytics, etc.).
      -- channel = 'internal': this is a platform-internal signal.
      -- p_target_id = student_id: enables student-scoped filtering in event-worker.
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
  -- assignments_cancelled is additive and non-breaking for existing callers:
  -- it is 0 for all non-cancellation transitions and for cancellations with no
  -- linked active assignments.
  RETURN jsonb_build_object(
    'order_id',              p_order_id,
    'status',                p_new_status,
    'event_type',            v_event_type,
    'assignments_cancelled', v_cancelled_count
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.update_order_status(uuid,uuid,text,uuid,text,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid,uuid,text,uuid,text,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid,uuid,text,uuid,text,numeric,text,text) TO service_role;
