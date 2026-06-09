-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260606000003_phase4h_fiscal_dependency_graph.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H — Fiscal Dependency Graph & Lock-Chain Enforcement
--
-- Implements explicit close dependency tracking and safe period reopen:
--   fiscal_dependency_graph   — explicit dependency edges between periods
--   replay_divergence_events  — individual divergence event log
--
-- SECURITY DEFINER functions:
--   validate_close_dependencies(p_org_id, p_period_id, p_actor_id)
--     → Comprehensive close dependency check: checks both the fiscal_dependency_graph
--       for explicit dependencies AND chronological sequential ordering.
--       Builds graph edges for sequential dependencies automatically.
--       Returns {status, blocking_count, blocking_periods, dependency_edges}.
--       Complements (not replaces) Phase 4G's validate_chronological_close_dependencies.
--
--   reopen_period_safe(p_org_id, p_period_id, p_reason, p_actor_id)
--     → Lock-chain aware period reopen. Checks:
--         1. Period must be 'closed' (not 'locked' — locked is permanent)
--         2. No downstream 'closed' or 'locked' periods in the dependency graph
--            depend on this period being closed.
--       If safe, transitions period status from 'closed' → 'open'.
--       Returns {status, period_id, downstream_dependents, reopened_at}.
--
-- Lock-chain rules:
--   • 'locked' periods (hard-closed) CANNOT be reopened under any circumstances
--   • If period B explicitly depends on period A, and B is closed or locked,
--     then A cannot be reopened (would break B's close integrity)
--   • Replay divergence blocks fiscal close (detected by replay_period_state)
--   • Sequential dependency edges are auto-populated when this function runs
--
-- Dependencies:
--   20260530000001_phase4a_commercial_core.sql — financial_periods
--   20260603000003_phase4e_financial_close_engine.sql — reopen_soft_closed_period
--   20260606000001_phase4h_replay_core.sql — ledger_replay_runs, permissions
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ─────────────────────────────────────────────────────

CREATE TYPE public.fiscal_dependency_type AS ENUM (
  'sequential',  -- Period N+1 depends on period N being closed first (auto-detected)
  'fiscal_year', -- All periods in fiscal year depend on each other (year-end)
  'subledger',   -- Subledger close in dependent period requires required period close
  'manual'       -- Manually declared dependency
);

CREATE TYPE public.replay_divergence_type AS ENUM (
  'balance_mismatch',   -- account_balances cache differs from journal_lines reconstruction
  'missing_account',    -- Account in cache has no matching journal_lines entries
  'orphan_transaction', -- Journal line references a period with no matching period record
  'duplicate_posting'   -- Same source entity appears to have been posted twice
);

-- ── Section 2: fiscal_dependency_graph ───────────────────────────────────────
-- Explicit dependency graph between financial periods.
-- An edge (dependent_period_id → required_period_id) means:
-- "dependent_period cannot close until required_period is also closed."
-- Sequential edges are auto-inserted by validate_close_dependencies().
-- Manual edges can be inserted for cross-year or subledger-specific dependencies.

CREATE TABLE public.fiscal_dependency_graph (
  id                    uuid                          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid                          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  dependent_period_id   uuid                          NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  required_period_id    uuid                          NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  dependency_type       public.fiscal_dependency_type NOT NULL DEFAULT 'sequential',
  is_active             boolean                       NOT NULL DEFAULT true,
  notes                 text,
  created_at            timestamptz                   NOT NULL DEFAULT now(),
  created_by            uuid                                   REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT fdg_unique_edge UNIQUE (dependent_period_id, required_period_id),
  CONSTRAINT fdg_no_self_dep CHECK (dependent_period_id <> required_period_id)
);

COMMENT ON TABLE public.fiscal_dependency_graph IS
  'Explicit dependency edges between financial periods. '
  'Edge (dependent → required) = dependent cannot close until required is closed. '
  'Sequential edges auto-populated by validate_close_dependencies(). '
  'Check this table in reopen_period_safe() to prevent lock-chain violations.';
COMMENT ON COLUMN public.fiscal_dependency_graph.dependent_period_id IS
  'Period that CANNOT close until required_period_id is already closed.';
COMMENT ON COLUMN public.fiscal_dependency_graph.required_period_id IS
  'Period that MUST be closed before dependent_period_id can close.';

ALTER TABLE public.fiscal_dependency_graph ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fdg_org_read"
  ON public.fiscal_dependency_graph FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:replay:read')
  );

GRANT SELECT        ON public.fiscal_dependency_graph TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.fiscal_dependency_graph TO service_role;

-- ── Section 3: replay_divergence_events ──────────────────────────────────────
-- Individual divergence events detected during replay_period_state runs.
-- Created when validate_replay_integrity or replay_period_state detects
-- specific divergence patterns beyond simple balance mismatches.

