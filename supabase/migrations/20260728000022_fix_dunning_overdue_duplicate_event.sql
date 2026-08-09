-- ════════════════════════════════════════════════════════════════════════════
-- Fix: process_dunning_tick() emitted Invoice.Overdue unconditionally
--
-- The dunning-state INSERT already uses ON CONFLICT (invoice_id) DO NOTHING,
-- which correctly no-ops for a concurrent worker run racing the same
-- newly-overdue invoice — but the following PERFORM insert_outbox_event
-- executed regardless of whether this call's INSERT actually won the race.
-- Two overlapping event-worker invocations scanning the same invoice in the
-- same tick, just as it crosses the overdue threshold, would both emit
-- Invoice.Overdue even though only one of them actually created the dunning
-- state row.
--
-- The dunning STAGE ESCALATION loop below (section 3) was already correct —
-- it uses FOR UPDATE OF ids SKIP LOCKED, which is the right claim-based
-- pattern. This fix brings section 2's first-detection loop in line with
-- the same discipline: claim first (verify the INSERT actually inserted a
-- row via GET DIAGNOSTICS ROW_COUNT), only then act (emit the event).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.process_dunning_tick(
  p_limit int DEFAULT 100
)
RETURNS int  -- count of invoices processed
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice     RECORD;
  v_state       invoice_dunning_state%ROWTYPE;
  v_schedule    dunning_schedules%ROWTYPE;
  v_first_stage dunning_schedule_stages%ROWTYPE;
  v_next_stage  dunning_schedule_stages%ROWTYPE;
  v_log_id      uuid;
  v_count       int := 0;
  v_inserted    int;
