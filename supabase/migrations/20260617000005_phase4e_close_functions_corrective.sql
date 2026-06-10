-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260617000005_phase4e_close_functions_corrective.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     Corrective — Phase 4E Period Close Function Repair
--
-- PURPOSE:
--   Corrects the insert_outbox_event() argument order in three period-close
--   functions that were applied in 20260603000003_phase4e_financial_close_engine.
--
-- ROOT CAUSE:
--   insert_outbox_event(p_event_type text, p_channel event_channel, p_payload jsonb, ...)
--   Three functions were authored with the first two arguments transposed:
--     WRONG:   insert_outbox_event(v_period.organization_id, 'Period.SoftClosed', ...)
--     CORRECT: insert_outbox_event('Period.SoftClosed', 'accounting', ...)
--
--   Effect: passing org_id (uuid, cast to text) as the event_type, and a non-enum
--   string literal as the channel — causes runtime ERROR on every invocation of
--   soft_close_period, reopen_soft_closed_period, and hard_close_period.
--
-- FUNCTIONS REPAIRED (CREATE OR REPLACE — identical logic, corrected event calls):
--   public.soft_close_period(uuid, text, uuid)
--   public.reopen_soft_closed_period(uuid, text, uuid)
--   public.hard_close_period(uuid, text, uuid)
--
-- CHANNEL RATIONALE:
--   Period lifecycle events (SoftClosed, Reopened, HardClosed) are accounting-domain
--   events consumed by the internal event worker for audit, reconciliation, and
--   compliance downstream. Channel = 'accounting' (consistent with Invoice.Voided,
--   Refund.Processed, FiscalYear.Closed).
--
-- GOVERNANCE:
--   insert_outbox_event argument order is: (event_type, channel, payload, org_id).
--   This order must never be inverted. Future functions must reference this
--   corrective migration or the Phase 2B scheduling events migration as the
--   canonical call-site pattern.
-- ════════════════════════════════════════════════════════════════════════════

-- ── soft_close_period ────────────────────────────────────────────────────────

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

  v_validation := public.validate_period_for_close(p_period_id, p_actor_id);
  IF NOT (v_validation->>'critical_passed')::boolean THEN
    RAISE EXCEPTION 'PERIOD_CLOSE_BLOCKED: critical validation checks failed for period %: %',
      p_period_id, v_validation->'checks'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.capture_period_audit_snapshot(p_period_id, 'soft_close', p_notes, p_actor_id);

  UPDATE financial_periods
  SET status     = 'closed',
      closed_at  = now(),
      closed_by  = p_actor_id,
      notes      = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_period_id;

  PERFORM public.insert_outbox_event(
    'Period.SoftClosed',
    'accounting'::public.event_channel,
    jsonb_build_object('period_id', p_period_id, 'closed_by', p_actor_id),
    v_period.organization_id
  );
END;
$$;

COMMENT ON FUNCTION public.soft_close_period(uuid,text,uuid) IS
  'Transitions a period from open → closed (soft-close). '
  'Requires trial_balance_balanced and journal_entries_balanced checks to pass. '
  'Captures a soft_close audit snapshot. Emits Period.SoftClosed event.';

GRANT EXECUTE ON FUNCTION public.soft_close_period(uuid,text,uuid) TO authenticated, service_role;

-- ── reopen_soft_closed_period ────────────────────────────────────────────────

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
    'Period.Reopened',
    'accounting'::public.event_channel,
    jsonb_build_object('period_id', p_period_id, 'reason', p_reason, 'actor_id', p_actor_id),
    v_period.organization_id
  );
END;
$$;

COMMENT ON FUNCTION public.reopen_soft_closed_period(uuid,text,uuid) IS
  'Reverts a soft-closed period (closed) back to open. '
  'Cannot be called on locked (hard-closed) periods. '
  'A reason string is mandatory. Emits Period.Reopened event.';

GRANT EXECUTE ON FUNCTION public.reopen_soft_closed_period(uuid,text,uuid) TO authenticated, service_role;

-- ── hard_close_period ────────────────────────────────────────────────────────

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

  v_validation := public.validate_period_for_close(p_period_id, p_actor_id);
  IF NOT (v_validation->>'all_passed')::boolean THEN
    RAISE EXCEPTION 'PERIOD_HARD_CLOSE_BLOCKED: all validation checks must pass for hard-close of period %: %',
      p_period_id, v_validation->'checks'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.capture_period_audit_snapshot(p_period_id, 'hard_close', p_notes, p_actor_id);

  UPDATE financial_periods
  SET status     = 'locked',
      locked_at  = now(),
      locked_by  = p_actor_id,
      notes      = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_period_id;

  PERFORM public.insert_outbox_event(
    'Period.HardClosed',
    'accounting'::public.event_channel,
    jsonb_build_object('period_id', p_period_id, 'locked_by', p_actor_id),
    v_period.organization_id
  );
END;
$$;

COMMENT ON FUNCTION public.hard_close_period(uuid,text,uuid) IS
  'Transitions a soft-closed period (closed) → locked. IRREVERSIBLE. '
  'All 6 validation checks must pass (critical + advisory). '
  'Captures a hard_close audit snapshot. Emits Period.HardClosed event. '
  'Locked periods cannot receive new journal entries (enforced by post_journal_entry()).';

GRANT EXECUTE ON FUNCTION public.hard_close_period(uuid,text,uuid) TO authenticated, service_role;