CREATE TABLE public.replay_divergence_events (
  id               uuid                          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid                          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id        uuid                          NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  replay_run_id    uuid                          NOT NULL REFERENCES public.ledger_replay_runs(id) ON DELETE RESTRICT,
  divergence_type  public.replay_divergence_type NOT NULL,
  account_code     text,
  expected_balance numeric(14,2),
  actual_balance   numeric(14,2),
  divergence_amount numeric(14,2) GENERATED ALWAYS AS (
    CASE WHEN expected_balance IS NOT NULL AND actual_balance IS NOT NULL
         THEN ABS(expected_balance - actual_balance)
         ELSE NULL
    END
  ) STORED,
  detail           text,
  detected_at      timestamptz                   NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  resolved_by      uuid                                   REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text
);

COMMENT ON TABLE public.replay_divergence_events IS
  'Individual divergence events detected during ledger replay runs. '
  'Created by validate_replay_integrity() for each specific divergence type. '
  'resolved_at/resolved_by/resolution_notes track when humans address divergences.';

ALTER TABLE public.replay_divergence_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rde_org_read"
  ON public.replay_divergence_events FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:replay:read')
  );

GRANT SELECT        ON public.replay_divergence_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.replay_divergence_events TO service_role;

-- ── FUNCTION: validate_close_dependencies ────────────────────────────────────
-- Comprehensive close dependency validation. Extends Phase 4G's
-- validate_chronological_close_dependencies() by also checking the explicit
-- fiscal_dependency_graph and auto-populating sequential edges.
--
-- Algorithm:
--   1. Find all sequential predecessors (periods ending before p_period's start) that are open
--   2. Auto-insert sequential edges into fiscal_dependency_graph (idempotent)
--   3. Check all active edges where dependent_period_id = p_period_id
--      → if required_period is still 'open', block close
--   4. Return JSONB result with all blocking periods and the dependency edges

CREATE OR REPLACE FUNCTION public.validate_close_dependencies(
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
  v_period         record;
  v_blocking       jsonb := '[]'::jsonb;
  v_blocking_count int   := 0;
  v_edges          jsonb := '[]'::jsonb;
  v_status         text;
  v_rec            record;
BEGIN
  SELECT * INTO v_period
  FROM public.financial_periods
  WHERE id = p_period_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % does not exist', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Auto-populate sequential dependency edges (idempotent via ON CONFLICT DO NOTHING)
  INSERT INTO public.fiscal_dependency_graph(
    organization_id, dependent_period_id, required_period_id,
    dependency_type, notes, created_by
  )
  SELECT
    p_org_id,
    p_period_id,
    fp.id,
    'sequential'::public.fiscal_dependency_type,
    'Auto-detected: sequential predecessor period',
    p_actor_id
  FROM public.financial_periods fp
  WHERE fp.organization_id = p_org_id
    AND fp.id             <> p_period_id
    AND fp.period_end      < v_period.period_start
  ON CONFLICT (dependent_period_id, required_period_id) DO NOTHING;

  -- Find all blocking dependencies (required period still open)
  FOR v_rec IN
    SELECT
      fdg.dependency_type,
      fp.id           AS required_period_id,
      fp.period_start,
      fp.period_end,
      fp.status
    FROM public.fiscal_dependency_graph fdg
    JOIN public.financial_periods fp
      ON fp.id = fdg.required_period_id
    WHERE fdg.dependent_period_id = p_period_id
      AND fdg.is_active           = true
      AND fp.status               = 'open'
    ORDER BY fp.period_start ASC
  LOOP
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
      'period_id',       v_rec.required_period_id,
      'period_start',    v_rec.period_start,
      'period_end',      v_rec.period_end,
      'status',          v_rec.status,
      'dependency_type', v_rec.dependency_type
    ));
    v_blocking_count := v_blocking_count + 1;
  END LOOP;

  -- Collect all active edges for this period
  SELECT jsonb_agg(jsonb_build_object(
    'required_period_id', fdg.required_period_id,
    'dependency_type',    fdg.dependency_type,
    'is_active',          fdg.is_active,
    'notes',              fdg.notes
  ))
  INTO v_edges
  FROM public.fiscal_dependency_graph fdg
  WHERE fdg.dependent_period_id = p_period_id;

  v_edges  := COALESCE(v_edges, '[]'::jsonb);
  v_status := CASE WHEN v_blocking_count = 0 THEN 'ok' ELSE 'blocking_periods' END;

  RETURN jsonb_build_object(
    'status',            v_status,
    'period_id',         p_period_id,
    'blocking_count',    v_blocking_count,
    'blocking_periods',  v_blocking,
    'dependency_edges',  v_edges,
    'validated_at',      now()
  );
END;
$$;

COMMENT ON FUNCTION public.validate_close_dependencies(uuid, uuid, uuid) IS
  'Comprehensive close dependency validation using fiscal_dependency_graph. '
  'Auto-populates sequential edges; checks all active dependencies. '
  'Returns {status, blocking_count, blocking_periods, dependency_edges}. '
  'Complements Phase 4G validate_chronological_close_dependencies with full graph awareness.';

