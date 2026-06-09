-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260606000004_phase4h_subledger_orchestration.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H — Subledger Close Orchestration & Fiscal Year Replay
--
-- Implements subledger close coordination and fiscal-year-level replay:
--   subledger_close_jobs  — per-subledger per-period close job tracking
--
-- SECURITY DEFINER functions:
--   orchestrate_subledger_close(p_org_id, p_period_id, p_actor_id)
--     → Creates/updates subledger_close_jobs for all 7 subledger types.
--       Runs presence checks for each subledger (posted entries, balanced schedules).
--       Returns JSONB: {status, period_id, subledger_results[], ready_to_close}
--
--   replay_fiscal_year(p_org_id, p_fiscal_year_id, p_actor_id)
--     → Replays all financial periods in the fiscal year sequentially.
--       Creates a parent ledger_replay_runs record (type='fiscal_year').
--       Calls replay_period_state() for each period in period_start ASC order.
--       Returns JSONB: {status, fiscal_year_id, periods_replayed, total_divergences,
--                       period_results[], combined_hash}
--
-- Column name map (verified from source migrations):
--   payroll_runs.financial_period_id   (Phase 4F — NOT period_id)
--   depreciation_schedules.schedule_date (Phase 4G — no direct period FK; date-match)
--   accrual_release_lines.release_date + is_cancelled
--   periodic_deferred_lines.release_date (no is_cancelled column)
--   vat_periods.period_start / period_end (Phase 4C)
--   bank_statement_imports.period_start / period_end (Phase 4E)
--   invoices.issue_date (Phase 4A)
--
-- Dependencies:
--   20260530000001_phase4a_commercial_core.sql — financial_periods, invoices
--   20260603000001_phase4e_reconciliation_core.sql — fiscal_years, bank_statement_imports
--   20260604000001_phase4f_payroll_core.sql — payroll_runs (financial_period_id)
--   20260601000002_phase4c_vat_and_periods.sql — vat_periods
--   20260605000001_phase4g_fixed_assets.sql — fixed_assets
--   20260605000002_phase4g_depreciation_engine.sql — depreciation_schedules (schedule_date)
--   20260605000003_phase4g_accrual_schedules.sql — accrual_schedules, accrual_release_lines
--   20260605000004_phase4g_deferred_revenue.sql — periodic_deferred_schedules, periodic_deferred_lines
--   20260606000001_phase4h_replay_core.sql — ledger_replay_runs, replay_period_state
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ─────────────────────────────────────────────────────

CREATE TYPE public.subledger_type AS ENUM (
  'fixed_assets',        -- Fixed asset register and depreciation
  'payroll',             -- Payroll runs and employer contributions
  'vat',                 -- Swedish VAT periods and declarations
  'accounts_receivable', -- Open invoice tracking
  'bank',                -- Bank statement imports and reconciliation
  'deferred_revenue',    -- Deferred revenue release schedules
  'accruals'             -- Accrual and prepaid release schedules
);

CREATE TYPE public.subledger_close_status AS ENUM (
  'pending',   -- Close job created; not yet started
  'running',   -- Close check currently executing
  'completed', -- Close check passed; subledger is ready to close
  'failed',    -- Close check found issues; subledger is NOT ready
  'skipped'    -- Subledger not applicable for this period (no activity)
);

-- ── Section 2: subledger_close_jobs ──────────────────────────────────────────
-- Per-subledger per-period close job records.
-- Created by orchestrate_subledger_close(). Updated as checks run.
-- One record per (organization_id, period_id, subledger_type).

