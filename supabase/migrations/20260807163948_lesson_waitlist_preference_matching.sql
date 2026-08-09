-- ════════════════════════════════════════════════════════════════════════════
-- Lesson waitlist preference matching (day-of-week / time-of-day)
--
-- promote_lesson_waitlist_next() (20260807133749) deliberately did not check
-- preferred_days_of_week/preferred_time_start/preferred_time_end — flagged
-- at the time as "a deliberate narrowing, not an oversight, to keep this a
-- single well-scoped fix." Found on review of the real journey a family
-- actually experiences: WaitlistSheet lets them set "afternoons only," but a
-- morning slot opening would have promoted them into it anyway — a family
-- who was previously ignored now gets notified about the wrong thing, which
-- reads as more broken than the silence it replaced.
--
-- Fix: extend the entry-matching WHERE clause with two more real conditions,
-- exactly the same way instructor/location preference already work (an
-- unset preference matches anything; a set one must match this slot).
-- preferred_days_of_week is ISO weekday (1=Mon..7=Sun, per the column's own
-- comment) — EXTRACT(ISODOW ...) on the slot's Stockholm-local time is the
-- same conversion generate_slots_for_rule() already uses elsewhere in this
-- codebase for day-of-week comparisons against wall-clock times.
--
-- Everything else about the function — locking, capacity check, priority
-- ordering, the notified-status update, the Waitlist.Promoted event — is
-- unchanged. This is an additive WHERE-clause extension, not a rewrite.
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
  v_slot        RECORD;
  v_entry       RECORD;
  v_local_ts    timestamp;
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

  -- Wall-clock time this slot actually starts at for the school's own
  -- timezone — preferred_time_start/end and preferred_days_of_week are both
  -- expressed in local terms ("afternoons," "Tuesdays"), not UTC.
  v_local_ts := v_slot.starts_at AT TIME ZONE 'Europe/Stockholm';

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
    AND (preferred_days_of_week  IS NULL OR EXTRACT(ISODOW FROM v_local_ts)::int = ANY(preferred_days_of_week))
    AND (preferred_time_start    IS NULL OR v_local_ts::time >= preferred_time_start)
    AND (preferred_time_end      IS NULL OR v_local_ts::time <= preferred_time_end)
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
  'row for that org+lesson_type respecting date range, instructor/location '
  'preference, and day-of-week/time-of-day preference (all only when the '
  'student actually set them), marks it notified, and publishes '
  'Waitlist.Promoted to event_outbox (consumed by the existing '
  'handleWaitlistPromoted in event-worker.ts). Returns the notified entry''s '
  'UUID, or NULL if no capacity or no matching waiting entry.';
