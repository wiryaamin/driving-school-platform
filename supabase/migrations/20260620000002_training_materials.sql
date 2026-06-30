-- Training materials: org-scoped content library shown in student portal
-- Supports external links, videos, and documents grouped by category.

CREATE TABLE training_materials (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES organizations(id),
  title           text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description     text,
  category        text        NOT NULL DEFAULT 'övrigt'
                              CHECK (category IN ('teori','körning','risk','lagregler','övrigt')),
  content_type    text        NOT NULL DEFAULT 'link'
                              CHECK (content_type IN ('link','video','document')),
  url             text,
  is_published    boolean     NOT NULL DEFAULT true,
  display_order   integer     NOT NULL DEFAULT 0,
  created_by      uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;

-- Org members can read published materials
CREATE POLICY training_materials_select ON training_materials
  FOR SELECT USING (
    organization_id = (
      SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    )
  );

-- Admins / managers can insert
CREATE POLICY training_materials_insert ON training_materials
  FOR INSERT WITH CHECK (
    organization_id = (
      SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    )
  );

-- Admins / managers can update
CREATE POLICY training_materials_update ON training_materials
  FOR UPDATE USING (
    organization_id = (
      SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    )
  );

CREATE INDEX training_materials_org_published_idx
  ON training_materials (organization_id, is_published, category, display_order)
  WHERE deleted_at IS NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION touch_training_materials_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER training_materials_updated_at
  BEFORE UPDATE ON training_materials
  FOR EACH ROW EXECUTE FUNCTION touch_training_materials_updated_at();
