-- ─── Corporate customer documents ────────────────────────────────────────────
-- Företagskundens Dokument-flik var en statisk attrapp utan lagring. Den här
-- migrationen ger företagskunder samma dokumenthantering som elever:
-- metadata i corporate_customer_documents + filer i en privat bucket.
--
-- Isolering: varje rad och varje fil tillhör en organisation. Filer lagras under
-- '<organization_id>/<corporate_customer_id>/<uuid>.<ext>' och storage-policyerna
-- kräver att första mappen är användarens egen organisation (utöver behörighet).
-- Ingen auth.role()-kontroll — se 20260722000001 för varför den alltid är falsk här.

CREATE TABLE IF NOT EXISTS public.corporate_customer_documents (
  id                     uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id        uuid         NOT NULL,
  corporate_customer_id  uuid         NOT NULL,
  file_name              text         NOT NULL,
  storage_path           text         NOT NULL,
  mime_type              text,
  file_size_bytes        bigint,
  description            text,
  uploaded_by            uuid         NOT NULL DEFAULT auth.uid(),
  deleted_at             timestamptz,
  deleted_by             uuid,
  created_at             timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT corporate_customer_documents_pkey PRIMARY KEY (id),
  CONSTRAINT corporate_customer_documents_org_fkey FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT corporate_customer_documents_customer_fkey FOREIGN KEY (corporate_customer_id)
    REFERENCES public.corporate_customers(id) ON DELETE RESTRICT,
  CONSTRAINT corporate_customer_documents_path_key UNIQUE (storage_path),
  CONSTRAINT corporate_customer_documents_name_len CHECK (char_length(file_name) BETWEEN 1 AND 255),
  CONSTRAINT corporate_customer_documents_size CHECK (file_size_bytes IS NULL OR (file_size_bytes >= 0 AND file_size_bytes <= 52428800)),
  CONSTRAINT corporate_customer_documents_path_org CHECK (split_part(storage_path, '/', 1) = organization_id::text)
);

CREATE INDEX IF NOT EXISTS corporate_customer_documents_customer_idx
  ON public.corporate_customer_documents (organization_id, corporate_customer_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.corporate_customer_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY corporate_customer_documents_select_staff
  ON public.corporate_customer_documents FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('documents:document:read')
  );

CREATE POLICY corporate_customer_documents_select_platform
  ON public.corporate_customer_documents FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY corporate_customer_documents_insert
  ON public.corporate_customer_documents FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('documents:document:create')
    AND EXISTS (
      SELECT 1 FROM public.corporate_customers c
      WHERE c.id = corporate_customer_id
        AND c.organization_id = corporate_customer_documents.organization_id
    )
  );

-- Enda tillåtna ändringen är mjuk borttagning (deleted_at/deleted_by).
CREATE POLICY corporate_customer_documents_soft_delete
  ON public.corporate_customer_documents FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('documents:document:delete')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('documents:document:delete')
  );

GRANT SELECT, INSERT ON public.corporate_customer_documents TO authenticated;
GRANT UPDATE (deleted_at, deleted_by) ON public.corporate_customer_documents TO authenticated;

-- ─── Storage bucket ──────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'corporate-documents',
  'corporate-documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY corporate_documents_storage_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'corporate-documents'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
    AND public.has_permission('documents:document:create')
  );

CREATE POLICY corporate_documents_storage_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'corporate-documents'
    AND (storage.foldername(name))[1] = public.auth_organization_id()::text
    AND public.has_permission('documents:document:read')
  );
