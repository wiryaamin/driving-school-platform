-- ════════════════════════════════════════════════════════════════════════════
-- Fix: Student.Created was never actually emitted
--
-- event-worker's HANDLER_REGISTRY has always had a 'Student.Created' entry
-- (handleStudentCreated, which queues the 'student.welcome' internal
-- notification), but no trigger or application code ever called
-- insert_outbox_event() for it — students/index.ts only logged the string
-- 'Student.Created' via logger.info(), which looks like an event emission
-- but isn't one. Found via live pilot simulation: converting a lead to a
-- student (a direct client-side insert, bypassing the students edge
-- function entirely) surfaced that no student, through any creation path,
-- has ever received a welcome notification.
--
-- Fix: a DB trigger on students AFTER INSERT, mirroring the existing
-- pattern used for bookings/time-off/instructor events elsewhere in this
-- schema — it fires regardless of which code path performed the insert
-- (edge function or direct client insert), so it also covers the lead
-- conversion path without needing a second, duplicate fix there.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.emit_student_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.insert_outbox_event(
    'Student.Created',
    'internal',
    jsonb_build_object(
      'student_id',      NEW.id,
      'organization_id', NEW.organization_id,
      'first_name',      NEW.first_name,
      'last_name',       NEW.last_name,
      'status',          NEW.status
    ),
    NEW.organization_id
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.emit_student_created IS
  'Emits Student.Created on every students INSERT (any path — edge function or '
  'direct client insert). Consumed by event-worker''s handleStudentCreated, '
  'which queues the student.welcome internal notification.';

CREATE TRIGGER trg_students_created
  AFTER INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.emit_student_created();
