-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260606000006_phase4h_indexes.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H — Performance Indexes
--
-- Adds B-tree and partial indexes across all 10 Phase 4H tables.
-- Critical indexes:
--   • ledger_replay_runs: (org, period) + (org, status) + divergent partial
--   • replay_snapshots:   (replay_run_id, account_code) + divergence partial
--   • schedule_generations: (org, schedule_type, source_id) + is_current partial
--   • fiscal_dependency_graph: (dependent, required) + (required) for reopen check
--   • replay_divergence_events: (org, period) + unresolved partial
--   • subledger_close_jobs: (org, period, subledger_type) already unique
--   • replay_validation_reports: (org, period, type) + (status) partial
--   • canonical_replay_exports: (org, period) latest-first
--   • replay_hash_registry: already unique on (org, period, hash_type)
-- ════════════════════════════════════════════════════════════════════════════

-- ── ledger_replay_runs ────────────────────────────────────────────────────────

-- Most common query: latest run per period
CREATE INDEX idx_lrr_org_period
  ON public.ledger_replay_runs (organization_id, period_id, created_at DESC)
  WHERE period_id IS NOT NULL;

-- Fiscal year replay lookup
CREATE INDEX idx_lrr_org_fiscal_year
  ON public.ledger_replay_runs (organization_id, fiscal_year_id, created_at DESC)
  WHERE fiscal_year_id IS NOT NULL;

-- Find all divergent runs quickly
CREATE INDEX idx_lrr_divergent
  ON public.ledger_replay_runs (organization_id, created_at DESC)
  WHERE status = 'divergent';

-- In-flight runs (cleanup/monitoring)
CREATE INDEX idx_lrr_running
  ON public.ledger_replay_runs (organization_id, started_at)
  WHERE status = 'running';

-- Actor lookup
CREATE INDEX idx_lrr_actor
  ON public.ledger_replay_runs (actor_id)
  WHERE actor_id IS NOT NULL;

-- ── replay_snapshots ──────────────────────────────────────────────────────────

-- Primary access: by run, then account
CREATE INDEX idx_rs_run_account
  ON public.replay_snapshots (replay_run_id, account_code);

-- Period-level queries
CREATE INDEX idx_rs_org_period
  ON public.replay_snapshots (organization_id, period_id, created_at DESC);

-- Only divergent snapshots (hot path for divergence reporting)
CREATE INDEX idx_rs_divergent
  ON public.replay_snapshots (replay_run_id, divergence_amount DESC)
  WHERE has_divergence = true;

-- ── schedule_generations ──────────────────────────────────────────────────────

-- Primary access: find current generation for a source
CREATE INDEX idx_sg_source_current
  ON public.schedule_generations (schedule_type, source_id, organization_id)
  WHERE is_current = true;

-- Full history for a source
CREATE INDEX idx_sg_source_history
  ON public.schedule_generations (schedule_type, source_id, generation_number ASC);

-- Org-level queries
CREATE INDEX idx_sg_org_type
  ON public.schedule_generations (organization_id, schedule_type, created_at DESC);

-- Superseded lookup
CREATE INDEX idx_sg_superseded
  ON public.schedule_generations (organization_id, superseded_at DESC)
  WHERE superseded_at IS NOT NULL;

-- ── schedule_generation_links ─────────────────────────────────────────────────

-- Forward ancestry: find children of a generation
CREATE INDEX idx_sgl_parent
  ON public.schedule_generation_links (parent_generation_id);

-- Reverse ancestry: find parent of a generation
CREATE INDEX idx_sgl_child
  ON public.schedule_generation_links (child_generation_id);

-- ── fiscal_dependency_graph ───────────────────────────────────────────────────

-- Primary close-check: what does a period depend on?
CREATE INDEX idx_fdg_dependent
  ON public.fiscal_dependency_graph (dependent_period_id, is_active)
  WHERE is_active = true;

-- Reopen safety: what periods depend on THIS period?
CREATE INDEX idx_fdg_required
  ON public.fiscal_dependency_graph (required_period_id, is_active)
  WHERE is_active = true;

-- Org-level queries
CREATE INDEX idx_fdg_org
  ON public.fiscal_dependency_graph (organization_id, dependency_type);

-- ── replay_divergence_events ──────────────────────────────────────────────────

-- Per-period divergence history
CREATE INDEX idx_rde_org_period
  ON public.replay_divergence_events (organization_id, period_id, detected_at DESC);

-- Unresolved divergences (hot path for monitoring)
CREATE INDEX idx_rde_unresolved
  ON public.replay_divergence_events (organization_id, detected_at DESC)
  WHERE resolved_at IS NULL;

-- Per-run divergences
CREATE INDEX idx_rde_run
  ON public.replay_divergence_events (replay_run_id);

-- Per-account divergence tracking
CREATE INDEX idx_rde_account
  ON public.replay_divergence_events (organization_id, account_code, detected_at DESC)
  WHERE account_code IS NOT NULL;

-- ── subledger_close_jobs ──────────────────────────────────────────────────────
-- UNIQUE(organization_id, period_id, subledger_type) already provides primary index.

-- Failed subledger jobs (hot path for close readiness)
CREATE INDEX idx_scj_failed
  ON public.subledger_close_jobs (organization_id, period_id)
  WHERE status = 'failed';

-- Pending jobs (not yet run)
CREATE INDEX idx_scj_pending
  ON public.subledger_close_jobs (organization_id, period_id)
  WHERE status = 'pending';

-- ── replay_validation_reports ─────────────────────────────────────────────────

-- Latest report per period
CREATE INDEX idx_rvr_org_period
  ON public.replay_validation_reports (organization_id, period_id, created_at DESC);

-- Validation type filtering
CREATE INDEX idx_rvr_type
  ON public.replay_validation_reports (organization_id, validation_type, created_at DESC);

-- Failed validations
CREATE INDEX idx_rvr_divergent
  ON public.replay_validation_reports (organization_id, created_at DESC)
  WHERE status = 'divergences_found';

-- Replay run link
CREATE INDEX idx_rvr_run
  ON public.replay_validation_reports (replay_run_id)
  WHERE replay_run_id IS NOT NULL;

-- ── canonical_replay_exports ──────────────────────────────────────────────────

-- Latest canonical export per period
CREATE INDEX idx_cre_org_period
  ON public.canonical_replay_exports (organization_id, period_id, created_at DESC);

-- Hash lookup (for external verification)
CREATE INDEX idx_cre_hash
  ON public.canonical_replay_exports (content_hash);

-- Replay run link
CREATE INDEX idx_cre_run
  ON public.canonical_replay_exports (replay_run_id);

-- ── replay_hash_registry ──────────────────────────────────────────────────────
-- UNIQUE(organization_id, period_id, hash_type) already provides primary index.

-- By hash type for cross-period queries
CREATE INDEX idx_rhr_org_type
  ON public.replay_hash_registry (organization_id, hash_type, updated_at DESC);

-- Hash value lookup for collision detection / external audit
CREATE INDEX idx_rhr_hash_value
  ON public.replay_hash_registry (hash_value, hash_type);
