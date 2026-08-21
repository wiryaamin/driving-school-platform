-- =============================================================================
-- Guardian Portal P0: booking-change notifications for guardians
--
-- Context: notifications.recipient_type already included 'guardian' from the
-- Notification Center's original design (20260724000001_notification_center.sql
-- — "Students, Guardians, Instructors, Staff"), but notification_rules and
-- outbound_messages were never widened to match — only 'student'/'instructor'
-- initially, then 'admin' was added once (20260804000001), 'guardian' never.
-- This is exactly the kind of pre-existing, narrow implementation gap the
-- rest of the architecture already anticipated but never finished wiring —
-- not a new capability being invented.
--
-- This migration:
--   1. Widens the two CHECK constraints that were never extended to
--      'guardian', following the identical widening pattern already used
--      twice before for 'admin' (20260724000001, 20260804000001) — same
--      shape, same DROP/ADD CONSTRAINT, no new mechanism.
--   2. Extends seed_org_communication() (its (n+2)th extension — every prior
--      migration that added a trigger_event did this the same way) to seed
--      two new, disabled-by-default rules per org: booking_cancelled and
--      booking_rescheduled, recipient_type='guardian', sms + email, pointing
--      at the EXACT SAME system templates the existing 'student' rules for
--      those triggers already use. No new template content — reusing the
--      existing business copy verbatim, per F3's "do not duplicate the
--      business rules" governance for this feature.
--   3. Backfills every existing org, matching the established backfill
--      pattern from every prior seed-extension migration.
-- =============================================================================

-- ── 1. Widen the two CHECK constraints that omitted 'guardian' ──────────────

ALTER TABLE notification_rules DROP CONSTRAINT notification_rules_recipient_type_check;
ALTER TABLE notification_rules ADD CONSTRAINT notification_rules_recipient_type_check
  CHECK (recipient_type IN ('student', 'instructor', 'guardian', 'admin'));

ALTER TABLE outbound_messages DROP CONSTRAINT outbound_messages_recipient_type_check;
ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_recipient_type_check
  CHECK (recipient_type IN ('student', 'instructor', 'guardian', 'manual', 'admin'));

-- ── 2. Extend seed_org_communication() with the two new guardian rules ──────
-- Full CREATE OR REPLACE, matching the exact shape of every prior extension
-- (20260622000003 -> 20260723000001 -> 20260804000001 -> 20260804000003 ->
-- 20260807090000 -> this one). No template variables list changed on the
-- reused templates (förnamn/datum/tid/trafikskola) — the guardian rules
-- point at the identical template rows the student rules already use.

