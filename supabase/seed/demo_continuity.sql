-- =============================================================================
-- DEMO SEED: Students, Bookings, Invoices & Payments
--
-- Prerequisites:
--   1. All migrations applied
--   2. bootstrap_org_admin.sql executed
--   3. demo_data.sql executed (instructors + lesson types + future slots must exist)
--
-- What this seeds:
--   • 8 students across varied permit stages
--   • 8 past lesson slots (completed; feed activity and booking history)
--   • 12 lesson bookings (9 past completed + 3 upcoming confirmed)
--   • 5 invoices (draft, issued, overdue, paid, partially_paid)
--   • 2 payments (full Swish, partial bank_transfer)
--
-- Safety:
--   • Idempotent — safe to re-run. All inserts use ON CONFLICT DO NOTHING or
--     guarded PERFORM calls.
--   • Does NOT touch: auth.users, profiles, memberships, RBAC, migrations.
--   • lesson_booking_set_slot_fields() BEFORE INSERT trigger automatically fills
--     instructor_id, lesson_type_id, starts_at, ends_at from the referenced slot.
--   • issue_invoice() and record_payment() SECURITY DEFINER functions are called
--     for proper number generation and amount freezing.
-- =============================================================================

DO $$
DECLARE
  v_org_id      uuid;
  v_actor_id    uuid := NULL; -- system seeding action; all FKs to auth.users are nullable

  -- ── Student UUIDs ───────────────────────────────────────────────────────────
  v_st_sofia    uuid := 'f1100001-0000-0000-0000-000000000001';
  v_st_marcus   uuid := 'f1100001-0000-0000-0000-000000000002';
  v_st_lena     uuid := 'f1100001-0000-0000-0000-000000000003';
  v_st_ahmed    uuid := 'f1100001-0000-0000-0000-000000000004';
  v_st_emma     uuid := 'f1100001-0000-0000-0000-000000000005';
  v_st_mikael   uuid := 'f1100001-0000-0000-0000-000000000006';
  v_st_sara     uuid := 'f1100001-0000-0000-0000-000000000007';
  v_st_johan    uuid := 'f1100001-0000-0000-0000-000000000008';

  -- ── Instructor UUIDs (must match demo_data.sql) ─────────────────────────────
  v_instr_erik  uuid := 'e1100001-0000-0000-0000-000000000001';
  v_instr_maria uuid := 'e1100001-0000-0000-0000-000000000002';

  -- ── Lesson type IDs (resolved by code after demo_data.sql) ──────────────────
  v_lt_drv_45   uuid;
  v_lt_drv_60   uuid;
  v_lt_theory   uuid;

  -- ── Past slot UUIDs (completed; anchor the booking/activity history) ────────
  v_ps1         uuid := '61100001-0000-0000-0000-000000000001'; -- 4w ago Mon Erik drv45
  v_ps2         uuid := '61100001-0000-0000-0000-000000000002'; -- 4w ago Tue Maria drv60
  v_ps3         uuid := '61100001-0000-0000-0000-000000000003'; -- 3w ago Mon Erik drv45
  v_ps4         uuid := '61100001-0000-0000-0000-000000000004'; -- 3w ago Wed Maria theory (6 seats)
  v_ps5         uuid := '61100001-0000-0000-0000-000000000005'; -- 2w ago Mon Erik drv60
  v_ps6         uuid := '61100001-0000-0000-0000-000000000006'; -- 2w ago Tue Maria drv45
  v_ps7         uuid := '61100001-0000-0000-0000-000000000007'; -- 1w ago Mon Maria drv45
  v_ps8         uuid := '61100001-0000-0000-0000-000000000008'; -- 1w ago Thu Erik drv60

  -- ── Future slot UUIDs (must match demo_data.sql; receive confirmed bookings) ─
  v_fs1         uuid := '51100001-0000-0000-0000-000000000001'; -- next Mon 09:00 Erik drv45
  v_fs2         uuid := '51100001-0000-0000-0000-000000000002'; -- next Mon 14:00 Maria drv60
  v_fs3         uuid := '51100001-0000-0000-0000-000000000003'; -- next Tue 09:00 Maria drv45

  -- ── Invoice UUIDs ───────────────────────────────────────────────────────────
  v_inv_draft   uuid := '71100001-0000-0000-0000-000000000001'; -- Emma   draft
  v_inv_issued  uuid := '71100001-0000-0000-0000-000000000002'; -- Marcus issued (due in 25d)
  v_inv_overdue uuid := '71100001-0000-0000-0000-000000000003'; -- Sofia  overdue (due 30d ago)
  v_inv_paid    uuid := '71100001-0000-0000-0000-000000000004'; -- Ahmed  paid
  v_inv_partial uuid := '71100001-0000-0000-0000-000000000005'; -- Lena   partially_paid

  -- ── Past week Monday anchors (00:00 UTC) ────────────────────────────────────
  v_w4          timestamptz; -- Monday 4 weeks ago
  v_w3          timestamptz; -- Monday 3 weeks ago
  v_w2          timestamptz; -- Monday 2 weeks ago
  v_w1          timestamptz; -- Monday last week

