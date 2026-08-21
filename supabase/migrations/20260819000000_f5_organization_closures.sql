-- =============================================================================
-- MIGRATION: 20260819000000_f5_organization_closures.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Feature:   F5 — Booking Engine: Holidays & School Closures (Minimal V1)
-- Description:
--   Organization-wide closed periods. An active closure blocks NEW slot
--   generation and NEW bookings (staff + student) for its [starts_at, ends_at)
--   window. It does not affect slots/bookings that already exist — those are
--   surfaced to the admin (frontend query against lesson_bookings, reusing
--   existing RLS) and cancelled manually via the existing cancellation flow
--   using the 'school_cancelled' category, preserving F3 credit-restoration.
--
-- Scope (approved F5 V1 — see Booking Engine F5 audit):
--   - organization_closures table (org-wide, no location scoping — V1.1 item)
--   - check_organization_closure_availability() — mirrors
--     check_instructor_availability / check_vehicle_availability
--   - generate_slots_for_rule() updated (CREATE OR REPLACE) to skip any date
--     whose teaching window overlaps an active closure
--
-- Dependencies:
--   20260527000001_enterprise_foundation.sql — organizations, set_updated_at(),
--     audit_trigger_fn(), has_permission(), auth_organization_id(),
--     is_platform_admin()
--   20260528000002_phase2b_scheduling_core.sql — scheduling:availability:*
--     permissions (reused; no new permission codes introduced)
--   20260528000007_phase2c_slot_generator_functions.sql — generate_slots_for_rule()
--     being replaced here
-- =============================================================================

-- =============================================================================
-- SECTION 1: ORGANIZATION CLOSURES TABLE
-- =============================================================================

CREATE TABLE public.organization_closures (
  id                uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id   uuid         NOT NULL,

  name              text         NOT NULL,
  starts_at         timestamptz  NOT NULL,
  ends_at           timestamptz  NOT NULL,
  is_active         boolean      NOT NULL DEFAULT true,

  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT organization_closures_pkey         PRIMARY KEY (id),
  CONSTRAINT organization_closures_org_fkey     FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT organization_closures_creator_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT organization_closures_updater_fkey FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT organization_closures_name_nn      CHECK (btrim(name) <> ''),
  CONSTRAINT organization_closures_time_order   CHECK (starts_at < ends_at)
);

COMMENT ON TABLE public.organization_closures IS
  'Organization-wide closed periods (F5 V1). An active closure blocks new slot '
  'generation and new bookings for its [starts_at, ends_at) window only — it '
  'does not affect slots/bookings that already exist. No location scoping '
  '(org-wide only) and no automatic cancellation in V1.';

CREATE TRIGGER organization_closures_set_updated_at
  BEFORE UPDATE ON public.organization_closures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER organization_closures_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_closures
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

REVOKE ALL ON TABLE public.organization_closures FROM anon;

-- Supports both the RLS list query (organization_id) and the overlap checks
-- performed by check_organization_closure_availability() / the slot generator.
CREATE INDEX idx_organization_closures_org_active_range
  ON public.organization_closures (organization_id, starts_at, ends_at)
  WHERE is_active = true;

-- =============================================================================
-- SECTION 2: ROW LEVEL SECURITY
-- Reuses the existing scheduling:availability:read / :update permissions —
-- the same ones instructor_time_off already uses — rather than introducing a
-- new permission domain. No self-tier: closures are org-wide, not per-instructor.
-- =============================================================================

ALTER TABLE public.organization_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_closures_select_staff"
  ON public.organization_closures FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:read')
  );

CREATE POLICY "organization_closures_select_platform"
  ON public.organization_closures FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "organization_closures_insert"
  ON public.organization_closures FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

CREATE POLICY "organization_closures_update"
  ON public.organization_closures FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

CREATE POLICY "organization_closures_delete"
  ON public.organization_closures FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

