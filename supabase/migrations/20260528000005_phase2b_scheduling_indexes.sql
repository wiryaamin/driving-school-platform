-- =============================================================================
-- MIGRATION: 20260528000005_phase2b_scheduling_indexes.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2B — Scheduling Engine Indexes (Split 4 of 4)
-- Description:
--   Performance indexes for all 8 scheduling tables. Partial unique index for
--   booking_attendance (one active record per booking, allowing correction after
--   soft-delete). All partial indexes on soft-delete-enabled tables include
--   deleted_at IS NULL so deleted rows don't occupy the partial index.
--
--   Duplicate elimination vs. original monolith:
--   - Removed idx_lesson_slots_instructor_range (identical to _instructor_time)
--   - Removed idx_lesson_slots_vehicle_time (subset of _vehicle_range)
--
-- Execution order:
--   1. 20260528000002_phase2b_scheduling_core.sql
--   2. 20260528000003_phase2b_scheduling_rls.sql
--   3. 20260528000004_phase2b_scheduling_events.sql
--   4. 20260528000005_phase2b_scheduling_indexes.sql    ← this file
--
-- Design priorities (in order):
--   1. Calendar views      — instructor / student / vehicle schedule queries
--   2. Conflict detection  — overlap range scans for pre-flight checks
--   3. Booking management  — status, upcoming, no-show, rescheduling
--   4. Availability engine — rule + time-off lookups for slot generator
--   5. Dashboard ops       — daily aggregations, approval queues
--   6. Future integrations — Phase 3 payments, calendar sync, AI analytics
-- =============================================================================

-- =============================================================================
-- LESSON TYPES
-- No soft delete — partial indexes omit the deleted_at filter.
-- =============================================================================

-- Student booking UI: active types by category order
CREATE INDEX idx_lesson_types_org_active
  ON public.lesson_types (organization_id, category)
  WHERE is_active = true;

-- Admin catalog management: full list with display ordering
CREATE INDEX idx_lesson_types_org_order
  ON public.lesson_types (organization_id, display_order);

-- =============================================================================
-- INSTRUCTOR AVAILABILITY RULES
-- No soft delete on this table.
-- =============================================================================

-- Slot generator primary lookup: active rules per instructor and day
CREATE INDEX idx_availability_rules_instructor_day
  ON public.instructor_availability_rules (instructor_id, day_of_week)
  WHERE is_active = true;

-- Effective date range filter for the slot generator
CREATE INDEX idx_availability_rules_effective
  ON public.instructor_availability_rules (instructor_id, effective_from, effective_until)
  WHERE is_active = true;

-- Org-wide availability overview (manager / admin calendar)
CREATE INDEX idx_availability_rules_org
  ON public.instructor_availability_rules (organization_id, instructor_id)
  WHERE is_active = true;

-- =============================================================================
-- INSTRUCTOR TIME OFF
-- No soft delete on this table.
-- =============================================================================

-- Availability check hot path: approved time-off per instructor (overlap scans)
CREATE INDEX idx_time_off_instructor_approved
  ON public.instructor_time_off (instructor_id, starts_at, ends_at)
  WHERE status = 'approved';

-- Manager approval queue sorted by submission time
CREATE INDEX idx_time_off_org_pending
  ON public.instructor_time_off (organization_id, created_at DESC)
  WHERE status = 'pending';

-- Instructor portal: own time-off history
CREATE INDEX idx_time_off_instructor_all
  ON public.instructor_time_off (instructor_id, starts_at DESC);

-- =============================================================================
-- RECURRING SCHEDULE EXCEPTIONS
-- No soft delete on this table.
-- =============================================================================

-- Slot generator lookup: exceptions for a given rule on a specific date
CREATE INDEX idx_schedule_exceptions_rule_date
  ON public.recurring_schedule_exceptions (availability_rule_id, exception_date);

-- =============================================================================
-- LESSON SLOTS
-- Soft-delete enabled: all partial indexes include deleted_at IS NULL so
-- soft-deleted slots don't consume index space or appear in range scans.
-- =============================================================================

-- Instructor calendar view (primary hot path — conflict detection + calendar render)
CREATE INDEX idx_lesson_slots_instructor_time
  ON public.lesson_slots (instructor_id, starts_at, ends_at)
  WHERE status NOT IN ('cancelled') AND deleted_at IS NULL;

-- Vehicle schedule (fleet management view)
CREATE INDEX idx_lesson_slots_vehicle_range
  ON public.lesson_slots (vehicle_id, starts_at, ends_at)
  WHERE vehicle_id IS NOT NULL AND status NOT IN ('cancelled') AND deleted_at IS NULL;

-- Location-based calendar (multi-branch organisations)
CREATE INDEX idx_lesson_slots_location_time
  ON public.lesson_slots (location_id, starts_at)
  WHERE location_id IS NOT NULL AND status NOT IN ('cancelled') AND deleted_at IS NULL;

