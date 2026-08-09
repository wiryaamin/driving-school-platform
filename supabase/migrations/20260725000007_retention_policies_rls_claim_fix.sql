-- =============================================================================
-- retention_policies — fix RLS checking a JWT path this app never populates
--
-- Found while classifying retention_policies as a configuration-store
-- candidate (Tenant Configuration Store Discovery pass). Reclassified as
-- Reporting / Read-only administration, not Tenant Configuration — it is
-- legally-driven reference data (Bokföringslagen-style retention periods)
-- displayed read-only in DunningPage via useRetentionPolicies(); no write
-- path exists anywhere (only a SELECT policy, no INSERT/UPDATE/DELETE
-- policy at all — writes are platform/compliance-managed).
--
-- The single SELECT policy checked auth.jwt()->'app_metadata'->>'organization_id'
-- — the same defect already found and fixed on student_leads: this app's
-- auth flow never populates a real JWT's app_metadata with organization_id
-- (see 20260725000006's notes). The compliance Edge Function's
-- handleGetRetentionPolicies route uses the anon-key + caller's own
-- Authorization header (not a service-role client), so this table's RLS is
-- the real, live gate — the retention-policies read has been silently
-- returning empty for every org, always, despite the correct
-- finance:compliance:read permission check passing.
--
-- Fix: same minimal correction as every other instance of this bug today —
-- repoint to auth_organization_id(). No write policy is added — none
-- existed before, and none is needed for a read-only reference surface.
-- =============================================================================

DROP POLICY IF EXISTS "retention_policies_select" ON public.retention_policies;

CREATE POLICY "retention_policies_select"
  ON public.retention_policies FOR SELECT
  USING (organization_id = public.auth_organization_id());
