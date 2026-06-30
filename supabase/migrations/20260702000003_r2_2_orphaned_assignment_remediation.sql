-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702000003_r2_2_orphaned_assignment_remediation.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Sprint:    RC1 Remediation — R-2.2
--
-- PROBLEM (ST-8 Exception Register — B-1):
--   Three student_package_assignments remain in 'active' status despite their
--   source orders being 'cancelled'. These were orphaned before R-2.1 existed:
--   the order cancellation path had no cascade to assignments, so any order
--   cancelled prior to migration 20260702000002 left its assignments active.
--
--   Known affected assignments (as of ST-8 validation 2026-06-24):
--     b2089251-3bb3-4b89-8609-284d8b7aa745  → order 26cfaec8 (cancelled)
--     241a89e3-a6aa-4081-9a0f-7565ca80746b  → order a60f3816 (cancelled)
--     93ad9721-0b7c-46ad-bfee-596a23884253  → order df842261 (cancelled)
--
--   These cannot be fixed via update_order_status() because their source orders
--   are already in terminal 'cancelled' status — the terminal status guard in
--   update_order_status() correctly rejects re-cancellation.
--
-- APPROACH:
--   This migration directly remediates all active assignments whose linked order
--   is 'cancelled', without touching the order or its events. The query is
--   generic (not hardcoded to specific UUIDs) so it will also catch any similar
--   orphans that may exist beyond the three known exceptions.
--
-- WHAT THIS MIGRATION DOES:
--   For each active student_package_assignment where order_id IS NOT NULL and
--   the linked order.status = 'cancelled':
--
--     1. SET status = 'cancelled', cancelled_at, cancelled_by = NULL (system
--        actor; no live user performed this action), cancellation_reason
--        (identifies the R-2.2 migration as the source).
--
--     2. INSERT a 'package_cancelled' row in package_consumption_events to
--        preserve the full credit lifecycle audit trail.
--
--     3. PERFORM insert_outbox_event('Package.Cancelled', ...) so downstream
--        consumers (notification service, analytics) receive the signal.
--
-- WHAT THIS MIGRATION DOES NOT DO:
--   - Does not modify the source orders (already terminal).
--   - Does not modify order_events.
--   - Does not touch update_order_status() logic (R-2.1 remains unchanged).
--   - Does not re-emit order-level 'cancelled' events.
--
-- IDEMPOTENCY:
--   The loop targets status = 'active' only. A second execution finds 0 rows
--   (all three are already 'cancelled') and emits the NOTICE with count = 0.
--   No duplicate consumption events or outbox events are generated.
--
-- TENANT SAFETY:
--   organization_id is read from each assignment row and propagated to every
--   audit record. No cross-tenant data is touched.
--
-- TRANSACTION SCOPE:
--   The DO $$ block runs in a single implicit transaction. Any failure rolls
--   back all partial changes — no half-remediated state is possible.
--
-- ACTOR:
--   cancelled_by = NULL. This is a system migration with no live user actor.
--   The ON DELETE SET NULL FK pattern on cancelled_by is designed for exactly
--   this case. The cancellation_reason and metadata fields carry the full
--   attribution to this migration.
--
-- AUDIT FIELDS ON package_consumption_events:
--   actor_email = 'system:r2.2-remediation'  — synthetic sentinel for log queries.
--   metadata includes: order_id, remediation_sprint, migration filename, and reason.
-- ════════════════════════════════════════════════════════════════════════════


DO $$
DECLARE
  v_asgn    RECORD;
  v_now     timestamptz := now();
  v_count   int         := 0;
  v_reason  text        :=
    'Retrospective cancellation: source order was cancelled before the R-2.1 cascade '
    'existed. Assignment orphaned by pre-R-2.1 defect. Fixed by migration '
    '20260702000003 (R-2.2 remediation sprint, 2026-07-02).';
BEGIN

  -- ── Find all active assignments whose linked order is already cancelled ─────────
  -- Generic query: catches all such orphans, not just the three known exceptions.
  -- FOR UPDATE OF spa: locks each assignment row for the duration of this block,
  -- preventing concurrent credit consumption from racing the remediation update.
  FOR v_asgn IN
    SELECT
      spa.id,
      spa.organization_id,
      spa.student_id,
      spa.lessons_used,
      o.id AS order_id
    FROM   public.student_package_assignments spa
    JOIN   public.orders o
             ON  o.id              = spa.order_id
             AND o.organization_id = spa.organization_id
    WHERE  spa.status  = 'active'
      AND  spa.order_id IS NOT NULL
      AND  o.status     = 'cancelled'
      AND  o.deleted_at IS NULL
    FOR UPDATE OF spa
  LOOP

    -- ── 1. Cancel the orphaned assignment ──────────────────────────────────────
    -- cancelled_by = NULL: no live actor; this is a system migration.
    -- cancelled_at = v_now: the moment this migration ran, not backdated.
    UPDATE public.student_package_assignments
    SET
      status              = 'cancelled',
      cancelled_at        = v_now,
      cancelled_by        = NULL,
      cancellation_reason = v_reason,
      updated_at          = v_now
    WHERE id = v_asgn.id;

    -- ── 2. Emit package_consumption_events row ─────────────────────────────────
    -- credits_delta = 0: cancellation terminates the assignment without moving
    -- credits. lessons_used_after snapshots state at the time of remediation.
    -- actor_id = NULL: system operation.
    -- actor_email = 'system:r2.2-remediation': synthetic sentinel for audit queries.
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
      v_asgn.organization_id,
      v_asgn.id,
      v_asgn.student_id,
      'package_cancelled',
      0,
      v_asgn.lessons_used,
      NULL,
      'system:r2.2-remediation',
      jsonb_build_object(
        'order_id',           v_asgn.order_id,
        'cancellation_reason', v_reason,
        'remediation_sprint', 'R-2.2',
        'migration',          '20260702000003'
      )
    );

    -- ── 3. Enqueue Package.Cancelled outbox event ──────────────────────────────
    -- channel = 'internal': platform-internal signal for downstream consumers.
    -- target_id = student_id: enables student-scoped filtering in event-worker.
    -- payload mirrors R-2.1 structure with system actor fields and remediation tags.
    PERFORM public.insert_outbox_event(
      'Package.Cancelled',
      'internal'::public.event_channel,
      jsonb_build_object(
        'assignment_id',          v_asgn.id,
        'student_id',             v_asgn.student_id,
        'order_id',               v_asgn.order_id,
        'cancelled_by',           NULL,
        'cancelled_by_email',     'system:r2.2-remediation',
        'cancellation_reason',    v_reason,
        'lessons_used_at_cancel', v_asgn.lessons_used,
        'remediation_sprint',     'R-2.2',
        'migration',              '20260702000003'
      ),
      v_asgn.organization_id,
      v_asgn.student_id::text
    );

    v_count := v_count + 1;

  END LOOP;

  -- Deployment log confirmation.
  -- On first run: expected count = 3 (the three ST-8 exception assignments).
  -- On subsequent runs: expected count = 0 (idempotency confirmed).
  RAISE NOTICE 'R-2.2 remediation complete: % orphaned assignment(s) cancelled.', v_count;

END $$;
