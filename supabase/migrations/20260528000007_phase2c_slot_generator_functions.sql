-- =============================================================================
-- MIGRATION: 20260528000007_phase2c_slot_generator_functions.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2C — Slot Generation Engine (Functions)
-- Description:
--   Three SECURITY DEFINER generation functions implementing the recurring
--   slot generation engine:
--
--   generate_slots_for_rule(rule_id, lesson_type_id, start_date, end_date)
--     Core atomic unit. Iterates all dates in [start_date, end_date] that
--     match the rule's day_of_week. Applies date-level exceptions, skips
--     approved instructor time-off, and inserts DST-correct UTC lesson_slots
--     at slot_duration_minutes intervals within the day window.
--
--   generate_slots_for_instructor(instructor_id, lesson_type_id, start, end)
--     Iterates all active rules for the instructor that overlap the date
--     range, calling generate_slots_for_rule for each.
--
--   generate_slots_for_organization(org_id, lesson_type_id, start, end)
--     Top-level function. Creates a scheduling_generation_runs record,
--     iterates all active instructors in the org, and marks the run
--     completed, partial, or failed.
--
-- Execution order:
--   8. 20260528000006_phase2c_slot_generator_infra.sql   (must run first)
--   9. 20260528000007_phase2c_slot_generator_functions.sql  ← this file
--
-- Architecture notes:
--   • SECURITY DEFINER: all three functions run as the DB owner, bypassing
--     RLS to read availability rules / time-off and write lesson_slots.
--   • Permission enforcement: scheduling:generation:run is checked at runtime
--     when a JWT context is present. Background workers (no JWT) bypass this
--     check by design — they are trusted server-side callers.
--   • slot.generated events: emitted automatically by the Phase 2B trigger
--     trg_lesson_slots_emit_events when generation_source = 'recurring'.
--     No explicit outbox calls are needed in these functions.
--   • vehicle_id = NULL: vehicles are not assigned at generation time.
--     Fleet allocation is done manually or at booking time.
--   • Idempotent: safe to re-run for any date range. Existing non-deleted
--     slots are skipped, not duplicated or overwritten.
-- =============================================================================

