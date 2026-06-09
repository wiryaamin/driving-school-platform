-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260603000003_phase4e_financial_close_engine.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4E — Financial Period Close Engine
--
-- New table:
--   period_audit_snapshots   — immutable point-in-time account balance snapshots
--
-- SECURITY DEFINER functions:
--   validate_period_for_close(p_period_id, p_actor_id)
--     → Runs 6 checks and returns a JSONB checklist.
--       Updates financial_periods.close_validated_at if critical checks pass.
--       Critical checks (block soft-close): trial_balance_balanced, journal_entries_balanced.
--       Advisory checks (block hard-close): ar_reconciled, vat_period_exists,
--                                           deferred_reconciled, no_bank_exceptions.
--
--   capture_period_audit_snapshot(p_period_id, p_snapshot_type, p_actor_id)
--     → Serializes account_balances into an immutable period_audit_snapshots row.
--       SHA-256 hashes the snapshot JSONB for reproducibility.
--       Returns snapshot_id.
--
--   soft_close_period(p_period_id, p_notes, p_actor_id)
--     → Transitions a period from 'open' → 'closed'.
--       Requires critical checks to pass (trial balance + journal balance).
--       Captures a 'soft_close' audit snapshot.
--       Emits Period.SoftClosed outbox event.
--
--   reopen_soft_closed_period(p_period_id, p_reason, p_actor_id)
--     → Transitions 'closed' → 'open'. NOT allowed for 'locked' periods.
--       Emits Period.Reopened outbox event.
--
--   hard_close_period(p_period_id, p_notes, p_actor_id)
--     → Transitions 'closed' → 'locked'. All validation checks must pass.
--       Captures a 'hard_close' audit snapshot before locking.
--       Emits Period.HardClosed outbox event.
--       A locked period cannot be unlocked under any circumstances.
--
--   post_amendment_journal(p_period_id, p_lines, p_reason, p_actor_id)
--     → Posts a journal entry to a soft-closed ('closed') period.
--       Increments financial_periods.amendment_count atomically.
--       Blocked if period is 'locked'.
--       Returns the new journal_entry_id.
--
-- View:
--   v_period_close_readiness  — per-period close readiness dashboard
--
-- Period status transitions:
--   open → closed  (soft_close_period)
--   closed → open  (reopen_soft_closed_period)
--   closed → locked (hard_close_period) — IRREVERSIBLE
--
-- Dependencies:
--   20260603000001_phase4e_reconciliation_core.sql
--   20260603000002_phase4e_bank_reconciliation.sql
--   20260602000001_phase4d_ledger_core.sql
--   20260602000002_phase4d_posting_engine.sql
--   20260530000001_phase4a_commercial_core.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: period_audit_snapshots ────────────────────────────────────────
-- Immutable point-in-time snapshot of account_balances at close events.
-- Captured by capture_period_audit_snapshot(); cannot be modified after creation.
-- SHA-256 hash of snapshot_data::text enables reproducibility verification.

