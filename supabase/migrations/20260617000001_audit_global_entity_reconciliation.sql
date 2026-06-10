-- =============================================================================
-- MIGRATION: 20260617000001_audit_global_entity_reconciliation.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     Bootstrap Infrastructure Reconciliation
-- Description:
--   Reconciles audit_logs with the global-identity architecture introduced in
--   20260527000002_phase1b2_hardening.sql.
--
--   Problem:
--     Phase 1B.2 refactored profiles into global identities (no organization_id).
--     The audit trigger for profiles uses the '__jwt__' sentinel, which resolves
--     organization_id from the current JWT via auth_organization_id().
--     When called from service-role context (migrations, bootstrap SQL, Studio SQL
--     Editor), there is no JWT and auth_organization_id() returns NULL.
--     audit_logs.organization_id was NOT NULL → constraint violation.
--
--   Fix:
--     Make audit_logs.organization_id nullable.
--     - NULL correctly represents "global entity, no tenant context".
--     - All tenant-scoped entity triggers continue to supply non-null org_id.
--     - Finance, scheduling, and compliance audit records are unaffected.
--     - The existing "no FK" design comment already anticipated loose coupling.
--     - No change to audit_trigger_fn, bootstrap SQL, or any other object.
--
--   Design principle:
--     Global entities (profiles, platform_admins) are legitimately tenant-less.
--     Auditing them with NULL organization_id preserves the full audit record
--     including actor_id, entity_id, operation, and row snapshots — everything
--     needed for traceability — while correctly reflecting the absence of a
--     tenant context.
-- =============================================================================

-- Allow NULL organization_id for global-entity audit records.
-- Tenant-scoped triggers continue to supply a non-null value.
ALTER TABLE public.audit_logs
  ALTER COLUMN organization_id DROP NOT NULL;

COMMENT ON COLUMN public.audit_logs.organization_id IS
  'NULL for global entities (profiles, platform_admins) audited without tenant '
  'context (service-role operations, bootstrap). Non-null for all tenant-scoped '
  'entity changes. No FK constraint — audit records must outlive organizations.';
