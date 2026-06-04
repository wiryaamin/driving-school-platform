-- =============================================================================
-- MIGRATION: 20260528000008_phase2d_scheduling_ops_infra.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2D — Scheduling Operations & Worker Orchestration (Infrastructure)
-- Description:
--   Operational scheduling infrastructure built on top of the Phase 2C
--   generation engine. Adds:
--     • scheduling_generation_configs  — per-org/lesson-type orchestration config
--     • scheduling_health_snapshots    — daily operational health records
--     • RLS for both tables
--     • 3 new operational permissions
--     • 2 hot-path indexes
--     • Background worker architecture documentation
--
-- Execution order:
--   1.  20260527000001_enterprise_foundation.sql
--   2.  20260527000002_phase1b2_hardening.sql
--   3.  20260528000001_phase2a_domain_foundation.sql
--   4.  20260528000002_phase2b_scheduling_core.sql
--   5.  20260528000003_phase2b_scheduling_rls.sql
--   6.  20260528000004_phase2b_scheduling_events.sql
--   7.  20260528000005_phase2b_scheduling_indexes.sql
--   8.  20260528000006_phase2c_slot_generator_infra.sql
--   9.  20260528000007_phase2c_slot_generator_functions.sql
--   10. 20260528000008_phase2d_scheduling_ops_infra.sql     ← this file
--   11. 20260528000009_phase2d_scheduling_ops_functions.sql
--
-- Dependencies:
--   Phase 1A:  organizations, has_permission, is_platform_admin, auth_organization_id
--   Phase 1B:  auth.users
--   Phase 2B:  lesson_types, lesson_slots, lesson_slot_status enum
--   Phase 2C:  scheduling_generation_runs
-- =============================================================================


-- =============================================================================
-- SECTION 1: SCHEDULING_GENERATION_CONFIGS
-- Per-organisation, per-lesson-type configuration for the automated slot
-- generation engine. One record per (organization, lesson_type) pair.
--
-- WRITE PATH: Org staff with scheduling:config:write (INSERT/UPDATE/DELETE via RLS).
--             Background workers UPDATE last_generation_at / next_generation_at
--             via a service-role connection (bypasses RLS).
-- READ PATH:  Org staff with scheduling:config:read; platform admins.
-- =============================================================================

CREATE TABLE public.scheduling_generation_configs (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL,
  lesson_type_id          uuid        NOT NULL,

  -- How far ahead to materialise slots from the current date
  generation_horizon_days integer     NOT NULL DEFAULT 30,

  -- Trigger cadence for background workers:
  --   'daily'  — nightly generation run
  --   'weekly' — weekly generation run (standard)
  --   'manual' — operator-triggered only; auto_generation_enabled forced false
  generation_frequency    text        NOT NULL DEFAULT 'weekly',

  -- Automation state
  auto_generation_enabled boolean     NOT NULL DEFAULT false,
  last_generation_at      timestamptz,
  next_generation_at      timestamptz,

  -- Retry / exponential backoff for failed runs
  retry_count             integer     NOT NULL DEFAULT 0,
  max_retry_count         integer     NOT NULL DEFAULT 3,
  failure_backoff_minutes integer     NOT NULL DEFAULT 60,

  is_active               boolean     NOT NULL DEFAULT true,

  -- Extensible: trigger_source, batch_id, worker_id, last_error_run_id, etc.
  metadata                jsonb       NOT NULL DEFAULT '{}',

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scheduling_generation_configs_pkey         PRIMARY KEY (id),
  CONSTRAINT scheduling_generation_configs_org_fkey     FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT scheduling_generation_configs_lt_fkey      FOREIGN KEY (lesson_type_id)
    REFERENCES public.lesson_types(id) ON DELETE RESTRICT,

  -- One config per (org, lesson_type) pair
  CONSTRAINT scheduling_generation_configs_org_lt_uniq  UNIQUE (organization_id, lesson_type_id),

  CONSTRAINT scheduling_generation_configs_freq_check   CHECK (
    generation_frequency IN ('daily', 'weekly', 'manual')
  ),
  CONSTRAINT scheduling_generation_configs_horizon_check CHECK (
    generation_horizon_days BETWEEN 1 AND 365
  ),
  CONSTRAINT scheduling_generation_configs_retry_check  CHECK (
    retry_count             >= 0
    AND max_retry_count     >= 0
    AND failure_backoff_minutes >= 0
  ),
  -- 'manual' frequency must always have auto disabled
  CONSTRAINT scheduling_generation_configs_manual_check CHECK (
    generation_frequency != 'manual' OR auto_generation_enabled = false
  )
);

COMMENT ON TABLE  public.scheduling_generation_configs IS
  'Per-org, per-lesson-type orchestration configuration for the recurring slot '
  'generation engine. Controls automation, generation horizon, retry policy, '
  'and worker scheduling state. One record per (organization, lesson_type) pair.';
