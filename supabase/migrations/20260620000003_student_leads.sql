-- Sprint 5 Gap 8: Public lead capture
-- New students submit inquiries via the public booking page; admins manage leads here.

CREATE TABLE student_leads (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES organizations(id),
  first_name       text        NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 100),
  last_name        text        NOT NULL CHECK (char_length(last_name)  BETWEEN 1 AND 100),
  email            text        CHECK (email LIKE '%@%'),
  phone            text,
  license_category text        NOT NULL DEFAULT 'B',
  notes            text,
  status           text        NOT NULL DEFAULT 'new'
                               CHECK (status IN ('new', 'contacted', 'enrolled', 'declined')),
  source           text        NOT NULL DEFAULT 'public_form',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_leads ENABLE ROW LEVEL SECURITY;

-- Org members can read leads belonging to their org
CREATE POLICY "org_members_select_leads" ON student_leads
  FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid = organization_id);

-- Org members can update lead status/notes
CREATE POLICY "org_members_update_leads" ON student_leads
  FOR UPDATE
  USING ((auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid = organization_id);

-- INSERT is handled by the public-booking Edge Function (service role, bypasses RLS)

CREATE INDEX student_leads_org_status_idx
  ON student_leads (organization_id, status, created_at DESC);

CREATE TRIGGER touch_student_leads_updated_at
  BEFORE UPDATE ON student_leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE  student_leads                  IS 'Inbound leads submitted via the public booking page.';
COMMENT ON COLUMN student_leads.license_category IS 'Desired driving licence class: B, A, C, etc.';
COMMENT ON COLUMN student_leads.status           IS 'new → contacted → enrolled|declined lifecycle.';
COMMENT ON COLUMN student_leads.source           IS 'Acquisition channel: public_form, phone, walk_in, etc.';
