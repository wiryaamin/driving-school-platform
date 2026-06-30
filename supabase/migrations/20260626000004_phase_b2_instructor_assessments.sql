-- ─── Phase B-2: Instructor Student Assessments ────────────────────────────────
-- Persists per-instructor per-student competency ratings and readiness
-- assessments. Replaces browser localStorage used by InstructorPortalUtbildningskortPage.

CREATE TABLE public.instructor_student_assessments (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,
  instructor_id    uuid        NOT NULL,
  student_id       uuid        NOT NULL,
  competencies     jsonb       NOT NULL DEFAULT '{}',
  readiness        jsonb       NOT NULL DEFAULT '{}',
  notes            text,
  assessed_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT instructor_student_assessments_pkey         PRIMARY KEY (id),
  CONSTRAINT instructor_student_assessments_org_fkey     FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT instructor_student_assessments_instr_fkey   FOREIGN KEY (instructor_id)
    REFERENCES public.instructors(id) ON DELETE CASCADE,
  CONSTRAINT instructor_student_assessments_student_fkey FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT instructor_student_assessments_unique
    UNIQUE (instructor_id, student_id)
);

COMMENT ON TABLE  public.instructor_student_assessments IS
  'Instructor-rated competency and readiness assessments per student. '
  'One row per (instructor, student) pair — updated in-place via upsert.';
COMMENT ON COLUMN public.instructor_student_assessments.competencies IS
  'JSONB map of competency_key → status (not_started|in_progress|mastered|needs_more).';
COMMENT ON COLUMN public.instructor_student_assessments.readiness IS
  'JSONB map of milestone → boolean (risk1, risk2, theory, practical).';

CREATE TRIGGER instructor_student_assessments_set_updated_at
  BEFORE UPDATE ON public.instructor_student_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.instructor_student_assessments ENABLE ROW LEVEL SECURITY;

-- Instructors can read their own assessments
CREATE POLICY "isa_select_instructor"
  ON public.instructor_student_assessments FOR SELECT
  USING (
    organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    AND instructor_id::text = (current_setting('request.jwt.claims', true)::jsonb->>'sub')
  );

-- Staff with scheduling:read can see all assessments in their org
CREATE POLICY "isa_select_staff"
  ON public.instructor_student_assessments FOR SELECT
  USING (
    organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    AND public.has_permission('scheduling:slot:read')
  );

-- Platform admins can read all
CREATE POLICY "isa_select_platform"
  ON public.instructor_student_assessments FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::jsonb->>'is_platform_admin')::boolean = true
  );

CREATE INDEX instructor_student_assessments_instructor_idx
  ON public.instructor_student_assessments (instructor_id, organization_id);

CREATE INDEX instructor_student_assessments_student_idx
  ON public.instructor_student_assessments (student_id, organization_id);