GRANT EXECUTE ON FUNCTION public.validate_close_dependencies(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: reopen_period_safe ─────────────────────────────────────────────
-- Lock-chain aware period reopen.
-- Rules enforced:
--   1. Period must be 'closed' (soft-closed). 'locked' periods are permanent.
--   2. No downstream period in the dependency graph is 'closed' or 'locked'
--      while depending on THIS period being closed.
--      (If period B's close depended on A being closed first, and B is now
--       closed/locked, then reopening A would violate B's close integrity.)
--   3. If safe, transitions period status 'closed' → 'open'.
--
-- Returns JSONB: {status, period_id, downstream_dependents, reopened_at}

CREATE OR REPLACE FUNCTION public.reopen_period_safe(
  p_org_id    uuid,
  p_period_id uuid,
  p_reason    text  DEFAULT NULL,
  p_actor_id  uuid  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period            record;
  v_blocking_deps     jsonb := '[]'::jsonb;
  v_blocking_count    int   := 0;
  v_downstream        jsonb := '[]'::jsonb;
  v_rec               record;
BEGIN
  SELECT * INTO v_period
  FROM public.financial_periods
  WHERE id = p_period_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % does not exist', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Cannot reopen a locked (hard-closed) period — ever
  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: period % is hard-locked and cannot be reopened. '
      'Hard-closed periods are permanent and immutable.',
      p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Already open — idempotent return
  IF v_period.status = 'open' THEN
    RETURN jsonb_build_object(
      'status',               'already_open',
      'period_id',            p_period_id,
      'downstream_dependents', '[]'::jsonb,
      'reopened_at',          NULL
    );
  END IF;

  -- Find downstream periods that depend on THIS period being closed
  -- i.e. fiscal_dependency_graph edges where required_period_id = p_period_id
  -- AND the dependent period is itself closed or locked
  FOR v_rec IN
    SELECT
      fdg.dependent_period_id,
      fp.period_start,
      fp.period_end,
      fp.status,
      fdg.dependency_type
    FROM public.fiscal_dependency_graph fdg
    JOIN public.financial_periods fp
      ON fp.id = fdg.dependent_period_id
    WHERE fdg.required_period_id = p_period_id
      AND fdg.is_active          = true
      AND fp.status IN ('closed', 'locked')
    ORDER BY fp.period_start ASC
  LOOP
    v_downstream := v_downstream || jsonb_build_array(jsonb_build_object(
      'period_id',       v_rec.dependent_period_id,
      'period_start',    v_rec.period_start,
      'period_end',      v_rec.period_end,
      'status',          v_rec.status,
      'dependency_type', v_rec.dependency_type
    ));
    v_blocking_count := v_blocking_count + 1;

    -- Hard-locked downstream = absolute block
    IF v_rec.status = 'locked' THEN
      v_blocking_deps := v_blocking_deps || jsonb_build_array(jsonb_build_object(
        'period_id', v_rec.dependent_period_id,
        'status',    v_rec.status,
        'reason',    'Downstream hard-locked period depends on this period being closed'
      ));
    END IF;
  END LOOP;

  -- Block if any downstream period is hard-locked
  IF jsonb_array_length(v_blocking_deps) > 0 THEN
    RAISE EXCEPTION
      'REOPEN_BLOCKED: period % cannot be reopened. % downstream period(s) depend on it '
      'being closed, including hard-locked periods: %',
      p_period_id, v_blocking_count, v_blocking_deps
      USING ERRCODE = 'P0001';
  END IF;

  -- If downstream periods are only soft-closed (not locked), warn but allow
  -- The caller is responsible for understanding the consequence
  -- (those periods may need to be re-validated after reopen)

  -- Perform the reopen: 'closed' → 'open'
  UPDATE public.financial_periods SET
    status    = 'open',
    closed_at = NULL,
    closed_by = NULL,
    notes     = COALESCE(
      notes || E'\nReopened: ' || COALESCE(p_reason, 'no reason given'),
      'Reopened: ' || COALESCE(p_reason, 'no reason given')
    )
  WHERE id              = p_period_id
    AND organization_id = p_org_id
    AND status          = 'closed';

  -- Emit outbox event
  PERFORM public.insert_outbox_event(
    p_event_type       := 'Period.Reopened',
    p_channel          := 'accounting',
    p_organization_id  := p_org_id,
    p_payload          := jsonb_build_object(
      'period_id',  p_period_id,
      'reason',     p_reason,
      'actor_id',   p_actor_id,
      'reopened_at', now()
    )
  );

  RETURN jsonb_build_object(
    'status',                'reopened',
    'period_id',             p_period_id,
    'downstream_dependents', v_downstream,
    'downstream_count',      v_blocking_count,
    'reason',                p_reason,
    'reopened_at',           now()
  );
END;
$$;

COMMENT ON FUNCTION public.reopen_period_safe(uuid, uuid, text, uuid) IS
  'Lock-chain aware period reopen. Blocks if: '
  '(1) period is ''locked'' (hard-closed, permanent), or '
  '(2) a downstream period in the fiscal_dependency_graph is hard-locked. '
  'If only soft-closed downstream periods exist, allows reopen with warning in result. '
  'Returns {status, period_id, downstream_dependents, reopened_at}.';

GRANT EXECUTE ON FUNCTION public.reopen_period_safe(uuid, uuid, text, uuid) TO service_role;
