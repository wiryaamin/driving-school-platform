-- rc1: WP3 — Persist 5 fields previously accepted by the UI but silently discarded.
-- All columns nullable; has_debt_collection defaults false for existing rows.

ALTER TABLE public.corporate_customers
  ADD COLUMN IF NOT EXISTS alt_name             text,
  ADD COLUMN IF NOT EXISTS default_discount_pct numeric(5,2)
      CONSTRAINT corporate_customers_discount_range
        CHECK (default_discount_pct IS NULL
           OR (default_discount_pct >= 0 AND default_discount_pct <= 100)),
  ADD COLUMN IF NOT EXISTS payment_terms_days   integer
      CONSTRAINT corporate_customers_payment_terms_positive
        CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0),
  ADD COLUMN IF NOT EXISTS economy_notes        text,
  ADD COLUMN IF NOT EXISTS has_debt_collection  boolean NOT NULL DEFAULT false;
