-- ════════════════════════════════════════════════════════════════════════════
-- Package Builder — commercial fields (compare-at pricing, marketing badges).
--
-- Package "contents" (multiple service types in one package) already has a
-- real, working mechanism — bundle_credits jsonb, validated by
-- CreatePackageOfferingSchema and consumed by purchase_package's bundle-grant
-- step (20260720000006_sync_purchase_package_to_assignments.sql) — it was
-- simply never exposed in the create/edit form. No schema change needed for
-- that piece; only the two genuinely new fields below.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE package_offerings
  ADD COLUMN compare_at_price  numeric(12,2) CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  ADD COLUMN included_items    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN marketing_badges  text[] NOT NULL DEFAULT '{}';

ALTER TABLE package_offerings
  ADD CONSTRAINT package_offerings_marketing_badges_check
  CHECK (marketing_badges <@ ARRAY['featured','best_seller','new','campaign','limited_offer','recommended']::text[]);

COMMENT ON COLUMN package_offerings.compare_at_price IS
  'Optional "was" price (ex VAT) for a simple was/now display without needing a full time-bound Campaign. Only shown on public pages when no active campaign already provides a discounted price for this package.';
COMMENT ON COLUMN package_offerings.included_items IS
  'Free-text descriptive inclusions shown as package highlights (e.g. "Digitalt teorimaterial", "Fordonshyra vid uppkörning") — display only, not tied to the credit-ledger/booking system the way bundle_credits is.';

-- Backfill: existing featured packages keep showing as featured once the
-- frontend switches to reading marketing_badges instead of the standalone
-- boolean (which stays untouched for any other code still reading it).
UPDATE package_offerings SET marketing_badges = ARRAY['featured'] WHERE featured = true;
