-- =============================================================================
-- DEMO SCHEDULE SEED
-- Populates Bokningsschema with 4 instructors + a week of lesson slots
-- so the green/red colour grid is visible immediately.
--
-- Run in Supabase SQL Editor:
--   https://supabase.com/dashboard/project/ulgsndzfksphquqakelq/sql
--
-- OR via Supabase CLI (after supabase link):
--   supabase db query --file supabase/seed/demo_schedule.sql
--
-- Idempotent: existing instructors / slots are skipped, not duplicated.
-- =============================================================================

DO $$
DECLARE
  v_org_id    uuid;
  v_lt_id     uuid;
  v_week_mon  timestamptz;

  -- Stable UUIDs so re-runs hit ON CONFLICT on the PK
  v_i1 uuid := 'a1000000-0000-0000-0000-000000000001';
  v_i2 uuid := 'a1000000-0000-0000-0000-000000000002';
  v_i3 uuid := 'a1000000-0000-0000-0000-000000000003';
  v_i4 uuid := 'a1000000-0000-0000-0000-000000000004';

  v_d   integer;  -- day offset from Monday (0=Mon … 4=Fri)
  v_h   integer;  -- hour (8 … 16)
  v_is_full  boolean;
  v_status   public.lesson_slot_status;
  v_start    timestamptz;
  v_end      timestamptz;
