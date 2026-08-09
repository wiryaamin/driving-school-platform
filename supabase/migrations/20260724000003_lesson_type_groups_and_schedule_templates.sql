-- =============================================================================
-- Lesson Type Groups & Schedule Templates
--
-- Two tenant-configurable settings entities were shipped in the frontend
-- (Settings → Schema → Tidmallsgrupper, Schemamallar) with no backing table —
-- both pages queried tables that never existed (lesson_type_groups,
-- schedule_templates), silently rendering an empty state instead of erroring.
--
-- lesson_type_groups: purely organizational grouping of lesson_types for
-- display/filtering. Adds a nullable group_id FK on lesson_types.
--
-- schedule_templates: a named, reusable multi-week rotation label
-- (e.g. "Standardschema 2 veckor") that staff can reference when building
-- the booking calendar. This is deliberately a lightweight reference/tagging
-- entity, NOT wired into the automated slot generation engine
-- (scheduling_generation_configs, Phase 2D) — that system already owns
-- per-lesson-type generation cadence/automation and is out of scope here.
-- =============================================================================

-- ─── lesson_type_groups ────────────────────────────────────────────────────

CREATE TABLE public.lesson_type_groups (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  name            text        NOT NULL,
  display_order   integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lesson_type_groups_pkey     PRIMARY KEY (id),
  CONSTRAINT lesson_type_groups_org_fkey FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT lesson_type_groups_org_name_uniq UNIQUE (organization_id, name)
);

COMMENT ON TABLE public.lesson_type_groups IS
  'Tenant-owned grouping of lesson_types for settings/display organization only — no scheduling behavior depends on this.';

CREATE INDEX lesson_type_groups_org_id_idx ON public.lesson_type_groups (organization_id);

CREATE TRIGGER lesson_type_groups_set_updated_at
  BEFORE UPDATE ON public.lesson_type_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER lesson_type_groups_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.lesson_type_groups
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

ALTER TABLE public.lesson_type_groups ENABLE ROW LEVEL SECURITY;

-- Same permission surface already governing lesson_types (same domain: scheduling config).
CREATE POLICY "lesson_type_groups_select"
  ON public.lesson_type_groups FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:read')
  );

CREATE POLICY "lesson_type_groups_select_platform"
  ON public.lesson_type_groups FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "lesson_type_groups_insert"
  ON public.lesson_type_groups FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:create')
  );

CREATE POLICY "lesson_type_groups_update"
  ON public.lesson_type_groups FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:update')
  );

CREATE POLICY "lesson_type_groups_delete"
  ON public.lesson_type_groups FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:delete')
  );

-- lesson_types.group_id — nullable, optional grouping assignment.
ALTER TABLE public.lesson_types
  ADD COLUMN group_id uuid REFERENCES public.lesson_type_groups(id) ON DELETE SET NULL;

CREATE INDEX lesson_types_group_id_idx ON public.lesson_types (group_id) WHERE group_id IS NOT NULL;

-- ─── schedule_templates ─────────────────────────────────────────────────────

CREATE TABLE public.schedule_templates (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  name            text        NOT NULL,
  cycle_weeks     integer     NOT NULL DEFAULT 1,
  display_order   integer     NOT NULL DEFAULT 0,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT schedule_templates_pkey     PRIMARY KEY (id),
  CONSTRAINT schedule_templates_org_fkey FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT schedule_templates_org_name_uniq UNIQUE (organization_id, name),
  CONSTRAINT schedule_templates_cycle_check   CHECK (cycle_weeks BETWEEN 1 AND 12)
);

COMMENT ON TABLE public.schedule_templates IS
  'Tenant-owned reference label for a named multi-week schedule rotation. Reference/tagging entity only — not wired into scheduling_generation_configs (Phase 2D automated generation engine).';

CREATE INDEX schedule_templates_org_id_idx ON public.schedule_templates (organization_id);

CREATE TRIGGER schedule_templates_set_updated_at
  BEFORE UPDATE ON public.schedule_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER schedule_templates_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.schedule_templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_templates_select"
  ON public.schedule_templates FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:read')
  );

CREATE POLICY "schedule_templates_select_platform"
  ON public.schedule_templates FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "schedule_templates_insert"
  ON public.schedule_templates FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:create')
  );

CREATE POLICY "schedule_templates_update"
  ON public.schedule_templates FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:update')
  );

CREATE POLICY "schedule_templates_delete"
  ON public.schedule_templates FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:delete')
  );
