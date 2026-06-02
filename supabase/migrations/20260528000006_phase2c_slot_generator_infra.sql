-- =============================================================================
-- MIGRATION: 20260528000006_phase2c_slot_generator_infra.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2C — Slot Generation Engine (Infrastructure)
-- Description:
--   Observability table (scheduling_generation_runs), RLS policies, two new
--   generation permissions, hot-path indexes for the slot generation engine,
--   and architecture documentation for future background worker integration.
--
-- Execution order:
--   1.  20260527000001_enterprise_foundation.sql
--   2.  20260527000002_phase1b2_hardening.sql
--   3.  20260528000001_phase2a_domain_foundation.sql
--   4.  20260528000002_phase2b_scheduling_core.sql
--   5.  20260528000003_phase2b_scheduling_rls.sql
--   6.  20260528000004_phase2b_scheduling_events.sql
--   7.  20260528000005_phase2b_scheduling_indexes.sql
--   8.  20260528000006_phase2c_slot_generator_infra.sql   ← this file
--   9.  20260528000007_phase2c_slot_generator_functions.sql
--
-- Dependencies:
--   Phase 1A:  organizations, auth helpers (auth_organization_id,
--              has_permission, is_platform_admin), permissions, roles
--   Phase 1B:  auth.users, audit_trigger_fn()
--   Phase 2B:  lesson_types, lesson_slots (idempotency index target)
-- =============================================================================

-- =============================================================================
-- SECTION 1: SCHEDULING_GENERATION_RUNS (OBSERVABILITY TABLE)
-- Tracks every invocation of the slot generation engine.
--
-- WRITE PATH: SECURITY DEFINER generation functions only — they bypass RLS.
--   generate_slots_for_rule()         — increments records_* counters
--   generate_slots_for_organization() — creates and finalises the run record
-- READ PATH: org staff with scheduling:generation:read; platform admins.
--
-- No direct INSERT/UPDATE/DELETE via REST API. The absence of write RLS
-- policies enforces this at the database level.
-- =============================================================================

