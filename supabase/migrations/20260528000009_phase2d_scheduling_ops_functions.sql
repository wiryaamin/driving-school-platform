-- =============================================================================
-- MIGRATION: 20260528000009_phase2d_scheduling_ops_functions.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2D — Scheduling Operations & Worker Orchestration (Functions)
-- Description:
--   Four SECURITY DEFINER operational functions:
--
--   regenerate_missing_slots(org_id, start_date, end_date)
--     Detects and fills gaps in recurring slot coverage for all active lesson
--     types in an organisation. Delegates to generate_slots_for_organization()
--     per lesson type — idempotent by design.
--
--   retry_failed_generation_run(run_id)
--     Retries a failed or partial scheduling_generation_runs record. Creates a
--     new run record (preserving the original for audit) and re-executes the
--     same generation scope/range using the Phase 2C generation functions.
--
--   validate_scheduling_integrity(org_id)
--     Read-only diagnostic. Runs 10 structural and operational integrity checks
--     against lesson_slots, scheduling_generation_runs, and related tables.
--     Returns one row per failing check. Never mutates data.
--
--   capture_scheduling_health_snapshot(org_id, snapshot_date)
--     Combines slot inventory counts, orphan detection, overlap detection,
--     generation health metrics, and validate_scheduling_integrity() findings
--     into a single scheduling_health_snapshots row. Upserts by (org, date).
--
-- Execution order:
--   10. 20260528000008_phase2d_scheduling_ops_infra.sql  (must run first)
--   11. 20260528000009_phase2d_scheduling_ops_functions.sql  ← this file
--
-- Architecture notes:
--   • SECURITY DEFINER: all functions run as the DB owner, bypassing RLS to
--     read/write slots, generation runs, and health snapshots.
--   • Permission enforcement: checked at runtime when a JWT context is present.
--     Background workers (no JWT → auth.uid() IS NULL) bypass by design.
--   • validate_scheduling_integrity: NEVER mutates data. Safe for read replicas
--     and read-only monitoring connections (with SECURITY DEFINER caveat).
--   • capture_scheduling_health_snapshot: calls validate_scheduling_integrity
--     internally; callers need scheduling:health:read. All roles that hold
--     health:read also hold the generation:read required by the inner function.
-- =============================================================================