-- Student booking UI: open slots by org + lesson type + time
CREATE INDEX idx_lesson_slots_open_type
  ON public.lesson_slots (organization_id, lesson_type_id, starts_at)
  WHERE status = 'open' AND deleted_at IS NULL;

-- Daily operations dashboard: all active slots per org
CREATE INDEX idx_lesson_slots_org_date
  ON public.lesson_slots (organization_id, starts_at)
  WHERE status NOT IN ('cancelled') AND deleted_at IS NULL;

-- Slot provenance: find all slots generated from a given availability rule
CREATE INDEX idx_lesson_slots_availability_rule
  ON public.lesson_slots (availability_rule_id)
  WHERE availability_rule_id IS NOT NULL AND deleted_at IS NULL;

-- =============================================================================
-- LESSON BOOKINGS
-- Soft-delete enabled: partial indexes include deleted_at IS NULL.
-- =============================================================================

-- Student calendar view (portal primary query)
CREATE INDEX idx_lesson_bookings_student_time
  ON public.lesson_bookings (student_id, starts_at)
  WHERE status NOT IN ('cancelled', 'rescheduled') AND deleted_at IS NULL;

-- Instructor booking list
CREATE INDEX idx_lesson_bookings_instructor_time
  ON public.lesson_bookings (instructor_id, starts_at)
  WHERE status NOT IN ('cancelled', 'rescheduled') AND deleted_at IS NULL;

-- Upcoming confirmed bookings (reminder / notification jobs)
CREATE INDEX idx_lesson_bookings_org_confirmed
  ON public.lesson_bookings (organization_id, starts_at)
  WHERE status = 'confirmed' AND deleted_at IS NULL;

-- Slot capacity check: active bookings per slot (backs counter trigger)
CREATE INDEX idx_lesson_bookings_slot_active
  ON public.lesson_bookings (slot_id)
  WHERE status NOT IN ('cancelled', 'rescheduled', 'no_show') AND deleted_at IS NULL;

-- No-show tracking dashboard
CREATE INDEX idx_lesson_bookings_no_show
  ON public.lesson_bookings (organization_id, no_show_marked_at DESC)
  WHERE status = 'no_show' AND deleted_at IS NULL;

-- Rescheduling lineage traversal
CREATE INDEX idx_lesson_bookings_rescheduled_from
  ON public.lesson_bookings (rescheduled_from_id)
  WHERE rescheduled_from_id IS NOT NULL;

-- Phase 3: unpaid confirmed bookings for payment processing batch job
CREATE INDEX idx_lesson_bookings_unpaid_confirmed
  ON public.lesson_bookings (organization_id, created_at)
  WHERE status = 'confirmed' AND payment_status = 'unpaid' AND deleted_at IS NULL;

-- Conflict detection: student overlap range scans (backs pre-flight check helper)
CREATE INDEX idx_lesson_bookings_student_range
  ON public.lesson_bookings (student_id, starts_at, ends_at)
  WHERE status NOT IN ('cancelled', 'no_show', 'rescheduled') AND deleted_at IS NULL;

-- =============================================================================
-- BOOKING ATTENDANCE
-- Soft-delete enabled. One active attendance record per booking is enforced by
-- the partial unique index below (replaces the inline UNIQUE defined in core).
-- A soft-deleted record can be corrected by soft-deleting and inserting a new one.
-- =============================================================================

-- Partial unique: one active (non-deleted) attendance record per booking
CREATE UNIQUE INDEX booking_attendance_active_uniq
  ON public.booking_attendance (booking_id)
  WHERE deleted_at IS NULL;

-- Most frequent access: fetch attendance for a specific booking
CREATE INDEX idx_booking_attendance_booking
  ON public.booking_attendance (booking_id)
  WHERE deleted_at IS NULL;

-- AI analytics: performance-rated sessions per student over time
CREATE INDEX idx_booking_attendance_student_rating
  ON public.booking_attendance (student_id, recorded_at DESC)
  WHERE performance_rating IS NOT NULL AND deleted_at IS NULL;

-- Org-level attendance analytics and reporting
CREATE INDEX idx_booking_attendance_org_date
  ON public.booking_attendance (organization_id, recorded_at DESC)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- BOOKING NOTES
-- Soft-delete enabled: only active notes in partial indexes.
-- =============================================================================

-- All active notes for a booking (most common read pattern)
CREATE INDEX idx_booking_notes_booking
  ON public.booking_notes (booking_id)
  WHERE deleted_at IS NULL;

-- Student-visible notes only (portal query optimisation)
CREATE INDEX idx_booking_notes_booking_public
  ON public.booking_notes (booking_id)
  WHERE is_internal = false AND deleted_at IS NULL;