CREATE TABLE public.scheduling_generation_runs (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL,

  -- Scope identifies which level was invoked
  generation_scope text        NOT NULL,  -- 'rule' | 'instructor' | 'organization'
  scope_id         uuid,                   -- rule_id, instructor_id, or org_id
  lesson_type_id   uuid,                   -- lesson type used in this run

  start_date       date        NOT NULL,
  end_date         date        NOT NULL,

  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,

  -- Statistics accumulated by generate_slots_for_rule() per rule call
  records_created    integer   NOT NULL DEFAULT 0,
  records_skipped    integer   NOT NULL DEFAULT 0,
  conflicts_detected integer   NOT NULL DEFAULT 0,

  -- Lifecycle:
  --   'running'   → generation in progress
  --   'completed' → all slots created, zero conflicts
  --   'partial'   → completed but some time windows had EXCLUDE conflicts
  --   'failed'    → unhandled error; see error_message
  status         text        NOT NULL DEFAULT 'running',
  error_message  text,

  -- Attribution: NULL when triggered by a background worker with no JWT context
  triggered_by   uuid,

  -- Extensible metadata for future workers (trigger source, batch ID, etc.)
  metadata       jsonb       NOT NULL DEFAULT '{}',

  CONSTRAINT scheduling_generation_runs_pkey         PRIMARY KEY (id),
  CONSTRAINT scheduling_generation_runs_org_fkey     FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_generation_runs_user_fkey    FOREIGN KEY (triggered_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT scheduling_generation_runs_lt_fkey      FOREIGN KEY (lesson_type_id)
    REFERENCES public.lesson_types(id) ON DELETE SET NULL,
  CONSTRAINT scheduling_generation_runs_scope_check  CHECK (
    generation_scope IN ('rule', 'instructor', 'organization')
  ),
  CONSTRAINT scheduling_generation_runs_status_check CHECK (
    status IN ('running', 'completed', 'partial', 'failed')
  ),
  CONSTRAINT scheduling_generation_runs_date_order   CHECK (start_date <= end_date),
  CONSTRAINT scheduling_generation_runs_stats_nn     CHECK (
    records_created >= 0 AND records_skipped >= 0 AND conflicts_detected >= 0
  )
);

COMMENT ON TABLE  public.scheduling_generation_runs IS
  'Operational log of slot generation engine runs. Written exclusively by '
  'SECURITY DEFINER generation functions. Read by org staff and platform admins. '
  'Provides debugging visibility, background worker management, and admin dashboards.';
COMMENT ON COLUMN public.scheduling_generation_runs.generation_scope IS
  '''rule'' = single-rule run; ''instructor'' = all rules for one instructor; '
  '''organization'' = all instructors in org (standard production run).';
COMMENT ON COLUMN public.scheduling_generation_runs.conflicts_detected IS
  'Count of slot-time windows where an EXCLUDE constraint blocked generation '
  '(instructor or vehicle time already occupied). Non-zero → status = ''partial''.';
COMMENT ON COLUMN public.scheduling_generation_runs.records_skipped IS
  'Count of slot windows skipped: idempotency hits (slot exists) + exception '
  'cancellations + approved time-off blocks.';
COMMENT ON COLUMN public.scheduling_generation_runs.metadata IS
  'Extensible JSONB for future workers: trigger_source (''api'', ''cron'', '
  '''edge_function''), batch_id, worker_id, horizon_weeks, etc.';

REVOKE ALL ON TABLE public.scheduling_generation_runs FROM anon;

-- =============================================================================
-- SECTION 2: RLS FOR SCHEDULING_GENERATION_RUNS
-- Write policies are intentionally absent — all writes use SECURITY DEFINER
-- functions which bypass RLS. REST API callers can only SELECT.
-- =============================================================================

ALTER TABLE public.scheduling_generation_runs ENABLE ROW LEVEL SECURITY;

-- Org staff with scheduling:generation:read can read their org's run history
CREATE POLICY "generation_runs_select_staff"
  ON public.scheduling_generation_runs FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:generation:read')
  );

-- Platform admin has full read visibility across all organisations
CREATE POLICY "generation_runs_select_platform"
  ON public.scheduling_generation_runs FOR SELECT
  USING (public.is_platform_admin());

-- =============================================================================
-- SECTION 3: GENERATION PERMISSIONS
-- Two new permissions in the scheduling domain.
-- =============================================================================

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(),
   'scheduling:generation:read',
   'scheduling', 'generation', 'read',
   'View slot generation run history and observability dashboard'),
  (gen_random_uuid(),
   'scheduling:generation:run',
   'scheduling', 'generation', 'run',
   'Trigger recurring slot generation for an organisation');

-- org_owner, org_admin: full generation access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin')
  AND  r.is_system_role = true
  AND  p.code IN ('scheduling:generation:read', 'scheduling:generation:run');

-- org_manager: full generation access (responsible for scheduling operations)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_manager'
  AND  r.is_system_role = true
  AND  p.code IN ('scheduling:generation:read', 'scheduling:generation:run');

-- =============================================================================
-- SECTION 4: HOT-PATH INDEXES
-- Only indexes that are new in Phase 2C. All Phase 2B indexes are unchanged.
-- =============================================================================

-- Idempotency check in generate_slots_for_rule() — called per candidate window:
--   WHERE availability_rule_id = ? AND lesson_type_id = ? AND starts_at = ?
--         AND deleted_at IS NULL
CREATE INDEX idx_lesson_slots_rule_type_time
  ON public.lesson_slots (availability_rule_id, lesson_type_id, starts_at)
  WHERE availability_rule_id IS NOT NULL AND deleted_at IS NULL;

-- Dashboard: most recent generation runs per organisation
CREATE INDEX idx_generation_runs_org_started
  ON public.scheduling_generation_runs (organization_id, started_at DESC);

-- Monitoring: find in-flight or failed runs for retry logic and alerting
CREATE INDEX idx_generation_runs_status
  ON public.scheduling_generation_runs (status, organization_id)
  WHERE status IN ('running', 'failed');

-- =============================================================================
-- SECTION 5: CONCURRENCY PREPARATION — FUTURE WORKER ARCHITECTURE
-- No implementation. Architecture hooks and options documented only.
-- =============================================================================

-- OPTION A — pg_cron (in-database, Supabase natively supports):
--   SELECT cron.schedule(
--     'weekly-slot-generation',
--     '0 2 * * 1',   -- every Monday at 02:00 UTC (off-peak)
--     $cron$
--       DO $$
--       DECLARE v_org RECORD;
--       BEGIN
--         FOR v_org IN SELECT id FROM public.organizations WHERE is_active = true LOOP
--           PERFORM generate_slots_for_organization(
--             v_org.id, lesson_type_id,
--             CURRENT_DATE + 1,
--             CURRENT_DATE + 15
--           );
--         END LOOP;
--       END $$;
--     $cron$
--   );
--
-- OPTION B — Edge Function cron (Supabase scheduled functions):
--   supabase/functions/generate-slots/index.ts
--   Scheduled weekly. Queries active orgs × lesson types, calls
--   generate_slots_for_organization() via the service-role Supabase client.
--   Advantage: per-org parallelism, error isolation, retryable with backoff.
--
-- OPTION C — Queue-based (future high-scale):
--   INSERT INTO slot_generation_queue (org_id, lesson_type_id, start_date, end_date)
--     for each org × lesson_type combination.
--   Worker: SELECT ... FOR UPDATE SKIP LOCKED + generate_slots_for_rule().
--   SKIP LOCKED enables safe parallel workers without double-processing.
--
-- ADVISORY LOCK pattern (prevent parallel organisation-level runs):
--   Activate in generate_slots_for_organization() when adding background workers:
--     PERFORM pg_advisory_xact_lock(
--       hashtext('slot_gen_org:' || p_organization_id::text)
--     );
--   Place before the INSERT into scheduling_generation_runs.
--   Ensures only one generation run per org is active at a time.
--
-- Per-instructor parallelism (finer-grained, Phase 3+):
--     PERFORM pg_advisory_xact_lock(
--       hashtext('slot_gen_inst:' || p_instructor_id::text)
--     );
--   Place at the start of generate_slots_for_instructor().
--   Allows generating multiple instructors in parallel while serialising per instructor.
