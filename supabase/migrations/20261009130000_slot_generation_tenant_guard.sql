-- ─── Slot generation: tenant ownership + permission guard ────────────────────
--
-- Security fix. generate_slots_for_rule / _for_instructor / _for_organization
-- were EXECUTE-able by PUBLIC/anon and only checked permissions when
-- auth.uid() IS NOT NULL ("background workers bypass"). An anonymous API call
-- therefore skipped every check, and an authenticated user of school A could
-- generate slots for a rule/instructor of school B (rule/instructor functions
-- never compared the target's organisation with the caller's).
-- generate_slots_from_templates had no permission check at all.
--
-- Fix: one guard, public.assert_slot_generation_allowed(org), called by all four
-- functions with the TARGET's organisation:
--   * internal DB session with no API caller (migrations, psql, pg_cron:
--     request.jwt.claims unset/empty)                          → allowed
--   * trusted backend (service_role) or Platform Admin
--     (public.is_trusted_service_context(), same rule as Wave 2B) → allowed
--   * any other API caller must be authenticated (auth.uid()), belong to the
--     target organisation and hold scheduling:generation:run    → else 42501
-- Plus EXECUTE revoked from PUBLIC/anon. Function bodies are otherwise the
-- current ones (rule: 20261009105000; others: live definitions) unchanged.

CREATE OR REPLACE FUNCTION public.assert_slot_generation_allowed(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  -- No API request context at all: direct database session (owner/cron).
  IF v_claims IS NULL OR v_claims = '' THEN
    RETURN;
  END IF;

  -- Trusted backend (service_role key) or Platform Admin.
  IF public.is_trusted_service_context() THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Slot generation requires an authenticated user.'
      USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL
     OR public.auth_organization_id() IS DISTINCT FROM p_organization_id
     OR NOT public.has_permission('scheduling:generation:run')
  THEN
    RAISE EXCEPTION 'Slot generation denied: requires scheduling:generation:run in the target organisation.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_slot_generation_allowed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_slot_generation_allowed(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assert_slot_generation_allowed(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.generate_slots_for_rule(p_rule_id uuid, p_lesson_type_id uuid, p_start_date date, p_end_date date, p_run_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(slots_created integer, slots_skipped integer, conflicts_found integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule         RECORD;
  v_lesson_type  RECORD;
  v_max_bookings integer := 1;
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

  -- Tenant + permission guard (20261009130000): the rule's own organisation decides.
  PERFORM public.assert_slot_generation_allowed(v_rule.organization_id);

  -- Inactive rule: return zero stats — not an error, caller may iterate all rules
  IF NOT v_rule.is_active THEN
    RETURN QUERY SELECT 0::integer, 0::integer, 0::integer;
    RETURN;
  END IF;

  -- Load lesson type only when one was requested. NULL p_lesson_type_id means
  -- "generate generic availability" (20260806151332) — v_max_bookings keeps its
  -- default of 1 and the lesson type is chosen at booking time.
  IF p_lesson_type_id IS NOT NULL THEN
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

    v_max_bookings := v_lesson_type.max_students_per_slot;
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
    -- ORGANIZATION CLOSURE GUARD (F5 V1)
    -- An active org-wide closure overlapping this date's teaching window
    -- blocks the entire day, same as exception_type = 'cancelled' above.
    -- Pending/inactive closures (is_active = false) do not block.
    -- -----------------------------------------------------------------------
    IF EXISTS (
      SELECT 1
      FROM   public.organization_closures c
      WHERE  c.organization_id = v_rule.organization_id
        AND  c.is_active       = true
        AND  c.starts_at       < v_window_end
        AND  c.ends_at         > v_window_start
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

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
          AND  s.lesson_type_id       IS NOT DISTINCT FROM p_lesson_type_id
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
          v_max_bookings,
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
$function$;

CREATE OR REPLACE FUNCTION public.generate_slots_for_instructor(p_instructor_id uuid, p_lesson_type_id uuid, p_start_date date, p_end_date date, p_run_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(rules_processed integer, slots_created integer, slots_skipped integer, conflicts_found integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Tenant + permission guard (20261009130000): the instructor's own organisation decides.
  PERFORM public.assert_slot_generation_allowed(v_instructor.organization_id);

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
$function$;

CREATE OR REPLACE FUNCTION public.generate_slots_for_organization(p_organization_id uuid, p_lesson_type_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(run_id uuid, instructors_processed integer, rules_processed integer, slots_created integer, slots_skipped integer, conflicts_found integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Tenant + permission guard (20261009130000). Replaces the old check, which
  -- skipped every caller without auth.uid() — including anonymous API calls.
  PERFORM public.assert_slot_generation_allowed(p_organization_id);

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
$function$;

CREATE OR REPLACE FUNCTION public.generate_slots_from_templates(p_week_start date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id     uuid;
  v_template   RECORD;
  v_slot_date  date;
  v_starts_at  timestamptz;
  v_ends_at    timestamptz;
  v_inserted   integer := 0;
BEGIN
  v_org_id := (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Missing organization_id in JWT';
  END IF;

  -- Permission guard (20261009130000): previously any JWT carrying an
  -- organization_id could generate slots, regardless of role.
  PERFORM public.assert_slot_generation_allowed(v_org_id);

  IF EXTRACT(isodow FROM p_week_start) <> 1 THEN
    RAISE EXCEPTION 'p_week_start must be a Monday (got %)', p_week_start;
  END IF;

  FOR v_template IN
    SELECT *
      FROM public.slot_templates
     WHERE organization_id = v_org_id
       AND is_active        = true
       AND deleted_at       IS NULL
  LOOP
    v_slot_date := p_week_start + (v_template.day_of_week - 1)::integer;

    v_starts_at := (v_slot_date::text || ' ' || v_template.start_time::text)::timestamp
                     AT TIME ZONE 'Europe/Stockholm';
    v_ends_at   := (v_slot_date::text || ' ' || v_template.end_time::text)::timestamp
                     AT TIME ZONE 'Europe/Stockholm';

    IF NOT EXISTS (
      SELECT 1
        FROM public.lesson_slots
       WHERE organization_id = v_org_id
         AND starts_at       = v_starts_at
         AND ends_at         = v_ends_at
         AND (
               v_template.instructor_id IS NULL
               OR instructor_id = v_template.instructor_id
             )
         AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.lesson_slots (
        organization_id, instructor_id, vehicle_id, location_id,
        lesson_type_id, starts_at, ends_at, max_bookings, status
      ) VALUES (
        v_org_id, v_template.instructor_id, v_template.vehicle_id,
        v_template.location_id, v_template.lesson_type_id,
        v_starts_at, v_ends_at, v_template.max_bookings, 'open'
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$function$;


REVOKE ALL ON FUNCTION public.generate_slots_for_rule(uuid, uuid, date, date, uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_slots_for_instructor(uuid, uuid, date, date, uuid)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_slots_for_organization(uuid, uuid, date, date)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_slots_from_templates(date)                          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_slots_for_rule(uuid, uuid, date, date, uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_slots_for_instructor(uuid, uuid, date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_slots_for_organization(uuid, uuid, date, date)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_slots_from_templates(date)                        TO authenticated, service_role;
