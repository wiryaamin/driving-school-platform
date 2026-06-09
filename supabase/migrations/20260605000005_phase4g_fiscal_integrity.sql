-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260605000005_phase4g_fiscal_integrity.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4G — Fiscal Integrity, Replay Validation & Canonical Exports
--
-- Implements deterministic accounting replay validation and canonical export
-- serialization for audit reproducibility and multi-year fiscal integrity:
--
--   close_dependency_validations  — log of chronological close dependency checks
--   accounting_replay_runs        — log of ledger replay validation runs
--   canonical_accounting_exports  — fully immutable canonical period export records
--
--   SECURITY DEFINER functions:
--   validate_chronological_close_dependencies(...)
--     → Checks that all prior periods are closed/locked before current period close.
--       Blocks close if open periods exist chronologically before p_period_id.
--       Inserts a close_dependency_validations record and returns JSONB result.
--
--   run_accounting_replay_validation(...)
--     → Re-derives account balances from journal_lines and compares to
--       account_balances cache. Returns discrepancy report. Enforces
--       deterministic accounting replay validity.
--
--   generate_canonical_accounting_export(...)
--     → Computes a SHA-256 hash of all posted journal_lines for the period
--       (sorted deterministically). Inserts an immutable canonical_accounting_exports
--       record. Enables audit reproducibility and canonical export stability.
--
--   run_multi_year_fiscal_integrity_check(...)
--     → Cross-year checks: period continuity, balance sheet equation,
--       opening balance propagation. Returns structured integrity report.
--
--   View:
--   v_fiscal_integrity_dashboard — per-period integrity status summary
--
-- Canonical export hash:
--   SHA-256 of pipe-delimited rows: entry_date|voucher_series|voucher_number|
--   account_code|debit_amount|credit_amount|description
--   sorted by entry_date ASC, voucher_number ASC, account_code ASC
--
-- Dependencies:
--   20260603000001_phase4e_reconciliation_core.sql — fiscal_years table
--   20260602000001_phase4d_ledger_core.sql — journal_entries, journal_lines,
--                                             account_balances
--   20260530000001_phase4a_commercial_core.sql — financial_periods
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Close Dependency Validations ───────────────────────────────────
-- Log of chronological close dependency checks. One record per check run.
-- Referenced by period-close workflows to enforce lock-chain fiscal integrity.

