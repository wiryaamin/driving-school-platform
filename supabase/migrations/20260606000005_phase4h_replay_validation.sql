-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260606000005_phase4h_replay_validation.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H — Replay Validation, Canonical Replay Exports & Hash Registry
--
-- Implements authoritative replay validation and canonical export infrastructure:
--   replay_validation_reports  — immutable comprehensive validation result records
--   canonical_replay_exports   — immutable deterministic replay state exports
--   replay_hash_registry       — registry of all replay hashes per (org, period, type)
--
-- SECURITY DEFINER functions:
--   validate_replay_integrity(p_org_id, p_period_id, p_actor_id)
--     → Runs full replay (replay_period_state) + subledger dependency check
--       + schedule lineage check. Emits replay_divergence_events for each issue.
--       Inserts a replay_validation_report. Returns comprehensive JSONB result.
--
--   generate_replay_snapshot(p_org_id, p_period_id, p_actor_id)
--     → Runs replay_period_state, captures result as a replay_validation_report
--       of type 'balance_check'. Returns report_id.
--
--   generate_canonical_replay_export(p_org_id, p_period_id, p_notes, p_actor_id)
--     → Builds a deterministic canonical export of the period's replay state:
--         - Per-account reconstructed balances sorted by account_code
--         - SHA-256 of the serialized content
--       Inserts canonical_replay_exports record. Registers hash in replay_hash_registry.
--       Idempotent: upserts the registry entry if a new replay is cleaner.
--       Returns canonical_replay_export.id.
--
-- Canonical replay export hash:
--   Deterministic sort: account_code ASC
--   Hash input row: account_code|reconstructed_debit|reconstructed_credit|reconstructed_balance
--   SHA-256(all rows joined by \n, using pipe-delimited fields)
--
-- Dependencies:
--   20260602000001_phase4d_ledger_core.sql — journal_entries, journal_lines, account_balances
--   20260530000001_phase4a_commercial_core.sql — financial_periods
--   20260606000001_phase4h_replay_core.sql — ledger_replay_runs, replay_snapshots, replay_period_state
--   20260606000003_phase4h_fiscal_dependency_graph.sql — replay_divergence_events
--   20260606000002_phase4h_schedule_lineage.sql — schedule_generations
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ─────────────────────────────────────────────────────

CREATE TYPE public.replay_validation_type AS ENUM (
  'full_integrity',    -- Comprehensive: balance check + subledger + lineage + dependencies
  'balance_check',     -- Balance reconstruction only (compare cache vs ledger)
  'dependency_check',  -- Dependency graph validation only
  'subledger_check'    -- Subledger close readiness only
);

CREATE TYPE public.replay_validation_status AS ENUM (
  'clean',             -- All checks passed; no divergences
  'divergences_found', -- One or more divergences detected
  'errors'             -- Errors prevented full validation
);

CREATE TYPE public.replay_hash_type AS ENUM (
  'period_replay',     -- SHA-256 of account balances reconstructed from journal_lines
  'canonical_export',  -- SHA-256 of canonical_replay_exports content
  'balance_snapshot',  -- SHA-256 of account_balances cache at a point in time
  'schedule_lineage'   -- SHA-256 of all schedule generation ids for an org+period
);

-- ── Section 2: replay_validation_reports ─────────────────────────────────────
-- Immutable comprehensive validation result records.
-- One record per validate_replay_integrity() or generate_replay_snapshot() call.
-- Contains structured check results and a content_hash for integrity verification.