CREATE TABLE public.period_audit_snapshots (
  id                   uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  financial_period_id  uuid          NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  snapshot_type        text          NOT NULL CHECK (snapshot_type IN ('soft_close','hard_close','year_end','manual')),
  snapshot_data        jsonb         NOT NULL,
  trial_balance_debit  numeric(14,2) NOT NULL DEFAULT 0,
  trial_balance_credit numeric(14,2) NOT NULL DEFAULT 0,
  is_balanced          boolean       NOT NULL DEFAULT false,
  account_count        int           NOT NULL DEFAULT 0 CHECK (account_count >= 0),
  content_hash         text          NOT NULL CHECK (length(content_hash) = 64),
  captured_at          timestamptz   NOT NULL DEFAULT now(),
  captured_by          uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                text,
  metadata             jsonb         NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.period_audit_snapshots IS
  'Immutable point-in-time snapshots of account_balances at close events. '
  'Captured at soft_close, hard_close, and year_end. '
  'content_hash is SHA-256 of snapshot_data::text for reproducibility verification.';
COMMENT ON COLUMN public.period_audit_snapshots.snapshot_data IS
  'JSONB array: [{account_code, opening_balance, debit_movement, credit_movement, closing_balance}] '
  'for each account_balance row at capture time.';
COMMENT ON COLUMN public.period_audit_snapshots.content_hash IS
  'SHA-256(snapshot_data::text) — hex-encoded. Verifiable via verify_period_audit_snapshot().';

CREATE OR REPLACE FUNCTION public.prevent_audit_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_SNAPSHOT_IMMUTABLE: period audit snapshots are permanent records '
    'and cannot be modified or deleted.'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER period_audit_snapshots_immutability
  BEFORE UPDATE OR DELETE ON public.period_audit_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_snapshot_mutation();

ALTER TABLE public.period_audit_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pas_org_select" ON public.period_audit_snapshots FOR SELECT
  USING (organization_id = public.auth_organization_id()
    AND public.has_permission('finance:close:read'));

GRANT SELECT        ON public.period_audit_snapshots TO authenticated;
GRANT SELECT, INSERT ON public.period_audit_snapshots TO service_role;

-- ── Section 2: validate_period_for_close ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_period_for_close(
  p_period_id  uuid,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period           financial_periods%ROWTYPE;
  v_total_debit      numeric(14,2) := 0;
  v_total_credit     numeric(14,2) := 0;
  v_unbalanced_count int := 0;
  v_ar_balance       numeric(14,2) := 0;
  v_ar_outstanding   numeric(14,2) := 0;
  v_deferred_balance numeric(14,2) := 0;
  v_deferred_sched   numeric(14,2) := 0;
  v_vat_exists       boolean := false;
  v_bank_exceptions  int := 0;
  v_checks           jsonb := '[]'::jsonb;
  v_critical_passed  boolean := true;
  v_all_passed       boolean := true;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Check 1: trial_balance_balanced (CRITICAL) ────────────────────────────
  SELECT COALESCE(SUM(debit_movement), 0), COALESCE(SUM(credit_movement), 0)
  INTO v_total_debit, v_total_credit
  FROM account_balances
  WHERE financial_period_id = p_period_id;

  v_checks := v_checks || jsonb_build_object(
    'check', 'trial_balance_balanced',
    'critical', true,
    'passed', ABS(v_total_debit - v_total_credit) < 0.01,
    'message', format('Total debit: %s, Total credit: %s, Variance: %s',
      v_total_debit, v_total_credit, v_total_debit - v_total_credit)
  );
  IF NOT (ABS(v_total_debit - v_total_credit) < 0.01) THEN
    v_critical_passed := false;
    v_all_passed := false;
  END IF;

  -- ── Check 2: journal_entries_balanced (CRITICAL) ──────────────────────────
  SELECT COUNT(*) INTO v_unbalanced_count
  FROM journal_entries
  WHERE financial_period_id = p_period_id
    AND status = 'posted'
    AND ABS(total_debit - total_credit) >= 0.01;

  v_checks := v_checks || jsonb_build_object(
    'check', 'journal_entries_balanced',
    'critical', true,
    'passed', v_unbalanced_count = 0,
    'message', format('%s unbalanced posted entries in period', v_unbalanced_count)
  );
  IF v_unbalanced_count > 0 THEN
    v_critical_passed := false;
    v_all_passed := false;
  END IF;

  -- ── Check 3: ar_reconciled (advisory for soft-close, critical for hard-close)
  SELECT COALESCE(closing_balance, 0) INTO v_ar_balance
  FROM account_balances
  WHERE financial_period_id = p_period_id AND account_code = '1510' LIMIT 1;

  SELECT COALESCE(SUM(outstanding_amount), 0) INTO v_ar_outstanding
  FROM invoices
  WHERE organization_id = v_period.organization_id
    AND status NOT IN ('draft', 'void')
    AND issued_at::date <= v_period.period_end;

  v_checks := v_checks || jsonb_build_object(
    'check', 'ar_reconciled',
    'critical', false,
    'passed', ABS(v_ar_balance - v_ar_outstanding) < 0.01,
    'message', format('1510 ledger: %s, outstanding invoices: %s, variance: %s',
      v_ar_balance, v_ar_outstanding, v_ar_balance - v_ar_outstanding)
  );
  IF NOT (ABS(v_ar_balance - v_ar_outstanding) < 0.01) THEN v_all_passed := false; END IF;

  -- ── Check 4: vat_period_exists (advisory) ─────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM vat_periods
    WHERE organization_id = v_period.organization_id
      AND period_start <= v_period.period_end
      AND period_end   >= v_period.period_start
  ) INTO v_vat_exists;

  v_checks := v_checks || jsonb_build_object(
    'check', 'vat_period_exists',
    'critical', false,
    'passed', v_vat_exists,
    'message', CASE WHEN v_vat_exists THEN 'VAT period found covering this financial period'
               ELSE 'No VAT period found covering this financial period' END
  );
  IF NOT v_vat_exists THEN v_all_passed := false; END IF;

  -- ── Check 5: deferred_revenue_reconciled (advisory) ──────────────────────
  SELECT COALESCE(ABS(closing_balance), 0) INTO v_deferred_balance
  FROM account_balances
  WHERE financial_period_id = p_period_id AND account_code = '2970' LIMIT 1;

  SELECT COALESCE(SUM(total_deferred_net - recognized_amount_net), 0) INTO v_deferred_sched
  FROM deferred_revenue_schedules
  WHERE organization_id = v_period.organization_id
    AND is_fully_recognized = false;

  v_checks := v_checks || jsonb_build_object(
    'check', 'deferred_revenue_reconciled',
    'critical', false,
    'passed', ABS(v_deferred_balance - v_deferred_sched) < 0.01,
    'message', format('2970 abs balance: %s, unrecognized schedules: %s, variance: %s',
      v_deferred_balance, v_deferred_sched, v_deferred_balance - v_deferred_sched)
  );
  IF NOT (ABS(v_deferred_balance - v_deferred_sched) < 0.01) THEN v_all_passed := false; END IF;

  -- ── Check 6: no_unresolved_bank_exceptions (advisory) ────────────────────
  SELECT COUNT(*) INTO v_bank_exceptions
  FROM bank_statement_lines bsl
  JOIN bank_statement_imports bsi ON bsi.id = bsl.import_id
  WHERE bsi.organization_id = v_period.organization_id
    AND bsi.period_start >= v_period.period_start
    AND bsi.period_end   <= v_period.period_end
    AND bsl.status = 'exception';

  v_checks := v_checks || jsonb_build_object(
    'check', 'no_unresolved_bank_exceptions',
    'critical', false,
    'passed', v_bank_exceptions = 0,
    'message', format('%s unresolved bank statement exception lines for this period', v_bank_exceptions)
  );
  IF v_bank_exceptions > 0 THEN v_all_passed := false; END IF;

  -- Update validation timestamp if critical checks pass
  IF v_critical_passed THEN
    UPDATE financial_periods
    SET close_validated_at = now(),
        close_validated_by = p_actor_id,
        updated_at         = now()
    WHERE id = p_period_id;
  END IF;

  RETURN jsonb_build_object(
    'period_id',       p_period_id,
    'period_status',   v_period.status,
    'checks',          v_checks,
    'critical_passed', v_critical_passed,
    'all_passed',      v_all_passed,
    'validated_at',    now()
  );
END;
$$;

COMMENT ON FUNCTION public.validate_period_for_close(uuid,uuid) IS
  'Runs 6 close readiness checks: trial_balance_balanced and journal_entries_balanced are critical '
  '(block soft-close); the other 4 are advisory (block hard-close). '
  'Updates close_validated_at when critical checks pass. Returns JSONB checklist.';

GRANT EXECUTE ON FUNCTION public.validate_period_for_close(uuid,uuid) TO authenticated, service_role;

-- ── Section 3: capture_period_audit_snapshot ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.capture_period_audit_snapshot(
  p_period_id     uuid,
  p_snapshot_type text,
  p_notes         text DEFAULT NULL,
  p_actor_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period       financial_periods%ROWTYPE;
  v_snapshot_id  uuid;
  v_data         jsonb;
  v_debit        numeric(14,2) := 0;
  v_credit       numeric(14,2) := 0;
  v_count        int := 0;
  v_hash         text;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_snapshot_type NOT IN ('soft_close','hard_close','year_end','manual') THEN
    RAISE EXCEPTION 'SNAPSHOT_INVALID_TYPE: snapshot_type must be one of soft_close, hard_close, year_end, manual'
      USING ERRCODE = 'P0001';
  END IF;

  -- Aggregate account balances into JSONB array
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'account_code',    ab.account_code,
        'opening_balance', ab.opening_balance,
        'debit_movement',  ab.debit_movement,
        'credit_movement', ab.credit_movement,
        'closing_balance', ab.closing_balance
      ) ORDER BY ab.account_code
    ),
    COALESCE(SUM(ab.debit_movement),  0),
    COALESCE(SUM(ab.credit_movement), 0),
    COUNT(*)
  INTO v_data, v_debit, v_credit, v_count
  FROM account_balances ab
  WHERE ab.financial_period_id = p_period_id;

  IF v_data IS NULL THEN
    v_data := '[]'::jsonb;
  END IF;

  -- SHA-256 of the serialized snapshot
  v_hash := encode(digest(v_data::text, 'sha256'), 'hex');

  INSERT INTO period_audit_snapshots (
    organization_id, financial_period_id, snapshot_type,
    snapshot_data, trial_balance_debit, trial_balance_credit,
    is_balanced, account_count, content_hash, captured_by, notes
  ) VALUES (
    v_period.organization_id, p_period_id, p_snapshot_type,
    v_data, v_debit, v_credit,
    ABS(v_debit - v_credit) < 0.01, v_count, v_hash, p_actor_id, p_notes
  ) RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