BEGIN

  -- ─── Guard: org must exist ────────────────────────────────────────────────
  SELECT id INTO v_org_id
  FROM   public.organizations
  WHERE  slug = 'trafikskolan' AND status = 'active';

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION
      E'\n\n'
      '  !! Organization not found !!\n'
      '  Run bootstrap_org_admin.sql then demo_data.sql first.\n'
      '  Expected org slug: trafikskolan\n';
  END IF;

  -- ─── Guard: demo_data.sql must have run ───────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.instructors WHERE id = v_instr_erik) THEN
    RAISE EXCEPTION
      E'\n\n'
      '  !! Instructors not found !!\n'
      '  Run demo_data.sql before this script.\n'
      '  Expected instructor ID: %\n', v_instr_erik;
  END IF;

  -- Resolve lesson type IDs by code
  SELECT id INTO v_lt_drv_45 FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'driving_b_45';
  SELECT id INTO v_lt_drv_60 FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'driving_b_60';
  SELECT id INTO v_lt_theory FROM public.lesson_types WHERE organization_id = v_org_id AND code = 'theory_group';

  IF v_lt_drv_45 IS NULL OR v_lt_drv_60 IS NULL OR v_lt_theory IS NULL THEN
    RAISE EXCEPTION
      E'\n\n'
      '  !! Lesson types not found !!\n'
      '  Run demo_data.sql before this script.\n';
  END IF;

  -- Compute past-week Monday anchors (00:00 UTC)
  -- Stockholm summer = CEST (UTC+2): 09:00 Stockholm = 07:00 UTC
  v_w4 := date_trunc('week', now() - interval '4 weeks');
  v_w3 := date_trunc('week', now() - interval '3 weeks');
  v_w2 := date_trunc('week', now() - interval '2 weeks');
  v_w1 := date_trunc('week', now() - interval '1 week');

  RAISE NOTICE 'Organization: % (%)', 'Trafikskolan AB', v_org_id;

  -- =========================================================================
  -- STEP 1: Students
  -- =========================================================================
  -- 8 students across all permit stages; Swedish demographics; soft-delete not used.
  -- personnummer_* omitted entirely (GDPR-sensitive; not needed for demo realism).
  -- assigned_instructor_id references instructors from demo_data.sql.

  INSERT INTO public.students (
    id, organization_id,
    first_name, last_name, email, phone,
    date_of_birth, address_line1, postal_code, city,
    preferred_language,
    data_processing_consent, gdpr_consent_given_at,
    communication_opt_in_email, communication_opt_in_sms,
    status, enrolled_at, status_changed_at,
    target_licence_category, permit_stage, permit_stage_updated_at,
    risk1_completed_at, risk2_completed_at,
    theory_passed_at, practical_passed_at, licence_issued_at,
    assigned_instructor_id
  ) VALUES

    -- 1. Sofia Andersson — active, risk2_completed; close to theory exam
    (v_st_sofia, v_org_id,
     'Sofia', 'Andersson', 'sofia.andersson@example.com', '070-456 78 90',
     '2000-03-14', 'Hornsgatan 42', '117 34', 'Stockholm',
     'sv',
     true, now() - interval '6 months',
     true, true,
     'active', now() - interval '6 months', now() - interval '2 months',
     'B', 'risk2_completed', now() - interval '2 months',
     now() - interval '5 months', now() - interval '2 months',
     NULL, NULL, NULL,
     v_instr_erik),

    -- 2. Marcus Johansson — active, theory_passed; körprov coming up
    (v_st_marcus, v_org_id,
     'Marcus', 'Johansson', 'marcus.johansson@example.com', '073-234 56 78',
     '1998-07-22', 'Götgatan 18', '116 25', 'Stockholm',
     'sv',
     true, now() - interval '8 months',
     true, true,
     'active', now() - interval '8 months', now() - interval '3 months',
     'B', 'theory_passed', now() - interval '3 months',
     now() - interval '7 months', now() - interval '5 months',
     now() - interval '3 months', NULL, NULL,
     v_instr_maria),

    -- 3. Lena Berg — active, theory_study; just started
    (v_st_lena, v_org_id,
     'Lena', 'Berg', 'lena.berg@example.com', '070-876 54 32',
     '2001-11-05', 'Vasagatan 7', '171 54', 'Solna',
     'sv',
     true, now() - interval '2 months',
     true, true,
     'active', now() - interval '2 months', now() - interval '2 months',
     'B', 'theory_study', now() - interval '2 months',
     NULL, NULL, NULL, NULL, NULL,
     v_instr_erik),

    -- 4. Ahmed Khalil — active, risk1_completed; risk2 next
    (v_st_ahmed, v_org_id,
     'Ahmed', 'Khalil', 'ahmed.khalil@example.com', '073-345 67 89',
     '1999-04-18', 'Rinkebytorget 3', '163 74', 'Spånga',
     'sv',
     true, now() - interval '5 months',
     true, true,
     'active', now() - interval '5 months', now() - interval '1 month',
     'B', 'risk1_completed', now() - interval '1 month',
     now() - interval '1 month', NULL, NULL, NULL, NULL,
     v_instr_maria),

    -- 5. Emma Lindström — active, practical_exam_booked; körprov booked
    (v_st_emma, v_org_id,
     'Emma', 'Lindström', 'emma.lindstrom@example.com', '070-567 89 01',
     '2000-09-30', 'Kungsholmsgatan 11', '112 27', 'Stockholm',
     'sv',
     true, now() - interval '10 months',
     true, true,
     'active', now() - interval '10 months', now() - interval '3 weeks',
     'B', 'practical_exam_booked', now() - interval '3 weeks',
     now() - interval '9 months', now() - interval '7 months',
     now() - interval '5 months', NULL, NULL,
     v_instr_erik),

    -- 6. Mikael Nilsson — active, risk2_booked; Risktvåan booked
    (v_st_mikael, v_org_id,
     'Mikael', 'Nilsson', 'mikael.nilsson@example.com', '073-678 90 12',
     '1997-12-08', 'Solnavägen 45', '171 45', 'Sundbyberg',
     'sv',
     true, now() - interval '4 months',
     true, true,
     'active', now() - interval '4 months', now() - interval '3 weeks',
     'B', 'risk2_booked', now() - interval '3 weeks',
     now() - interval '3 months', NULL, NULL, NULL, NULL,
     v_instr_maria),

    -- 7. Sara Petersson — completed; licence issued 6 months ago
    (v_st_sara, v_org_id,
     'Sara', 'Petersson', 'sara.petersson@example.com', '070-789 01 23',
     '1995-02-25', 'Folkungagatan 88', '116 30', 'Stockholm',
     'sv',
     true, now() - interval '24 months',
     true, false,
     'completed', now() - interval '24 months', now() - interval '6 months',
     'B', 'licence_issued', now() - interval '6 months',
     now() - interval '22 months', now() - interval '20 months',
     now() - interval '18 months', now() - interval '7 months', now() - interval '6 months',
     NULL),

    -- 8. Johan Gustafsson — onboarding; not yet started
    (v_st_johan, v_org_id,
     'Johan', 'Gustafsson', 'johan.gustafsson@example.com', '073-890 12 34',
     '2002-06-15', 'Centralvägen 2', '183 11', 'Täby',
     'sv',
     true, now() - interval '1 week',
     true, true,
     'onboarding', NULL, now() - interval '1 week',
     'B', 'not_started', NULL,
     NULL, NULL, NULL, NULL, NULL,
     NULL)

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ Students seeded: Sofia, Marcus, Lena, Ahmed, Emma, Mikael, Sara, Johan (8 students)';

  -- =========================================================================
  -- STEP 2: Past lesson slots (completed; needed for booking history)
  -- =========================================================================
  -- These anchor the completed bookings and activity feed entries.
  -- Status = completed because the slot time has passed.
  -- Stockholm CEST (UTC+2): 09:00 Stockholm = 07:00 UTC.

  INSERT INTO public.lesson_slots (
    id, organization_id, instructor_id, lesson_type_id,
    starts_at, ends_at, timezone,
    status, max_bookings, generation_source, notes
  ) VALUES

    -- Week -4: Mon 09:00–09:45 (Erik, driving_b_45)
    (v_ps1, v_org_id, v_instr_erik, v_lt_drv_45,
     v_w4 + interval '7 hours',
     v_w4 + interval '7 hours 45 minutes',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Erik'),

    -- Week -4: Tue 09:00–10:00 (Maria, driving_b_60)
    (v_ps2, v_org_id, v_instr_maria, v_lt_drv_60,
     v_w4 + interval '1 day 7 hours',
     v_w4 + interval '1 day 8 hours',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Maria'),

    -- Week -3: Mon 09:00–09:45 (Erik, driving_b_45)
    (v_ps3, v_org_id, v_instr_erik, v_lt_drv_45,
     v_w3 + interval '7 hours',
     v_w3 + interval '7 hours 45 minutes',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Erik'),

    -- Week -3: Wed 11:00–12:00 (Maria, theory_group; 6 seats for group class)
    (v_ps4, v_org_id, v_instr_maria, v_lt_theory,
     v_w3 + interval '2 days 9 hours',
     v_w3 + interval '2 days 10 hours',
     'Europe/Stockholm', 'completed', 6, 'manual', 'Teorigenomgång — Maria'),

    -- Week -2: Mon 09:00–10:00 (Erik, driving_b_60)
    (v_ps5, v_org_id, v_instr_erik, v_lt_drv_60,
     v_w2 + interval '7 hours',
     v_w2 + interval '8 hours',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Erik'),

    -- Week -2: Tue 09:00–09:45 (Maria, driving_b_45)
    (v_ps6, v_org_id, v_instr_maria, v_lt_drv_45,
     v_w2 + interval '1 day 7 hours',
     v_w2 + interval '1 day 7 hours 45 minutes',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Maria'),

    -- Week -1: Mon 09:00–09:45 (Maria, driving_b_45)
    (v_ps7, v_org_id, v_instr_maria, v_lt_drv_45,
     v_w1 + interval '7 hours',
     v_w1 + interval '7 hours 45 minutes',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Maria'),

    -- Week -1: Thu 09:00–10:00 (Erik, driving_b_60)
    (v_ps8, v_org_id, v_instr_erik, v_lt_drv_60,
     v_w1 + interval '3 days 7 hours',
     v_w1 + interval '3 days 8 hours',
     'Europe/Stockholm', 'completed', 1, 'manual', 'Körlektion — Erik')

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ Past lesson slots seeded: 8 completed slots across 4 weeks';

  -- =========================================================================
  -- STEP 3: Lesson bookings
  -- =========================================================================
  -- BEFORE INSERT trigger (lesson_booking_set_slot_fields) automatically copies:
  --   instructor_id, vehicle_id, lesson_type_id, location_id, starts_at, ends_at
  -- from the referenced slot. Only slot_id + student_id + organization_id are required.
  --
  -- Constraints satisfied:
  --   cancel_consistency: cancelled_at IS NULL for non-cancelled bookings ✓
  --   no_show_consistency: no_show_marked_at IS NULL for non-no_show bookings ✓
  --   slot_student_uniq: each (slot_id, student_id) pair is unique ✓
  --   student EXCLUDE: no student has two overlapping bookings ✓

  INSERT INTO public.lesson_bookings (
    id, organization_id, slot_id, student_id,
    status, status_changed_at, price_sek, payment_status
  ) VALUES

    -- ── Past bookings (completed) ───────────────────────────────────────────
    -- Week -4
    ('b1100001-0000-0000-0000-000000000001', v_org_id, v_ps1, v_st_sofia,
     'completed', v_w4 + interval '7 hours 45 minutes', 695.00, 'paid'),

    ('b1100001-0000-0000-0000-000000000002', v_org_id, v_ps2, v_st_lena,
     'completed', v_w4 + interval '1 day 8 hours', 895.00, 'paid'),

    -- Week -3
    ('b1100001-0000-0000-0000-000000000003', v_org_id, v_ps3, v_st_marcus,
     'completed', v_w3 + interval '7 hours 45 minutes', 695.00, 'paid'),

    -- Week -3: teorigenomgång — two students in the same group slot
    ('b1100001-0000-0000-0000-000000000004', v_org_id, v_ps4, v_st_ahmed,
     'completed', v_w3 + interval '2 days 10 hours', 495.00, 'paid'),

    ('b1100001-0000-0000-0000-000000000005', v_org_id, v_ps4, v_st_emma,
     'completed', v_w3 + interval '2 days 10 hours', 495.00, 'paid'),

    -- Week -2
    ('b1100001-0000-0000-0000-000000000006', v_org_id, v_ps5, v_st_sofia,
     'completed', v_w2 + interval '8 hours', 895.00, 'unpaid'),

    ('b1100001-0000-0000-0000-000000000007', v_org_id, v_ps6, v_st_mikael,
     'completed', v_w2 + interval '1 day 7 hours 45 minutes', 695.00, 'paid'),

    -- Week -1
    ('b1100001-0000-0000-0000-000000000008', v_org_id, v_ps7, v_st_marcus,
     'completed', v_w1 + interval '7 hours 45 minutes', 695.00, 'paid'),

    ('b1100001-0000-0000-0000-000000000009', v_org_id, v_ps8, v_st_ahmed,
     'completed', v_w1 + interval '3 days 8 hours', 895.00, 'unpaid'),

    -- ── Upcoming bookings (confirmed; on next-week slots from demo_data.sql) ─
    ('b1100001-0000-0000-0000-000000000010', v_org_id, v_fs1, v_st_sofia,
     'confirmed', now(), 695.00, 'unpaid'),

    ('b1100001-0000-0000-0000-000000000011', v_org_id, v_fs2, v_st_marcus,
     'confirmed', now(), 895.00, 'unpaid'),

    ('b1100001-0000-0000-0000-000000000012', v_org_id, v_fs3, v_st_lena,
     'confirmed', now(), 695.00, 'unpaid')

  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '✓ Lesson bookings seeded: 9 completed (history) + 3 confirmed (upcoming)';

  -- =========================================================================
  -- STEP 4: Invoices, line items, issue, and payments
  -- =========================================================================
  -- All five invoice states are represented: draft, issued, overdue, paid, partially_paid.
  -- issue_invoice() generates the gap-free number and freezes VAT.
  -- record_payment() creates the payment record and updates invoice amounts.
  -- Guards prevent double-execution on re-run.

  -- ── 4a. Draft invoice — Emma — körlektion 45 min ──────────────────────────
  INSERT INTO public.invoices (
    id, organization_id, student_id, status, currency,
    due_date, notes
  ) VALUES (
    v_inv_draft, v_org_id, v_st_emma, 'draft', 'SEK',
    now() + interval '30 days',
    'Körlektion — faktura under förberedelse'
  ) ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.invoice_line_items WHERE invoice_id = v_inv_draft) THEN
    INSERT INTO public.invoice_line_items (
      organization_id, invoice_id, line_type, description,
      quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      v_org_id, v_inv_draft, 'lesson', 'Körlektion 45 min',
      1, 556.00, 0.25, 139.00, 556.00, 10
    );
  END IF;

  -- ── 4b. Issued invoice — Marcus — körlektion 45 × 2 ──────────────────────
  INSERT INTO public.invoices (
    id, organization_id, student_id, status, currency,
    due_date, notes
  ) VALUES (
    v_inv_issued, v_org_id, v_st_marcus, 'draft', 'SEK',
    now() + interval '25 days',
    'Körlektion × 2'
  ) ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.invoice_line_items WHERE invoice_id = v_inv_issued) THEN
    INSERT INTO public.invoice_line_items (
      organization_id, invoice_id, line_type, description,
      quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      v_org_id, v_inv_issued, 'lesson', 'Körlektion 45 min',
      2, 556.00, 0.25, 278.00, 1112.00, 10
    );
  END IF;

  IF (SELECT status FROM public.invoices WHERE id = v_inv_issued) = 'draft' THEN
    PERFORM public.issue_invoice(v_inv_issued, v_actor_id);
  END IF;

  -- ── 4c. Overdue invoice — Sofia — körlektion 60 (was due 30 days ago) ─────
  INSERT INTO public.invoices (
    id, organization_id, student_id, status, currency,
    due_date, notes
  ) VALUES (
    v_inv_overdue, v_org_id, v_st_sofia, 'draft', 'SEK',
    now() - interval '30 days',
    'Körlektion 60 min — förfallen'
  ) ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.invoice_line_items WHERE invoice_id = v_inv_overdue) THEN
    INSERT INTO public.invoice_line_items (
      organization_id, invoice_id, line_type, description,
      quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      v_org_id, v_inv_overdue, 'lesson', 'Körlektion 60 min',
      1, 716.00, 0.25, 179.00, 716.00, 10
    );
  END IF;

  IF (SELECT status FROM public.invoices WHERE id = v_inv_overdue) = 'draft' THEN
    PERFORM public.issue_invoice(v_inv_overdue, v_actor_id);
  END IF;

  -- Mark overdue (dunning engine would normally do this; we set it directly for seed realism)
  UPDATE public.invoices
  SET status = 'overdue', updated_at = now()
  WHERE id = v_inv_overdue AND status = 'issued';

  -- ── 4d. Paid invoice — Ahmed — körlektion 60 ─────────────────────────────
  INSERT INTO public.invoices (
    id, organization_id, student_id, status, currency,
    due_date, notes
  ) VALUES (
    v_inv_paid, v_org_id, v_st_ahmed, 'draft', 'SEK',
    now() - interval '7 days',
    'Körlektion 60 min'
  ) ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.invoice_line_items WHERE invoice_id = v_inv_paid) THEN
    INSERT INTO public.invoice_line_items (
      organization_id, invoice_id, line_type, description,
      quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      v_org_id, v_inv_paid, 'lesson', 'Körlektion 60 min',
      1, 716.00, 0.25, 179.00, 716.00, 10
    );
  END IF;

  IF (SELECT status FROM public.invoices WHERE id = v_inv_paid) = 'draft' THEN
    PERFORM public.issue_invoice(v_inv_paid, v_actor_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE invoice_id = v_inv_paid) THEN
    PERFORM public.record_payment(v_inv_paid, 895.00, 'swish', 'SWISH-DEMO-0001', v_actor_id);
  END IF;

  -- ── 4e. Partially paid invoice — Lena — Riskutbildning 1 (2950 SEK) ──────
  INSERT INTO public.invoices (
    id, organization_id, student_id, status, currency,
    due_date, notes
  ) VALUES (
    v_inv_partial, v_org_id, v_st_lena, 'draft', 'SEK',
    now() + interval '15 days',
    'Riskutbildning 1 (Riskettan)'
  ) ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.invoice_line_items WHERE invoice_id = v_inv_partial) THEN
    INSERT INTO public.invoice_line_items (
      organization_id, invoice_id, line_type, description,
      quantity, unit_price, vat_rate, vat_amount, line_total, sort_order
    ) VALUES (
      v_org_id, v_inv_partial, 'lesson', 'Riskutbildning 1 (Riskettan)',
      1, 2360.00, 0.25, 590.00, 2360.00, 10
    );
  END IF;

  IF (SELECT status FROM public.invoices WHERE id = v_inv_partial) = 'draft' THEN
    PERFORM public.issue_invoice(v_inv_partial, v_actor_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE invoice_id = v_inv_partial) THEN
    PERFORM public.record_payment(v_inv_partial, 1500.00, 'bank_transfer', 'BG-DEMO-0001', v_actor_id);
  END IF;

  RAISE NOTICE '✓ Invoices seeded: draft (Emma), issued (Marcus), overdue (Sofia), paid (Ahmed), partially_paid (Lena)';
  RAISE NOTICE '✓ Payments seeded: Swish 895 SEK (Ahmed), bank_transfer 1500 SEK partial (Lena)';

  -- =========================================================================
  -- Summary
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== Demo continuity seed complete ===';
  RAISE NOTICE 'Students    : 8 (active, onboarding, completed — varied permit stages)';
  RAISE NOTICE 'Past slots  : 8 (completed; spans 4 weeks of booking history)';
  RAISE NOTICE 'Bookings    : 12 (9 completed + 3 confirmed upcoming)';
  RAISE NOTICE 'Invoices    : 5 (draft/issued/overdue/paid/partially_paid)';
  RAISE NOTICE 'Payments    : 2 (Swish full, bank_transfer partial)';
  RAISE NOTICE '';
  RAISE NOTICE 'Dashboard will now show:';
  RAISE NOTICE '  • Active students  : 6';
  RAISE NOTICE '  • Upcoming lessons : 3+ (calendar next week)';
  RAISE NOTICE '  • Pending invoices : 3 (issued + overdue + partially_paid)';
  RAISE NOTICE '  • Activity history : 9 completed bookings across 4 weeks';

END $$;
