-- Core communication enabled by default for NEW organizations.
--
-- Testing Remarks (2026-10-09, "Kommunikation"): e-mail and SMS for a booked
-- lesson must work and be on automatically; a school that does not want them
-- switches them off itself. Until now seed_org_communication() created every
-- channel and every rule disabled, so a new school sent nothing until someone
-- discovered and enabled each rule (production: booking_confirmed enabled in
-- 2 of 351 rules).
--
-- Change (new organizations only — seeding is ON CONFLICT DO NOTHING, so
-- existing schools' choices are untouched):
--   * sms and email channels start enabled on the platform providers
--     (46elks / resend), exactly what business setup already writes when a
--     school opts in.
--   * the four core student rules start enabled on both channels:
--     booking_confirmed, booking_cancelled, booking_rescheduled,
--     booking_reminder_24h.
-- Everything else stays disabled as before. Function body is otherwise
-- identical to 20260820000000_instructor_booking_notifications.sql.

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
  v_tpl_instr_confirmed_sms          uuid;
  v_tpl_instr_confirmed_email        uuid;
  v_tpl_instr_cancelled_sms          uuid;
  v_tpl_instr_cancelled_email        uuid;
  v_tpl_instr_rescheduled_sms        uuid;
  v_tpl_instr_rescheduled_email      uuid;
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
  SELECT id INTO v_tpl_instr_confirmed_sms     FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.confirmed.instructor'   AND channel = 'sms';
  SELECT id INTO v_tpl_instr_confirmed_email   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.confirmed.instructor'   AND channel = 'email';
  SELECT id INTO v_tpl_instr_cancelled_sms     FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.cancelled.instructor'   AND channel = 'sms';
  SELECT id INTO v_tpl_instr_cancelled_email   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.cancelled.instructor'   AND channel = 'email';
  SELECT id INTO v_tpl_instr_rescheduled_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.rescheduled.instructor' AND channel = 'sms';
  SELECT id INTO v_tpl_instr_rescheduled_email FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.rescheduled.instructor' AND channel = 'email';
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

  -- SMS och e-post påslagna med plattformens leverantörer. Leverantörsfälten är
  -- skyddade (protect_channel_configs_*_provider_fields) och får bara sättas av
  -- backend (service_role) eller plattformsadmin — vilket gäller alla riktiga
  -- skolskapanden (trial-signup, platform-admin). Skapas en skola på annat sätt
  -- (t.ex. bootstrap-SQL) faller vi tillbaka till avstängda kanaler i stället
  -- för att stoppa skapandet av skolan.
  BEGIN
    WITH inserted AS (
      INSERT INTO channel_configs
        (organization_id, channel, enabled, provider, daily_limit)
      VALUES
        (p_org_id, 'sms',      true,  '46elks', 500),
        (p_org_id, 'email',    true,  'resend', 1000),
        (p_org_id, 'whatsapp', false, NULL, 200),
        (p_org_id, 'push',     false, NULL, 2000),
        (p_org_id, 'voice',    false, NULL, 100)
      ON CONFLICT (organization_id, channel) DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*) INTO v_channels_added FROM inserted;
  EXCEPTION WHEN insufficient_privilege THEN
    WITH inserted AS (
      INSERT INTO channel_configs
        (organization_id, channel, enabled, provider, daily_limit)
      VALUES
        (p_org_id, 'sms',      false, NULL, 500),
        (p_org_id, 'email',    false, NULL, 1000),
        (p_org_id, 'whatsapp', false, NULL, 200),
        (p_org_id, 'push',     false, NULL, 2000),
        (p_org_id, 'voice',    false, NULL, 100)
      ON CONFLICT (organization_id, channel) DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*) INTO v_channels_added FROM inserted;
  END;

  WITH inserted AS (
    INSERT INTO notification_rules
      (organization_id, trigger_event, channel, template_id, recipient_type, enabled)
    SELECT p_org_id, t.trigger_event, t.channel, t.template_id, t.recipient_type,
           -- Core lesson communication to the student is ON by default
           -- (Testing Remarks 2026-10-09: booking confirmation etc. must be
           -- automatic; the school can switch any rule off).
           (t.recipient_type = 'student'
            AND t.trigger_event IN ('booking_confirmed', 'booking_cancelled',
                                    'booking_rescheduled', 'booking_reminder_24h'))
    FROM (VALUES
      ('booking_confirmed',         'sms',   v_tpl_booking_confirmed_sms,   'student'),
      ('booking_confirmed',         'email', v_tpl_booking_confirmed_email, 'student'),
      ('booking_confirmed',         'sms',   v_tpl_instr_confirmed_sms,     'instructor'),
      ('booking_confirmed',         'email', v_tpl_instr_confirmed_email,   'instructor'),
      ('booking_cancelled',         'sms',   v_tpl_booking_cancelled_sms,   'student'),
      ('booking_cancelled',         'email', v_tpl_booking_cancelled_email, 'student'),
      ('booking_cancelled',         'sms',   v_tpl_booking_cancelled_sms,   'guardian'),
      ('booking_cancelled',         'email', v_tpl_booking_cancelled_email, 'guardian'),
      ('booking_cancelled',         'sms',   v_tpl_instr_cancelled_sms,     'instructor'),
      ('booking_cancelled',         'email', v_tpl_instr_cancelled_email,   'instructor'),
      ('booking_rescheduled',       'sms',   v_tpl_booking_rescheduled_sms,   'student'),
      ('booking_rescheduled',       'email', v_tpl_booking_rescheduled_email, 'student'),
      ('booking_rescheduled',       'sms',   v_tpl_booking_rescheduled_sms,   'guardian'),
      ('booking_rescheduled',       'email', v_tpl_booking_rescheduled_email, 'guardian'),
      ('booking_rescheduled',       'sms',   v_tpl_instr_rescheduled_sms,     'instructor'),
      ('booking_rescheduled',       'email', v_tpl_instr_rescheduled_email,   'instructor'),
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
