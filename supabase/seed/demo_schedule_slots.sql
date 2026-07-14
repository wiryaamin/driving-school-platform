-- =============================================================================
-- DEMO SEED: Dense Bokningsschema slots — current week + next 3 weeks
--
-- Generates realistic 45-minute lesson slots for ALL active instructors,
-- Mon–Fri, 08:00–17:00 Stockholm time (12 slots/day/instructor).
-- Mostly open (green) with a few blocked (red) on Thursday mornings.
--
-- Prerequisites:
--   1. All migrations applied
--   2. bootstrap_org_admin.sql executed (org + instructors must exist)
--   3. demo_data.sql executed (lesson types driving_b_45, risk1_standard must exist)
--
-- Safe to re-run. Conflicts with EXCLUDE constraints are silently ignored.
-- =============================================================================

DO $$
DECLARE
  v_org_id        uuid;
  v_lt_drv_45     uuid;
  v_lt_risk1      uuid;
  v_instr         record;
  v_week_mon      timestamptz;
  v_starts_at     timestamptz;
  v_ends_at       timestamptz;
  v_status        lesson_slot_status;
  v_lt_id         uuid;
  v_instr_count   int := 0;
  week_idx        int;
  v_day           int;
  v_slot          int;
  total_ok        int := 0;
BEGIN

  -- ── Guard: org must exist ──────────────────────────────────────────────────
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE slug = 'trafikskolan' AND status = 'active';

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION
      E'\n  !! Organization not found. Run bootstrap_org_admin.sql first.\n';
  END IF;

  -- ── Resolve lesson types ───────────────────────────────────────────────────
  SELECT id INTO v_lt_drv_45
  FROM public.lesson_types
  WHERE organization_id = v_org_id AND code = 'driving_b_45';

  SELECT id INTO v_lt_risk1
  FROM public.lesson_types
  WHERE organization_id = v_org_id AND code = 'risk1_standard';

  IF v_lt_drv_45 IS NULL THEN
    RAISE EXCEPTION
      E'\n  !! Lesson type driving_b_45 not found. Run demo_data.sql first.\n';
  END IF;

  -- Count active instructors
  SELECT COUNT(*) INTO v_instr_count
  FROM public.instructors
  WHERE organization_id = v_org_id AND deleted_at IS NULL;

  RAISE NOTICE 'Seeding schedule for org=%, % instructors', v_org_id, v_instr_count;

  -- ── Generate slots: current week + next 3 weeks ────────────────────────────
  -- Each week: Mon–Fri × 12 slots × 45 min = 08:00–17:00 Stockholm (CEST = UTC+2)
  -- v_week_mon is always Monday 00:00 UTC.
  -- +6 hours shifts to 06:00 UTC = 08:00 Stockholm in CEST.

  FOR week_idx IN 0..3 LOOP
    v_week_mon := date_trunc('week', now() + (week_idx * 7 || ' days')::interval);

    FOR v_instr IN
      SELECT id, first_name, last_name, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
      FROM public.instructors
      WHERE organization_id = v_org_id
        AND deleted_at IS NULL
      ORDER BY created_at
    LOOP
      -- Mon(0) … Fri(4)
      FOR v_day IN 0..4 LOOP

        -- 12 × 45-min slots: 08:00, 08:45, 09:30 … 16:15
        FOR v_slot IN 0..11 LOOP

          v_starts_at := v_week_mon
            + (v_day  || ' days')::interval
            + interval '6 hours'
            + ((v_slot * 45) || ' minutes')::interval;
          v_ends_at := v_starts_at + interval '45 minutes';

          -- Thursday morning (slots 0–2) for the first instructor → blocked (red)
          -- This reproduces the "Ris" / blocked-time visual from the reference.
          IF v_day = 3 AND v_slot < 3 AND v_instr.rn = 1 THEN
            v_status := 'blocked'::lesson_slot_status;
            v_lt_id  := COALESCE(v_lt_risk1, v_lt_drv_45);
          ELSE
            v_status := 'open'::lesson_slot_status;
            v_lt_id  := v_lt_drv_45;
          END IF;

          -- ON CONFLICT DO NOTHING handles the instructor EXCLUDE constraint
          -- (lesson_slots_instructor_no_overlap) so re-runs are safe.
          BEGIN
            INSERT INTO public.lesson_slots (
              id,
              organization_id,
              instructor_id,
              lesson_type_id,
              starts_at,
              ends_at,
              timezone,
              status,
              max_bookings,
              generation_source
            ) VALUES (
              gen_random_uuid(),
              v_org_id,
              v_instr.id,
              v_lt_id,
              v_starts_at,
              v_ends_at,
              'Europe/Stockholm',
              v_status,
              1,
              'manual'::slot_generation_source
            );
            total_ok := total_ok + 1;
          EXCEPTION
            WHEN exclusion_violation OR unique_violation THEN
              NULL; -- slot already exists for this instructor × time
          END;

        END LOOP; -- slot
      END LOOP;   -- day
    END LOOP;     -- instructor
  END LOOP;       -- week

  RAISE NOTICE '✓ Demo schedule seeded: % new slots (% instructors × Mon–Fri × 12 slots × 4 weeks)',
    total_ok, v_instr_count;

END $$;
