-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260531000003_phase4b_dunning.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4B.3 — Dunning, Overdue Detection, and Invoice Reminders
--
-- Implements:
--   dunning_schedules        — per-org escalation schedule configuration
--   dunning_schedule_stages  — ordered escalation stages per schedule
--   invoice_dunning_state    — current dunning state per overdue invoice
--   invoice_reminder_log     — append-only log of reminders sent
--
-- New SECURITY DEFINER functions:
--   advance_dunning_stage  — manually advance a single invoice's dunning state
--   process_dunning_tick   — maintenance tick: detect overdue + advance dunning
--
-- Design:
--   • Dunning is org-configurable: each org has its own escalation schedule
--   • Each stage defines days_overdue (trigger threshold), action_type
--     (email/sms/both/legal), and optional suspend_access flag
--   • process_dunning_tick() is called by the event-worker maintenance tick
--   • invoice_dunning_state tracks current stage + next_action_at per invoice
--   • When an invoice is paid, is_resolved=true prevents further dunning
--   • Invoice.Overdue and Invoice.ReminderSent events are emitted per action
--
-- Communication channels:
--   dunning_action_type values: email, sms, both, legal
--   'legal' = escalate to legal team (mark_legal action); no further reminders
--
-- Dependencies:
--   20260531000001_phase4b_refunds_allocations.sql — assert_period_not_locked
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: New enum types ────────────────────────────────────────────────

CREATE TYPE public.dunning_action_type AS ENUM (
  'email',   -- Send email reminder only
  'sms',     -- Send SMS reminder only
  'both',    -- Send both email and SMS reminder
  'legal'    -- Escalate to legal; no further automated reminders
);

-- ── Section 2: New tables ────────────────────────────────────────────────────

-- 2.1 dunning_schedules
-- Per-org dunning configuration. An org can have one default schedule plus
-- additional named schedules for specific cases (e.g., corporate accounts).

CREATE TABLE public.dunning_schedules (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  description      text,
  is_default       boolean     NOT NULL DEFAULT false,
  is_active        boolean     NOT NULL DEFAULT true,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX dunning_schedules_org_default_unique
  ON public.dunning_schedules (organization_id)
  WHERE is_default = true;

COMMENT ON TABLE public.dunning_schedules IS
  'Per-org dunning escalation schedule. Only one default per org '
  '(enforced by partial unique index on is_default=true).';

CREATE TRIGGER set_dunning_schedules_updated_at
  BEFORE UPDATE ON public.dunning_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.2 dunning_schedule_stages
-- Ordered escalation stages for a dunning schedule.
-- days_overdue: trigger this stage when (now() - invoice.due_date) >= days_overdue.
-- Both stage_number and days_overdue must be unique within a schedule.

CREATE TABLE public.dunning_schedule_stages (
  id               uuid                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id      uuid                     NOT NULL REFERENCES public.dunning_schedules(id) ON DELETE CASCADE,
  stage_number     int                      NOT NULL CHECK (stage_number >= 1),
  days_overdue     int                      NOT NULL CHECK (days_overdue >= 0),
  action_type      public.dunning_action_type NOT NULL,
  subject_template text,
  message_template text,
  late_fee_amount  numeric(12,2)            NOT NULL DEFAULT 0 CHECK (late_fee_amount >= 0),
  suspend_access   boolean                  NOT NULL DEFAULT false,
  is_final_stage   boolean                  NOT NULL DEFAULT false,
  metadata         jsonb                    NOT NULL DEFAULT '{}',
  created_at       timestamptz              NOT NULL DEFAULT now(),
  updated_at       timestamptz              NOT NULL DEFAULT now(),

  CONSTRAINT dunning_stages_schedule_number_unique UNIQUE (schedule_id, stage_number),
  CONSTRAINT dunning_stages_schedule_days_unique   UNIQUE (schedule_id, days_overdue)
);

COMMENT ON TABLE  public.dunning_schedule_stages IS
  'Ordered stages within a dunning schedule. Each stage fires when '
  '(current_date - invoice.due_date) >= days_overdue.';
COMMENT ON COLUMN public.dunning_schedule_stages.is_final_stage IS
  'When true: no further escalation after this stage. Invoice stays in this stage '
  'until paid or manually resolved.';

CREATE TRIGGER set_dunning_schedule_stages_updated_at
  BEFORE UPDATE ON public.dunning_schedule_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.3 invoice_dunning_state
-- One row per invoice that has entered the dunning process.
-- is_resolved=true when invoice is paid or manually cleared — prevents further dunning.

CREATE TABLE public.invoice_dunning_state (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id            uuid        NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  schedule_id           uuid        REFERENCES public.dunning_schedules(id) ON DELETE SET NULL,
  current_stage_number  int         NOT NULL DEFAULT 0,
  current_stage_id      uuid        REFERENCES public.dunning_schedule_stages(id) ON DELETE SET NULL,
  next_action_at        timestamptz,
  last_actioned_at      timestamptz,
  is_resolved           boolean     NOT NULL DEFAULT false,
  is_escalated_legal    boolean     NOT NULL DEFAULT false,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invoice_dunning_state_invoice_unique UNIQUE (invoice_id)
);

COMMENT ON TABLE  public.invoice_dunning_state IS
  'Current dunning state per invoice. One row per invoice in the dunning process. '
  'Set is_resolved=true to stop further dunning (e.g., after payment or manual clearance).';
COMMENT ON COLUMN public.invoice_dunning_state.current_stage_number IS
  '0 = invoice detected overdue but no stage actioned yet. '
  '>0 = stage_number of the last actioned stage.';

CREATE TRIGGER set_invoice_dunning_state_updated_at
  BEFORE UPDATE ON public.invoice_dunning_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.4 invoice_reminder_log
-- Append-only record of every reminder/dunning action taken.
-- One row per send attempt. is_automated=false for manually triggered actions.

CREATE TABLE public.invoice_reminder_log (
  id               uuid                       NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid                       NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id       uuid                       NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  student_id       uuid                       NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  stage_id         uuid                       REFERENCES public.dunning_schedule_stages(id) ON DELETE SET NULL,
  stage_number     int,
  action_type      public.dunning_action_type NOT NULL,
  sent_at          timestamptz                NOT NULL DEFAULT now(),
  sent_by          uuid                       REFERENCES auth.users(id) ON DELETE SET NULL,
  is_automated     boolean                    NOT NULL DEFAULT true,
  notes            text,
  created_at       timestamptz                NOT NULL DEFAULT now()

  -- NO updated_at: append-only log
);

COMMENT ON TABLE public.invoice_reminder_log IS
  'Append-only log of all dunning reminders sent. '
  'One row per action. Never delete or update rows.';

-- ── Section 3: Audit triggers ────────────────────────────────────────────────

CREATE TRIGGER dunning_schedules_audit
  AFTER INSERT OR UPDATE ON public.dunning_schedules
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER dunning_schedule_stages_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.dunning_schedule_stages
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER invoice_reminder_log_audit
  AFTER INSERT ON public.invoice_reminder_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ── Section 4: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.dunning_schedules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dunning_schedule_stages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_dunning_state    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminder_log     ENABLE ROW LEVEL SECURITY;

-- dunning_schedules: finance:dunning:manage required
CREATE POLICY "dunning_schedules_select"
  ON public.dunning_schedules FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:dunning:manage')
  );

CREATE POLICY "dunning_schedules_insert"
  ON public.dunning_schedules FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:dunning:manage')
  );

CREATE POLICY "dunning_schedules_update"
  ON public.dunning_schedules FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:dunning:manage')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:dunning:manage')
  );

-- dunning_schedule_stages: access via schedule
CREATE POLICY "dunning_schedule_stages_select"
  ON public.dunning_schedule_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dunning_schedules ds
      WHERE ds.id = schedule_id
        AND ds.organization_id = public.auth_organization_id()
    )
    AND public.has_permission('finance:dunning:manage')
  );

CREATE POLICY "dunning_schedule_stages_insert"
  ON public.dunning_schedule_stages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dunning_schedules ds
      WHERE ds.id = schedule_id
        AND ds.organization_id = public.auth_organization_id()
    )
    AND public.has_permission('finance:dunning:manage')
  );

CREATE POLICY "dunning_schedule_stages_update"
  ON public.dunning_schedule_stages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.dunning_schedules ds
      WHERE ds.id = schedule_id
        AND ds.organization_id = public.auth_organization_id()
    )
    AND public.has_permission('finance:dunning:manage')
  );

CREATE POLICY "dunning_schedule_stages_delete"
  ON public.dunning_schedule_stages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.dunning_schedules ds
      WHERE ds.id = schedule_id
        AND ds.organization_id = public.auth_organization_id()
    )
    AND public.has_permission('finance:dunning:manage')
  );

-- invoice_dunning_state: read with dunning:manage
CREATE POLICY "invoice_dunning_state_select"
  ON public.invoice_dunning_state FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:dunning:manage')
  );

-- invoice_reminder_log: read with dunning:manage
CREATE POLICY "invoice_reminder_log_select"
  ON public.invoice_reminder_log FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:dunning:manage')
  );

