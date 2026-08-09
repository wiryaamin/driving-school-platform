-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260807120000_credit_ledger_consumption_sync.sql
--
-- Business Workflow Execution Audit (2026-08-07) found the audit's one P0:
-- consume_lesson_credit() decrements student_package_assignments.lessons_used
-- (the table the real-time booking-eligibility check reads, and the table
-- reverse_lesson_credit()/the event timeline operate on) but never writes to
-- credit_ledger — the table explicitly documented as the "PRIMARY source for
-- balance reads" (see 20260530000001_phase4a_commercial_core.sql, Section
-- 2.5) and the table Reports' credit-balance views and the wallet Edge
-- Function actually read from via credit_balance_cache.
--
-- purchase_package() already writes 'grant' entries to credit_ledger
-- correctly (20260720000006_sync_purchase_package_to_assignments.sql), so
-- every student's cache balance starts correct and then never decreases as
-- lessons are actually used — every package-based student's displayed
-- balance silently overstates their true remaining credits, forever.
--
-- This migration:
--   1. Extends consume_lesson_credit() to also write a 'consume' entry
--      (quantity -1) to credit_ledger, mirroring purchase_package()'s
--      existing grant-entry shape exactly.
--   2. Extends reverse_lesson_credit() to write the symmetric 'reverse'
--      entry (quantity +1) — required so un-consuming a lesson (e.g. a
--      cancelled booking) doesn't leave the ledger permanently short.
--   3. Backfills one aggregate 'consume' entry per existing
--      student_package_assignments row with lessons_used > 0, so
--      already-affected students' balances correct immediately rather than
--      only going forward. lessons_used is already net of any historical
--      reversals, so a single -lessons_used entry per assignment is
--      sufficient — no event-log replay needed. Guarded by reference_type
--      'consumption_backfill' + reference_id so this block is safe to run
--      more than once.
--
-- Deliberately out of scope: expire_stale_packages()/_all() do not write an
-- 'expire' entry to credit_ledger either (a pre-existing, separate gap, not
-- part of the audited defect) — left untouched here.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. consume_lesson_credit — also post to credit_ledger ────────────────────