COMMENT ON COLUMN public.scheduling_generation_configs.generation_frequency IS
  '''daily'' = nightly worker; ''weekly'' = weekly worker; '
  '''manual'' = operator-only; auto_generation_enabled is forced false by CHECK constraint.';
COMMENT ON COLUMN public.scheduling_generation_configs.generation_horizon_days IS
  'Workers generate slots up to CURRENT_DATE + generation_horizon_days. '
  'Incremental: idempotent generation safely extends existing horizon forward.';
COMMENT ON COLUMN public.scheduling_generation_configs.next_generation_at IS
  'Workers query: WHERE auto_generation_enabled = true AND is_active = true '
  'AND (next_generation_at IS NULL OR next_generation_at <= now()). '
  'Set by the worker after each run (success or failure).';
COMMENT ON COLUMN public.scheduling_generation_configs.retry_count IS
  'Consecutive failure count. Reset to 0 on successful generation. '
  'When retry_count >= max_retry_count, the worker sets is_active = false '
  'and emits a dead-letter alert for operator review.';
COMMENT ON COLUMN public.scheduling_generation_configs.failure_backoff_minutes IS
  'Base backoff for retries. Workers apply exponential backoff: '
  'next_generation_at = now() + failure_backoff_minutes * (2 ^ retry_count), '
  'capped at 1440 minutes (24 hours).';

REVOKE ALL ON TABLE public.scheduling_generation_configs FROM anon;


-- =============================================================================
-- SECTION 2: SCHEDULING_HEALTH_SNAPSHOTS
-- Daily point-in-time health record per organisation. Used for operational
-- dashboards, trend monitoring, and alerting.
--
-- WRITE PATH: SECURITY DEFINER capture_scheduling_health_snapshot() only.
--             No direct REST API writes — absence of write RLS policies enforces this.
-- READ PATH:  Org staff with scheduling:health:read; platform admins.
-- =============================================================================

CREATE TABLE public.scheduling_health_snapshots (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id             uuid        NOT NULL,
  snapshot_date               date        NOT NULL,

  -- Slot inventory (non-deleted slots only)
  future_slots_count          integer     NOT NULL DEFAULT 0,
  open_slots_count            integer     NOT NULL DEFAULT 0,
  booked_slots_count          integer     NOT NULL DEFAULT 0,
  cancelled_slots_count       integer     NOT NULL DEFAULT 0,
  orphaned_slots_count        integer     NOT NULL DEFAULT 0,

  -- Structural integrity
  overlapping_slots_detected  boolean     NOT NULL DEFAULT false,

  -- Generation health
  failed_generation_runs      integer     NOT NULL DEFAULT 0,

  -- NULL = no active auto-generation config or no lag detected.
  -- Positive value = how many days short of the configured horizon the furthest
  -- open slot is. Example: horizon = 30, furthest open slot = 18 days away → lag = 12.
  generation_lag_days         integer,

  -- Derived health classification:
  --   'healthy'  — all checks nominal
  --   'degraded' — failed generation runs or generation lag present
  --   'critical' — orphaned or overlapping slots, or integrity errors detected
  --   'unknown'  — no future slots to evaluate
  health_status               text        NOT NULL DEFAULT 'unknown',

  -- JSONB findings summary from validate_scheduling_integrity()
  metadata                    jsonb       NOT NULL DEFAULT '{}',

  created_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scheduling_health_snapshots_pkey          PRIMARY KEY (id),
  CONSTRAINT scheduling_health_snapshots_org_fkey      FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,

  -- One snapshot per (org, date); upserted by capture_scheduling_health_snapshot()
  CONSTRAINT scheduling_health_snapshots_org_date_uniq UNIQUE (organization_id, snapshot_date),

  CONSTRAINT scheduling_health_snapshots_status_check  CHECK (
    health_status IN ('healthy', 'degraded', 'critical', 'unknown')
  ),
  CONSTRAINT scheduling_health_snapshots_counts_check  CHECK (
    future_slots_count   >= 0 AND open_slots_count      >= 0 AND
    booked_slots_count   >= 0 AND cancelled_slots_count >= 0 AND
    orphaned_slots_count >= 0 AND failed_generation_runs >= 0
  )
);

COMMENT ON TABLE  public.scheduling_health_snapshots IS
  'Daily point-in-time scheduling health record per organisation. '
  'Written exclusively by capture_scheduling_health_snapshot() (SECURITY DEFINER). '
  'Designed for operational dashboards, alerting, and multi-week health trending.';
COMMENT ON COLUMN public.scheduling_health_snapshots.orphaned_slots_count IS
  'Active non-deleted slots referencing a deleted instructor or an inactive lesson type. '
  'These slots cannot be booked and indicate data drift requiring remediation.';
