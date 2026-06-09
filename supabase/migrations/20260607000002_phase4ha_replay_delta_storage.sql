-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260607000002_phase4ha_replay_delta_storage.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H-A — Replay Delta Storage (Storage-Light Architecture)
--
-- Implements the storage-light divergence-only replay model:
--
--   replay_validation_deltas
--     Replaces replay_snapshots as the divergence record.
--     Stores ONLY accounts that diverge between journal_lines reconstruction
--     and account_balances cache. Typically 0 rows per clean run.
--     Immutable once created. MUCH lower storage growth than replay_snapshots.
--
-- Updated SECURITY DEFINER functions:
--
--   replay_period_state(p_org_id, p_period_id, p_actor_id)
--     REFACTORED: Storage-light. No longer inserts into replay_snapshots.
--     Uses deterministic_serializer() for canonical data aggregation.
--     Uses canonical_accounting_hash() for deterministic replay hash.
--     Inserts ONLY divergent accounts into replay_validation_deltas.
--     Also detects 'missing_from_ledger' (cache has entry but journal has none).
--     Also registers period_replay hash in replay_hash_registry.
--     Returns identical JSONB structure for backward compatibility.
--
--   validate_balance_reconstruction(p_org_id, p_period_id, p_actor_id)
--     REFACTORED: reads from replay_validation_deltas (not replay_snapshots).
--
--   validate_replay_integrity(p_org_id, p_period_id, p_actor_id)
--     REFACTORED: reads divergences from replay_validation_deltas (not replay_snapshots).
--
-- Storage reduction:
--   Old: N rows per replay (one per account, always persisted)
--   New: 0–K rows per replay (only divergent accounts)
--   For clean runs: 0 rows stored (vs hundreds previously)
--
-- Dependencies:
--   20260607000001_phase4ha_canonical_hash_foundation.sql
--     — canonical_accounting_hash(), deterministic_serializer()
--   20260606000001_phase4h_replay_core.sql
--     — ledger_replay_runs, replay_period_state (being replaced)
--   20260606000003_phase4h_fiscal_dependency_graph.sql
--     — validate_close_dependencies()
--   20260606000004_phase4h_subledger_orchestration.sql
--     — orchestrate_subledger_close()
--   20260606000005_phase4h_replay_validation.sql
--     — validate_replay_integrity (being replaced), replay_hash_registry
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: replay_delta_type enum ────────────────────────────────────────

CREATE TYPE public.replay_delta_type AS ENUM (
  'balance_mismatch',      -- Reconstructed balance differs from account_balances cache
  'missing_from_cache',    -- Account in journal_lines but absent from account_balances
  'missing_from_ledger',   -- Account in account_balances but absent from journal_lines
  'orphan_transaction'     -- Transaction linked to non-existent period or account
);

-- ── Section 2: replay_validation_deltas ──────────────────────────────────────
-- Storage-light divergence-only replacement for replay_snapshots.
-- One row per (replay_run_id, account_code) — only for divergent accounts.
-- Immutable: created once by replay_period_state; never updated or deleted.
-- delta_amount = GENERATED: ABS(ledger_balance - cache_balance).

CREATE TABLE public.replay_validation_deltas (
  id               uuid                       NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid                       NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id        uuid                       NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  replay_run_id    uuid                       NOT NULL REFERENCES public.ledger_replay_runs(id) ON DELETE RESTRICT,
  account_code     text                       NOT NULL,
  delta_type       public.replay_delta_type   NOT NULL,
  -- Source-of-truth values (from journal_lines reconstruction)
  ledger_debit     numeric(14,2),
  ledger_credit    numeric(14,2),
  ledger_balance   numeric(14,2),
  -- Cache values (from account_balances)
  cache_debit      numeric(14,2),
  cache_credit     numeric(14,2),
  cache_balance    numeric(14,2),
  -- Divergence magnitude (GENERATED)
  delta_amount     numeric(14,2) GENERATED ALWAYS AS (
    ABS(COALESCE(ledger_balance, 0) - COALESCE(cache_balance, 0))
  ) STORED,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rvd_run_account_unique UNIQUE (replay_run_id, account_code)
);