CREATE OR REPLACE FUNCTION public.consume_lesson_credit(
  p_assignment_id   uuid,
  p_organization_id uuid,
  p_booking_id      uuid  DEFAULT NULL,
  p_lesson_category text  DEFAULT NULL,
  p_actor_id        uuid  DEFAULT NULL,
  p_actor_email     text  DEFAULT NULL,
  p_metadata        jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asgn     RECORD;
  v_new_used int;
  v_completed boolean;
BEGIN
  SELECT *
  INTO   v_asgn
  FROM   public.student_package_assignments
  WHERE  id              = p_assignment_id
    AND  organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package assignment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_asgn.status != 'active' THEN
    RAISE EXCEPTION 'Package is % — only active packages can consume credits', v_asgn.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_asgn.expires_at IS NOT NULL AND v_asgn.expires_at < now() THEN
    RAISE EXCEPTION 'Package has expired — credits cannot be consumed after expiry'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_asgn.lessons_used >= v_asgn.package_quantity THEN
    RAISE EXCEPTION 'No remaining credits in package'
      USING ERRCODE = 'P0001';
  END IF;

  v_new_used  := v_asgn.lessons_used + 1;
  v_completed := v_new_used >= v_asgn.package_quantity;

  UPDATE public.student_package_assignments
  SET    lessons_used = v_new_used,
         status       = CASE WHEN v_completed THEN 'completed' ELSE status END,
         updated_at   = now()
  WHERE  id = p_assignment_id;

  -- credit_ledger_update_cache trigger keeps credit_balance_cache in sync.
  INSERT INTO public.credit_ledger (
    organization_id, student_id, lesson_category,
    entry_type, quantity, currency,
    booking_id,
    reference_type, reference_id,
    description, actor_id
  ) VALUES (
    p_organization_id, v_asgn.student_id, v_asgn.lesson_category::public.lesson_category,
    'consume', -1, 'SEK',
    p_booking_id,
    'student_package_assignment', p_assignment_id,
    'Lesson credit consumed', p_actor_id
  );

  INSERT INTO public.package_consumption_events (
    organization_id, assignment_id, student_id, event_type,
    booking_id, credits_delta, lessons_used_after,
    actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, p_assignment_id, v_asgn.student_id, 'credit_consumed',
    p_booking_id, 1, v_new_used,
    p_actor_id, p_actor_email,
    p_metadata || CASE
      WHEN p_lesson_category IS NOT NULL
      THEN jsonb_build_object('lesson_category', p_lesson_category)
      ELSE '{}'::jsonb
    END
  );

  IF v_completed THEN
    INSERT INTO public.package_consumption_events (
      organization_id, assignment_id, student_id, event_type,
      credits_delta, lessons_used_after, actor_id, actor_email, metadata
    ) VALUES (
      p_organization_id, p_assignment_id, v_asgn.student_id, 'package_completed',
      0, v_new_used, p_actor_id, p_actor_email, '{}'
    );
  END IF;

  RETURN jsonb_build_object(
    'assignment_id',     p_assignment_id,
    'student_id',        v_asgn.student_id,
    'lessons_used',      v_new_used,
    'lessons_remaining', v_asgn.package_quantity - v_new_used,
    'package_completed', v_completed,
    'status',            CASE WHEN v_completed THEN 'completed' ELSE v_asgn.status END
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.consume_lesson_credit(uuid,uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_lesson_credit(uuid,uuid,uuid,text,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_lesson_credit(uuid,uuid,uuid,text,uuid,text,jsonb) TO service_role;

-- ── 2. reverse_lesson_credit — also post the symmetric reversal ──────────────

CREATE OR REPLACE FUNCTION public.reverse_lesson_credit(
  p_assignment_id   uuid,
  p_organization_id uuid,
  p_reversal_type   text,
  p_reason          text,
  p_booking_id      uuid DEFAULT NULL,
  p_actor_id        uuid DEFAULT NULL,
  p_actor_email     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asgn        RECORD;
  v_new_used    int;
  v_reversal_id uuid;
  v_reactivated boolean;
BEGIN
  SELECT *
  INTO   v_asgn
  FROM   public.student_package_assignments
  WHERE  id              = p_assignment_id
    AND  organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package assignment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_asgn.status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Cannot reverse credits on a % package', v_asgn.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_asgn.lessons_used <= 0 THEN
    RAISE EXCEPTION 'No consumed credits to reverse'
      USING ERRCODE = 'P0001';
  END IF;

  v_new_used    := v_asgn.lessons_used - 1;
  v_reactivated := v_asgn.status = 'completed';

  INSERT INTO public.package_credit_reversals (
    organization_id, assignment_id, student_id, booking_id,
    reversal_type, reason, credits_restored, reversed_by
  ) VALUES (
    p_organization_id, p_assignment_id, v_asgn.student_id, p_booking_id,
    p_reversal_type, p_reason, 1, p_actor_id
  )
  RETURNING id INTO v_reversal_id;

  UPDATE public.student_package_assignments
  SET    lessons_used = v_new_used,
         status       = CASE WHEN v_reactivated THEN 'active' ELSE status END,
         updated_at   = now()
  WHERE  id = p_assignment_id;

  -- Symmetric to consume_lesson_credit's ledger entry, so the ledger stays
  -- balanced (a consume + its reversal always nets to zero).
  INSERT INTO public.credit_ledger (
    organization_id, student_id, lesson_category,
    entry_type, quantity, currency,
    booking_id,
    reference_type, reference_id,
    description, actor_id
  ) VALUES (
    p_organization_id, v_asgn.student_id, v_asgn.lesson_category::public.lesson_category,
    'reverse', 1, 'SEK',
    p_booking_id,
    'package_credit_reversal', v_reversal_id,
    'Lesson credit reversed: ' || p_reason, p_actor_id
  );

  INSERT INTO public.package_consumption_events (
    organization_id, assignment_id, student_id, event_type,
    booking_id, reversal_id, credits_delta, lessons_used_after,
    actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, p_assignment_id, v_asgn.student_id, 'credit_reversed',
    p_booking_id, v_reversal_id, -1, v_new_used,
    p_actor_id, p_actor_email,
    jsonb_build_object('reversal_type', p_reversal_type, 'reason', p_reason)
  );

  IF v_reactivated THEN
    INSERT INTO public.package_consumption_events (
      organization_id, assignment_id, student_id, event_type,
      credits_delta, lessons_used_after, actor_id, actor_email, metadata
    ) VALUES (
      p_organization_id, p_assignment_id, v_asgn.student_id, 'package_reactivated',
      0, v_new_used, p_actor_id, p_actor_email, '{}'
    );
  END IF;

  RETURN jsonb_build_object(
    'assignment_id',     p_assignment_id,
    'reversal_id',       v_reversal_id,
    'lessons_used',      v_new_used,
    'lessons_remaining', v_asgn.package_quantity - v_new_used,
    'reactivated',       v_reactivated,
    'status',            CASE WHEN v_reactivated THEN 'active' ELSE v_asgn.status END
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.reverse_lesson_credit(uuid,uuid,text,text,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_lesson_credit(uuid,uuid,text,text,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_lesson_credit(uuid,uuid,text,text,uuid,uuid,text) TO service_role;

-- ── 3. Backfill — correct every already-affected student's cached balance ────
-- One aggregate 'consume' entry per assignment with lessons_used > 0.
-- lessons_used is already net of historical reversals, so this is sufficient
-- without replaying the full package_consumption_events log.

DO $$
DECLARE
  v_asgn  RECORD;
  v_count int := 0;
BEGIN
  FOR v_asgn IN
    SELECT spa.id, spa.organization_id, spa.student_id, spa.lesson_category, spa.lessons_used
    FROM   public.student_package_assignments spa
    WHERE  spa.lessons_used > 0
      AND  NOT EXISTS (
        SELECT 1 FROM public.credit_ledger cl
        WHERE cl.reference_type = 'consumption_backfill'
          AND cl.reference_id   = spa.id
      )
  LOOP
    INSERT INTO public.credit_ledger (
      organization_id, student_id, lesson_category,
      entry_type, quantity, currency,
      reference_type, reference_id,
      description
    ) VALUES (
      v_asgn.organization_id, v_asgn.student_id, v_asgn.lesson_category::public.lesson_category,
      'consume', -v_asgn.lessons_used, 'SEK',
      'consumption_backfill', v_asgn.id,
      'Backfill: historical lesson-credit consumption not previously reflected in the ledger'
    );
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'credit_ledger consumption backfill: % assignment(s) corrected', v_count;
END $$;