CREATE TABLE public.close_dependency_validations (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid          NOT NULL REFERENCES public.organizations(id)    ON DELETE RESTRICT,
  period_id           uuid          NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  status              text          NOT NULL CHECK (status IN ('ok', 'blocking_periods')),
  blocking_count      int           NOT NULL DEFAULT 0,
  blocking_periods    jsonb         NOT NULL DEFAULT '[]',
  validated_at        timestamptz   NOT NULL DEFAULT now(),
  validated_by        uuid                   REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.close_dependency_validations IS
  'Log of close dependency validation runs. '
  'A period can only close if all prior open periods are also closed. '
  'blocking_periods: JSONB array of {period_id, period_start, period_end, status} for any blockers.';

ALTER TABLE public.close_dependency_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cdv_org_read"
  ON public.close_dependency_validations FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

GRANT SELECT        ON public.close_dependency_validations TO authenticated;
GRANT SELECT, INSERT ON public.close_dependency_validations TO service_role;

-- ── Section 2: Accounting Replay Runs ────────────────────────────────────────
-- Log of ledger replay validation runs. Each run re-derives account balances
-- from journal_lines and compares to account_balances cache.

CREATE TABLE public.accounting_replay_runs (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid          NOT NULL REFERENCES public.organizations(id)    ON DELETE RESTRICT,
  period_id           uuid          NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  status              text          NOT NULL CHECK (status IN ('valid', 'discrepancies_found')),
  accounts_checked    int           NOT NULL DEFAULT 0,
  discrepancy_count   int           NOT NULL DEFAULT 0,
  discrepancies       jsonb         NOT NULL DEFAULT '[]',
  run_duration_ms     int,
  run_at              timestamptz   NOT NULL DEFAULT now(),
  run_by              uuid                   REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.accounting_replay_runs IS
  'Log of ledger replay validation runs. '
  'Re-derives account_balances from journal_lines and compares to cached values. '
  'discrepancies: JSONB array of {account_code, cached_balance, derived_balance, diff}.';

ALTER TABLE public.accounting_replay_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arr_org_read"
  ON public.accounting_replay_runs FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

GRANT SELECT        ON public.accounting_replay_runs TO authenticated;
GRANT SELECT, INSERT ON public.accounting_replay_runs TO service_role;

-- ── Section 3: Canonical Accounting Exports ───────────────────────────────────
-- Fully immutable canonical period export records. SHA-256 hash computed over
-- all posted journal_lines for the period in deterministic sort order.

CREATE TABLE public.canonical_accounting_exports (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid          NOT NULL REFERENCES public.organizations(id)    ON DELETE RESTRICT,
  period_id           uuid          NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  content_hash        text          NOT NULL,
  journal_entry_count int           NOT NULL DEFAULT 0,
  journal_line_count  int           NOT NULL DEFAULT 0,
  total_debit         numeric(14,2) NOT NULL DEFAULT 0,
  total_credit        numeric(14,2) NOT NULL DEFAULT 0,
  notes               text,
  metadata            jsonb         NOT NULL DEFAULT '{}',
  created_at          timestamptz   NOT NULL DEFAULT now(),
  created_by          uuid                   REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.canonical_accounting_exports IS
  'Fully immutable canonical accounting exports per period. '
  'content_hash: SHA-256 of all posted journal_lines sorted deterministically. '
  'Enables audit reproducibility and canonical export stability. '
  'ALL UPDATE/DELETE blocked by trigger.';

CREATE OR REPLACE FUNCTION public.prevent_canonical_export_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'CANONICAL_EXPORT_IMMUTABLE: canonical accounting exports are permanent audit records.'
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.prevent_canonical_export_mutation() IS
  'BEFORE UPDATE OR DELETE guard on canonical_accounting_exports. Fully immutable.';

CREATE TRIGGER canonical_accounting_exports_immutability
  BEFORE UPDATE OR DELETE ON public.canonical_accounting_exports
  FOR EACH ROW EXECUTE FUNCTION public.prevent_canonical_export_mutation();

ALTER TABLE public.canonical_accounting_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cae_org_read"
  ON public.canonical_accounting_exports FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

GRANT SELECT        ON public.canonical_accounting_exports TO authenticated;
GRANT SELECT, INSERT ON public.canonical_accounting_exports TO service_role;

-- ── FUNCTION: validate_chronological_close_dependencies ──────────────────────
-- Checks that no financial_period with period_end BEFORE p_period's period_start
-- is still 'open' for the same organization.
-- Returns JSONB result and inserts a close_dependency_validations log record.

CREATE OR REPLACE FUNCTION public.validate_chronological_close_dependencies(
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
  v_blocking        jsonb := '[]'::jsonb;
  v_blocking_count  int   := 0;
  v_status          text;
  v_result          jsonb;
  v_validation_id   uuid;
BEGIN
  SELECT * INTO v_period FROM public.financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: % does not exist', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Find open periods that end before this period starts
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'period_id',    fp.id,
        'period_start', fp.period_start,
        'period_end',   fp.period_end,
        'status',       fp.status
      )
      ORDER BY fp.period_start ASC
    ),
    COUNT(*)
  INTO v_blocking, v_blocking_count
  FROM public.financial_periods fp
  WHERE fp.organization_id = p_org_id
    AND fp.id              <> p_period_id
    AND fp.period_end       < v_period.period_start
    AND fp.status           = 'open';

  v_blocking       := COALESCE(v_blocking, '[]'::jsonb);
  v_blocking_count := COALESCE(v_blocking_count, 0);
  v_status         := CASE WHEN v_blocking_count = 0 THEN 'ok' ELSE 'blocking_periods' END;

  INSERT INTO public.close_dependency_validations
    (organization_id, period_id, status, blocking_count, blocking_periods, validated_by)
  VALUES
    (p_org_id, p_period_id, v_status, v_blocking_count, v_blocking, p_actor_id)
  RETURNING id INTO v_validation_id;

  v_result := jsonb_build_object(
    'status',           v_status,
    'period_id',        p_period_id,
    'blocking_count',   v_blocking_count,
    'blocking_periods', v_blocking,
    'validation_id',    v_validation_id,
    'validated_at',     now()
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.validate_chronological_close_dependencies(uuid, uuid, uuid) IS
  'Checks that all prior financial_periods are closed/locked before closing p_period_id. '
  'Returns {status, blocking_count, blocking_periods, validation_id}. '
  'status=''ok'' means safe to proceed with period close.';

GRANT EXECUTE ON FUNCTION public.validate_chronological_close_dependencies(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: run_accounting_replay_validation ────────────────────────────────
-- Re-derives account balances from posted journal_lines for a period.
-- Compares derived balances to account_balances cache.
-- Returns JSONB discrepancy report and inserts an accounting_replay_runs record.

CREATE OR REPLACE FUNCTION public.run_accounting_replay_validation(
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
  v_discrepancies     jsonb := '[]'::jsonb;
  v_discrepancy_count int   := 0;
  v_accounts_checked  int   := 0;
  v_status            text;
  v_result            jsonb;
  v_start_ts          timestamptz := clock_timestamp();
  v_rec               record;
BEGIN
  -- Derive closing balances from journal_lines for this period
  -- and compare to account_balances cache
  FOR v_rec IN
    WITH derived AS (
      SELECT
        jl.account_code,
        SUM(jl.debit_amount)  AS derived_debit,
        SUM(jl.credit_amount) AS derived_credit,
        SUM(jl.debit_amount) - SUM(jl.credit_amount) AS derived_net
      FROM   public.journal_lines  jl
      JOIN   public.journal_entries je ON je.id = jl.entry_id
      WHERE  je.organization_id    = p_org_id
        AND  je.financial_period_id = p_period_id
        AND  je.status              = 'posted'
      GROUP  BY jl.account_code
    ),
    cached AS (
      SELECT
        account_code,
        (opening_balance + debit_movement - credit_movement) AS cached_closing,
        debit_movement,
        credit_movement
      FROM public.account_balances
      WHERE organization_id    = p_org_id
        AND financial_period_id = p_period_id
    )
    SELECT
      d.account_code,
      COALESCE(c.cached_closing, 0)          AS cached_balance,
      COALESCE(d.derived_debit,  0)          AS derived_debit,
      COALESCE(d.derived_credit, 0)          AS derived_credit,
      d.derived_net                          AS derived_closing,
      ABS(COALESCE(c.cached_closing, 0) - d.derived_net) AS diff
    FROM   derived d
    LEFT   JOIN cached c USING (account_code)
    WHERE  ABS(COALESCE(c.cached_closing, 0) - d.derived_net) >= 0.02
    ORDER  BY diff DESC
  LOOP
    v_discrepancies := v_discrepancies || jsonb_build_array(
      jsonb_build_object(
        'account_code',   v_rec.account_code,
        'cached_balance', v_rec.cached_balance,
        'derived_closing',v_rec.derived_closing,
        'diff',           v_rec.diff
      )
    );
    v_discrepancy_count := v_discrepancy_count + 1;
  END LOOP;

  -- Count total accounts checked
  SELECT COUNT(DISTINCT jl.account_code)
  INTO   v_accounts_checked
  FROM   public.journal_lines jl
  JOIN   public.journal_entries je ON je.id = jl.entry_id
  WHERE  je.organization_id    = p_org_id
    AND  je.financial_period_id = p_period_id
    AND  je.status              = 'posted';

  v_status := CASE WHEN v_discrepancy_count = 0 THEN 'valid' ELSE 'discrepancies_found' END;

  INSERT INTO public.accounting_replay_runs
    (organization_id, period_id, status, accounts_checked, discrepancy_count,
     discrepancies, run_duration_ms, run_by)
  VALUES
    (p_org_id, p_period_id, v_status, v_accounts_checked, v_discrepancy_count,
     v_discrepancies,
     EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start_ts))::int,
     p_actor_id)
  RETURNING id INTO v_run_id;

  v_result := jsonb_build_object(
    'status',             v_status,
    'run_id',             v_run_id,
    'period_id',          p_period_id,
    'accounts_checked',   v_accounts_checked,
    'discrepancy_count',  v_discrepancy_count,
    'discrepancies',      v_discrepancies,
    'run_at',             now()
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.run_accounting_replay_validation(uuid, uuid, uuid) IS
  'Re-derives account closing balances from posted journal_lines and compares to '
  'account_balances cache. Returns {status, discrepancy_count, discrepancies}. '
  'status=''valid'' means account_balances cache is consistent with the ledger.';

GRANT EXECUTE ON FUNCTION public.run_accounting_replay_validation(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: generate_canonical_accounting_export ───────────────────────────
-- Computes a SHA-256 hash over all posted journal_lines for a period.
-- Sort order: entry_date ASC, voucher_number ASC, account_code ASC.
-- Hash input row: entry_date|series|voucher_number|account_code|debit|credit|description
-- Inserts an immutable canonical_accounting_exports record.
-- Idempotent: raises exception if a canonical export already exists for this period.

CREATE OR REPLACE FUNCTION public.generate_canonical_accounting_export(
  p_org_id    uuid,
  p_period_id uuid,
  p_notes     text DEFAULT NULL,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_export_id        uuid;
  v_hash_input       text := '';
  v_content_hash     text;
  v_entry_count      int  := 0;
  v_line_count       int  := 0;
  v_total_debit      numeric(14,2) := 0;
  v_total_credit     numeric(14,2) := 0;
  v_rec              record;
BEGIN
  -- Check idempotency: one canonical export per period
  IF EXISTS (
    SELECT 1 FROM public.canonical_accounting_exports
    WHERE organization_id = p_org_id AND period_id = p_period_id
  ) THEN
    RAISE EXCEPTION
      'CANONICAL_EXPORT_EXISTS: a canonical export already exists for period %', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Build canonical hash string from all posted journal lines
  FOR v_rec IN
    SELECT
      je.entry_date::text           AS entry_date,
      je.voucher_series             AS series,
      COALESCE(je.voucher_number::text, '')  AS voucher_number,
      jl.account_code,
      jl.debit_amount::text         AS debit,
      jl.credit_amount::text        AS credit,
      COALESCE(jl.description, '')  AS description
    FROM   public.journal_lines  jl
    JOIN   public.journal_entries je ON je.id = jl.entry_id
    WHERE  je.organization_id    = p_org_id
      AND  je.financial_period_id = p_period_id
      AND  je.status              = 'posted'
    ORDER  BY je.entry_date ASC, je.voucher_number ASC NULLS LAST, jl.account_code ASC
  LOOP
    v_hash_input  := v_hash_input ||
      v_rec.entry_date     || '|' ||
      v_rec.series         || '|' ||
      v_rec.voucher_number || '|' ||
      v_rec.account_code   || '|' ||
      v_rec.debit          || '|' ||
      v_rec.credit         || '|' ||
      v_rec.description    || E'\n';
    v_line_count  := v_line_count + 1;
    v_total_debit  := v_total_debit  + v_rec.debit::numeric;
    v_total_credit := v_total_credit + v_rec.credit::numeric;
  END LOOP;

  -- Count distinct journal entries
  SELECT COUNT(DISTINCT je.id)
  INTO   v_entry_count
  FROM   public.journal_entries je
  WHERE  je.organization_id    = p_org_id
    AND  je.financial_period_id = p_period_id
    AND  je.status              = 'posted';

  -- SHA-256 hash of canonical string
  v_content_hash := encode(sha256(v_hash_input::bytea), 'hex');

  INSERT INTO public.canonical_accounting_exports
    (organization_id, period_id, content_hash, journal_entry_count, journal_line_count,
     total_debit, total_credit, notes, created_by)
  VALUES
    (p_org_id, p_period_id, v_content_hash, v_entry_count, v_line_count,
     v_total_debit, v_total_credit, p_notes, p_actor_id)
  RETURNING id INTO v_export_id;

  RETURN v_export_id;
END;
$$;

COMMENT ON FUNCTION public.generate_canonical_accounting_export(uuid, uuid, text, uuid) IS
  'Generates a deterministic SHA-256 canonical export of all posted journal_lines '
  'for a period. Sort: entry_date ASC, voucher_number ASC, account_code ASC. '
  'Inserts immutable canonical_accounting_exports record. '
  'Idempotent guard: raises if export already exists for this period. '
  'Returns the canonical_accounting_exports.id.';

GRANT EXECUTE ON FUNCTION public.generate_canonical_accounting_export(uuid, uuid, text, uuid) TO service_role;

-- ── FUNCTION: run_multi_year_fiscal_integrity_check ──────────────────────────
-- Performs cross-year fiscal integrity checks on all periods in a fiscal year.
-- Checks:
--   1. All periods are closed or locked (none open)
--   2. Balance sheet equation: SUM(assets) ≈ SUM(liabilities + equity)
--   3. Opening balances of period N+1 = closing balances of period N
-- Returns structured JSONB integrity report.

CREATE OR REPLACE FUNCTION public.run_multi_year_fiscal_integrity_check(
  p_org_id        uuid,
  p_fiscal_year_id uuid,
  p_actor_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fiscal_year    record;
  v_checks         jsonb := '[]'::jsonb;
  v_overall_status text  := 'ok';
  v_result         jsonb;
  v_open_count     int;
  v_total_assets   numeric(14,2);
  v_total_liab_eq  numeric(14,2);
  v_bs_diff        numeric(14,2);
  v_continuity_ok  boolean := true;
  v_prev_period_id uuid;
  v_rec            record;
BEGIN
  SELECT * INTO v_fiscal_year FROM public.fiscal_years WHERE id = p_fiscal_year_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: % does not exist', p_fiscal_year_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Check 1: All periods in fiscal year must be closed or locked
  SELECT COUNT(*)
  INTO   v_open_count
  FROM   public.financial_periods fp
  WHERE  fp.organization_id = p_org_id
    AND  fp.period_start   >= v_fiscal_year.year_start
    AND  fp.period_end     <= v_fiscal_year.year_end
    AND  fp.status          = 'open';

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check',    'all_periods_closed',
    'status',   CASE WHEN v_open_count = 0 THEN 'ok' ELSE 'failed' END,
    'detail',   CASE WHEN v_open_count = 0
                     THEN 'All periods in fiscal year are closed or locked'
                     ELSE v_open_count::text || ' open period(s) found'
                END
  ));

  IF v_open_count > 0 THEN v_overall_status := 'failed'; END IF;

  -- Check 2: Balance sheet equation (final period of fiscal year)
  -- Assets (account_type='asset', debit-normal) closing balance should be positive net
  -- Liabilities + Equity should be negative (credit-normal) in equal magnitude
  WITH last_period AS (
    SELECT id FROM public.financial_periods
    WHERE  organization_id = p_org_id
      AND  period_start   >= v_fiscal_year.year_start
      AND  period_end     <= v_fiscal_year.year_end
    ORDER  BY period_end DESC LIMIT 1
  ),
  balances AS (
    SELECT
      bac.account_type,
      SUM(ab.closing_balance) AS total_balance
    FROM   public.account_balances ab
    JOIN   public.bas_account_catalog bac ON bac.account_code = ab.account_code
    JOIN   last_period lp ON lp.id = ab.financial_period_id
    WHERE  ab.organization_id = p_org_id
    GROUP  BY bac.account_type
  )
  SELECT
    COALESCE(SUM(total_balance) FILTER (WHERE account_type = 'asset'), 0),
    COALESCE(SUM(ABS(total_balance)) FILTER (WHERE account_type IN ('liability', 'equity')), 0)
  INTO v_total_assets, v_total_liab_eq
  FROM balances;

  v_bs_diff := ABS(v_total_assets - v_total_liab_eq);

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check',      'balance_sheet_equation',
    'status',     CASE WHEN v_bs_diff < 1.00 THEN 'ok' ELSE 'failed' END,
    'total_assets',    v_total_assets,
    'total_liab_eq',   v_total_liab_eq,
    'difference',      v_bs_diff
  ));

  IF v_bs_diff >= 1.00 THEN v_overall_status := 'failed'; END IF;

  -- Check 3: Opening balance continuity between adjacent periods
  v_prev_period_id := NULL;
  FOR v_rec IN
    SELECT fp.id, fp.period_start, fp.period_end
    FROM   public.financial_periods fp
    WHERE  fp.organization_id = p_org_id
      AND  fp.period_start   >= v_fiscal_year.year_start
      AND  fp.period_end     <= v_fiscal_year.year_end
    ORDER  BY fp.period_start ASC
  LOOP
    IF v_prev_period_id IS NOT NULL THEN
      -- Check that opening_balance of current period = closing_balance of prior period
      DECLARE
        v_continuity_diff numeric(14,2);
      BEGIN
        SELECT COALESCE(SUM(ABS(
          COALESCE(curr.opening_balance, 0) -
          COALESCE(prev.closing_balance, 0)
        )), 0)
        INTO v_continuity_diff
        FROM       public.account_balances curr
        FULL OUTER JOIN public.account_balances prev
          ON  prev.organization_id    = p_org_id
          AND prev.financial_period_id = v_prev_period_id
          AND prev.account_code        = curr.account_code
        WHERE curr.organization_id    = p_org_id
          AND curr.financial_period_id = v_rec.id;

        IF v_continuity_diff >= 1.00 THEN
          v_continuity_ok  := false;
          v_overall_status := 'failed';
        END IF;
      END;
    END IF;
    v_prev_period_id := v_rec.id;
  END LOOP;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'check',  'opening_balance_continuity',
    'status', CASE WHEN v_continuity_ok THEN 'ok' ELSE 'failed' END,
    'detail', CASE WHEN v_continuity_ok
                   THEN 'Opening balances match prior-period closing balances'
                   ELSE 'Opening balance discontinuity detected between adjacent periods'
              END
  ));

  v_result := jsonb_build_object(
    'status',         v_overall_status,
    'fiscal_year_id', p_fiscal_year_id,
    'checks',         v_checks,
    'checked_at',     now()
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.run_multi_year_fiscal_integrity_check(uuid, uuid, uuid) IS
  'Performs cross-year fiscal integrity checks: '
  '(1) all periods in fiscal year are closed/locked, '
  '(2) balance sheet equation: assets ≈ liabilities + equity, '
  '(3) opening balance continuity between adjacent periods. '
  'Returns {status, fiscal_year_id, checks[]}.';

GRANT EXECUTE ON FUNCTION public.run_multi_year_fiscal_integrity_check(uuid, uuid, uuid) TO service_role;

-- ── View ───────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_fiscal_integrity_dashboard
WITH (security_invoker = true)
AS
SELECT
  fp.id                                           AS period_id,
  fp.organization_id,
  fp.period_start,
  fp.period_end,
  fp.status                                       AS period_status,
  -- Last close dependency validation
  cdv.status                                      AS close_dep_status,
  cdv.blocking_count,
  cdv.validated_at                                AS close_dep_checked_at,
  -- Last replay validation
  arr.status                                      AS replay_status,
  arr.discrepancy_count,
  arr.accounts_checked,
  arr.run_at                                      AS replay_run_at,
  -- Canonical export
  cae.id IS NOT NULL                              AS has_canonical_export,
  cae.content_hash,
  cae.created_at                                  AS canonical_export_at
FROM  public.financial_periods fp
LEFT  JOIN LATERAL (
    SELECT * FROM public.close_dependency_validations
    WHERE period_id = fp.id ORDER BY validated_at DESC LIMIT 1
  ) cdv ON true
LEFT  JOIN LATERAL (
    SELECT * FROM public.accounting_replay_runs
    WHERE period_id = fp.id ORDER BY run_at DESC LIMIT 1
  ) arr ON true
LEFT  JOIN public.canonical_accounting_exports cae
  ON cae.period_id = fp.id;

COMMENT ON VIEW public.v_fiscal_integrity_dashboard IS
  'Per-period fiscal integrity status: close dependency check, replay validation, '
  'and canonical export status. security_invoker = true.';

GRANT SELECT ON public.v_fiscal_integrity_dashboard TO authenticated, service_role;