BEGIN
  -- 1. Mark invoices as overdue (issued/partially_paid past due_date)
  UPDATE invoices
  SET
    status     = 'overdue',
    updated_at = now()
  WHERE status   IN ('issued', 'partially_paid')
    AND due_date IS NOT NULL
    AND due_date < now()::date
    AND outstanding_amount > 0;

  -- 2. Initialize dunning state for overdue invoices that don't have one yet
  FOR v_invoice IN
    SELECT i.id, i.organization_id, i.student_id, i.due_date, i.invoice_number
    FROM   invoices i
    WHERE  i.status = 'overdue'
      AND  NOT EXISTS (
        SELECT 1 FROM invoice_dunning_state ids WHERE ids.invoice_id = i.id
      )
    ORDER  BY i.due_date ASC NULLS LAST
    LIMIT  p_limit
  LOOP
    -- Find the default dunning schedule for this org
    SELECT * INTO v_schedule
    FROM   dunning_schedules
    WHERE  organization_id = v_invoice.organization_id
      AND  is_default      = true
      AND  is_active       = true
    LIMIT  1;

    -- Find earliest applicable stage
    IF FOUND THEN
      SELECT * INTO v_first_stage
      FROM   dunning_schedule_stages
      WHERE  schedule_id = v_schedule.id
      ORDER  BY stage_number ASC
      LIMIT  1;
    END IF;

    INSERT INTO invoice_dunning_state (
      organization_id, invoice_id,
      schedule_id, current_stage_number, current_stage_id,
      next_action_at, is_resolved, is_escalated_legal
    ) VALUES (
      v_invoice.organization_id, v_invoice.id,
      CASE WHEN FOUND THEN v_schedule.id ELSE NULL END,
      0,
      NULL,
      -- Schedule first action based on first stage days_overdue
      CASE WHEN FOUND AND v_first_stage IS NOT NULL
           THEN v_invoice.due_date + make_interval(days := v_first_stage.days_overdue)
           ELSE NULL
      END,
      false, false
    )
    ON CONFLICT (invoice_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- Only emit Invoice.Overdue if this call actually won the race and
    -- created the dunning state row — a concurrent worker run that already
    -- initialized it (ON CONFLICT DO NOTHING skipped our insert) must not
    -- also emit a duplicate event.
    IF v_inserted > 0 THEN
      PERFORM insert_outbox_event(
        'Invoice.Overdue',
        'internal',
        jsonb_build_object(
          'invoice_id',     v_invoice.id,
          'invoice_number', v_invoice.invoice_number,
          'student_id',     v_invoice.student_id,
          'due_date',       v_invoice.due_date,
          'days_overdue',   (now()::date - v_invoice.due_date)
        ),
        v_invoice.organization_id,
        v_invoice.student_id::text
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- 3. Process invoices with next_action_at <= now() (advance dunning stage)
  FOR v_invoice IN
    SELECT i.id, i.organization_id, i.student_id, i.invoice_number
    FROM   invoice_dunning_state ids
    JOIN   invoices i ON i.id = ids.invoice_id
    WHERE  ids.next_action_at  <= now()
      AND  ids.is_resolved      = false
      AND  ids.is_escalated_legal = false
      AND  ids.schedule_id      IS NOT NULL
      AND  i.status             IN ('overdue', 'partially_paid')
    ORDER  BY ids.next_action_at ASC
    LIMIT  p_limit - v_count
    FOR UPDATE OF ids SKIP LOCKED
  LOOP
    SELECT * INTO v_state
    FROM   invoice_dunning_state
    WHERE  invoice_id = v_invoice.id;

    -- Find next applicable stage
    SELECT * INTO v_next_stage
    FROM   dunning_schedule_stages
    WHERE  schedule_id  = v_state.schedule_id
      AND  stage_number > v_state.current_stage_number
    ORDER  BY stage_number ASC
    LIMIT  1;

    CONTINUE WHEN NOT FOUND;

    -- Log the action
    INSERT INTO invoice_reminder_log (
      organization_id, invoice_id, student_id,
      stage_id, stage_number, action_type,
      sent_at, is_automated
    ) VALUES (
      v_state.organization_id, v_invoice.id, v_invoice.student_id,
      v_next_stage.id, v_next_stage.stage_number, v_next_stage.action_type,
      now(), true
    ) RETURNING id INTO v_log_id;

    -- Compute next_action_at for after this stage (peek at following stage)
    DECLARE
      v_following_stage dunning_schedule_stages%ROWTYPE;
    BEGIN
      SELECT * INTO v_following_stage
      FROM   dunning_schedule_stages
      WHERE  schedule_id  = v_state.schedule_id
        AND  stage_number > v_next_stage.stage_number
      ORDER  BY stage_number ASC
      LIMIT  1;
    END;

    -- Update dunning state
    UPDATE invoice_dunning_state
    SET
      current_stage_number = v_next_stage.stage_number,
      current_stage_id     = v_next_stage.id,
      last_actioned_at     = now(),
      next_action_at       = CASE
        WHEN v_next_stage.is_final_stage THEN NULL
        WHEN v_following_stage.id IS NOT NULL
          THEN (SELECT i2.due_date FROM invoices i2 WHERE i2.id = v_invoice.id)
               + make_interval(days := v_following_stage.days_overdue)
        ELSE NULL
      END,
      is_escalated_legal   = (v_next_stage.action_type = 'legal'),
      updated_at           = now()
    WHERE id = v_state.id;

    -- Emit Invoice.ReminderSent
    PERFORM insert_outbox_event(
      'Invoice.ReminderSent',
      'internal',
      jsonb_build_object(
        'invoice_id',      v_invoice.id,
        'invoice_number',  v_invoice.invoice_number,
        'student_id',      v_invoice.student_id,
        'stage_number',    v_next_stage.stage_number,
        'action_type',     v_next_stage.action_type,
        'reminder_log_id', v_log_id,
        'is_automated',    true
      ),
      v_state.organization_id,
      v_invoice.student_id::text
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.process_dunning_tick(int) IS
  'Maintenance tick for dunning automation. Called by event-worker on every run. '
  'Marks overdue invoices, initializes dunning state (claim-gated via '
  'ON CONFLICT DO NOTHING + ROW_COUNT check before emitting Invoice.Overdue), '
  'advances stages, and emits events. Uses SKIP LOCKED to prevent concurrent '
  'double-processing of stage escalation.';
