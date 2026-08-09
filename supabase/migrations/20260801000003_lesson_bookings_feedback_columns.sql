-- ════════════════════════════════════════════════════════════════════════════
-- lesson_bookings — post-lesson feedback columns
--
-- bookings/index.ts's handleFeedback (POST /bookings/:id/feedback) and the
-- instructor-app module (SlotCard's star rating, useSetBookingFeedback,
-- useStudentSummary, useInstructorStats) have always read and written
-- performance_rating / instructor_notes on lesson_bookings, but the columns
-- were never actually migrated in — every call to this endpoint has failed
-- with "column does not exist" since the feature was built. Adding the two
-- columns the existing, already-shipped code already expects; no application
-- code changes needed.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.lesson_bookings
  ADD COLUMN performance_rating smallint,
  ADD COLUMN instructor_notes   text;

ALTER TABLE public.lesson_bookings
  ADD CONSTRAINT lesson_bookings_performance_rating_check
    CHECK (performance_rating IS NULL OR (performance_rating BETWEEN 1 AND 5)),
  ADD CONSTRAINT lesson_bookings_instructor_notes_length_check
    CHECK (instructor_notes IS NULL OR char_length(instructor_notes) <= 2000);

COMMENT ON COLUMN public.lesson_bookings.performance_rating IS
  'Instructor''s 1-5 star rating of the student''s performance in this lesson, set via POST /bookings/:id/feedback. Only settable on completed or no_show bookings.';
COMMENT ON COLUMN public.lesson_bookings.instructor_notes IS
  'Instructor''s free-text note about this lesson, set via POST /bookings/:id/feedback.';
