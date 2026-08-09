-- ════════════════════════════════════════════════════════════════════════════
-- Tasks (Uppgifter) — shared org-wide task list, backed by a table
--
-- Same defect class as watchlist_items (20260728000010), found the same way
-- during live pilot commissioning: useTasks.ts stored everything in browser
-- localStorage only. Worse than Watchlist in practice — this feature
-- explicitly supports assigning a task to a specific instructor
-- (assigned_to_id), but that instructor could never see a task "assigned"
-- to them, since it only ever existed in the assigning staff member's own
-- browser. A delegation feature that structurally cannot deliver the
-- delegation is a real gap, not a cosmetic one.
--
-- Mirrors watchlist_items' org-wide-visibility shape exactly — same
-- reasoning applies (a shared task list is the entire point). Names are
-- stored denormalized (assigned_to_name/created_by_name), matching the
-- existing frontend contract exactly: the caller already resolves the
-- current user's display name via useSession() and the assignee's name via
-- useTaskAssignees() (a join to instructors), so no new name-resolution
-- mechanism is needed — this avoids inventing a staff-display-name lookup
-- that doesn't already exist elsewhere in the schema.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.task_status   AS ENUM ('active', 'completed');

CREATE TABLE public.tasks (
  id                uuid                   NOT NULL DEFAULT gen_random_uuid(),
  organization_id   uuid                   NOT NULL,
  title             text                   NOT NULL,
  due_date          date,
  assigned_to_id    uuid,
  assigned_to_name  text,
  priority          public.task_priority,
  created_by_id     uuid                   NOT NULL,
  created_by_name   text                   NOT NULL,
  status            public.task_status     NOT NULL DEFAULT 'active',
  completed_at      timestamptz,
  created_at        timestamptz            NOT NULL DEFAULT now(),
  updated_at        timestamptz            NOT NULL DEFAULT now(),

  CONSTRAINT tasks_pkey     PRIMARY KEY (id),
  CONSTRAINT tasks_org_fkey FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT tasks_assignee_fkey FOREIGN KEY (assigned_to_id)
    REFERENCES public.instructors(id) ON DELETE SET NULL,
  CONSTRAINT tasks_completed_consistency CHECK (
    (status = 'completed') = (completed_at IS NOT NULL)
  )
);

CREATE INDEX idx_tasks_org ON public.tasks (organization_id, created_at DESC);

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Org-wide shared visibility — an assigned task must be visible to the
-- person it's assigned to, not just its creator.
CREATE POLICY "tasks_select_org"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (organization_id = public.auth_organization_id());

CREATE POLICY "tasks_insert_org"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.auth_organization_id());

CREATE POLICY "tasks_update_org"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (organization_id = public.auth_organization_id())
  WITH CHECK (organization_id = public.auth_organization_id());

CREATE POLICY "tasks_delete_org"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (organization_id = public.auth_organization_id());
