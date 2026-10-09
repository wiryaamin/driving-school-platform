-- =============================================================================
-- TEST: Student document tenant isolation (20261009140000)
--
-- Exercises the storage.objects RLS policies of the 'student-documents' bucket
-- and the student_documents location constraint directly in SQL:
--   1. School A user sees / may delete its own object                    → allowed
--   2. School A user cannot SELECT (list/sign/download) school B's object → 0 rows
--   3. School A user cannot INSERT into school B's folder                 → 42501
--   4. School A user cannot DELETE school B's object                      → 0 rows, object intact
--   5. User without documents permission sees nothing                     → 0 rows
--   6. Anonymous role sees nothing                                        → 0 rows
--   7. student_documents cannot point at another school's folder/bucket   → 23514
--
-- HOW TO RUN (after the migration is applied — disposable/test databases):
--   psql "$DATABASE_URL" -f supabase/tests/student_documents_tenant_isolation.test.sql
-- Runs in ONE transaction and is ROLLED BACK. Creates its own synthetic data;
-- run in a fresh session (request.jwt.claims unset).
-- =============================================================================

BEGIN;

-- Deletes go through the same switch the Storage API sets (storage.protect_delete);
-- RLS still decides which rows the caller may delete.
SELECT set_config('storage.allow_delete_query', 'true', true);

DO $test$
DECLARE
  v_org_a  uuid := 'a3a3a3a3-0000-4000-8000-000000000001';
  v_org_b  uuid := 'b3b3b3b3-0000-4000-8000-000000000002';
  v_stu_a  uuid := 'a3a3a3a3-0000-4000-8000-0000000000a1';
  v_stu_b  uuid := 'b3b3b3b3-0000-4000-8000-0000000000b1';
  v_user   uuid := 'a3a3a3a3-0000-4000-8000-0000000000ff';
  v_path_a text := 'a3a3a3a3-0000-4000-8000-000000000001/a3a3a3a3-0000-4000-8000-0000000000a1/own.pdf';
  v_path_b text := 'b3b3b3b3-0000-4000-8000-000000000002/b3b3b3b3-0000-4000-8000-0000000000b1/secret.pdf';
  v_claims_a      text;
  v_claims_noperm text;
  v_n integer;
BEGIN
  INSERT INTO auth.users (id, email, aud, role) VALUES (v_user, 'sdti-user@example.invalid', 'authenticated', 'authenticated');
  INSERT INTO public.organizations (id, slug, name, legal_name, status, subscription_tier, subscription_status) VALUES
    (v_org_a, 'sdti-skola-a', 'SDTI Skola A', 'SDTI Skola A AB', 'active', 'starter', 'active'),
    (v_org_b, 'sdti-skola-b', 'SDTI Skola B', 'SDTI Skola B AB', 'active', 'starter', 'active');
  INSERT INTO public.students (id, organization_id, first_name, last_name, status) VALUES
    (v_stu_a, v_org_a, 'Elev', 'A', 'active'), (v_stu_b, v_org_b, 'Elev', 'B', 'active');
  INSERT INTO storage.buckets (id, name, public) VALUES ('student-documents', 'student-documents', false)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES
    ('student-documents', v_path_a, v_user), ('student-documents', v_path_b, v_user);

  v_claims_a := json_build_object('sub', v_user, 'role', 'org_owner', 'organization_id', v_org_a, 'is_platform_admin', false,
    'permissions', json_build_array('documents:document:read', 'documents:document:create', 'documents:document:delete'))::text;
  v_claims_noperm := json_build_object('sub', v_user, 'role', 'reporting_viewer', 'organization_id', v_org_a, 'is_platform_admin', false,
    'permissions', json_build_array('students:student:read'))::text;

  -- ── 1 + 2. Visibility ────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', v_claims_a, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM storage.objects WHERE bucket_id = 'student-documents' AND name = v_path_a;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T1 FAIL: school A cannot see its own object'; END IF;
  SELECT count(*) INTO v_n FROM storage.objects WHERE bucket_id = 'student-documents' AND name LIKE v_org_b::text || '/%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T2 FAIL: school A sees % school-B objects', v_n; END IF;
  RAISE NOTICE 'T1 OK  own object visible';
  RAISE NOTICE 'T2 OK  school B objects invisible to school A';

  -- ── 3. Insert into school B's folder ─────────────────────────────────────
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('student-documents', v_org_b::text || '/' || v_stu_b::text || '/planted.pdf', v_user);
    RAISE EXCEPTION 'T3 FAIL: school A could write into school B''s folder';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'T3 OK  write into school B folder → 42501';
  END;

  -- ── 4. Delete school B's object ──────────────────────────────────────────
  DELETE FROM storage.objects WHERE bucket_id = 'student-documents' AND name = v_path_b;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T4 FAIL: school A deleted % school-B objects', v_n; END IF;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n FROM storage.objects WHERE name = v_path_b;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T4 FAIL: school B object is gone'; END IF;
  RAISE NOTICE 'T4 OK  school B object cannot be deleted and is intact';

  -- own delete still works
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM storage.objects WHERE bucket_id = 'student-documents' AND name = v_path_a;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T1 FAIL: school A could not delete its own object'; END IF;
  RAISE NOTICE 'T1 OK  own object deletable';

  -- ── 5. No documents permission ───────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', v_claims_noperm, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM storage.objects WHERE bucket_id = 'student-documents';
  EXECUTE 'RESET ROLE';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T5 FAIL: user without permission sees % objects', v_n; END IF;
  RAISE NOTICE 'T5 OK  no documents permission → 0 objects';

  -- ── 6. Anonymous ─────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_n FROM storage.objects WHERE bucket_id = 'student-documents';
  EXECUTE 'RESET ROLE';
  IF v_n <> 0 THEN RAISE EXCEPTION 'T6 FAIL: anon sees % objects', v_n; END IF;
  RAISE NOTICE 'T6 OK  anon → 0 objects';

  -- ── 7. Metadata location constraint ──────────────────────────────────────
  BEGIN
    INSERT INTO public.student_documents (organization_id, student_id, category, file_name, storage_path, storage_bucket, uploaded_by)
    VALUES (v_org_a, v_stu_a, 'other', 'forged.pdf', v_path_b, 'student-documents', v_user);
    RAISE EXCEPTION 'T7 FAIL: metadata row could point at school B''s object';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T7 OK  metadata → other school folder rejected (23514)';
  END;
  BEGIN
    INSERT INTO public.student_documents (organization_id, student_id, category, file_name, storage_path, storage_bucket, uploaded_by)
    VALUES (v_org_a, v_stu_a, 'other', 'x.pdf', v_org_a::text || '/x.pdf', 'regulatory-workflow-documents', v_user);
    RAISE EXCEPTION 'T7 FAIL: metadata row could point at another bucket';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T7 OK  metadata → other bucket rejected (23514)';
  END;
  INSERT INTO public.student_documents (organization_id, student_id, category, file_name, storage_path, storage_bucket, uploaded_by)
  VALUES (v_org_a, v_stu_a, 'other', 'ok.pdf', v_path_a, 'student-documents', v_user);
  RAISE NOTICE 'T7 OK  correct own-folder metadata accepted';

  RAISE NOTICE '═══ student_documents_tenant_isolation: ALL TESTS PASSED ═══';
END;
$test$;

ROLLBACK;
