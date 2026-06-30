-- rc1: WP4 — Persistent student ↔ corporate customer relationship.
-- Nullable FK; SET NULL on company archive preserves student record integrity.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS corporate_customer_id uuid
      REFERENCES public.corporate_customers(id)
      ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_corporate_customer_id
  ON public.students(corporate_customer_id)
  WHERE corporate_customer_id IS NOT NULL;
