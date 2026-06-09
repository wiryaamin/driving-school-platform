-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260606000001_phase4h_replay_core.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H — Replayable Ledger Governance & Fiscal Integrity (Core)
--
-- Implements the authoritative ledger replay engine:
--   ledger_replay_runs   — immutable log of full state-reconstruction runs
--   replay_snapshots     — immutable per-account reconstructed balance rows
--
-- SECURITY DEFINER functions:
--   replay_period_state(p_org_id, p_period_id, p_actor_id)
--     → Rebuilds all account balances from journal_lines alone (no cache).
--       Inserts one replay_snapshots row per account.
--       Computes SHA-256 deterministic replay hash over sorted account lines.
--       Returns JSONB: {replay_run_id, status, divergence_count, replay_hash, ...}
--
--   validate_balance_reconstruction(p_org_id, p_period_id, p_actor_id)
--     → Runs replay_period_state then compares every reconstructed balance
--       against the account_balances cache.
--       Returns JSONB: {status, total_accounts, divergence_count, divergences[]}
--
-- Replay invariants:
--   • Source of truth is journal_lines — no reliance on account_balances cache
--   • Only status='posted' journal entries are included
--   • Replay hash = SHA-256(account_code|debit|credit per account, sorted ASC)
--   • ledger_replay_runs and replay_snapshots are immutable once created
--
-- Dependencies:
--   20260602000001_phase4d_ledger_core.sql   — journal_entries, journal_lines,
--                                              account_balances
--   20260530000001_phase4a_commercial_core.sql — financial_periods
--   20260603000001_phase4e_reconciliation_core.sql — fiscal_years
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ─────────────────────────────────────────────────────

CREATE TYPE public.ledger_replay_status AS ENUM (
  'running',    -- Replay is currently executing
  'completed',  -- Replay finished; no divergences found
  'failed',     -- Replay aborted due to an error
  'divergent'   -- Replay finished; one or more account divergences detected
);

CREATE TYPE public.ledger_replay_type AS ENUM (
  'period',      -- Single financial period replay
  'fiscal_year', -- All periods in a fiscal year replayed sequentially
  'full'         -- All periods for an organization
);

-- ── Section 2: ledger_replay_runs ─────────────────────────────────────────────
-- Immutable log of comprehensive ledger replay runs.
-- Each run rebuilds account balances from journal_lines only, independent of
-- the account_balances cache. Provides authoritative audit-reproducibility.
-- Distinct from accounting_replay_runs (Phase 4G): that table stores lightweight
-- validation checks; this table stores full state-reconstruction runs with
-- per-account snapshots and deterministic replay hashes.

CREATE TABLE public.ledger_replay_runs (
  id                        uuid                        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id           uuid                        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id                 uuid                                 REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  fiscal_year_id            uuid                                 REFERENCES public.fiscal_years(id) ON DELETE RESTRICT,
  replay_type               public.ledger_replay_type   NOT NULL DEFAULT 'period',
  status                    public.ledger_replay_status NOT NULL DEFAULT 'running',
  started_at                timestamptz                 NOT NULL DEFAULT now(),
  completed_at              timestamptz,
  journal_entries_processed int                         NOT NULL DEFAULT 0 CHECK (journal_entries_processed >= 0),
  journal_lines_processed   int                         NOT NULL DEFAULT 0 CHECK (journal_lines_processed >= 0),
  accounts_reconstructed    int                         NOT NULL DEFAULT 0 CHECK (accounts_reconstructed >= 0),
  divergence_count          int                         NOT NULL DEFAULT 0 CHECK (divergence_count >= 0),
  replay_hash               text,
  error_detail              text,
  actor_id                  uuid                                 REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz                 NOT NULL DEFAULT now(),

  CONSTRAINT lrr_period_or_year CHECK (
    period_id IS NOT NULL OR fiscal_year_id IS NOT NULL OR replay_type = 'full'
  )
);

COMMENT ON TABLE public.ledger_replay_runs IS
  'Immutable log of full ledger state-reconstruction runs. '
  'Each run rebuilds account balances from journal_lines only (source-of-truth replay). '
  'replay_hash: SHA-256 of sorted account_code|debit|credit pairs for deterministic verification. '
  'Distinct from accounting_replay_runs (Phase 4G) which stores lightweight balance-cache checks.';
