-- =============================================================================
-- DEMO FULL DATA SEED
--
-- Seeds realistic Swedish driving school data for UI testing.
--
-- Prerequisites:
--   1. All migrations applied
--   2. bootstrap_org_admin.sql executed (creates the 'trafikskolan' org)
--   3. demo_data.sql executed (creates instructors, lesson types, slots)
--
-- What this seeds:
--   • 12 students in various lifecycle stages
--   • 4 corporate customers (B2B companies)
--   • 8 lesson bookings (against next-week demo slots)
--   • 6 invoices (draft, issued, paid, overdue) with line items
--
-- Safe to re-run. All inserts use ON CONFLICT DO NOTHING.
-- =============================================================================

DO $$
DECLARE
  v_org_id         uuid;
  v_instr_erik     uuid := 'e1100001-0000-0000-0000-000000000001';
  v_instr_maria    uuid := 'e1100001-0000-0000-0000-000000000002';
  v_lt_drv_45      uuid;
  v_lt_drv_60      uuid;
  v_lt_theory      uuid;
  v_next_mon       timestamptz;

  -- Student fixed UUIDs
  s1  uuid := 'aaaa0001-0000-0000-0000-000000000001';
  s2  uuid := 'aaaa0001-0000-0000-0000-000000000002';
  s3  uuid := 'aaaa0001-0000-0000-0000-000000000003';
  s4  uuid := 'aaaa0001-0000-0000-0000-000000000004';
  s5  uuid := 'aaaa0001-0000-0000-0000-000000000005';
  s6  uuid := 'aaaa0001-0000-0000-0000-000000000006';
  s7  uuid := 'aaaa0001-0000-0000-0000-000000000007';
  s8  uuid := 'aaaa0001-0000-0000-0000-000000000008';
  s9  uuid := 'aaaa0001-0000-0000-0000-000000000009';
  s10 uuid := 'aaaa0001-0000-0000-0000-000000000010';
  s11 uuid := 'aaaa0001-0000-0000-0000-000000000011';
  s12 uuid := 'aaaa0001-0000-0000-0000-000000000012';

  -- Corporate customer fixed UUIDs
  c1  uuid := 'bbbb0001-0000-0000-0000-000000000001';
  c2  uuid := 'bbbb0001-0000-0000-0000-000000000002';
  c3  uuid := 'bbbb0001-0000-0000-0000-000000000003';
  c4  uuid := 'bbbb0001-0000-0000-0000-000000000004';

  -- Invoice fixed UUIDs
  inv1 uuid := 'cccc0001-0000-0000-0000-000000000001';
  inv2 uuid := 'cccc0001-0000-0000-0000-000000000002';
  inv3 uuid := 'cccc0001-0000-0000-0000-000000000003';
  inv4 uuid := 'cccc0001-0000-0000-0000-000000000004';
  inv5 uuid := 'cccc0001-0000-0000-0000-000000000005';
  inv6 uuid := 'cccc0001-0000-0000-0000-000000000006';

  -- Slot fixed UUIDs (from demo_data.sql)
  slot1 uuid := '51100001-0000-0000-0000-000000000001';
  slot2 uuid := '51100001-0000-0000-0000-000000000002';
  slot3 uuid := '51100001-0000-0000-0000-000000000003';
  slot4 uuid := '51100001-0000-0000-0000-000000000004';
  slot5 uuid := '51100001-0000-0000-0000-000000000005';
  slot6 uuid := '51100001-0000-0000-0000-000000000006';

  -- Booking fixed UUIDs
  b1 uuid := 'dddd0001-0000-0000-0000-000000000001';
  b2 uuid := 'dddd0001-0000-0000-0000-000000000002';
  b3 uuid := 'dddd0001-0000-0000-0000-000000000003';
  b4 uuid := 'dddd0001-0000-0000-0000-000000000004';
  b5 uuid := 'dddd0001-0000-0000-0000-000000000005';
  b6 uuid := 'dddd0001-0000-0000-0000-000000000006';

