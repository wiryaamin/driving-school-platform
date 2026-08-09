-- =============================================================================
-- Manual Government Workflow Tracker (Transportstyrelsen integration domain)
--
-- Research (see docs/INTEGRATION_CONFIGURATION_GUIDE.md §4.12) found that
-- most Transportstyrelsen/Trafikverket processes relevant to a driving
-- school have NO sanctioned API — they are personal e-legitimation web
-- portals or manual booking sites, by the agencies' own design. Rather than
-- attempt unsupported automation (browser scraping, reverse-engineered
-- private APIs — both explicitly excluded), this gives staff a structured
-- place to track that manual regulatory work so it never silently gets
-- lost: what's due, who's responsible, what confirmation number came back,
-- and a full history.
--
-- One generic table, not one per workflow type — risk-education reporting,
-- driving-school permit renewal/tillsyn, instructor legitimation reporting,
-- and driving-test booking follow-up all have the same shape (a status, an
-- optional related entity, a due date, a confirmation number, a
-- responsible staff member). Building four bespoke tables for four
-- differently-named instances of the same shape would be the kind of
-- unnecessary abstraction/table sprawl this platform's own guardrails warn
-- against.
--
-- Official portal URLs are NOT stored per-row: they are static,
-- Sweden-wide constants (one per workflow_type), computed in the frontend
-- — storing the same URL on every row would be redundant reference data,
-- not tenant-owned configuration.
--
-- Documents get their own small table, not a reuse of student_documents:
-- that table's FK is specifically to student_id, not a generic entity
-- reference, so it is not a structural fit here.
-- =============================================================================

CREATE TYPE public.regulatory_workflow_type AS ENUM (
  'risk_education_report',          -- Risk 1/Risk 2 completion reporting (ongoing requirement)
  'instructor_legitimation_report', -- reporting instructor/driving-school-manager changes
  'driving_school_permit',          -- tillstånd att driva trafikskola — application/renewal/tillsyn follow-up
  'driving_test_booking',           -- Trafikverket förarprov booking tracking (no sanctioned API exists)
  'other'
);

CREATE TYPE public.regulatory_workflow_status AS ENUM (
  'not_started', 'in_progress', 'submitted', 'confirmed', 'rejected', 'expired'
);

CREATE TABLE public.regulatory_workflows (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  workflow_type         public.regulatory_workflow_type   NOT NULL,
  status                public.regulatory_workflow_status NOT NULL DEFAULT 'not_started',

  title                 text        NOT NULL,
  description           text,

  -- Polymorphic reference, e.g. a student for risk-education reporting, an
  -- instructor for legitimation reporting. Intentionally a loose text+uuid
  -- pair, not a set of nullable FK columns (one per possible entity type) —
  -- this table doesn't enforce referential integrity on the link, the same
  -- tradeoff activity_logs/audit_logs already make for entity_type/entity_id.
  related_entity_type   text,
  related_entity_id     uuid,

  external_reference    text, -- confirmation number returned by the government portal
  due_date              date,
  submitted_at          timestamptz,
  confirmed_at          timestamptz,
  responsible_user_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  reminder_sent_at      timestamptz, -- set once a due-soon reminder has been dispatched (see event-worker)
  notes                 text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at             timestamptz,
  deleted_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.regulatory_workflows IS
  'Staff-tracked manual regulatory work (Transportstyrelsen/Trafikverket) where no automation is possible — status, due date, confirmation number, responsible staff, full audit history.';

CREATE TRIGGER regulatory_workflows_set_updated_at
  BEFORE UPDATE ON public.regulatory_workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER regulatory_workflows_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.regulatory_workflows
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE INDEX regulatory_workflows_org_status_idx
  ON public.regulatory_workflows (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX regulatory_workflows_org_type_idx
  ON public.regulatory_workflows (organization_id, workflow_type)
  WHERE deleted_at IS NULL;

CREATE INDEX regulatory_workflows_due_date_idx
  ON public.regulatory_workflows (due_date)
  WHERE deleted_at IS NULL AND reminder_sent_at IS NULL
    AND status NOT IN ('confirmed', 'rejected', 'expired');

CREATE INDEX regulatory_workflows_related_entity_idx
  ON public.regulatory_workflows (organization_id, related_entity_type, related_entity_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.regulatory_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regulatory_workflows_select"
  ON public.regulatory_workflows FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('regulatory:workflow:read')
    OR public.is_platform_admin()
  );

CREATE POLICY "regulatory_workflows_insert"
  ON public.regulatory_workflows FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('regulatory:workflow:create')
  );

CREATE POLICY "regulatory_workflows_update"
  ON public.regulatory_workflows FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('regulatory:workflow:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('regulatory:workflow:update')
  );

CREATE POLICY "regulatory_workflows_delete"
  ON public.regulatory_workflows FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('regulatory:workflow:delete')
  );

-- ── regulatory_workflow_documents ────────────────────────────────────────────

CREATE TABLE public.regulatory_workflow_documents (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workflow_id     uuid        NOT NULL REFERENCES public.regulatory_workflows(id) ON DELETE CASCADE,

  file_name       text        NOT NULL,
  storage_path    text        NOT NULL,
  storage_bucket  text        NOT NULL DEFAULT 'regulatory-workflow-documents',
  mime_type       text,
  file_size_bytes bigint,

  uploaded_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.regulatory_workflow_documents IS
  'Supporting documents (e.g. training certificates, permit applications) attached to a regulatory workflow item.';

CREATE INDEX regulatory_workflow_documents_workflow_idx
  ON public.regulatory_workflow_documents (workflow_id);

ALTER TABLE public.regulatory_workflow_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regulatory_workflow_documents_select"
  ON public.regulatory_workflow_documents FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('regulatory:workflow:read')
    OR public.is_platform_admin()
  );

CREATE POLICY "regulatory_workflow_documents_insert"
  ON public.regulatory_workflow_documents FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('regulatory:workflow:update')
  );

CREATE POLICY "regulatory_workflow_documents_delete"
  ON public.regulatory_workflow_documents FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('regulatory:workflow:update')
  );

REVOKE ALL ON TABLE public.regulatory_workflows           FROM anon;
REVOKE ALL ON TABLE public.regulatory_workflow_documents  FROM anon;
