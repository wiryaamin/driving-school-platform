-- =============================================================================
-- MIGRATION: 20260528000004_phase2b_scheduling_events.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2B — Scheduling Engine Events (Split 3 of 4)
-- Description:
--   Event outbox emission triggers for all scheduling lifecycle changes.
--   Payloads include ends_at, location_id, and lesson_type_id fields added for
--   Google/Outlook calendar sync and notification worker compatibility.
--   slot.created vs slot.generated are distinguished by generation_source so
--   the future slot generator Edge Function emits a semantically distinct event.
--
-- Execution order:
--   1. 20260528000002_phase2b_scheduling_core.sql
--   2. 20260528000003_phase2b_scheduling_rls.sql
--   3. 20260528000004_phase2b_scheduling_events.sql    ← this file
--   4. 20260528000005_phase2b_scheduling_indexes.sql
--
-- Dependencies:
--   20260527000002_phase1b2_hardening.sql — insert_outbox_event(), event_channel enum
--   20260528000002_phase2b_scheduling_core.sql — lesson_slots, lesson_bookings,
--     instructor_time_off tables
--
-- Event type catalogue (all satisfy '^[a-z_]+\.[a-z_]+$'):
--   booking.created        — new active booking inserted
--   booking.cancelled      — booking status → cancelled
--   booking.completed      — booking status → completed
--   booking.no_show        — booking status → no_show
--   slot.created           — new slot created manually (generation_source = 'manual')
--   slot.generated         — new slot materialised by slot generator or imported
--                            (generation_source = 'recurring' | 'imported')
--   slot.cancelled         — slot status → cancelled
--   instructor.unavailable — instructor time-off status → approved
--
-- Downstream consumers:
--   booking.*          → confirmation/reminder/cancellation emails + SMS
--   booking.completed  → prompt instructor to record attendance
--   booking.no_show    → no-show follow-up, potential fee logic
--   slot.generated     → cache invalidation, student notification of new availability
--   slot.cancelled     → notify affected students, reschedule prompts
--   instructor.unavailable → alert managers; slot generator skips window
-- Future consumers:
--   slot.created / slot.generated → Google / Outlook calendar sync
--   booking.*                     → AI scheduling optimisation pipeline
-- =============================================================================

-- =============================================================================
-- BOOKING LIFECYCLE EVENTS
-- Fires on INSERT (booking.created) and UPDATE OF status
-- (booking.cancelled | booking.completed | booking.no_show).
-- =============================================================================

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
  'for calendar sync and notification worker compatibility.';

CREATE TRIGGER trg_lesson_bookings_emit_events
  AFTER INSERT OR UPDATE OF status ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.emit_booking_status_changed();

-- =============================================================================
-- SLOT LIFECYCLE EVENTS
-- slot.created   — staff-created manual slot (generation_source = 'manual')
-- slot.generated — recurring or imported slot (generation_source IN recurring|imported)
--                  Future: consumed by Google/Outlook calendar sync worker and
--                  student availability-notification service.
-- slot.cancelled — any slot cancellation
-- =============================================================================

CREATE OR REPLACE FUNCTION public.emit_slot_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN

    IF NEW.generation_source = 'manual' THEN
      -- Staff-created slot: emit slot.created for immediate downstream use
      PERFORM public.insert_outbox_event(
        'slot.created',
        'internal',
        jsonb_build_object(
          'slot_id',           NEW.id,
          'organization_id',   NEW.organization_id,
          'instructor_id',     NEW.instructor_id,
          'lesson_type_id',    NEW.lesson_type_id,
          'location_id',       NEW.location_id,
          'starts_at',         NEW.starts_at,
          'ends_at',           NEW.ends_at,
          'generation_source', NEW.generation_source
        ),
        NEW.organization_id
      );
    ELSE
      -- Recurring or imported slot: emit slot.generated for calendar sync /
      -- student availability notifications. generation_source tells the consumer
      -- whether this came from the internal slot generator ('recurring') or an
      -- external calendar import ('imported').
      PERFORM public.insert_outbox_event(
        'slot.generated',
        'internal',
        jsonb_build_object(
          'slot_id',             NEW.id,
          'organization_id',     NEW.organization_id,
          'instructor_id',       NEW.instructor_id,
          'lesson_type_id',      NEW.lesson_type_id,
          'location_id',         NEW.location_id,
          'starts_at',           NEW.starts_at,
          'ends_at',             NEW.ends_at,
          'generation_source',   NEW.generation_source,
          'availability_rule_id', NEW.availability_rule_id
        ),
        NEW.organization_id
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'cancelled' THEN
      PERFORM public.insert_outbox_event(
        'slot.cancelled',
        'internal',
        jsonb_build_object(
          'slot_id',         NEW.id,
          'organization_id', NEW.organization_id,
          'instructor_id',   NEW.instructor_id,
          'lesson_type_id',  NEW.lesson_type_id,
          'location_id',     NEW.location_id,
          'starts_at',       NEW.starts_at,
          'ends_at',         NEW.ends_at,
          'cancelled_by',    NEW.updated_by
        ),
        NEW.organization_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.emit_slot_status_changed IS
  'Emits slot.created (manual INSERT), slot.generated (recurring/imported INSERT), '
  'slot.cancelled (UPDATE status → cancelled). '
  'slot.generated carries availability_rule_id for the future slot generator consumer. '
  'All payloads include ends_at and location_id for calendar sync compatibility.';

CREATE TRIGGER trg_lesson_slots_emit_events
  AFTER INSERT OR UPDATE OF status ON public.lesson_slots
  FOR EACH ROW EXECUTE FUNCTION public.emit_slot_status_changed();

-- =============================================================================
-- INSTRUCTOR UNAVAILABILITY EVENT
-- Emitted when a time-off request transitions to 'approved'.
-- Downstream:
--   • Alerts managers to existing slots in the blocked window.
--   • Signals the slot generator to skip the window for future dates.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.emit_instructor_unavailable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved' THEN
    PERFORM public.insert_outbox_event(
      'instructor.unavailable',
      'internal',
      jsonb_build_object(
        'time_off_id',     NEW.id,
        'organization_id', NEW.organization_id,
        'instructor_id',   NEW.instructor_id,
        'time_off_type',   NEW.time_off_type,
        'starts_at',       NEW.starts_at,
        'ends_at',         NEW.ends_at,
        'is_full_day',     NEW.is_full_day,
        'approved_by',     NEW.approved_by
      ),
      NEW.organization_id
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.emit_instructor_unavailable IS
  'Emits instructor.unavailable when time-off status transitions to ''approved''. '
  'is_full_day included so notification workers can render appropriate messaging. '
  'Downstream: manager alerts + slot generator cache invalidation.';

CREATE TRIGGER trg_instructor_time_off_unavailable
  AFTER UPDATE OF status ON public.instructor_time_off
  FOR EACH ROW EXECUTE FUNCTION public.emit_instructor_unavailable();
