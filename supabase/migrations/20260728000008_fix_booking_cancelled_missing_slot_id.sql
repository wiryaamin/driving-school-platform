-- ════════════════════════════════════════════════════════════════════════════
-- Fix: booking.cancelled event payload was missing slot_id
--
-- emit_booking_status_changed() (20260528000004) includes slot_id in
-- booking.created and booking.completed payloads, but the booking.cancelled
-- branch omitted it — a simple copy/paste gap, not a design choice (every
-- sibling branch that needs slot-level effects has it). Found via live pilot
-- simulation: cancelling a confirmed lesson never re-offered the freed slot
-- to the next waitlist entry, and the student's own cancellation
-- notification was missing the lesson date/time — both because
-- handleLessonCancelled (event-worker) reads event.payload['slot_id'] and
-- got undefined every time.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.emit_booking_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- booking.created on INSERT for any active initial status.
  -- Draft bookings are not emitted (pending staff confirmation).
  IF TG_OP = 'INSERT'
     AND NEW.status NOT IN ('draft', 'cancelled', 'rescheduled')
  THEN
    PERFORM public.insert_outbox_event(
      'booking.created',
      'internal',
      jsonb_build_object(
        'booking_id',      NEW.id,
        'organization_id', NEW.organization_id,
        'student_id',      NEW.student_id,
        'instructor_id',   NEW.instructor_id,
        'slot_id',         NEW.slot_id,
        'lesson_type_id',  NEW.lesson_type_id,
        'location_id',     NEW.location_id,
        'starts_at',       NEW.starts_at,
        'ends_at',         NEW.ends_at,
        'status',          NEW.status,
        'booked_by',       NEW.booked_by
      ),
      NEW.organization_id
    );
    RETURN NEW;
  END IF;

  -- Status-change events on UPDATE.
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN

    IF NEW.status = 'cancelled' THEN
      PERFORM public.insert_outbox_event(
        'booking.cancelled',
        'internal',
        jsonb_build_object(
          'booking_id',            NEW.id,
          'organization_id',       NEW.organization_id,
          'student_id',            NEW.student_id,
          'instructor_id',         NEW.instructor_id,
          'slot_id',               NEW.slot_id,
          'lesson_type_id',        NEW.lesson_type_id,
          'location_id',           NEW.location_id,
          'starts_at',             NEW.starts_at,
          'ends_at',               NEW.ends_at,
          'cancelled_by',          NEW.cancelled_by,
          'cancellation_reason',   NEW.cancellation_reason,
          'cancellation_category', NEW.cancellation_category
        ),
        NEW.organization_id
      );

    ELSIF NEW.status = 'completed' THEN
      PERFORM public.insert_outbox_event(
        'booking.completed',
        'internal',
        jsonb_build_object(
          'booking_id',      NEW.id,
          'organization_id', NEW.organization_id,
          'student_id',      NEW.student_id,
          'instructor_id',   NEW.instructor_id,
          'slot_id',         NEW.slot_id,
          'lesson_type_id',  NEW.lesson_type_id,
          'location_id',     NEW.location_id,
          'starts_at',       NEW.starts_at,
          'ends_at',         NEW.ends_at
        ),
        NEW.organization_id
      );

    ELSIF NEW.status = 'no_show' THEN
      PERFORM public.insert_outbox_event(
        'booking.no_show',
        'internal',
        jsonb_build_object(
          'booking_id',        NEW.id,
          'organization_id',   NEW.organization_id,
          'student_id',        NEW.student_id,
          'instructor_id',     NEW.instructor_id,
          'lesson_type_id',    NEW.lesson_type_id,
          'starts_at',         NEW.starts_at,
          'ends_at',           NEW.ends_at,
          'no_show_marked_by', NEW.no_show_marked_by,
          'no_show_marked_at', NEW.no_show_marked_at
        ),
        NEW.organization_id
      );

    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.emit_booking_status_changed IS
  'Emits booking.created (INSERT, non-draft), booking.cancelled, booking.completed, '
  'booking.no_show (UPDATE OF status). All payloads include ends_at and location_id '
  'for calendar sync and notification worker compatibility. booking.cancelled and '
  'booking.completed also include slot_id, required by event-worker''s '
  'handleLessonCancelled for waitlist re-promotion.';