COMMENT ON COLUMN public.ledger_replay_runs.replay_hash IS
  'SHA-256(account_code|reconstructed_debit|reconstructed_credit, sorted by account_code ASC, concat with ~). '
  'Identical journal state always produces identical hash — enables audit reproducibility.';

CREATE OR REPLACE FUNCTION public.prevent_ledger_replay_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LEDGER_REPLAY_RUN_IMMUTABLE: replay run records are permanent audit logs.'
      USING ERRCODE = 'P0001';
  END IF;
  -- Allow status updates only while run is 'running' (completion update)
  IF OLD.status <> 'running' THEN
    RAISE EXCEPTION 'LEDGER_REPLAY_RUN_IMMUTABLE: only in-progress replay runs may be updated.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ledger_replay_runs_immutability
  BEFORE UPDATE OR DELETE ON public.ledger_replay_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_replay_run_mutation();

-- ── Section 3: replay_snapshots ───────────────────────────────────────────────
-- Immutable per-account reconstructed balance rows produced by replay_period_state.
-- One row per (replay_run_id, account_code). Stores both the reconstructed value
-- (from journal_lines) and the cached value (from account_balances) for comparison.
-- Computed columns expose divergence amounts and a boolean flag.

CREATE TABLE public.replay_snapshots (
  id                     uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id        uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id              uuid          NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  replay_run_id          uuid          NOT NULL REFERENCES public.ledger_replay_runs(id) ON DELETE RESTRICT,
  account_code           text          NOT NULL,
  -- Reconstructed from journal_lines (source of truth)
  reconstructed_debit    numeric(14,2) NOT NULL DEFAULT 0 CHECK (reconstructed_debit >= 0),
  reconstructed_credit   numeric(14,2) NOT NULL DEFAULT 0 CHECK (reconstructed_credit >= 0),
  reconstructed_balance  numeric(14,2) NOT NULL DEFAULT 0,  -- debit - credit net
  -- Cached from account_balances (may diverge if cache is corrupt)
  cached_debit           numeric(14,2),
  cached_credit          numeric(14,2),
  cached_balance         numeric(14,2),
  -- Divergence analysis (GENERATED)
  divergence_amount      numeric(14,2) GENERATED ALWAYS AS (
    COALESCE(ABS(reconstructed_balance - COALESCE(cached_balance, reconstructed_balance)), 0)
  ) STORED,
  has_divergence         boolean GENERATED ALWAYS AS (
    CASE WHEN ABS(reconstructed_balance - COALESCE(cached_balance, reconstructed_balance)) >= 0.01
         THEN true ELSE false END
  ) STORED,
  created_at             timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT rs_run_account_unique UNIQUE (replay_run_id, account_code)
);

COMMENT ON TABLE public.replay_snapshots IS
  'Immutable per-account balance snapshots produced by replay_period_state. '
  'reconstructed_* = values computed from journal_lines only (authoritative). '
  'cached_* = values read from account_balances cache at replay time. '
  'has_divergence = true when |reconstructed_balance - cached_balance| >= 0.01.';

CREATE OR REPLACE FUNCTION public.prevent_replay_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'REPLAY_SNAPSHOT_IMMUTABLE: replay snapshots are permanent audit records.'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER replay_snapshots_immutability
  BEFORE UPDATE OR DELETE ON public.replay_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_replay_snapshot_mutation();

-- ── Section 4: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.ledger_replay_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replay_snapshots   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lrr_org_read"
  ON public.ledger_replay_runs FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

CREATE POLICY "rs_org_read"
  ON public.replay_snapshots FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

-- ── Section 5: Grants ─────────────────────────────────────────────────────────

GRANT SELECT        ON public.ledger_replay_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ledger_replay_runs TO service_role;

GRANT SELECT        ON public.replay_snapshots TO authenticated;
GRANT SELECT, INSERT ON public.replay_snapshots TO service_role;

-- ── FUNCTION: replay_period_state ────────────────────────────────────────────
-- Rebuilds all account balances from scratch using only posted journal_lines.
-- Does NOT read account_balances cache. Pure derivation from source records.
--
-- Algorithm:
--   1. Insert ledger_replay_runs record (status=running)
--   2. Aggregate journal_lines by account_code for the period (posted entries only)
--   3. Join to account_balances cache for divergence comparison
--   4. Insert replay_snapshots rows
--   5. Count divergences (|reconstructed - cached| >= 0.01)
--   6. Compute replay hash: SHA-256(account_code|debit|credit sorted ASC, ~-joined)
--   7. Update ledger_replay_runs to completed/divergent with hash
--   8. Return JSONB result

