-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260607000006_phase4ha_governance_views.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H-A — Governance Views & Performance Indexes
--
-- Implements replay governance views and performance indexes.
--
-- Views:
--   v_accounting_layer_model       — full accounting architecture layer registry
--   v_replay_execution_status      — replay job queue with elapsed-time
--   v_certification_dashboard       — per-period certification status + hash stability
--   v_delta_summary                 — divergence counts per period across all runs
--   v_replay_governance_dashboard   — UPDATED: divergence_count from replay_validation_deltas
--
-- All views use: WITH (security_invoker = true)
--
-- Indexes — new tables:
--   replay_validation_deltas: (org, period), (replay_run_id), partial (delta_type)
--   replay_certifications:    (org, period), (replay_run_id), status partial
--   replay_integrity_certificates: (org, fiscal_year_id)
--   replay_execution_jobs:    (org, status, priority), (org, period_id), partial queued
--   canonical_export_hashes:  (org, period_id), (export_id), (export_type, org)
--   accounting_layer_registry: (layer_type), (sort_order)
--
-- Dependencies:
--   All prior Phase 4H-A migrations
--   20260606000001_phase4h_replay_core.sql — ledger_replay_runs
--   20260606000005_phase4h_replay_validation.sql — replay_validation_reports, replay_hash_registry
-- ════════════════════════════════════════════════════════════════════════════

-- ── View: v_accounting_layer_model ────────────────────────────────────────────

CREATE VIEW public.v_accounting_layer_model
WITH (security_invoker = true)
AS
SELECT
  id,
  layer_name,
  layer_type,
  table_names,
  description,
  is_mutable,
  is_source_of_truth,
  is_derived,
  sort_order,
  created_at
FROM public.accounting_layer_registry
ORDER BY sort_order ASC;

COMMENT ON VIEW public.v_accounting_layer_model IS
  'Accounting architecture layers ordered by sort_order. security_invoker = true.';

GRANT SELECT ON public.v_accounting_layer_model TO authenticated, service_role;

-- ── View: v_replay_execution_status ──────────────────────────────────────────

CREATE VIEW public.v_replay_execution_status
WITH (security_invoker = true)
AS
SELECT
  rej.id,
  rej.organization_id,
  rej.period_id,
  rej.fiscal_year_id,
  rej.job_type,
  rej.status,
  rej.priority,
  rej.replay_run_id,
  rej.requested_by,
  rej.queued_at,
  rej.started_at,
  rej.completed_at,
  rej.error_detail,
  rej.result_data,
  EXTRACT(
    EPOCH FROM (
      COALESCE(rej.completed_at, now())
      - COALESCE(rej.started_at, rej.queued_at)
    )
  )::int AS elapsed_seconds
FROM public.replay_execution_jobs rej
ORDER BY rej.priority DESC, rej.queued_at ASC;

COMMENT ON VIEW public.v_replay_execution_status IS
  'Replay execution job queue with elapsed time. security_invoker = true.';

GRANT SELECT ON public.v_replay_execution_status TO authenticated, service_role;

-- ── View: v_certification_dashboard ──────────────────────────────────────────

CREATE VIEW public.v_certification_dashboard
WITH (security_invoker = true)
AS
SELECT
  fp.id                                  AS period_id,
  fp.organization_id,
  fp.period_start,
  fp.period_end,
  fp.status                              AS period_status,
  -- Latest active certification
  rc.id                                  AS certification_id,
  rc.status                              AS certification_status,
  rc.replay_hash                         AS certified_replay_hash,
  rc.certification_hash,
  rc.delta_count                         AS certified_delta_count,
  rc.certified_at,
  rc.certified_by,
  -- Latest replay run
  lrr.id                                 AS latest_run_id,
  lrr.replay_hash                        AS latest_run_hash,
  lrr.status                             AS latest_run_status,
  lrr.divergence_count                   AS latest_run_divergences,
  lrr.completed_at                       AS last_replayed_at,
  -- Hash stability: certified hash still matches latest run
  CASE
    WHEN rc.id IS NULL          THEN false
    WHEN rc.replay_hash = lrr.replay_hash THEN true
    ELSE false
  END                                    AS hash_stable,
  -- Current delta count from replay_validation_deltas
  (
    SELECT COUNT(*)
    FROM   public.replay_validation_deltas rvd
    WHERE  rvd.period_id = fp.id
      AND  rvd.replay_run_id = lrr.id
  )                                      AS current_delta_count
