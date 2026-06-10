-- =============================================================================
-- DEMO SEED: Lesson Types, Instructors & Scheduling Continuity
--
-- Prerequisites:
--   1. All migrations applied
--   2. bootstrap_org_admin.sql executed (creates the 'trafikskolan' org)
--
-- What this seeds:
--   • 5 Swedish lesson types (driving, theory, risk1, risk2)
--   • 2 instructors (Erik Lindqvist, Maria Svensson)
--   • 6 lesson slots for the coming week
--
-- Safety:
--   • Idempotent — safe to re-run. All inserts use ON CONFLICT DO NOTHING.
--   • Does NOT touch: auth.users, profiles, memberships, RBAC, migrations.
--   • Slots are always anchored to the NEXT calendar week — stays current.
--
-- Run after bootstrap_org_admin.sql, before seeding BAS/dunning via Edge Functions.
-- =============================================================================

DO $$
DECLARE
  v_org_id        uuid;

  -- Fixed UUIDs make this idempotent across re-runs
  v_instr_erik    uuid := 'e1100001-0000-0000-0000-000000000001';
  v_instr_maria   uuid := 'e1100001-0000-0000-0000-000000000002';

  -- Lesson type IDs resolved by code after upsert
  v_lt_drv_45     uuid;
  v_lt_drv_60     uuid;
  v_lt_theory     uuid;
  v_lt_risk1      uuid;
  v_lt_risk2      uuid;

  -- Next-week Monday at 00:00 UTC (anchor for all slot times)
  v_next_mon      timestamptz;

