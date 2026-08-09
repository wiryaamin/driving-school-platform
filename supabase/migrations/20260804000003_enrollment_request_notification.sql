-- ════════════════════════════════════════════════════════════════════════════
-- "New Enrollment Request" tenant notification — same gap as lead.created
-- (20260804000001), found the same way: a real submission through the public
-- catalog → checkout → enrollment flow produced no tenant notification at
-- all. enrollment_requests already has its own audit trail
-- (emit_enrollment_event → enrollment_events), but that table is completely
-- isolated from event_outbox/notification_rules — writing to it never
-- notified anyone. Mirrors 20260804000001_lead_created_notification.sql's
-- pattern exactly (DB trigger → event_outbox → event-worker → admin
-- recipient_type, already supported end-to-end since that migration).
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO notification_templates
  (organization_id, key, locale, channel, subject, body_text, variables, is_active)
VALUES

(NULL, 'enrollment_request.created', 'sv', 'sms',
 NULL,
 'Ny anmälan: {förnamn} har anmält intresse för {paket}. Belopp: {belopp} kr. / {trafikskola}',
 ARRAY['förnamn','paket','belopp','trafikskola'],
 true),

(NULL, 'enrollment_request.created', 'sv', 'email',
 'Ny anmälan — {förnamn} till {paket}',
 E'Hej,\n\nEn ny anmälan har kommit in via er publika kurskatalog:\n\nNamn: {förnamn}\nPaket: {paket}\nBelopp: {belopp} kr\nE-post: {lead_email}\nTelefon: {lead_phone}\n\nLogga in och hantera anmälan under Anmälningar i {trafikskola}.\n\nMed vänliga hälsningar\nTrafikcloud',
 ARRAY['förnamn','paket','belopp','lead_email','lead_phone','trafikskola'],
 true)

ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.emit_enrollment_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.insert_outbox_event(
    'enrollment_request.created',
    'internal',
    jsonb_build_object(
      'enrollment_id',   NEW.id,
      'organization_id', NEW.organization_id,
      'first_name',      NEW.first_name,
      'last_name',       NEW.last_name,
      'email',           NEW.email,
      'phone',           NEW.phone,
      'package_name',    NEW.package_name,
      'final_price_incl_vat', NEW.final_price_incl_vat
    ),
    NEW.organization_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enrollment_requests_emit_created
  AFTER INSERT ON public.enrollment_requests
  FOR EACH ROW EXECUTE FUNCTION public.emit_enrollment_request_created();

-- ── Extend seed_org_communication() with the new rule (disabled by default) ──

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
  v_tpl_reminder_24h_sms             uuid;
  v_tpl_reminder_24h_email           uuid;
  v_tpl_reminder_same_day_sms        uuid;
  v_tpl_reminder_same_day_email      uuid;
  v_tpl_reminder_2h_sms              uuid;
  v_tpl_invoice_issued_email         uuid;
  v_tpl_invoice_overdue_email        uuid;
  v_tpl_instr_daily_sms              uuid;
  v_tpl_instr_daily_email            uuid;
  v_tpl_waitlist_promoted_sms        uuid;
  v_tpl_waitlist_promoted_email      uuid;
  v_tpl_lead_created_sms             uuid;
  v_tpl_lead_created_email           uuid;
  v_tpl_enrollment_created_sms       uuid;
  v_tpl_enrollment_created_email     uuid;
BEGIN

  SELECT id INTO v_tpl_booking_confirmed_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.confirmed'        AND channel = 'sms';
  SELECT id INTO v_tpl_booking_confirmed_email FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.confirmed'        AND channel = 'email';
  SELECT id INTO v_tpl_booking_cancelled_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.cancelled'        AND channel = 'sms';
  SELECT id INTO v_tpl_booking_cancelled_email FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.cancelled'        AND channel = 'email';
  SELECT id INTO v_tpl_reminder_24h_sms        FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.24h'    AND channel = 'sms';
  SELECT id INTO v_tpl_reminder_24h_email      FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.24h'    AND channel = 'email';
  SELECT id INTO v_tpl_reminder_same_day_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.same_day' AND channel = 'sms';
  SELECT id INTO v_tpl_reminder_same_day_email FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.same_day' AND channel = 'email';
  SELECT id INTO v_tpl_reminder_2h_sms         FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.2h'     AND channel = 'sms';
  SELECT id INTO v_tpl_invoice_issued_email    FROM notification_templates WHERE organization_id IS NULL AND key = 'invoice.issued'           AND channel = 'email';
  SELECT id INTO v_tpl_invoice_overdue_email   FROM notification_templates WHERE organization_id IS NULL AND key = 'invoice.overdue'          AND channel = 'email';
  SELECT id INTO v_tpl_instr_daily_sms         FROM notification_templates WHERE organization_id IS NULL AND key = 'instructor.schedule.daily' AND channel = 'sms';
  SELECT id INTO v_tpl_instr_daily_email       FROM notification_templates WHERE organization_id IS NULL AND key = 'instructor.schedule.daily' AND channel = 'email';
  SELECT id INTO v_tpl_waitlist_promoted_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'waitlist.promoted'        AND channel = 'sms';
  SELECT id INTO v_tpl_waitlist_promoted_email FROM notification_templates WHERE organization_id IS NULL AND key = 'waitlist.promoted'        AND channel = 'email';
  SELECT id INTO v_tpl_lead_created_sms        FROM notification_templates WHERE organization_id IS NULL AND key = 'lead.created'             AND channel = 'sms';
  SELECT id INTO v_tpl_lead_created_email      FROM notification_templates WHERE organization_id IS NULL AND key = 'lead.created'             AND channel = 'email';
  SELECT id INTO v_tpl_enrollment_created_sms  FROM notification_templates WHERE organization_id IS NULL AND key = 'enrollment_request.created' AND channel = 'sms';
  SELECT id INTO v_tpl_enrollment_created_email FROM notification_templates WHERE organization_id IS NULL AND key = 'enrollment_request.created' AND channel = 'email';

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
      ('booking_reminder_24h',      'sms',   v_tpl_reminder_24h_sms,        'student'),
      ('booking_reminder_24h',      'email', v_tpl_reminder_24h_email,      'student'),
      ('booking_reminder_same_day', 'sms',   v_tpl_reminder_same_day_sms,   'student'),
      ('booking_reminder_same_day', 'email', v_tpl_reminder_same_day_email, 'student'),
      ('booking_reminder_24h',      'sms',   v_tpl_reminder_2h_sms,         'student'),
      ('invoice_issued',            'email', v_tpl_invoice_issued_email,    'student'),
      ('invoice_overdue',           'email', v_tpl_invoice_overdue_email,   'student'),
      ('instructor_schedule_daily', 'sms',   v_tpl_instr_daily_sms,         'instructor'),
      ('instructor_schedule_daily', 'email', v_tpl_instr_daily_email,       'instructor'),
      ('waitlist_promoted',         'sms',   v_tpl_waitlist_promoted_sms,   'student'),
      ('waitlist_promoted',         'email', v_tpl_waitlist_promoted_email, 'student'),
      ('lead_created',              'sms',   v_tpl_lead_created_sms,        'admin'),
      ('lead_created',              'email', v_tpl_lead_created_email,      'admin'),
      ('enrollment_request_created', 'sms',   v_tpl_enrollment_created_sms,   'admin'),
      ('enrollment_request_created', 'email', v_tpl_enrollment_created_email, 'admin')
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

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM organizations LOOP
    PERFORM seed_org_communication(v_org_id);
  END LOOP;
END $$;
