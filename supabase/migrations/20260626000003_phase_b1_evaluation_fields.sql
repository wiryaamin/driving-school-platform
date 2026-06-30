-- ─── Phase B-1: Lesson Evaluation Fields on booking_attendance ────────────────
-- Adds four text columns to booking_attendance so instructors can persist
-- lesson evaluations to the backend instead of browser localStorage.

ALTER TABLE public.booking_attendance
  ADD COLUMN IF NOT EXISTS evaluation_outcome        text,
  ADD COLUMN IF NOT EXISTS evaluation_strengths      text,
  ADD COLUMN IF NOT EXISTS evaluation_improvements   text,
  ADD COLUMN IF NOT EXISTS evaluation_recommendation text;

COMMENT ON COLUMN public.booking_attendance.evaluation_outcome        IS 'What was covered and how it went (freetext).';
COMMENT ON COLUMN public.booking_attendance.evaluation_strengths      IS 'What the student did well (freetext).';
COMMENT ON COLUMN public.booking_attendance.evaluation_improvements   IS 'Areas that need more practice (freetext).';
COMMENT ON COLUMN public.booking_attendance.evaluation_recommendation IS 'Instructor recommendation for the next lesson (freetext).';