CREATE OR REPLACE FUNCTION seed_org_communication(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channels_added  int := 0;
  v_rules_added     int := 0;

  v_tpl_booking_confirmed_sms        uuid;
  v_tpl_booking_confirmed_email      uuid;
  v_tpl_booking_cancelled_sms        uuid;
  v_tpl_booking_cancelled_email      uuid;
  v_tpl_booking_rescheduled_sms      uuid;
  v_tpl_booking_rescheduled_email    uuid;
  v_tpl_reminder_24h_sms             uuid;
  v_tpl_reminder_24h_email           uuid;
  v_tpl_reminder_same_day_sms        uuid;
  v_tpl_reminder_same_day_email      uuid;
  v_tpl_reminder_2h_sms              uuid;
  v_tpl_invoice_issued_email         uuid;
  v_tpl_invoice_due_email            uuid;
  v_tpl_invoice_overdue_email        uuid;
  v_tpl_instr_daily_sms              uuid;
  v_tpl_instr_daily_email            uuid;
  v_tpl_waitlist_promoted_sms        uuid;
  v_tpl_waitlist_promoted_email      uuid;
  v_tpl_lead_created_sms             uuid;
  v_tpl_lead_created_email           uuid;
  v_tpl_enrollment_created_sms       uuid;
  v_tpl_enrollment_created_email     uuid;
  v_tpl_student_created_sms          uuid;
  v_tpl_student_created_email        uuid;
  v_tpl_permit_expiring_sms          uuid;
  v_tpl_permit_expiring_email        uuid;
  v_tpl_exam_scheduled_sms           uuid;
  v_tpl_exam_scheduled_email         uuid;
BEGIN

  SELECT id INTO v_tpl_booking_confirmed_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.confirmed'        AND channel = 'sms';
  SELECT id INTO v_tpl_booking_confirmed_email FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.confirmed'        AND channel = 'email';
  SELECT id INTO v_tpl_booking_cancelled_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.cancelled'        AND channel = 'sms';
  SELECT id INTO v_tpl_booking_cancelled_email FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.cancelled'        AND channel = 'email';
  SELECT id INTO v_tpl_booking_rescheduled_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.rescheduled'     AND channel = 'sms';
  SELECT id INTO v_tpl_booking_rescheduled_email FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.rescheduled'     AND channel = 'email';
  SELECT id INTO v_tpl_reminder_24h_sms        FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.24h'    AND channel = 'sms';
  SELECT id INTO v_tpl_reminder_24h_email      FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.24h'    AND channel = 'email';
  SELECT id INTO v_tpl_reminder_same_day_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.same_day' AND channel = 'sms';
  SELECT id INTO v_tpl_reminder_same_day_email FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.same_day' AND channel = 'email';
  SELECT id INTO v_tpl_reminder_2h_sms         FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.2h'     AND channel = 'sms';
  SELECT id INTO v_tpl_invoice_issued_email    FROM notification_templates WHERE organization_id IS NULL AND key = 'invoice.issued'           AND channel = 'email';
  SELECT id INTO v_tpl_invoice_due_email       FROM notification_templates WHERE organization_id IS NULL AND key = 'invoice.due'              AND channel = 'email';
  SELECT id INTO v_tpl_invoice_overdue_email   FROM notification_templates WHERE organization_id IS NULL AND key = 'invoice.overdue'          AND channel = 'email';
  SELECT id INTO v_tpl_instr_daily_sms         FROM notification_templates WHERE organization_id IS NULL AND key = 'instructor.schedule.daily' AND channel = 'sms';
  SELECT id INTO v_tpl_instr_daily_email       FROM notification_templates WHERE organization_id IS NULL AND key = 'instructor.schedule.daily' AND channel = 'email';
  SELECT id INTO v_tpl_waitlist_promoted_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'waitlist.promoted'        AND channel = 'sms';
  SELECT id INTO v_tpl_waitlist_promoted_email FROM notification_templates WHERE organization_id IS NULL AND key = 'waitlist.promoted'        AND channel = 'email';
  SELECT id INTO v_tpl_lead_created_sms        FROM notification_templates WHERE organization_id IS NULL AND key = 'lead.created'             AND channel = 'sms';
  SELECT id INTO v_tpl_lead_created_email      FROM notification_templates WHERE organization_id IS NULL AND key = 'lead.created'             AND channel = 'email';
  SELECT id INTO v_tpl_enrollment_created_sms  FROM notification_templates WHERE organization_id IS NULL AND key = 'enrollment_request.created' AND channel = 'sms';
  SELECT id INTO v_tpl_enrollment_created_email FROM notification_templates WHERE organization_id IS NULL AND key = 'enrollment_request.created' AND channel = 'email';
  SELECT id INTO v_tpl_student_created_sms     FROM notification_templates WHERE organization_id IS NULL AND key = 'welcome.new_student'       AND channel = 'sms';
  SELECT id INTO v_tpl_student_created_email   FROM notification_templates WHERE organization_id IS NULL AND key = 'welcome.new_student'       AND channel = 'email';
  SELECT id INTO v_tpl_permit_expiring_sms     FROM notification_templates WHERE organization_id IS NULL AND key = 'permit.expiring'          AND channel = 'sms';
  SELECT id INTO v_tpl_permit_expiring_email   FROM notification_templates WHERE organization_id IS NULL AND key = 'permit.expiring'          AND channel = 'email';
  SELECT id INTO v_tpl_exam_scheduled_sms      FROM notification_templates WHERE organization_id IS NULL AND key = 'exam.scheduled'           AND channel = 'sms';
  SELECT id INTO v_tpl_exam_scheduled_email    FROM notification_templates WHERE organization_id IS NULL AND key = 'exam.scheduled'           AND channel = 'email';

  WITH inserted AS (
    INSERT INTO channel_configs
      (organization_id, channel, enabled, daily_limit)
    VALUES
      (p_org_id, 'sms',      false, 500),
      (p_org_id, 'email',    false, 1000),
      (p_org_id, 'whatsapp', false, 200),
      (p_org_id, 'push',     false, 2000),
      (p_org_id, 'voice',    false, 100)
    ON CONFLICT (organization_id, channel) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_channels_added FROM inserted;

  WITH inserted AS (
    INSERT INTO notification_rules
      (organization_id, trigger_event, channel, template_id, recipient_type, enabled)
    SELECT p_org_id, t.trigger_event, t.channel, t.template_id, t.recipient_type, false
    FROM (VALUES
      ('booking_confirmed',         'sms',   v_tpl_booking_confirmed_sms,   'student'),
      ('booking_confirmed',         'email', v_tpl_booking_confirmed_email, 'student'),
      ('booking_cancelled',         'sms',   v_tpl_booking_cancelled_sms,   'student'),
      ('booking_cancelled',         'email', v_tpl_booking_cancelled_email, 'student'),
      ('booking_cancelled',         'sms',   v_tpl_booking_cancelled_sms,   'guardian'),
      ('booking_cancelled',         'email', v_tpl_booking_cancelled_email, 'guardian'),
      ('booking_rescheduled',       'sms',   v_tpl_booking_rescheduled_sms,   'student'),
      ('booking_rescheduled',       'email', v_tpl_booking_rescheduled_email, 'student'),
      ('booking_rescheduled',       'sms',   v_tpl_booking_rescheduled_sms,   'guardian'),
      ('booking_rescheduled',       'email', v_tpl_booking_rescheduled_email, 'guardian'),
      ('booking_reminder_24h',      'sms',   v_tpl_reminder_24h_sms,        'student'),
      ('booking_reminder_24h',      'email', v_tpl_reminder_24h_email,      'student'),
      ('booking_reminder_same_day', 'sms',   v_tpl_reminder_same_day_sms,   'student'),
      ('booking_reminder_same_day', 'email', v_tpl_reminder_same_day_email, 'student'),
      ('booking_reminder_24h',      'sms',   v_tpl_reminder_2h_sms,         'student'),
      ('invoice_issued',            'email', v_tpl_invoice_issued_email,    'student'),
      ('invoice_due',               'email', v_tpl_invoice_due_email,       'student'),
      ('invoice_overdue',           'email', v_tpl_invoice_overdue_email,   'student'),
      ('instructor_schedule_daily', 'sms',   v_tpl_instr_daily_sms,         'instructor'),
      ('instructor_schedule_daily', 'email', v_tpl_instr_daily_email,       'instructor'),
      ('waitlist_promoted',         'sms',   v_tpl_waitlist_promoted_sms,   'student'),
      ('waitlist_promoted',         'email', v_tpl_waitlist_promoted_email, 'student'),
      ('lead_created',              'sms',   v_tpl_lead_created_sms,        'admin'),
      ('lead_created',              'email', v_tpl_lead_created_email,      'admin'),
      ('enrollment_request_created', 'sms',   v_tpl_enrollment_created_sms,   'admin'),
      ('enrollment_request_created', 'email', v_tpl_enrollment_created_email, 'admin'),
      ('student_created',           'sms',   v_tpl_student_created_sms,      'student'),
      ('student_created',           'email', v_tpl_student_created_email,    'student'),
      ('permit_expiring',           'sms',   v_tpl_permit_expiring_sms,      'student'),
      ('permit_expiring',           'email', v_tpl_permit_expiring_email,    'student'),
      ('exam_scheduled',            'sms',   v_tpl_exam_scheduled_sms,       'student'),
      ('exam_scheduled',            'email', v_tpl_exam_scheduled_email,     'student')
    ) AS t(trigger_event, channel, template_id, recipient_type)
    WHERE t.template_id IS NOT NULL
    ON CONFLICT (organization_id, trigger_event, channel, recipient_type) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_rules_added FROM inserted;

  RETURN jsonb_build_object(
    'channels_added', v_channels_added,
    'rules_added',    v_rules_added
  );
END;
$$;

GRANT EXECUTE ON FUNCTION seed_org_communication(uuid) TO service_role;

-- ── 3. Backfill: add the two new guardian rules to every existing org that ──
--       already has communication seeded (idempotent — ON CONFLICT DO NOTHING
--       on the existing (organization_id, trigger_event, channel,
--       recipient_type) rows/channels, matching every prior backfill).

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM organizations LOOP
    PERFORM seed_org_communication(v_org_id);
  END LOOP;
END $$;