CREATE OR REPLACE FUNCTION public.replay_period_state(
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
  v_run_id            uuid;
  v_entry_count       int  := 0;
  v_line_count        int  := 0;
  v_account_count     int  := 0;
  v_divergence_count  int  := 0;
  v_replay_hash       text;
  v_final_status      public.ledger_replay_status;
  v_hash_input        text := '';
  v_rec               record;
BEGIN
  -- Validate period exists
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_periods
    WHERE id = p_period_id AND organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % does not exist for org %',
      p_period_id, p_org_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Create replay run record
  INSERT INTO public.ledger_replay_runs(
    organization_id, period_id, replay_type, status, actor_id
  )
  VALUES (p_org_id, p_period_id, 'period', 'running', p_actor_id)
  RETURNING id INTO v_run_id;

  -- Count source journal data
  SELECT COUNT(DISTINCT je.id), COUNT(jl.id)
  INTO   v_entry_count, v_line_count
  FROM   public.journal_entries je
  JOIN   public.journal_lines   jl ON jl.entry_id = je.id
  WHERE  je.organization_id    = p_org_id
    AND  je.financial_period_id = p_period_id
    AND  je.status              = 'posted';

  -- Insert replay_snapshots: one row per account, reconstructed from journal_lines
  INSERT INTO public.replay_snapshots(
    organization_id, period_id, replay_run_id, account_code,
    reconstructed_debit, reconstructed_credit, reconstructed_balance,
    cached_debit, cached_credit, cached_balance
  )
  SELECT
    p_org_id,
    p_period_id,
    v_run_id,
    d.account_code,
    d.total_debit,
    d.total_credit,
    d.total_debit - d.total_credit         AS reconstructed_balance,
    ab.debit_movement                       AS cached_debit,
    ab.credit_movement                      AS cached_credit,
    ab.opening_balance + ab.debit_movement
      - ab.credit_movement                  AS cached_balance
  FROM (
    SELECT
      jl.account_code,
      SUM(jl.debit_amount)  AS total_debit,
      SUM(jl.credit_amount) AS total_credit
    FROM   public.journal_lines  jl
    JOIN   public.journal_entries je ON je.id = jl.entry_id
    WHERE  je.organization_id    = p_org_id
      AND  je.financial_period_id = p_period_id
      AND  je.status              = 'posted'
    GROUP  BY jl.account_code
  ) d
  LEFT JOIN public.account_balances ab
    ON  ab.organization_id    = p_org_id
    AND ab.financial_period_id = p_period_id
    AND ab.account_code        = d.account_code;

  GET DIAGNOSTICS v_account_count = ROW_COUNT;

  -- Count divergences
  SELECT COUNT(*)
  INTO   v_divergence_count
  FROM   public.replay_snapshots
  WHERE  replay_run_id  = v_run_id
    AND  has_divergence = true;

  -- Build deterministic replay hash string (sorted by account_code)
  SELECT string_agg(
    account_code              || '|' ||
    reconstructed_debit::text || '|' ||
    reconstructed_credit::text,
    '~' ORDER BY account_code ASC
  )
  INTO v_hash_input
  FROM public.replay_snapshots
  WHERE replay_run_id = v_run_id;

  v_replay_hash  := encode(sha256(COALESCE(v_hash_input, '')::bytea), 'hex');
  v_final_status := CASE WHEN v_divergence_count > 0 THEN 'divergent' ELSE 'completed' END;

  -- Finalise the replay run (immutability trigger allows update when status='running')
  UPDATE public.ledger_replay_runs SET
    status                    = v_final_status,
    completed_at              = now(),
    journal_entries_processed = v_entry_count,
    journal_lines_processed   = v_line_count,
    accounts_reconstructed    = v_account_count,
    divergence_count          = v_divergence_count,
    replay_hash               = v_replay_hash
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'replay_run_id',             v_run_id,
    'status',                    v_final_status,
    'period_id',                 p_period_id,
    'journal_entries_processed', v_entry_count,
    'journal_lines_processed',   v_line_count,
    'accounts_reconstructed',    v_account_count,
    'divergence_count',          v_divergence_count,
    'replay_hash',               v_replay_hash,
    'run_at',                    now()
  );