BEGIN

  -- ── 1. Pick the most recently active organisation (skips nil-UUID sentinels) ──
  SELECT id INTO v_org_id
  FROM   public.organizations
  WHERE  deleted_at IS NULL
    AND  id != '00000000-0000-0000-0000-000000000000'
  ORDER  BY created_at DESC
  LIMIT  1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organisation found — run bootstrap_org_admin.sql first.';
  END IF;

  -- ── 2. Ensure a lesson type exists ──────────────────────────────────────────
  SELECT id INTO v_lt_id
  FROM   public.lesson_types
  WHERE  organization_id = v_org_id
  LIMIT  1;

  IF v_lt_id IS NULL THEN
    INSERT INTO public.lesson_types (
      organization_id, name, code, category,
      default_duration_minutes, min_duration_minutes, max_duration_minutes,
      max_students_per_slot, color_hex, is_active
    ) VALUES (
      v_org_id, 'Vanlig körlektion', 'driving_b', 'driving'::public.lesson_category,
      45, 30, 90, 1, '#22c55e', true
    )
    RETURNING id INTO v_lt_id;
  END IF;

  -- ── 3. Create 4 demo instructors (idempotent via stable PK UUIDs) ───────────
  INSERT INTO public.instructors (id, organization_id, first_name, last_name, email, employment_type)
  VALUES
    (v_i1, v_org_id, 'Kameran',  'Abdulmajid', 'kameran@demo.trafikskolan.se',  'employed'::public.instructor_employment_type),
    (v_i2, v_org_id, 'Lawko',    'Abdullah',   'lawko@demo.trafikskolan.se',    'employed'::public.instructor_employment_type),
    (v_i3, v_org_id, 'Hamada',   'Abdu',       'hamada@demo.trafikskolan.se',   'employed'::public.instructor_employment_type),
    (v_i4, v_org_id, 'Halkbana', 'Resursen',   'halkbana@demo.trafikskolan.se', 'employed'::public.instructor_employment_type)
  ON CONFLICT (id) DO NOTHING;

  -- ── 4. Current week Monday at 00:00 Stockholm local time ────────────────────
  v_week_mon := date_trunc('week',
    now() AT TIME ZONE 'Europe/Stockholm'
  ) AT TIME ZONE 'Europe/Stockholm';

  -- ── 5. Insert lesson slots (idempotent: skip if instructor already has a    ──
  --       slot starting at that exact moment to avoid EXCLUDE constraint error) ─
  -- Hours: 08–16 → 9 slots per instructor per day (45-min each starting on the hour)
  -- This gives the dense green/red grid visible in the reference screenshot.

  FOR v_d IN 0..4 LOOP      -- Mon=0 … Fri=4
    FOR v_h IN 8..16 LOOP   -- 08:00 … 16:00

      v_start := v_week_mon
                 + (v_d || ' days')::interval
                 + (v_h || ' hours')::interval;
      v_end   := v_start + '45 minutes'::interval;

      -- Kameran: all 5 days, ~30 % full
      IF NOT EXISTS (
        SELECT 1 FROM public.lesson_slots
        WHERE  instructor_id = v_i1
        AND    starts_at     = v_start
        AND    deleted_at IS NULL
      ) THEN
        v_is_full := random() < 0.30;
        v_status  := CASE WHEN v_is_full THEN 'full'::public.lesson_slot_status
                                          ELSE 'open'::public.lesson_slot_status END;
        INSERT INTO public.lesson_slots (
          organization_id, instructor_id, lesson_type_id,
          starts_at, ends_at, status, max_bookings, current_bookings
        ) VALUES (
          v_org_id, v_i1, v_lt_id,
          v_start, v_end,
          v_status, 1,
          CASE WHEN v_is_full THEN 1 ELSE 0 END
        );
      END IF;

      -- Lawko: Mon–Fri but no 08:00 or 16:00 slot, ~20 % full
      IF v_h NOT IN (8, 16) AND NOT EXISTS (
        SELECT 1 FROM public.lesson_slots
        WHERE  instructor_id = v_i2
        AND    starts_at     = v_start
        AND    deleted_at IS NULL
      ) THEN
        v_is_full := random() < 0.20;
        v_status  := CASE WHEN v_is_full THEN 'full'::public.lesson_slot_status
                                          ELSE 'open'::public.lesson_slot_status END;
        INSERT INTO public.lesson_slots (
          organization_id, instructor_id, lesson_type_id,
          starts_at, ends_at, status, max_bookings, current_bookings
        ) VALUES (
          v_org_id, v_i2, v_lt_id,
          v_start, v_end,
          v_status, 1,
          CASE WHEN v_is_full THEN 1 ELSE 0 END
        );
      END IF;

      -- Hamada: Mon–Thu only, ~25 % full
      IF v_d < 4 AND NOT EXISTS (
        SELECT 1 FROM public.lesson_slots
        WHERE  instructor_id = v_i3
        AND    starts_at     = v_start
        AND    deleted_at IS NULL
      ) THEN
        v_is_full := random() < 0.25;
        v_status  := CASE WHEN v_is_full THEN 'full'::public.lesson_slot_status
                                          ELSE 'open'::public.lesson_slot_status END;
        INSERT INTO public.lesson_slots (
          organization_id, instructor_id, lesson_type_id,
          starts_at, ends_at, status, max_bookings, current_bookings
        ) VALUES (
          v_org_id, v_i3, v_lt_id,
          v_start, v_end,
          v_status, 1,
          CASE WHEN v_is_full THEN 1 ELSE 0 END
        );
      END IF;

      -- Halkbana: Mon/Wed/Fri only, ~15 % full
      IF v_d IN (0, 2, 4) AND NOT EXISTS (
        SELECT 1 FROM public.lesson_slots
        WHERE  instructor_id = v_i4
        AND    starts_at     = v_start
        AND    deleted_at IS NULL
      ) THEN
        v_is_full := random() < 0.15;
        v_status  := CASE WHEN v_is_full THEN 'full'::public.lesson_slot_status
                                          ELSE 'open'::public.lesson_slot_status END;
        INSERT INTO public.lesson_slots (
          organization_id, instructor_id, lesson_type_id,
          starts_at, ends_at, status, max_bookings, current_bookings
        ) VALUES (
          v_org_id, v_i4, v_lt_id,
          v_start, v_end,
          v_status, 1,
          CASE WHEN v_is_full THEN 1 ELSE 0 END
        );
      END IF;

    END LOOP;
  END LOOP;

  RAISE NOTICE 'Demo schedule seeded. Org: % | Lesson type: %', v_org_id, v_lt_id;

END $$;