COMMENT ON TABLE public.replay_validation_deltas IS
  'Divergence-only replacement for replay_snapshots. '
  'Persists ONLY accounts that diverge between journal_lines reconstruction and account_balances cache. '
  'Storage-light: 0 rows per clean replay run; only divergent accounts written. '
  'delta_type: balance_mismatch | missing_from_cache | missing_from_ledger | orphan_transaction. '
  'Immutable once created.';

CREATE OR REPLACE FUNCTION public.prevent_replay_validation_delta_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'REPLAY_VALIDATION_DELTA_IMMUTABLE: divergence records are permanent audit evidence.'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER replay_validation_deltas_immutability
  BEFORE UPDATE OR DELETE ON public.replay_validation_deltas
  FOR EACH ROW EXECUTE FUNCTION public.prevent_replay_validation_delta_mutation();

-- ── Section 3: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.replay_validation_deltas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rvd_org_read"
  ON public.replay_validation_deltas FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

-- ── Section 4: Grants ─────────────────────────────────────────────────────────

GRANT SELECT        ON public.replay_validation_deltas TO authenticated;
GRANT SELECT, INSERT ON public.replay_validation_deltas TO service_role;

-- ── FUNCTION: replay_period_state (REFACTORED — storage-light) ────────────────
-- Authoritative ledger state reconstruction from journal_lines only.
-- CHANGED from Phase 4H: no longer inserts into replay_snapshots.
-- Now uses canonical_accounting_hash() for deterministic hash computation.
-- Stores ONLY divergences in replay_validation_deltas (storage-light).
-- Also detects missing_from_ledger (cache accounts absent from journal).
-- Registers period_replay hash in replay_hash_registry after each run.
--
-- Algorithm:
--   1. Validate period. Create ledger_replay_runs record (status=running).
--   2. Call deterministic_serializer() to aggregate journal_lines.
--   3. Compute canonical_accounting_hash() over serialized rows.
--   4. INSERT INTO replay_validation_deltas only where divergence detected.
--   5. Detect missing_from_ledger: cache accounts absent from journal.
--   6. Finalize ledger_replay_runs with hash + divergence_count.
--   7. Upsert replay_hash_registry with period_replay hash.
--   8. Return JSONB (same structure as before for backward compat).

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
  v_entry_count       int            := 0;
  v_line_count        int            := 0;
  v_account_count     int            := 0;
  v_divergence_count  int            := 0;
  v_missing_count     int            := 0;
  v_replay_hash       text;
  v_final_status      public.ledger_replay_status;
  v_canonical_rows    jsonb;
