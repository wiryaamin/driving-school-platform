-- ════════════════════════════════════════════════════════════════════════════
-- Public registration form → professional driving-school enrollment form.
--
-- The public lead-capture form (public-booking Edge Function → student_leads)
-- collected only name/contact/license category — not enough for a school to
-- actually qualify a prospective student before the first phone call. Adds
-- the business-relevant fields a real Swedish driving school sales process
-- needs, plus a lightweight activity log so staff have a visible trail from
-- first contact.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. New qualification columns on student_leads ────────────────────────────

ALTER TABLE student_leads
  ADD COLUMN preferred_start_date       date,
  ADD COLUMN driving_experience         text CHECK (driving_experience IN ('none', 'some_experience', 'held_license_before')),
  ADD COLUMN learner_permit_status      text CHECK (learner_permit_status IN ('none', 'applied', 'has_permit')),
  ADD COLUMN preferred_transmission     text NOT NULL DEFAULT 'no_preference'
                                         CHECK (preferred_transmission IN ('manual', 'automatic', 'no_preference')),
  ADD COLUMN preferred_lesson_times     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN preferred_language         text NOT NULL DEFAULT 'sv',
  ADD COLUMN existing_license_category  text,
  ADD COLUMN needs_theory               boolean NOT NULL DEFAULT false,
  ADD COLUMN needs_risk1                boolean NOT NULL DEFAULT false,
  ADD COLUMN needs_risk2                boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN student_leads.preferred_lesson_times IS
  'Subset of (morning, afternoon, evening, weekend) — free-form array rather than an enum so new slots can be added without a migration.';

-- ── 2. Lightweight CRM activity log ───────────────────────────────────────────
-- Mirrors the pattern already used for enrollment_requests (emit_enrollment_event)
-- and event_outbox generally: a simple, append-only, organization-scoped trail.
-- Not a generic activity-feed platform — just enough for staff to see what
-- happened to a lead and when, matching the existing Leads Kanban's own scope.

CREATE TABLE lead_activities (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id          uuid        NOT NULL REFERENCES student_leads(id) ON DELETE CASCADE,
  activity_type    text        NOT NULL CHECK (activity_type IN ('created', 'status_changed', 'note_added', 'contacted')),
  description      text        NOT NULL,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_activities_lead_idx ON lead_activities (lead_id, created_at DESC);
CREATE INDEX lead_activities_org_idx  ON lead_activities (organization_id, created_at DESC);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_lead_activities" ON lead_activities
  FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid = organization_id);

-- INSERT is via SECURITY DEFINER trigger (below, service role) or staff
-- actions through an Edge Function — no direct client INSERT policy needed.

-- ── 3. Auto-log "created" on every new lead ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.emit_lead_activity_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO lead_activities (organization_id, lead_id, activity_type, description, metadata)
  VALUES (
    NEW.organization_id,
    NEW.id,
    'created',
    'Lead skapad via ' || CASE WHEN NEW.source = 'public_form' THEN 'publikt bokningsformulär' ELSE NEW.source END,
    jsonb_build_object('source', NEW.source, 'license_category', NEW.license_category)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_student_leads_log_created
  AFTER INSERT ON public.student_leads
  FOR EACH ROW EXECUTE FUNCTION public.emit_lead_activity_created();

-- ── 4. Auto-log status changes (staff moving a lead through the Kanban) ──────

CREATE OR REPLACE FUNCTION public.emit_lead_activity_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO lead_activities (organization_id, lead_id, activity_type, description, metadata)
    VALUES (
      NEW.organization_id,
      NEW.id,
      'status_changed',
      'Status ändrad från ' || OLD.status || ' till ' || NEW.status,
      jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_student_leads_log_status_changed
  AFTER UPDATE ON public.student_leads
  FOR EACH ROW EXECUTE FUNCTION public.emit_lead_activity_status_changed();
