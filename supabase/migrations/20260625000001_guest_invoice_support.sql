-- Allow walk-in / guest purchases at Kassa without a registered student.
-- invoices.student_id and payments.student_id are made nullable so that
-- cash register sales to anonymous customers can be recorded.
-- Existing records are unaffected (all have non-null values today).

ALTER TABLE public.invoices ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE public.payments ALTER COLUMN student_id DROP NOT NULL;

-- Tag guest invoices so they can be filtered/reported separately
COMMENT ON COLUMN public.invoices.student_id IS
  'NULL for anonymous walk-in / guest purchases recorded at Kassa. '
  'Non-null for all student-linked invoices.';

COMMENT ON COLUMN public.payments.student_id IS
  'NULL for payments against guest (anonymous) invoices. '
  'Non-null for all student-linked payments.';
