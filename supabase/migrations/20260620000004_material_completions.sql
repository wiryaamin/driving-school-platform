-- Per-student training material completion tracking.
--
-- Students mark materials as completed via the student portal (service_role bypass).
-- Org members with students:student:read can query completion counts for admin views.

CREATE TABLE student_material_completions (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES organizations(id)        ON DELETE CASCADE,
  student_id      uuid        NOT NULL REFERENCES students(id)             ON DELETE CASCADE,
  material_id     uuid        NOT NULL REFERENCES training_materials(id)   ON DELETE CASCADE,
  completed_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_id, material_id)
);

CREATE INDEX smc_by_material ON student_material_completions (organization_id, material_id);
CREATE INDEX smc_by_student  ON student_material_completions (organization_id, student_id);

ALTER TABLE student_material_completions ENABLE ROW LEVEL SECURITY;

-- Admins can read all completions in their org (for analytics / progress views).
CREATE POLICY "smc_read"
  ON student_material_completions FOR SELECT
  USING (
    organization_id = auth_organization_id()
    AND has_permission('students:student:read')
  );

-- Student portal uses service_role key and bypasses RLS — no student-facing RLS needed.
GRANT SELECT ON student_material_completions TO authenticated;
GRANT ALL    ON student_material_completions TO service_role;