FROM public.financial_periods fp
LEFT JOIN LATERAL (
  SELECT * FROM public.replay_certifications
  WHERE  period_id = fp.id
    AND  status    = 'certified'
  ORDER  BY certified_at DESC
  LIMIT  1
) rc ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.ledger_replay_runs
  WHERE  period_id = fp.id
  ORDER  BY created_at DESC
  LIMIT  1
) lrr ON true;

COMMENT ON VIEW public.v_certification_dashboard IS
  'Per-period certification status: active certification, hash stability, delta count. '
  'hash_stable=true means certified replay_hash matches latest run hash. '
  'security_invoker = true.';

GRANT SELECT ON public.v_certification_dashboard TO authenticated, service_role;

-- ── View: v_delta_summary ────────────────────────────────────────────────────

CREATE VIEW public.v_delta_summary
WITH (security_invoker = true)
AS
SELECT
  rvd.organization_id,
  rvd.period_id,
  fp.period_start,
  fp.period_end,
  rvd.replay_run_id,
  COUNT(*)                                               AS total_deltas,
  COUNT(*) FILTER (WHERE rvd.delta_type = 'balance_mismatch')    AS balance_mismatch_count,
  COUNT(*) FILTER (WHERE rvd.delta_type = 'missing_from_cache')  AS missing_from_cache_count,
  COUNT(*) FILTER (WHERE rvd.delta_type = 'missing_from_ledger') AS missing_from_ledger_count,
  COUNT(*) FILTER (WHERE rvd.delta_type = 'orphan_transaction')  AS orphan_count,
  MAX(rvd.delta_amount)                                  AS max_delta_amount,
  SUM(rvd.delta_amount)                                  AS total_delta_amount,
  MAX(rvd.created_at)                                    AS detected_at
FROM public.replay_validation_deltas rvd
JOIN public.financial_periods fp
  ON fp.id = rvd.period_id
GROUP BY
  rvd.organization_id, rvd.period_id,
  fp.period_start, fp.period_end,
  rvd.replay_run_id
ORDER BY rvd.organization_id, fp.period_start DESC;

COMMENT ON VIEW public.v_delta_summary IS
  'Divergence counts per (period, replay_run) from replay_validation_deltas. '
  'security_invoker = true.';

GRANT SELECT ON public.v_delta_summary TO authenticated, service_role;

-- ── View: v_replay_governance_dashboard (UPDATED) ────────────────────────────
-- Uses replay_validation_deltas for divergence data instead of replay_snapshots.

CREATE OR REPLACE VIEW public.v_replay_governance_dashboard
WITH (security_invoker = true)
AS
SELECT
  fp.id                                    AS period_id,
  fp.organization_id,
  fp.period_start,
  fp.period_end,
  fp.status                                AS period_status,
  -- Latest replay run
  lrr.id                                   AS latest_replay_run_id,
  lrr.status                               AS latest_replay_status,
  lrr.divergence_count                     AS replay_divergences,
  lrr.replay_hash,
  lrr.completed_at                         AS last_replayed_at,
  -- Latest validation report
  rvr.id                                   AS latest_validation_report_id,
  rvr.status                               AS latest_validation_status,
  rvr.checks_passed,
  rvr.checks_failed,
  rvr.created_at                           AS last_validated_at,
  -- Hash registry
  rhr_pr.hash_value                        AS period_replay_hash,
  rhr_ce.hash_value                        AS canonical_export_hash,
  -- Subledger close readiness (uses subledger_close_jobs)
  (
    SELECT COUNT(*) = 0
    FROM   public.subledger_close_jobs scj
    WHERE  scj.organization_id = fp.organization_id
      AND  scj.period_id       = fp.id
      AND  scj.status          = 'failed'
  )                                        AS subledgers_ready,
  -- Canonical replay export
  cre.id IS NOT NULL                       AS has_canonical_replay_export,
  cre.content_hash                         AS canonical_replay_hash,
  cre.created_at                           AS canonical_export_at,
  -- Certification status
  rc.id IS NOT NULL                        AS is_certified,
  rc.certified_at,
  rc.delta_count                           AS certified_delta_count,
  -- Current delta count from replay_validation_deltas (storage-light)
  (
    SELECT COUNT(*)
    FROM   public.replay_validation_deltas rvd
    WHERE  rvd.period_id      = fp.id
      AND  rvd.replay_run_id  = lrr.id
  )                                        AS current_delta_count
