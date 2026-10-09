-- ─── Artikelregister: behörighet per artikel ─────────────────────────────────
-- Artikelregistret (Ekonomi → Artikelregister) ska kunna snabbskapa och filtrera
-- artiklar per behörighet (B, A, C …). Ny valfri kolumn; befintliga artiklar
-- påverkas inte (NULL = gäller alla behörigheter).

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS licence_category text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.articles'::regclass AND conname = 'articles_licence_category_check'
  ) THEN
    ALTER TABLE public.articles
      ADD CONSTRAINT articles_licence_category_check
      CHECK (licence_category IS NULL OR licence_category ~ '^[A-Z0-9-]{1,10}$');
  END IF;
END $$;

COMMENT ON COLUMN public.articles.licence_category IS
  'Behörighet som artikeln avser (t.ex. B, BE, A, C). NULL = gäller alla.';
