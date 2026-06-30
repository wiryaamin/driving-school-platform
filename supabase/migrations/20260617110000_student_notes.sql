-- Sprint 10 Gap I: Add notes column to students

ALTER TABLE students ADD COLUMN IF NOT EXISTS notes TEXT;
