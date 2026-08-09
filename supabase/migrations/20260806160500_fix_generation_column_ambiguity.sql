-- Fixes a pre-existing bug in the Phase 2C slot-generation chain: both
-- generate_slots_for_instructor() and generate_slots_for_organization()
-- declare RETURNS TABLE columns that share names with columns returned by
-- the function they call internally (slots_created, slots_skipped,
-- conflicts_found, rules_processed). PL/pgSQL treats RETURNS TABLE columns
-- as implicit variables in scope for the whole function body, so the bare
-- "SELECT col, col, col INTO ... FROM some_function(...)" at each call site
-- was ambiguous between "the plpgsql variable" and "the column of the same
-- name in the queried result set" — Postgres rejects this at runtime
-- (42702) rather than silently picking one. This means the generation
-- chain has never successfully completed a run. Fix: alias the nested
-- function call and qualify the SELECT list against that alias. No other
-- logic changes — bodies are otherwise identical to
-- 20260528000007_phase2c_slot_generator_functions.sql.

CREATE OR REPLACE FUNCTION public.generate_slots_for_instructor(
  p_instructor_id  uuid,
  p_lesson_type_id uuid,
  p_start_date     date,
  p_end_date       date,
  p_run_id         uuid DEFAULT NULL
)
RETURNS TABLE (
  rules_processed integer,
  slots_created   integer,
  slots_skipped   integer,
  conflicts_found integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instructor    RECORD;
  v_rule          RECORD;
  v_rules_count   integer := 0;
  v_total_created integer := 0;
  v_total_skipped integer := 0;
  v_total_confl   integer := 0;
  v_r_created     integer;
  v_r_skipped     integer;
  v_r_conflicts   integer;
BEGIN
  -- Permission check (redundant when called from generate_slots_for_organization,
  -- enforced for standalone callers)
  IF auth.uid() IS NOT NULL
     AND NOT public.has_permission('scheduling:generation:run')
  THEN
    RAISE EXCEPTION
      'generate_slots_for_instructor: permission denied. Requires scheduling:generation:run.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate instructor exists and is not soft-deleted
  SELECT i.id, i.organization_id
  INTO   v_instructor
  FROM   public.instructors i
  WHERE  i.id         = p_instructor_id
    AND  i.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'generate_slots_for_instructor: instructor % not found or soft-deleted.',
      p_instructor_id;
  END IF;

  -- Date range guard (secondary: generate_slots_for_rule also guards per rule)
  IF (p_end_date - p_start_date) > 365 THEN
    RAISE EXCEPTION 'generate_slots_for_instructor: date range exceeds 365 days.';
  END IF;

  -- Iterate active rules for this instructor that overlap the date range.
  -- Ordered by day_of_week + start_time for deterministic, reproducible output.
  FOR v_rule IN
    SELECT r.id
    FROM   public.instructor_availability_rules r
    WHERE  r.instructor_id   = p_instructor_id
      AND  r.is_active       = true
      AND  r.effective_from  <= p_end_date
      AND  (r.effective_until IS NULL OR r.effective_until >= p_start_date)
    ORDER  BY r.day_of_week, r.start_time
  LOOP
    v_rules_count := v_rules_count + 1;

    SELECT g.slots_created, g.slots_skipped, g.conflicts_found
    INTO   v_r_created, v_r_skipped, v_r_conflicts
    FROM   public.generate_slots_for_rule(
             v_rule.id,
             p_lesson_type_id,
             p_start_date,
             p_end_date,
             p_run_id
           ) AS g;

    v_total_created := v_total_created + v_r_created;
    v_total_skipped := v_total_skipped + v_r_skipped;
    v_total_confl   := v_total_confl   + v_r_conflicts;
  END LOOP;

  RETURN QUERY SELECT v_rules_count, v_total_created, v_total_skipped, v_total_confl;
END;
$$;

COMMENT ON FUNCTION public.generate_slots_for_instructor IS
  'Iterates all active availability rules for the instructor overlapping '
  '[start_date, end_date] and calls generate_slots_for_rule for each. '
  'Split-shift rules (morning + afternoon on the same day_of_week) are handled '
  'naturally as separate rule rows. Returns aggregated stats across all rules.';

CREATE OR REPLACE FUNCTION public.generate_slots_for_organization(
  p_organization_id uuid,
  p_lesson_type_id  uuid,
  p_start_date      date,
  p_end_date        date
)
RETURNS TABLE (
  run_id                uuid,
  instructors_processed integer,
  rules_processed       integer,
  slots_created         integer,
  slots_skipped         integer,
  conflicts_found       integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id        uuid;
  v_instructor    RECORD;
  v_inst_count    integer := 0;
  v_total_rules   integer := 0;
  v_total_created integer := 0;
  v_total_skipped integer := 0;
  v_total_confl   integer := 0;
  v_i_rules       integer;
  v_i_created     integer;
  v_i_skipped     integer;
  v_i_conflicts   integer;
BEGIN
  -- Permission check: enforce org membership + run permission for REST callers.
  -- Background workers (no JWT → auth.uid() IS NULL) bypass this check.
  IF auth.uid() IS NOT NULL THEN
    IF public.auth_organization_id() != p_organization_id
       OR NOT public.has_permission('scheduling:generation:run')
    THEN
      RAISE EXCEPTION
        'generate_slots_for_organization: permission denied. '
        'Requires scheduling:generation:run in organisation %.',
        p_organization_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Date range guard
  IF (p_end_date - p_start_date) > 365 THEN
    RAISE EXCEPTION
      'generate_slots_for_organization: date range % to % exceeds 365 days. '
      'Split into smaller batches.',
      p_start_date, p_end_date;
  END IF;

  -- Create observability run record (status = 'running')
  -- Stats are accumulated incrementally by generate_slots_for_rule via p_run_id.
  INSERT INTO public.scheduling_generation_runs (
    organization_id,
    generation_scope,
    scope_id,
    lesson_type_id,
    start_date,
    end_date,
    status,
    triggered_by
  ) VALUES (
    p_organization_id,
    'organization',
    p_organization_id,
    p_lesson_type_id,
    p_start_date,
    p_end_date,
    'running',
    auth.uid()
  ) RETURNING id INTO v_run_id;

  BEGIN
    -- Process each active (non-deleted) instructor in the organisation.
    -- ORDER BY id ensures deterministic, reproducible per-instructor ordering.
    FOR v_instructor IN
      SELECT i.id
      FROM   public.instructors i
      WHERE  i.organization_id = p_organization_id
        AND  i.deleted_at      IS NULL
      ORDER  BY i.id
    LOOP
      v_inst_count := v_inst_count + 1;

      SELECT g.rules_processed, g.slots_created, g.slots_skipped, g.conflicts_found
      INTO   v_i_rules, v_i_created, v_i_skipped, v_i_conflicts
      FROM   public.generate_slots_for_instructor(
               v_instructor.id,
               p_lesson_type_id,
               p_start_date,
               p_end_date,
               v_run_id          -- pass run_id: each rule call accumulates stats
             ) AS g;

      v_total_rules   := v_total_rules   + v_i_rules;
      v_total_created := v_total_created + v_i_created;
      v_total_skipped := v_total_skipped + v_i_skipped;
      v_total_confl   := v_total_confl   + v_i_conflicts;
    END LOOP;

    -- Finalise run record. Stats already accumulated in the DB row by
    -- generate_slots_for_rule calls. Only status + completed_at needed here.
    -- conflicts_detected column value is read from the accumulated DB state.
    UPDATE public.scheduling_generation_runs
    SET
      status       = CASE
                       WHEN conflicts_detected > 0 THEN 'partial'
                       ELSE 'completed'
                     END,
      completed_at = now()
    WHERE id = v_run_id;

  EXCEPTION WHEN OTHERS THEN
    -- Preserve failure details in the run record; re-raise for the caller.
    -- Stats reflect work completed up to the failure point.
    UPDATE public.scheduling_generation_runs
    SET
      status        = 'failed',
      completed_at  = now(),
      error_message = SQLERRM
    WHERE id = v_run_id;
    RAISE;
  END;

  RETURN QUERY
    SELECT v_run_id,
           v_inst_count,
           v_total_rules,
           v_total_created,
           v_total_skipped,
           v_total_confl;
END;
$$;

COMMENT ON FUNCTION public.generate_slots_for_organization IS
  'Top-level slot generation for an entire organisation. Creates a '
  'scheduling_generation_runs record (observability), iterates all active '
  'instructors, and calls generate_slots_for_instructor for each. '
  'Status: ''completed'' (no conflicts), ''partial'' (some EXCLUDE conflicts), '
  '''failed'' (unhandled error). Run stats accumulate in real time. '
  'Idempotent: safe to re-run; existing non-deleted slots are skipped. '
  'p_lesson_type_id may be NULL to generate generic availability slots '
  'with no fixed lesson type.';