-- =============================================================================
-- SECTION 1: regenerate_missing_slots()
-- Fills gaps in recurring slot coverage across all active lesson types.
--
-- MECHANISM:
--   Iterates every active lesson_type for the organisation and calls
--   generate_slots_for_organization() for each. Because generation is
--   idempotent (existing non-deleted slots are skipped), this function is
--   safe to run at any time, including during live operations.
--
-- END DATE RESOLUTION:
--   If p_end_date is NULL, the function uses the maximum generation_horizon_days
--   from active scheduling_generation_configs for this org (defaults to 30 days
--   if no config exists). This aligns recovery runs with the configured horizon.
--
-- RETURN VALUE:
--   One row per lesson type processed, including the run_id created by
--   generate_slots_for_organization() for each. Zero rows = no active lesson types.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.regenerate_missing_slots(
  p_organization_id uuid,
  p_start_date      date DEFAULT CURRENT_DATE,
  p_end_date        date DEFAULT NULL
)
RETURNS TABLE (
  lesson_type_id  uuid,
  run_id          uuid,
  slots_created   integer,
  slots_skipped   integer,
  conflicts_found integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_horizon    integer;
  v_end_date   date;
  v_lt         RECORD;
  v_run_id     uuid;
  v_created    integer;
  v_skipped    integer;
  v_conflicts  integer;
BEGIN
  -- Permission check: enforced for JWT callers; background workers bypass.
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      IF public.auth_organization_id() IS DISTINCT FROM p_organization_id
         OR NOT public.has_permission('scheduling:generation:run')
      THEN
        RAISE EXCEPTION
          'regenerate_missing_slots: permission denied. '
          'Requires scheduling:generation:run in organisation %.',
          p_organization_id
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Resolve end date from parameter, config horizon, or default.
  IF p_end_date IS NOT NULL THEN
    v_end_date := p_end_date;
  ELSE
    SELECT COALESCE(MAX(gc.generation_horizon_days), 30)
    INTO   v_horizon
    FROM   public.scheduling_generation_configs gc
    WHERE  gc.organization_id = p_organization_id
      AND  gc.is_active       = true;

    v_end_date := p_start_date + make_interval(days => COALESCE(v_horizon, 30));
  END IF;

  IF v_end_date <= p_start_date THEN
    RAISE EXCEPTION
      'regenerate_missing_slots: resolved end_date (%) must be after start_date (%).',
      v_end_date, p_start_date;
  END IF;

  IF (v_end_date - p_start_date) > 365 THEN
    RAISE EXCEPTION
      'regenerate_missing_slots: date range % days exceeds maximum 365. '
      'Use a narrower window or split into batches.',
      (v_end_date - p_start_date);
  END IF;

  -- Iterate every active lesson type for this organisation.
  -- generate_slots_for_organization() is idempotent: it creates only the
  -- missing slots and skips any that already exist.
  FOR v_lt IN
    SELECT lt.id AS lt_id
    FROM   public.lesson_types lt
    WHERE  lt.organization_id = p_organization_id
      AND  lt.is_active       = true
    ORDER  BY lt.id
  LOOP
    SELECT r.run_id, r.slots_created, r.slots_skipped, r.conflicts_found
    INTO   v_run_id, v_created, v_skipped, v_conflicts
    FROM   public.generate_slots_for_organization(
             p_organization_id,
             v_lt.lt_id,
             p_start_date,
             v_end_date
           ) r;

    RETURN QUERY SELECT v_lt.lt_id, v_run_id, v_created, v_skipped, v_conflicts;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.regenerate_missing_slots IS
  'Fills recurring slot coverage gaps for all active lesson types in an '
  'organisation over [start_date, end_date]. Delegates to '
  'generate_slots_for_organization() per lesson type — fully idempotent. '
  'If p_end_date is NULL, uses the org''s configured generation_horizon_days '
  '(max across active configs, default 30 days). One result row per lesson type.';


-- =============================================================================
-- SECTION 2: retry_failed_generation_run()
-- Re-executes a failed or partial scheduling_generation_runs record.
--
-- AUDIT PRESERVATION:
--   A new run record is created for every retry. The original record is
--   annotated in metadata with { "retried_as": <new_run_id>, "retried_at": ... }.
--   The original record is NEVER overwritten or deleted. This preserves the
--   full failure history for post-incident analysis.
--
-- SCOPE DISPATCH:
--   'rule'         → calls generate_slots_for_rule()  (uses scope_id as rule_id)
--   'instructor'   → calls generate_slots_for_instructor() (scope_id = instructor_id)
--   'organization' → iterates instructors, calls generate_slots_for_instructor()
--                    for each, using the new run_id so stats accumulate there.
--                    Does NOT call generate_slots_for_organization() — that would
--                    create a second run record, creating two concurrent run records.
--
-- RETRYABLE STATUSES:
--   'failed'  — unhandled exception; slots generated up to the failure point.
--   'partial' — completed with EXCLUDE conflicts; some windows were skipped.
--   All other statuses ('running', 'completed') are rejected.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.retry_failed_generation_run(
  p_run_id uuid
)
RETURNS TABLE (
  new_run_id      uuid,
  slots_created   integer,
  slots_skipped   integer,
  conflicts_found integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run         RECORD;
  v_new_run_id  uuid;
  v_instructor  RECORD;
  v_created     integer := 0;
  v_skipped     integer := 0;
  v_conflicts   integer := 0;
  v_r_created   integer;
  v_r_skipped   integer;
  v_r_conflicts integer;
  v_i_rules     integer;
  v_i_created   integer;
  v_i_skipped   integer;
  v_i_conflicts integer;
BEGIN
  -- Permission check
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      IF public.auth_organization_id() IS NULL
         OR NOT public.has_permission('scheduling:generation:run')
      THEN
        RAISE EXCEPTION
          'retry_failed_generation_run: permission denied. '
          'Requires scheduling:generation:run.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Load the run record
  SELECT * INTO v_run
  FROM   public.scheduling_generation_runs
  WHERE  id = p_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'retry_failed_generation_run: generation run % not found.', p_run_id;
  END IF;

  -- Only failed or partial runs can be retried
  IF v_run.status NOT IN ('failed', 'partial') THEN
    RAISE EXCEPTION
      'retry_failed_generation_run: run % has status ''%''. '
      'Only ''failed'' or ''partial'' runs can be retried.',
      p_run_id, v_run.status;
  END IF;

  -- Validate that lesson_type_id still exists (ON DELETE SET NULL in Phase 2C)
  IF v_run.lesson_type_id IS NULL THEN
    RAISE EXCEPTION
      'retry_failed_generation_run: run % cannot be retried — '
      'lesson_type_id is NULL (lesson type was deleted).',
      p_run_id;
  END IF;

  -- For rule/instructor scopes, scope_id is required
  IF v_run.generation_scope IN ('rule', 'instructor') AND v_run.scope_id IS NULL THEN
    RAISE EXCEPTION
      'retry_failed_generation_run: run % cannot be retried — '
      'scope_id is NULL for scope ''%''.',
      p_run_id, v_run.generation_scope;
  END IF;

  -- Org membership guard for non-platform-admins
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
    IF v_run.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
      RAISE EXCEPTION
        'retry_failed_generation_run: permission denied — '
        'run % belongs to a different organisation.',
        p_run_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Create new run record for the retry.
  -- metadata.retried_from links back to the original for audit trail.
  INSERT INTO public.scheduling_generation_runs (
    organization_id,
    generation_scope,
    scope_id,
    lesson_type_id,
    start_date,
    end_date,
    status,
    triggered_by,
    metadata
  ) VALUES (
    v_run.organization_id,
    v_run.generation_scope,
    v_run.scope_id,
    v_run.lesson_type_id,
    v_run.start_date,
    v_run.end_date,
    'running',
    auth.uid(),
    jsonb_build_object('retried_from', p_run_id)
  )
  RETURNING id INTO v_new_run_id;

  -- Annotate the original run with the retry reference (non-destructive)
  UPDATE public.scheduling_generation_runs
  SET    metadata = metadata
                    || jsonb_build_object(
                         'retried_as', v_new_run_id,
                         'retried_at', now()::text
                       )
  WHERE  id = p_run_id;

  BEGIN
    IF v_run.generation_scope = 'rule' THEN
      -- -----------------------------------------------------------------------
      -- Rule scope: single rule × lesson_type × date range
      -- -----------------------------------------------------------------------
      SELECT r.slots_created, r.slots_skipped, r.conflicts_found
      INTO   v_r_created, v_r_skipped, v_r_conflicts
      FROM   public.generate_slots_for_rule(
               v_run.scope_id,
               v_run.lesson_type_id,
               v_run.start_date,
               v_run.end_date,
               v_new_run_id
             ) r;

      v_created   := v_r_created;
      v_skipped   := v_r_skipped;
      v_conflicts := v_r_conflicts;

    ELSIF v_run.generation_scope = 'instructor' THEN
      -- -----------------------------------------------------------------------
      -- Instructor scope: all rules for one instructor × lesson_type × date range
      -- -----------------------------------------------------------------------
      SELECT r.slots_created, r.slots_skipped, r.conflicts_found
      INTO   v_i_created, v_i_skipped, v_i_conflicts
      FROM   public.generate_slots_for_instructor(
               v_run.scope_id,
               v_run.lesson_type_id,
               v_run.start_date,
               v_run.end_date,
               v_new_run_id
             ) r;

      v_created   := v_i_created;
      v_skipped   := v_i_skipped;
      v_conflicts := v_i_conflicts;

    ELSIF v_run.generation_scope = 'organization' THEN
      -- -----------------------------------------------------------------------
      -- Organisation scope: replicate generate_slots_for_organization() logic
      -- using v_new_run_id so stats accumulate there, not in a second new record.
      -- -----------------------------------------------------------------------
      FOR v_instructor IN
        SELECT i.id
        FROM   public.instructors i
        WHERE  i.organization_id = v_run.organization_id
          AND  i.deleted_at      IS NULL
        ORDER  BY i.id
      LOOP
        SELECT r.rules_processed, r.slots_created, r.slots_skipped, r.conflicts_found
        INTO   v_i_rules, v_i_created, v_i_skipped, v_i_conflicts
        FROM   public.generate_slots_for_instructor(
                 v_instructor.id,
                 v_run.lesson_type_id,
                 v_run.start_date,
                 v_run.end_date,
                 v_new_run_id
               ) r;

        v_created   := v_created   + v_i_created;
        v_skipped   := v_skipped   + v_i_skipped;
        v_conflicts := v_conflicts + v_i_conflicts;
      END LOOP;
    END IF;

    -- Finalise the new run.
    -- conflicts_detected is already accumulated in the DB row by generate_slots_for_rule().
    UPDATE public.scheduling_generation_runs
    SET
      status       = CASE
                       WHEN conflicts_detected > 0 THEN 'partial'
                       ELSE 'completed'
                     END,
      completed_at = now()
    WHERE id = v_new_run_id;

  EXCEPTION WHEN OTHERS THEN
    -- Mark new run as failed; preserve error; re-raise for the caller.
    UPDATE public.scheduling_generation_runs
    SET
      status        = 'failed',
      completed_at  = now(),
      error_message = SQLERRM
    WHERE id = v_new_run_id;
    RAISE;
  END;

  RETURN QUERY SELECT v_new_run_id, v_created, v_skipped, v_conflicts;
END;
$$;

COMMENT ON FUNCTION public.retry_failed_generation_run IS
  'Retries a failed or partial scheduling_generation_runs record. '
  'Creates a NEW run record (original preserved for audit). '
  'Dispatches to the appropriate Phase 2C generation function based on scope. '
  'For organisation-scope retries, iterates instructors directly using the new '
  'run_id so stats accumulate in one record. Returns (new_run_id, created, skipped, conflicts).';


-- =============================================================================
-- SECTION 3: validate_scheduling_integrity()
-- Read-only diagnostic. Returns one row per failing check, empty if healthy.
--
-- CHECKS (10 total):
--   1. invalid_slot_window        [error]   ends_at <= starts_at
--   2. orphaned_slot_instructor   [error]   deleted/missing instructor
--   3. orphaned_slot_lesson_type  [error]   inactive/missing lesson type
--   4. broken_recurring_lineage   [warning] availability_rule_id set but rule gone
--   5. duplicate_generation_anomaly [error] same (rule, lesson_type, starts_at) > 1 slot
--   6. instructor_slot_overlap    [error]   overlapping future active slots (same instructor)
--   7. stale_generation_run       [warning] run stuck in 'running' > 1 hour
--   8. generation_horizon_gap     [warning] furthest open slot < configured horizon
--   9. slot_outside_rule_window   [warning] slot local time outside source rule window
--  10. timezone_mismatch          [warning] slot timezone differs from current rule timezone
--
-- SAFETY:
--   This function NEVER modifies any data. It is safe to call on read replicas,
--   during maintenance windows, and from monitoring pipelines.
--
-- PERFORMANCE NOTES:
--   Check 6 (instructor_slot_overlap) uses a self-join on lesson_slots.
--   It is limited to future slots (starts_at > CURRENT_DATE - 1) for performance.
--   In a correctly operating database the Phase 2B EXCLUDE constraint prevents
--   overlaps; this check catches data imported outside the constraint.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_scheduling_integrity(
  p_organization_id uuid
)
RETURNS TABLE (
  check_name     text,
  severity       text,
  affected_count integer,
  sample_ids     uuid[],
  description    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permission check
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      IF public.auth_organization_id() IS DISTINCT FROM p_organization_id
         OR NOT public.has_permission('scheduling:generation:read')
      THEN
        RAISE EXCEPTION
          'validate_scheduling_integrity: permission denied. '
          'Requires scheduling:generation:read in organisation %.',
          p_organization_id
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- CHECK 1: Invalid slot windows (ends_at <= starts_at)
  -- Indicates corrupted data from direct inserts or a bug in generation logic.
  -- ---------------------------------------------------------------------------
  RETURN QUERY
  WITH affected AS (
    SELECT id FROM public.lesson_slots
    WHERE  organization_id = p_organization_id
      AND  deleted_at      IS NULL
      AND  ends_at         <= starts_at
  )
  SELECT
    'invalid_slot_window'::text,
    'error'::text,
    COUNT(*)::integer,
    ARRAY(SELECT id FROM affected ORDER BY id LIMIT 5),
    'Slots where ends_at ≤ starts_at; data integrity violation'::text
  FROM affected
  HAVING COUNT(*) > 0;

  -- ---------------------------------------------------------------------------
  -- CHECK 2: Orphaned slots — deleted or missing instructor
  -- Slots that reference an instructor who has been soft-deleted or whose
  -- record is missing. These slots cannot be offered to students.
  -- ---------------------------------------------------------------------------
  RETURN QUERY
  WITH affected AS (
    SELECT s.id
    FROM   public.lesson_slots s
    LEFT   JOIN public.instructors i ON s.instructor_id = i.id
    WHERE  s.organization_id = p_organization_id
      AND  s.deleted_at      IS NULL
      AND  (i.id IS NULL OR i.deleted_at IS NOT NULL)
  )
  SELECT
    'orphaned_slot_instructor'::text,
    'error'::text,
    COUNT(*)::integer,
    ARRAY(SELECT id FROM affected ORDER BY id LIMIT 5),
    'Active slots referencing a deleted or missing instructor'::text
  FROM affected
  HAVING COUNT(*) > 0;

  -- ---------------------------------------------------------------------------
  -- CHECK 3: Orphaned slots — inactive or cross-org lesson type
  -- Slots that reference a lesson type that has been deactivated, deleted,
  -- or belongs to a different organisation.
  -- ---------------------------------------------------------------------------
  RETURN QUERY
  WITH affected AS (
    SELECT s.id
    FROM   public.lesson_slots s
    LEFT   JOIN public.lesson_types lt ON s.lesson_type_id = lt.id
    WHERE  s.organization_id = p_organization_id
      AND  s.deleted_at      IS NULL
      AND  (
             lt.id IS NULL
             OR lt.is_active       = false
             OR lt.organization_id != p_organization_id
           )
  )
  SELECT
    'orphaned_slot_lesson_type'::text,
    'error'::text,
    COUNT(*)::integer,
    ARRAY(SELECT id FROM affected ORDER BY id LIMIT 5),
    'Active slots referencing an inactive, missing, or cross-org lesson type'::text
  FROM affected
  HAVING COUNT(*) > 0;

  -- ---------------------------------------------------------------------------
  -- CHECK 4: Broken recurring lineage
  -- Slots with availability_rule_id set but the source rule no longer exists.
  -- The slots themselves are valid but cannot be correlated to a rule for
  -- regeneration, exception, or roster analysis.
  -- ---------------------------------------------------------------------------
  RETURN QUERY
  WITH affected AS (
    SELECT s.id
    FROM   public.lesson_slots s
    LEFT   JOIN public.instructor_availability_rules r ON s.availability_rule_id = r.id
    WHERE  s.organization_id       = p_organization_id
      AND  s.deleted_at            IS NULL
      AND  s.availability_rule_id  IS NOT NULL
      AND  r.id                    IS NULL
  )
  SELECT
    'broken_recurring_lineage'::text,
    'warning'::text,
    COUNT(*)::integer,
    ARRAY(SELECT id FROM affected ORDER BY id LIMIT 5),
    'Recurring slots whose source availability rule no longer exists'::text
  FROM affected
  HAVING COUNT(*) > 0;

  -- ---------------------------------------------------------------------------
  -- CHECK 5: Duplicate generation anomaly
  -- Multiple active slots sharing the same (availability_rule_id, lesson_type_id,
  -- starts_at). Should be impossible given the idempotency check in
  -- generate_slots_for_rule() and idx_lesson_slots_rule_type_time, but detects
  -- data introduced via direct inserts or import scripts that bypassed the guard.
  -- ---------------------------------------------------------------------------
  RETURN QUERY
  WITH dup_groups AS (
    SELECT availability_rule_id, lesson_type_id, starts_at
    FROM   public.lesson_slots
    WHERE  organization_id      = p_organization_id
      AND  deleted_at           IS NULL
      AND  availability_rule_id IS NOT NULL
    GROUP  BY availability_rule_id, lesson_type_id, starts_at
    HAVING COUNT(*) > 1
  ),
  affected AS (
    SELECT DISTINCT s.id
    FROM   public.lesson_slots s
    JOIN   dup_groups dg
           ON  s.availability_rule_id = dg.availability_rule_id
           AND s.lesson_type_id       = dg.lesson_type_id
           AND s.starts_at            = dg.starts_at
    WHERE  s.organization_id = p_organization_id
      AND  s.deleted_at      IS NULL
  )
  SELECT
    'duplicate_generation_anomaly'::text,
    'error'::text,
    COUNT(*)::integer,
    ARRAY(SELECT id FROM affected ORDER BY id LIMIT 5),
    'Multiple active slots share the same (rule, lesson_type, starts_at); idempotency breach'::text
  FROM affected
  HAVING COUNT(*) > 0;

  -- ---------------------------------------------------------------------------
  -- CHECK 6: Instructor slot overlaps (future window, for performance)
  -- The Phase 2B EXCLUDE constraint prevents this in normal operation.
  -- This check detects slots inserted via service-role, pg_restore, or imports
  -- that bypassed the EXCLUDE constraint.
  -- Scope: future and recent slots only (starts_at > CURRENT_DATE - 1).
  -- ---------------------------------------------------------------------------
  RETURN QUERY
  WITH overlap_slots AS (
    SELECT DISTINCT a.id
    FROM   public.lesson_slots a
    JOIN   public.lesson_slots b
           ON  a.instructor_id = b.instructor_id
           AND a.id            < b.id
    WHERE  a.organization_id = p_organization_id
      AND  b.organization_id = p_organization_id
      AND  a.deleted_at      IS NULL
      AND  b.deleted_at      IS NULL
      AND  a.status          != 'cancelled'::public.lesson_slot_status
      AND  b.status          != 'cancelled'::public.lesson_slot_status
      AND  a.starts_at       >  CURRENT_DATE - 1
      AND  b.starts_at       >  CURRENT_DATE - 1
      AND  tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')
  )
  SELECT
    'instructor_slot_overlap'::text,
    'error'::text,
    COUNT(*)::integer,
    ARRAY(SELECT id FROM overlap_slots ORDER BY id LIMIT 5),
    'Future active slots with overlapping time windows for the same instructor'::text
  FROM overlap_slots
  HAVING COUNT(*) > 0;

  -- ---------------------------------------------------------------------------
  -- CHECK 7: Stale generation runs stuck in 'running'
  -- A run that has been 'running' for more than 1 hour indicates a worker crash,
  -- a database restart mid-transaction, or a long-running unresponsive process.
  -- ---------------------------------------------------------------------------
  RETURN QUERY
  WITH affected AS (
    SELECT id FROM public.scheduling_generation_runs
    WHERE  organization_id = p_organization_id
      AND  status          = 'running'
      AND  started_at      < now() - interval '1 hour'
  )
  SELECT
    'stale_generation_run'::text,
    'warning'::text,
    COUNT(*)::integer,
    ARRAY(SELECT id FROM affected ORDER BY id LIMIT 5),
    'Generation runs stuck in ''running'' status for over 1 hour; possible worker crash'::text
  FROM affected
  HAVING COUNT(*) > 0;

  -- ---------------------------------------------------------------------------
  -- CHECK 8: Generation horizon gap
  -- The furthest future open slot is closer than the configured generation
  -- horizon. Workers should have materialised slots further ahead. Indicates
  -- missed generation runs, failed workers, or a config just enabled.
  -- Only fires when at least one active auto-generation config exists.
  -- ---------------------------------------------------------------------------
  RETURN QUERY
  WITH horizon_cfg AS (
    SELECT MIN(generation_horizon_days) AS min_horizon
    FROM   public.scheduling_generation_configs
    WHERE  organization_id         = p_organization_id
      AND  is_active               = true
      AND  auto_generation_enabled = true
  ),
  future_reach AS (
    SELECT MAX(starts_at::date) AS max_future_date
    FROM   public.lesson_slots
    WHERE  organization_id = p_organization_id
      AND  deleted_at      IS NULL
      AND  status          = 'open'::public.lesson_slot_status
      AND  starts_at       > now()
  )
  SELECT
    'generation_horizon_gap'::text,
    'warning'::text,
    (h.min_horizon - (f.max_future_date - CURRENT_DATE))::integer,
    ARRAY[]::uuid[],
    format(
      'Future open slots extend only %s days ahead; configured generation horizon is %s days',
      (f.max_future_date - CURRENT_DATE),
      h.min_horizon
    )::text
  FROM horizon_cfg h, future_reach f
  WHERE h.min_horizon     IS NOT NULL
    AND f.max_future_date IS NOT NULL
    AND (f.max_future_date - CURRENT_DATE) < h.min_horizon;

  -- ---------------------------------------------------------------------------
  -- CHECK 9: Slots outside rule time window
  -- Recurring slots (without a modified exception) whose local start time falls
  -- outside the source rule's [start_time, end_time) window. This can occur
  -- when a rule's times are updated after slots were generated.
  -- The UTC timestamps remain valid; only display/recalculation is affected.
  -- ---------------------------------------------------------------------------
  RETURN QUERY
  WITH affected AS (
    SELECT s.id
    FROM   public.lesson_slots s
    JOIN   public.instructor_availability_rules r ON s.availability_rule_id = r.id
    WHERE  s.organization_id    = p_organization_id
      AND  s.deleted_at         IS NULL
      AND  s.availability_rule_id IS NOT NULL
      AND  s.exception_id       IS NULL
      AND  s.generation_source  = 'recurring'::public.slot_generation_source
      AND  (
             -- Local start time is before the rule window open
             (s.starts_at AT TIME ZONE r.timezone)::time < r.start_time
             OR
             -- Local start time is at or after the rule window close
             (s.starts_at AT TIME ZONE r.timezone)::time >= r.end_time
           )
  )
  SELECT
    'slot_outside_rule_window'::text,
    'warning'::text,
    COUNT(*)::integer,
    ARRAY(SELECT id FROM affected ORDER BY id LIMIT 5),
    'Recurring slots whose local start time falls outside the current source rule time window'::text
  FROM affected
  HAVING COUNT(*) > 0;

  -- ---------------------------------------------------------------------------
  -- CHECK 10: Timezone mismatch between slot and current rule
  -- A recurring slot's timezone differs from its source rule's current timezone.
  -- UTC timestamps are correct; only local-time display is affected.
  -- Occurs when a rule's timezone is changed after slots are generated.
  -- ---------------------------------------------------------------------------
  RETURN QUERY
  WITH affected AS (
    SELECT s.id
    FROM   public.lesson_slots s
    JOIN   public.instructor_availability_rules r ON s.availability_rule_id = r.id
    WHERE  s.organization_id       = p_organization_id
      AND  s.deleted_at            IS NULL
      AND  s.availability_rule_id  IS NOT NULL
      AND  s.timezone              != r.timezone
  )
  SELECT
    'timezone_mismatch'::text,
    'warning'::text,
    COUNT(*)::integer,
    ARRAY(SELECT id FROM affected ORDER BY id LIMIT 5),
    'Recurring slots whose timezone differs from the current source rule timezone'::text
  FROM affected
  HAVING COUNT(*) > 0;

END;
$$;

COMMENT ON FUNCTION public.validate_scheduling_integrity IS
  'Read-only diagnostic: runs 10 structural and operational integrity checks '
  'against lesson_slots, scheduling_generation_runs, and related tables. '
  'Returns one row per failing check (empty = all checks passed). '
  'NEVER modifies data. Safe to call during live operations. '
  'Checks: invalid windows, orphaned slots, broken lineage, duplicate anomalies, '
  'instructor overlaps, stale runs, horizon gap, out-of-window slots, tz mismatch.';


-- =============================================================================
-- SECTION 4: capture_scheduling_health_snapshot()
-- Assembles a comprehensive scheduling health record and upserts it into
-- scheduling_health_snapshots for the given organisation and date.
--
-- HEALTH STATUS RULES:
--   'unknown'  — no future open slots (can't evaluate)
--   'critical' — any error-severity integrity finding, or orphaned slots > 0,
--                or overlapping future slots detected
--   'degraded' — failed generation runs in last 7 days, or generation lag > 0,
--                or any warning-severity integrity finding
--   'healthy'  — none of the above
--
-- UPSERT:
--   ON CONFLICT (organization_id, snapshot_date) DO UPDATE — re-running
--   capture_scheduling_health_snapshot on the same date refreshes the snapshot
--   with current values. Useful after incident remediation.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.capture_scheduling_health_snapshot(
  p_organization_id uuid,
  p_snapshot_date   date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id       uuid;
  v_future_slots      integer := 0;
  v_open_slots        integer := 0;
  v_booked_slots      integer := 0;
  v_cancelled_slots   integer := 0;
  v_orphaned_slots    integer := 0;
  v_overlapping       boolean := false;
  v_failed_runs       integer := 0;
  v_lag_days          integer;
  v_health_status     text    := 'unknown';
  v_has_critical      boolean := false;
  v_has_degraded      boolean := false;
  v_findings          jsonb   := '[]'::jsonb;
  v_check             RECORD;
  v_horizon           integer;
  v_max_future        date;
BEGIN
  -- Permission check
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      IF public.auth_organization_id() IS DISTINCT FROM p_organization_id
         OR NOT public.has_permission('scheduling:health:read')
      THEN
        RAISE EXCEPTION
          'capture_scheduling_health_snapshot: permission denied. '
          'Requires scheduling:health:read in organisation %.',
          p_organization_id
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Slot inventory counts
  -- ---------------------------------------------------------------------------
  SELECT
    COUNT(*) FILTER (WHERE starts_at > now()),
    COUNT(*) FILTER (WHERE starts_at > now()
                       AND status = 'open'::public.lesson_slot_status),
    COUNT(*) FILTER (WHERE starts_at > now()
                       AND current_bookings > 0),
    COUNT(*) FILTER (WHERE status = 'cancelled'::public.lesson_slot_status)
  INTO v_future_slots, v_open_slots, v_booked_slots, v_cancelled_slots
  FROM public.lesson_slots
  WHERE organization_id = p_organization_id
    AND deleted_at      IS NULL;

  -- ---------------------------------------------------------------------------
  -- Orphaned slot count
  -- Active slots with a deleted instructor OR an inactive lesson type.
  -- ---------------------------------------------------------------------------
  SELECT COUNT(*)
  INTO   v_orphaned_slots
  FROM   public.lesson_slots s
  WHERE  s.organization_id = p_organization_id
    AND  s.deleted_at      IS NULL
    AND  (
           NOT EXISTS (
             SELECT 1 FROM public.instructors i
             WHERE  i.id         = s.instructor_id
               AND  i.deleted_at IS NULL
           )
           OR NOT EXISTS (
             SELECT 1 FROM public.lesson_types lt
             WHERE  lt.id        = s.lesson_type_id
               AND  lt.is_active = true
           )
         );

  -- ---------------------------------------------------------------------------
  -- Instructor overlap detection (boolean; future slots only)
  -- ---------------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1
    FROM   public.lesson_slots a
    JOIN   public.lesson_slots b
           ON  a.instructor_id = b.instructor_id
           AND a.id            < b.id
    WHERE  a.organization_id = p_organization_id
      AND  b.organization_id = p_organization_id
      AND  a.deleted_at      IS NULL
      AND  b.deleted_at      IS NULL
      AND  a.status          != 'cancelled'::public.lesson_slot_status
      AND  b.status          != 'cancelled'::public.lesson_slot_status
      AND  a.starts_at       > now()
      AND  b.starts_at       > now()
      AND  tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')
    LIMIT 1
  ) INTO v_overlapping;

  -- ---------------------------------------------------------------------------
  -- Failed generation runs in the past 7 days
  -- ---------------------------------------------------------------------------
  SELECT COUNT(*)
  INTO   v_failed_runs
  FROM   public.scheduling_generation_runs
  WHERE  organization_id = p_organization_id
    AND  status          = 'failed'
    AND  started_at      >= now() - interval '7 days';

  -- ---------------------------------------------------------------------------
  -- Generation lag (days short of configured horizon)
  -- Uses the maximum configured horizon across active auto-generation configs.
  -- ---------------------------------------------------------------------------
  SELECT MAX(gc.generation_horizon_days)
  INTO   v_horizon
  FROM   public.scheduling_generation_configs gc
  WHERE  gc.organization_id         = p_organization_id
    AND  gc.is_active               = true
    AND  gc.auto_generation_enabled = true;

  IF v_horizon IS NOT NULL THEN
    SELECT MAX(starts_at::date)
    INTO   v_max_future
    FROM   public.lesson_slots
    WHERE  organization_id = p_organization_id
      AND  deleted_at      IS NULL
      AND  status          = 'open'::public.lesson_slot_status
      AND  starts_at       > now();

    IF v_max_future IS NOT NULL THEN
      v_lag_days := v_horizon - (v_max_future - CURRENT_DATE);
      IF v_lag_days <= 0 THEN
        v_lag_days := NULL;
      END IF;
    ELSE
      -- No future open slots at all; full horizon is the lag
      v_lag_days := v_horizon;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Integrity check findings (from validate_scheduling_integrity)
  -- ---------------------------------------------------------------------------
  FOR v_check IN
    SELECT * FROM public.validate_scheduling_integrity(p_organization_id)
  LOOP
    v_findings := v_findings
                  || jsonb_build_object(
                       'check',    v_check.check_name,
                       'severity', v_check.severity,
                       'count',    v_check.affected_count
                     );

    IF v_check.severity = 'error' THEN
      v_has_critical := true;
    ELSIF v_check.severity = 'warning' THEN
      v_has_degraded := true;
    END IF;
  END LOOP;

  -- Structural critical flags (not covered by integrity checks)
  IF v_orphaned_slots > 0 OR v_overlapping THEN
    v_has_critical := true;
  END IF;

  -- Operational degraded flags
  IF v_failed_runs > 0 OR v_lag_days IS NOT NULL THEN
    v_has_degraded := true;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Health status derivation
  -- ---------------------------------------------------------------------------
  IF v_future_slots = 0 THEN
    v_health_status := 'unknown';
  ELSIF v_has_critical THEN
    v_health_status := 'critical';
  ELSIF v_has_degraded THEN
    v_health_status := 'degraded';
  ELSE
    v_health_status := 'healthy';
  END IF;

  -- ---------------------------------------------------------------------------
  -- Upsert the snapshot
  -- ON CONFLICT allows re-running on the same date to refresh after remediation.
  -- ---------------------------------------------------------------------------
  INSERT INTO public.scheduling_health_snapshots (
    organization_id,
    snapshot_date,
    future_slots_count,
    open_slots_count,
    booked_slots_count,
    cancelled_slots_count,
    orphaned_slots_count,
    overlapping_slots_detected,
    failed_generation_runs,
    generation_lag_days,
    health_status,
    metadata
  ) VALUES (
    p_organization_id,
    p_snapshot_date,
    v_future_slots,
    v_open_slots,
    v_booked_slots,
    v_cancelled_slots,
    v_orphaned_slots,
    v_overlapping,
    v_failed_runs,
    v_lag_days,
    v_health_status,
    jsonb_build_object('integrity_findings', v_findings)
  )
  ON CONFLICT (organization_id, snapshot_date)
  DO UPDATE SET
    future_slots_count          = EXCLUDED.future_slots_count,
    open_slots_count            = EXCLUDED.open_slots_count,
    booked_slots_count          = EXCLUDED.booked_slots_count,
    cancelled_slots_count       = EXCLUDED.cancelled_slots_count,
    orphaned_slots_count        = EXCLUDED.orphaned_slots_count,
    overlapping_slots_detected  = EXCLUDED.overlapping_slots_detected,
    failed_generation_runs      = EXCLUDED.failed_generation_runs,
    generation_lag_days         = EXCLUDED.generation_lag_days,
    health_status               = EXCLUDED.health_status,
    metadata                    = EXCLUDED.metadata
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION public.capture_scheduling_health_snapshot IS
  'Assembles slot inventory counts, orphan/overlap detection, generation health, '
  'and validate_scheduling_integrity() findings into a scheduling_health_snapshots '
  'record for the given (organisation, date). Upserts — re-running on the same date '
  'refreshes the snapshot after remediation. Returns the snapshot UUID.';


-- =============================================================================
-- SECTION 5: EXECUTE GRANTS
-- All four functions check permissions internally. Granting to authenticated
-- allows REST API callers to invoke them; the internal guards enforce who can
-- actually do what. Background workers (auth.uid() IS NULL) bypass checks.
-- =============================================================================

GRANT EXECUTE ON FUNCTION
  public.regenerate_missing_slots(uuid, date, date)
  TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.retry_failed_generation_run(uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.validate_scheduling_integrity(uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.capture_scheduling_health_snapshot(uuid, date)
  TO authenticated;
