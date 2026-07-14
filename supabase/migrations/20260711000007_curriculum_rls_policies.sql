-- =============================================================================
-- MIGRATION: 20260711000007_curriculum_rls_policies.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Purpose:   Adds the missing Row Level Security policies for
--            training_plan_templates and training_plan_template_steps.
--
-- Root cause (Production Readiness Sprint 1 — Course Management defect):
--   20260528000014_phase2fa_core.sql enabled RLS on 6 tables (its Section 12)
--   and explicitly documented, in its own header, a planned follow-up
--   migration at position 17 of its stated execution order:
--     16. 20260528000014_phase2fa_core.sql           ← exists
--     17. 20260528000015_phase2fa_rls.sql             ← never created
--     18-21. phase2fa_events / indexes / views / rpcs  ← also never created
--   With RLS enabled and zero policies, Postgres denies all access by
--   default: SELECT silently returns zero rows (why the Curriculum UI has
--   always shown an empty state), while INSERT throws a hard "new row
--   violates row-level security policy" error. This is an omitted
--   migration, not a regression — git history shows no prior version of
--   phase2fa_core.sql that ever contained policies for these tables.
--
-- Scope discipline (per Production Readiness Sprint 1 approval — RLS only,
-- no redesign, no new functionality):
--   Only training_plan_templates and training_plan_template_steps are
--   covered here — the two tables the existing, reachable Curriculum module
--   (apps/web/src/modules/curriculum/) actually reads and writes.
--   student_training_plans / student_training_plan_steps share the same
--   root cause but are a materially different capability (student
--   enrollment) with a different documented intended write path (RPC-only,
--   via enroll_student_in_plan() / advance_training_plan_step() /
--   skip_training_plan_step() — none of which exist, since phase2fa_rpcs.sql
--   was also never created). Restoring that path requires writing new RPC
--   functions, which is new functionality — left for a separate, future,
--   explicitly-approved sprint. lesson_categories, lesson_waitlist_entries,
--   and student_permit_milestones are unrelated to the Curriculum module
--   and are also out of scope here.
--
-- Coverage matches exactly what the existing frontend exercises today —
-- SELECT + INSERT only, on both tables (useCurriculum.ts has no UPDATE or
-- DELETE mutation for either table). Adding unused policies would be
-- speculative surface area, not a fix.
--
-- Policy shape and permission-seeding pattern mirror the established,
-- already-deployed sibling migration 20260528000002_phase2b_scheduling_core.sql
-- exactly — no new RLS pattern is introduced.
-- =============================================================================

-- ─── Permission catalog ────────────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'training:plan:create', 'training', 'plan', 'create', 'Create curriculum training plan templates and steps'),
  (gen_random_uuid(), 'training:plan:read',   'training', 'plan', 'read',   'View curriculum training plan templates and steps')
ON CONFLICT (code) DO NOTHING;

-- Curriculum design is an organization-structural decision, gated to the
-- same admin tier already used for other structural configuration
-- (mirrors org_owner / org_admin / org_manager on scheduling:slot:create).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin', 'org_manager') AND r.is_system_role = true
  AND  p.code IN ('training:plan:create', 'training:plan:read')
ON CONFLICT DO NOTHING;

-- Broader read access — instructors, reception, and student-admin staff may
-- reference curriculum structure without being able to edit it.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS JOIN public.permissions p
WHERE  r.name IN ('instructor_senior', 'instructor', 'receptionist', 'student_admin') AND r.is_system_role = true
  AND  p.code = 'training:plan:read'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- TRAINING_PLAN_TEMPLATES
-- =============================================================================

CREATE POLICY "training_plan_templates_select_staff"
  ON public.training_plan_templates FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at  IS NULL
    AND public.has_permission('training:plan:read')
  );

CREATE POLICY "training_plan_templates_select_platform"
  ON public.training_plan_templates FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "training_plan_templates_insert"
  ON public.training_plan_templates FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('training:plan:create')
  );

-- =============================================================================
-- TRAINING_PLAN_TEMPLATE_STEPS
-- =============================================================================

CREATE POLICY "training_plan_template_steps_select_staff"
  ON public.training_plan_template_steps FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('training:plan:read')
  );

CREATE POLICY "training_plan_template_steps_select_platform"
  ON public.training_plan_template_steps FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "training_plan_template_steps_insert"
  ON public.training_plan_template_steps FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('training:plan:create')
  );
