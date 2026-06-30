-- Migration: Add commercial_status to students
-- Sprint 1: Commercial Status Foundation
--
-- Adds a new nullable enum column that tracks a student's commercial lifecycle
-- independently of the existing operational status column.
-- The column is nullable; a backfill script (run post-migration) populates
-- existing rows. New rows created before the backfill runs will have NULL,
-- which the frontend renders as a neutral "–" state.

-- ─────────────────────────────────────────────────────────────────
-- 1. Enum type
-- ─────────────────────────────────────────────────────────────────
CREATE TYPE public.student_commercial_status AS ENUM (
  'operationally_registered',
  'aktiverad_ej_fakturerad',
  'awaiting_payment',
  'partially_paid',
  'commercially_active',
  'package_exhausted',
  'package_expired',
  'training_complete',
  'archived'
);

-- ─────────────────────────────────────────────────────────────────
-- 2. Column on students table
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.students
  ADD COLUMN commercial_status public.student_commercial_status NULL;

-- ─────────────────────────────────────────────────────────────────
-- 3. Index — supports dashboard count query and future list filtering
-- Note: CONCURRENTLY omitted — migrations run inside a transaction.
-- The column is all-NULL at this point so index build is negligible.
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_commercial_status
  ON public.students (organization_id, commercial_status)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 4. Comment
-- ─────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.students.commercial_status IS
  'Commercial lifecycle status, separate from operational status. '
  'Populated by backfill after migration. NULL = not yet classified.';