COMMENT ON COLUMN public.scheduling_health_snapshots.generation_lag_days IS
  'CURRENT_DATE + max_horizon_days − furthest_future_open_slot_date. '
  'NULL if no active auto-generation config exists or no lag is present. '
  'Positive value triggers ''degraded'' health status.';
COMMENT ON COLUMN public.scheduling_health_snapshots.metadata IS
  'JSON array of integrity findings from validate_scheduling_integrity(): '
  '[{"check": "...", "severity": "error|warning", "count": N}, ...]';

REVOKE ALL ON TABLE public.scheduling_health_snapshots FROM anon;


-- =============================================================================
-- SECTION 3: UPDATED_AT TRIGGER FOR SCHEDULING_GENERATION_CONFIGS
-- Keeps updated_at current on every row modification.
-- CREATE OR REPLACE is safe to run on repeated deployments.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_scheduling_generation_configs_updated_at
  BEFORE UPDATE ON public.scheduling_generation_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- SECTION 4: RLS — SCHEDULING_GENERATION_CONFIGS
-- Org staff can fully manage their own configs. Platform admins read via REST;
-- their mutations go via service-role (bypasses RLS by design).
-- =============================================================================

ALTER TABLE public.scheduling_generation_configs ENABLE ROW LEVEL SECURITY;

-- Org staff: read their organisation's configs
CREATE POLICY "gen_configs_select_staff"
  ON public.scheduling_generation_configs FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:config:read')
  );

-- Platform admin: read all org configs
CREATE POLICY "gen_configs_select_platform"
  ON public.scheduling_generation_configs FOR SELECT
  USING (public.is_platform_admin());

-- Org staff: create new config (org must match JWT org)
CREATE POLICY "gen_configs_insert_staff"
  ON public.scheduling_generation_configs FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:config:write')
  );

-- Org staff: modify own config; org cannot be changed to a different tenant
CREATE POLICY "gen_configs_update_staff"
  ON public.scheduling_generation_configs FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:config:write')
  )
  WITH CHECK (organization_id = public.auth_organization_id());

-- Org staff: delete own config
CREATE POLICY "gen_configs_delete_staff"
  ON public.scheduling_generation_configs FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:config:write')
  );


-- =============================================================================
-- SECTION 5: RLS — SCHEDULING_HEALTH_SNAPSHOTS
-- REST API is read-only. All writes go through SECURITY DEFINER functions.
-- Absence of INSERT/UPDATE/DELETE policies enforces write-through-function-only.
-- =============================================================================

ALTER TABLE public.scheduling_health_snapshots ENABLE ROW LEVEL SECURITY;

-- Org staff: read their organisation's health history
CREATE POLICY "health_snapshots_select_staff"
  ON public.scheduling_health_snapshots FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:health:read')
  );

-- Platform admin: full read visibility across all organisations
CREATE POLICY "health_snapshots_select_platform"
  ON public.scheduling_health_snapshots FOR SELECT
  USING (public.is_platform_admin());


-- =============================================================================
-- SECTION 6: OPERATIONAL PERMISSIONS (3 NEW)
-- scheduling:config:read  — view generation configs
-- scheduling:config:write — manage generation configs
-- scheduling:health:read  — view health snapshots and diagnostics
-- =============================================================================

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(),
   'scheduling:config:read',
   'scheduling', 'config', 'read',
   'View scheduling generation configuration and automation settings'),
  (gen_random_uuid(),
   'scheduling:config:write',
   'scheduling', 'config', 'manage',
   'Create, update, and delete scheduling generation configuration'),
  (gen_random_uuid(),
   'scheduling:health:read',
   'scheduling', 'health', 'read',
   'View scheduling health snapshots, integrity diagnostics, and operational status');

-- org_owner, org_admin: full operational access (config read+write, health read)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin')
  AND  r.is_system_role = true
  AND  p.code IN (
         'scheduling:config:read',
         'scheduling:config:write',
         'scheduling:health:read'
       );

-- org_manager: config read + health read (no config write — structural changes are owner/admin only)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name        = 'org_manager'
  AND  r.is_system_role = true
  AND  p.code IN (
         'scheduling:config:read',
         'scheduling:health:read'
       );


-- =============================================================================
-- SECTION 7: HOT-PATH INDEXES
-- =============================================================================

-- Worker hot-path: find configs due for their next generation run.
--   SELECT * FROM scheduling_generation_configs
--   WHERE auto_generation_enabled = true AND is_active = true
--     AND (next_generation_at IS NULL OR next_generation_at <= now())
--   ORDER BY next_generation_at NULLS FIRST;
-- NULLS FIRST ensures newly created configs with no next_generation_at
-- are processed before configs with a future scheduled time.
CREATE INDEX idx_gen_configs_auto_next
  ON public.scheduling_generation_configs (next_generation_at NULLS FIRST)
  WHERE auto_generation_enabled = true AND is_active = true;

