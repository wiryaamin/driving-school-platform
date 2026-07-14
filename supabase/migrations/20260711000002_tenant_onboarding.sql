-- =============================================================================
-- Tenant Onboarding — orchestration-layer progress state
--
-- Implements Customer Provisioning & Tenant Onboarding Architecture, Section 8
-- (Tenant Onboarding Architecture) and Section 9 (Business Capability Mapping).
--
-- Design constraint (Architecture Section 25, Single Source of Truth): this
-- orchestration layer never stores a second copy of any module's underlying
-- data. Eight of the ten Section 8 steps are derived live, at read time, from
-- tables that already exist (organizations, organization_locations,
-- slot_templates, lesson_types, vehicles, instructors, bas_account_catalog
-- seeding, vat_periods, channel_configs) — nothing here duplicates them.
--
-- What IS new, and why: four of Section 8's steps require an explicit human
-- decision with no existing column to record it (Locations "explicitly
-- confirmed", Staff Invitations "explicitly skipped", Data Migration
-- "explicit start fresh", Communication "reviewed at least once") — plus the
-- Verification and Go Live steps, which Section 9 itself names as the only
-- genuinely new engineering this architecture requires. This migration adds
-- exactly that: one small confirmation-log table for the four explicit
-- per-step decisions, and two columns on organizations for the Go Live gate
-- (mirroring the existing demo_requests.converted_at / converted_by pattern
-- already used for the Convert-to-Customer gate).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- organizations: Go Live gate (Architecture Section 17)
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN go_live_at          timestamptz,
  ADD COLUMN go_live_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.organizations.go_live_at IS
  'Set once, by the Go Live Approval action (Customer Provisioning & Tenant Onboarding Architecture, Section 17). NULL means the tenant is still in Tenant Onboarding.';
COMMENT ON COLUMN public.organizations.go_live_approved_by IS
  'Platform Administrator who performed the Go Live Approval action. NULL until go_live_at is set.';

-- ---------------------------------------------------------------------------
-- tenant_onboarding_confirmations
-- One row per (organization, step) — only for the steps whose completion
-- criterion is an explicit human decision, not a derivable count. Every
-- other Section 8 step is computed live and stored nowhere.
-- ---------------------------------------------------------------------------
CREATE TABLE public.tenant_onboarding_confirmations (
  id               uuid          NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL,
  step_key         text          NOT NULL,
  status           text          NOT NULL,
  note             text,
  actor_id         uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT tenant_onboarding_confirmations_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_onboarding_confirmations_org_fkey FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT tenant_onboarding_confirmations_step_key_chk CHECK (
    step_key IN ('locations', 'staff_invitations', 'data_migration', 'communication_configuration')
  ),
  CONSTRAINT tenant_onboarding_confirmations_status_chk CHECK (
    status IN ('confirmed', 'skipped')
  )
);

CREATE UNIQUE INDEX tenant_onboarding_confirmations_org_step
  ON public.tenant_onboarding_confirmations (organization_id, step_key);

COMMENT ON TABLE public.tenant_onboarding_confirmations IS
  'Explicit per-step human decisions during Tenant Onboarding that have no existing column to record them (Architecture Section 8). Never a second copy of any module''s own data — only the fact that a tenant admin confirmed or skipped a step.';
COMMENT ON COLUMN public.tenant_onboarding_confirmations.step_key IS
  'One of: locations, staff_invitations, data_migration, communication_configuration. The other six Section 8 steps are derived live and never persisted here.';

CREATE TRIGGER tenant_onboarding_confirmations_set_updated_at
  BEFORE UPDATE ON public.tenant_onboarding_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER tenant_onboarding_confirmations_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.tenant_onboarding_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE INDEX tenant_onboarding_confirmations_org_idx
  ON public.tenant_onboarding_confirmations (organization_id);

-- ---------------------------------------------------------------------------
-- RLS
-- Mirrors organization_locations' policy shape exactly (enterprise_foundation.sql):
-- org members read their own org's rows, platform admins read all; writes
-- require administration:organization:update — the existing permission this
-- action reuses rather than a new onboarding-specific permission code (per
-- Development & Implementation Playbook Section 1, "reuse before create").
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_onboarding_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_onboarding_confirmations_select_own"
  ON public.tenant_onboarding_confirmations FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "tenant_onboarding_confirmations_insert_admin"
  ON public.tenant_onboarding_confirmations FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:organization:update')
  );

CREATE POLICY "tenant_onboarding_confirmations_update_admin"
  ON public.tenant_onboarding_confirmations FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:organization:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:organization:update')
  );
