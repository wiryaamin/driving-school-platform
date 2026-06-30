-- Sprint 9 Gap G: Student T&C acceptance tracking via student portal

CREATE TABLE student_terms_acceptances (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id      uuid        NOT NULL REFERENCES students(id)      ON DELETE CASCADE,
  terms_version   text        NOT NULL DEFAULT '1.0',
  accepted_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_id)
);

CREATE INDEX idx_student_terms_student ON student_terms_acceptances (student_id);
CREATE INDEX idx_student_terms_org     ON student_terms_acceptances (organization_id);

ALTER TABLE student_terms_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read terms acceptances"
  ON student_terms_acceptances
  FOR SELECT
  TO authenticated
  USING (organization_id = auth_organization_id());

GRANT SELECT ON student_terms_acceptances TO authenticated;
GRANT ALL    ON student_terms_acceptances TO service_role;
