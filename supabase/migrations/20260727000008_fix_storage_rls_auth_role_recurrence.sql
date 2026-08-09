-- =============================================================================
-- Fix: the auth.role() RLS mismatch bug (originally found and fixed in
-- 20260722000001 for student-documents) recurred TWICE more:
--
--   1. org-branding (20260724000007, 2 days AFTER the original fix) — never
--      caught until now. This is a genuinely live, currently-broken defect:
--      ProdukterSettingsPage.tsx's logo upload (a real, reachable feature)
--      calls supabase.storage.from('org-branding').upload(...) directly from
--      the frontend, which has been silently failing for every organization
--      since that migration shipped. Confirmed broken via a live test before
--      this fix, not assumed.
--   2. regulatory-workflow-documents (20260727000004, this session's own
--      Transportstyrelsen integration work) — caught immediately during this
--      audit's own commissioning verification, before it ever shipped to a
--      real user.
--
-- Root cause restated from 20260722000001: this platform's auth-hook
-- deliberately overwrites the JWT's `role` claim with the tenant's business
-- role (e.g. 'org_owner') rather than preserving GoTrue's 'authenticated'
-- value — the same design every other RLS policy on this platform already
-- accounts for by relying on has_permission() alone. `auth.role() =
-- 'authenticated'` is permanently false for every real user and must never
-- be used in a storage.objects policy on this platform. This migration
-- removes it from both recurrences; no other condition in either policy
-- changes.
-- =============================================================================

-- ── org-branding ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org_branding_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "org_branding_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "org_branding_storage_delete" ON storage.objects;

CREATE POLICY "org_branding_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'org-branding'
    AND public.has_permission('administration:organization:update')
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );

CREATE POLICY "org_branding_storage_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'org-branding'
    AND public.has_permission('administration:organization:update')
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );

CREATE POLICY "org_branding_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'org-branding'
    AND public.has_permission('administration:organization:update')
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );

-- ── regulatory-workflow-documents ────────────────────────────────────────────

DROP POLICY IF EXISTS "regulatory_workflow_documents_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "regulatory_workflow_documents_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "regulatory_workflow_documents_storage_delete" ON storage.objects;

CREATE POLICY "regulatory_workflow_documents_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'regulatory-workflow-documents'
    AND public.has_permission('regulatory:workflow:update')
  );

CREATE POLICY "regulatory_workflow_documents_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'regulatory-workflow-documents'
    AND public.has_permission('regulatory:workflow:read')
  );

CREATE POLICY "regulatory_workflow_documents_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'regulatory-workflow-documents'
    AND public.has_permission('regulatory:workflow:update')
  );