BEGIN

  -- ─── Guard: org must exist ─────────────────────────────────────────────────
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE slug = 'trafikskolan' AND status = 'active';

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION
      E'\n\n  !! Organization not found !!\n'
      '  Run bootstrap_org_admin.sql first.\n';
  END IF;

  RAISE NOTICE 'Organization: %', v_org_id;

  -- Resolve lesson type IDs
  SELECT id INTO v_lt_drv_45 FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'driving_b_45';
  SELECT id INTO v_lt_drv_60 FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'driving_b_60';
  SELECT id INTO v_lt_theory FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'theory_group';

  v_next_mon := date_trunc('week', now() + interval '7 days');

  -- ===========================================================================
  -- 1. STUDENTS
  -- ===========================================================================

  INSERT INTO public.students (
    id, organization_id,
    first_name, last_name, email, phone,
    address_line1, postal_code, city,
    date_of_birth,
    status, permit_stage,
    assigned_instructor_id,
    target_licence_category,
    enrolled_at,
    gdpr_consent_given_at, data_processing_consent
  ) VALUES

    -- Active students (in progress)
    (s1,  v_org_id, 'Liam',    'Johansson', 'liam.johansson@gmail.com',    '070-111 22 33',
     'Björkgatan 4',   '113 25', 'Stockholm',   '2004-03-12',
     'active', 'risk2_completed',    v_instr_erik,  'B', now() - interval '4 months',
     now() - interval '4 months', true),

    (s2,  v_org_id, 'Maja',    'Eriksson',  'maja.eriksson@hotmail.com',   '073-222 33 44',
     'Lindvägen 12',   '172 74', 'Sundbyberg',  '2005-07-22',
     'active', 'theory_passed',       v_instr_maria, 'B', now() - interval '3 months',
     now() - interval '3 months', true),

    (s3,  v_org_id, 'Noah',    'Karlsson',  'noah.karlsson@outlook.com',   '076-333 44 55',
     'Ekvägen 8',      '171 51', 'Solna',       '2003-11-30',
     'active', 'practical_exam_booked', v_instr_erik, 'B', now() - interval '6 months',
     now() - interval '6 months', true),

    (s4,  v_org_id, 'Emma',    'Nilsson',   'emma.nilsson@gmail.com',      '079-444 55 66',
     'Storgatan 3',    '112 30', 'Stockholm',   '2006-01-15',
     'active', 'risk1_completed',     v_instr_maria, 'B', now() - interval '2 months',
     now() - interval '2 months', true),

    (s5,  v_org_id, 'Oliver',  'Andersson', 'oliver.andersson@gmail.com',  '070-555 66 77',
     'Parkgatan 19',   '162 30', 'Vällingby',   '2004-09-08',
     'active', 'theory_study',        v_instr_erik,  'B', now() - interval '5 weeks',
     now() - interval '5 weeks', true),

    (s6,  v_org_id, 'Wilma',   'Larsson',   'wilma.larsson@live.se',       '073-666 77 88',
     'Roslagsgatan 7', '113 55', 'Stockholm',   '2005-05-03',
     'active', 'risk1_booked',        v_instr_maria, 'B', now() - interval '6 weeks',
     now() - interval '6 weeks', true),

    -- Leads / onboarding
    (s7,  v_org_id, 'Elsa',    'Svensson',  'elsa.svensson@gmail.com',     '076-777 88 99',
     'Vasagatan 55',   '111 20', 'Stockholm',   '2006-08-19',
     'lead', 'not_started', NULL, 'B', NULL, NULL, false),

    (s8,  v_org_id, 'Hugo',    'Berg',      'hugo.berg@gmail.com',         '079-888 99 00',
     'Tullgatan 2',    '652 30', 'Karlstad',    '2005-12-25',
     'onboarding', 'not_started', NULL, 'B', NULL, now() - interval '1 week', true),

    -- Paused
    (s9,  v_org_id, 'Alice',   'Lindqvist', 'alice.lindqvist@gmail.com',   '070-999 00 11',
     'Hamnvägen 14',   '216 14', 'Malmö',       '2003-04-17',
     'paused', 'risk2_completed', v_instr_erik, 'B', now() - interval '8 months',
     now() - interval '8 months', true),

    -- Completed (got licence)
    (s10, v_org_id, 'Felix',   'Magnusson', 'felix.magnusson@outlook.com', '073-000 11 22',
     'Södergatan 22',  '211 36', 'Malmö',       '2002-06-10',
     'completed', 'licence_issued', v_instr_maria, 'B', now() - interval '1 year',
     now() - interval '1 year', true),

    (s11, v_org_id, 'Ida',     'Ström',     'ida.strom@gmail.com',         '076-111 22 33',
     'Centrumvägen 5', '181 40', 'Lidingö',     '2003-02-28',
     'completed', 'licence_issued', v_instr_erik, 'B', now() - interval '9 months',
     now() - interval '9 months', true),

    -- AM licence (moped)
    (s12, v_org_id, 'Axel',    'Gustafsson','axel.gustafsson@gmail.com',   '079-222 33 44',
     'Långgatan 11',   '131 37', 'Nacka',       '2007-03-05',
     'active', 'theory_study', v_instr_maria, 'AM', now() - interval '3 weeks',
     now() - interval '3 weeks', true)

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ 12 students seeded';

  -- ===========================================================================
  -- 2. CORPORATE CUSTOMERS
  -- ===========================================================================

  INSERT INTO public.corporate_customers (
    id, organization_id,
    org_number, company_name,
    address_line1, postal_code, city,
    contact_first_name, contact_last_name, contact_email, contact_phone,
    status, notes
  ) VALUES

    (c1, v_org_id, '556123-4567', 'Bygg AB Stockholm',
     'Industrigatan 12', '131 31', 'Nacka',
     'Anders', 'Persson', 'anders@byggabsthlm.se', '08-123 45 67',
     'active', 'Avtal: 10 körlektioner/år. Faktureras kvartalsvis.'),

    (c2, v_org_id, '559234-5678', 'Logistik Nord AB',
     'Hamnvägen 3', '802 90', 'Gävle',
     'Karin', 'Lindberg', 'karin.lindberg@logistinord.se', '026-789 01 23',
     'active', 'B+BE-utbildning för nya chaufförer. Betalning 30 dagar.'),

    (c3, v_org_id, '556345-6789', 'Vård & Omsorg Haninge',
     'Stationsvägen 18', '136 38', 'Haninge',
     'Sofia', 'Lundgren', 'sofia@vardhaninge.se', '08-777 88 99',
     'active', 'Personalutbildning. Max 2 elever per månad.'),

    (c4, v_org_id, '556456-7890', 'Stockholms Budfirma AB',
     'Flygfältsgatan 8', '128 30', 'Skarpnäck',
     'Mikael', 'Björk', 'mikael@sthlmbudfirma.se', '08-555 66 77',
     'paused', 'Paus t.o.m. aug 2026 pga omorganisation.')

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ 4 corporate customers seeded';

  -- ===========================================================================
  -- 3. LESSON BOOKINGS (against demo slots from demo_data.sql)
  -- ===========================================================================
  -- Only insert if the referenced slots exist (demo_data.sql must have run)

  IF EXISTS (SELECT 1 FROM public.lesson_slots WHERE id = slot1) THEN

    INSERT INTO public.lesson_bookings (
      id, organization_id,
      slot_id, student_id,
      instructor_id, lesson_type_id,
      starts_at, ends_at,
      status, payment_status, price_sek
    )
    SELECT
      b_id, v_org_id,
      s_slot, s_student,
      s_instructor, s_lt,
      s_starts, s_ends,
      s_status::public.booking_status, s_pay, s_price
    FROM (VALUES
      -- Mon 09:00 körlektion 45min Erik → Liam (confirmed, will be completed)
      (b1, slot1, s1, v_instr_erik, v_lt_drv_45,
       v_next_mon + interval '7 hours',
       v_next_mon + interval '7 hours 45 minutes',
       'confirmed', 'paid', 695.00),

      -- Mon 14:00 körlektion 60min Maria → Maja
      (b2, slot2, s2, v_instr_maria, v_lt_drv_60,
       v_next_mon + interval '12 hours',
       v_next_mon + interval '13 hours',
       'confirmed', 'paid', 895.00),

      -- Tue 09:00 körlektion 45min Maria → Emma
      (b3, slot3, s4, v_instr_maria, v_lt_drv_45,
       v_next_mon + interval '1 day 7 hours',
       v_next_mon + interval '1 day 7 hours 45 minutes',
       'confirmed', 'unpaid', 695.00),

      -- Wed theory Maja + Oliver + Wilma (3 students on same group slot)
      (b4, slot4, s2, v_instr_maria, v_lt_theory,
       v_next_mon + interval '2 days 9 hours',
       v_next_mon + interval '2 days 10 hours',
       'reserved', 'unpaid', 495.00),

      -- Thu 09:00 körlektion 60min Erik → Noah
      (b5, slot5, s3, v_instr_erik, v_lt_drv_60,
       v_next_mon + interval '3 days 7 hours',
       v_next_mon + interval '3 days 8 hours',
       'confirmed', 'unpaid', 895.00),

      -- Fri 09:00 körlektion 45min Erik → Oliver
      (b6, slot6, s5, v_instr_erik, v_lt_drv_45,
       v_next_mon + interval '4 days 7 hours',
       v_next_mon + interval '4 days 7 hours 45 minutes',
       'confirmed', 'unpaid', 695.00)

    ) AS t(b_id, s_slot, s_student, s_instructor, s_lt, s_starts, s_ends, s_status, s_pay, s_price)
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE '✓ 6 lesson bookings seeded (Mon–Fri next week)';
  ELSE
    RAISE NOTICE '! Slots not found — skipping bookings (run demo_data.sql first)';
  END IF;

  -- ===========================================================================
  -- 4. INVOICES + LINE ITEMS
  -- ===========================================================================

  -- Invoice 1: Paid — Liam Johansson, 2 körlektion 45
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, paid_at, due_date, notes
  ) VALUES (
    inv1, v_org_id, s1,
    '2026-0001', 'paid', 'SEK',
    1390.00, 347.50, 1737.50,
    1737.50, 0.00,
    now() - interval '6 weeks',
    now() - interval '5 weeks',
    (now() - interval '4 weeks')::date,
    'Körlektion 45 min × 2'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv1, v_org_id, 'lesson', 'Körlektion 45 min', 2, 695.00, 0.25, 347.50, 1390.00, 1)
  ON CONFLICT DO NOTHING;

  -- Invoice 2: Paid — Maja Eriksson, theory + körlektion
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, paid_at, due_date
  ) VALUES (
    inv2, v_org_id, s2,
    '2026-0002', 'paid', 'SEK',
    1390.00, 347.50, 1737.50,
    1737.50, 0.00,
    now() - interval '10 weeks',
    now() - interval '9 weeks',
    (now() - interval '8 weeks')::date
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv2, v_org_id, 'lesson', 'Teorigenomgång',    1, 495.00, 0.25, 123.75, 495.00, 1),
    (inv2, v_org_id, 'lesson', 'Körlektion 60 min', 1, 895.00, 0.25, 223.75, 895.00, 2)
  ON CONFLICT DO NOTHING;

  -- Invoice 3: Issued (unpaid) — Noah Karlsson, körlektion 60
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, due_date
  ) VALUES (
    inv3, v_org_id, s3,
    '2026-0003', 'issued', 'SEK',
    895.00, 223.75, 1118.75,
    0.00, 1118.75,
    now() - interval '2 weeks',
    (now() + interval '2 weeks')::date
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv3, v_org_id, 'lesson', 'Körlektion 60 min', 1, 895.00, 0.25, 223.75, 895.00, 1)
  ON CONFLICT DO NOTHING;

  -- Invoice 4: Overdue — Emma Nilsson, körlektion 45 × 3
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, due_date
  ) VALUES (
    inv4, v_org_id, s4,
    '2026-0004', 'overdue', 'SEK',
    2085.00, 521.25, 2606.25,
    0.00, 2606.25,
    now() - interval '7 weeks',
    (now() - interval '4 weeks')::date
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv4, v_org_id, 'lesson', 'Körlektion 45 min', 3, 695.00, 0.25, 521.25, 2085.00, 1)
  ON CONFLICT DO NOTHING;

  -- Invoice 5: Draft — Oliver Andersson
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount
  ) VALUES (
    inv5, v_org_id, s5,
    NULL, 'draft', 'SEK',
    695.00, 173.75, 868.75,
    0.00, 868.75
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv5, v_org_id, 'lesson', 'Körlektion 45 min', 1, 695.00, 0.25, 173.75, 695.00, 1)
  ON CONFLICT DO NOTHING;

  -- Invoice 6: Partially paid — Wilma Larsson
  INSERT INTO public.invoices (
    id, organization_id, student_id,
    invoice_number, status, currency,
    subtotal_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount,
    issued_at, due_date
  ) VALUES (
    inv6, v_org_id, s6,
    '2026-0005', 'partially_paid', 'SEK',
    1390.00, 347.50, 1737.50,
    500.00, 1237.50,
    now() - interval '3 weeks',
    (now() + interval '1 week')::date
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, line_type,
    description, quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
  ) VALUES
    (inv6, v_org_id, 'lesson', 'Körlektion 45 min', 2, 695.00, 0.25, 347.50, 1390.00, 1)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✓ 6 invoices seeded (paid ×2, issued ×1, overdue ×1, draft ×1, partially_paid ×1)';

  RAISE NOTICE '';
  RAISE NOTICE '=== Demo full data seed complete ===';
  RAISE NOTICE 'Students          : 12 (active, lead, onboarding, paused, completed)';
  RAISE NOTICE 'Corporate customers: 4  (Bygg AB, Logistik Nord, Vård & Omsorg, Budfirma)';
  RAISE NOTICE 'Lesson bookings   : 6  (Mon–Fri next week)';
  RAISE NOTICE 'Invoices          : 6  (various statuses)';

END $$;
