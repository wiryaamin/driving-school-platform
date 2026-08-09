-- Fix: Storage RLS policies on storage.objects (student-documents bucket) included
-- an `auth.role() = 'authenticated'` check that is permanently false for every real
-- user. This project's auth-hook (supabase/functions/auth-hook/index.ts) deliberately
-- overwrites the JWT's `role` claim with the tenant's business role (e.g. 'org_owner',
-- 'receptionist') rather than preserving GoTrue's 'authenticated' value — the same
-- design used consistently by every other RLS policy in this schema, none of which
-- check auth.role() (they rely on has_permission() + organization_id matching only).
-- Storage's policies were the only ones never updated to match, blocking all uploads.

DROP POLICY IF EXISTS student_documents_storage_insert ON storage.objects;
DROP POLICY IF EXISTS student_documents_storage_select ON storage.objects;
DROP POLICY IF EXISTS student_documents_storage_delete ON storage.objects;

CREATE POLICY student_documents_storage_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'student-documents'
    AND has_permission('documents:document:create')
  );

CREATE POLICY student_documents_storage_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'student-documents'
    AND has_permission('documents:document:read')
  );

CREATE POLICY student_documents_storage_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'student-documents'
    AND has_permission('documents:document:delete')
  );
