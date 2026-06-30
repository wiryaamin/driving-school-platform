-- =============================================================================
-- DEMO SEED: Sprint 1–10 Comprehensive Operational Data
--
-- Prerequisites:
--   1. All migrations applied
--   2. bootstrap_org_admin.sql executed (creates the 'trafikskolan' org)
--   3. demo_data.sql executed     (2 instructors, lesson types, 6 next-week slots)
--   4. demo_full_data.sql executed (12 students, 4 corporate customers, 6 bookings, 6 invoices)
--
-- What this seeds:
--   •  1 additional instructor  (Johan Bergström TL-003, B+C)
--   •  3 vehicles               (Volvo V40 manual, Skoda Octavia manual, Volvo S60 automatic)
--   • 13 additional students    (s13–s25; all lifecycle & permit stages, notes, all instructors)
--   •  5 training materials     (teori, körning, risk, lagregler, övrigt)
--   • 15 historical lesson slots (past 12 weeks; completed & cancelled, some with vehicles)
--   • 15 historical bookings    (completed, no_show, cancelled with reasons)
--   • 12 booking attendance records (performance ratings 3–5, instructor notes)
--   •  4 booking notes          (internal & shared)
--   •  2 full future slots      (for waitlist demonstration)
--   •  2 confirmed bookings     (filling those full slots)
--   •  3 waitlist entries       (waiting students)
--   •  9 student terms acceptances (Sprint 9 portal feature)
--   • 14 material completions   (Sprint 8 portal feature)
--   •  6 automation rules       (all rule_types enabled/configured)
--   • 12 notifications          (sent × 6, failed × 3, pending × 3)
--   •  8 additional invoices    (issued, paid, overdue, draft)
--
-- Safe to re-run. All inserts use ON CONFLICT (id) DO NOTHING.
-- Does NOT touch: schema, migrations, auth, Edge Functions, or finance logic.
-- =============================================================================

DO $$
DECLARE
  v_org_id         uuid;

  -- ── Instructors ────────────────────────────────────────────────────────────
  v_instr_erik     uuid := 'e1100001-0000-0000-0000-000000000001';
  v_instr_maria    uuid := 'e1100001-0000-0000-0000-000000000002';
  v_instr_johan    uuid := 'e1100001-0000-0000-0000-000000000003'; -- new

  -- ── Vehicles ───────────────────────────────────────────────────────────────
  veh1             uuid := 'beef0001-0000-0000-0000-000000000001';
  veh2             uuid := 'beef0001-0000-0000-0000-000000000002';
  veh3             uuid := 'beef0001-0000-0000-0000-000000000003';

  -- ── Lesson type IDs (resolved from codes) ─────────────────────────────────
  v_lt_drv_45      uuid;
  v_lt_drv_60      uuid;
  v_lt_theory      uuid;

  -- ── Existing students (referenced in bookings) ────────────────────────────
  s1  uuid := 'aaaa0001-0000-0000-0000-000000000001';
  s2  uuid := 'aaaa0001-0000-0000-0000-000000000002';
  s3  uuid := 'aaaa0001-0000-0000-0000-000000000003';
  s4  uuid := 'aaaa0001-0000-0000-0000-000000000004';
  s5  uuid := 'aaaa0001-0000-0000-0000-000000000005';
  s6  uuid := 'aaaa0001-0000-0000-0000-000000000006';
  s7  uuid := 'aaaa0001-0000-0000-0000-000000000007';
  s9  uuid := 'aaaa0001-0000-0000-0000-000000000009';
  s10 uuid := 'aaaa0001-0000-0000-0000-000000000010';
  s11 uuid := 'aaaa0001-0000-0000-0000-000000000011';

  -- ── New students s13–s25 ──────────────────────────────────────────────────
  s13 uuid := 'aaaa0001-0000-0000-0000-000000000013';
  s14 uuid := 'aaaa0001-0000-0000-0000-000000000014';
  s15 uuid := 'aaaa0001-0000-0000-0000-000000000015';
  s16 uuid := 'aaaa0001-0000-0000-0000-000000000016';
  s17 uuid := 'aaaa0001-0000-0000-0000-000000000017';
  s18 uuid := 'aaaa0001-0000-0000-0000-000000000018';
  s19 uuid := 'aaaa0001-0000-0000-0000-000000000019';
  s20 uuid := 'aaaa0001-0000-0000-0000-000000000020';
  s21 uuid := 'aaaa0001-0000-0000-0000-000000000021';
  s22 uuid := 'aaaa0001-0000-0000-0000-000000000022';
  s23 uuid := 'aaaa0001-0000-0000-0000-000000000023';
  s24 uuid := 'aaaa0001-0000-0000-0000-000000000024';
  s25 uuid := 'aaaa0001-0000-0000-0000-000000000025';

  -- ── Training materials ────────────────────────────────────────────────────
  mat1 uuid := 'fade0001-0000-0000-0000-000000000001';
  mat2 uuid := 'fade0001-0000-0000-0000-000000000002';
  mat3 uuid := 'fade0001-0000-0000-0000-000000000003';
  mat4 uuid := 'fade0001-0000-0000-0000-000000000004';
  mat5 uuid := 'fade0001-0000-0000-0000-000000000005';

  -- ── Historical slots (15, spread across past 12 weeks) ───────────────────
  -- Week -12: hs01–hs03
  hs01 uuid := '51100002-0000-0000-0000-000000000001';
  hs02 uuid := '51100002-0000-0000-0000-000000000002';
  hs03 uuid := '51100002-0000-0000-0000-000000000003';
  -- Week -8: hs04–hs06
  hs04 uuid := '51100002-0000-0000-0000-000000000004';
  hs05 uuid := '51100002-0000-0000-0000-000000000005';
  hs06 uuid := '51100002-0000-0000-0000-000000000006';
  -- Week -4: hs07–hs10
  hs07 uuid := '51100002-0000-0000-0000-000000000007';
  hs08 uuid := '51100002-0000-0000-0000-000000000008';
  hs09 uuid := '51100002-0000-0000-0000-000000000009';
  hs10 uuid := '51100002-0000-0000-0000-000000000010';
  -- Week -2: hs11–hs13
  hs11 uuid := '51100002-0000-0000-0000-000000000011';
  hs12 uuid := '51100002-0000-0000-0000-000000000012';
  hs13 uuid := '51100002-0000-0000-0000-000000000013';
  -- Week -1: hs14–hs15
  hs14 uuid := '51100002-0000-0000-0000-000000000014';
  hs15 uuid := '51100002-0000-0000-0000-000000000015';

  -- ── Historical bookings (15, one per historical slot) ─────────────────────
  hb01 uuid := 'dddd0002-0000-0000-0000-000000000001';
  hb02 uuid := 'dddd0002-0000-0000-0000-000000000002';
  hb03 uuid := 'dddd0002-0000-0000-0000-000000000003';
  hb04 uuid := 'dddd0002-0000-0000-0000-000000000004';
  hb05 uuid := 'dddd0002-0000-0000-0000-000000000005';
  hb06 uuid := 'dddd0002-0000-0000-0000-000000000006';
  hb07 uuid := 'dddd0002-0000-0000-0000-000000000007';
  hb08 uuid := 'dddd0002-0000-0000-0000-000000000008';
  hb09 uuid := 'dddd0002-0000-0000-0000-000000000009';
  hb10 uuid := 'dddd0002-0000-0000-0000-000000000010';
  hb11 uuid := 'dddd0002-0000-0000-0000-000000000011';
  hb12 uuid := 'dddd0002-0000-0000-0000-000000000012';
  hb13 uuid := 'dddd0002-0000-0000-0000-000000000013';
  hb14 uuid := 'dddd0002-0000-0000-0000-000000000014';
  hb15 uuid := 'dddd0002-0000-0000-0000-000000000015';

  -- ── Full future slots + confirmed bookings for waitlist demonstration ──────
  fs01 uuid := '51100003-0000-0000-0000-000000000001';
  fs02 uuid := '51100003-0000-0000-0000-000000000002';
  fb01 uuid := 'dddd0003-0000-0000-0000-000000000001';
  fb02 uuid := 'dddd0003-0000-0000-0000-000000000002';

  -- ── Waitlist entries ──────────────────────────────────────────────────────
  we01 uuid := 'cafe0001-0000-0000-0000-000000000001';
  we02 uuid := 'cafe0001-0000-0000-0000-000000000002';
  we03 uuid := 'cafe0001-0000-0000-0000-000000000003';

  -- ── Booking attendance (12, for completed bookings) ───────────────────────
  ba01 uuid := 'aaaa0002-0000-0000-0000-000000000001';
  ba02 uuid := 'aaaa0002-0000-0000-0000-000000000002';
  ba03 uuid := 'aaaa0002-0000-0000-0000-000000000003';
  ba04 uuid := 'aaaa0002-0000-0000-0000-000000000004';
  ba05 uuid := 'aaaa0002-0000-0000-0000-000000000005';
  ba06 uuid := 'aaaa0002-0000-0000-0000-000000000006';
  ba07 uuid := 'aaaa0002-0000-0000-0000-000000000007';
  ba08 uuid := 'aaaa0002-0000-0000-0000-000000000008';
  ba09 uuid := 'aaaa0002-0000-0000-0000-000000000009';
  ba10 uuid := 'aaaa0002-0000-0000-0000-000000000010';
  ba11 uuid := 'aaaa0002-0000-0000-0000-000000000011';
  ba12 uuid := 'aaaa0002-0000-0000-0000-000000000012';

  -- ── Booking notes (4) ─────────────────────────────────────────────────────
  bn01 uuid := 'bead0001-0000-0000-0000-000000000001';
  bn02 uuid := 'bead0001-0000-0000-0000-000000000002';
  bn03 uuid := 'bead0001-0000-0000-0000-000000000003';
  bn04 uuid := 'bead0001-0000-0000-0000-000000000004';

  -- ── Additional invoices ───────────────────────────────────────────────────
  inv7  uuid := 'cccc0002-0000-0000-0000-000000000001';
  inv8  uuid := 'cccc0002-0000-0000-0000-000000000002';
  inv9  uuid := 'cccc0002-0000-0000-0000-000000000003';
  inv10 uuid := 'cccc0002-0000-0000-0000-000000000004';
  inv11 uuid := 'cccc0002-0000-0000-0000-000000000005';
  inv12 uuid := 'cccc0002-0000-0000-0000-000000000006';
  inv13 uuid := 'cccc0002-0000-0000-0000-000000000007';
  inv14 uuid := 'cccc0002-0000-0000-0000-000000000008';

  -- ── Time anchors ──────────────────────────────────────────────────────────
  v_w12 timestamptz;  -- Monday 12 weeks ago
  v_w8  timestamptz;  -- Monday 8 weeks ago
  v_w4  timestamptz;  -- Monday 4 weeks ago
  v_w2  timestamptz;  -- Monday 2 weeks ago
  v_w1  timestamptz;  -- Monday last week
  v_w2f timestamptz;  -- Monday 2 weeks from now (for future full slots)

BEGIN

  -- ─── Guard: org must exist ─────────────────────────────────────────────────
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE slug = 'trafikskolan' AND status = 'active';

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION
      E'\n\n  !! Organization not found !!\n'
      '  Run bootstrap_org_admin.sql first, then demo_data.sql + demo_full_data.sql.\n';
  END IF;

  -- Resolve lesson type IDs
  SELECT id INTO v_lt_drv_45 FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'driving_b_45';
  SELECT id INTO v_lt_drv_60 FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'driving_b_60';
  SELECT id INTO v_lt_theory FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'theory_group';

  IF v_lt_drv_45 IS NULL THEN
    RAISE EXCEPTION E'\n  !! Lesson types not found. Run demo_data.sql first.\n';
  END IF;

  -- Compute week anchors (Monday 00:00 UTC for each target week)
  v_w12 := date_trunc('week', now()) - interval '12 weeks';
  v_w8  := date_trunc('week', now()) - interval '8 weeks';
  v_w4  := date_trunc('week', now()) - interval '4 weeks';
  v_w2  := date_trunc('week', now()) - interval '2 weeks';
  v_w1  := date_trunc('week', now()) - interval '1 week';
  v_w2f := date_trunc('week', now()) + interval '14 days';

  RAISE NOTICE 'Organization: %', v_org_id;

  -- ===========================================================================
  -- 1. THIRD INSTRUCTOR — Johan Bergström (B+C, TL-003)
  -- ===========================================================================

  INSERT INTO public.instructors (
    id, organization_id,
    first_name, last_name, email, phone,
    employment_type, employment_started_at, employee_number,
    teaching_categories, adi_number, adi_valid_until,
    languages_spoken, max_lessons_per_day
  ) VALUES (
    v_instr_johan, v_org_id,
    'Johan', 'Bergström', 'johan.bergstrom@trafikskolan.se', '076-444 55 66',
    'employed', '2023-03-15', 'TL-003',
    '{B,C}', 'ADI-2023-9012', '2029-06-30',
    '{sv}', 5
  ) ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ Instructor 3 seeded: Johan Bergström (TL-003, B+C)';

  -- ===========================================================================
  -- 2. VEHICLES (3 cars — manual, manual, automatic)
  -- ===========================================================================

  INSERT INTO public.vehicles (
    id, organization_id,
    registration_number, make, model, model_year, color,
    transmission, has_dual_controls, fuel_type, seats,
    teaching_categories, ownership_type, operational_status,
    registration_expires_at, insurance_expires_at,
    next_inspection_due_at, last_inspected_at
  ) VALUES

    -- Volvo V40 2022, manual — primary driving school car
    (veh1, v_org_id,
     'ABC 123', 'Volvo', 'V40', 2022, 'Grå',
     'manual', true, 'gasoline', 5,
     '{B}', 'owned', 'available',
     '2026-12-31', '2027-01-31',
     '2026-12-01', '2025-11-28'),

    -- Skoda Octavia 2023, manual — secondary car
    (veh2, v_org_id,
     'DEF 456', 'Skoda', 'Octavia', 2023, 'Vit',
     'manual', true, 'gasoline', 5,
     '{B}', 'owned', 'available',
     '2027-06-30', '2027-06-30',
     '2027-05-15', '2026-05-10'),

    -- Volvo S60 2021, automatic — inspection overdue
    (veh3, v_org_id,
     'GHI 789', 'Volvo', 'S60', 2021, 'Svart',
     'automatic', true, 'hybrid', 5,
     '{B}', 'leased', 'inspection_due',
     '2027-03-31', '2026-09-30',
     '2026-05-31', '2025-05-22')

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ 3 vehicles seeded (ABC 123 Volvo V40, DEF 456 Skoda Octavia, GHI 789 Volvo S60)';

  -- ===========================================================================
  -- 3. ADDITIONAL STUDENTS (s13–s25, 13 students)
  --    Covers: all lifecycle stages, all permit stages, all 3 instructors,
  --            B/C/BE categories, student notes (Sprint 10)
  -- ===========================================================================

  INSERT INTO public.students (
    id, organization_id,
    first_name, last_name, email, phone,
    address_line1, postal_code, city,
    date_of_birth,
    status, permit_stage,
    assigned_instructor_id,
    target_licence_category,
    communication_opt_in_sms, communication_opt_in_email,
    data_processing_consent,
    enrolled_at, gdpr_consent_given_at
  ) VALUES

    -- Sara Lindberg — active, risk2_booked, Johan
    (s13, v_org_id, 'Sara', 'Lindberg', 'sara.lindberg@gmail.com', '070-321 54 67',
     'Storgatan 45', '171 41', 'Solna', '2004-06-18',
     'active', 'risk2_booked', v_instr_johan, 'B',
     true, true, true,
     now() - interval '5 months', now() - interval '5 months'),

    -- Marcus Pettersson — active, risk2_completed, Johan
    (s14, v_org_id, 'Marcus', 'Pettersson', 'marcus.pettersson@outlook.com', '073-654 32 10',
     'Bergsgatan 12', '112 23', 'Stockholm', '2003-09-04',
     'active', 'risk2_completed', v_instr_johan, 'B',
     true, true, true,
     now() - interval '7 months', now() - interval '7 months'),

    -- Freya Håkansson — active, theory_passed, Maria
    (s15, v_org_id, 'Freya', 'Håkansson', 'freya.hakansson@live.se', '076-789 01 23',
     'Ringvägen 8', '118 61', 'Stockholm', '2005-02-14',
     'active', 'theory_passed', v_instr_maria, 'B',
     false, true, true,
     now() - interval '4 months', now() - interval '4 months'),

    -- Emil Bergström — active, practical_exam_booked, Erik
    (s16, v_org_id, 'Emil', 'Bergström', 'emil.bergstrom@gmail.com', '079-012 34 56',
     'Folkungagatan 33', '116 22', 'Stockholm', '2002-11-28',
     'active', 'practical_exam_booked', v_instr_erik, 'B',
     true, true, true,
     now() - interval '9 months', now() - interval '9 months'),

    -- Astrid Olsson — active, risk1_completed, Johan
    (s17, v_org_id, 'Astrid', 'Olsson', 'astrid.olsson@gmail.com', '070-234 56 78',
     'Döbelnsgatan 19', '113 52', 'Stockholm', '2004-04-30',
     'active', 'risk1_completed', v_instr_johan, 'B',
     true, true, true,
     now() - interval '3 months', now() - interval '3 months'),

    -- Viktor Sundqvist — active, theory_study, Maria
    (s18, v_org_id, 'Viktor', 'Sundqvist', 'viktor.sundqvist@hotmail.com', '073-456 78 90',
     'Birger Jarlsgatan 77', '114 35', 'Stockholm', '2005-08-11',
     'active', 'theory_study', v_instr_maria, 'B',
     false, true, true,
     now() - interval '6 weeks', now() - interval '6 weeks'),

    -- Linnea Ek — lead (interest form submitted, not started)
    (s19, v_org_id, 'Linnea', 'Ek', 'linnea.ek@gmail.com', '076-567 89 01',
     'Karlavägen 22', '114 31', 'Stockholm', '2006-12-03',
     'lead', 'not_started', NULL, 'B',
     true, true, false,
     NULL, NULL),

    -- Carl Magnusson — onboarding (just signed up, not enrolled)
    (s20, v_org_id, 'Carl', 'Magnusson', 'carl.magnusson@outlook.com', '079-678 90 12',
     'Sveavägen 102', '113 50', 'Stockholm', '2005-05-20',
     'onboarding', 'not_started', NULL, 'B',
     true, true, true,
     NULL, now() - interval '3 days'),

    -- Klara Mattsson — paused (taking a break)
    (s21, v_org_id, 'Klara', 'Mattsson', 'klara.mattsson@gmail.com', '070-789 01 23',
     'Hornsgatan 51', '118 49', 'Stockholm', '2003-07-09',
     'paused', 'theory_study', v_instr_erik, 'B',
     false, true, true,
     now() - interval '11 months', now() - interval '11 months'),

    -- David Lindqvist — withdrawn (left the programme)
    (s22, v_org_id, 'David', 'Lindqvist', 'david.lindqvist@gmail.com', '073-890 12 34',
     'Götgatan 88', '118 30', 'Stockholm', '2004-01-22',
     'withdrawn', 'not_started', NULL, 'B',
     false, false, true,
     NULL, now() - interval '2 months'),

    -- Nora Björnsson — active, risk1_booked, Johan
    (s23, v_org_id, 'Nora', 'Björnsson', 'nora.bjornsson@live.se', '076-901 23 45',
     'Lidingövägen 5', '115 24', 'Stockholm', '2005-10-17',
     'active', 'risk1_booked', v_instr_johan, 'B',
     true, true, true,
     now() - interval '10 weeks', now() - interval '10 weeks'),

    -- Oscar Jakobsson — completed (recent graduate)
    (s24, v_org_id, 'Oscar', 'Jakobsson', 'oscar.jakobsson@gmail.com', '079-012 34 56',
     'Karlavagen 3', '114 31', 'Stockholm', '2002-03-14',
     'completed', 'licence_issued', v_instr_erik, 'B',
     true, true, true,
     now() - interval '14 months', now() - interval '14 months'),

    -- Julia Hansson — active, not_started, Maria — C category (truck)
    (s25, v_org_id, 'Julia', 'Hansson', 'julia.hansson@gmail.com', '070-123 98 76',
     'Hantverkargatan 14', '112 21', 'Stockholm', '1990-07-25',
     'active', 'not_started', v_instr_maria, 'C',
     true, true, true,
     now() - interval '2 weeks', now() - interval '2 weeks')

  ON CONFLICT (id) DO NOTHING;

  -- Optional: seed student notes if the Sprint 10 migration has been applied
  -- (migration 20260617110000_student_notes.sql adds notes TEXT to students)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'notes'
  ) THEN
    UPDATE public.students SET notes = 'Har körtillstånd via förälder. Vill köra uppkörning i september.'
      WHERE id = s13 AND notes IS NULL;
    UPDATE public.students SET notes = 'Uppkörning inbokad 3 juli. Nervös men välförberedd.'
      WHERE id = s16 AND notes IS NULL;
    UPDATE public.students SET notes = 'Pausat t.o.m. aug 2026 pga utlandsvistelse. Kontakta per e-post vid frågor.'
      WHERE id = s21 AND notes IS NULL;
    UPDATE public.students SET notes = 'Avbröt utbildningen efter personliga skäl. Ingen återbetalning beviljad.'
      WHERE id = s22 AND notes IS NULL;
    UPDATE public.students SET notes = 'Yrkeschaufför, vill komplettera till C-körkort. Har B sedan 2010.'
      WHERE id = s25 AND notes IS NULL;
    RAISE NOTICE '✓ Student notes applied (Sprint 10 migration detected)';
  ELSE
    RAISE NOTICE '~ Student notes skipped (run migration 20260617110000_student_notes.sql first)';
  END IF;

  RAISE NOTICE '✓ 13 new students seeded (s13–s25)';

  -- ===========================================================================
  -- 4. TRAINING MATERIALS (Sprint 8 portal feature)
  --    Requires migration 20260620000002_training_materials.sql
  -- ===========================================================================

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'training_materials'
  ) THEN
    INSERT INTO public.training_materials (
      id, organization_id,
      title, description, category, content_type, url,
      is_published, display_order
    ) VALUES

      (mat1, v_org_id,
       'Teoribok kapitel 1–5',
       'Grundläggande trafikregler och vägmärken. Obligatoriskt för alla elever.',
       'teori', 'link', 'https://material.trafikskolan.se/teori/kap1-5',
       true, 10),

      (mat2, v_org_id,
       'Körövningar A–F',
       'Praktiska övningsuppgifter för körkortsträning. Gå igenom med läraren.',
       'körning', 'link', 'https://material.trafikskolan.se/korning/ovningar',
       true, 20),

      (mat3, v_org_id,
       'Riskutbildning 1 — Förberedelse',
       'Video inför Riskettan (halkan). Se denna innan kursdagen.',
       'risk', 'video', 'https://material.trafikskolan.se/risk/riskettan-forberedelse',
       true, 30),

      (mat4, v_org_id,
       'Vägtrafiklagen 2024',
       'Komplett vägtrafiklagstiftning. Referensmaterial för teoriprov.',
       'lagregler', 'document', 'https://material.trafikskolan.se/lagregler/vtl2024',
       true, 40),

      (mat5, v_org_id,
       'Välkommen till Trafikskolan',
       'Introduktion till din utbildning — schema, regler och kontaktuppgifter.',
       'övrigt', 'link', 'https://material.trafikskolan.se/info/valkomst',
       true, 5)

    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE '✓ 5 training materials seeded (teori, körning, risk, lagregler, övrigt)';
  ELSE
    RAISE NOTICE '~ Training materials skipped (run migration 20260620000002_training_materials.sql first)';
  END IF;

  -- ===========================================================================
  -- 5. HISTORICAL LESSON SLOTS (15 slots, past 12 weeks)
  --    Week -12: Mon/Wed/Fri
  --    Week -8:  Mon/Tue/Thu
  --    Week -4:  Mon/Tue/Thu + cancelled Fri
  --    Week -2:  Mon/Wed/Fri
  --    Week -1:  Mon/Wed
  -- ===========================================================================

  -- Week -12
  INSERT INTO public.lesson_slots (
    id, organization_id, instructor_id, lesson_type_id, vehicle_id,
    starts_at, ends_at, timezone,
    status, max_bookings, generation_source, notes
  ) VALUES
    -- Mon 09:00–09:45 Erik veh1
    (hs01, v_org_id, v_instr_erik, v_lt_drv_45, veh1,
     v_w12 + interval '7 hours',
     v_w12 + interval '7 hours 45 minutes',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Erik'),

    -- Wed 09:00–10:00 Maria veh2
    (hs02, v_org_id, v_instr_maria, v_lt_drv_60, veh2,
     v_w12 + interval '2 days 7 hours',
     v_w12 + interval '2 days 8 hours',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Maria'),

    -- Fri 09:00–09:45 Johan veh3
    (hs03, v_org_id, v_instr_johan, v_lt_drv_45, veh3,
     v_w12 + interval '4 days 7 hours',
     v_w12 + interval '4 days 7 hours 45 minutes',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Johan')

  ON CONFLICT (id) DO NOTHING;

  -- Week -8
  INSERT INTO public.lesson_slots (
    id, organization_id, instructor_id, lesson_type_id, vehicle_id,
    starts_at, ends_at, timezone,
    status, max_bookings, generation_source, notes
  ) VALUES
    -- Mon 09:00–09:45 Erik veh1
    (hs04, v_org_id, v_instr_erik, v_lt_drv_45, veh1,
     v_w8 + interval '7 hours',
     v_w8 + interval '7 hours 45 minutes',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Erik'),

    -- Tue 09:00–10:00 Maria, no vehicle (körning utan bil, backspegel-lektion)
    (hs05, v_org_id, v_instr_maria, v_lt_drv_60, NULL,
     v_w8 + interval '1 day 7 hours',
     v_w8 + interval '1 day 8 hours',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Maria'),

    -- Thu 09:00–10:00 Johan veh2
    (hs06, v_org_id, v_instr_johan, v_lt_drv_60, veh2,
     v_w8 + interval '3 days 7 hours',
     v_w8 + interval '3 days 8 hours',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Johan')

  ON CONFLICT (id) DO NOTHING;

  -- Week -4
  INSERT INTO public.lesson_slots (
    id, organization_id, instructor_id, lesson_type_id, vehicle_id,
    starts_at, ends_at, timezone,
    status, max_bookings, generation_source, notes
  ) VALUES
    -- Mon 09:00–09:45 Erik veh1
    (hs07, v_org_id, v_instr_erik, v_lt_drv_45, veh1,
     v_w4 + interval '7 hours',
     v_w4 + interval '7 hours 45 minutes',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Erik'),

    -- Tue 11:00–12:00 Maria, theory group (no vehicle)
    (hs08, v_org_id, v_instr_maria, v_lt_theory, NULL,
     v_w4 + interval '1 day 9 hours',
     v_w4 + interval '1 day 10 hours',
     'Europe/Stockholm', 'completed', 6, 'manual', 'Teorigenomgång — Maria'),

    -- Thu 09:00–10:00 Johan veh3
    (hs09, v_org_id, v_instr_johan, v_lt_drv_60, veh3,
     v_w4 + interval '3 days 7 hours',
     v_w4 + interval '3 days 8 hours',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Johan'),

    -- Fri 09:00–09:45 Erik veh1 — CANCELLED (vehicle fault)
    (hs10, v_org_id, v_instr_erik, v_lt_drv_45, NULL,
     v_w4 + interval '4 days 7 hours',
     v_w4 + interval '4 days 7 hours 45 minutes',
     'Europe/Stockholm', 'cancelled', 1, 'manual', 'AVBOKAD — fordonsproblem GHI 789')

  ON CONFLICT (id) DO NOTHING;

  -- Week -2
  INSERT INTO public.lesson_slots (
    id, organization_id, instructor_id, lesson_type_id, vehicle_id,
    starts_at, ends_at, timezone,
    status, max_bookings, generation_source, notes
  ) VALUES
    -- Mon 09:00–10:00 Erik veh1
    (hs11, v_org_id, v_instr_erik, v_lt_drv_60, veh1,
     v_w2 + interval '7 hours',
     v_w2 + interval '8 hours',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Erik'),

    -- Wed 09:00–09:45 Maria veh2
    (hs12, v_org_id, v_instr_maria, v_lt_drv_45, veh2,
     v_w2 + interval '2 days 7 hours',
     v_w2 + interval '2 days 7 hours 45 minutes',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Maria'),

    -- Fri 09:00–09:45 Johan veh3
    (hs13, v_org_id, v_instr_johan, v_lt_drv_45, veh3,
     v_w2 + interval '4 days 7 hours',
     v_w2 + interval '4 days 7 hours 45 minutes',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Johan')

  ON CONFLICT (id) DO NOTHING;

  -- Week -1
  INSERT INTO public.lesson_slots (
    id, organization_id, instructor_id, lesson_type_id, vehicle_id,
    starts_at, ends_at, timezone,
    status, max_bookings, generation_source, notes
  ) VALUES
    -- Mon 09:00–10:00 Maria veh2
    (hs14, v_org_id, v_instr_maria, v_lt_drv_60, veh2,
     v_w1 + interval '7 hours',
     v_w1 + interval '8 hours',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Maria'),

    -- Wed 09:00–09:45 Johan, no vehicle (observationslektion)
    (hs15, v_org_id, v_instr_johan, v_lt_drv_45, NULL,
     v_w1 + interval '2 days 7 hours',
     v_w1 + interval '2 days 7 hours 45 minutes',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Johan')

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ 15 historical slots seeded (weeks -12, -8, -4, -2, -1)';

  -- ===========================================================================
  -- 6. HISTORICAL BOOKINGS (15 — completed, no_show, cancelled)
  --    Note: BEFORE INSERT trigger copies instructor/vehicle/type/times from slot.
  -- ===========================================================================

  INSERT INTO public.lesson_bookings (
    id, organization_id,
    slot_id, student_id,
    instructor_id, lesson_type_id,
    starts_at, ends_at,
    status, payment_status, price_sek
  )
  SELECT b_id, v_org_id,
         b_slot, b_student,
         b_instructor, b_lt,
         b_starts, b_ends,
         b_status::public.booking_status, b_pay, b_price
  FROM (VALUES
    -- Week -12
    (hb01, hs01, s1,  v_instr_erik,  v_lt_drv_45, v_w12 + interval '7 hours',          v_w12 + interval '7 hours 45 minutes',       'completed', 'paid',   695.00),
    (hb02, hs02, s2,  v_instr_maria, v_lt_drv_60, v_w12 + interval '2 days 7 hours',    v_w12 + interval '2 days 8 hours',           'completed', 'paid',   895.00),
    (hb03, hs03, s13, v_instr_johan, v_lt_drv_45, v_w12 + interval '4 days 7 hours',    v_w12 + interval '4 days 7 hours 45 minutes','completed', 'paid',   695.00),
    -- Week -8
    (hb04, hs04, s1,  v_instr_erik,  v_lt_drv_45, v_w8  + interval '7 hours',           v_w8  + interval '7 hours 45 minutes',       'completed', 'paid',   695.00),
    (hb05, hs05, s3,  v_instr_maria, v_lt_drv_60, v_w8  + interval '1 day 7 hours',     v_w8  + interval '1 day 8 hours',            'confirmed', 'paid',   895.00),
    (hb06, hs06, s14, v_instr_johan, v_lt_drv_60, v_w8  + interval '3 days 7 hours',    v_w8  + interval '3 days 8 hours',           'completed', 'paid',   895.00),
    -- Week -4
    (hb07, hs07, s5,  v_instr_erik,  v_lt_drv_45, v_w4  + interval '7 hours',           v_w4  + interval '7 hours 45 minutes',       'completed', 'unpaid', 695.00),
    (hb08, hs08, s2,  v_instr_maria, v_lt_theory, v_w4  + interval '1 day 9 hours',     v_w4  + interval '1 day 10 hours',           'completed', 'paid',   495.00),
    (hb09, hs09, s13, v_instr_johan, v_lt_drv_60, v_w4  + interval '3 days 7 hours',    v_w4  + interval '3 days 8 hours',           'completed', 'paid',   895.00),
    (hb10, hs10, s5,  v_instr_erik,  v_lt_drv_45, v_w4  + interval '4 days 7 hours',    v_w4  + interval '4 days 7 hours 45 minutes','confirmed', 'unpaid', 695.00),
    -- Week -2
    (hb11, hs11, s16, v_instr_erik,  v_lt_drv_60, v_w2  + interval '7 hours',           v_w2  + interval '8 hours',                  'completed', 'unpaid', 895.00),
    (hb12, hs12, s4,  v_instr_maria, v_lt_drv_45, v_w2  + interval '2 days 7 hours',    v_w2  + interval '2 days 7 hours 45 minutes','completed', 'paid',   695.00),
    (hb13, hs13, s17, v_instr_johan, v_lt_drv_45, v_w2  + interval '4 days 7 hours',    v_w2  + interval '4 days 7 hours 45 minutes','confirmed', 'unpaid', 695.00),
    -- Week -1
    (hb14, hs14, s2,  v_instr_maria, v_lt_drv_60, v_w1  + interval '7 hours',           v_w1  + interval '8 hours',                  'completed', 'paid',   895.00),
    (hb15, hs15, s23, v_instr_johan, v_lt_drv_45, v_w1  + interval '2 days 7 hours',    v_w1  + interval '2 days 7 hours 45 minutes','completed', 'unpaid', 695.00)

  ) AS t(b_id, b_slot, b_student, b_instructor, b_lt, b_starts, b_ends, b_status, b_pay, b_price)
  ON CONFLICT (id) DO NOTHING;

  -- Promote hb05 to no_show (constraint requires no_show_marked_at IS NOT NULL)
  UPDATE public.lesson_bookings
  SET status            = 'no_show',
      no_show_marked_at = v_w8 + interval '1 day 8 hours'
  WHERE id = hb05 AND no_show_marked_at IS NULL;

  -- Promote hb10 to cancelled with cancellation details
  UPDATE public.lesson_bookings
  SET status                = 'cancelled',
      cancelled_at          = v_w4 + interval '4 days 6 hours 30 minutes',
      cancellation_reason   = 'Fordonet DEF 456 fick motorproblem. Lektionen avbokades.',
      cancellation_category = 'vehicle_fault'
  WHERE id = hb10 AND cancelled_at IS NULL;

  -- Promote hb13 to cancelled with cancellation details
  UPDATE public.lesson_bookings
  SET status                = 'cancelled',
      cancelled_at          = v_w2 + interval '4 days 6 hours',
      cancellation_reason   = 'Eleven avbokade per telefon < 1 h innan lektionen.',
      cancellation_category = 'student_request'
  WHERE id = hb13 AND cancelled_at IS NULL;

  RAISE NOTICE '✓ 15 historical bookings seeded (12 completed, 1 no_show, 2 cancelled)';

  -- ===========================================================================
  -- 7. BOOKING ATTENDANCE (12 records — for all completed bookings)
  -- ===========================================================================

  INSERT INTO public.booking_attendance (
    id, organization_id, booking_id, student_id,
    attended, late_minutes, performance_rating, instructor_notes,
    recorded_at
  ) VALUES
    (ba01, v_org_id, hb01, s1,  true, 0, 4, 'God kontroll på landsväg. Arbeta mer med backparkering.', v_w12 + interval '7 hours 45 minutes'),
    (ba02, v_org_id, hb02, s2,  true, 0, 5, 'Utmärkt riskmedvetenhet och smidiga manövrar. Redo för uppkörning.', v_w12 + interval '2 days 8 hours'),
    (ba03, v_org_id, hb03, s13, true, 5, 3, 'Första lektionen — nervös men lovande. Kom 5 min sent.', v_w12 + interval '4 days 7 hours 45 minutes'),
    (ba04, v_org_id, hb04, s1,  true, 0, 4, 'Tydlig förbättring sedan förra gången. Parkering bättre.', v_w8 + interval '7 hours 45 minutes'),
    (ba05, v_org_id, hb06, s14, true, 0, 4, 'God trafikuppfattning och säkert körsätt.', v_w8 + interval '3 days 8 hours'),
    (ba06, v_org_id, hb07, s5,  true, 10, 3, 'Kom 10 min sent. Annars bra lektion med korsningar.', v_w4 + interval '7 hours 45 minutes'),
    (ba07, v_org_id, hb08, s2,  true, 0, 5, 'Teorigenomgång fullföljd med utmärkt resultat.', v_w4 + interval '1 day 10 hours'),
    (ba08, v_org_id, hb09, s13, true, 0, 4, 'Markant förbättring jämfört med föregående lektion.', v_w4 + interval '3 days 8 hours'),
    (ba09, v_org_id, hb11, s16, true, 0, 3, 'Ny elev, grunderna på plats. Behöver mer trafikkörning.', v_w2 + interval '8 hours'),
    (ba10, v_org_id, hb12, s4,  true, 0, 4, 'Bra framsteg med parkering och backning. Säkrare i korsningar.', v_w2 + interval '2 days 7 hours 45 minutes'),
    (ba11, v_org_id, hb14, s2,  true, 0, 5, 'Definitiv redo för uppkörning. Boka snarast.', v_w1 + interval '8 hours'),
    (ba12, v_org_id, hb15, s23, true, 0, 3, 'Lovande körning. Fortsätt öva korsningar och farthållning.', v_w1 + interval '2 days 7 hours 45 minutes')

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ 12 booking attendance records seeded';

  -- ===========================================================================
  -- 8. BOOKING NOTES (4 notes — internal and shared)
  -- ===========================================================================

  INSERT INTO public.booking_notes (
    id, organization_id, booking_id,
    content, is_internal
  ) VALUES
    (bn01, v_org_id, hb05,
     'Eleven svarade inte på telefon. Debiteras för utebliven lektion per skolans policy.',
     true),

    (bn02, v_org_id, hb10,
     'Lektionen avbokades på grund av fordonsproblem. Ny tid erbjuds utan extra kostnad.',
     false),

    (bn03, v_org_id, hb13,
     'Avbokning inkom under 1 h innan lektion. Kortidsavbokning — 50 % av lektionskostnaden debiteras.',
     true),

    (bn04, v_org_id, hb14,
     'Bra lektion! Du är nu redo för uppkörning. Boka tid via receptionen — v.27 finns ledigt.',
     false)

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ 4 booking notes seeded';

  -- ===========================================================================
  -- 9. FULL FUTURE SLOTS (2 weeks from now — for waitlist demonstration)
  -- ===========================================================================

  INSERT INTO public.lesson_slots (
    id, organization_id, instructor_id, lesson_type_id, vehicle_id,
    starts_at, ends_at, timezone,
    status, max_bookings, generation_source, notes
  ) VALUES
    -- Tuesday 09:00–09:45 Erik veh1 — FULL
    (fs01, v_org_id, v_instr_erik, v_lt_drv_45, veh1,
     v_w2f + interval '1 day 7 hours',
     v_w2f + interval '1 day 7 hours 45 minutes',
     'Europe/Stockholm', 'full', 1, 'manual', 'Körlektion — Erik (FULLBOKAD)'),

    -- Thursday 09:00–10:00 Maria veh2 — FULL
    (fs02, v_org_id, v_instr_maria, v_lt_drv_60, veh2,
     v_w2f + interval '3 days 7 hours',
     v_w2f + interval '3 days 8 hours',
     'Europe/Stockholm', 'full', 1, 'manual', 'Körlektion — Maria (FULLBOKAD)')

  ON CONFLICT (id) DO NOTHING;

  -- Confirmed bookings that fill those slots
  INSERT INTO public.lesson_bookings (
    id, organization_id,
    slot_id, student_id,
    instructor_id, lesson_type_id,
    starts_at, ends_at,
    status, payment_status, price_sek
  ) VALUES
    (fb01, v_org_id, fs01, s3, v_instr_erik, v_lt_drv_45,
     v_w2f + interval '1 day 7 hours',
     v_w2f + interval '1 day 7 hours 45 minutes',
     'confirmed', 'paid', 695.00),

    (fb02, v_org_id, fs02, s6, v_instr_maria, v_lt_drv_60,
     v_w2f + interval '3 days 7 hours',
     v_w2f + interval '3 days 8 hours',
     'confirmed', 'unpaid', 895.00)

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ 2 full future slots + 2 confirmed bookings seeded (for waitlist demo)';

  -- ===========================================================================
  -- 10. WAITLIST ENTRIES (3 students waiting for full slots)
  -- ===========================================================================

  INSERT INTO public.waitlist_entries (
    id, organization_id, slot_id, student_id,
    priority, status, expires_at, notes
  ) VALUES
    -- Oliver waiting for Tue slot (Erik drv_45, full)
    (we01, v_org_id, fs01, s5,
     0, 'waiting', now() + interval '7 days',
     'Vill ha Erik som lärare. Flexibel med tider.'),

    -- Sara waiting for same Tue slot, lower priority
    (we02, v_org_id, fs01, s13,
     1, 'waiting', now() + interval '7 days',
     NULL),

    -- Emma waiting for Thu slot (Maria drv_60, full)
    (we03, v_org_id, fs02, s4,
     0, 'waiting', now() + interval '7 days',
     'Prioritet — uppkörning planeras om 3 veckor.')

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ 3 waitlist entries seeded';

  -- ===========================================================================
  -- 11. STUDENT TERMS ACCEPTANCES (Sprint 9 — portal T&C acceptance)
  --     Requires migration 20260617100000_terms_acceptances.sql
  -- ===========================================================================

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'student_terms_acceptances'
  ) THEN
    INSERT INTO public.student_terms_acceptances (
      organization_id, student_id, terms_version, accepted_at
    ) VALUES
      (v_org_id, s1,  '1.0', now() - interval '4 months'),
      (v_org_id, s2,  '1.0', now() - interval '3 months'),
      (v_org_id, s3,  '1.0', now() - interval '6 months'),
      (v_org_id, s4,  '1.0', now() - interval '2 months'),
      (v_org_id, s9,  '1.0', now() - interval '8 months'),
      (v_org_id, s10, '1.0', now() - interval '1 year'),
      (v_org_id, s11, '1.0', now() - interval '9 months'),
      (v_org_id, s13, '1.0', now() - interval '5 months'),
      (v_org_id, s14, '1.0', now() - interval '7 months')

    ON CONFLICT (organization_id, student_id) DO NOTHING;
    RAISE NOTICE '✓ 9 student terms acceptances seeded';
  ELSE
    RAISE NOTICE '~ Terms acceptances skipped (run migration 20260617100000_terms_acceptances.sql first)';
  END IF;

  -- ===========================================================================
  -- 12. STUDENT MATERIAL COMPLETIONS (Sprint 8 — portal progress tracking)
  --     Requires migrations 20260620000002_training_materials.sql
  --     AND 20260616120000_material_completions.sql
  -- ===========================================================================

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'student_material_completions'
  ) THEN
    INSERT INTO public.student_material_completions (
      organization_id, student_id, material_id, completed_at
    ) VALUES
      -- Liam (active, risk2_completed) — completed 3 materials
      (v_org_id, s1, mat1, now() - interval '3 months 15 days'),
      (v_org_id, s1, mat2, now() - interval '3 months'),
      (v_org_id, s1, mat3, now() - interval '2 months 15 days'),
      -- Maja (active, theory_passed) — completed 4 materials
      (v_org_id, s2, mat1, now() - interval '2 months 20 days'),
      (v_org_id, s2, mat2, now() - interval '2 months 10 days'),
      (v_org_id, s2, mat3, now() - interval '2 months'),
      (v_org_id, s2, mat4, now() - interval '5 weeks'),
      -- Noah (active, practical_exam_booked) — completed 4 materials
      (v_org_id, s3, mat1, now() - interval '5 months'),
      (v_org_id, s3, mat2, now() - interval '4 months 15 days'),
      (v_org_id, s3, mat3, now() - interval '4 months'),
      (v_org_id, s3, mat4, now() - interval '3 months 10 days'),
      -- Sara (active, risk2_booked) — completed 1 material so far
      (v_org_id, s13, mat1, now() - interval '4 months'),
      -- Marcus (active, risk2_completed) — completed 2 materials
      (v_org_id, s14, mat1, now() - interval '6 months 10 days'),
      (v_org_id, s14, mat2, now() - interval '5 months 20 days')

    ON CONFLICT (organization_id, student_id, material_id) DO NOTHING;
    RAISE NOTICE '✓ 14 material completions seeded';
  ELSE
    RAISE NOTICE '~ Material completions skipped (run migrations 20260620000002 + 20260616120000 first)';
  END IF;

  -- ===========================================================================
  -- 13. AUTOMATION RULES (all 6 rule types)
  -- ===========================================================================

  INSERT INTO public.automation_rules (
    organization_id, rule_type, enabled, config
  ) VALUES
    (v_org_id, 'reservation_expiry',  true,  '{"timeout_minutes": 30}'),
    (v_org_id, 'reminder_24h',        true,  '{"offset_minutes": 1440, "channels": ["email", "sms"]}'),
    (v_org_id, 'reminder_2h',         true,  '{"offset_minutes": 120,  "channels": ["sms"]}'),
    (v_org_id, 'reminder_1h',         false, '{"offset_minutes": 60,   "channels": ["sms"]}'),
    (v_org_id, 'auto_confirm',        false, '{"delay_hours": 24}'),
    (v_org_id, 'waitlist_promotion',  true,  '{"reservation_deadline_minutes": 60}')

  ON CONFLICT (organization_id, rule_type) DO NOTHING;

  RAISE NOTICE '✓ 6 automation rules seeded (4 enabled, 2 disabled)';

  -- ===========================================================================
  -- 14. NOTIFICATIONS (12 — 6 sent, 3 failed, 3 pending)
  -- ===========================================================================

  INSERT INTO public.notifications (
    organization_id,
    recipient_id, recipient_type, channel,
    template_key, locale,
    subject, body,
    metadata, status,
    sent_at, failed_at, failure_reason, retry_count,
    idempotency_key
  ) VALUES

    -- ── SENT (6) ─────────────────────────────────────────────────────────────

    (v_org_id, s1, 'student', 'email',
     'booking_reminder_24h', 'sv',
     'Påminnelse: din körlektion imorgon kl. 09:00',
     'Hej Liam! Du har en körlektion inbokad imorgon fredag kl. 09:00 med Erik. Möt upp vid skolans parkering.',
     '{}', 'sent',
     now() - interval '3 days', NULL, NULL, 0,
     'demo-seed-reminder24h-s1-w1'),

    (v_org_id, s2, 'student', 'sms',
     'booking_reminder_2h', 'sv',
     NULL,
     'Påminnelse: körlektion om 2 h med Maria. Trafikskolan, parkering bak.',
     '{}', 'sent',
     now() - interval '2 days', NULL, NULL, 0,
     'demo-seed-reminder2h-s2-w1'),

    (v_org_id, s3, 'student', 'email',
     'invoice_issued', 'sv',
     'Ny faktura från Trafikskolan — #2026-0006',
     'Hej Noah! En ny faktura på 1 790,00 SEK har utfärdats. Betalningsvillkor: 30 dagar.',
     '{"invoice_id": "cccc0002-0000-0000-0000-000000000001"}', 'sent',
     now() - interval '14 days', NULL, NULL, 0,
     'demo-seed-invoice-issued-s3-inv7'),

    (v_org_id, s13, 'student', 'email',
     'booking_confirmation', 'sv',
     'Bokningsbekräftelse — körlektion med Johan',
     'Hej Sara! Din bokning är bekräftad: Körlektion 60 min med Johan Bergström.',
     '{}', 'sent',
     now() - interval '7 days', NULL, NULL, 0,
     'demo-seed-booking-conf-s13-w2f'),

    (v_org_id, s14, 'student', 'email',
     'booking_confirmation', 'sv',
     'Bokningsbekräftelse — körlektion med Johan',
     'Hej Marcus! Din bokning är bekräftad: Körlektion 45 min med Johan Bergström.',
     '{}', 'sent',
     now() - interval '7 days', NULL, NULL, 0,
     'demo-seed-booking-conf-s14-w2f'),

    (v_org_id, s2, 'student', 'email',
     'booking_confirmation', 'sv',
     'Bokningsbekräftelse — körlektion med Maria',
     'Hej Maja! Din bokning är bekräftad: Körlektion 60 min med Maria Svensson.',
     '{}', 'sent',
     now() - interval '30 days', NULL, NULL, 0,
     'demo-seed-booking-conf-s2-w4'),

    -- ── FAILED (3) ───────────────────────────────────────────────────────────

    (v_org_id, s18, 'student', 'email',
     'booking_reminder_24h', 'sv',
     'Påminnelse: din körlektion imorgon',
     'Hej Viktor! Du har en körlektion inbokad imorgon.',
     '{}', 'failed',
     NULL, now() - interval '7 days',
     'SMTP delivery failed: invalid recipient address',
     3,
     'demo-seed-reminder24h-s18-w1'),

    (v_org_id, s20, 'student', 'sms',
     'booking_reminder_2h', 'sv',
     NULL,
     'Påminnelse: körlektion om 2 h.',
     '{}', 'failed',
     NULL, now() - interval '14 days',
     'SMS delivery failed: invalid phone number format',
     3,
     'demo-seed-reminder2h-s20-w2'),

    (v_org_id, s7, 'student', 'email',
     'welcome_lead', 'sv',
     'Välkommen till Trafikskolan!',
     'Hej Elsa! Tack för ditt intresseanmälan. Vi hör av oss inom 2 arbetsdagar.',
     '{}', 'failed',
     NULL, now() - interval '21 days',
     'SMTP timeout after 3 retries',
     3,
     'demo-seed-welcome-s7-w3'),

    -- ── PENDING (3) ──────────────────────────────────────────────────────────

    (v_org_id, s16, 'student', 'email',
     'invoice_due_reminder', 'sv',
     'Påminnelse: obetald faktura förfaller snart',
     'Hej Emil! Din faktura #2026-0010 på 2 606,25 SEK förfaller om 3 dagar.',
     '{"invoice_id": "cccc0002-0000-0000-0000-000000000005"}', 'pending',
     NULL, NULL, NULL, 0,
     'demo-seed-invoice-due-s16-soon'),

    (v_org_id, s23, 'student', 'sms',
     'booking_reminder_24h', 'sv',
     NULL,
     'Påminnelse: körlektion imorgon kl. 09:00 med Johan. Trafikskolan.',
     '{}', 'pending',
     NULL, NULL, NULL, 0,
     'demo-seed-reminder24h-s23-upcoming'),

    (v_org_id, s1, 'student', 'email',
     'booking_reminder_2h', 'sv',
     'Påminnelse: körlektion om 2 h med Erik',
     'Hej Liam! Du har en körlektion om 2 h med Erik Lindqvist. Vi ses vid entrén.',
     '{}', 'pending',
     NULL, NULL, NULL, 0,
     'demo-seed-reminder2h-s1-upcoming')

  ON CONFLICT (idempotency_key) DO NOTHING;

  RAISE NOTICE '✓ 12 notifications seeded (6 sent, 3 failed, 3 pending)';

  -- ===========================================================================
  -- 15. ADDITIONAL INVOICES (8 more — various statuses)
  -- ===========================================================================

  -- inv7: Noah Karlsson — 2 × körlektion 60 min, issued
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, due_date, notes
  ) VALUES (
    inv7, v_org_id, s3,
    '2026-0006', 'issued', 'SEK',
    1790.00, 447.50, 2237.50,
    0.00, 2237.50,
    now() - interval '14 days',
    (now() + interval '16 days')::date,
    'Körlektion 60 min × 2 — förberedelse inför uppkörning'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv7, v_org_id, 'lesson', 'Körlektion 60 min', 2, 895.00, 0.25, 447.50, 1790.00, 1)
  ON CONFLICT DO NOTHING;

  -- inv8: Sara Lindberg — initial körlektion, paid
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, paid_at, due_date
  ) VALUES (
    inv8, v_org_id, s13,
    '2026-0007', 'paid', 'SEK',
    695.00, 173.75, 868.75,
    868.75, 0.00,
    now() - interval '5 months',
    now() - interval '5 months' + interval '3 days',
    (now() - interval '5 months' + interval '30 days')::date
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv8, v_org_id, 'lesson', 'Körlektion 45 min (introduktion)', 1, 695.00, 0.25, 173.75, 695.00, 1)
  ON CONFLICT DO NOTHING;

  -- inv9: Marcus Pettersson — 2 × körlektion 60, paid
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, paid_at, due_date
  ) VALUES (
    inv9, v_org_id, s14,
    '2026-0008', 'paid', 'SEK',
    1790.00, 447.50, 2237.50,
    2237.50, 0.00,
    now() - interval '3 months',
    now() - interval '3 months' + interval '5 days',
    (now() - interval '3 months' + interval '30 days')::date
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv9, v_org_id, 'lesson', 'Körlektion 60 min', 2, 895.00, 0.25, 447.50, 1790.00, 1)
  ON CONFLICT DO NOTHING;

  -- inv10: Freya Håkansson — körlektion 60 + teorigenomgång, issued
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, due_date
  ) VALUES (
    inv10, v_org_id, s15,
    '2026-0009', 'issued', 'SEK',
    1390.00, 347.50, 1737.50,
    0.00, 1737.50,
    now() - interval '3 weeks',
    (now() + interval '1 week')::date
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv10, v_org_id, 'lesson', 'Körlektion 60 min',  1, 895.00, 0.25, 223.75, 895.00, 1),
    (inv10, v_org_id, 'lesson', 'Teorigenomgång',      1, 495.00, 0.25, 123.75, 495.00, 2)
  ON CONFLICT DO NOTHING;

  -- inv11: Emil Bergström — 3 × körlektion 45, OVERDUE
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, due_date
  ) VALUES (
    inv11, v_org_id, s16,
    '2026-0010', 'overdue', 'SEK',
    2085.00, 521.25, 2606.25,
    0.00, 2606.25,
    now() - interval '8 weeks',
    (now() - interval '5 weeks')::date
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv11, v_org_id, 'lesson', 'Körlektion 45 min', 3, 695.00, 0.25, 521.25, 2085.00, 1)
  ON CONFLICT DO NOTHING;

  -- inv12: Astrid Olsson — draft
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount
  ) VALUES (
    inv12, v_org_id, s17,
    NULL, 'draft', 'SEK',
    695.00, 173.75, 868.75,
    0.00, 868.75
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv12, v_org_id, 'lesson', 'Körlektion 45 min', 1, 695.00, 0.25, 173.75, 695.00, 1)
  ON CONFLICT DO NOTHING;

  -- inv13: Nora Björnsson — 2 × körlektion 45, issued
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, due_date
  ) VALUES (
    inv13, v_org_id, s23,
    '2026-0011', 'issued', 'SEK',
    1390.00, 347.50, 1737.50,
    0.00, 1737.50,
    now() - interval '1 week',
    (now() + interval '3 weeks')::date
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv13, v_org_id, 'lesson', 'Körlektion 45 min', 2, 695.00, 0.25, 347.50, 1390.00, 1)
  ON CONFLICT DO NOTHING;

  -- inv14: Sara Lindberg — 3 × körlektion (second invoice), OVERDUE
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, due_date
  ) VALUES (
    inv14, v_org_id, s13,
    '2026-0012', 'overdue', 'SEK',
    2780.00, 695.00, 3475.00,
    0.00, 3475.00,
    now() - interval '6 weeks',
    (now() - interval '3 weeks')::date
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv14, v_org_id, 'lesson', 'Körlektion 45 min', 2, 695.00, 0.25, 347.50, 1390.00, 1),
    (inv14, v_org_id, 'lesson', 'Körlektion 60 min', 1, 895.00, 0.25, 223.75, 895.00, 2),
    (inv14, v_org_id, 'lesson', 'Teorigenomgång',    1, 495.00, 0.25, 123.75, 495.00, 3)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✓ 8 additional invoices seeded (issued ×3, paid ×2, overdue ×2, draft ×1)';

  -- ===========================================================================
  -- SUMMARY
  -- ===========================================================================

  RAISE NOTICE '';
  RAISE NOTICE '=== Demo Sprint 1–10 seed complete ===';
  RAISE NOTICE 'Instructors     : +1  (Johan Bergström TL-003, B+C)       → total 3';
  RAISE NOTICE 'Vehicles        :  3  (Volvo V40, Skoda Octavia, Volvo S60)';
  RAISE NOTICE 'Students        : +13 (s13–s25, all lifecycle+permit stages)→ total 25';
  RAISE NOTICE 'Training mats   :  5  (teori/körning/risk/lagregler/övrigt)';
  RAISE NOTICE 'Historical slots: 15  (weeks -12/-8/-4/-2/-1, completed+cancelled)';
  RAISE NOTICE 'Historical bkgs : 15  (12 completed, 1 no_show, 2 cancelled)';
  RAISE NOTICE 'Attendance      : 12  (ratings 3–5, instructor notes)';
  RAISE NOTICE 'Booking notes   :  4  (2 internal, 2 shared)';
  RAISE NOTICE 'Full fut. slots :  2  + 2 confirmed bookings (for waitlist demo)';
  RAISE NOTICE 'Waitlist entries:  3  (Oliver/Sara → Tue, Emma → Thu)';
  RAISE NOTICE 'Terms accept.   :  9  (Sprint 9 portal feature)';
  RAISE NOTICE 'Material compl. : 14  (Sprint 8 portal feature)';
  RAISE NOTICE 'Automation rules:  6  (all rule_types, 4 enabled)';
  RAISE NOTICE 'Notifications   : 12  (6 sent, 3 failed, 3 pending)';
  RAISE NOTICE 'Invoices        : +8  (issued ×3, paid ×2, overdue ×2, draft ×1) → total 14';

END $$;
