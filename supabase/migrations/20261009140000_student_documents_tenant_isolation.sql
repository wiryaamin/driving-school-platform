-- ─── Student documents: tenant isolation for stored files ────────────────────
--
-- Security fix. The storage.objects policies for the 'student-documents'
-- bucket (last redefined in 20260727000008) only checked the bucket and a
-- permission. They never checked that the object lives in the caller's own
-- organisation folder, so any staff user holding documents:document:read /
-- :delete in school A could list every school's folder in the bucket, create
-- signed URLs for, download, and delete school B's files. (UI and metadata RLS
-- were org-scoped; the files themselves were not.)
--
-- Object paths are '<organization_id>/<student_id>/<uuid>.<ext>' (useDocuments.ts
-- and StudentDetailPage.tsx). Fix, same pattern as org-branding / quiz media:
--   1. All three storage policies additionally require the first folder to be
--      the caller's organisation (auth_organization_id()).
--   2. student_documents rows must point into the student-documents bucket and
--      their own organisation's folder. The student/guardian portals sign URLs
--      with the service role from these rows, so a row must never be able to
--      reference another school's (or another bucket's) object.
-- No UPDATE policy exists and none is added (no overwrite/move of objects).
-- Service-role callers (portal Edge Functions) are unaffected by RLS.

DROP POLICY IF EXISTS student_documents_storage_insert ON storage.objects;
DROP POLICY IF EXISTS student_documents_storage_select ON storage.objects;
DROP POLICY IF EXISTS student_documents_storage_delete ON storage.objects;

CREATE POLICY student_documents_storage_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
    AND public.has_permission('documents:document:create')
  );

CREATE POLICY student_documents_storage_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
    AND public.has_permission('documents:document:read')
  );

CREATE POLICY student_documents_storage_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
    AND public.has_permission('documents:document:delete')
  );

ALTER TABLE public.student_documents
  ADD CONSTRAINT student_documents_storage_location_check
  CHECK (
    storage_bucket = 'student-documents'
    AND split_part(storage_path, '/', 1) = organization_id::text
  );
