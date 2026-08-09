-- =============================================================================
-- MIGRATION: 20260720000009_fix_booking_rebook_after_cancel.sql
-- Description:
--   Sprint 4I operational validation (Pilot Validation Tenant, receptionist
--   login) found that a student who cancels a booking can never be
--   re-booked into that same slot again — POST /bookings returns 409
--   "Student already has a booking for this slot" even though the slot
--   shows 0/1 bookings and is otherwise fully available.
--
--   Root cause: lesson_bookings has two constraints with contradictory
--   intent.
--     1. lesson_bookings_student_no_overlap (EXCLUDE USING gist, added via
--        ALTER TABLE later in the same original migration) is explicitly
--        scoped WHERE status NOT IN ('cancelled','no_show','rescheduled')
--        AND deleted_at IS NULL — the comment above it and the
--        check_student_booking_availability() RPC both describe this as
--        the "authoritative conflict guard," deliberately freeing up a
--        cancelled row's time window for rebooking.
--     2. lesson_bookings_slot_student_uniq (a plain UNIQUE(slot_id,
--        student_id), defined inline on the original CREATE TABLE) has no
--        such scoping — it treats the (slot_id, student_id) pair as
--        permanently taken by the first row ever inserted, regardless of
--        that row's status. This constraint was never updated when the
--        EXCLUDE constraint was added as the intended authoritative guard,
--        so it silently reintroduces exactly the blocking behavior the
--        EXCLUDE constraint's WHERE clause was written to avoid.
--
--   Fix: replace the unscoped UNIQUE constraint with a partial unique
--   index using the same WHERE predicate as the EXCLUDE constraint, so a
--   student can be re-booked into a slot they previously cancelled out of,
--   while still preventing two simultaneously-active bookings of the same
--   student in the same slot.
-- =============================================================================

ALTER TABLE public.lesson_bookings
  DROP CONSTRAINT lesson_bookings_slot_student_uniq;

CREATE UNIQUE INDEX lesson_bookings_slot_student_active_uniq
  ON public.lesson_bookings (slot_id, student_id)
  WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled') AND deleted_at IS NULL);
