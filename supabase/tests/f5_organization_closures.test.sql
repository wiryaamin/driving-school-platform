-- =============================================================================
-- TEST: F5 — Organization Closures (Minimal V1)
-- Focused tests for the 6 scenarios required by the F5 V1 approval:
--   1. Slot generation inside an active closure  → blocked
--   2. Slot generation outside any closure        → allowed
--   3. Staff booking guard inside an active closure  → rejected
--   4. Student booking guard inside an active closure → rejected
--   5. Existing-booking detection (admin preview query) → correct
--   6. Inactive closure → does not block generation or booking
--
-- Scenarios 3 and 4 both exercise check_organization_closure_availability(),
-- because bookings/index.ts (staff) and student-portal/index.ts (student)
-- call that exact same SECURITY DEFINER function before inserting a booking —
-- that's the point of sharing one guard. A SQL script cannot invoke the Deno
-- edge functions themselves (no HTTP/Deno test harness exists in this repo),
-- so each scenario asserts the shared primitive both entry points depend on.
--
-- HOW TO RUN (after the migration is applied to the target database):
--   supabase db query --linked -f supabase/tests/f5_organization_closures.test.sql
--   -- or, against any Postgres connection string --
--   psql "$DATABASE_URL" -f supabase/tests/f5_organization_closures.test.sql
--
-- Everything below runs inside ONE transaction and is ROLLED BACK at the end
-- (or auto-aborted by the first failed assertion) — safe to run repeatedly
-- against a real environment, including production, without leaving residue.
-- Requires: at least one active organization with at least one instructor and
-- one active student already present (any seeded/demo org qualifies).
-- =============================================================================

BEGIN;

DO $test$
DECLARE
  v_org_id         uuid;
  v_instructor_id  uuid;
  v_lesson_type_id uuid;
  v_student_id     uuid;

  v_test_date      date := CURRENT_DATE + 60;   -- far enough out to never collide with real schedules
  v_test_date_2    date := CURRENT_DATE + 67;   -- +7 days: same day_of_week, outside the closure

  v_rule_id        uuid;
  v_closure_id     uuid;
  v_manual_slot_id uuid;
  v_booking_id     uuid;

  v_closure_start  timestamptz;
  v_closure_end    timestamptz;
  v_inside_start   timestamptz;
  v_inside_end     timestamptz;

  v_created        integer;
  v_skipped        integer;
  v_conflicts      integer;
  v_open           boolean;
  v_affected_count integer;