COMMENT ON FUNCTION public.capture_period_audit_snapshot(uuid,text,text,uuid) IS
  'Creates an immutable audit snapshot of all account_balances for the period. '
  'SHA-256 hashes the JSONB for verification. Returns snapshot_id.';

GRANT EXECUTE ON FUNCTION public.capture_period_audit_snapshot(uuid,text,text,uuid) TO authenticated, service_role;

-- ── Section 4: soft_close_period ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.soft_close_period(
  p_period_id  uuid,
  p_notes      text DEFAULT NULL,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period      financial_periods%ROWTYPE;
  v_validation  jsonb;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_period.status <> 'open' THEN
    RAISE EXCEPTION 'PERIOD_NOT_OPEN: period % has status %; must be open to soft-close',
      p_period_id, v_period.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Run validation — critical checks must pass
  v_validation := public.validate_period_for_close(p_period_id, p_actor_id);
  IF NOT (v_validation->>'critical_passed')::boolean THEN
    RAISE EXCEPTION 'PERIOD_CLOSE_BLOCKED: critical validation checks failed for period %: %',
      p_period_id, v_validation->'checks'
      USING ERRCODE = 'P0001';
  END IF;

  -- Capture soft_close snapshot
  PERFORM public.capture_period_audit_snapshot(p_period_id, 'soft_close', p_notes, p_actor_id);

  UPDATE financial_periods
  SET status     = 'closed',
      closed_at  = now(),
      closed_by  = p_actor_id,
      notes      = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_period_id;

  -- Emit outbox event
  PERFORM public.insert_outbox_event(
    v_period.organization_id, 'Period.SoftClosed',
    jsonb_build_object('period_id', p_period_id, 'closed_by', p_actor_id),
    p_actor_id
  );
END;
$$;

COMMENT ON FUNCTION public.soft_close_period(uuid,text,uuid) IS
  'Transitions a period from open → closed (soft-close). '
  'Requires trial_balance_balanced and journal_entries_balanced checks to pass. '
  'Captures a soft_close audit snapshot. Emits Period.SoftClosed event.';

GRANT EXECUTE ON FUNCTION public.soft_close_period(uuid,text,uuid) TO authenticated, service_role;

-- ── Section 5: reopen_soft_closed_period ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reopen_soft_closed_period(
  p_period_id  uuid,
  p_reason     text,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period financial_periods%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'PERIOD_HARD_CLOSED: period % is hard-closed (locked). '
      'Hard-closed periods cannot be reopened. Use amendment journals for corrections.',
      p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_period.status <> 'closed' THEN
    RAISE EXCEPTION 'PERIOD_NOT_CLOSED: period % has status %; must be soft-closed to reopen',
      p_period_id, v_period.status
      USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'PERIOD_REOPEN_REASON_REQUIRED: a reason is required to reopen a soft-closed period'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE financial_periods
  SET status     = 'open',
      closed_at  = NULL,
      closed_by  = NULL,
      notes      = COALESCE(notes, '') || ' [Reopened: ' || p_reason || ']',
      updated_at = now()
  WHERE id = p_period_id;

  PERFORM public.insert_outbox_event(
    v_period.organization_id, 'Period.Reopened',
    jsonb_build_object('period_id', p_period_id, 'reason', p_reason, 'actor_id', p_actor_id),
    p_actor_id
  );
END;
$$;

COMMENT ON FUNCTION public.reopen_soft_closed_period(uuid,text,uuid) IS
  'Reverts a soft-closed period (closed) back to open. '
  'Cannot be called on locked (hard-closed) periods. '
  'A reason string is mandatory. Emits Period.Reopened event.';

GRANT EXECUTE ON FUNCTION public.reopen_soft_closed_period(uuid,text,uuid) TO authenticated, service_role;

-- ── Section 6: hard_close_period ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hard_close_period(
  p_period_id  uuid,
  p_notes      text DEFAULT NULL,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period      financial_periods%ROWTYPE;
  v_validation  jsonb;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'PERIOD_ALREADY_LOCKED: period % is already hard-closed', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_period.status <> 'closed' THEN
    RAISE EXCEPTION 'PERIOD_NOT_SOFT_CLOSED: period % has status %; must be soft-closed first',
      p_period_id, v_period.status
      USING ERRCODE = 'P0001';
  END IF;

  -- All checks (critical + advisory) must pass for hard close
  v_validation := public.validate_period_for_close(p_period_id, p_actor_id);
  IF NOT (v_validation->>'all_passed')::boolean THEN
    RAISE EXCEPTION 'PERIOD_HARD_CLOSE_BLOCKED: all validation checks must pass for hard-close of period %: %',
      p_period_id, v_validation->'checks'
      USING ERRCODE = 'P0001';
  END IF;

  -- Capture hard_close snapshot (immutable record of final balances)
  PERFORM public.capture_period_audit_snapshot(p_period_id, 'hard_close', p_notes, p_actor_id);

  -- Lock the period — irreversible
  UPDATE financial_periods
  SET status     = 'locked',
      locked_at  = now(),
      locked_by  = p_actor_id,
      notes      = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_period_id;

  PERFORM public.insert_outbox_event(
    v_period.organization_id, 'Period.HardClosed',
    jsonb_build_object('period_id', p_period_id, 'locked_by', p_actor_id),
    p_actor_id
  );
END;
$$;

COMMENT ON FUNCTION public.hard_close_period(uuid,text,uuid) IS
  'Transitions a soft-closed period (closed) → locked. IRREVERSIBLE. '
  'All 6 validation checks must pass (critical + advisory). '
  'Captures a hard_close audit snapshot. Emits Period.HardClosed event. '
  'Locked periods cannot receive new journal entries (enforced by post_journal_entry()).';

GRANT EXECUTE ON FUNCTION public.hard_close_period(uuid,text,uuid) TO authenticated, service_role;

-- ── Section 7: post_amendment_journal ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_amendment_journal(
  p_period_id  uuid,
  p_lines      jsonb,
  p_reason     text,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period   financial_periods%ROWTYPE;
  v_entry_id uuid;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'PERIOD_HARD_CLOSED: period % is locked. '
      'Locked periods cannot receive journal entries. '
      'Use reverse_journal_entry() on a prior posted entry if a correction is needed.',
      p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_period.status <> 'closed' THEN
    RAISE EXCEPTION 'PERIOD_NOT_SOFT_CLOSED: amendments can only be posted to soft-closed (closed) periods. '
      'Period % has status %.',
      p_period_id, v_period.status
      USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'AMENDMENT_REASON_REQUIRED: a reason is required for amendment journal entries'
      USING ERRCODE = 'P0001';
  END IF;

  -- Post the journal entry via the core engine (checks balance, assigns voucher, etc.)
  v_entry_id := public.post_journal_entry(
    p_org_id                 => v_period.organization_id,
    p_period_id              => p_period_id,
    p_entry_type             => 'manual',
    p_entry_date             => v_period.period_end,
    p_description            => 'Amendment: ' || p_reason,
    p_lines                  => p_lines,
    p_source_event_type      => 'Period.Amendment',
    p_source_entity_type     => 'financial_period',
    p_source_entity_id       => p_period_id,
    p_voucher_series         => 'M',
    p_reversal_of_entry_id   => NULL,
    p_correction_of_entry_id => NULL,
    p_actor_id               => p_actor_id
  );

  -- Increment amendment counter atomically
  UPDATE financial_periods
  SET amendment_count = amendment_count + 1,
      updated_at      = now()
  WHERE id = p_period_id;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_amendment_journal(uuid,jsonb,text,uuid) IS
  'Posts an amendment journal entry to a soft-closed (closed) period. '
  'Increments financial_periods.amendment_count. Requires a reason string. '
  'Uses voucher series M. Blocked for locked periods.';

GRANT EXECUTE ON FUNCTION public.post_amendment_journal(uuid,jsonb,text,uuid) TO authenticated, service_role;

-- ── Section 8: v_period_close_readiness ──────────────────────────────────────

CREATE VIEW public.v_period_close_readiness
WITH (security_invoker = true)
AS
SELECT
  fp.id                  AS period_id,
  fp.organization_id,
  fp.name                AS period_name,
  fp.period_start,
  fp.period_end,
  fp.status,
  fp.amendment_count,
  fp.close_validated_at,
  fp.closed_at,
  fp.locked_at,
  -- Trial balance
  COALESCE(ab.total_debit,  0)                                                 AS trial_balance_debit,
  COALESCE(ab.total_credit, 0)                                                 AS trial_balance_credit,
  ABS(COALESCE(ab.total_debit, 0) - COALESCE(ab.total_credit, 0)) < 0.01      AS trial_balance_balanced,
  -- Activity
  COALESCE(je.posted_entry_count, 0)                                           AS posted_entry_count,
  -- Reconciliation coverage (best attempt per type)
  COALESCE(rr_bank.is_reconciled, false)                                       AS bank_reconciled,
  COALESCE(rr_ar.is_reconciled,   false)                                       AS ar_reconciled,
  COALESCE(rr_vat.is_reconciled,  false)                                       AS vat_reconciled,
  COALESCE(rr_def.is_reconciled,  false)                                       AS deferred_reconciled,
  -- Audit snapshot status
  COALESCE(snap_soft.id IS NOT NULL, false)                                    AS soft_close_snapshot_exists,
  COALESCE(snap_hard.id IS NOT NULL, false)                                    AS hard_close_snapshot_exists
FROM public.financial_periods fp
-- Account balance totals
LEFT JOIN (
  SELECT financial_period_id,
         SUM(debit_movement)  AS total_debit,
         SUM(credit_movement) AS total_credit
  FROM public.account_balances
  GROUP BY financial_period_id
) ab ON ab.financial_period_id = fp.id
-- Journal entry count
LEFT JOIN (
  SELECT financial_period_id, COUNT(*) AS posted_entry_count
  FROM public.journal_entries
  WHERE status = 'posted'
  GROUP BY financial_period_id
) je ON je.financial_period_id = fp.id
-- Latest reconciliation run per type
LEFT JOIN LATERAL (
  SELECT is_reconciled FROM public.reconciliation_runs
  WHERE financial_period_id = fp.id AND reconciliation_type = 'bank'
  ORDER BY started_at DESC LIMIT 1
) rr_bank ON true
LEFT JOIN LATERAL (
  SELECT is_reconciled FROM public.reconciliation_runs
  WHERE financial_period_id = fp.id AND reconciliation_type = 'accounts_receivable'
  ORDER BY started_at DESC LIMIT 1
) rr_ar ON true
LEFT JOIN LATERAL (
  SELECT is_reconciled FROM public.reconciliation_runs
  WHERE financial_period_id = fp.id AND reconciliation_type = 'vat'
  ORDER BY started_at DESC LIMIT 1
) rr_vat ON true
LEFT JOIN LATERAL (
  SELECT is_reconciled FROM public.reconciliation_runs
  WHERE financial_period_id = fp.id AND reconciliation_type = 'deferred_revenue'
  ORDER BY started_at DESC LIMIT 1
) rr_def ON true
-- Snapshot existence
LEFT JOIN LATERAL (
  SELECT id FROM public.period_audit_snapshots
  WHERE financial_period_id = fp.id AND snapshot_type = 'soft_close'
  LIMIT 1
) snap_soft ON true
LEFT JOIN LATERAL (
  SELECT id FROM public.period_audit_snapshots
  WHERE financial_period_id = fp.id AND snapshot_type = 'hard_close'
  LIMIT 1
) snap_hard ON true;

COMMENT ON VIEW public.v_period_close_readiness IS
  'Per-period close readiness dashboard: trial balance status, reconciliation coverage, '
  'amendment count, and audit snapshot existence. SECURITY INVOKER.';

GRANT SELECT ON public.v_period_close_readiness TO authenticated, service_role;