-- =============================================================================
-- SECTION 1: generate_slots_for_rule()
-- Core generation unit. One rule × one lesson type × one date range.
--
-- DST-SAFE COMPUTATION:
--   v_window_start := (date_string || ' ' || time_string)::timestamp
--                     AT TIME ZONE rule.timezone
--
--   Concatenating the date and wall-clock time gives a naive local timestamp.
--   AT TIME ZONE interprets it in the rule's IANA timezone (Europe/Stockholm)
--   and converts to UTC. PostgreSQL handles CET ↔ CEST automatically.
--
--   Examples (Europe/Stockholm):
--     Summer (CEST = UTC+2): 2026-07-14 09:00 local → 2026-07-14 07:00 UTC
--     Winter (CET  = UTC+1): 2026-01-12 09:00 local → 2026-01-12 08:00 UTC
--     DST spring-forward day (last Sun Mar): 09:00 still resolves correctly
--       (spring-forward affects 02:00–03:00 only; no lessons at that hour)
--     DST fall-back day (last Sun Oct): 09:00 unambiguous; PostgreSQL uses
--       the standard-time (later) offset for ambiguous times if they arise.
--
-- IDEMPOTENCY:
--   Before each INSERT, checks: does a non-deleted slot already exist for
--   (availability_rule_id, lesson_type_id, starts_at)?
--   Conservative: cancelled slots are NOT regenerated. A cancelled slot
--   represents an intentional operational decision and must not be overridden
--   by a re-run. Soft-deleted slots are also not regenerated.
--
-- CONFLICT HANDLING:
--   If the EXCLUDE constraint fires (exclusion_violation), an existing slot
--   from a different rule or a manually-created slot occupies the time window.
--   Non-fatal: increments conflicts_found and continues. The EXCLUDE constraint
--   is always the authoritative anti-double-booking guard.
--
-- EXCEPTION INTEGRATION:
--   exception_type = 'cancelled' → skip the entire day (CONTINUE outer loop)
--   exception_type = 'modified'  → use new_start_time / new_end_time / new_location_id
--   Exception check fires before any slot window computation for the date.
--
-- TIME-OFF INTEGRATION:
--   Approved instructor_time_off blocks any slot window it overlaps.
--   Pending / rejected / cancelled time-off does NOT block generation.
--   Each slot window is checked individually (fine-grained, not day-level).
--
-- OBSERVABILITY:
--   If p_run_id IS NOT NULL, each call accumulates stats into the
--   scheduling_generation_runs row via incremental UPDATEs. This allows the
--   run record to reflect real-time progress during a large organisation run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_slots_for_rule(
  p_rule_id        uuid,
  p_lesson_type_id uuid,
  p_start_date     date,
  p_end_date       date,
  p_run_id         uuid DEFAULT NULL
)
RETURNS TABLE (
  slots_created   integer,
  slots_skipped   integer,
  conflicts_found integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule         RECORD;
  v_lesson_type  RECORD;
  v_exception    RECORD;
  v_date         date;
  v_start_time   time;
  v_end_time     time;
  v_location_id  uuid;
  v_exception_id uuid;
  v_window_start timestamptz;
  v_window_end   timestamptz;
  v_slot_start   timestamptz;
  v_slot_end     timestamptz;
  v_slot_dur     interval;
  v_slot_step    interval;
  v_day_count    integer;
  v_created      integer := 0;
  v_skipped      integer := 0;
  v_conflicts    integer := 0;
BEGIN
  -- Permission check: enforced when called with a user JWT context.
  -- Background workers (no JWT → auth.uid() IS NULL) bypass this check.
  IF auth.uid() IS NOT NULL
     AND NOT public.has_permission('scheduling:generation:run')
  THEN
    RAISE EXCEPTION
      'generate_slots_for_rule: permission denied. Requires scheduling:generation:run.'
      USING ERRCODE = '42501';
  END IF;

  -- Date range guard: prevent accidental very-large batch runs
  IF (p_end_date - p_start_date) > 365 THEN
    RAISE EXCEPTION
      'generate_slots_for_rule: date range % to % exceeds 365 days. Use smaller batches.',
      p_start_date, p_end_date;
  END IF;

  -- Load availability rule
  SELECT r.*
  INTO   v_rule
  FROM   public.instructor_availability_rules r
  WHERE  r.id = p_rule_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'generate_slots_for_rule: availability rule % not found.', p_rule_id;
  END IF;

  -- Inactive rule: return zero stats — not an error, caller may iterate all rules
  IF NOT v_rule.is_active THEN
    RETURN QUERY SELECT 0::integer, 0::integer, 0::integer;
    RETURN;
  END IF;

  -- Load lesson type: must be active and in the same org as the rule
  SELECT lt.*
  INTO   v_lesson_type
  FROM   public.lesson_types lt
  WHERE  lt.id              = p_lesson_type_id
    AND  lt.organization_id = v_rule.organization_id
    AND  lt.is_active       = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'generate_slots_for_rule: lesson_type_id % not found, not active, or not in org %.',
      p_lesson_type_id, v_rule.organization_id;
  END IF;

  -- Slot timing intervals
  -- v_slot_dur  = duration of one lesson slot
  -- v_slot_step = distance between consecutive slot starts (duration + buffer)
  v_slot_dur  := v_rule.slot_duration_minutes * interval '1 minute';
  v_slot_step := (v_rule.slot_duration_minutes + v_rule.slot_buffer_minutes)
                 * interval '1 minute';

  -- -------------------------------------------------------------------------
  -- MAIN DATE LOOP
  -- generate_series produces all days in [start_date, end_date].
  -- Filter to dates whose DOW matches rule.day_of_week.
  -- EXTRACT(DOW) returns 0=Sunday … 6=Saturday — same encoding as day_of_week.
  -- -------------------------------------------------------------------------
  FOR v_date IN
    SELECT gs::date
    FROM   generate_series(
             p_start_date::timestamp,
             p_end_date::timestamp,
             '1 day'::interval
           ) AS gs
    WHERE  EXTRACT(DOW FROM gs)::smallint = v_rule.day_of_week
  LOOP

    -- Skip dates outside the rule's effective period
    CONTINUE WHEN v_date < v_rule.effective_from;
    CONTINUE WHEN v_rule.effective_until IS NOT NULL
                  AND v_date > v_rule.effective_until;

    -- Reset per-day state
    v_day_count    := 0;
    v_exception_id := NULL;
    v_start_time   := v_rule.start_time;
    v_end_time     := v_rule.end_time;
    v_location_id  := v_rule.location_id;

    -- Look up date-level exception (UNIQUE constraint on rule+date: 0 or 1 row)
    SELECT e.*
    INTO   v_exception
    FROM   public.recurring_schedule_exceptions e
    WHERE  e.availability_rule_id = p_rule_id
      AND  e.exception_date       = v_date;

    IF FOUND THEN
      IF v_exception.exception_type = 'cancelled' THEN
        -- Entire teaching window cancelled for this date
        v_skipped := v_skipped + 1;
        CONTINUE;
      ELSIF v_exception.exception_type = 'modified' THEN
        -- Use modified times; fall back to rule's location if no override
        v_start_time   := v_exception.new_start_time;
        v_end_time     := v_exception.new_end_time;
        v_location_id  := COALESCE(v_exception.new_location_id, v_rule.location_id);
        v_exception_id := v_exception.id;
      END IF;
    END IF;

    -- -----------------------------------------------------------------------
    -- DST-SAFE UTC COMPUTATION
    -- Concatenate the calendar date with the local wall-clock time, cast to a
    -- naive timestamp, then convert to UTC using the rule's IANA timezone.
    -- PostgreSQL applies the correct UTC offset for that exact date/time,
    -- handling the CET ↔ CEST transition automatically.
    -- -----------------------------------------------------------------------
    v_window_start := (v_date::text || ' ' || v_start_time::text)::timestamp
                      AT TIME ZONE v_rule.timezone;
    v_window_end   := (v_date::text || ' ' || v_end_time::text)::timestamp
                      AT TIME ZONE v_rule.timezone;

    -- -----------------------------------------------------------------------
    -- SLOT-WINDOW LOOP
    -- Generate individual lesson slots within the day window.
    -- Advance v_slot_start by v_slot_step (duration + buffer) each iteration.
    -- -----------------------------------------------------------------------
    v_slot_start := v_window_start;

    WHILE v_slot_start + v_slot_dur <= v_window_end LOOP
      v_slot_end := v_slot_start + v_slot_dur;

      -- max_lessons_override: hard cap on created slots per day
      EXIT WHEN v_rule.max_lessons_override IS NOT NULL
                AND v_day_count >= v_rule.max_lessons_override;

      -- Check approved instructor time-off for this exact window.
      -- Only 'approved' status blocks generation; pending/rejected/cancelled do not.
      IF EXISTS (
        SELECT 1
        FROM   public.instructor_time_off t
        WHERE  t.instructor_id = v_rule.instructor_id
          AND  t.status        = 'approved'
          AND  t.starts_at     < v_slot_end
          AND  t.ends_at       > v_slot_start
      ) THEN
        v_skipped    := v_skipped + 1;
        v_slot_start := v_slot_start + v_slot_step;
        CONTINUE;
      END IF;

      -- Idempotency: skip if a non-deleted slot already exists for
      -- (rule, lesson_type, starts_at). Covered by idx_lesson_slots_rule_type_time.
      -- Conservative: cancelled and soft-deleted slots are NOT regenerated.
      IF EXISTS (
        SELECT 1
        FROM   public.lesson_slots s
        WHERE  s.availability_rule_id = p_rule_id
          AND  s.lesson_type_id       = p_lesson_type_id
          AND  s.starts_at            = v_slot_start
          AND  s.deleted_at           IS NULL
      ) THEN
        v_skipped    := v_skipped + 1;
        v_slot_start := v_slot_start + v_slot_step;
        CONTINUE;
      END IF;

      -- Insert the slot. The EXCLUDE constraint is the authoritative
      -- double-booking guard. vehicle_id is NULL — assign at booking time.
      -- trg_lesson_slots_emit_events fires automatically and emits slot.generated.
      BEGIN
        INSERT INTO public.lesson_slots (
          organization_id,
          instructor_id,
          vehicle_id,
          location_id,
          lesson_type_id,
          starts_at,
          ends_at,
          timezone,
          status,
          max_bookings,
          generation_source,
          availability_rule_id,
          exception_id
        ) VALUES (
          v_rule.organization_id,
          v_rule.instructor_id,
          NULL,                                 -- vehicle assigned manually / at booking
          v_location_id,
          p_lesson_type_id,
          v_slot_start,
          v_slot_end,
          v_rule.timezone,
          'open'::public.lesson_slot_status,
          v_lesson_type.max_students_per_slot,
          'recurring'::public.slot_generation_source,
          p_rule_id,
          v_exception_id
        );
        v_created   := v_created + 1;
        v_day_count := v_day_count + 1;

      EXCEPTION
        WHEN exclusion_violation THEN
          -- An existing slot (different rule or manual) occupies this window.
          -- The EXCLUDE constraint correctly blocked double-booking. Non-fatal.
          v_conflicts := v_conflicts + 1;
        WHEN unique_violation THEN
          -- Safety net for future unique constraints on lesson_slots.
          v_conflicts := v_conflicts + 1;
      END;

      v_slot_start := v_slot_start + v_slot_step;
    END LOOP; -- slot-window loop

  END LOOP; -- date loop

  -- Accumulate stats into the run record for real-time observability
  IF p_run_id IS NOT NULL THEN
    UPDATE public.scheduling_generation_runs
    SET
      records_created    = records_created    + v_created,
      records_skipped    = records_skipped    + v_skipped,
      conflicts_detected = conflicts_detected + v_conflicts
    WHERE id = p_run_id;
  END IF;

  RETURN QUERY SELECT v_created, v_skipped, v_conflicts;
END;
$$;

COMMENT ON FUNCTION public.generate_slots_for_rule IS
  'Core slot generation unit. Iterates dates in [start_date, end_date] '
  'matching the rule''s day_of_week. Applies date-level exceptions, skips '
  'approved instructor time-off, and inserts DST-correct UTC lesson_slots at '
  'slot_duration_minutes intervals. Idempotent: existing non-deleted slots are '
  'skipped. slot.generated events emitted automatically by trg_lesson_slots_emit_events. '
  'p_run_id: when supplied, accumulates stats into scheduling_generation_runs.';

-- =============================================================================
-- SECTION 2: generate_slots_for_instructor()
-- Composite function. Iterates all active rules for one instructor that
-- overlap the date range, then calls generate_slots_for_rule for each.
--
-- RULE SELECTION: rules where:
--   is_active = true
--   effective_from  ≤ p_end_date             (rule has started by end of range)
--   effective_until ≥ p_start_date OR NULL    (rule has not ended before range)
--
-- SPLIT SHIFTS: two rules for the same (instructor, day_of_week) representing
-- a lunch break (e.g. 09:00–12:00 and 13:00–17:00) are handled naturally —
-- each is a separate row and generates its own set of slots.
-- =============================================================================

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

    SELECT slots_created, slots_skipped, conflicts_found
    INTO   v_r_created, v_r_skipped, v_r_conflicts
    FROM   public.generate_slots_for_rule(
             v_rule.id,
             p_lesson_type_id,
             p_start_date,
             p_end_date,
             p_run_id
           );

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

-- =============================================================================
-- SECTION 3: generate_slots_for_organization()
-- Top-level generation function. Creates a scheduling_generation_runs record,
-- processes all active instructors in the org, and marks the run complete.
--
-- STATUS TRANSITIONS:
--   'running'   → inserted at the start before any instructor is processed
--   'completed' → all instructors processed, conflicts_detected = 0
--   'partial'   → all instructors processed, conflicts_detected > 0
--   'failed'    → unhandled exception; error_message populated; stats reflect
--                 work completed up to the failure point
--
-- STATS ACCUMULATION:
--   generate_slots_for_rule() increments records_created / records_skipped /
--   conflicts_detected on the run record via UPDATE ... SET col = col + n.
--   This function only needs to finalise status + completed_at at the end.
--   In-flight progress is visible by querying scheduling_generation_runs
--   while the function is executing (stats update per rule).
--
-- ADVISORY LOCK (activate when adding background workers):
--   PERFORM pg_advisory_xact_lock(
--     hashtext('slot_gen_org:' || p_organization_id::text)
--   );
--   Place immediately after the permission check, before INSERT.
--   Prevents two simultaneous organisation-level runs from racing.
-- =============================================================================

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

      SELECT rules_processed, slots_created, slots_skipped, conflicts_found
      INTO   v_i_rules, v_i_created, v_i_skipped, v_i_conflicts
      FROM   public.generate_slots_for_instructor(
               v_instructor.id,
               p_lesson_type_id,
               p_start_date,
               p_end_date,
               v_run_id          -- pass run_id: each rule call accumulates stats
             );

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
  'Idempotent: safe to re-run; existing non-deleted slots are skipped.';

-- =============================================================================
-- SECTION 4: EXECUTE GRANTS
-- SECURITY DEFINER functions are callable by all authenticated users.
-- The permission check inside each function enforces scheduling:generation:run
-- when a JWT context is present.
-- Background workers calling via a service-role connection (no JWT) bypass
-- the check by design — they are trusted server-side callers.
-- =============================================================================

GRANT EXECUTE ON FUNCTION
  public.generate_slots_for_rule(uuid, uuid, date, date, uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.generate_slots_for_instructor(uuid, uuid, date, date, uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.generate_slots_for_organization(uuid, uuid, date, date)
  TO authenticated;
