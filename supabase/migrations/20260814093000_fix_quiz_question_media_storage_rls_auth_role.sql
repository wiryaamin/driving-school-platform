-- Fix: the auth.role() RLS mismatch bug (20260722000001, recurred in
-- 20260727000008) recurred a third time in quiz-question-media
-- (20260814090000, same session) — caught live during this feature's own
-- verification, before it shipped to a real user.
--
-- Root cause restated: this platform's auth-hook overwrites the JWT's `role`
-- claim with the tenant's business role (e.g. 'org_owner') rather than
-- preserving GoTrue's 'authenticated' value, so `auth.role() = 'authenticated'`
-- is permanently false for every real user in a storage.objects policy.
-- quiz_questions_tenant_write itself never checks auth.role() or a
-- permission code — org match only — so the storage policies drop the
-- auth.role() clause and stay permission-free too, matching that table's
-- existing posture exactly. No other condition changes.

DROP POLICY IF EXISTS "quiz_question_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "quiz_question_media_update" ON storage.objects;
DROP POLICY IF EXISTS "quiz_question_media_delete" ON storage.objects;

CREATE POLICY "quiz_question_media_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'quiz-question-media'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );

CREATE POLICY "quiz_question_media_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'quiz-question-media'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  )
  WITH CHECK (
    bucket_id = 'quiz-question-media'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );

CREATE POLICY "quiz_question_media_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'quiz-question-media'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );
