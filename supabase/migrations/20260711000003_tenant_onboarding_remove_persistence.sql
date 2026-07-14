-- =============================================================================
-- Tenant Onboarding — remove unnecessary progress-persistence table
--
-- Architecture review (Customer Provisioning & Tenant Onboarding Architecture,
-- second refinement note, Section 17) determined that Staff Invitations and
-- Data Migration are optional business capabilities ("Recommended
-- Configuration"), not gated workflow steps ("Go Live Readiness
-- Requirements") — so neither ever needed an explicit "skipped" decision
-- recorded in the first place. Every step's status is now derived live from
-- the module that already owns it. Tenant Onboarding persists exactly one
-- thing in the entire capability: the Go Live event on organizations
-- (go_live_at / go_live_approved_by, added by migration
-- 20260711000002_tenant_onboarding.sql and kept — that part of the design
-- was independently justified and is unaffected by this correction).
--
-- DROP TABLE cascades to its own triggers, indexes, and RLS policies —
-- nothing else references this table.
-- =============================================================================

DROP TABLE IF EXISTS public.tenant_onboarding_confirmations;