CREATE TABLE public.replay_validation_reports (
  id               uuid                           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid                           NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id        uuid                           NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  replay_run_id    uuid                                    REFERENCES public.ledger_replay_runs(id) ON DELETE RESTRICT,
  validation_type  public.replay_validation_type  NOT NULL DEFAULT 'full_integrity',
  status           public.replay_validation_status NOT NULL,
  checks_run       int                            NOT NULL DEFAULT 0 CHECK (checks_run >= 0),
  checks_passed    int                            NOT NULL DEFAULT 0 CHECK (checks_passed >= 0),
  checks_failed    int                            NOT NULL DEFAULT 0 CHECK (checks_failed >= 0),
  report_data      jsonb                          NOT NULL DEFAULT '{}',
  content_hash     text                           NOT NULL CHECK (length(content_hash) = 64),
  notes            text,
  created_at       timestamptz                    NOT NULL DEFAULT now(),
  created_by       uuid                                    REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.replay_validation_reports IS
  'Immutable comprehensive replay validation result records. '
  'Created by validate_replay_integrity() and generate_replay_snapshot(). '
  'content_hash: SHA-256(report_data::text) for external verifiability. '
  'report_data: structured check results per validation_type.';

CREATE OR REPLACE FUNCTION public.prevent_replay_validation_report_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'REPLAY_VALIDATION_REPORT_IMMUTABLE: validation reports are permanent audit records.'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER replay_validation_reports_immutability
  BEFORE UPDATE OR DELETE ON public.replay_validation_reports
  FOR EACH ROW EXECUTE FUNCTION public.prevent_replay_validation_report_mutation();

-- ── Section 3: canonical_replay_exports ──────────────────────────────────────
-- Immutable deterministic canonical exports of period replay state.
-- Distinct from Phase 4G's canonical_accounting_exports (which hashes journal_lines).
-- This table hashes the RECONSTRUCTED account balance state (from replay_period_state).
-- Provides an independent verification path for audit reproducibility.

CREATE TABLE public.canonical_replay_exports (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id           uuid          NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  replay_run_id       uuid          NOT NULL REFERENCES public.ledger_replay_runs(id) ON DELETE RESTRICT,
  export_content      jsonb         NOT NULL DEFAULT '{}',
  content_hash        text          NOT NULL CHECK (length(content_hash) = 64),
  account_count       int           NOT NULL DEFAULT 0 CHECK (account_count >= 0),
  total_debit         numeric(14,2) NOT NULL DEFAULT 0,
  total_credit        numeric(14,2) NOT NULL DEFAULT 0,
  notes               text,
  metadata            jsonb         NOT NULL DEFAULT '{}',
  created_at          timestamptz   NOT NULL DEFAULT now(),
  created_by          uuid                   REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.canonical_replay_exports IS
  'Immutable deterministic exports of period replay state (reconstructed account balances). '
  'content_hash: SHA-256 of account_code|debit|credit|balance rows sorted by account_code. '
  'Distinct from canonical_accounting_exports (Phase 4G) which hashes journal_lines. '
  'Provides independent verification path for audit reproducibility.';

CREATE OR REPLACE FUNCTION public.prevent_canonical_replay_export_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_REPLAY_EXPORT_IMMUTABLE: canonical replay exports are permanent audit records.'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER canonical_replay_exports_immutability
  BEFORE UPDATE OR DELETE ON public.canonical_replay_exports
  FOR EACH ROW EXECUTE FUNCTION public.prevent_canonical_replay_export_mutation();

-- ── Section 4: replay_hash_registry ──────────────────────────────────────────
-- Registry of all replay hashes per (organization_id, period_id, hash_type).
-- Updated each time a replay run produces a new hash for a period.
-- NOT immutable: updated when new replay runs are executed.
-- Enables quick lookup of current replay hash without joining replay_runs.

CREATE TABLE public.replay_hash_registry (
  id               uuid                       NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid                       NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id        uuid                       NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  replay_run_id    uuid                                REFERENCES public.ledger_replay_runs(id) ON DELETE RESTRICT,
  hash_value       text                       NOT NULL,
  hash_type        public.replay_hash_type    NOT NULL,
  created_at       timestamptz                NOT NULL DEFAULT now(),
  updated_at       timestamptz                NOT NULL DEFAULT now(),

  CONSTRAINT rhr_org_period_type_unique UNIQUE (organization_id, period_id, hash_type)
);

COMMENT ON TABLE public.replay_hash_registry IS
  'Registry of current replay hashes per (org, period, type). '
  'Updated on each new replay run. Not immutable — latest hash always wins. '
  'UNIQUE(organization_id, period_id, hash_type) enforced. '
  'Use ON CONFLICT DO UPDATE to upsert. Enables fast hash lookup for audit checks.';

CREATE TRIGGER set_replay_hash_registry_updated_at
  BEFORE UPDATE ON public.replay_hash_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Section 5: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.replay_validation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_replay_exports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replay_hash_registry      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rvr_org_read"
  ON public.replay_validation_reports FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

CREATE POLICY "cre_org_read"
  ON public.canonical_replay_exports FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

CREATE POLICY "rhr_org_read"
  ON public.replay_hash_registry FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

-- ── Section 6: Grants ─────────────────────────────────────────────────────────

GRANT SELECT        ON public.replay_validation_reports TO authenticated;
GRANT SELECT, INSERT ON public.replay_validation_reports TO service_role;

GRANT SELECT        ON public.canonical_replay_exports TO authenticated;
GRANT SELECT, INSERT ON public.canonical_replay_exports TO service_role;

GRANT SELECT        ON public.replay_hash_registry TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.replay_hash_registry TO service_role;

-- ── FUNCTION: validate_replay_integrity ──────────────────────────────────────
-- Comprehensive replay integrity validation.
-- Runs:
--   1. balance_check: replay_period_state → compare reconstructed vs cached balances
--   2. dependency_check: validate_close_dependencies → check open predecessors
--   3. subledger_check: orchestrate_subledger_close → check subledger readiness
--   4. lineage_check: verify all schedule_generations have is_current records
--
-- Creates replay_divergence_events for each detected divergence.
-- Inserts immutable replay_validation_report. Returns JSONB result.

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
  v_period          record;
  v_replay_result   jsonb;
  v_dep_result      jsonb;
  v_subledger_result jsonb;
  v_run_id          uuid;
  v_checks          jsonb := '[]'::jsonb;
  v_checks_run      int   := 0;
  v_checks_passed   int   := 0;
  v_checks_failed   int   := 0;
  v_overall_status  public.replay_validation_status;
  v_report_id       uuid;
  v_report_data     jsonb;
  v_content_hash    text;
  v_div_rec         record;
BEGIN
  SELECT * INTO v_period
  FROM public.financial_periods
  WHERE id = p_period_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % does not exist', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Check 1: Balance reconstruction ──────────────────────────────────────
  v_replay_result := public.replay_period_state(p_org_id, p_period_id, p_actor_id);
  v_run_id        := (v_replay_result->>'replay_run_id')::uuid;
  v_checks_run    := v_checks_run + 1;

  IF (v_replay_result->>'divergence_count')::int = 0 THEN
    v_checks_passed := v_checks_passed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'balance_reconstruction', 'status', 'passed',
      'detail', 'All account balances match journal_lines reconstruction',
      'replay_hash', v_replay_result->>'replay_hash'
    ));
  ELSE
    v_checks_failed := v_checks_failed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'balance_reconstruction', 'status', 'failed',
      'divergence_count', (v_replay_result->>'divergence_count')::int,
      'replay_hash', v_replay_result->>'replay_hash'
    ));

    -- Insert divergence events for each divergent account
    FOR v_div_rec IN
      SELECT account_code, reconstructed_balance, cached_balance, divergence_amount
      FROM public.replay_snapshots
      WHERE replay_run_id  = v_run_id
        AND has_divergence = true
    LOOP
      INSERT INTO public.replay_divergence_events(
        organization_id, period_id, replay_run_id,
        divergence_type, account_code,
        expected_balance, actual_balance, detail
      )
      VALUES (
        p_org_id, p_period_id, v_run_id,
        'balance_mismatch', v_div_rec.account_code,
        v_div_rec.cached_balance, v_div_rec.reconstructed_balance,
        'account_balances cache diverges from journal_lines reconstruction'
      );
    END LOOP;
  END IF;

  -- ── Check 2: Close dependencies ──────────────────────────────────────────
  v_dep_result := public.validate_close_dependencies(p_org_id, p_period_id, p_actor_id);
  v_checks_run := v_checks_run + 1;

  IF (v_dep_result->>'blocking_count')::int = 0 THEN
    v_checks_passed := v_checks_passed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'close_dependencies', 'status', 'passed',
      'detail', 'No open predecessor periods found'
    ));
  ELSE
    v_checks_failed := v_checks_failed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check',            'close_dependencies',
      'status',           'failed',
      'blocking_count',   (v_dep_result->>'blocking_count')::int,
      'blocking_periods', v_dep_result->'blocking_periods'
    ));
  END IF;

  -- ── Check 3: Subledger close readiness ───────────────────────────────────
  v_subledger_result := public.orchestrate_subledger_close(p_org_id, p_period_id, p_actor_id);
  v_checks_run       := v_checks_run + 1;

  IF (v_subledger_result->>'ready_to_close')::boolean = true THEN
    v_checks_passed := v_checks_passed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check', 'subledger_close', 'status', 'passed',
      'detail', 'All subledgers are ready or skipped'
    ));
  ELSE
    v_checks_failed := v_checks_failed + 1;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check',              'subledger_close',
      'status',             'failed',
      'subledger_results',  v_subledger_result->'subledger_results'
    ));
  END IF;

  -- ── Check 4: Schedule lineage integrity ──────────────────────────────────
  -- Verify every schedule_generations source for this org has exactly one is_current=true
  DECLARE
    v_orphan_sources int;
  BEGIN
    SELECT COUNT(DISTINCT source_id)
    INTO v_orphan_sources
    FROM (
      SELECT source_id, schedule_type, COUNT(*) FILTER (WHERE is_current = true) AS current_count
      FROM public.schedule_generations
      WHERE organization_id = p_org_id
      GROUP BY source_id, schedule_type
      HAVING COUNT(*) FILTER (WHERE is_current = true) <> 1
    ) orphans;

    v_checks_run := v_checks_run + 1;
    IF COALESCE(v_orphan_sources, 0) = 0 THEN
      v_checks_passed := v_checks_passed + 1;
      v_checks := v_checks || jsonb_build_array(jsonb_build_object(
        'check', 'schedule_lineage', 'status', 'passed',
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
    'checks',          v_checks,
    'replay_run_id',   v_run_id,
    'replay_hash',     v_replay_result->>'replay_hash',
    'period_status',   v_period.status,
    'validated_at',    now()
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

  -- Register the period replay hash
  INSERT INTO public.replay_hash_registry(
    organization_id, period_id, replay_run_id, hash_value, hash_type
  )
  VALUES (
    p_org_id, p_period_id, v_run_id,
    v_replay_result->>'replay_hash',
    'period_replay'
  )
  ON CONFLICT (organization_id, period_id, hash_type) DO UPDATE SET
    replay_run_id = EXCLUDED.replay_run_id,
    hash_value    = EXCLUDED.hash_value;

  RETURN jsonb_build_object(
    'status',           v_overall_status,
    'report_id',        v_report_id,
    'period_id',        p_period_id,
    'replay_run_id',    v_run_id,
    'checks_run',       v_checks_run,
    'checks_passed',    v_checks_passed,
    'checks_failed',    v_checks_failed,
    'checks',           v_checks,
    'replay_hash',      v_replay_result->>'replay_hash',
    'validated_at',     now()
  );
END;
$$;

COMMENT ON FUNCTION public.validate_replay_integrity(uuid, uuid, uuid) IS
  'Comprehensive replay integrity validation: balance reconstruction + close dependencies '
  '+ subledger readiness + schedule lineage. '
  'Creates replay_divergence_events for each issue found. '
  'Inserts immutable replay_validation_report. '
  'Returns {status, report_id, checks_run, checks_passed, checks_failed, checks[]}.';

GRANT EXECUTE ON FUNCTION public.validate_replay_integrity(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: generate_replay_snapshot ───────────────────────────────────────
-- Runs replay_period_state() and captures the result as a replay_validation_report
-- of type 'balance_check'. Returns the report_id (uuid).

CREATE OR REPLACE FUNCTION public.generate_replay_snapshot(
  p_org_id    uuid,
  p_period_id uuid,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_replay_result jsonb;
  v_run_id        uuid;
  v_status        public.replay_validation_status;
  v_report_data   jsonb;
  v_content_hash  text;
  v_report_id     uuid;
BEGIN
  v_replay_result := public.replay_period_state(p_org_id, p_period_id, p_actor_id);
  v_run_id        := (v_replay_result->>'replay_run_id')::uuid;

  v_status := CASE
    WHEN (v_replay_result->>'divergence_count')::int = 0
         THEN 'clean'::public.replay_validation_status
    ELSE 'divergences_found'::public.replay_validation_status
  END;

  v_report_data := jsonb_build_object(
    'replay_run_id',    v_run_id,
    'replay_hash',      v_replay_result->>'replay_hash',
    'accounts_reconstructed', (v_replay_result->>'accounts_reconstructed')::int,
    'divergence_count', (v_replay_result->>'divergence_count')::int,
    'snapshot_at',      now()
  );

  v_content_hash := encode(sha256(v_report_data::text::bytea), 'hex');

  INSERT INTO public.replay_validation_reports(
    organization_id, period_id, replay_run_id, validation_type,
    status, checks_run, checks_passed, checks_failed,
    report_data, content_hash, created_by
  )
  VALUES (
    p_org_id, p_period_id, v_run_id, 'balance_check',
    v_status,
    1,
    CASE WHEN v_status = 'clean' THEN 1 ELSE 0 END,
    CASE WHEN v_status = 'clean' THEN 0 ELSE 1 END,
    v_report_data, v_content_hash, p_actor_id
  )
  RETURNING id INTO v_report_id;

  -- Register hash
  INSERT INTO public.replay_hash_registry(
    organization_id, period_id, replay_run_id, hash_value, hash_type
  )
  VALUES (
    p_org_id, p_period_id, v_run_id,
    v_replay_result->>'replay_hash',
    'balance_snapshot'
  )
  ON CONFLICT (organization_id, period_id, hash_type) DO UPDATE SET
    replay_run_id = EXCLUDED.replay_run_id,
    hash_value    = EXCLUDED.hash_value;

  RETURN v_report_id;
END;
$$;

COMMENT ON FUNCTION public.generate_replay_snapshot(uuid, uuid, uuid) IS
  'Runs replay_period_state and captures as a replay_validation_report (balance_check type). '
  'Registers the period_replay hash in replay_hash_registry. '
  'Returns the replay_validation_report.id.';

GRANT EXECUTE ON FUNCTION public.generate_replay_snapshot(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: generate_canonical_replay_export ───────────────────────────────
-- Builds and stores a deterministic canonical export of the period's replay state.
-- Uses the most recent replay_period_state run (or creates a new one).
-- Hash input: account_code|debit|credit|balance rows sorted by account_code, newline-joined.
-- Inserts canonical_replay_exports record. Updates replay_hash_registry.
-- Returns canonical_replay_exports.id.

CREATE OR REPLACE FUNCTION public.generate_canonical_replay_export(
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
  v_replay_result  jsonb;
  v_run_id         uuid;
  v_hash_input     text := '';
  v_content_hash   text;
  v_export_content jsonb;
  v_account_count  int  := 0;
  v_total_debit    numeric(14,2) := 0;
  v_total_credit   numeric(14,2) := 0;
  v_export_id      uuid;
  v_rec            record;
BEGIN
  -- Run a fresh replay to get current state
  v_replay_result := public.replay_period_state(p_org_id, p_period_id, p_actor_id);
  v_run_id        := (v_replay_result->>'replay_run_id')::uuid;

  -- Build canonical hash input and export content from replay_snapshots
  -- Sort deterministically: account_code ASC
  v_export_content := '[]'::jsonb;

  FOR v_rec IN
    SELECT
      account_code,
      reconstructed_debit,
      reconstructed_credit,
      reconstructed_balance
    FROM public.replay_snapshots
    WHERE replay_run_id = v_run_id
    ORDER BY account_code ASC
  LOOP
    v_hash_input := v_hash_input ||
      v_rec.account_code              || '|' ||
      v_rec.reconstructed_debit::text || '|' ||
      v_rec.reconstructed_credit::text || '|' ||
      v_rec.reconstructed_balance::text || E'\n';

    v_export_content := v_export_content || jsonb_build_array(jsonb_build_object(
      'account_code',           v_rec.account_code,
      'reconstructed_debit',    v_rec.reconstructed_debit,
      'reconstructed_credit',   v_rec.reconstructed_credit,
      'reconstructed_balance',  v_rec.reconstructed_balance
    ));

    v_account_count := v_account_count + 1;
    v_total_debit   := v_total_debit   + v_rec.reconstructed_debit;
    v_total_credit  := v_total_credit  + v_rec.reconstructed_credit;
  END LOOP;

  v_content_hash := encode(sha256(v_hash_input::bytea), 'hex');

  INSERT INTO public.canonical_replay_exports(
    organization_id, period_id, replay_run_id,
    export_content, content_hash,
    account_count, total_debit, total_credit,
    notes, created_by
  )
  VALUES (
    p_org_id, p_period_id, v_run_id,
    v_export_content, v_content_hash,
    v_account_count, v_total_debit, v_total_credit,
    p_notes, p_actor_id
  )
  RETURNING id INTO v_export_id;

  -- Register canonical_export hash
  INSERT INTO public.replay_hash_registry(
    organization_id, period_id, replay_run_id, hash_value, hash_type
  )
  VALUES (
    p_org_id, p_period_id, v_run_id,
    v_content_hash, 'canonical_export'
  )
  ON CONFLICT (organization_id, period_id, hash_type) DO UPDATE SET
    replay_run_id = EXCLUDED.replay_run_id,
    hash_value    = EXCLUDED.hash_value;

  RETURN v_export_id;
END;
$$;

COMMENT ON FUNCTION public.generate_canonical_replay_export(uuid, uuid, text, uuid) IS
  'Generates deterministic canonical export of period replay state (reconstructed balances). '
  'Hash: SHA-256 of account_code|debit|credit|balance rows sorted by account_code ASC. '
  'Inserts canonical_replay_exports record. Updates replay_hash_registry. '
  'Distinct from Phase 4G generate_canonical_accounting_export (which hashes journal_lines). '
  'Returns canonical_replay_exports.id.';

GRANT EXECUTE ON FUNCTION public.generate_canonical_replay_export(uuid, uuid, text, uuid) TO service_role;

-- ── View: v_replay_governance_dashboard ──────────────────────────────────────

CREATE VIEW public.v_replay_governance_dashboard
WITH (security_invoker = true)
AS
SELECT
  fp.id                                     AS period_id,
  fp.organization_id,
  fp.period_start,
  fp.period_end,
  fp.status                                 AS period_status,
  -- Latest replay run
  lrr.id                                    AS latest_replay_run_id,
  lrr.status                                AS latest_replay_status,
  lrr.divergence_count                      AS replay_divergences,
  lrr.replay_hash,
  lrr.completed_at                          AS last_replayed_at,
  -- Latest validation report
  rvr.id                                    AS latest_validation_report_id,
  rvr.status                                AS latest_validation_status,
  rvr.checks_passed,
  rvr.checks_failed,
  rvr.created_at                            AS last_validated_at,
  -- Hash registry
  rhr_pr.hash_value                         AS period_replay_hash,
  rhr_ce.hash_value                         AS canonical_export_hash,
  -- Subledger close readiness
  (SELECT COUNT(*) = 0 FROM public.subledger_close_jobs scj
   WHERE scj.organization_id = fp.organization_id
     AND scj.period_id       = fp.id
     AND scj.status          = 'failed')    AS subledgers_ready,
  -- Canonical replay export
  cre.id IS NOT NULL                        AS has_canonical_replay_export,
  cre.content_hash                          AS canonical_replay_hash,
  cre.created_at                            AS canonical_export_at
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
  ) cre ON true;

COMMENT ON VIEW public.v_replay_governance_dashboard IS
  'Per-period replay governance status: replay runs, validation reports, '
  'hash registry, subledger close readiness, canonical replay exports. '
  'security_invoker = true.';

GRANT SELECT ON public.v_replay_governance_dashboard TO authenticated, service_role;