BEGIN
  -- Validate period exists for this org
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_periods
    WHERE id = p_period_id AND organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % does not exist for org %',
      p_period_id, p_org_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Create replay run record (status=running)
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
  WHERE  je.organization_id     = p_org_id
    AND  je.financial_period_id  = p_period_id
    AND  je.status               = 'posted';

  -- Build canonical serialized rows from journal_lines (no cache reliance)
  v_canonical_rows := public.deterministic_serializer(p_org_id, p_period_id);
  v_account_count  := jsonb_array_length(v_canonical_rows);

  -- Compute deterministic canonical hash (storage-light: no full snapshot persisted)
  v_replay_hash := public.canonical_accounting_hash(v_canonical_rows);

  -- ── Divergence detection (storage-light) ──────────────────────────────────
  -- INSERT ONLY divergent accounts into replay_validation_deltas.
  -- For clean periods this inserts 0 rows.

  -- Type 1: balance_mismatch and missing_from_cache
  INSERT INTO public.replay_validation_deltas(
    organization_id, period_id, replay_run_id, account_code,
    delta_type,
    ledger_debit, ledger_credit, ledger_balance,
    cache_debit,  cache_credit,  cache_balance
  )
  SELECT
    p_org_id,
    p_period_id,
    v_run_id,
    d.account_code,
    CASE
      WHEN ab.account_code IS NULL THEN 'missing_from_cache'::public.replay_delta_type
      ELSE                              'balance_mismatch'::public.replay_delta_type
    END,
    d.debit,  d.credit,  d.balance,
    ab.debit_movement,
    ab.credit_movement,
    CASE
      WHEN ab.account_code IS NULL THEN NULL
      ELSE ab.opening_balance + ab.debit_movement - ab.credit_movement
    END
  FROM (
    SELECT
      jl.account_code,
      ROUND(SUM(jl.debit_amount),                          2) AS debit,
      ROUND(SUM(jl.credit_amount),                         2) AS credit,
      ROUND(SUM(jl.debit_amount) - SUM(jl.credit_amount), 2) AS balance
    FROM   public.journal_lines   jl
    JOIN   public.journal_entries je ON je.id = jl.entry_id
    WHERE  je.organization_id     = p_org_id
      AND  je.financial_period_id  = p_period_id
      AND  je.status               = 'posted'
    GROUP  BY jl.account_code
  ) d
  LEFT JOIN public.account_balances ab
    ON  ab.organization_id     = p_org_id
    AND ab.financial_period_id  = p_period_id
    AND ab.account_code         = d.account_code
  WHERE
    -- Cache missing entirely
    ab.account_code IS NULL
    -- Or balance diverges by >= 0.01 (rounding tolerance)
    OR ABS(
      d.balance
      - (ab.opening_balance + ab.debit_movement - ab.credit_movement)
    ) >= 0.01;

  GET DIAGNOSTICS v_divergence_count = ROW_COUNT;

  -- Type 2: missing_from_ledger (cache has account but journal has none)
  INSERT INTO public.replay_validation_deltas(
    organization_id, period_id, replay_run_id, account_code,
    delta_type,
    ledger_debit, ledger_credit, ledger_balance,
    cache_debit,  cache_credit,  cache_balance
  )
  SELECT
    p_org_id,
    p_period_id,
    v_run_id,
    ab.account_code,
    'missing_from_ledger'::public.replay_delta_type,
    0, 0, 0,
    ab.debit_movement,
    ab.credit_movement,
    ab.opening_balance + ab.debit_movement - ab.credit_movement
  FROM public.account_balances ab
  WHERE ab.organization_id     = p_org_id
    AND ab.financial_period_id  = p_period_id
    AND NOT EXISTS (
      SELECT 1
      FROM   public.journal_lines   jl
      JOIN   public.journal_entries je ON je.id = jl.entry_id
      WHERE  je.organization_id     = p_org_id
        AND  je.financial_period_id  = p_period_id
        AND  je.status               = 'posted'
        AND  jl.account_code         = ab.account_code
    );

  GET DIAGNOSTICS v_missing_count = ROW_COUNT;
  v_divergence_count := v_divergence_count + v_missing_count;

  v_final_status := CASE WHEN v_divergence_count > 0 THEN 'divergent' ELSE 'completed' END;

  -- Finalize replay run (immutability trigger allows update when status='running')
  UPDATE public.ledger_replay_runs SET
    status                    = v_final_status,
    completed_at              = now(),
    journal_entries_processed = v_entry_count,
    journal_lines_processed   = v_line_count,
    accounts_reconstructed    = v_account_count,
    divergence_count          = v_divergence_count,
    replay_hash               = v_replay_hash
  WHERE id = v_run_id;

  -- Register period_replay hash in registry
  INSERT INTO public.replay_hash_registry(
    organization_id, period_id, replay_run_id, hash_value, hash_type
  )
  VALUES (p_org_id, p_period_id, v_run_id, v_replay_hash, 'period_replay')
  ON CONFLICT (organization_id, period_id, hash_type) DO UPDATE SET
    replay_run_id = EXCLUDED.replay_run_id,
    hash_value    = EXCLUDED.hash_value;

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
  'REFACTORED (Phase 4H-A): Storage-light ledger state reconstruction. '
  'Uses canonical_accounting_hash() for deterministic hashing. '
  'Stores ONLY divergences in replay_validation_deltas (not full snapshots). '
  'Identical journal state always produces identical replay_hash. '
  'Returns {replay_run_id, status, divergence_count, replay_hash}.';

