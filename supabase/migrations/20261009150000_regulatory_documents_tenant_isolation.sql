-- ─── Regulatory workflow documents: tenant isolation for stored files ────────
--
-- Security fix, same defect class as 20261009140000 (student-documents).
-- The storage.objects policies for 'regulatory-workflow-documents' (last
-- redefined in 20260727000008) only checked the bucket and a regulatory
-- permission, never the organisation folder. Any staff user holding
-- regulatory:workflow:read / :update in school A could list, sign/download,
-- upload into and delete school B's regulatory files.
--
-- Object paths are '<organization_id>/<workflow_id>/<timestamp>-<file name>'
-- (useRegulatoryWorkflows.ts). Ownership model = the metadata table
-- regulatory_workflow_documents (20260727000003): own organisation with the
-- regulatory permission. Platform Admin JWTs carry an empty permissions list
-- (get_user_jwt_claims), so platform admins had no storage access to this
-- bucket before and have none after — unchanged.
--
-- INSERT/SELECT/DELETE now require the first folder to be the caller's
-- organisation. No UPDATE policy exists and none is added. Production holds
-- 0 objects and 0 metadata rows in this bucket when written.

DROP POLICY IF EXISTS regulatory_workflow_documents_storage_insert ON storage.objects;
DROP POLICY IF EXISTS regulatory_workflow_documents_storage_select ON storage.objects;
DROP POLICY IF EXISTS regulatory_workflow_documents_storage_delete ON storage.objects;

CREATE POLICY regulatory_workflow_documents_storage_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'regulatory-workflow-documents'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
    AND public.has_permission('regulatory:workflow:update')
  );

CREATE POLICY regulatory_workflow_documents_storage_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'regulatory-workflow-documents'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
    AND public.has_permission('regulatory:workflow:read')
  );

CREATE POLICY regulatory_workflow_documents_storage_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'regulatory-workflow-documents'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
    AND public.has_permission('regulatory:workflow:update')
  );
