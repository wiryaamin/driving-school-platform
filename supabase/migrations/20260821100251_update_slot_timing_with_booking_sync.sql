-- =============================================================================
-- Scheduling — Admin-Friendly Booking: atomic slot + booking timing sync
--
-- lesson_bookings.starts_at/ends_at are denormalised from the owning slot,
-- but only by a BEFORE INSERT trigger (lesson_booking_set_slot_fields,
-- 20260528000002) — there was never an UPDATE-time equivalent. Changing a
-- booked slot's timing via PATCH /slots/:id (already existed) silently left
-- the booking's own copy stale: wrong time shown everywhere that reads the
-- booking directly (cancellation-deadline checks, no-show timing, student/
-- guardian portals, notifications).
--
-- This function does both updates in one transaction — the standard
-- SECURITY DEFINER pattern already used for other consistency-critical
-- multi-row mutations in this schema (consume_lesson_credit,
-- reverse_lesson_credit) — so a booking-side conflict (e.g. the student's
-- own EXCLUDE constraint, lesson_bookings_student_no_overlap, firing because
-- the new time overlaps another lesson that same student already has) rolls
-- back the slot change too, instead of leaving slot and booking disagreeing.
--
-- Duration/instructor/vehicle validation stays in slots/index.ts (application
-- layer, clear Swedish messages) exactly as it already does for every other
-- slot mutation — this function only performs the writes once the caller has
-- already validated everything it can.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_slot_timing_with_booking_sync(
  p_slot_id         uuid,
  p_organization_id uuid,
  p_starts_at       timestamptz,
  p_ends_at         timestamptz,
  p_actor_id        uuid
)
RETURNS public.lesson_slots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot public.lesson_slots;
BEGIN
  UPDATE public.lesson_slots
  SET starts_at  = p_starts_at,
      ends_at    = p_ends_at,
      updated_by = p_actor_id
  WHERE id = p_slot_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
  RETURNING * INTO v_slot;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot % not found', p_slot_id USING ERRCODE = 'P0002';
  END IF;

  -- Only active (not cancelled/no_show/rescheduled/soft-deleted) bookings on
  -- this slot need their denormalised copy kept in sync — a terminal
  -- booking's historical record should not be silently rewritten.
  UPDATE public.lesson_bookings
  SET starts_at  = p_starts_at,
      ends_at    = p_ends_at,
      updated_by = p_actor_id
  WHERE slot_id = p_slot_id
    AND organization_id = p_organization_id
    AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
    AND deleted_at IS NULL;

  RETURN v_slot;
END;
$$;

COMMENT ON FUNCTION public.update_slot_timing_with_booking_sync IS
  'Atomically updates a slot''s starts_at/ends_at and every active booking on '
  'it, so the two can never disagree. A student-overlap conflict on the '
  'booking side (lesson_bookings_student_no_overlap) rolls back the slot '
  'change too. Called only from slots/index.ts handleUpdate, after the '
  'existing duration/instructor/vehicle-availability checks have already run.';

GRANT EXECUTE ON FUNCTION public.update_slot_timing_with_booking_sync TO authenticated;
