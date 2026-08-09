-- =============================================================================
-- Articles — Individually Sellable Line Items
--
-- Settings → Ekonomi → Artiklar shipped querying a nonexistent `articles`
-- table. Distinct from package_offerings (bundled lesson credits): articles
-- are standalone sellable items — exam fees, protective gear, materials —
-- addable directly to an invoice/kassa line without going through the
-- credit/package system. Genuinely no existing table or counterpart
-- anywhere in the codebase; new table, not an extension.
-- =============================================================================

CREATE TABLE public.articles (
  id               uuid           NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid           NOT NULL,
  article_number   text           NOT NULL,
  name             text           NOT NULL,
  price_incl_vat   numeric(12,2)  NOT NULL DEFAULT 0 CHECK (price_incl_vat >= 0),
  vat_percent      numeric(5,2)   NOT NULL DEFAULT 25 CHECK (vat_percent >= 0 AND vat_percent <= 100),
  article_type     text           NOT NULL DEFAULT 'product',
  lesson_type      text,
  is_active        boolean        NOT NULL DEFAULT true,
  sort_order       integer        NOT NULL DEFAULT 0,
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now(),
  created_by       uuid           REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by       uuid           REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT articles_pkey             PRIMARY KEY (id),
  CONSTRAINT articles_org_fkey         FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT articles_org_number_uniq  UNIQUE (organization_id, article_number),
  CONSTRAINT articles_type_check       CHECK (article_type IN ('product', 'service', 'fee'))
);

COMMENT ON TABLE public.articles IS
  'Tenant-owned, individually sellable line items (exam fees, protective gear, materials) — distinct from package_offerings (bundled lesson credits).';
COMMENT ON COLUMN public.articles.lesson_type IS
  'Free-text optional association with a lesson type context (e.g. which course an exam fee belongs to). Not a FK — articles can exist independent of scheduling.';

CREATE INDEX articles_org_id_idx     ON public.articles (organization_id);
CREATE INDEX articles_org_active_idx ON public.articles (organization_id, is_active);

CREATE TRIGGER articles_set_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER articles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Reuses the package permission surface (same domain: sellable commercial
-- catalog items) rather than introducing a new permission.
CREATE POLICY "articles_select"
  ON public.articles FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:package:read')
  );

CREATE POLICY "articles_select_platform"
  ON public.articles FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "articles_insert"
  ON public.articles FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:package:create')
  );

CREATE POLICY "articles_update"
  ON public.articles FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:package:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:package:update')
  );

GRANT SELECT, INSERT, UPDATE ON public.articles TO authenticated, service_role;
