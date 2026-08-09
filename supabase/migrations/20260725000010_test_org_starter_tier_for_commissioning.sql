-- =============================================================================
-- Testing-only tier bump for the bootstrap placeholder org
--
-- "Trafikskolan AB" is the sole organization created by
-- supabase/seed/bootstrap_org_admin.sql — a fixed placeholder name, not a
-- real customer (no real customer has gone live on the platform yet). It is
-- currently the only tenant available for hands-on commissioning testing
-- (e.g. verifying Twilio SMS end-to-end through Kanalinställningar), which
-- is gated behind the 'starter' tier by SubscriptionGate/requireFeature.
--
-- In production this field is only ever set by real org provisioning
-- (supabase/functions/platform-admin's provision route) or, in future, a
-- real billing event — there is no app-level "change tier" endpoint for an
-- existing org. This is a one-time, tightly-scoped manual override so the
-- one available test tenant can exercise Starter-gated features during
-- commissioning. Not a schema/business-logic change.
-- =============================================================================

UPDATE public.organizations
SET subscription_tier = 'starter'
WHERE legal_name = 'Trafikskolan AB'
  AND subscription_tier = 'trial'
  AND deleted_at IS NULL;
