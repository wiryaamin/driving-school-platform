-- =============================================================================
-- TEST: Slot generation tenant guard (20261009130000)
--
-- Regression tests for the cross-tenant slot-generation defect:
--   1. Authorised user (school A) generates slots for a school-A instructor   → allowed
--   2. School-A user → generate_slots_for_instructor(school-B instructor)    → 42501
--   3. School-A user → generate_slots_for_rule(school-B rule)                → 42501
--   4. School-A user → generate_slots_for_organization(school B)             → 42501
--   5. Cross-tenant attempts create ZERO slots for school B
--   6. School-A user WITHOUT scheduling:generation:run                       → 42501
--   7. Anonymous database role cannot EXECUTE any generator                  → 42501
--   8. API caller with anonymous claims (no auth.uid())                      → 42501
--   9. generate_slots_from_templates without permission                      → 42501
--  10. generate_instructor_schedule for a school-B instructor                → rejected, 0 slots
--  11. Trusted backend (service_role) and Platform Admin keep working        → allowed
--  12. Re-running legitimate generation is idempotent                        → 0 new slots
--
-- HOW TO RUN (after the migrations are applied — disposable/test databases):
--   psql "$DATABASE_URL" -f supabase/tests/slot_generation_tenant_guard.test.sql
--
-- Runs in ONE transaction and is ROLLED BACK at the end (or aborted by the first
-- failed assertion). Creates its own two synthetic organisations; needs no data.
-- =============================================================================

BEGIN;

-- Fixtures are created as the database owner with no API caller context
-- (request.jwt.claims unset — run this file in a fresh session).

DO $test$
DECLARE
  v_org_a   uuid := 'a1a1a1a1-0000-4000-8000-000000000001';
  v_org_b   uuid := 'b2b2b2b2-0000-4000-8000-000000000002';
  v_inst_a  uuid := 'a1a1a1a1-0000-4000-8000-0000000000a1';
  v_inst_b  uuid := 'b2b2b2b2-0000-4000-8000-0000000000b1';
  v_user_a  uuid := 'a1a1a1a1-0000-4000-8000-0000000000ff';
  v_rule_a  uuid;
  v_rule_b  uuid;
  v_start   date := CURRENT_DATE + 90;
  v_end     date := CURRENT_DATE + 96;
  v_n       integer;
  v_created integer;
  v_state   text;
  v_claims_a     text;
  v_claims_noperm text;
