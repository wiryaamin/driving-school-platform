-- =============================================================================
-- QUICK SEED: Lesson slots for the coming week using existing org + instructors
--
-- Prerequisites:
--   • All migrations applied
--   • bootstrap_org_admin.sql executed (active org must exist)
--   • At least one instructor must exist in the org
--
-- What this seeds:
--   • 2 lesson types (driving_b_45, theory_group) — idempotent, skipped if present
--   • 5 open slots (Mon–Fri next week) spread across existing instructors
--
-- Safe to re-run — duplicate starts_at per instructor is skipped via DO NOTHING
-- on the (organization_id, instructor_id, starts_at) conflict.
-- =============================================================================

DO $$
DECLARE
  v_org_id     uuid;
  v_lt_drv_45  uuid;
  v_lt_theory  uuid;
  v_anchor     timestamptz;

  -- instructor cursor
  v_instructors uuid[];
  v_instr_a     uuid;
  v_instr_b     uuid;

  v_inserted    int := 0;
BEGIN

  -- ── Guard: active org ───────────────────────────────────────────────────────
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE status = 'active'
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION E'\n\n  No active organization found.\n  Run bootstrap_org_admin.sql first.\n';
  END IF;

  RAISE NOTICE 'Org: %', v_org_id;

  -- ── Guard: at least one instructor ─────────────────────────────────────────
  SELECT ARRAY(
    SELECT id
    FROM public.instructors
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL
    ORDER BY created_at
    LIMIT 2
  ) INTO v_instructors;

  IF array_length(v_instructors, 1) IS NULL THEN
    RAISE EXCEPTION E'\n\n  No instructors found.\n  Run demo_data.sql first (creates Erik + Maria), then re-run this script.\n';
  END IF;

  v_instr_a := v_instructors[1];
  v_instr_b := COALESCE(v_instructors[2], v_instructors[1]); -- falls back to same if only 1

  RAISE NOTICE 'Instructors: % (A), % (B)', v_instr_a, v_instr_b;

  -- ── Lesson types ────────────────────────────────────────────────────────────
  INSERT INTO public.lesson_types (
    organization_id, name, code, category,
    default_duration_minutes, min_duration_minutes, max_duration_minutes,
    requires_vehicle, requires_instructor,
    required_certifications, max_students_per_slot,
    color_hex, display_order, is_active, pricing_sek
  ) VALUES
    (v_org_id, 'Körlektion 45 min', 'driving_b_45', 'driving',
     45, 30, 60, true, true, '{}', 1, '#3B82F6', 10, true, 695.00),
    (v_org_id, 'Teorigenomgång',    'theory_group', 'theory',
     60, 30, 90, false, true, '{}', 6, '#7C3AED', 30, true, 495.00)
  ON CONFLICT (organization_id, code) DO NOTHING;

  SELECT id INTO v_lt_drv_45 FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'driving_b_45';
  SELECT id INTO v_lt_theory  FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'theory_group';

  RAISE NOTICE 'Lesson types: driving_b_45=%, theory_group=%', v_lt_drv_45, v_lt_theory;

  -- ── Anchor: next Monday 00:00 UTC ───────────────────────────────────────────
  -- Stockholm summer (CEST) is UTC+2, so 07:00 UTC = 09:00 Stockholm.
  v_anchor := date_trunc('week', now() + interval '7 days');
  RAISE NOTICE 'Slots anchored to week of % (UTC)', v_anchor::date;

  -- ── Slots ───────────────────────────────────────────────────────────────────
  -- 5 slots spread Mon–Fri, alternating instructors A/B.
  -- ON CONFLICT DO NOTHING: safe to re-run even if some already exist.
  -- The unique index on lesson_slots is expected to be (organization_id, instructor_id, starts_at).

  -- Fixed UUIDs → ON CONFLICT (id) DO NOTHING makes this safely re-runnable
  INSERT INTO public.lesson_slots (
    id,
    organization_id, instructor_id, lesson_type_id,
    starts_at, ends_at, timezone,
    status, max_bookings, generation_source, notes
  ) VALUES
    -- Monday 09:00–09:45  körlektion  instructor A
    ('d5000001-0000-0000-0000-000000000001',
     v_org_id, v_instr_a, v_lt_drv_45,
     v_anchor + '7 hours'::interval, v_anchor + '7 hours 45 minutes'::interval,
     'Europe/Stockholm', 'open', 1, 'manual', 'Körlektion — måndag 09:00'),

    -- Tuesday 09:00–09:45  körlektion  instructor B
    ('d5000001-0000-0000-0000-000000000002',
     v_org_id, v_instr_b, v_lt_drv_45,
     v_anchor + '1 day 7 hours'::interval, v_anchor + '1 day 7 hours 45 minutes'::interval,
     'Europe/Stockholm', 'open', 1, 'manual', 'Körlektion — tisdag 09:00'),

    -- Wednesday 11:00–12:00  teori (6 platser)  instructor A
    ('d5000001-0000-0000-0000-000000000003',
     v_org_id, v_instr_a, v_lt_theory,
     v_anchor + '2 days 9 hours'::interval, v_anchor + '2 days 10 hours'::interval,
     'Europe/Stockholm', 'open', 6, 'manual', 'Teorigenomgång — onsdag 11:00'),

    -- Thursday 09:00–09:45  körlektion  instructor B
    ('d5000001-0000-0000-0000-000000000004',
     v_org_id, v_instr_b, v_lt_drv_45,
     v_anchor + '3 days 7 hours'::interval, v_anchor + '3 days 7 hours 45 minutes'::interval,
     'Europe/Stockholm', 'open', 1, 'manual', 'Körlektion — torsdag 09:00'),

    -- Friday 14:00–14:45  körlektion  instructor A
    ('d5000001-0000-0000-0000-000000000005',
     v_org_id, v_instr_a, v_lt_drv_45,
     v_anchor + '4 days 12 hours'::interval, v_anchor + '4 days 12 hours 45 minutes'::interval,
     'Europe/Stockholm', 'open', 1, 'manual', 'Körlektion — fredag 14:00')

  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RAISE NOTICE '✓ Inserted % new slot(s) (skipped duplicates)', v_inserted;
  RAISE NOTICE '';
  RAISE NOTICE '=== Done ===';
  RAISE NOTICE 'Navigate to the NEXT week on the calendar to see the slots.';

END $$;
