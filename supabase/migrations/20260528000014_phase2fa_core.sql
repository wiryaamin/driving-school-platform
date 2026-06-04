-- =============================================================================
-- MIGRATION: 20260528000014_phase2fa_core.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2F-A — Curriculum & Booking Foundation (1 of 6)
-- Description:
--   Core DDL for the training plan and curriculum domain. Creates 3 ENUMs,
--   7 tables, extends 2 existing tables, wires up audit and immutability
--   triggers, and extends the soft-delete whitelist.
--
--   New ENUMs  : training_plan_status, training_plan_step_status,
--                waitlist_entry_status
--   New tables : lesson_categories, training_plan_templates,
--                training_plan_template_steps, student_training_plans,
--                student_training_plan_steps, lesson_waitlist_entries,
--                student_permit_milestones
--   Extensions : lesson_types    (lesson_category_id, required_permit_stage)
--                lesson_bookings (training_plan_step_id)
--
-- lesson_categories RLS deviation:
--   No organization_id. Platform-level reference data shared across all
--   tenants. The SELECT policy in phase2fa_rls.sql uses USING (true); no
--   write policies are defined — mutations via migrations / service_role only.
--
-- Template immutability rule:
--   training_plan_templates and training_plan_template_steps carry BEFORE
--   UPDATE triggers that block structural content changes while any active
--   enrollment (status IN ('enrolled','in_progress')) references the template.
--   Deactivation (is_active = false) and soft-delete always pass the guard.
--
-- Trigger chain note (Phase 2F-A + existing Phase 2A):
--   INSERT on student_permit_milestones
--     → emit_permit_milestone_recorded()   [phase2fa_events.sql]
--       → if primary licence category: UPDATE students.permit_stage
--         → trg_students_permit_stage       [Phase 2A]
--           → emit_student_permit_stage_changed()
--   Two outbox events are emitted per primary-category milestone. This is
--   intentional: permit_milestone.recorded (training domain) and
--   student.permit_changed (student domain) serve different consumers.
--
-- Intra-file creation order (dependency chain):
--   lesson_categories
--   → training_plan_templates
--   → training_plan_template_steps  (FK: lesson_categories, templates)
--   → student_training_plans        (FK: templates)
--   → student_training_plan_steps   (FK: plans, template_steps)
--   → ALTER TABLE lesson_types      (FK: lesson_categories — already exists)
--   → ALTER TABLE lesson_bookings   (FK: student_training_plan_steps)
--   lesson_waitlist_entries         (FK: lesson_types, lesson_bookings — already exist)
--   student_permit_milestones       (no intra-phase FKs)
--
-- Execution order:
--    1.  20260527000001_enterprise_foundation.sql
--    2.  20260527000002_phase1b2_hardening.sql
--    3.  20260528000001_phase2a_domain_foundation.sql
--    4-7. Phase 2B: scheduling_core, rls, events, indexes
--    8-9. Phase 2C: slot_generator_infra, slot_generator_functions
--   10-11. Phase 2D: scheduling_ops_infra, scheduling_ops_functions
--   12-15. Phase 2E: admin_infra, read_models, dashboard_rpcs, archival_prep
--   16.  20260528000014_phase2fa_core.sql          ← this file
--   17.  20260528000015_phase2fa_rls.sql
--   18.  20260528000016_phase2fa_events.sql
--   19.  20260528000017_phase2fa_indexes.sql
--   20.  20260528000018_phase2fa_views.sql
--   21.  20260528000019_phase2fa_rpcs.sql
--
-- Dependencies (must exist before this file runs):
--   Phase 1A : public.organizations, auth.users,
--              public.set_updated_at(), public.audit_trigger_fn()
--   Phase 1B.2: public.soft_delete(), public.soft_restore(),
--               public.insert_outbox_event(), public.event_channel (enum)
--   Phase 2A : public.students, public.instructors,
--              public.permit_stage (enum)
--   Phase 2B : public.lesson_types, public.lesson_bookings
-- =============================================================================


-- =============================================================================
-- SECTION 1: NEW ENUM TYPES
--
-- All three enums are wrapped in exception-guarded DO blocks for idempotency.
-- Re-running this migration will skip creation of already-existing types.
-- =============================================================================