BEGIN
  -- Synthetic auth user so event_outbox.created_by (auth.uid()) satisfies its FK.
  INSERT INTO auth.users (id, email, aud, role)
  VALUES (v_user_a, 'sgtg-user@example.invalid', 'authenticated', 'authenticated');

  INSERT INTO public.organizations (id, slug, name, legal_name, status, subscription_tier, subscription_status) VALUES
    (v_org_a, 'sgtg-skola-a', 'SGTG Skola A', 'SGTG Skola A AB', 'active', 'starter', 'active'),
    (v_org_b, 'sgtg-skola-b', 'SGTG Skola B', 'SGTG Skola B AB', 'active', 'starter', 'active');
  INSERT INTO public.instructors (id, organization_id, first_name, last_name, email) VALUES
    (v_inst_a, v_org_a, 'Test', 'LärareA', 'sgtg-a@example.invalid'),
    (v_inst_b, v_org_b, 'Test', 'LärareB', 'sgtg-b@example.invalid');
  INSERT INTO public.instructor_availability_rules
    (organization_id, instructor_id, day_of_week, start_time, end_time, slot_duration_minutes, slot_buffer_minutes, timezone, effective_from)
  VALUES (v_org_a, v_inst_a, EXTRACT(DOW FROM v_start)::smallint, '08:00', '12:00', 40, 20, 'Europe/Stockholm', CURRENT_DATE)
  RETURNING id INTO v_rule_a;
  INSERT INTO public.instructor_availability_rules
    (organization_id, instructor_id, day_of_week, start_time, end_time, slot_duration_minutes, slot_buffer_minutes, timezone, effective_from)
  VALUES (v_org_b, v_inst_b, EXTRACT(DOW FROM v_start)::smallint, '08:00', '12:00', 40, 20, 'Europe/Stockholm', CURRENT_DATE)
  RETURNING id INTO v_rule_b;

  v_claims_a := json_build_object('sub', v_user_a, 'role', 'org_owner', 'organization_id', v_org_a,
                                  'permissions', json_build_array('scheduling:generation:run'), 'is_platform_admin', false)::text;
  v_claims_noperm := json_build_object('sub', v_user_a, 'role', 'reporting_viewer', 'organization_id', v_org_a,
                                       'permissions', json_build_array('students:student:read'), 'is_platform_admin', false)::text;

  -- ── 1. Authorised own-school generation ──────────────────────────────────
  PERFORM set_config('request.jwt.claims', v_claims_a, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT slots_created INTO v_created FROM public.generate_slots_for_instructor(v_inst_a, NULL, v_start, v_end);
  EXECUTE 'RESET ROLE';
  IF v_created <> 4 THEN RAISE EXCEPTION 'T1 FAIL: expected 4 own-school slots, got %', v_created; END IF;
  RAISE NOTICE 'T1 OK  own-school generation created % slots', v_created;

  -- ── 2–4. Cross-tenant attempts from school A ─────────────────────────────
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.generate_slots_for_instructor(v_inst_b, NULL, v_start, v_end);
    RAISE EXCEPTION 'T2 FAIL: cross-tenant instructor generation was allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T2 OK  cross-tenant instructor → 42501';
  END;
  BEGIN
    PERFORM public.generate_slots_for_rule(v_rule_b, NULL, v_start, v_end);
    RAISE EXCEPTION 'T3 FAIL: cross-tenant rule generation was allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T3 OK  cross-tenant rule → 42501';
  END;
  BEGIN
    PERFORM public.generate_slots_for_organization(v_org_b, NULL, v_start, v_end);
    RAISE EXCEPTION 'T4 FAIL: cross-tenant organisation generation was allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T4 OK  cross-tenant organisation → 42501';
  END;
  EXECUTE 'RESET ROLE';

  -- ── 5. Zero records for school B ─────────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.lesson_slots WHERE organization_id = v_org_b;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T5 FAIL: % slots were created for school B', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.scheduling_generation_runs WHERE organization_id = v_org_b;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T5 FAIL: % generation runs were recorded for school B', v_n; END IF;
  RAISE NOTICE 'T5 OK  school B has 0 slots and 0 runs';

  -- ── 6. Missing permission ────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', v_claims_noperm, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.generate_slots_for_instructor(v_inst_a, NULL, v_start, v_end);
    RAISE EXCEPTION 'T6 FAIL: generation without permission was allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T6 OK  missing permission → 42501';
  END;
  -- ── 9. Templates without permission ─────────────────────────────────────
  BEGIN
    PERFORM public.generate_slots_from_templates(date_trunc('week', v_start::timestamp)::date);
    RAISE EXCEPTION 'T9 FAIL: template generation without permission was allowed';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T9 OK  templates without permission → 42501';
  END;
  EXECUTE 'RESET ROLE';

  -- ── 7. Anonymous database role: no EXECUTE ──────────────────────────────
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.generate_slots_for_rule(v_rule_b, NULL, v_start, v_end);
    RAISE EXCEPTION 'T7 FAIL: anon could execute generate_slots_for_rule';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.generate_slots_for_instructor(v_inst_b, NULL, v_start, v_end);
    RAISE EXCEPTION 'T7 FAIL: anon could execute generate_slots_for_instructor';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.generate_slots_for_organization(v_org_b, NULL, v_start, v_end);
    RAISE EXCEPTION 'T7 FAIL: anon could execute generate_slots_for_organization';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.generate_instructor_schedule(v_inst_b, 1);
    RAISE EXCEPTION 'T7 FAIL: anon could execute generate_instructor_schedule';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'T7 OK  anon role cannot execute any generator';

  -- ── 8. Anonymous claims through a role that still has EXECUTE ───────────
  -- (defence in depth: the guard itself must reject callers without auth.uid())
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.generate_slots_for_rule(v_rule_b, NULL, v_start, v_end);
    RAISE EXCEPTION 'T8 FAIL: guard accepted a caller without auth.uid()';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T8 OK  no auth.uid() → 42501';
  END;
  EXECUTE 'RESET ROLE';

  -- ── 10. generate_instructor_schedule cross-tenant ───────────────────────
  PERFORM set_config('request.jwt.claims', v_claims_a, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.generate_instructor_schedule(v_inst_b, 2);
    RAISE EXCEPTION 'T10 FAIL: generate_instructor_schedule accepted a school-B instructor';
  EXCEPTION WHEN insufficient_privilege OR no_data_found THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    RAISE NOTICE 'T10 OK  generate_instructor_schedule cross-tenant → %', v_state;
  END;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n FROM public.lesson_slots WHERE organization_id = v_org_b;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T10 FAIL: % slots exist for school B', v_n; END IF;

  -- ── 12. Idempotent re-run (legitimate) ──────────────────────────────────
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT slots_created INTO v_created FROM public.generate_slots_for_instructor(v_inst_a, NULL, v_start, v_end);
  EXECUTE 'RESET ROLE';
  IF v_created <> 0 THEN RAISE EXCEPTION 'T12 FAIL: re-run created % duplicate slots', v_created; END IF;
  RAISE NOTICE 'T12 OK  re-run created 0 duplicates';

  -- ── 11. Trusted backend and Platform Admin ──────────────────────────────
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT slots_created INTO v_created FROM public.generate_slots_for_organization(v_org_b, NULL, v_start, v_end);
  EXECUTE 'RESET ROLE';
  IF v_created <> 4 THEN RAISE EXCEPTION 'T11 FAIL: service_role org generation created % (expected 4)', v_created; END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'platform_superadmin', 'is_platform_admin', true)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT slots_created INTO v_created FROM public.generate_slots_for_rule(v_rule_b, NULL, v_start + 7, v_end + 7);
  EXECUTE 'RESET ROLE';
  IF v_created <> 4 THEN RAISE EXCEPTION 'T11 FAIL: platform admin rule generation created % (expected 4)', v_created; END IF;
  RAISE NOTICE 'T11 OK  service_role and Platform Admin generation still work';

  RAISE NOTICE '═══ slot_generation_tenant_guard: ALL TESTS PASSED ═══';
END;
$test$;

ROLLBACK;