BEGIN
  RAISE NOTICE '─── F5 organization_closures: fixture lookup ───────────────────────';

  SELECT id INTO v_org_id FROM public.organizations WHERE status = 'active' LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'F5 TEST SETUP: no active organization found — seed a demo org first.';
  END IF;

  SELECT id INTO v_instructor_id
  FROM public.instructors
  WHERE organization_id = v_org_id AND deleted_at IS NULL
  LIMIT 1;
  IF v_instructor_id IS NULL THEN
    RAISE EXCEPTION 'F5 TEST SETUP: no instructor found in org %.', v_org_id;
  END IF;

  SELECT id INTO v_lesson_type_id
  FROM public.lesson_types
  WHERE organization_id = v_org_id AND is_active = true
  LIMIT 1;
  IF v_lesson_type_id IS NULL THEN
    RAISE EXCEPTION 'F5 TEST SETUP: no active lesson type found in org %.', v_org_id;
  END IF;

  SELECT id INTO v_student_id
  FROM public.students
  WHERE organization_id = v_org_id AND deleted_at IS NULL
  LIMIT 1;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'F5 TEST SETUP: no student found in org %.', v_org_id;
  END IF;

  RAISE NOTICE 'org=% instructor=% lesson_type=% student=%', v_org_id, v_instructor_id, v_lesson_type_id, v_student_id;

  -- Temporary availability rule: 05:00–06:00 Europe/Stockholm on v_test_date's
  -- day-of-week, effective from today. Early-morning window chosen to avoid
  -- any plausible collision with real slots for the picked instructor.
  INSERT INTO public.instructor_availability_rules (
    id, organization_id, instructor_id, day_of_week, start_time, end_time,
    timezone, effective_from, slot_duration_minutes, is_active
  ) VALUES (
    gen_random_uuid(), v_org_id, v_instructor_id,
    EXTRACT(DOW FROM v_test_date)::smallint,
    '05:00', '06:00', 'Europe/Stockholm', CURRENT_DATE, 60, true
  ) RETURNING id INTO v_rule_id;

  -- Wide UTC closure window covering all of v_test_date, regardless of DST.
  v_closure_start := v_test_date::timestamptz;
  v_closure_end   := (v_test_date + 1)::timestamptz;

  INSERT INTO public.organization_closures (id, organization_id, name, starts_at, ends_at, is_active)
  VALUES (gen_random_uuid(), v_org_id, 'F5 test closure', v_closure_start, v_closure_end, true)
  RETURNING id INTO v_closure_id;

  RAISE NOTICE 'rule=% closure=% [% .. %)', v_rule_id, v_closure_id, v_closure_start, v_closure_end;

  -- =========================================================================
  -- TEST 1 — slot generation inside an active closure → blocked
  -- =========================================================================
  SELECT slots_created, slots_skipped, conflicts_found
  INTO   v_created, v_skipped, v_conflicts
  FROM   public.generate_slots_for_rule(v_rule_id, v_lesson_type_id, v_test_date, v_test_date);

  IF v_created <> 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: expected 0 slots created inside an active closure, got %', v_created;
  END IF;
  IF v_skipped < 1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: expected the closed date to be skipped, slots_skipped=%', v_skipped;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lesson_slots
    WHERE availability_rule_id = v_rule_id AND starts_at::date = v_test_date AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TEST 1 FAILED: a slot was materialised on the closed date.';
  END IF;
  RAISE NOTICE 'TEST 1 OK — generation inside active closure blocked (created=0, skipped=%)', v_skipped;

  -- =========================================================================
  -- TEST 2 — slot generation outside any closure → allowed
  -- Same rule, same day_of_week, one week later — no closure covers this date.
  -- =========================================================================
  SELECT slots_created, slots_skipped, conflicts_found
  INTO   v_created, v_skipped, v_conflicts
  FROM   public.generate_slots_for_rule(v_rule_id, v_lesson_type_id, v_test_date_2, v_test_date_2);

  IF v_created <> 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: expected 1 slot created outside any closure, got % (skipped=%, conflicts=%)',
      v_created, v_skipped, v_conflicts;
  END IF;
  RAISE NOTICE 'TEST 2 OK — generation outside closure allowed (created=%)', v_created;

  -- =========================================================================
  -- TEST 3 — staff booking guard inside an active closure → rejected
  -- Mirrors the RPC call bookings/index.ts:handleCreate makes before inserting.
  -- =========================================================================
  v_inside_start := v_closure_start + interval '10 hours';
  v_inside_end   := v_closure_start + interval '11 hours';

  SELECT public.check_organization_closure_availability(v_org_id, v_inside_start, v_inside_end)
  INTO   v_open;

  IF v_open <> false THEN
    RAISE EXCEPTION 'TEST 3 FAILED: expected closure guard to reject a window inside an active closure (staff path).';
  END IF;
  RAISE NOTICE 'TEST 3 OK — staff booking guard rejects a window inside an active closure';

  -- =========================================================================
  -- TEST 4 — student booking guard inside an active closure → rejected
  -- Mirrors the identical RPC call student-portal/index.ts's POST /bookings
  -- makes before inserting — same shared guard, same window.
  -- =========================================================================
  SELECT public.check_organization_closure_availability(v_org_id, v_inside_start, v_inside_end)
  INTO   v_open;

  IF v_open <> false THEN
    RAISE EXCEPTION 'TEST 4 FAILED: expected closure guard to reject a window inside an active closure (student path).';
  END IF;
  RAISE NOTICE 'TEST 4 OK — student booking guard rejects a window inside an active closure';

  -- =========================================================================
  -- TEST 5 — existing-booking detection (admin preview query) → correct
  -- A slot + booking that already exist inside the closure window (as if
  -- created before the closure was declared) must be found by the same
  -- overlap query the admin UI's affected-bookings preview uses
  -- (useBookingsAffectedByClosure in apps/web) — future, non-cancelled,
  -- overlapping [closure.starts_at, closure.ends_at).
  -- =========================================================================
  INSERT INTO public.lesson_slots (
    id, organization_id, instructor_id, lesson_type_id,
    starts_at, ends_at, timezone, status, max_bookings, generation_source
  ) VALUES (
    gen_random_uuid(), v_org_id, v_instructor_id, v_lesson_type_id,
    v_closure_start + interval '14 hours', v_closure_start + interval '15 hours',
    'Europe/Stockholm', 'open', 1, 'manual'
  ) RETURNING id INTO v_manual_slot_id;

  INSERT INTO public.lesson_bookings (id, organization_id, slot_id, student_id, status)
  VALUES (gen_random_uuid(), v_org_id, v_manual_slot_id, v_student_id, 'confirmed')
  RETURNING id INTO v_booking_id;

  SELECT count(*) INTO v_affected_count
  FROM   public.lesson_bookings b
  WHERE  b.organization_id = v_org_id
    AND  b.status NOT IN ('cancelled', 'no_show', 'rescheduled')
    AND  b.deleted_at IS NULL
    AND  b.starts_at > now()
    AND  b.starts_at < v_closure_end
    AND  b.ends_at   > v_closure_start;

  IF v_affected_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5 FAILED: expected exactly 1 affected booking detected, got %', v_affected_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.lesson_bookings
    WHERE id = v_booking_id AND starts_at > now() AND starts_at < v_closure_end AND ends_at > v_closure_start
  ) THEN
    RAISE EXCEPTION 'TEST 5 FAILED: the specific test booking % was not among the detected rows.', v_booking_id;
  END IF;
  RAISE NOTICE 'TEST 5 OK — existing-booking detection query finds exactly the affected booking';

  -- =========================================================================
  -- TEST 6 — inactive closure → does not block generation or booking
  -- =========================================================================
  UPDATE public.organization_closures SET is_active = false WHERE id = v_closure_id;

  SELECT public.check_organization_closure_availability(v_org_id, v_inside_start, v_inside_end)
  INTO   v_open;
  IF v_open <> true THEN
    RAISE EXCEPTION 'TEST 6 FAILED: expected the booking guard to allow the window once the closure is inactive.';
  END IF;

  SELECT slots_created, slots_skipped, conflicts_found
  INTO   v_created, v_skipped, v_conflicts
  FROM   public.generate_slots_for_rule(v_rule_id, v_lesson_type_id, v_test_date, v_test_date);

  IF v_created <> 1 THEN
    RAISE EXCEPTION 'TEST 6 FAILED: expected 1 slot created once the closure is inactive, got % (skipped=%, conflicts=%)',
      v_created, v_skipped, v_conflicts;
  END IF;
  RAISE NOTICE 'TEST 6 OK — inactive closure blocks neither the booking guard nor slot generation';

  RAISE NOTICE '─── All 6 F5 scenarios passed — rolling back all test data ─────────';
END;
$test$;

ROLLBACK;