EXCEPTION WHEN OTHERS THEN
  -- Mark run as failed before re-raising
  BEGIN
    UPDATE public.ledger_replay_runs SET
      status       = 'failed',
      completed_at = now(),
      error_detail = SQLERRM
    WHERE id = v_run_id AND status = 'running';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.replay_period_state(uuid, uuid, uuid) IS
  'Full ledger state reconstruction from journal_lines only (no cache reliance). '
  'Creates ledger_replay_runs record and replay_snapshots per account. '
  'Returns {replay_run_id, status, divergence_count, replay_hash}. '
  'status=''completed'' = cache consistent; ''divergent'' = cache discrepancies found.';

GRANT EXECUTE ON FUNCTION public.replay_period_state(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: validate_balance_reconstruction ────────────────────────────────
-- Runs a period replay and returns a detailed comparison between reconstructed
-- account balances and the account_balances cache.
-- Useful for confirming that the cache is consistent with the authoritative ledger.

CREATE OR REPLACE FUNCTION public.validate_balance_reconstruction(
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
  v_replay_result  jsonb;
  v_run_id         uuid;
  v_divergences    jsonb := '[]'::jsonb;
  v_total_accounts int   := 0;
  v_div_count      int   := 0;
  v_status         text;
  v_rec            record;
BEGIN
  -- Run the full replay
  v_replay_result := public.replay_period_state(p_org_id, p_period_id, p_actor_id);
  v_run_id        := (v_replay_result->>'replay_run_id')::uuid;

  -- Collect divergent accounts
  FOR v_rec IN
    SELECT
      account_code,
      reconstructed_debit,
      reconstructed_credit,
      reconstructed_balance,
      cached_balance,
      divergence_amount
    FROM public.replay_snapshots
    WHERE replay_run_id  = v_run_id
      AND has_divergence = true
    ORDER BY divergence_amount DESC
  LOOP
    v_divergences := v_divergences || jsonb_build_array(jsonb_build_object(
      'account_code',          v_rec.account_code,
      'reconstructed_balance', v_rec.reconstructed_balance,
      'cached_balance',        v_rec.cached_balance,
      'divergence_amount',     v_rec.divergence_amount
    ));
    v_div_count := v_div_count + 1;
  END LOOP;

  v_total_accounts := (v_replay_result->>'accounts_reconstructed')::int;
  v_status := CASE WHEN v_div_count = 0 THEN 'valid' ELSE 'divergences_found' END;

  RETURN jsonb_build_object(
    'status',         v_status,
    'replay_run_id',  v_run_id,
    'period_id',      p_period_id,
    'total_accounts', v_total_accounts,
    'divergence_count', v_div_count,
    'divergences',    v_divergences,
    'replay_hash',    v_replay_result->>'replay_hash',
    'validated_at',   now()
  );
END;
$$;

COMMENT ON FUNCTION public.validate_balance_reconstruction(uuid, uuid, uuid) IS
  'Runs full ledger replay and compares reconstructed balances to account_balances cache. '
  'Returns {status, total_accounts, divergence_count, divergences[]}. '
  'status=''valid'' = cache is consistent with ledger; ''divergences_found'' = discrepancies detected.';

GRANT EXECUTE ON FUNCTION public.validate_balance_reconstruction(uuid, uuid, uuid) TO service_role;

-- ── Section 6: Permissions ────────────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'finance:replay:read',    'finance', 'replay',    'read',    'View ledger replay runs and balance reconstruction results'),
  (gen_random_uuid(), 'finance:replay:manage',  'finance', 'replay',    'manage',  'Execute ledger replay runs and governance operations'),
  (gen_random_uuid(), 'finance:governance:manage', 'finance', 'governance', 'manage', 'Manage schedule lineage, subledger close, and reopen operations')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_owner'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:replay:read', 'finance:replay:manage', 'finance:governance:manage'
  ])
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name IN ('org_admin', 'finance_admin')
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:replay:read', 'finance:replay:manage', 'finance:governance:manage'
  ])
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_manager'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY['finance:replay:read'])
ON CONFLICT DO NOTHING;
