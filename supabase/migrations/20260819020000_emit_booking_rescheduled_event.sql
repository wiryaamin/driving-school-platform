-- ════════════════════════════════════════════════════════════════════════════
-- Fix: booking reschedules never emitted an outbox event
--
-- emit_booking_status_changed() (20260528000004, last redefined 20260728000008)
-- emits booking.created / booking.cancelled / booking.completed / booking.no_show,
-- but has no branch for a reschedule's replacement booking. event-worker already
-- registers a handler for this exact case (HANDLER_REGISTRY['Lesson.Rescheduled']
-- = handleLessonRescheduled, reading payload.old_booking_id / payload.new_booking_id
-- to reschedule reminders and dispatch the booking_rescheduled notification to the
-- student and — as of the Guardian Portal P0 migration — every linked guardian),
-- but nothing has ever inserted a 'Lesson.Rescheduled' outbox event, so that
-- handler has been dead code since it was added. Found via live E2E verification
-- of the Guardian Portal P0 rescheduling-notification path.
--
-- Both booking_id values are only simultaneously known at the moment the
-- replacement booking is INSERTed (bookings/index.ts's handleReschedule and
-- student-portal/index.ts's reschedule route both: 1) UPDATE the old booking's
-- status to 'rescheduled' — no new-booking id exists yet at that point — then
-- 2) INSERT the replacement booking with rescheduled_from_id set to the old
-- booking's id). So the new branch below lives in the INSERT arm, keyed off
-- NEW.rescheduled_from_id IS NOT NULL, additive to the existing booking.created
-- emission for that same INSERT (left untouched — student/instructor-facing
-- behavior driven by booking.created is unrelated to this fix and must not change).
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

    -- This INSERT is the replacement half of a reschedule (both the old and
    -- new booking ids are only known here) — additionally emit the event
    -- event-worker's handleLessonRescheduled already listens for.
    IF NEW.rescheduled_from_id IS NOT NULL THEN
      PERFORM public.insert_outbox_event(
        'Lesson.Rescheduled',
        'internal',
        jsonb_build_object(
          'old_booking_id',  NEW.rescheduled_from_id,
          'new_booking_id',  NEW.id,
          'organization_id', NEW.organization_id
        ),
        NEW.organization_id
      );
    END IF;

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
          'ends_at',                NEW.ends_at,
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
  'booking.no_show (UPDATE OF status), and Lesson.Rescheduled (INSERT where '
  'rescheduled_from_id is set, i.e. the replacement half of a reschedule) to '
  'event_outbox for calendar sync and notification worker compatibility. '
  'booking.cancelled and booking.completed also include slot_id, required by '
  'event-worker''s handleLessonCancelled for waitlist re-promotion.';
