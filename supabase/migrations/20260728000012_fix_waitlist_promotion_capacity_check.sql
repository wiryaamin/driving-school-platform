-- ════════════════════════════════════════════════════════════════════════════
-- Fix: promote_waitlist_next() never checked slot capacity
--
-- promote_waitlist_next() does not create a booking — it marks the top
-- waiting entry 'promoted' and starts a reservation_deadline countdown for
-- the student to actually book (see notification template
-- 'waitlist.promoted': "Boka din plats senast {{reservation_deadline}}").
-- The actual booking insert is protected against overbooking by
-- lesson_slots_bookings_lte_max, so no double-booking can ever occur.
--
-- But promote_waitlist_next() itself never checked whether the slot had any
-- free capacity left before promoting — it will happily promote every
-- waiting entry it's called for, regardless of current_bookings vs
-- max_bookings or how many other entries are already promoted-and-pending.
-- Found via concurrency hardening: two simultaneous calls for a slot with
-- exactly one freed seat promoted BOTH waiting students — both receive a
-- "your seat is ready, book now" email for one physical seat, and one of
-- them is guaranteed to hit SLOT_UNAVAILABLE when they actually try to book.
-- In the normal single-cancellation-to-single-call flow this never
-- surfaces, but any duplicate/retried call (event redelivery, a second
-- staff click, a retried edge function invocation) hits it immediately.
--
-- Fix: lock the slot row (serializes concurrent promotion attempts for the
-- same slot) and only promote if current_bookings plus any other entry
-- already promoted-and-still-pending is below max_bookings.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION promote_waitlist_next(
  p_slot_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry              RECORD;
  v_minutes             int;
  v_deadline            timestamptz;
  v_current_bookings    int;
  v_max_bookings        int;
  v_pending_promotions  int;
BEGIN
  -- Lock the slot row first so concurrent promotion attempts for the same
  -- slot serialize: the second caller blocks here until the first commits,
  -- then re-reads the up-to-date pending-promotion count.
  SELECT current_bookings, max_bookings
  INTO   v_current_bookings, v_max_bookings
  FROM   lesson_slots
  WHERE  id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_pending_promotions
  FROM   waitlist_entries
  WHERE  slot_id = p_slot_id
    AND  status  = 'promoted'
    AND  (reservation_deadline IS NULL OR reservation_deadline > now());

  IF v_current_bookings + v_pending_promotions >= v_max_bookings THEN
    RETURN NULL;
  END IF;

  SELECT we.*,
         COALESCE(
           (ar.config->>'reservation_deadline_minutes')::int,
           60
         ) AS cfg_deadline_minutes
  INTO v_entry
  FROM waitlist_entries we
  LEFT JOIN automation_rules ar
    ON  ar.organization_id = we.organization_id
    AND ar.rule_type        = 'waitlist_promotion'
    AND ar.enabled          = true
  WHERE we.slot_id = p_slot_id
    AND we.status  = 'waiting'
    AND (we.expires_at IS NULL OR we.expires_at > now())
  ORDER BY we.priority ASC, we.created_at ASC
  LIMIT 1
  FOR UPDATE OF we SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_minutes  := v_entry.cfg_deadline_minutes;
  v_deadline := now() + make_interval(mins := v_minutes);

  UPDATE waitlist_entries
  SET    status               = 'promoted',
         status_changed_at    = now(),
         reservation_deadline = v_deadline,
         updated_at           = now()
  WHERE  id = v_entry.id;

  PERFORM insert_outbox_event(
    p_event_type      := 'Waitlist.Promoted',
    p_channel         := 'internal',
    p_payload         := jsonb_build_object(
      'waitlist_entry_id',  v_entry.id,
      'slot_id',            p_slot_id,
      'student_id',         v_entry.student_id,
      'reservation_deadline', v_deadline
    ),
    p_organization_id := v_entry.organization_id,
    p_target_id       := v_entry.id::text
  );

  RETURN v_entry.id;
END;
$$;

COMMENT ON FUNCTION promote_waitlist_next IS
  'Promotes the highest-priority waiting entry for a slot, but only if the '
  'slot actually has free capacity (current_bookings + other pending, '
  'non-expired promotions < max_bookings). Locks the slot row first so '
  'concurrent calls for the same slot serialize correctly. '
  'Concurrency-safe via FOR UPDATE SKIP LOCKED on the waitlist entry itself. '
  'Publishes Waitlist.Promoted to event_outbox. '
  'Returns the promoted entry''s UUID, or NULL if the waitlist is empty or no capacity is free.';
