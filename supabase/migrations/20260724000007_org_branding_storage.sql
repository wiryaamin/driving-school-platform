-- ─── Organization Branding Assets Storage Bucket ─────────────────────────────
-- Backs the logo/image upload slots on Settings → Webbplats → Varumärke and
-- the invoice logo on Settings → Ekonomi → Kassa, both of which previously
-- rendered fully interactive-looking upload dropzones and Spara buttons with
-- no onChange/onClick handlers at all — decorative UI, zero backend.
--
-- Public (unlike student-documents): these assets are displayed on the
-- public website, student portal, and invoices/OG previews, so they must be
-- fetchable without auth via their public URL. Mutations are still RLS-gated
-- and path-namespaced per organization_id to prevent cross-tenant writes.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-branding',
  'org-branding',
  true,
  5242880, -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {organization_id}/{asset_key}.{ext} — the leading path
-- segment is checked against the caller's own org, same pattern as
-- student-documents' storage_path but enforced here at the RLS layer since
-- there's no metadata table to gate through.

CREATE POLICY "org_branding_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'org-branding'
    AND auth.role() = 'authenticated'
    AND public.has_permission('administration:organization:update')
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );

CREATE POLICY "org_branding_storage_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'org-branding'
    AND auth.role() = 'authenticated'
    AND public.has_permission('administration:organization:update')
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );

CREATE POLICY "org_branding_storage_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'org-branding'
    AND auth.role() = 'authenticated'
    AND public.has_permission('administration:organization:update')
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
  );

-- Public bucket: reads happen via the public URL and bypass storage.objects
-- RLS entirely, but an explicit SELECT policy is still added for
-- authenticated management UI (listing current files in Settings).
CREATE POLICY "org_branding_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-branding');