DO $$
BEGIN
  CREATE TYPE public.training_plan_status AS ENUM (
    'enrolled',       -- plan exists; no steps started yet
    'in_progress',    -- at least one step started or completed
    'awaiting_exam',  -- all required steps done; pending external exam gate
    'completed',      -- all steps done and exam gates passed
    'withdrawn'       -- student left the plan; terminal state, never reactivated
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.training_plan_step_status AS ENUM (
    'not_started',  -- provisioned at enrollment; not yet begun
    'in_progress',  -- at least one lesson or action logged against this step
    'completed',    -- completion criteria met; completed_at is set
    'skipped'       -- intentionally bypassed; skip_reason is required
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.waitlist_entry_status AS ENUM (
    'waiting',    -- active; awaiting a slot notification
    'notified',   -- student informed of an opening; awaiting booking confirmation
    'booked',     -- student booked from the waitlist; fulfilled_booking_id is set
    'expired',    -- expires_at passed without booking; set by the expiry cron job
    'withdrawn'   -- student or staff removed the entry manually
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- SECTION 2: LESSON_CATEGORIES (PLATFORM REFERENCE DATA)
--
-- INTENTIONAL DEVIATION FROM MULTI-TENANT PATTERN:
--   This table has no organization_id. Lesson categories are platform-level
--   taxonomy (practical, theory, risk_education, etc.) shared across all
--   tenants. They classify what kind of lesson a lesson_type represents —
--   not tenant-specific configuration.
--
--   RLS consequence: the SELECT policy in phase2fa_rls.sql uses USING (true).
--   Write operations are service_role only (via migrations). No write RLS
--   policies are defined.
--
--   Canonical seed rows are inserted in phase2fa_rpcs.sql with
--   ON CONFLICT (code) DO NOTHING.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lesson_categories (
  id             uuid    NOT NULL DEFAULT gen_random_uuid(),
  code           text    NOT NULL,
  label_sv       text    NOT NULL,
  label_en       text    NOT NULL,
  description_sv text,
  sort_order     integer NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lc_pkey        PRIMARY KEY (id),
  CONSTRAINT lc_code_key    UNIQUE (code),
  CONSTRAINT lc_code_format CHECK (code ~ '^[a-z_]+$')
);

COMMENT ON TABLE public.lesson_categories IS
  'Platform-level taxonomy for lesson content types (practical, theory, '
  'risk_education, etc.). No organization_id — shared across all tenants. '
  'Readable by all authenticated users; mutations via migrations or '
  'service_role only. See phase2fa_rls.sql for the RLS deviation notes.';

COMMENT ON COLUMN public.lesson_categories.code IS
  'Stable lowercase snake_case identifier (e.g. ''practical'', ''risk_education''). '
  'Never rename a code once seeded — lesson_types and training_plan_template_steps '
  'reference these codes in application logic and UI display.';

COMMENT ON COLUMN public.lesson_categories.sort_order IS
  'Display ordering in UI dropdowns and reports. Lower = earlier. '
  'Gaps between values are intentional — leaves room for future insertions '
  'without renumbering existing entries.';


-- =============================================================================
-- SECTION 3: TRAINING_PLAN_TEMPLATES
--
-- One template per licence category per school. A template defines the
-- canonical sequence of steps a student must complete to obtain the licence.
--
-- IMMUTABILITY RULE:
--   Structural fields (code, name, licence_category, purpose, description,
--   total_estimated_hours) are locked once any student is actively enrolled
--   (status IN ('enrolled','in_progress')). Enforced by the
--   trg_tpt_immutability_guard BEFORE UPDATE trigger below.
--
--   To revise a template: deactivate it (is_active = false) to stop new
--   enrollments; existing students keep their current plan. Create a new
--   template for updated content.
--
-- SOFT DELETE:
--   Soft-deleted templates are invisible to the enroll_student_in_plan()
--   RPC — no new enrollments can be created. Existing enrollments are
--   unaffected and retain full access to their step records.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.training_plan_templates (
  id                    uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id       uuid         NOT NULL,
  code                  text         NOT NULL,
  name_sv               text         NOT NULL,
  name_en               text,
  licence_category      text         NOT NULL,
  purpose               text         NOT NULL,
  description_sv        text,
  total_estimated_hours numeric(5,1),
  is_active             boolean      NOT NULL DEFAULT true,

  -- Soft delete
  deleted_at  timestamptz,
  deleted_by  uuid,

  -- Audit
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tpt_pkey            PRIMARY KEY (id),
  CONSTRAINT tpt_org_fkey        FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT tpt_deleted_by_fkey FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tpt_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tpt_updated_by_fkey FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT tpt_licence_category_check CHECK (
    licence_category IN ('AM','A1','A2','A','B','BE','C','C1','CE','D','D1','DE','T')
  ),
  CONSTRAINT tpt_purpose_check CHECK (
    purpose IN ('acquisition','renewal','professional','rehabilitation')
  ),
  CONSTRAINT tpt_hours_check CHECK (
    total_estimated_hours IS NULL OR total_estimated_hours > 0
  )
);

-- Partial unique: soft-deleted templates release the (org, code) slot for reuse.
-- Implemented as a partial index because PostgreSQL does not support partial
-- UNIQUE constraints declared inline in CREATE TABLE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tpt_org_code_active
  ON public.training_plan_templates (organization_id, code)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.training_plan_templates IS
  'Curriculum templates defining the canonical step sequence for a licence category. '
  'Structural fields are immutable once active enrollments reference the template '
  '(enforced by trg_tpt_immutability_guard). Retire a template by setting '
  'is_active = false rather than modifying or deleting it.';

COMMENT ON COLUMN public.training_plan_templates.total_estimated_hours IS
  'Advisory total duration for UI display and student onboarding communication. '
  'Not authoritative for completion logic — step-level required_lesson_count, '
  'required_hours_decimal, and estimated_minutes govern actual completion criteria. '
  'May be left NULL for templates where total hours are not communicated upfront.';

COMMENT ON COLUMN public.training_plan_templates.purpose IS
  'Broad classification of the curriculum intent: '
  'acquisition (first licence), renewal (lapsed licence), '
  'professional (commercial or occupational), rehabilitation (post-suspension).';

COMMENT ON COLUMN public.training_plan_templates.is_active IS
  'When false, the template is retired: no new enrollments can be created via '
  'enroll_student_in_plan(). Existing enrollments are unaffected. '
  'Preferred deactivation path over soft-delete when retiring a template.';

-- Immutability guard: blocks changes to structural content fields when active
-- student enrollments (status IN ('enrolled','in_progress')) reference this
-- template. Changes to is_active, deleted_at, deleted_by, and audit columns
-- are always permitted.
CREATE OR REPLACE FUNCTION public.tpt_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count integer;
BEGIN
  IF (
    NEW.code                  IS DISTINCT FROM OLD.code                  OR
    NEW.name_sv               IS DISTINCT FROM OLD.name_sv               OR
    NEW.name_en               IS DISTINCT FROM OLD.name_en               OR
    NEW.licence_category      IS DISTINCT FROM OLD.licence_category      OR
    NEW.purpose               IS DISTINCT FROM OLD.purpose               OR
    NEW.description_sv        IS DISTINCT FROM OLD.description_sv        OR
    NEW.total_estimated_hours IS DISTINCT FROM OLD.total_estimated_hours
  ) THEN
    SELECT COUNT(*) INTO v_active_count
    FROM public.student_training_plans
    WHERE template_id = OLD.id
      AND status IN ('enrolled', 'in_progress')
      AND deleted_at IS NULL;

    IF v_active_count > 0 THEN
      RAISE EXCEPTION
        'Cannot modify training plan template ''%'': % active enrollment(s) exist. '
        'Set is_active = false to prevent new enrollments while retaining existing '
        'student plans, or withdraw all active students before editing.',
        OLD.code, v_active_count
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tpt_immutability_guard() IS
  'BEFORE UPDATE guard on training_plan_templates. Blocks changes to structural '
  'content fields when active student enrollments reference the template. '
  'Deactivation (is_active = false), soft-delete, and audit field updates pass.';

-- trg_tpt_immutability_guard fires before trg_tpt_set_updated_at
-- (alphabetical: 'i' < 's') — the guard aborts via EXCEPTION if the check
-- fails, so set_updated_at never runs on a blocked update.
DROP TRIGGER IF EXISTS trg_tpt_immutability_guard ON public.training_plan_templates;
CREATE TRIGGER trg_tpt_immutability_guard
  BEFORE UPDATE ON public.training_plan_templates
  FOR EACH ROW EXECUTE FUNCTION public.tpt_immutability_guard();

DROP TRIGGER IF EXISTS trg_tpt_set_updated_at ON public.training_plan_templates;
CREATE TRIGGER trg_tpt_set_updated_at
  BEFORE UPDATE ON public.training_plan_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tpt_audit ON public.training_plan_templates;
CREATE TRIGGER trg_tpt_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.training_plan_templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();


-- =============================================================================
-- SECTION 4: TRAINING_PLAN_TEMPLATE_STEPS
--
-- Ordered steps within a template. step_number is 1-based and unique per
-- template (enforced by constraint). Contiguity is enforced at the
-- application layer; gaps in step_number are not a database error.
--
-- Steps have no independent soft delete — they are cascade-deleted when
-- their template is hard-deleted (which never occurs in practice; the
-- immutability guard and soft-delete workflow prevent hard deletions of
-- templates with history). The immutability guard mirrors the template
-- guard: structural changes are blocked while active enrollments exist.
--
-- STEP TYPES:
--   lesson_block   — requires lesson_category_id; completion measured by
--                    required_lesson_count and / or required_hours_decimal
--   milestone      — named progress checkpoint; no lesson count criterion
--   gate_check     — requires gate_type; advanced manually by staff or
--                    auto-advanced by the Phase 2F-C compliance integration
--   external_event — records completion of an event outside the lesson
--                    system (theory exam certificate, risk education, etc.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.training_plan_template_steps (
  id                     uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id        uuid         NOT NULL,
  template_id            uuid         NOT NULL,
  step_number            integer      NOT NULL,
  name_sv                text         NOT NULL,
  name_en                text,
  step_type              text         NOT NULL,
  lesson_category_id     uuid,
  required_lesson_count  integer,
  required_hours_decimal numeric(4,1),
  estimated_minutes      integer,
  is_mandatory           boolean      NOT NULL DEFAULT true,
  gate_type              text,
  notes_sv               text,

  -- Audit (no soft-delete columns — lifecycle is bound to the template)
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tpts_pkey            PRIMARY KEY (id),
  CONSTRAINT tpts_org_fkey        FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT tpts_template_fkey   FOREIGN KEY (template_id)
    REFERENCES public.training_plan_templates(id) ON DELETE CASCADE,
  CONSTRAINT tpts_category_fkey   FOREIGN KEY (lesson_category_id)
    REFERENCES public.lesson_categories(id) ON DELETE RESTRICT,
  CONSTRAINT tpts_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tpts_updated_by_fkey FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,

  -- step_number must be unique within each template
  CONSTRAINT tpts_step_number_unique UNIQUE (template_id, step_number),
  CONSTRAINT tpts_step_number_check  CHECK (step_number >= 1),

  CONSTRAINT tpts_step_type_check CHECK (
    step_type IN ('lesson_block', 'milestone', 'gate_check', 'external_event')
  ),
  CONSTRAINT tpts_gate_type_check CHECK (
    gate_type IS NULL
    OR gate_type IN ('risk1', 'risk2', 'theory_test', 'instructor_signoff', 'exam')
  ),

  -- gate_check steps must name the gate they represent
  CONSTRAINT tpts_gate_coherence_check CHECK (
    step_type <> 'gate_check' OR gate_type IS NOT NULL
  ),
  -- lesson_block steps must reference a lesson category to count lessons against
  CONSTRAINT tpts_lesson_block_category_check CHECK (
    step_type <> 'lesson_block' OR lesson_category_id IS NOT NULL
  ),
  -- lesson_block steps must carry at least one measurable completion criterion
  CONSTRAINT tpts_lesson_block_criterion_check CHECK (
    step_type <> 'lesson_block'
    OR required_lesson_count IS NOT NULL
    OR required_hours_decimal IS NOT NULL
  ),

  CONSTRAINT tpts_required_count_check CHECK (
    required_lesson_count IS NULL OR required_lesson_count >= 1
  ),
  CONSTRAINT tpts_required_hours_check CHECK (
    required_hours_decimal IS NULL OR required_hours_decimal > 0
  ),
  -- Advisory per-step time estimate: must be between 5 and 600 minutes if set
  CONSTRAINT tpts_estimated_minutes_check CHECK (
    estimated_minutes IS NULL OR estimated_minutes BETWEEN 5 AND 600
  )
);

COMMENT ON TABLE public.training_plan_template_steps IS
  'Ordered steps within a training plan template. Structurally immutable once '
  'active student enrollments reference the parent template (enforced by trigger). '
  'Steps cascade-delete with the template. No independent soft delete — step '
  'lifecycle is fully bound to the template lifecycle.';

COMMENT ON COLUMN public.training_plan_template_steps.step_number IS
  'Display and execution order within the template. 1-based, unique per template. '
  'The application enforces contiguity on creation; the DB enforces uniqueness only. '
  'Execution is always linear — no DAG prerequisites in Phase 2F-A.';

COMMENT ON COLUMN public.training_plan_template_steps.estimated_minutes IS
  'Advisory per-step time estimate in minutes (5–600). Used for progress display '
  'and scheduling hints in the student-facing portal. NULL = unspecified. '
  'Not used in completion logic. The sum of all step estimated_minutes / 60.0 '
  'provides a computable alternative to training_plan_templates.total_estimated_hours.';

COMMENT ON COLUMN public.training_plan_template_steps.gate_type IS
  'Required when step_type = ''gate_check''. Identifies the external gate condition: '
  'risk1 (Halkbana certificate), risk2 (Alkohol/Narkotika certificate), '
  'theory_test (Kunskapsprov pass), instructor_signoff (manual approval), '
  'exam (Körprov pass). Phase 2F-C compliance integration will auto-advance gate '
  'steps when the corresponding compliance record is created. Until then, staff '
  'advance gate steps manually via advance_training_plan_step().';

COMMENT ON COLUMN public.training_plan_template_steps.is_mandatory IS
  'Mandatory steps (true) must be completed or explicitly skipped with a reason '
  'before the enrollment can reach ''completed'' or ''awaiting_exam'' status. '
  'Non-mandatory steps are tracked and displayed but do not block completion.';

-- Immutability guard mirrors tpt_immutability_guard but targets the parent
-- template's active enrollments rather than the template row directly.
CREATE OR REPLACE FUNCTION public.tpts_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count integer;
BEGIN
  IF (
    NEW.step_number            IS DISTINCT FROM OLD.step_number            OR
    NEW.name_sv                IS DISTINCT FROM OLD.name_sv                OR
    NEW.name_en                IS DISTINCT FROM OLD.name_en                OR
    NEW.step_type              IS DISTINCT FROM OLD.step_type              OR
    NEW.lesson_category_id     IS DISTINCT FROM OLD.lesson_category_id     OR
    NEW.required_lesson_count  IS DISTINCT FROM OLD.required_lesson_count  OR
    NEW.required_hours_decimal IS DISTINCT FROM OLD.required_hours_decimal OR
    NEW.estimated_minutes      IS DISTINCT FROM OLD.estimated_minutes      OR
    NEW.is_mandatory           IS DISTINCT FROM OLD.is_mandatory           OR
    NEW.gate_type              IS DISTINCT FROM OLD.gate_type              OR
    NEW.notes_sv               IS DISTINCT FROM OLD.notes_sv
  ) THEN
    SELECT COUNT(*) INTO v_active_count
    FROM public.student_training_plans
    WHERE template_id = OLD.template_id
      AND status IN ('enrolled', 'in_progress')
      AND deleted_at IS NULL;

    IF v_active_count > 0 THEN
      RAISE EXCEPTION
        'Cannot modify step ''%'' (step % of template %): '
        '% active enrollment(s) exist on the parent template. '
        'Deactivate the template to stop new enrollments before editing its steps.',
        OLD.name_sv, OLD.step_number, OLD.template_id, v_active_count
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tpts_immutability_guard() IS
  'BEFORE UPDATE guard on training_plan_template_steps. Blocks structural content '
  'changes when active student enrollments reference the parent template. '
  'Audit column updates (created_by, updated_by) always pass.';

DROP TRIGGER IF EXISTS trg_tpts_immutability_guard ON public.training_plan_template_steps;
CREATE TRIGGER trg_tpts_immutability_guard
  BEFORE UPDATE ON public.training_plan_template_steps
  FOR EACH ROW EXECUTE FUNCTION public.tpts_immutability_guard();

DROP TRIGGER IF EXISTS trg_tpts_set_updated_at ON public.training_plan_template_steps;
CREATE TRIGGER trg_tpts_set_updated_at
  BEFORE UPDATE ON public.training_plan_template_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tpts_audit ON public.training_plan_template_steps;
CREATE TRIGGER trg_tpts_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.training_plan_template_steps
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();


-- =============================================================================
-- SECTION 5: STUDENT_TRAINING_PLANS (ENROLLMENTS)
--
-- One row per student-template pairing. Created exclusively through the
-- enroll_student_in_plan() RPC, which provisions all student_training_plan_steps
-- rows in the same transaction — an enrollment with no steps is never valid.
--
-- STATUS MACHINE:
--   enrolled      → in_progress    first step started
--   in_progress   → awaiting_exam  all mandatory steps complete; gate steps remain
--   in_progress   → completed      all steps complete; no gate steps in template
--   awaiting_exam → completed      all gate steps passed
--   any active    → withdrawn      terminal; via withdraw_student_from_plan() only
--
-- SOFT DELETE:
--   Soft-deleted enrollments are historical records retained for audit.
--   The partial unique index on (student_id, template_id) uses
--   WHERE deleted_at IS NULL, so a student can re-enroll in the same
--   template after the original enrollment is soft-deleted.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.student_training_plans (
  id                     uuid                        NOT NULL DEFAULT gen_random_uuid(),
  organization_id        uuid                        NOT NULL,
  student_id             uuid                        NOT NULL,
  template_id            uuid                        NOT NULL,
  licence_category       text                        NOT NULL,
  status                 public.training_plan_status NOT NULL DEFAULT 'enrolled',
  enrolled_at            timestamptz                 NOT NULL DEFAULT now(),
  completed_at           timestamptz,
  withdrawn_at           timestamptz,
  assigned_instructor_id uuid,
  notes                  text,

  -- Soft delete
  deleted_at  timestamptz,
  deleted_by  uuid,

  -- Audit
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stp_pkey            PRIMARY KEY (id),
  CONSTRAINT stp_org_fkey        FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT stp_student_fkey    FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE RESTRICT,
  CONSTRAINT stp_template_fkey   FOREIGN KEY (template_id)
    REFERENCES public.training_plan_templates(id) ON DELETE RESTRICT,
  CONSTRAINT stp_instructor_fkey FOREIGN KEY (assigned_instructor_id)
    REFERENCES public.instructors(id) ON DELETE SET NULL,
  CONSTRAINT stp_deleted_by_fkey FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT stp_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT stp_updated_by_fkey FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT stp_licence_category_check CHECK (
    licence_category IN ('AM','A1','A2','A','B','BE','C','C1','CE','D','D1','DE','T')
  ),
  -- completed_at must be set if and only if status = 'completed'
  CONSTRAINT stp_completed_consistency CHECK (
    (status = 'completed') = (completed_at IS NOT NULL)
  ),
  -- withdrawn_at must be set if and only if status = 'withdrawn'
  CONSTRAINT stp_withdrawn_consistency CHECK (
    (status = 'withdrawn') = (withdrawn_at IS NOT NULL)
  ),
  CONSTRAINT stp_completed_after_enrolled CHECK (
    completed_at IS NULL OR completed_at >= enrolled_at
  )
);

-- Partial unique: one active enrollment per (student, template).
-- Soft-deleted enrollments release the slot for re-enrollment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stp_student_template_active
  ON public.student_training_plans (student_id, template_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.student_training_plans IS
  'Student training plan enrollments. One row per student-template pairing. '
  'Created exclusively via enroll_student_in_plan() RPC, which provisions '
  'all step rows atomically. Direct INSERT via REST is blocked (no INSERT RLS policy). '
  'Terminated plans are soft-deleted, not hard-deleted.';

COMMENT ON COLUMN public.student_training_plans.licence_category IS
  'Denormalized from the template at enrollment time. Retained even if the template '
  'is later soft-deleted, providing a stable historical record of what licence '
  'category the student was enrolled to pursue.';

COMMENT ON COLUMN public.student_training_plans.assigned_instructor_id IS
  'Primary instructor responsible for this student''s training plan. Optional. '
  'May differ from the instructor on individual lesson_bookings, which carry their '
  'own instructor assignment. NULL = no designated plan-level instructor.';

DROP TRIGGER IF EXISTS trg_stp_set_updated_at ON public.student_training_plans;
CREATE TRIGGER trg_stp_set_updated_at
  BEFORE UPDATE ON public.student_training_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_stp_audit ON public.student_training_plans;
CREATE TRIGGER trg_stp_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.student_training_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();


-- =============================================================================
-- SECTION 6: STUDENT_TRAINING_PLAN_STEPS
--
-- Per-student step progress records. Provisioned in bulk by
-- enroll_student_in_plan() when an enrollment is created — one row per
-- template step, all with status = 'not_started'.
--
-- These rows are not independently soft-deleteable. They cascade-delete
-- if the parent enrollment is hard-deleted (which does not occur in
-- normal operation — enrollments are soft-deleted only).
--
-- All writes go through RPCs:
--   advance_training_plan_step() → status = 'completed'
--   skip_training_plan_step()    → status = 'skipped'
-- Direct INSERT and DELETE via REST are blocked (no RLS policies for those
-- operations). UPDATE via REST is permitted with training:plan:manage or
-- training:plan:advance permission (for admin correction workflows).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.student_training_plan_steps (
  id                      uuid                             NOT NULL DEFAULT gen_random_uuid(),
  organization_id         uuid                             NOT NULL,
  enrollment_id           uuid                             NOT NULL,
  template_step_id        uuid                             NOT NULL,
  status                  public.training_plan_step_status NOT NULL DEFAULT 'not_started',
  lessons_completed_count integer                          NOT NULL DEFAULT 0,
  hours_completed_decimal numeric(5,1)                     NOT NULL DEFAULT 0.0,
  completed_at            timestamptz,
  completed_by            uuid,
  skipped_at              timestamptz,
  skipped_by              uuid,
  skip_reason             text,
  notes                   text,

  -- Audit
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stps_pkey               PRIMARY KEY (id),
  CONSTRAINT stps_org_fkey           FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT stps_enrollment_fkey    FOREIGN KEY (enrollment_id)
    REFERENCES public.student_training_plans(id) ON DELETE CASCADE,
  CONSTRAINT stps_template_step_fkey FOREIGN KEY (template_step_id)
    REFERENCES public.training_plan_template_steps(id) ON DELETE RESTRICT,
  CONSTRAINT stps_completed_by_fkey  FOREIGN KEY (completed_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT stps_skipped_by_fkey    FOREIGN KEY (skipped_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT stps_created_by_fkey    FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT stps_updated_by_fkey    FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,

  -- One progress row per (enrollment, step) — no duplicates possible
  CONSTRAINT stps_enrollment_step_unique UNIQUE (enrollment_id, template_step_id),

  CONSTRAINT stps_lessons_count_check CHECK (lessons_completed_count >= 0),
  CONSTRAINT stps_hours_check         CHECK (hours_completed_decimal >= 0),

  -- completed_at must be set if and only if status = 'completed'
  CONSTRAINT stps_completed_consistency CHECK (
    (status = 'completed') = (completed_at IS NOT NULL)
  ),
  -- skipped_at must be set if and only if status = 'skipped'
  CONSTRAINT stps_skipped_consistency CHECK (
    (status = 'skipped') = (skipped_at IS NOT NULL)
  ),
  -- skip_reason is required whenever a step is skipped
  CONSTRAINT stps_skip_reason_check CHECK (
    status <> 'skipped'
    OR (skip_reason IS NOT NULL AND length(trim(skip_reason)) > 0)
  )
);

COMMENT ON TABLE public.student_training_plan_steps IS
  'Per-student step progress records, provisioned atomically by enroll_student_in_plan(). '
  'One row per (enrollment, template step). Updated via advance_training_plan_step() '
  'and skip_training_plan_step() RPCs. No INSERT or DELETE RLS policies — '
  'direct REST inserts and deletes are blocked by RLS default-deny.';

COMMENT ON COLUMN public.student_training_plan_steps.lessons_completed_count IS
  'Count of completed lesson_bookings linked to this step via '
  'lesson_bookings.training_plan_step_id. Updated by advance_training_plan_step() '
  'at step completion time by counting bookings with status = ''completed''. '
  'Not maintained incrementally per booking.';

COMMENT ON COLUMN public.student_training_plan_steps.hours_completed_decimal IS
  'Cumulative hours from completed lesson_bookings linked to this step. '
  'Derived from the associated lesson_slots duration at step advancement time.';

COMMENT ON COLUMN public.student_training_plan_steps.completed_by IS
  'auth.uid() of the staff member who advanced this step to ''completed'' via RPC. '
  'Distinct from created_by (who provisioned the row at enrollment). '
  'NULL until the step is completed.';

COMMENT ON COLUMN public.student_training_plan_steps.skipped_by IS
  'auth.uid() of the staff member who skipped this step via skip_training_plan_step(). '
  'NULL until the step is skipped.';

DROP TRIGGER IF EXISTS trg_stps_set_updated_at ON public.student_training_plan_steps;
CREATE TRIGGER trg_stps_set_updated_at
  BEFORE UPDATE ON public.student_training_plan_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_stps_audit ON public.student_training_plan_steps;
CREATE TRIGGER trg_stps_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.student_training_plan_steps
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();


-- =============================================================================
-- SECTION 7: LESSON_WAITLIST_ENTRIES
--
-- Student queue for lesson types where no immediate slot is available.
-- Each entry is a standing request to be matched to a future opening that
-- satisfies the student's preferences.
--
-- PRIORITY SYSTEM:
--   Lower integer = higher priority. 0 = highest possible. Default 100.
--   Reserves 1–99 for admin-inserted urgent entries and 101+ for
--   deprioritised entries. The notification engine (Phase 2F-D) reads
--   active entries ordered by (priority ASC, created_at ASC).
--
-- ACTIVE DUPLICATE PREVENTION:
--   A student may not hold two active (waiting / notified) entries for the
--   same lesson type simultaneously. The partial unique index below enforces
--   this. The join_lesson_waitlist() RPC returns a clear error on conflict.
--
-- EXPIRY:
--   expires_at is set at entry creation time (by staff preference or policy).
--   A pg_cron job (Phase 2F-D) sets status = 'expired' when expires_at passes.
--   The idx_lwe_expires index in phase2fa_indexes.sql supports this scan.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lesson_waitlist_entries (
  id                      uuid                        NOT NULL DEFAULT gen_random_uuid(),
  organization_id         uuid                        NOT NULL,
  student_id              uuid                        NOT NULL,
  lesson_type_id          uuid                        NOT NULL,
  preferred_instructor_id uuid,
  preferred_location_id   uuid,
  not_before              date,
  not_after               date,
  preferred_days_of_week  integer[],
  preferred_time_start    time,
  preferred_time_end      time,
  status                  public.waitlist_entry_status NOT NULL DEFAULT 'waiting',
  priority                integer                      NOT NULL DEFAULT 100,
  notification_count      integer                      NOT NULL DEFAULT 0,
  expires_at              timestamptz,
  notified_at             timestamptz,
  booked_at               timestamptz,
  withdrawn_at            timestamptz,
  fulfilled_booking_id    uuid,

  -- Soft delete
  deleted_at  timestamptz,
  deleted_by  uuid,

  -- Audit
  created_by  uuid,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lwe_pkey             PRIMARY KEY (id),
  CONSTRAINT lwe_org_fkey         FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT lwe_student_fkey     FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE RESTRICT,
  CONSTRAINT lwe_lesson_type_fkey FOREIGN KEY (lesson_type_id)
    REFERENCES public.lesson_types(id) ON DELETE RESTRICT,
  CONSTRAINT lwe_instructor_fkey  FOREIGN KEY (preferred_instructor_id)
    REFERENCES public.instructors(id) ON DELETE SET NULL,
  CONSTRAINT lwe_booking_fkey     FOREIGN KEY (fulfilled_booking_id)
    REFERENCES public.lesson_bookings(id) ON DELETE SET NULL,
  CONSTRAINT lwe_deleted_by_fkey  FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lwe_created_by_fkey  FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lwe_updated_by_fkey  FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT lwe_date_range_check CHECK (
    not_before IS NULL OR not_after IS NULL OR not_before <= not_after
  ),
  CONSTRAINT lwe_time_range_check CHECK (
    preferred_time_start IS NULL
    OR preferred_time_end IS NULL
    OR preferred_time_start < preferred_time_end
  ),
  CONSTRAINT lwe_notification_count_check CHECK (notification_count >= 0),
  CONSTRAINT lwe_priority_check           CHECK (priority >= 0),
  -- fulfilled_booking_id must be set when status reaches 'booked'
  CONSTRAINT lwe_booked_requires_booking  CHECK (
    status <> 'booked' OR fulfilled_booking_id IS NOT NULL
  ),
  -- preferred_days_of_week must be non-empty if present
  CONSTRAINT lwe_days_array_check CHECK (
    preferred_days_of_week IS NULL
    OR array_length(preferred_days_of_week, 1) > 0
  )
);

-- Active duplicate prevention: one active (waiting/notified) entry per
-- (student, lesson type). Students may rejoin after expiry or withdrawal.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lwe_student_type_active
  ON public.lesson_waitlist_entries (student_id, lesson_type_id)
  WHERE status IN ('waiting', 'notified') AND deleted_at IS NULL;

COMMENT ON TABLE public.lesson_waitlist_entries IS
  'Student queue entries for lesson types with no immediately available slots. '
  'Status transitions: waiting → notified → booked (or expired / withdrawn). '
  'The notification engine (Phase 2F-D) reads active entries ordered by '
  'priority ASC, created_at ASC. Expiry is processed by a scheduled cron job.';

COMMENT ON COLUMN public.lesson_waitlist_entries.priority IS
  'Notification sort order. Lower integer = higher priority (0 = highest). '
  'Default 100. Admin-inserted urgent entries use 1–99; deprioritised entries '
  'use 101+. Modified only by the notification engine or admin override.';

COMMENT ON COLUMN public.lesson_waitlist_entries.preferred_location_id IS
  'Optional preference for a specific organisation location or branch. '
  'Stored as a plain UUID — a foreign key to organisation_locations(id) will be '
  'added once the locations table reference is confirmed in a future migration.';

COMMENT ON COLUMN public.lesson_waitlist_entries.preferred_days_of_week IS
  'Array of ISO weekday integers (1=Mon, 2=Tue … 7=Sun) representing acceptable '
  'days. NULL = any day. Used by the notification engine to filter slot candidates. '
  'Example: ARRAY[1,2,3,4,5] = weekdays only. '
  'GIN index in phase2fa_indexes.sql supports @> containment queries.';

COMMENT ON COLUMN public.lesson_waitlist_entries.notification_count IS
  'Number of times the student has been notified of an available slot for this '
  'entry. Incremented by the notification engine each time a notification is sent.';

DROP TRIGGER IF EXISTS trg_lwe_set_updated_at ON public.lesson_waitlist_entries;
CREATE TRIGGER trg_lwe_set_updated_at
  BEFORE UPDATE ON public.lesson_waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lwe_audit ON public.lesson_waitlist_entries;
CREATE TRIGGER trg_lwe_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.lesson_waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();


-- =============================================================================
-- SECTION 8: STUDENT_PERMIT_MILESTONES (APPEND-ONLY)
--
-- Multi-category permit milestone log. One row per (student, licence_category,
-- milestone). Supports students simultaneously pursuing multiple licence
-- categories (e.g. B + C or B + BE) — a scenario the single-column
-- students.permit_stage cannot represent.
--
-- The students.permit_stage column (Phase 2A) remains authoritative for the
-- student's primary (target_licence_category). This table provides durable
-- per-category logs and drives the multi-category tracking UI.
--
-- APPEND-ONLY INVARIANTS:
--   • No updated_at column — rows are never modified after insert.
--   • No soft delete — milestones are permanent historical records.
--   • No UPDATE or DELETE RLS policies.
--   • No set_updated_at or audit_trigger_fn triggers.
--   • The AFTER INSERT trigger (phase2fa_events.sql) synchronises
--     students.permit_stage when the milestone matches the student's
--     target_licence_category, which in turn fires the Phase 2A permit
--     stage change trigger. See the trigger chain note in the file header.
--
-- Reuses the public.permit_stage enum from Phase 2A (11 values covering
-- the full Category B path). No enum extension is required.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.student_permit_milestones (
  id               uuid                NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid                NOT NULL,
  student_id       uuid                NOT NULL,
  licence_category text                NOT NULL,
  milestone        public.permit_stage NOT NULL,
  achieved_at      timestamptz         NOT NULL DEFAULT now(),
  achieved_by      uuid,
  notes            text,
  created_by       uuid,
  created_at       timestamptz         NOT NULL DEFAULT now(),

  CONSTRAINT spm_pkey             PRIMARY KEY (id),
  CONSTRAINT spm_org_fkey         FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT spm_student_fkey     FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE RESTRICT,
  CONSTRAINT spm_achieved_by_fkey FOREIGN KEY (achieved_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT spm_created_by_fkey  FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Each milestone may be recorded exactly once per (student, category)
  CONSTRAINT spm_student_category_milestone_unique
    UNIQUE (student_id, licence_category, milestone),

  CONSTRAINT spm_licence_category_check CHECK (
    licence_category IN ('AM','A1','A2','A','B','BE','C','C1','CE','D','D1','DE','T')
  )
);

COMMENT ON TABLE public.student_permit_milestones IS
  'Append-only log of achieved permit milestones, one row per '
  '(student, licence_category, milestone). Enables multi-category tracking. '
  'Rows are never modified or deleted — they are the audit record itself. '
  'The AFTER INSERT trigger in phase2fa_events.sql synchronises '
  'students.permit_stage when the milestone matches the student''s primary category.';

COMMENT ON COLUMN public.student_permit_milestones.achieved_by IS
  'The staff member who certified or witnessed the milestone (e.g. signed off '
  'the risk education certificate). Distinct from created_by (who entered the '
  'record into the system). NULL when recorded automatically by a system process.';

COMMENT ON COLUMN public.student_permit_milestones.milestone IS
  'Reuses the public.permit_stage enum from Phase 2A — no duplication. '
  'Covers the full Category B path (11 values: not_started → licence_issued). '
  'For other licence categories the same enum values mark equivalent milestones.';

-- No triggers in this file for student_permit_milestones.
-- The AFTER INSERT trigger for outbox event emission and permit_stage sync
-- is defined in 20260528000016_phase2fa_events.sql.


-- =============================================================================
-- SECTION 9: EXTEND LESSON_TYPES
--
-- Two nullable columns are added to the existing lesson_types table:
--
--   lesson_category_id
--     Links a lesson type to the platform taxonomy. Enables training plan
--     step progress tracking: lesson_block steps accumulate lessons counted
--     against the step's required_lesson_count by matching lesson_category_id.
--     NULL = uncategorised (legacy or administrative lesson types).
--
--   required_permit_stage
--     Gates student booking eligibility in the self-booking portal (Phase 2F-B).
--     Students who have not yet reached this permit_stage cannot book this
--     lesson type via the portal. Checked in the self-booking RPC.
--     NULL = no prerequisite; any student may book.
--
-- ADD COLUMN IF NOT EXISTS guards allow safe re-execution of this migration.
-- Both columns are nullable: existing lesson_types rows are unaffected.
-- =============================================================================

ALTER TABLE public.lesson_types
  ADD COLUMN IF NOT EXISTS lesson_category_id    uuid
    REFERENCES public.lesson_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS required_permit_stage public.permit_stage;

COMMENT ON COLUMN public.lesson_types.lesson_category_id IS
  'Links this lesson type to a lesson_categories entry. Used by training plan '
  'step completion logic to count lessons of the matching category toward '
  'a student''s step progress. NULL = uncategorised lesson type.';

COMMENT ON COLUMN public.lesson_types.required_permit_stage IS
  'Minimum permit_stage a student must have reached before booking this lesson '
  'type via the self-booking portal. Enforced in the self-booking RPC (Phase 2F-B). '
  'Not enforced for staff-created bookings. NULL = no prerequisite.';


-- =============================================================================
-- SECTION 10: EXTEND LESSON_BOOKINGS
--
-- One nullable column is added to the existing lesson_bookings table:
--
--   training_plan_step_id
--     Optional link to the student_training_plan_steps row this booking
--     contributes to. When set, the advance_training_plan_step() RPC counts
--     bookings WHERE training_plan_step_id = <step_id> AND status = 'completed'
--     to compute lessons_completed_count and hours_completed_decimal.
--
--     ON DELETE SET NULL: if the step row is removed (edge case), the booking
--     history is fully preserved with the plan link cleared to NULL.
--
--     The existing lesson_booking_set_slot_fields BEFORE INSERT trigger
--     from Phase 2B does not reference this column and is unaffected.
--
--     NULL = ad-hoc booking not associated with any training plan step.
-- =============================================================================

ALTER TABLE public.lesson_bookings
  ADD COLUMN IF NOT EXISTS training_plan_step_id uuid
    REFERENCES public.student_training_plan_steps(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lesson_bookings.training_plan_step_id IS
  'Optional reference to the student_training_plan_steps row this booking '
  'counts towards. Set when a booking is made in the context of a training '
  'plan step (e.g. via the student portal in Phase 2F-B). '
  'NULL for ad-hoc bookings. See idx_lb_plan_step in phase2fa_indexes.sql.';


-- =============================================================================
-- SECTION 11: SOFT DELETE / SOFT RESTORE — WHITELIST EXTENSION
--
-- CREATE OR REPLACE extends the Phase 1B.2 soft_delete() / soft_restore()
-- functions to include the Phase 2F-A tables that support soft deletion.
--
-- CUMULATIVE REPLACEMENT:
--   This CREATE OR REPLACE includes every table whitelisted in all prior
--   phases. If a prior-phase table is absent here, calling soft_delete() on
--   it will begin raising 'table not whitelisted' errors. Keep both functions
--   in sync with each other and complete across all phases.
--
-- Tables added in Phase 2F-A:
--   training_plan_templates  — templates are retired, not erased
--   student_training_plans   — enrollments are soft-deleted for audit
--   lesson_waitlist_entries  — entries are soft-deleted on cleanup
--
-- Tables intentionally excluded (append-only or cascade-managed):
--   training_plan_template_steps  (cascade from template)
--   student_training_plan_steps   (cascade from enrollment)
--   student_permit_milestones     (append-only, never deleted)
--   lesson_categories             (reference data, migration-only mutations)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.soft_delete(
  p_table_name  text,
  p_record_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table_name NOT IN (
    -- Phase 1B.2:
    'organizations',
    'organization_locations',
    'profiles',
    -- Phase 2A:
    'students',
    'student_notes',
    'student_documents',
    'instructors',
    'vehicles',
    -- Phase 2B:
    'lesson_slots',
    'lesson_bookings',
    'booking_attendance',
    'booking_notes',
    -- Phase 2F-A:
    'training_plan_templates',
    'student_training_plans',
    'lesson_waitlist_entries'
  ) THEN
    RAISE EXCEPTION
      'soft_delete: table ''%'' is not whitelisted. '
      'Add it to the whitelist in the current phase migration before calling soft_delete().',
      p_table_name
      USING ERRCODE = '42P01';
  END IF;

  EXECUTE format(
    'UPDATE public.%I '
    'SET deleted_at = now(), deleted_by = $1 '
    'WHERE id = $2 AND deleted_at IS NULL',
    p_table_name
  ) USING auth.uid(), p_record_id;
END;
$$;

COMMENT ON FUNCTION public.soft_delete(text, uuid) IS
  'Sets deleted_at = now() and deleted_by = auth.uid() on the target row. '
  'Only operates on tables in the explicit whitelist (checked before execution). '
  'No-op when the row is already soft-deleted (WHERE deleted_at IS NULL guard). '
  'Cumulative whitelist: update via CREATE OR REPLACE in each phase migration '
  'that introduces new soft-deleteable tables.';

CREATE OR REPLACE FUNCTION public.soft_restore(
  p_table_name  text,
  p_record_id   uuid,
  p_org_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table_name NOT IN (
    -- Phase 1B.2:
    'organizations',
    'organization_locations',
    'profiles',
    -- Phase 2A:
    'students',
    'student_notes',
    'student_documents',
    'instructors',
    'vehicles',
    -- Phase 2B:
    'lesson_slots',
    'lesson_bookings',
    'booking_attendance',
    'booking_notes',
    -- Phase 2F-A:
    'training_plan_templates',
    'student_training_plans',
    'lesson_waitlist_entries'
  ) THEN
    RAISE EXCEPTION
      'soft_restore: table ''%'' is not whitelisted.',
      p_table_name
      USING ERRCODE = '42P01';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1',
    p_table_name
  ) USING p_record_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id,
    entity_type, entity_id,
    operation, table_name,
    occurred_at
  ) VALUES (
    COALESCE(p_org_id, public.auth_organization_id()),
    auth.uid(),
    p_table_name, p_record_id,
    'RESTORE', p_table_name,
    now()
  );
END;
$$;

COMMENT ON FUNCTION public.soft_restore(text, uuid, uuid) IS
  'Clears deleted_at and deleted_by on the target row, restoring it to active state. '
  'Inserts a RESTORE entry into audit_logs. p_org_id defaults to auth_organization_id() when NULL. '
  'Only operates on tables in the soft_delete whitelist. '
  'Must be kept in sync with soft_delete() — same whitelist, same phase comments.';


-- =============================================================================
-- SECTION 12: ENABLE ROW LEVEL SECURITY
--
-- RLS is enabled immediately after all tables are created. With no policies
-- yet defined, PostgreSQL's default-deny behaviour locks down all new tables
-- until phase2fa_rls.sql adds the appropriate policies. This is the secure
-- default — unauthenticated and authenticated requests are both blocked until
-- the correct policies are in place.
--
-- lesson_categories has no organization_id. Its SELECT policy (USING (true))
-- is defined in phase2fa_rls.sql. Without it, even authenticated users cannot
-- read category data — this default-deny state is intentional between files.
-- =============================================================================

ALTER TABLE public.lesson_categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_plan_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_plan_template_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_training_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_training_plan_steps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_waitlist_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_permit_milestones    ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 13: REVOKE ANONYMOUS ACCESS
--
-- Supabase grants SELECT to the anon role by default on all public tables.
-- Revoke all privileges so that unauthenticated requests cannot reach
-- Phase 2F-A tables regardless of RLS policy state. Authenticated access
-- is established via GRANT SELECT and RLS policies in phase2fa_rls.sql.
-- =============================================================================

REVOKE ALL ON TABLE public.lesson_categories            FROM anon;
REVOKE ALL ON TABLE public.training_plan_templates      FROM anon;
REVOKE ALL ON TABLE public.training_plan_template_steps FROM anon;
REVOKE ALL ON TABLE public.student_training_plans       FROM anon;
REVOKE ALL ON TABLE public.student_training_plan_steps  FROM anon;
REVOKE ALL ON TABLE public.lesson_waitlist_entries      FROM anon;
REVOKE ALL ON TABLE public.student_permit_milestones    FROM anon;
