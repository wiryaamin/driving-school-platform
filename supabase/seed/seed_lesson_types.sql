-- =============================================================================
-- SEED: Comprehensive Swedish Driving School Lesson Types
--
-- Adds the full lesson type catalogue used by a typical trafikskola:
--   • Riskutbildning 1 — Motorcykel (A1, A2, A) variants
--   • Riskutbildning 1 — Personbil (B) variants
--   • Riskutbildning 2 — Motorcykel variants
--   • Riskutbildning 2 — Personbil (B) variants
--   • Körlektion (various durations)
--   • Teori / Grupputbildning
--   • Simulator
--   • Bedömning / Uppkörningsförberedelse
--   • Intensivkurs
--
-- HOW TO RUN (local dev):
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--     -f supabase/seed/seed_lesson_types.sql
--
-- Safe to re-run: ON CONFLICT (organization_id, code) DO NOTHING
-- Requires: at least one organization row exists (run bootstrap_org_admin.sql first)
-- =============================================================================

DO $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found. Run bootstrap_org_admin.sql (or db reset) first.';
  END IF;

  RAISE NOTICE 'Seeding lesson types for org: %', v_org_id;

  INSERT INTO public.lesson_types (
    organization_id, name, code, category,
    default_duration_minutes, min_duration_minutes, max_duration_minutes,
    requires_vehicle, requires_instructor,
    required_certifications, max_students_per_slot,
    color_hex, display_order, is_active, pricing_sek
  ) VALUES

    -- ─── Riskutbildning 1 — Motorcykel (A1, A2, A) ───────────────────────────

    (v_org_id, 'Kombo Risk 1 MC', 'risk1_mc_kombo', 'risk1',
     480, 420, 540, false, true, '{}', 8,
     '#D97706', 100, true, 3950.00),

    (v_org_id, 'Riskutbildning 1 MC', 'risk1_mc', 'risk1',
     480, 420, 540, false, true, '{}', 8,
     '#D97706', 110, true, 3500.00),

    -- ─── Riskutbildning 1 — Personbil (B) ────────────────────────────────────

    (v_org_id, 'Risk 1', 'risk1_bil', 'risk1',
     480, 420, 540, false, true, '{}', 16,
     '#D97706', 120, true, 2950.00),

    (v_org_id, 'Risk 1 Eng', 'risk1_bil_eng', 'risk1',
     480, 420, 540, false, true, '{}', 16,
     '#D97706', 130, true, 2950.00),

    (v_org_id, 'Risk education 1 B', 'risk1_bil_edu', 'risk1',
     480, 420, 540, false, true, '{}', 16,
     '#D97706', 140, true, 2950.00),

    (v_org_id, 'Riskutbildning 1 BIL', 'risk1_bil_se', 'risk1',
     480, 420, 540, false, true, '{}', 16,
     '#D97706', 150, true, 2950.00),

    -- ─── Riskutbildning 2 — Motorcykel (A1, A2, A) ───────────────────────────

    (v_org_id, 'Kombo Risk 2 MC', 'risk2_mc_kombo', 'risk2',
     480, 420, 540, true, true, '{}', 8,
     '#DC2626', 200, true, 4500.00),

    (v_org_id, 'Riskutbildning 2 MC', 'risk2_mc', 'risk2',
     480, 420, 540, true, true, '{}', 8,
     '#DC2626', 210, true, 3950.00),

    -- ─── Riskutbildning 2 — Personbil (B) ────────────────────────────────────

    (v_org_id, 'Risk 2', 'risk2_bil', 'risk2',
     480, 420, 540, true, true, '{}', 6,
     '#DC2626', 220, true, 2750.00),

    (v_org_id, 'Risk 2 Eng', 'risk2_bil_eng', 'risk2',
     480, 420, 540, true, true, '{}', 6,
     '#DC2626', 230, true, 2750.00),

    (v_org_id, 'Risk education 2 B', 'risk2_bil_edu', 'risk2',
     480, 420, 540, true, true, '{}', 6,
     '#DC2626', 240, true, 2750.00),

    (v_org_id, 'Riskutbildning 2 BIL', 'risk2_bil_se', 'risk2',
     480, 420, 540, true, true, '{}', 6,
     '#DC2626', 250, true, 2750.00),

    -- ─── Körlektion ───────────────────────────────────────────────────────────

    (v_org_id, 'Körlektion 45 min', 'driving_b_45', 'driving',
     45, 30, 60, true, true, '{}', 1,
     '#2563EB', 300, true, 695.00),

    (v_org_id, 'Körlektion 60 min', 'driving_b_60', 'driving',
     60, 45, 90, true, true, '{}', 1,
     '#2563EB', 310, true, 895.00),

    (v_org_id, 'Introduktionslektion', 'driving_intro', 'driving',
     60, 45, 90, true, true, '{}', 1,
     '#3B82F6', 320, true, 895.00),

    (v_org_id, 'Motorvägslektion', 'driving_highway', 'driving',
     60, 45, 90, true, true, '{}', 1,
     '#1D4ED8', 330, true, 895.00),

    -- ─── Teori ────────────────────────────────────────────────────────────────

    (v_org_id, 'Teorigenomgång', 'theory_group', 'theory',
     60, 45, 90, false, true, '{}', 12,
     '#7C3AED', 400, true, 495.00),

    (v_org_id, 'Teoriprov (internt)', 'theory_mock_exam', 'theory',
     45, 30, 60, false, true, '{}', 10,
     '#6D28D9', 410, true, 395.00),

    -- ─── Simulator ────────────────────────────────────────────────────────────

    (v_org_id, 'Simulatorlektion', 'simulator_standard', 'simulator',
     45, 30, 60, false, true, '{}', 1,
     '#0891B2', 500, true, 595.00),

    -- ─── Bedömning ────────────────────────────────────────────────────────────

    (v_org_id, 'Uppkörningsförberedelse', 'assessment_prep', 'assessment',
     90, 60, 120, true, true, '{}', 1,
     '#16A34A', 600, true, 1195.00),

    (v_org_id, 'Körkortstest (internt)', 'assessment_test', 'assessment',
     60, 45, 90, true, true, '{}', 1,
     '#15803D', 610, true, 895.00),

    -- ─── Intensivkurs ─────────────────────────────────────────────────────────

    (v_org_id, 'Intensivkurs 5 dagar', 'intensive_5d', 'intensive',
     2400, 2400, 2400, true, true, '{}', 1,
     '#DB2777', 700, true, 12500.00),

    -- ─── Grupputbildning ──────────────────────────────────────────────────────

    (v_org_id, 'Grupplektion teori', 'group_theory_standard', 'group_theory',
     90, 60, 120, false, true, '{}', 20,
     '#4F46E5', 800, true, 395.00)

  ON CONFLICT (organization_id, code) DO NOTHING;

  RAISE NOTICE '✓ Lesson types seeded successfully';
  RAISE NOTICE '  risk1 (MC): Kombo Risk 1 MC, Riskutbildning 1 MC';
  RAISE NOTICE '  risk1 (BIL): Risk 1, Risk 1 Eng, Risk education 1 B, Riskutbildning 1 BIL';
  RAISE NOTICE '  risk2 (MC): Kombo Risk 2 MC, Riskutbildning 2 MC';
  RAISE NOTICE '  risk2 (BIL): Risk 2, Risk 2 Eng, Risk education 2 B, Riskutbildning 2 BIL';
  RAISE NOTICE '  driving: 45 min, 60 min, Introduktion, Motorväg';
  RAISE NOTICE '  theory, simulator, assessment, intensive, group_theory';

END $$;