BEGIN

  -- ─── Guard: org must exist ─────────────────────────────────────────────────
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE slug = 'trafikskolan' AND status = 'active';

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION
      E'\n\n'
      '  !! Organization not found !!\n'
      '  Run bootstrap_org_admin.sql first, then re-run this script.\n'
      '  Expected org slug: trafikskolan\n';
  END IF;

  RAISE NOTICE 'Organization found: %', v_org_id;

  -- ─── Step 1: Lesson types ─────────────────────────────────────────────────
  -- All per-org (organization_id is NOT NULL).
  -- Unique key: (organization_id, code) — safe to re-run.
  -- Colors chosen for calendar legibility in both light and dark modes.

  INSERT INTO public.lesson_types (
    organization_id, name, code, category,
    default_duration_minutes, min_duration_minutes, max_duration_minutes,
    requires_vehicle, requires_instructor,
    required_certifications, max_students_per_slot,
    color_hex, display_order, is_active, pricing_sek
  ) VALUES
    -- Körlektion 45 min — standard slot for experienced students
    (v_org_id, 'Körlektion 45 min', 'driving_b_45', 'driving',
     45, 30, 60, true, true, '{}', 1,
     '#3B82F6', 10, true, 695.00),

    -- Körlektion 60 min — standard introductory / intensive slot
    (v_org_id, 'Körlektion 60 min', 'driving_b_60', 'driving',
     60, 45, 90, true, true, '{}', 1,
     '#2563EB', 20, true, 895.00),

    -- Teorigenomgång — group theory session; up to 6 students per slot
    (v_org_id, 'Teorigenomgång', 'theory_group', 'theory',
     60, 30, 90, false, true, '{}', 6,
     '#7C3AED', 30, true, 495.00),

    -- Riskutbildning 1 — Riskettan (halkan + hazard theory); half-day
    (v_org_id, 'Riskutbildning 1 (Riskettan)', 'risk1_standard', 'risk1',
     240, 180, 300, false, true, '{}', 12,
     '#D97706', 40, true, 2950.00),

    -- Riskutbildning 2 — Risktvåan (mörker- / motorvägskörning); group of 4
    (v_org_id, 'Riskutbildning 2 (Risktvåan)', 'risk2_standard', 'risk2',
     120, 90, 180, true, true, '{}', 4,
     '#DC2626', 50, true, 2750.00)

  ON CONFLICT (organization_id, code) DO NOTHING;

  RAISE NOTICE '✓ Lesson types seeded (5 types: driving_b_45, driving_b_60, theory_group, risk1_standard, risk2_standard)';

  -- Resolve lesson type IDs for slot insertion
  SELECT id INTO v_lt_drv_45  FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'driving_b_45';
  SELECT id INTO v_lt_drv_60  FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'driving_b_60';
  SELECT id INTO v_lt_theory  FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'theory_group';
  SELECT id INTO v_lt_risk1   FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'risk1_standard';
  SELECT id INTO v_lt_risk2   FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'risk2_standard';

  -- ─── Step 2: Instructors ──────────────────────────────────────────────────
  -- Fixed UUIDs → idempotent across re-runs.
  -- personnummer_* left NULL — no GDPR-sensitive data in demo seed.
  -- No user_id linkage — instructors exist as records, not portal users.

  INSERT INTO public.instructors (
    id, organization_id,
    first_name, last_name, email, phone,
    employment_type, employment_started_at, employee_number,
    teaching_categories, adi_number, adi_valid_until,
    languages_spoken, max_lessons_per_day
  ) VALUES
    -- Erik Lindqvist — senior instructor, B licence, bilingual sv/en
    (v_instr_erik, v_org_id,
     'Erik', 'Lindqvist', 'erik.lindqvist@trafikskolan.se', '070-123 45 67',
     'employed', '2018-06-01', 'TL-001',
     '{B}', 'ADI-2018-1234', '2027-03-15',
     '{sv,en}', 6),

    -- Maria Svensson — instructor, B + BE (trailer), Swedish only
    (v_instr_maria, v_org_id,
     'Maria', 'Svensson', 'maria.svensson@trafikskolan.se', '073-987 65 43',
     'employed', '2020-09-01', 'TL-002',
     '{B,BE}', 'ADI-2020-5678', '2028-07-22',
     '{sv}', 5)

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ Instructors seeded: Erik Lindqvist (TL-001), Maria Svensson (TL-002)';

  -- ─── Step 3: Lesson slots — next calendar week ────────────────────────────
  -- Anchored to next Monday 00:00 UTC.
  -- Stockholm is CEST (UTC+2) in summer: 09:00 Stockholm = 07:00 UTC.
  -- location_id is NULL — org-wide (nullable FK, valid per schema).
  -- vehicle_id is NULL for theory/no-vehicle types; also NULL here for simplicity.
  -- current_bookings maintained by trigger — do not set manually.

  v_next_mon := date_trunc('week', now() + interval '7 days');

  INSERT INTO public.lesson_slots (
    id, organization_id, instructor_id, lesson_type_id,
    starts_at, ends_at, timezone,
    status, max_bookings, generation_source, notes
  ) VALUES
    -- Monday 09:00–09:45  körlektion 45 min  Erik
    ('51100001-0000-0000-0000-000000000001', v_org_id, v_instr_erik, v_lt_drv_45,
     v_next_mon + interval '7 hours',
     v_next_mon + interval '7 hours 45 minutes',
     'Europe/Stockholm', 'open', 1, 'manual', 'Körlektion — Erik'),

    -- Monday 14:00–15:00  körlektion 60 min  Maria
    ('51100001-0000-0000-0000-000000000002', v_org_id, v_instr_maria, v_lt_drv_60,
     v_next_mon + interval '12 hours',
     v_next_mon + interval '13 hours',
     'Europe/Stockholm', 'open', 1, 'manual', 'Körlektion — Maria'),

    -- Tuesday 09:00–09:45  körlektion 45 min  Maria
    ('51100001-0000-0000-0000-000000000003', v_org_id, v_instr_maria, v_lt_drv_45,
     v_next_mon + interval '1 day 7 hours',
     v_next_mon + interval '1 day 7 hours 45 minutes',
     'Europe/Stockholm', 'open', 1, 'manual', 'Körlektion — Maria'),

    -- Wednesday 11:00–12:00  teorigenomgång  Maria  (group: 6 seats)
    ('51100001-0000-0000-0000-000000000004', v_org_id, v_instr_maria, v_lt_theory,
     v_next_mon + interval '2 days 9 hours',
     v_next_mon + interval '2 days 10 hours',
     'Europe/Stockholm', 'open', 6, 'manual', 'Teorigenomgång — Maria'),

    -- Thursday 09:00–10:00  körlektion 60 min  Erik
    ('51100001-0000-0000-0000-000000000005', v_org_id, v_instr_erik, v_lt_drv_60,
     v_next_mon + interval '3 days 7 hours',
     v_next_mon + interval '3 days 8 hours',
     'Europe/Stockholm', 'open', 1, 'manual', 'Körlektion — Erik'),

    -- Friday 09:00–09:45  körlektion 45 min  Erik
    ('51100001-0000-0000-0000-000000000006', v_org_id, v_instr_erik, v_lt_drv_45,
     v_next_mon + interval '4 days 7 hours',
     v_next_mon + interval '4 days 7 hours 45 minutes',
     'Europe/Stockholm', 'open', 1, 'manual', 'Körlektion — Erik')

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ Lesson slots seeded: 6 slots anchored to week of %', v_next_mon::date;
  RAISE NOTICE '  Mon: körlektion 45 (Erik 09:00), körlektion 60 (Maria 14:00)';
  RAISE NOTICE '  Tue: körlektion 45 (Maria 09:00)';
  RAISE NOTICE '  Wed: teorigenomgång (Maria 11:00, 6 seats)';
  RAISE NOTICE '  Thu: körlektion 60 (Erik 09:00)';
  RAISE NOTICE '  Fri: körlektion 45 (Erik 09:00)';

  RAISE NOTICE '';
  RAISE NOTICE '=== Demo seed complete ===';
  RAISE NOTICE 'Lesson types : 5 (driving_b_45, driving_b_60, theory_group, risk1_standard, risk2_standard)';
  RAISE NOTICE 'Instructors  : 2 (Erik Lindqvist TL-001, Maria Svensson TL-002)';
  RAISE NOTICE 'Slots        : 6 (Mon–Fri next week, 09:00–14:00 Stockholm)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. POST /swedish-settings/seed-bas     — seeds BAS chart of accounts';
  RAISE NOTICE '  2. POST /swedish-settings/seed-dunning — seeds Swedish dunning schedule';

END $$;
