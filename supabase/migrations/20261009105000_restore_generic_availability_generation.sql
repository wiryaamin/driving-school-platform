-- ─── Återställ generering av tillgänglighetspass (utan lektionstyp) ──────────
-- 20260806151332 gjorde p_lesson_type_id valfri i generate_slots_for_rule (NULL =
-- ren tillgänglighet, lektionstyp väljs vid bokning). 20260819000000 (stängningsdagar)
-- skrev om funktionen utifrån den äldre versionen och tog därmed bort det stödet:
-- sedan dess misslyckas all generering med NULL lektionstyp ("lesson_type_id <NULL>
-- not found"). Den här migrationen är den nuvarande (stängningsdags-)versionen med
-- NULL-stödet från 20260806151332 återinfört. Inget annat beteende ändras.

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
