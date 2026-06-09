-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260605000006_phase4g_indexes.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4G — Fixed Assets, Accruals & Advanced Accounting (Indexes)
--
-- Performance indexes on all Phase 4G tables:
--   fixed_asset_classes, fixed_assets, asset_disposals
--   depreciation_schedules
--   accrual_schedules, accrual_release_lines
--   periodic_deferred_schedules, periodic_deferred_lines
--   close_dependency_validations, accounting_replay_runs, canonical_accounting_exports
-- ════════════════════════════════════════════════════════════════════════════

-- ── fixed_asset_classes ───────────────────────────────────────────────────────
CREATE INDEX idx_fac_active
  ON public.fixed_asset_classes (is_active)
  WHERE is_active = true;

-- ── fixed_assets ─────────────────────────────────────────────────────────────
CREATE INDEX idx_fa_org
  ON public.fixed_assets (organization_id);

CREATE INDEX idx_fa_org_status
  ON public.fixed_assets (organization_id, status);

CREATE INDEX idx_fa_org_class
  ON public.fixed_assets (organization_id, asset_class_id);

CREATE INDEX idx_fa_org_period
  ON public.fixed_assets (organization_id, financial_period_id)
  WHERE financial_period_id IS NOT NULL;

-- Partial: active/impaired assets needing depreciation
CREATE INDEX idx_fa_active_depreciable
  ON public.fixed_assets (organization_id, last_depreciation_date)
  WHERE status IN ('active', 'impaired');

CREATE INDEX idx_fa_acquisition_date
  ON public.fixed_assets (organization_id, acquisition_date DESC);

-- ── asset_disposals ───────────────────────────────────────────────────────────
CREATE INDEX idx_ad_org
  ON public.asset_disposals (organization_id);

CREATE INDEX idx_ad_asset
  ON public.asset_disposals (asset_id);

CREATE INDEX idx_ad_org_date
  ON public.asset_disposals (organization_id, disposal_date DESC);

CREATE INDEX idx_ad_disposal_type
  ON public.asset_disposals (organization_id, disposal_type);

-- ── depreciation_schedules ────────────────────────────────────────────────────
CREATE INDEX idx_ds_asset
  ON public.depreciation_schedules (asset_id);

CREATE INDEX idx_ds_org
  ON public.depreciation_schedules (organization_id);

-- Partial: unposted lines (most frequent query target)
CREATE INDEX idx_ds_asset_unposted
  ON public.depreciation_schedules (asset_id, period_number)
  WHERE is_posted = false;

CREATE INDEX idx_ds_org_schedule_date
  ON public.depreciation_schedules (organization_id, schedule_date);

CREATE INDEX idx_ds_journal_entry
  ON public.depreciation_schedules (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

-- ── accrual_schedules ─────────────────────────────────────────────────────────
CREATE INDEX idx_as_org
  ON public.accrual_schedules (organization_id);

CREATE INDEX idx_as_org_status
  ON public.accrual_schedules (organization_id, status);

CREATE INDEX idx_as_org_type
  ON public.accrual_schedules (organization_id, accrual_type);

CREATE INDEX idx_as_org_period
  ON public.accrual_schedules (organization_id, financial_period_id)
  WHERE financial_period_id IS NOT NULL;

-- Partial: active schedules (most frequently queried)
CREATE INDEX idx_as_org_active
  ON public.accrual_schedules (organization_id, start_date)
  WHERE status = 'active';

-- ── accrual_release_lines ─────────────────────────────────────────────────────
CREATE INDEX idx_arl_schedule
  ON public.accrual_release_lines (accrual_schedule_id);

CREATE INDEX idx_arl_org
  ON public.accrual_release_lines (organization_id);

-- Partial: unposted, uncancelled lines (query target for post_accrual_release)
CREATE INDEX idx_arl_schedule_pending
  ON public.accrual_release_lines (accrual_schedule_id, period_number)
  WHERE is_posted = false AND is_cancelled = false;

CREATE INDEX idx_arl_release_date
  ON public.accrual_release_lines (organization_id, release_date);

-- ── periodic_deferred_schedules ───────────────────────────────────────────────
CREATE INDEX idx_pds_org
  ON public.periodic_deferred_schedules (organization_id);

CREATE INDEX idx_pds_org_source
  ON public.periodic_deferred_schedules (organization_id, source_type, source_id);

CREATE INDEX idx_pds_org_released
  ON public.periodic_deferred_schedules (organization_id, is_fully_released);

-- Partial: not fully released (active schedules)
CREATE INDEX idx_pds_org_active
  ON public.periodic_deferred_schedules (organization_id, start_date)
  WHERE is_fully_released = false;

CREATE INDEX idx_pds_deferral_account
  ON public.periodic_deferred_schedules (organization_id, deferral_account);

-- ── periodic_deferred_lines ───────────────────────────────────────────────────
CREATE INDEX idx_pdl_schedule
  ON public.periodic_deferred_lines (schedule_id);

CREATE INDEX idx_pdl_org
  ON public.periodic_deferred_lines (organization_id);

-- Partial: unposted lines
CREATE INDEX idx_pdl_schedule_unposted
  ON public.periodic_deferred_lines (schedule_id, period_number)
  WHERE is_posted = false;

CREATE INDEX idx_pdl_release_date
  ON public.periodic_deferred_lines (organization_id, release_date);

-- ── close_dependency_validations ─────────────────────────────────────────────
CREATE INDEX idx_cdv_org
  ON public.close_dependency_validations (organization_id);

CREATE INDEX idx_cdv_period
  ON public.close_dependency_validations (period_id);

CREATE INDEX idx_cdv_period_date
  ON public.close_dependency_validations (period_id, validated_at DESC);

-- ── accounting_replay_runs ────────────────────────────────────────────────────
CREATE INDEX idx_arr_org
  ON public.accounting_replay_runs (organization_id);

CREATE INDEX idx_arr_period
  ON public.accounting_replay_runs (period_id);

CREATE INDEX idx_arr_period_date
  ON public.accounting_replay_runs (period_id, run_at DESC);

CREATE INDEX idx_arr_org_status
  ON public.accounting_replay_runs (organization_id, status);

-- ── canonical_accounting_exports ─────────────────────────────────────────────
CREATE INDEX idx_cae_org
  ON public.canonical_accounting_exports (organization_id);

CREATE INDEX idx_cae_period
  ON public.canonical_accounting_exports (period_id);

-- One canonical export per period per org (for lookups)
CREATE UNIQUE INDEX idx_cae_org_period_unique
  ON public.canonical_accounting_exports (organization_id, period_id);