-- =============================================================================
-- SECTION 3: CONFLICT DETECTION HELPER
-- Mirrors check_instructor_availability / check_vehicle_availability /
-- check_student_booking_availability (20260528000002_phase2b_scheduling_core.sql)
-- so all three new-slot / new-booking entry points call it the same way.
--
-- TENANT GUARD (post-review fix): unlike those three sibling functions —
-- which take no organization_id parameter at all, so a cross-tenant probe
-- has no target to name — this function takes p_organization_id directly as
-- a caller-supplied argument while being SECURITY DEFINER with EXECUTE
-- granted to every authenticated user. Without a check, any authenticated
-- user in any org could call this RPC directly (bypassing the edge
-- functions entirely) with an arbitrary p_organization_id and probe whether
-- another organization has an active closure at a given time. The guard
-- below mirrors the auth.uid() IS NOT NULL / auth_organization_id() pattern
-- generate_slots_for_organization() already uses for the same reason (an
-- org id taken directly as a parameter), plus the is_platform_admin()
-- bypass the RLS policies on this table already grant platform staff.
-- Service-role callers (auth.uid() IS NULL) bypass by design, same as the
-- slot generator functions — student-portal/index.ts calls this via a
-- service-role client because portal students are never auth.users rows;
-- its organization_id there comes from the resolved portal session, not
-- from client-supplied input.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_organization_closure_availability(
  p_organization_id  uuid,
  p_starts_at        timestamptz,
  p_ends_at          timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.auth_organization_id() != p_organization_id
     AND NOT public.is_platform_admin()
  THEN
    RAISE EXCEPTION
      'check_organization_closure_availability: permission denied for organization %.',
      p_organization_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM   public.organization_closures c
    WHERE  c.organization_id = p_organization_id
      AND  c.is_active       = true
      AND  c.starts_at       < p_ends_at
      AND  c.ends_at         > p_starts_at
  );
END;
$$;

COMMENT ON FUNCTION public.check_organization_closure_availability IS
  'Returns true when no active organization_closures row overlaps the window. '
  'Mirrors check_instructor_availability / check_vehicle_availability / '
  'check_student_booking_availability. Called by slots/index.ts, '
  'bookings/index.ts, and student-portal/index.ts before creating a new slot '
  'or booking; also enforced independently inside generate_slots_for_rule(). '
  'Tenant-guarded: rejects a caller whose own organization does not match '
  'p_organization_id unless they are a platform admin (auth.uid() IS NULL '
  'service-role callers bypass by design, matching the slot generator functions).';

GRANT EXECUTE ON FUNCTION public.check_organization_closure_availability TO authenticated;

-- =============================================================================
-- SECTION 4: SLOT GENERATOR — CLOSURE ENFORCEMENT
-- CREATE OR REPLACE of generate_slots_for_rule() (originally defined in
-- 20260528000007_phase2c_slot_generator_functions.sql). Migrations are
-- append-only — the historical file is untouched; this supersedes its
-- function body in the catalog, following the same pattern already used by
-- 20260806160500_fix_generation_column_ambiguity.sql.
--
-- Change: one new day-level guard, immediately after the existing
-- recurring_schedule_exceptions check and before the per-window loop. A
-- closure is org-wide and date-range shaped (unlike instructor_time_off,
-- which can be a partial-day absence), so it is checked once per date against
-- that date's full teaching window rather than per individual slot window —
-- skips the whole day, mirroring how exception_type = 'cancelled' already
-- skips the whole day a few lines above.
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
  'dates covered by an active organization_closures row (F5 V1), skips '
  'approved instructor time-off, and inserts DST-correct UTC lesson_slots at '
  'slot_duration_minutes intervals. Idempotent: existing non-deleted slots are '
  'skipped. slot.generated events emitted automatically by trg_lesson_slots_emit_events. '
  'p_run_id: when supplied, accumulates stats into scheduling_generation_runs.';
