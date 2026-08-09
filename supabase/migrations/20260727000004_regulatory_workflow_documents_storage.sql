-- ─── Regulatory Workflow Documents Storage Bucket ────────────────────────────
-- Same pattern as 20260622000002_student_documents_storage.sql, for the
-- regulatory_workflow_documents metadata table (20260727000003).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'regulatory-workflow-documents',
  'regulatory-workflow-documents',
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

CREATE POLICY "regulatory_workflow_documents_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'regulatory-workflow-documents'
    AND auth.role() = 'authenticated'
    AND public.has_permission('regulatory:workflow:update')
  );

CREATE POLICY "regulatory_workflow_documents_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'regulatory-workflow-documents'
    AND auth.role() = 'authenticated'
    AND public.has_permission('regulatory:workflow:read')
  );

CREATE POLICY "regulatory_workflow_documents_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'regulatory-workflow-documents'
    AND auth.role() = 'authenticated'
    AND public.has_permission('regulatory:workflow:update')
  );