-- Health monitoring: quickly find organisations in a degraded or critical state.
--   SELECT * FROM scheduling_health_snapshots
--   WHERE health_status IN ('degraded', 'critical') ORDER BY created_at DESC;
CREATE INDEX idx_health_snapshots_critical
  ON public.scheduling_health_snapshots (organization_id, created_at DESC)
  WHERE health_status IN ('degraded', 'critical');


-- =============================================================================
-- SECTION 8: BACKGROUND WORKER ARCHITECTURE — FUTURE REFERENCE
-- Production orchestration patterns. Activate when deploying background workers.
-- No implementation in this migration.
-- =============================================================================

-- ORCHESTRATION FLOW (activate when workers are deployed):
--
-- Step 1 — Worker wakes on schedule (pg_cron or Edge Function cron).
-- Step 2 — Worker queries due configs, locking rows for parallel safety:
--
--     SELECT id, organization_id, lesson_type_id,
--            generation_horizon_days, failure_backoff_minutes, retry_count
--     FROM   public.scheduling_generation_configs
--     WHERE  auto_generation_enabled = true
--       AND  is_active = true
--       AND  (next_generation_at IS NULL OR next_generation_at <= now())
--     ORDER  BY next_generation_at NULLS FIRST
--     FOR UPDATE SKIP LOCKED;   -- safe for parallel worker instances
--
-- Step 3 — For each config row, before calling the generation function:
--     PERFORM pg_advisory_xact_lock(
--       hashtext('slot_gen_org:' || organization_id::text)
--     );
--   This serialises concurrent org-level runs. Advisory lock is released
--   automatically at transaction end.
--
-- Step 4a — On generation success:
--     UPDATE public.scheduling_generation_configs
--     SET last_generation_at = now(),
--         next_generation_at = now() + CASE generation_frequency
--                                        WHEN 'daily'  THEN interval '1 day'
--                                        WHEN 'weekly' THEN interval '7 days'
--                                      END,
--         retry_count        = 0
--     WHERE id = config.id;
--
-- Step 4b — On generation failure (status = 'failed'):
--     DECLARE
--       v_new_retry integer := config.retry_count + 1;
--       v_backoff   integer := LEAST(
--                                config.failure_backoff_minutes * (2 ^ v_new_retry),
--                                1440    -- 24-hour cap
--                              );
--     BEGIN
--       UPDATE public.scheduling_generation_configs
--       SET retry_count        = v_new_retry,
--           next_generation_at = now() + make_interval(mins => v_backoff),
--           is_active          = CASE WHEN v_new_retry >= max_retry_count
--                                       THEN false    -- dead-letter: operator must reset
--                                     ELSE is_active
--                                END
--       WHERE id = config.id;
--     END;
--
-- DEAD-LETTER RECOVERY (operator steps when is_active becomes false):
--   1. Investigate the failed run via scheduling_generation_runs.error_message.
--   2. Resolve the underlying issue (stale rules, missing lesson_type, etc.).
--   3. UPDATE scheduling_generation_configs
--        SET is_active = true, retry_count = 0, next_generation_at = NULL
--        WHERE id = <config_id>;
--   4. Trigger regenerate_missing_slots() to fill the gap.
--
-- WORKER DEPLOYMENT OPTIONS:
--
-- OPTION A — pg_cron (simplest; runs inside the database):
--   SELECT cron.schedule(
--     'slot-generation-weekly',
--     '0 3 * * 1',   -- Monday 03:00 UTC
--     $$ CALL process_pending_generation_configs(); $$
--   );
--   Advantage: no external infra; runs in transaction context with advisory locks.
--   Disadvantage: blocks database; limited parallelism; no built-in retries.
--
-- OPTION B — Supabase Edge Function cron (recommended for production):
--   supabase/functions/slot-generation-worker/index.ts
--   Scheduled via supabase.toml or Dashboard. Uses service-role client.
--   Queries scheduling_generation_configs, calls generate_slots_for_organization()
--   per config. Parallelism per org via Promise.all (bounded concurrency).
--   Advantage: isolated per-org error boundaries; structured logging; retryable.
--
-- OPTION C — Queue-based (high-scale, Phase 3+):
--   Publisher (cron): INSERT INTO slot_generation_queue
--     (org_id, lesson_type_id, horizon_start, horizon_end)
--     SELECT organization_id, lesson_type_id,
--            CURRENT_DATE, CURRENT_DATE + generation_horizon_days
--     FROM scheduling_generation_configs
--     WHERE auto_generation_enabled = true AND is_active = true
--       AND (next_generation_at IS NULL OR next_generation_at <= now());
--   Consumer: SELECT ... FOR UPDATE SKIP LOCKED.
--   Advantage: fully decoupled; N workers; at-least-once semantics with dedup.
