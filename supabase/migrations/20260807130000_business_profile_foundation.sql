-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260807130000_business_profile_foundation.sql
--
-- EXECUTION DIRECTION CHANGE (2026-08-07): the agreed Business Discovery
-- Onboarding vision (Business Discovery Engine v1/v2, Trafikcloud Business
-- Operating System v3 — published artifacts) has zero implementation today.
-- This migration adds the one piece of new persisted state that whole
-- pipeline is built on: a Business Profile per organization.
--
-- Deliberately minimal for this first slice — the full pipeline (Analysis,
-- Configuration Mapping, Dependency, Provisioning, Validation engines,
-- simulate/commit dual-mode, Tenant Review Screen) is a multi-phase program;
-- this migration only adds the schema foundation plus the one automatic
-- action wired to it in this pass (lesson-type skeleton generation — see
-- the tenant-onboarding Edge Function). Matches the "compute live, don't
-- duplicate" discipline used everywhere else in this codebase's onboarding
-- logic: business_profile.analysis (the archetype classification) is
-- recomputed and overwritten on every save, never a second source of truth.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.business_profile IS
  'Business Discovery Interview answers + the Business Analysis Engine''s '
  'archetype classification (business_profile.analysis). Written only by '
  'the tenant-onboarding Edge Function''s POST /business-profile route. '
  'Shape: { branches, instructors, vehicles, licence_categories, '
  'standard_lesson_duration_minutes, completed_at, '
  'analysis: { archetype, signals, computed_at } }.';
