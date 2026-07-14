-- Epic 2.5 additive: add category to the Baseline student_notes table.
-- The student_notes table was fully defined in Phase 2A (20260528000001).
-- This migration only extends it with a classification column.

ALTER TABLE public.student_notes
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','instructional','medical','administrative','behavioral','other'));