FROM  public.financial_periods fp
LEFT  JOIN LATERAL (
  SELECT * FROM public.ledger_replay_runs
  WHERE period_id = fp.id ORDER BY created_at DESC LIMIT 1
) lrr ON true
LEFT  JOIN LATERAL (
  SELECT * FROM public.replay_validation_reports
  WHERE period_id = fp.id ORDER BY created_at DESC LIMIT 1
) rvr ON true
LEFT  JOIN public.replay_hash_registry rhr_pr
  ON  rhr_pr.organization_id = fp.organization_id
  AND rhr_pr.period_id       = fp.id
  AND rhr_pr.hash_type       = 'period_replay'
LEFT  JOIN public.replay_hash_registry rhr_ce
  ON  rhr_ce.organization_id = fp.organization_id
  AND rhr_ce.period_id       = fp.id
  AND rhr_ce.hash_type       = 'canonical_export'
LEFT  JOIN LATERAL (
  SELECT * FROM public.canonical_replay_exports
  WHERE period_id = fp.id ORDER BY created_at DESC LIMIT 1
) cre ON true
LEFT  JOIN LATERAL (
  SELECT * FROM public.replay_certifications
  WHERE  period_id = fp.id AND status = 'certified'
  ORDER  BY certified_at DESC LIMIT 1
) rc ON true;

COMMENT ON VIEW public.v_replay_governance_dashboard IS
  'UPDATED (Phase 4H-A): divergence data from replay_validation_deltas (not replay_snapshots). '
  'Per-period: replay runs, validation reports, hash registry, subledger readiness, '
  'canonical exports, certifications, delta counts. security_invoker = true.';

GRANT SELECT ON public.v_replay_governance_dashboard TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════════════════════

-- ── accounting_layer_registry ─────────────────────────────────────────────────
CREATE INDEX idx_alr_layer_type  ON public.accounting_layer_registry (layer_type);
CREATE INDEX idx_alr_sort_order  ON public.accounting_layer_registry (sort_order);

-- ── replay_validation_deltas ──────────────────────────────────────────────────
CREATE INDEX idx_rvd_org_period  ON public.replay_validation_deltas (organization_id, period_id);
CREATE INDEX idx_rvd_run         ON public.replay_validation_deltas (replay_run_id);
CREATE INDEX idx_rvd_delta_type  ON public.replay_validation_deltas (delta_type);
CREATE INDEX idx_rvd_delta_amt   ON public.replay_validation_deltas (delta_amount DESC NULLS LAST)
  WHERE delta_amount > 0;

-- ── replay_certifications ─────────────────────────────────────────────────────
CREATE INDEX idx_rc_org_period     ON public.replay_certifications (organization_id, period_id);
CREATE INDEX idx_rc_run            ON public.replay_certifications (replay_run_id);
CREATE INDEX idx_rc_certified      ON public.replay_certifications (organization_id, period_id, certified_at DESC)
  WHERE status = 'certified';

-- ── replay_integrity_certificates ────────────────────────────────────────────
CREATE INDEX idx_ric_org_fy    ON public.replay_integrity_certificates (organization_id, fiscal_year_id);
CREATE INDEX idx_ric_generated ON public.replay_integrity_certificates (organization_id, generated_at DESC);

-- ── replay_execution_jobs ─────────────────────────────────────────────────────
CREATE INDEX idx_rej_org_status    ON public.replay_execution_jobs (organization_id, status, priority DESC, queued_at ASC);
CREATE INDEX idx_rej_org_period    ON public.replay_execution_jobs (organization_id, period_id)
  WHERE period_id IS NOT NULL;
CREATE INDEX idx_rej_queued        ON public.replay_execution_jobs (organization_id, priority DESC, queued_at ASC)
  WHERE status = 'queued';
CREATE INDEX idx_rej_running       ON public.replay_execution_jobs (organization_id, started_at)
  WHERE status = 'running';

-- ── canonical_export_hashes ───────────────────────────────────────────────────
CREATE INDEX idx_ceh_org_period    ON public.canonical_export_hashes (organization_id, period_id)
  WHERE period_id IS NOT NULL;
CREATE INDEX idx_ceh_org_fy        ON public.canonical_export_hashes (organization_id, fiscal_year_id)
  WHERE fiscal_year_id IS NOT NULL;
CREATE INDEX idx_ceh_export_id     ON public.canonical_export_hashes (export_id);
CREATE INDEX idx_ceh_export_type   ON public.canonical_export_hashes (export_type, organization_id, generated_at DESC);
