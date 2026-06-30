-- ─── Student Documents Storage Bucket ────────────────────────────────────────
-- Creates the private Supabase Storage bucket for student document files and
-- sets RLS policies so staff can upload/view their org's documents.
-- The metadata table (student_documents) was created in phase2a_domain_foundation.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-documents',
  'student-documents',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Staff with document:create permission can upload
CREATE POLICY "student_documents_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'student-documents'
    AND auth.role() = 'authenticated'
    AND public.has_permission('documents:document:create')
  );

-- Staff with document:read permission can select/download
CREATE POLICY "student_documents_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'student-documents'
    AND auth.role() = 'authenticated'
    AND public.has_permission('documents:document:read')
  );

-- Staff with document:delete permission can remove files
CREATE POLICY "student_documents_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'student-documents'
    AND auth.role() = 'authenticated'
    AND public.has_permission('documents:document:delete')
  );

