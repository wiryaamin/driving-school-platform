-- =============================================================================
-- TEST: Regulatory workflow document tenant isolation (20261009150000)
--
-- Exercises the storage.objects RLS policies of 'regulatory-workflow-documents':
--   1. School A user (regulatory:workflow:read/update) sees and deletes own objects → allowed
--   2. School A user cannot SELECT (list/sign/download/copy) school B's objects     → 0 rows
--   3. School A user cannot INSERT into school B's folder                          → 42501
--   4. School A user cannot DELETE school B's object                               → 0 rows, intact
--   5. User without regulatory permission sees nothing                             → 0 rows
--   6. Anonymous role sees nothing                                                 → 0 rows
--   7. Platform Admin JWT (empty permissions) has no storage access — unchanged    → 0 rows
--
-- HOW TO RUN (after the migration is applied — disposable/test databases):
--   psql "$DATABASE_URL" -f supabase/tests/regulatory_documents_tenant_isolation.test.sql
-- Runs in ONE transaction and is ROLLED BACK. Run in a fresh session.
-- =============================================================================

BEGIN;

-- Deletes go through the same switch the Storage API sets (storage.protect_delete);
-- RLS still decides which rows the caller may delete.
SELECT set_config('storage.allow_delete_query', 'true', true);

DO $test$
DECLARE
  v_org_a  uuid := 'a5a5a5a5-0000-4000-8000-000000000001';
  v_org_b  uuid := 'b5b5b5b5-0000-4000-8000-000000000002';
  v_user   uuid := 'a5a5a5a5-0000-4000-8000-0000000000ff';
  v_path_a text := 'a5a5a5a5-0000-4000-8000-000000000001/a5a5a5a5-0000-4000-8000-0000000000c1/1-own.pdf';
  v_path_b text := 'b5b5b5b5-0000-4000-8000-000000000002/b5b5b5b5-0000-4000-8000-0000000000c1/1-secret.pdf';
  v_bucket text := 'regulatory-workflow-documents';
  v_claims_a text;
  v_n integer;
BEGIN
  INSERT INTO auth.users (id, email, aud, role) VALUES (v_user, 'rdti-user@example.invalid', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (id, slug, name, legal_name, status, subscription_tier, subscription_status) VALUES
    (v_org_a, 'rdti-skola-a', 'RDTI Skola A', 'RDTI Skola A AB', 'active', 'starter', 'active'),
    (v_org_b, 'rdti-skola-b', 'RDTI Skola B', 'RDTI Skola B AB', 'active', 'starter', 'active');
  INSERT INTO storage.buckets (id, name, public) VALUES (v_bucket, v_bucket, false) ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES (v_bucket, v_path_a, v_user), (v_bucket, v_path_b, v_user);

  v_claims_a := json_build_object('sub', v_user, 'role', 'org_owner', 'organization_id', v_org_a, 'is_platform_admin', false,
    'permissions', json_build_array('regulatory:workflow:read', 'regulatory:workflow:update'))::text;

  PERFORM set_config('request.jwt.claims', v_claims_a, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM storage.objects WHERE bucket_id = v_bucket AND name = v_path_a;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T1 FAIL: school A cannot see its own object'; END IF;
  RAISE NOTICE 'T1 OK  own object visible';
  SELECT count(*) INTO v_n FROM storage.objects WHERE bucket_id = v_bucket AND name LIKE v_org_b::text || '/%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T2 FAIL: school A sees % school-B objects', v_n; END IF;
  RAISE NOTICE 'T2 OK  school B objects invisible to school A';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner) VALUES (v_bucket, v_org_b::text || '/x/planted.pdf', v_user);
    RAISE EXCEPTION 'T3 FAIL: school A could write into school B''s folder';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T3 OK  write into school B folder → 42501';
  END;
  DELETE FROM storage.objects WHERE bucket_id = v_bucket AND name = v_path_b;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T4 FAIL: school A deleted % school-B objects', v_n; END IF;
  DELETE FROM storage.objects WHERE bucket_id = v_bucket AND name = v_path_a;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T1 FAIL: school A could not delete its own object'; END IF;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n FROM storage.objects WHERE name = v_path_b;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T4 FAIL: school B object is gone'; END IF;
  RAISE NOTICE 'T4 OK  school B object cannot be deleted and is intact; own object deletable';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'reporting_viewer', 'organization_id', v_org_b,
    'is_platform_admin', false, 'permissions', json_build_array('students:student:read'))::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM storage.objects WHERE bucket_id = v_bucket;
  EXECUTE 'RESET ROLE';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T5 FAIL: user without permission sees % objects', v_n; END IF;
  RAISE NOTICE 'T5 OK  no regulatory permission → 0 objects (even in own school)';

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_n FROM storage.objects WHERE bucket_id = v_bucket;
  EXECUTE 'RESET ROLE';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T6 FAIL: anon sees % objects', v_n; END IF;
  RAISE NOTICE 'T6 OK  anon → 0 objects';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'platform_superadmin', 'organization_id', NULL,
    'is_platform_admin', true, 'permissions', json_build_array())::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM storage.objects WHERE bucket_id = v_bucket;
  EXECUTE 'RESET ROLE';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T7 FAIL: platform admin JWT sees % objects (behaviour changed)', v_n; END IF;
  RAISE NOTICE 'T7 OK  platform admin JWT (no permissions) → 0 objects, as before';

  RAISE NOTICE '═══ regulatory_documents_tenant_isolation: ALL TESTS PASSED ═══';
END;
$test$;

ROLLBACK;
