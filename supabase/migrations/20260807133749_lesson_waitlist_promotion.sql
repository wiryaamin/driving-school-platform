-- ════════════════════════════════════════════════════════════════════════════
-- Lesson waitlist promotion (lesson_waitlist_entries)
--
-- lesson_waitlist_entries (20260528000014_phase2fa_core.sql) was built as a
-- type-based waitlist ("notify me when ANY slot for lesson type X opens") —
-- distinct from the existing slot-based waitlist_entries table (which is
-- "notify me when THIS specific slot opens" and already has a working
-- promote_waitlist_next() + Waitlist.Promoted event, wired in
-- event-worker.ts's handleLessonCancelled). The table's own comment names a
-- "notification engine (Phase 2F-D)" meant to read active entries and notify
-- them — that engine was never built. Students can join via the real,
-- shipped student-portal UI (WaitlistSheet in StudentPortalBokaPage.tsx,
-- POST /waitlist) and the notification UI already promises a
-- "waitlist_promoted" notification (StudentPortalMeddelandenPage.tsx) — but
-- nothing has ever produced one, since nothing calls this table's promotion.
--
-- This function completes that promise using the exact same building blocks
-- the slot-based waitlist already proved: lock the slot, find the
-- highest-priority matching entry, mark it notified, publish Waitlist.Promoted
-- to event_outbox. event-worker.ts's handleWaitlistPromoted already consumes
-- that event generically (student_id/slot_id/waitlist_entry_id) — reused
-- as-is, no new handler or communication template needed.
--
-- Matching is deliberately scoped to what can be answered unambiguously from
-- the slot itself: same organization, same lesson_type_id, date within
-- [not_before, not_after], and instructor/location preference when the
-- student specified one. Day-of-week/time-of-day preferences on the entry
-- are not filtered here — a deliberate narrowing, not an oversight, to keep
-- this a single well-scoped fix rather than a full preference-matching engine.
--
-- Triggered from the same place the slot-based promotion already is —
-- handleLessonCancelled in event-worker.ts, when a cancelled booking reopens
-- its slot. Consistent scope with the pre-existing feature: neither waitlist
-- currently promotes on newly *generated* slots, only on a slot reopening.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.promote_lesson_waitlist_next(
  p_slot_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot   RECORD;
  v_entry  RECORD;
BEGIN
  SELECT organization_id, lesson_type_id, instructor_id, location_id,
         starts_at, current_bookings, max_bookings
  INTO   v_slot
  FROM   lesson_slots
  WHERE  id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_slot.current_bookings >= v_slot.max_bookings THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_entry
  FROM lesson_waitlist_entries
  WHERE organization_id = v_slot.organization_id
    AND lesson_type_id  = v_slot.lesson_type_id
    AND status           = 'waiting'
    AND deleted_at       IS NULL
    AND (expires_at  IS NULL OR expires_at  > now())
    AND (not_before  IS NULL OR v_slot.starts_at::date >= not_before)
    AND (not_after   IS NULL OR v_slot.starts_at::date <= not_after)
    AND (preferred_instructor_id IS NULL OR preferred_instructor_id = v_slot.instructor_id)
    AND (preferred_location_id   IS NULL OR preferred_location_id   = v_slot.location_id)
  ORDER BY priority ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE lesson_waitlist_entries
  SET    status              = 'notified',
         notified_at         = now(),
         notification_count  = notification_count + 1,
         updated_at          = now()
  WHERE  id = v_entry.id;

  PERFORM insert_outbox_event(
    p_event_type      := 'Waitlist.Promoted',
    p_channel         := 'internal',
    p_payload         := jsonb_build_object(
      'waitlist_entry_id', v_entry.id,
      'slot_id',           p_slot_id,
      'student_id',        v_entry.student_id
    ),
    p_organization_id := v_entry.organization_id,
    p_target_id       := v_entry.id::text
  );

  RETURN v_entry.id;
END;
$$;

COMMENT ON FUNCTION public.promote_lesson_waitlist_next IS
  'Type-based counterpart to promote_waitlist_next(): given a slot that just '
  'gained free capacity, finds the highest-priority lesson_waitlist_entries '
  'row for that org+lesson_type (respecting date range and instructor/'
  'location preference when set), marks it notified, and publishes '
  'Waitlist.Promoted to event_outbox (consumed by the existing '
  'handleWaitlistPromoted in event-worker.ts). Returns the notified entry''s '
  'UUID, or NULL if no capacity or no matching waiting entry.';
