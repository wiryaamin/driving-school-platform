-- Sprint 5: Student private practice log (körkortsbok)
-- Self-reported private practice sessions the student logs from the portal.

CREATE TABLE IF NOT EXISTS student_practice_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id),
  student_id       UUID        NOT NULL REFERENCES students(id),
  practice_date    DATE        NOT NULL,
  duration_minutes INTEGER     NOT NULL CHECK (duration_minutes BETWEEN 1 AND 480),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_student_practice_log_student_date
  ON student_practice_log(student_id, practice_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_practice_log_org
  ON student_practice_log(organization_id)
  WHERE deleted_at IS NULL;

ALTER TABLE student_practice_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_practice_log: org member read" ON student_practice_log;
CREATE POLICY "student_practice_log: org member read"
  ON student_practice_log FOR SELECT
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
  );

DROP POLICY IF EXISTS "student_practice_log: org member insert" ON student_practice_log;
CREATE POLICY "student_practice_log: org member insert"
  ON student_practice_log FOR INSERT
  WITH CHECK (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
  );

DROP POLICY IF EXISTS "student_practice_log: org member update" ON student_practice_log;
CREATE POLICY "student_practice_log: org member update"
  ON student_practice_log FOR UPDATE
  USING (
    organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
  );