CREATE TABLE public.subledger_close_jobs (
  id                uuid                           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid                           NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id         uuid                           NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  subledger_type    public.subledger_type          NOT NULL,
  status            public.subledger_close_status  NOT NULL DEFAULT 'pending',
  items_found       int                            NOT NULL DEFAULT 0 CHECK (items_found >= 0),
  items_ready       int                            NOT NULL DEFAULT 0 CHECK (items_ready >= 0),
  items_blocking    int                            NOT NULL DEFAULT 0 CHECK (items_blocking >= 0),
  check_detail      jsonb                          NOT NULL DEFAULT '{}',
  error_detail      text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz                    NOT NULL DEFAULT now(),
  updated_at        timestamptz                    NOT NULL DEFAULT now(),
  created_by        uuid                                    REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT scj_org_period_subledger_unique UNIQUE (organization_id, period_id, subledger_type)
);

COMMENT ON TABLE public.subledger_close_jobs IS
  'Per-subledger per-period close readiness tracking. '
  'Created and updated by orchestrate_subledger_close(). '
  'status=''completed'' = subledger is ready; ''failed'' = blocking issues; '
  '''skipped'' = no activity in this period.';

CREATE TRIGGER set_subledger_close_jobs_updated_at
  BEFORE UPDATE ON public.subledger_close_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Section 3: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.subledger_close_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scj_org_read"
  ON public.subledger_close_jobs FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:replay:read')
  );

GRANT SELECT        ON public.subledger_close_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subledger_close_jobs TO service_role;

-- ── FUNCTION: orchestrate_subledger_close ────────────────────────────────────
-- Checks close readiness across all 7 subledger types for a financial period.
-- Upserts subledger_close_jobs for each subledger type.
-- Returns JSONB: {status, ready_to_close, subledger_results[]}

CREATE OR REPLACE FUNCTION public.orchestrate_subledger_close(
  p_org_id    uuid,
  p_period_id uuid,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period          record;
  v_results         jsonb := '[]'::jsonb;
  v_all_ready       boolean := true;
  v_items_found     int;
  v_items_blocking  int;
  v_status          public.subledger_close_status;
  v_detail          jsonb;
BEGIN
  SELECT * INTO v_period
  FROM public.financial_periods
  WHERE id = p_period_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % does not exist', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Check 1: fixed_assets ───────────────────────────────────────────────
  -- Active/impaired assets with unposted depreciation schedule_date in period
  SELECT
    COUNT(DISTINCT fa.id),
    COUNT(ds.id) FILTER (
      WHERE ds.is_posted = false
        AND ds.schedule_date >= v_period.period_start
        AND ds.schedule_date <= v_period.period_end
    )
  INTO v_items_found, v_items_blocking
  FROM public.fixed_assets fa
  LEFT JOIN public.depreciation_schedules ds ON ds.asset_id = fa.id
  WHERE fa.organization_id = p_org_id
    AND fa.status IN ('active', 'impaired');

  v_items_blocking := COALESCE(v_items_blocking, 0);
  v_items_found    := COALESCE(v_items_found, 0);

  v_status    := CASE
    WHEN v_items_found = 0     THEN 'skipped'
    WHEN v_items_blocking > 0  THEN 'failed'
    ELSE 'completed'
  END;
  IF v_status = 'failed' THEN v_all_ready := false; END IF;
  v_detail := jsonb_build_object(
    'active_assets',               v_items_found,
    'unposted_depr_in_period',     v_items_blocking
  );

  INSERT INTO public.subledger_close_jobs(
    organization_id, period_id, subledger_type, status,
    items_found, items_ready, items_blocking, check_detail,
    started_at, completed_at, created_by
  )
  VALUES (
    p_org_id, p_period_id, 'fixed_assets', v_status,
    v_items_found, v_items_found - v_items_blocking, v_items_blocking, v_detail,
    now(), now(), p_actor_id
  )
  ON CONFLICT (organization_id, period_id, subledger_type) DO UPDATE SET
    status        = EXCLUDED.status,
    items_found   = EXCLUDED.items_found,
    items_ready   = EXCLUDED.items_ready,
    items_blocking = EXCLUDED.items_blocking,
    check_detail  = EXCLUDED.check_detail,
    started_at    = EXCLUDED.started_at,
    completed_at  = EXCLUDED.completed_at;

  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'subledger_type', 'fixed_assets', 'status', v_status,
    'items_found', v_items_found, 'items_blocking', v_items_blocking
  ));

  -- ── Check 2: payroll ────────────────────────────────────────────────────
  -- payroll_runs.financial_period_id = p_period_id
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE pr.status IN ('draft', 'ready'))
  INTO v_items_found, v_items_blocking
  FROM public.payroll_runs pr
  WHERE pr.organization_id    = p_org_id
    AND pr.financial_period_id = p_period_id;

  v_items_blocking := COALESCE(v_items_blocking, 0);
  v_items_found    := COALESCE(v_items_found, 0);

  v_status := CASE
    WHEN v_items_found = 0    THEN 'skipped'
    WHEN v_items_blocking > 0 THEN 'failed'
    ELSE 'completed'
  END;
  IF v_status = 'failed' THEN v_all_ready := false; END IF;
  v_detail := jsonb_build_object(
    'payroll_runs_total', v_items_found,
    'unposted_runs',      v_items_blocking
  );

  INSERT INTO public.subledger_close_jobs(
    organization_id, period_id, subledger_type, status,
    items_found, items_ready, items_blocking, check_detail,
    started_at, completed_at, created_by
  )
  VALUES (
    p_org_id, p_period_id, 'payroll', v_status,
    v_items_found, v_items_found - v_items_blocking, v_items_blocking, v_detail,
    now(), now(), p_actor_id
  )
  ON CONFLICT (organization_id, period_id, subledger_type) DO UPDATE SET
    status        = EXCLUDED.status,
    items_found   = EXCLUDED.items_found,
    items_ready   = EXCLUDED.items_ready,
    items_blocking = EXCLUDED.items_blocking,
    check_detail  = EXCLUDED.check_detail,
    started_at    = EXCLUDED.started_at,
    completed_at  = EXCLUDED.completed_at;

  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'subledger_type', 'payroll', 'status', v_status,
    'items_found', v_items_found, 'items_blocking', v_items_blocking
  ));

  -- ── Check 3: vat ────────────────────────────────────────────────────────
  -- vat_periods overlapping this financial period
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE vp.status = 'open')
  INTO v_items_found, v_items_blocking
  FROM public.vat_periods vp
  WHERE vp.organization_id = p_org_id
    AND vp.period_start   <= v_period.period_end
    AND vp.period_end     >= v_period.period_start;

  v_items_blocking := COALESCE(v_items_blocking, 0);
  v_items_found    := COALESCE(v_items_found, 0);

  v_status := CASE
    WHEN v_items_found = 0    THEN 'skipped'
    WHEN v_items_blocking > 0 THEN 'failed'
    ELSE 'completed'
  END;
  IF v_status = 'failed' THEN v_all_ready := false; END IF;
  v_detail := jsonb_build_object(
    'vat_periods_covering', v_items_found,
    'open_vat_periods',     v_items_blocking
  );

  INSERT INTO public.subledger_close_jobs(
    organization_id, period_id, subledger_type, status,
    items_found, items_ready, items_blocking, check_detail,
    started_at, completed_at, created_by
  )
  VALUES (
    p_org_id, p_period_id, 'vat', v_status,
    v_items_found, v_items_found - v_items_blocking, v_items_blocking, v_detail,
    now(), now(), p_actor_id
  )
  ON CONFLICT (organization_id, period_id, subledger_type) DO UPDATE SET
    status        = EXCLUDED.status,
    items_found   = EXCLUDED.items_found,
    items_ready   = EXCLUDED.items_ready,
    items_blocking = EXCLUDED.items_blocking,
    check_detail  = EXCLUDED.check_detail,
    started_at    = EXCLUDED.started_at,
    completed_at  = EXCLUDED.completed_at;

  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'subledger_type', 'vat', 'status', v_status,
    'items_found', v_items_found, 'items_blocking', v_items_blocking
  ));

  -- ── Check 4: accounts_receivable ────────────────────────────────────────
  -- Invoices issued in this period (non-blocking: open invoices are informational)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE i.status NOT IN ('paid', 'void'))
  INTO v_items_found, v_items_blocking
  FROM public.invoices i
  WHERE i.organization_id = p_org_id
    AND i.issue_date BETWEEN v_period.period_start AND v_period.period_end;

  v_items_blocking := COALESCE(v_items_blocking, 0);
  v_items_found    := COALESCE(v_items_found, 0);

  -- AR: open invoices are informational only, not blocking
  v_status := CASE WHEN v_items_found = 0 THEN 'skipped' ELSE 'completed' END;
  v_detail := jsonb_build_object(
    'invoices_in_period', v_items_found,
    'open_invoices',      v_items_blocking
  );

  INSERT INTO public.subledger_close_jobs(
    organization_id, period_id, subledger_type, status,
    items_found, items_ready, items_blocking, check_detail,
    started_at, completed_at, created_by
  )
  VALUES (
    p_org_id, p_period_id, 'accounts_receivable', v_status,
    v_items_found, v_items_found - v_items_blocking, v_items_blocking, v_detail,
    now(), now(), p_actor_id
  )
  ON CONFLICT (organization_id, period_id, subledger_type) DO UPDATE SET
    status        = EXCLUDED.status,
    items_found   = EXCLUDED.items_found,
    items_ready   = EXCLUDED.items_ready,
    items_blocking = EXCLUDED.items_blocking,
    check_detail  = EXCLUDED.check_detail,
    started_at    = EXCLUDED.started_at,
    completed_at  = EXCLUDED.completed_at;

  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'subledger_type', 'accounts_receivable', 'status', v_status,
    'items_found', v_items_found, 'items_blocking', v_items_blocking
  ));

  -- ── Check 5: bank ───────────────────────────────────────────────────────
  -- bank_statement_imports overlapping period, not yet confirmed
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE bsi.status <> 'confirmed')
  INTO v_items_found, v_items_blocking
  FROM public.bank_statement_imports bsi
  WHERE bsi.organization_id = p_org_id
    AND bsi.period_start   <= v_period.period_end
    AND bsi.period_end     >= v_period.period_start;

  v_items_blocking := COALESCE(v_items_blocking, 0);
  v_items_found    := COALESCE(v_items_found, 0);

  v_status := CASE
    WHEN v_items_found = 0    THEN 'skipped'
    WHEN v_items_blocking > 0 THEN 'failed'
    ELSE 'completed'
  END;
  IF v_status = 'failed' THEN v_all_ready := false; END IF;
  v_detail := jsonb_build_object(
    'bank_imports_covering',  v_items_found,
    'unconfirmed_imports',    v_items_blocking
  );

  INSERT INTO public.subledger_close_jobs(
    organization_id, period_id, subledger_type, status,
    items_found, items_ready, items_blocking, check_detail,
    started_at, completed_at, created_by
  )
  VALUES (
    p_org_id, p_period_id, 'bank', v_status,
    v_items_found, v_items_found - v_items_blocking, v_items_blocking, v_detail,
    now(), now(), p_actor_id
  )
  ON CONFLICT (organization_id, period_id, subledger_type) DO UPDATE SET
    status        = EXCLUDED.status,
    items_found   = EXCLUDED.items_found,
    items_ready   = EXCLUDED.items_ready,
    items_blocking = EXCLUDED.items_blocking,
    check_detail  = EXCLUDED.check_detail,
    started_at    = EXCLUDED.started_at,
    completed_at  = EXCLUDED.completed_at;

  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'subledger_type', 'bank', 'status', v_status,
    'items_found', v_items_found, 'items_blocking', v_items_blocking
  ));

  -- ── Check 6: deferred_revenue ───────────────────────────────────────────
  -- periodic_deferred_lines with release_date in period, not yet posted
  -- Note: periodic_deferred_lines has no is_cancelled column
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE pdl.is_posted = false)
  INTO v_items_found, v_items_blocking
  FROM public.periodic_deferred_lines pdl
  JOIN public.periodic_deferred_schedules pds
    ON pds.id = pdl.schedule_id
  WHERE pds.organization_id = p_org_id
    AND pdl.release_date   >= v_period.period_start
    AND pdl.release_date   <= v_period.period_end;

  v_items_blocking := COALESCE(v_items_blocking, 0);
  v_items_found    := COALESCE(v_items_found, 0);

  v_status := CASE
    WHEN v_items_found = 0    THEN 'skipped'
    WHEN v_items_blocking > 0 THEN 'failed'
    ELSE 'completed'
  END;
  IF v_status = 'failed' THEN v_all_ready := false; END IF;
  v_detail := jsonb_build_object(
    'deferred_lines_in_period', v_items_found,
    'unposted_lines',           v_items_blocking
  );

  INSERT INTO public.subledger_close_jobs(
    organization_id, period_id, subledger_type, status,
    items_found, items_ready, items_blocking, check_detail,
    started_at, completed_at, created_by
  )
  VALUES (
    p_org_id, p_period_id, 'deferred_revenue', v_status,
    v_items_found, v_items_found - v_items_blocking, v_items_blocking, v_detail,
    now(), now(), p_actor_id
  )
  ON CONFLICT (organization_id, period_id, subledger_type) DO UPDATE SET
    status        = EXCLUDED.status,
    items_found   = EXCLUDED.items_found,
    items_ready   = EXCLUDED.items_ready,
    items_blocking = EXCLUDED.items_blocking,
    check_detail  = EXCLUDED.check_detail,
    started_at    = EXCLUDED.started_at,
    completed_at  = EXCLUDED.completed_at;

  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'subledger_type', 'deferred_revenue', 'status', v_status,
    'items_found', v_items_found, 'items_blocking', v_items_blocking
  ));

  -- ── Check 7: accruals ───────────────────────────────────────────────────
  -- accrual_release_lines with release_date in period, not yet posted, not cancelled
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE arl.is_posted = false AND arl.is_cancelled = false)
  INTO v_items_found, v_items_blocking
  FROM public.accrual_release_lines arl
  JOIN public.accrual_schedules acr
    ON acr.id = arl.accrual_schedule_id
  WHERE acr.organization_id = p_org_id
    AND arl.release_date   >= v_period.period_start
    AND arl.release_date   <= v_period.period_end;

  v_items_blocking := COALESCE(v_items_blocking, 0);
  v_items_found    := COALESCE(v_items_found, 0);

  v_status := CASE
    WHEN v_items_found = 0    THEN 'skipped'
    WHEN v_items_blocking > 0 THEN 'failed'
    ELSE 'completed'
  END;
  IF v_status = 'failed' THEN v_all_ready := false; END IF;
  v_detail := jsonb_build_object(
    'accrual_lines_in_period', v_items_found,
    'unposted_lines',          v_items_blocking
  );

  INSERT INTO public.subledger_close_jobs(
    organization_id, period_id, subledger_type, status,
    items_found, items_ready, items_blocking, check_detail,
    started_at, completed_at, created_by
  )
  VALUES (
    p_org_id, p_period_id, 'accruals', v_status,
    v_items_found, v_items_found - v_items_blocking, v_items_blocking, v_detail,
    now(), now(), p_actor_id
  )
  ON CONFLICT (organization_id, period_id, subledger_type) DO UPDATE SET
    status        = EXCLUDED.status,
    items_found   = EXCLUDED.items_found,
    items_ready   = EXCLUDED.items_ready,
    items_blocking = EXCLUDED.items_blocking,
    check_detail  = EXCLUDED.check_detail,
    started_at    = EXCLUDED.started_at,
    completed_at  = EXCLUDED.completed_at;

  v_results := v_results || jsonb_build_array(jsonb_build_object(
    'subledger_type', 'accruals', 'status', v_status,
    'items_found', v_items_found, 'items_blocking', v_items_blocking
  ));

  RETURN jsonb_build_object(
    'status',            CASE WHEN v_all_ready THEN 'ready_to_close' ELSE 'not_ready' END,
    'period_id',         p_period_id,
    'ready_to_close',    v_all_ready,
    'subledger_results', v_results,
    'checked_at',        now()
  );
END;
$$;

COMMENT ON FUNCTION public.orchestrate_subledger_close(uuid, uuid, uuid) IS
  'Coordinates close readiness checks for all 7 subledger types for a period. '
  'Creates/updates subledger_close_jobs for each type. '
  'Returns {status, ready_to_close, subledger_results[]}. '
  'status=''ready_to_close'' = all blocking subledgers are complete or skipped.';

GRANT EXECUTE ON FUNCTION public.orchestrate_subledger_close(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: replay_fiscal_year ─────────────────────────────────────────────
-- Runs replay_period_state() for every financial period in a fiscal year,
-- chronological order (period_start ASC).
-- Creates a parent ledger_replay_runs record (type='fiscal_year').

CREATE OR REPLACE FUNCTION public.replay_fiscal_year(
  p_org_id         uuid,
  p_fiscal_year_id uuid,
  p_actor_id       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fiscal_year    record;
  v_parent_run_id  uuid;
  v_period_results jsonb := '[]'::jsonb;
  v_total_divs     int   := 0;
  v_total_entries  int   := 0;
  v_total_lines    int   := 0;
  v_total_accounts int   := 0;
  v_period_hashes  text  := '';
  v_combined_hash  text;
  v_final_status   public.ledger_replay_status;
  v_period_result  jsonb;
  v_rec            record;
BEGIN
  SELECT * INTO v_fiscal_year FROM public.fiscal_years WHERE id = p_fiscal_year_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % does not exist', p_fiscal_year_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.financial_periods
    WHERE organization_id = p_org_id
      AND period_start   >= v_fiscal_year.year_start
      AND period_end     <= v_fiscal_year.year_end
  ) THEN
    RAISE EXCEPTION 'NO_PERIODS_IN_FISCAL_YEAR: org % has no financial_periods in fiscal year %',
      p_org_id, p_fiscal_year_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Create parent fiscal-year run record
  INSERT INTO public.ledger_replay_runs(
    organization_id, fiscal_year_id, replay_type, status, actor_id
  )
  VALUES (p_org_id, p_fiscal_year_id, 'fiscal_year', 'running', p_actor_id)
  RETURNING id INTO v_parent_run_id;

  -- Replay each period in chronological order
  FOR v_rec IN
    SELECT id, period_start, period_end
    FROM public.financial_periods
    WHERE organization_id = p_org_id
      AND period_start   >= v_fiscal_year.year_start
      AND period_end     <= v_fiscal_year.year_end
    ORDER BY period_start ASC
  LOOP
    v_period_result  := public.replay_period_state(p_org_id, v_rec.id, p_actor_id);
    v_total_divs     := v_total_divs     + COALESCE((v_period_result->>'divergence_count')::int, 0);
    v_total_entries  := v_total_entries  + COALESCE((v_period_result->>'journal_entries_processed')::int, 0);
    v_total_lines    := v_total_lines    + COALESCE((v_period_result->>'journal_lines_processed')::int, 0);
    v_total_accounts := v_total_accounts + COALESCE((v_period_result->>'accounts_reconstructed')::int, 0);
    v_period_hashes  := v_period_hashes  || COALESCE(v_period_result->>'replay_hash', '');

    v_period_results := v_period_results || jsonb_build_array(jsonb_build_object(
      'period_id',    v_rec.id,
      'period_start', v_rec.period_start,
      'period_end',   v_rec.period_end,
      'status',       v_period_result->>'status',
      'divergences',  (v_period_result->>'divergence_count')::int,
      'replay_hash',  v_period_result->>'replay_hash'
    ));
  END LOOP;

  v_combined_hash := encode(sha256(v_period_hashes::bytea), 'hex');
  v_final_status  := CASE WHEN v_total_divs > 0 THEN 'divergent' ELSE 'completed' END;

  UPDATE public.ledger_replay_runs SET
    status                    = v_final_status,
    completed_at              = now(),
    journal_entries_processed = v_total_entries,
    journal_lines_processed   = v_total_lines,
    accounts_reconstructed    = v_total_accounts,
    divergence_count          = v_total_divs,
    replay_hash               = v_combined_hash
  WHERE id = v_parent_run_id;

  RETURN jsonb_build_object(
    'status',            v_final_status,
    'replay_run_id',     v_parent_run_id,
    'fiscal_year_id',    p_fiscal_year_id,
    'periods_replayed',  jsonb_array_length(v_period_results),
    'total_divergences', v_total_divs,
    'total_entries',     v_total_entries,
    'total_lines',       v_total_lines,
    'combined_hash',     v_combined_hash,
    'period_results',    v_period_results,
    'replayed_at',       now()
  );

EXCEPTION WHEN OTHERS THEN
  BEGIN
    UPDATE public.ledger_replay_runs SET
      status       = 'failed',
      completed_at = now(),
      error_detail = SQLERRM
    WHERE id = v_parent_run_id AND status = 'running';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.replay_fiscal_year(uuid, uuid, uuid) IS
  'Replays all financial periods in a fiscal year in chronological order. '
  'Creates parent ledger_replay_runs (type=fiscal_year) and calls replay_period_state per period. '
  'Returns {status, periods_replayed, total_divergences, combined_hash, period_results[]}.';

GRANT EXECUTE ON FUNCTION public.replay_fiscal_year(uuid, uuid, uuid) TO service_role;

-- ── View: v_subledger_close_status ────────────────────────────────────────────

CREATE VIEW public.v_subledger_close_status
WITH (security_invoker = true)
AS
SELECT
  fp.id                   AS period_id,
  fp.organization_id,
  fp.period_start,
  fp.period_end,
  fp.status               AS period_status,
  COUNT(scj.id)           AS subledgers_checked,
  COUNT(scj.id) FILTER (WHERE scj.status = 'completed') AS subledgers_completed,
  COUNT(scj.id) FILTER (WHERE scj.status = 'failed')    AS subledgers_failed,
  COUNT(scj.id) FILTER (WHERE scj.status = 'skipped')   AS subledgers_skipped,
  COUNT(scj.id) FILTER (WHERE scj.status = 'pending')   AS subledgers_pending,
  (COUNT(scj.id) FILTER (WHERE scj.status IN ('failed','pending')) = 0
   AND COUNT(scj.id) > 0)  AS all_subledgers_ready,
  MAX(scj.updated_at)       AS last_checked_at,
  jsonb_agg(jsonb_build_object(
    'subledger_type',  scj.subledger_type,
    'status',          scj.status,
    'items_found',     scj.items_found,
    'items_blocking',  scj.items_blocking
  ) ORDER BY scj.subledger_type) FILTER (WHERE scj.id IS NOT NULL) AS subledger_detail
FROM public.financial_periods fp
LEFT JOIN public.subledger_close_jobs scj
  ON  scj.organization_id = fp.organization_id
  AND scj.period_id       = fp.id
GROUP BY fp.id, fp.organization_id, fp.period_start, fp.period_end, fp.status;

COMMENT ON VIEW public.v_subledger_close_status IS
  'Per-period subledger close readiness dashboard. '
  'all_subledgers_ready = true when no subledger has failed or pending status. '
  'security_invoker = true.';

GRANT SELECT ON public.v_subledger_close_status TO authenticated, service_role;
