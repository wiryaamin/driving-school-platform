-- =============================================================================
-- Fix wrong JWT claim key in 9 Swedish-finance-compliance RLS policies
--
-- While auditing SwedishSettingsPage (apps/web/src/modules/finance/routes/
-- SwedishSettingsPage.tsx) as a Tenant Configuration surface outside the
-- Settings UI, found that organization_swedish_settings' RLS policy reads
-- the JWT claim key 'org_id' — but this schema's actual claim (built by
-- get_user_jwt_claims(), used by auth_organization_id() everywhere else)
-- is named 'organization_id'. Since 'org_id' never exists in any real JWT,
-- the policy's NULL::uuid = organization_id comparison never matches —
-- every query against this table is silently denied by RLS, for every org,
-- regardless of role. Confirmed live: organization_swedish_settings has
-- zero rows in the hosted database — no user has ever been able to save
-- through this page.
--
-- The swedish-settings Edge Function calls this table using the anon key
-- plus the caller's own Authorization header (not a service-role client),
-- so it is fully subject to this broken RLS — this is not a masked/inert
-- bug, it is the actual, current, broken behavior.
--
-- A search for the same broken claim key across the schema found 8 more
-- tables from the same compliance migration batch with the identical bug:
-- fortnox_customer_sync, fortnox_export_lineage, fortnox_invoice_sync,
-- fortnox_payment_sync, invoice_ocr_references, sie4_exports, vat_periods,
-- vat_report_entries. Same root cause, same fix — corrected together rather
-- than piecemeal, since leaving known-broken tenant isolation in place on
-- sibling compliance tables after finding the pattern would be negligent.
--
-- Fix: replace the broken raw-claim expression with auth_organization_id(),
-- the existing, correctly NULL-guarded helper already used by every other
-- table in this schema. No other change — same FOR ALL / FOR SELECT scope,
-- same policy names, same permissive mode, exactly as before.
-- =============================================================================

DROP POLICY IF EXISTS "fortnox_customer_sync_org_isolation" ON public.fortnox_customer_sync;
CREATE POLICY "fortnox_customer_sync_org_isolation"
  ON public.fortnox_customer_sync FOR ALL
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "fortnox_export_lineage_org_isolation" ON public.fortnox_export_lineage;
CREATE POLICY "fortnox_export_lineage_org_isolation"
  ON public.fortnox_export_lineage FOR ALL
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "fortnox_invoice_sync_org_isolation" ON public.fortnox_invoice_sync;
CREATE POLICY "fortnox_invoice_sync_org_isolation"
  ON public.fortnox_invoice_sync FOR ALL
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "fortnox_payment_sync_org_isolation" ON public.fortnox_payment_sync;
CREATE POLICY "fortnox_payment_sync_org_isolation"
  ON public.fortnox_payment_sync FOR ALL
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "invoice_ocr_org_isolation" ON public.invoice_ocr_references;
CREATE POLICY "invoice_ocr_org_isolation"
  ON public.invoice_ocr_references FOR ALL
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "swedish_settings_org_isolation" ON public.organization_swedish_settings;
CREATE POLICY "swedish_settings_org_isolation"
  ON public.organization_swedish_settings FOR ALL
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "sie4_exports_org_isolation" ON public.sie4_exports;
CREATE POLICY "sie4_exports_org_isolation"
  ON public.sie4_exports FOR SELECT
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "vat_periods_org_isolation" ON public.vat_periods;
CREATE POLICY "vat_periods_org_isolation"
  ON public.vat_periods FOR ALL
  USING (organization_id = public.auth_organization_id());

DROP POLICY IF EXISTS "vat_report_entries_org_isolation" ON public.vat_report_entries;
CREATE POLICY "vat_report_entries_org_isolation"
  ON public.vat_report_entries FOR ALL
  USING (organization_id = public.auth_organization_id());
