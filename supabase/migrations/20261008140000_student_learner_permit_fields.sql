-- Körkortstillstånd (learner permit) on the Elevkort: group, expiry date and
-- a staff note. Additive and nullable — existing rows and callers unaffected;
-- the students table's existing RLS policies cover the new columns.
--
-- Deliberately separate from StudentForm's permit_group/permit_expiry_date
-- form fields, which use licence-category values (B, A, C…) rather than
-- Trafikverket permit groups and are not persisted.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS learner_permit_group      text
    CHECK (learner_permit_group IN ('grupp1', 'grupp2')),
  ADD COLUMN IF NOT EXISTS learner_permit_expires_on date,
  ADD COLUMN IF NOT EXISTS learner_permit_note       text
    CHECK (char_length(learner_permit_note) <= 2000);

COMMENT ON COLUMN public.students.learner_permit_group      IS 'Körkortstillstånd group: grupp1 (AM, A1, A2, A, B, BE) or grupp2 (C, CE, D, DE).';
COMMENT ON COLUMN public.students.learner_permit_expires_on IS 'Körkortstillstånd expiry date (giltigt t.o.m.).';
COMMENT ON COLUMN public.students.learner_permit_note       IS 'Staff note about the körkortstillstånd.';