GRANT EXECUTE ON FUNCTION public.replay_period_state(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: validate_balance_reconstruction (REFACTORED) ──────────────────
-- Reads divergences from replay_validation_deltas instead of replay_snapshots.

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
  -- Run the storage-light replay
  v_replay_result := public.replay_period_state(p_org_id, p_period_id, p_actor_id);
  v_run_id        := (v_replay_result->>'replay_run_id')::uuid;

  -- Collect divergences from replay_validation_deltas (storage-light approach)
  FOR v_rec IN
    SELECT
      account_code,
      delta_type,
      ledger_balance,
      cache_balance,
      delta_amount
    FROM public.replay_validation_deltas
    WHERE replay_run_id = v_run_id
    ORDER BY delta_amount DESC NULLS LAST
  LOOP
    v_divergences := v_divergences || jsonb_build_array(jsonb_build_object(
      'account_code',   v_rec.account_code,
      'delta_type',     v_rec.delta_type,
      'ledger_balance', v_rec.ledger_balance,
      'cache_balance',  v_rec.cache_balance,
      'delta_amount',   v_rec.delta_amount
    ));
    v_div_count := v_div_count + 1;
  END LOOP;

  v_total_accounts := (v_replay_result->>'accounts_reconstructed')::int;
  v_status := CASE WHEN v_div_count = 0 THEN 'valid' ELSE 'divergences_found' END;

  RETURN jsonb_build_object(
    'status',           v_status,
    'replay_run_id',    v_run_id,
    'period_id',        p_period_id,
    'total_accounts',   v_total_accounts,
    'divergence_count', v_div_count,
    'divergences',      v_divergences,
    'replay_hash',      v_replay_result->>'replay_hash',
    'validated_at',     now()
  );
END;
$$;

COMMENT ON FUNCTION public.validate_balance_reconstruction(uuid, uuid, uuid) IS
  'REFACTORED (Phase 4H-A): reads divergences from replay_validation_deltas. '
  'Runs replay_period_state and returns {status, total_accounts, divergences[]}. '
  'status=''valid'' = cache consistent; ''divergences_found'' = discrepancies detected.';

GRANT EXECUTE ON FUNCTION public.validate_balance_reconstruction(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: validate_replay_integrity (REFACTORED) ─────────────────────────
-- Updated to read divergences from replay_validation_deltas, not replay_snapshots.
-- All 4 checks remain: balance_reconstruction, close_dependencies,
-- subledger_close, schedule_lineage.

CREATE OR REPLACE FUNCTION public.validate_replay_integrity(
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
  v_period           record;
  v_replay_result    jsonb;
  v_dep_result       jsonb;
  v_subledger_result jsonb;
  v_run_id           uuid;
  v_checks           jsonb := '[]'::jsonb;
  v_checks_run       int   := 0;
  v_checks_passed    int   := 0;
  v_checks_failed    int   := 0;
  v_overall_status   public.replay_validation_status;
  v_report_id        uuid;
  v_report_data      jsonb;
  v_content_hash     text;
  v_div_rec          record;
BEGIN
  SELECT * INTO v_period
  FROM public.financial_periods
  WHERE id = p_period_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % does not exist', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Check 1: Balance reconstruction (storage-light) ───────────────────────
  v_replay_result := public.replay_period_state(p_org_id, p_period_id, p_actor_id);
  v_run_id        := (v_replay_result->>'replay_run_id')::uuid;
  v_checks_run    := v_checks_run + 1;

  IF (v_replay_result->>'divergence_count')::int = 0 THEN
    v_checks_passed := v_checks_passed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check',       'balance_reconstruction',
      'status',      'passed',
      'detail',      'All account balances match journal_lines reconstruction',
      'replay_hash', v_replay_result->>'replay_hash'
    ));
  ELSE
    v_checks_failed := v_checks_failed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check',            'balance_reconstruction',
      'status',           'failed',
      'divergence_count', (v_replay_result->>'divergence_count')::int,
      'replay_hash',      v_replay_result->>'replay_hash'
    ));

    -- Insert divergence events from replay_validation_deltas (not replay_snapshots)
    FOR v_div_rec IN
      SELECT account_code, ledger_balance, cache_balance, delta_type
      FROM public.replay_validation_deltas
      WHERE replay_run_id = v_run_id
    LOOP
      INSERT INTO public.replay_divergence_events(
        organization_id, period_id, replay_run_id,
        divergence_type, account_code,
        expected_balance, actual_balance, detail
      )
      VALUES (
        p_org_id, p_period_id, v_run_id,
        'balance_mismatch', v_div_rec.account_code,
        v_div_rec.cache_balance, v_div_rec.ledger_balance,
        'account_balances cache diverges from journal_lines reconstruction'
      );
    END LOOP;
  END IF;

  -- ── Check 2: Close dependencies ───────────────────────────────────────────
  v_dep_result := public.validate_close_dependencies(p_org_id, p_period_id, p_actor_id);
  v_checks_run := v_checks_run + 1;

  IF (v_dep_result->>'blocking_count')::int = 0 THEN
    v_checks_passed := v_checks_passed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check',  'close_dependencies',
      'status', 'passed',
      'detail', 'No open predecessor periods found'
    ));
  ELSE
    v_checks_failed := v_checks_failed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check',           'close_dependencies',
      'status',          'failed',
      'blocking_count',  (v_dep_result->>'blocking_count')::int,
      'blocking_periods', v_dep_result->'blocking_periods'
    ));
  END IF;

  -- ── Check 3: Subledger close readiness ────────────────────────────────────
  v_subledger_result := public.orchestrate_subledger_close(p_org_id, p_period_id, p_actor_id);
  v_checks_run       := v_checks_run + 1;

  IF (v_subledger_result->>'ready_to_close')::boolean = true THEN
    v_checks_passed := v_checks_passed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check',  'subledger_close',
      'status', 'passed',
      'detail', 'All subledgers are ready or skipped'
    ));
  ELSE
    v_checks_failed := v_checks_failed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check',             'subledger_close',
      'status',            'failed',
      'subledger_results', v_subledger_result->'subledger_results'
    ));
  END IF;

  -- ── Check 4: Schedule lineage integrity ───────────────────────────────────
  DECLARE
    v_orphan_sources int;
  BEGIN
    SELECT COUNT(DISTINCT source_id)
    INTO v_orphan_sources
    FROM (
      SELECT source_id, schedule_type,
             COUNT(*) FILTER (WHERE is_current = true) AS current_count
      FROM public.schedule_generations
      WHERE organization_id = p_org_id
      GROUP BY source_id, schedule_type
      HAVING COUNT(*) FILTER (WHERE is_current = true) <> 1
    ) orphans;

    v_checks_run := v_checks_run + 1;
    IF COALESCE(v_orphan_sources, 0) = 0 THEN
      v_checks_passed := v_checks_passed + 1;
      v_checks := v_checks || jsonb_build_array(jsonb_build_object(
        'check',  'schedule_lineage',
        'status', 'passed',
        'detail', 'All schedule sources have exactly one current generation'
      ));
    ELSE
      v_checks_failed := v_checks_failed + 1;
      v_checks := v_checks || jsonb_build_array(jsonb_build_object(
        'check',          'schedule_lineage',
        'status',         'failed',
        'orphan_sources', v_orphan_sources,
        'detail',         'Some schedule sources lack a current generation or have multiple'
      ));
    END IF;
  END;

  -- ── Build validation report ───────────────────────────────────────────────
  v_overall_status := CASE
    WHEN v_checks_failed = 0 THEN 'clean'::public.replay_validation_status
    ELSE 'divergences_found'::public.replay_validation_status
  END;

  v_report_data := jsonb_build_object(
    'checks',        v_checks,
    'replay_run_id', v_run_id,
    'replay_hash',   v_replay_result->>'replay_hash',
    'period_status', v_period.status,
    'validated_at',  now()
  );

  v_content_hash := encode(sha256(v_report_data::text::bytea), 'hex');

  INSERT INTO public.replay_validation_reports(
    organization_id, period_id, replay_run_id, validation_type,
    status, checks_run, checks_passed, checks_failed,
    report_data, content_hash, created_by
  )
  VALUES (
    p_org_id, p_period_id, v_run_id, 'full_integrity',
    v_overall_status, v_checks_run, v_checks_passed, v_checks_failed,
    v_report_data, v_content_hash, p_actor_id
  )
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object(
    'status',        v_overall_status,
    'report_id',     v_report_id,
    'period_id',     p_period_id,
    'replay_run_id', v_run_id,
    'checks_run',    v_checks_run,
    'checks_passed', v_checks_passed,
    'checks_failed', v_checks_failed,
    'checks',        v_checks,
    'replay_hash',   v_replay_result->>'replay_hash',
    'validated_at',  now()
  );
END;
$$;

COMMENT ON FUNCTION public.validate_replay_integrity(uuid, uuid, uuid) IS
  'REFACTORED (Phase 4H-A): reads divergences from replay_validation_deltas (not replay_snapshots). '
  '4-check validation: balance reconstruction + close dependencies + subledger readiness + schedule lineage. '
  'Creates replay_divergence_events and replay_validation_reports. '
  'Returns {status, report_id, checks_run, checks_passed, checks_failed, checks[]}.';

GRANT EXECUTE ON FUNCTION public.validate_replay_integrity(uuid, uuid, uuid) TO service_role;
