-- ---------------------------------------------------------------------------
-- organizations.vat_number was documented as "SE + 10 digits" — the correct
-- Swedish momsregistreringsnummer format is SE + the 10-digit org number +
-- a 2-digit branch suffix (almost always "01") = SE + 12 digits total.
-- Column itself was always a plain text with no length/format constraint;
-- only the descriptive comment was wrong. No data or app-code changes here.
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.organizations.vat_number IS
  'Swedish momsregistreringsnummer. Format: SE + 12 digits (10-digit org number + 2-digit branch suffix, typically "01").';
