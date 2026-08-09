-- =============================================================================
-- package_offerings — Presentation Attributes for Produkter Settings
--
-- Settings → Ekonomi → Produkter shipped querying a nonexistent `products`
-- table. package_offerings (Phase 4A) is the real, already-populated,
-- canonical sellable-offering domain (name, price, lesson_category, VAT,
-- validity) — per explicit direction, Produkter becomes the first admin UI
-- for package_offerings rather than a parallel products table. It needs a
-- few presentation-layer attributes package_offerings didn't have yet:
-- a customer-facing name distinct from the internal one, an image, and a
-- webshop-visibility flag. Extending, not duplicating.
-- =============================================================================

ALTER TABLE public.package_offerings
  ADD COLUMN external_name    text,
  ADD COLUMN image_url        text,
  ADD COLUMN ecommerce_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.package_offerings.external_name IS
  'Customer-facing name shown in the webshop/checkout. Falls back to name if not set.';
COMMENT ON COLUMN public.package_offerings.image_url IS
  'Public image URL for webshop/catalog display (org-branding storage bucket or external).';
COMMENT ON COLUMN public.package_offerings.ecommerce_active IS
  'Whether this offering is visible/purchasable in the public e-commerce catalog.';
