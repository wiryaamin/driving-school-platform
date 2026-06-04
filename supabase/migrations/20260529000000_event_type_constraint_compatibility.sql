-- ============================================================================
-- Phase: Event Type Constraint Compatibility
-- Execution order: must run BEFORE 20260529000001_phase3d_notifications.sql
-- ============================================================================
--
-- PROBLEM
-- -------
-- Phase 1B.2 introduced event_outbox_type_format:
--
--   CHECK (event_type ~ '^[a-z_]+\.[a-z_]+$')
--
-- This allows only lowercase letters and underscores on both sides of the dot.
-- It was correct for Phase 2B's booking-domain events (booking.created, etc.).
--
-- Starting in Phase 3D, event types follow PascalCase domain-event convention:
--   Waitlist.Promoted, Reservation.Expired, Credit.Granted, Invoice.Paid, ...
--
-- This matches the event-worker HANDLER_REGISTRY naming convention throughout
-- the codebase. All 6 Phase 4A SECURITY DEFINER functions would fail at runtime
-- without this fix.
--
-- FIX
-- ---
-- Replace the constraint with a regex that accepts BOTH conventions:
--
--   ^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$
--
-- COMPATIBILITY MATRIX
-- --------------------
-- Event type              Phase   Old regex   New regex
-- ----------------------  ------  ----------  ---------
-- booking.created         2B      PASS        PASS
-- booking.cancelled       2B      PASS        PASS
-- slot.created            2B      PASS        PASS
-- slot.generated          2B      PASS        PASS
-- instructor.unavailable  2B      PASS        PASS
-- Waitlist.Promoted       3D      FAIL        PASS
-- Reservation.Expired     3D      FAIL        PASS
-- Package.Purchased       4A      FAIL        PASS
-- Invoice.Issued          4A      FAIL        PASS
-- Invoice.Voided          4A      FAIL        PASS
-- Invoice.Paid            4A      FAIL        PASS
-- Payment.Received        4A      FAIL        PASS
-- Credit.Granted          4A      FAIL        PASS
-- Credit.Consumed         4A      FAIL        PASS
-- Credit.Expired          4A      FAIL        PASS
-- Student.Created         3B      FAIL        PASS
-- Lesson.Created          3C      FAIL        PASS
--
-- CORRECTLY REJECTED by new regex (same as old):
--   .booking.created   (leading dot)
--   booking.           (trailing dot)
--   booking..created   (double dot)
--   1.created          (leading digit)
--   booking            (no dot at all)
-- ============================================================================

ALTER TABLE public.event_outbox
  DROP CONSTRAINT IF EXISTS event_outbox_type_format;

ALTER TABLE public.event_outbox
  ADD CONSTRAINT event_outbox_type_format
  CHECK (event_type ~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$');
