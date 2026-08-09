-- ---------------------------------------------------------------------------
-- The Ekonomiinställningar → Betalningsinformation/Fakturainställningar form
-- (SwedishSettingsPage.tsx) sends bank_name, bank_account_number,
-- bank_clearing_number, default_vat_rate, invoice_payment_terms, and
-- autogiro_enabled — none of which exist as columns on
-- organization_swedish_settings. The swedish-settings Edge Function's PUT
-- handler upserts the request body directly, so saving errored with
-- "column ... does not exist" (surfaced to the user as a generic 500 /
-- FunctionsHttpError). The form's own copy already documents these as
-- saved-but-not-yet-consumed-elsewhere fields, so the fix is to actually
-- give them somewhere to persist, matching that stated intent.
-- ---------------------------------------------------------------------------

ALTER TABLE public.organization_swedish_settings
  ADD COLUMN IF NOT EXISTS bank_name             text,
  ADD COLUMN IF NOT EXISTS bank_account_number    text,
  ADD COLUMN IF NOT EXISTS bank_clearing_number   text,
  ADD COLUMN IF NOT EXISTS default_vat_rate       numeric(5,2) NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS invoice_payment_terms  text,
  ADD COLUMN IF NOT EXISTS autogiro_enabled       boolean      NOT NULL DEFAULT false;

ALTER TABLE public.organization_swedish_settings
  ADD CONSTRAINT swedish_settings_default_vat_rate_valid
    CHECK (default_vat_rate >= 0 AND default_vat_rate <= 100);

COMMENT ON COLUMN public.organization_swedish_settings.default_vat_rate IS
  'Default VAT percentage (0-100) shown in Ekonomiinställningar. Not yet read by the invoice line-item creation flow, which still hardcodes 25% — see form copy.';
COMMENT ON COLUMN public.organization_swedish_settings.invoice_payment_terms IS
  'Free-text payment terms (e.g. "30 dagar netto") shown in Ekonomiinställningar, saved as reference only — distinct from invoice_payment_days, which is not yet wired to this form.';