-- ── Section 5: Table grants ──────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE        ON public.dunning_schedules       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dunning_schedule_stages TO authenticated, service_role;
GRANT SELECT                        ON public.invoice_dunning_state   TO authenticated;
GRANT SELECT, INSERT, UPDATE        ON public.invoice_dunning_state   TO service_role;
GRANT SELECT                        ON public.invoice_reminder_log    TO authenticated;
GRANT SELECT, INSERT                ON public.invoice_reminder_log    TO service_role;

-- ── Section 6: SECURITY DEFINER Functions ────────────────────────────────────

-- ── 6.1 advance_dunning_stage ────────────────────────────────────────────────
-- Manually advance a single invoice's dunning to the next eligible stage.
-- Emits Invoice.ReminderSent and logs to invoice_reminder_log.
-- Used for manual overrides; automatic advancement is done by process_dunning_tick().

CREATE OR REPLACE FUNCTION public.advance_dunning_stage(
  p_invoice_id uuid,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state       invoice_dunning_state%ROWTYPE;
  v_invoice     invoices%ROWTYPE;
  v_next_stage  dunning_schedule_stages%ROWTYPE;
  v_log_id      uuid;
BEGIN
  -- Lock dunning state row
  SELECT * INTO v_state
  FROM   invoice_dunning_state
  WHERE  invoice_id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DUNNING_STATE_NOT_FOUND: no dunning state for invoice %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_state.is_resolved THEN
    RAISE EXCEPTION 'DUNNING_RESOLVED: invoice % dunning is resolved; cannot advance',
      p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_state.is_escalated_legal THEN
    RAISE EXCEPTION 'DUNNING_LEGAL_ESCALATED: invoice % has been escalated to legal; no further stages',
      p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Fetch invoice for org + student context
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;

  -- Find the next stage (first stage with stage_number > current)
  SELECT * INTO v_next_stage
  FROM   dunning_schedule_stages
  WHERE  schedule_id   = v_state.schedule_id
    AND  stage_number  > v_state.current_stage_number
  ORDER  BY stage_number ASC
  LIMIT  1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_NEXT_STAGE: no further stages in schedule for invoice %',
      p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Log the action
  INSERT INTO invoice_reminder_log (
    organization_id, invoice_id, student_id,
    stage_id, stage_number, action_type,
    sent_at, sent_by, is_automated
  ) VALUES (
    v_state.organization_id, p_invoice_id, v_invoice.student_id,
    v_next_stage.id, v_next_stage.stage_number, v_next_stage.action_type,
    now(), p_actor_id, false
  ) RETURNING id INTO v_log_id;

  -- Update dunning state
  UPDATE invoice_dunning_state
  SET
    current_stage_number = v_next_stage.stage_number,
    current_stage_id     = v_next_stage.id,
    last_actioned_at     = now(),
    next_action_at       = NULL,  -- no auto-advance after manual action
    is_escalated_legal   = (v_next_stage.action_type = 'legal'),
    updated_at           = now()
  WHERE id = v_state.id;

  -- Emit Invoice.ReminderSent
  PERFORM insert_outbox_event(
    'Invoice.ReminderSent',
    'internal',
    jsonb_build_object(
      'invoice_id',      p_invoice_id,
      'invoice_number',  v_invoice.invoice_number,
      'student_id',      v_invoice.student_id,
      'stage_number',    v_next_stage.stage_number,
      'action_type',     v_next_stage.action_type,
      'reminder_log_id', v_log_id,
      'is_automated',    false
    ),
    v_state.organization_id,
    v_invoice.student_id::text
  );
END;
$$;

-- ── 6.2 process_dunning_tick ─────────────────────────────────────────────────
-- Maintenance tick called by the event-worker on every invocation.
-- Steps:
--   1. Mark overdue invoices (issued/partially_paid past due_date)
--   2. Initialize dunning state for newly-overdue invoices
--   3. Advance dunning for invoices whose next_action_at <= now()
--   4. Emit Invoice.Overdue and Invoice.ReminderSent events as needed
-- Returns count of invoices processed.

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

    -- Emit Invoice.Overdue on first detection
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
  'Marks overdue invoices, initializes dunning state, advances stages, and emits events. '
  'Uses SKIP LOCKED to prevent concurrent double-processing.';

-- ── Section 7: Function grants ───────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.advance_dunning_stage(uuid, uuid)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.process_dunning_tick(int)
  TO service_role;

-- ── Section 8: New permissions ───────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'finance:dunning:manage', 'finance', 'dunning', 'manage', 'Configure dunning schedules and manage overdue invoice workflows')
ON CONFLICT (code) DO NOTHING;

-- ── Section 9: Role-permission assignments ───────────────────────────────────

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = ANY(ARRAY['org_owner', 'org_admin', 'finance_admin'])
  AND  r.is_system_role = true
  AND  p.code = 'finance:dunning:manage'
ON CONFLICT DO NOTHING;
