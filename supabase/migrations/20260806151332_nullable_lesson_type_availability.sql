-- ---------------------------------------------------------------------------
-- Instructor availability slots without a predefined lesson type.
--
-- Product decision (2026-08-06 Portal/Scheduling review): an instructor's
-- recurring availability should represent pure "I'm available" time, not be
-- pre-bound to a lesson type. The lesson type — along with student,
-- package/credits, and vehicle — is chosen when someone actually books the
-- slot; at that point it "becomes a booked lesson and inherits the selected
-- lesson type." Every other slot-creation path (CreateSlotSheet,
-- SlotTemplatesPage) is unaffected and keeps requiring a lesson type exactly
-- as before — this only ADDS a null-tolerant path, it doesn't change the
-- default/existing one.
-- ---------------------------------------------------------------------------

ALTER TABLE public.lesson_slots    ALTER COLUMN lesson_type_id DROP NOT NULL;
ALTER TABLE public.lesson_bookings ALTER COLUMN lesson_type_id DROP NOT NULL;

COMMENT ON COLUMN public.lesson_slots.lesson_type_id IS
  'NULL = generic availability, no predefined lesson type. The booker chooses '
  'the lesson type at booking time in that case (see lesson_booking_set_slot_fields()).';
COMMENT ON COLUMN public.lesson_bookings.lesson_type_id IS
  'Denormalised from the slot when the slot has a fixed lesson type. When the '
  'slot is generic availability (lesson_type_id NULL), this is instead '
  'whatever the booker explicitly supplied at booking time — see '
  'lesson_booking_set_slot_fields(). Application layer (bookings/index.ts) '
  'requires one or the other to be present before a booking can be created.';

-- ── lesson_booking_set_slot_fields(): only override with the slot's value ──
-- when the slot actually has one. Previously unconditional
-- (NEW.lesson_type_id := v_slot.lesson_type_id), which would have blown away
-- a caller-supplied value with NULL for a generic-availability slot. Every
-- other denormalised field is unaffected — a slot's time/instructor/vehicle/
-- location are never chosen by the booker, only lesson type can be.
CREATE OR REPLACE FUNCTION public.lesson_booking_set_slot_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot RECORD;
BEGIN
  SELECT starts_at, ends_at, instructor_id, vehicle_id,
         lesson_type_id, location_id, organization_id
  INTO   v_slot
  FROM   public.lesson_slots
  WHERE  id = NEW.slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson_bookings: slot_id % does not exist', NEW.slot_id;
  END IF;

  IF NEW.organization_id != v_slot.organization_id THEN
    RAISE EXCEPTION
      'lesson_bookings: organization_id % does not match slot organization_id %',
      NEW.organization_id, v_slot.organization_id;
  END IF;

  NEW.starts_at      := v_slot.starts_at;
  NEW.ends_at        := v_slot.ends_at;
  NEW.instructor_id  := v_slot.instructor_id;
  NEW.vehicle_id     := v_slot.vehicle_id;
  NEW.lesson_type_id := COALESCE(v_slot.lesson_type_id, NEW.lesson_type_id);
  NEW.location_id    := v_slot.location_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.lesson_booking_set_slot_fields IS
  'BEFORE INSERT: copies starts_at/ends_at and resource IDs from the slot. '
  'Application only needs slot_id + student_id + organization_id. '
  'lesson_type_id is copied from the slot only when the slot has one — for a '
  'generic-availability slot (lesson_type_id NULL), whatever the caller '
  'supplied on the booking row is kept instead. '
  'Runs before EXCLUDE constraint evaluation to ensure correct time ranges.';

-- ── generate_slots_for_rule(): p_lesson_type_id is now genuinely optional ──
-- NULL means "generate generic availability, no fixed lesson type" — used
-- for instructors whose recurring pattern was auto-created on creation with
-- no lesson type chosen. Every other behavior (DST handling, exceptions,
-- time-off, conflict handling, idempotency) is unchanged.
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
  -- "generate generic availability" — v_lesson_type stays unset and
  -- v_max_bookings keeps its default of 1 (one student per generic block).
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
      -- (rule, lesson_type, starts_at). IS NOT DISTINCT FROM (not =) so a
      -- NULL p_lesson_type_id correctly matches an already-generated NULL
      -- slot instead of never matching (NULL = NULL is NULL, not true).
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
$$;

COMMENT ON FUNCTION public.generate_slots_for_rule IS
  'Core slot generation unit. Iterates dates in [start_date, end_date] '
  'matching the rule''s day_of_week. Applies date-level exceptions, skips '
  'approved instructor time-off, and inserts DST-correct UTC lesson_slots at '
  'slot_duration_minutes intervals. Idempotent: existing non-deleted slots are '
  'skipped. slot.generated events emitted automatically by trg_lesson_slots_emit_events. '
  'p_run_id: when supplied, accumulates stats into scheduling_generation_runs. '
  'p_lesson_type_id: NULL generates generic availability slots with no fixed '
  'lesson type (max_bookings defaults to 1) — the booker chooses a lesson '
  'type when they book the slot.';

COMMENT ON FUNCTION public.generate_slots_for_instructor IS
  'Iterates all active rules for one instructor overlapping the date range, '
  'calling generate_slots_for_rule for each. p_lesson_type_id: NULL generates '
  'generic availability (no fixed lesson type) across every rule in scope — '
  'see generate_slots_for_rule.';

COMMENT ON FUNCTION public.generate_slots_for_organization IS
  'Top-level generation entry point: creates a scheduling_generation_runs '
  'record, iterates all active instructors in the org. p_lesson_type_id: NULL '
  'generates generic availability (no fixed lesson type) org-wide — see '
  'generate_slots_for_rule.';
