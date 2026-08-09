-- ════════════════════════════════════════════════════════════════════════════
-- "New Lead Received" notification — closes the gap where a prospective
-- customer submitting the public booking/lead-capture form (public-booking
-- Edge Function → student_leads) never notified anyone at the school; the
-- lead sat silently until a staff member happened to check the Leads page.
--
-- Follows the platform's existing notification-rule pattern exactly
-- (see 20260622000003_phase_a_notification_templates.sql for the pattern
-- this mirrors), with one addition: notification_rules.recipient_type has
-- never had an 'admin' option (only 'student'/'instructor' — every existing
-- rule notifies a customer, not staff), so it's widened here the same way
-- notifications.recipient_type already was in 20260724000001.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Widen recipient_type to allow 'admin' everywhere a lead_created rule's
--       recipient_type value flows to (notification_rules is the rule
--       definition; outbound_messages is what the dispatch loop writes for
--       every non-push channel, copying rule.recipient_type verbatim) ──────

ALTER TABLE notification_rules DROP CONSTRAINT notification_rules_recipient_type_check;
ALTER TABLE notification_rules ADD CONSTRAINT notification_rules_recipient_type_check
  CHECK (recipient_type IN ('student', 'instructor', 'admin'));

ALTER TABLE outbound_messages DROP CONSTRAINT outbound_messages_recipient_type_check;
ALTER TABLE outbound_messages ADD CONSTRAINT outbound_messages_recipient_type_check
  CHECK (recipient_type IN ('student', 'instructor', 'manual', 'admin'));

-- ── 2. System templates for the new trigger ──────────────────────────────────

INSERT INTO notification_templates
  (organization_id, key, locale, channel, subject, body_text, variables, is_active)
VALUES

(NULL, 'lead.created', 'sv', 'sms',
 NULL,
 'Nytt lead: {förnamn} ({lead_email}{lead_phone}) vill gå {körkortskategori}. Källa: bokningsformuläret. / {trafikskola}',
 ARRAY['förnamn','lead_email','lead_phone','körkortskategori','trafikskola'],
 true),

(NULL, 'lead.created', 'sv', 'email',
 'Nytt lead — {förnamn}',
 E'Hej,\n\nEtt nytt lead har kommit in via bokningsformuläret på er publika sida:\n\nNamn: {förnamn}\nE-post: {lead_email}\nTelefon: {lead_phone}\nKörkortskategori: {körkortskategori}\n\nLoggain och hantera leadet under Leads i {trafikskola}.\n\nMed vänliga hälsningar\nTrafikcloud',
 ARRAY['förnamn','lead_email','lead_phone','körkortskategori','trafikskola'],
 true)

ON CONFLICT DO NOTHING;

-- ── 3. Emit lead.created on every new student_leads row ──────────────────────
-- Mirrors emit_booking_status_changed() (20260528000004) — domain-table
-- triggers own their own event emission on this platform, rather than the
-- inserting Edge Function calling insert_outbox_event itself.

CREATE OR REPLACE FUNCTION public.emit_lead_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.insert_outbox_event(
    'lead.created',
    'internal',
    jsonb_build_object(
      'lead_id',          NEW.id,
      'organization_id',  NEW.organization_id,
      'first_name',       NEW.first_name,
      'last_name',        NEW.last_name,
      'email',            NEW.email,
      'phone',            NEW.phone,
      'license_category', NEW.license_category,
      'source',           NEW.source
    ),
    NEW.organization_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_student_leads_emit_created
  AFTER INSERT ON public.student_leads
  FOR EACH ROW EXECUTE FUNCTION public.emit_lead_created();

-- ── 4. Extend seed_org_communication() with the new rule (disabled by default,
--       same as every other rule — the org owner consciously activates it) ───

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
      ('lead_created',              'email', v_tpl_lead_created_email,      'admin')
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

-- ── 5. Backfill: add the new rule to every existing org that already has ────
--       communication seeded (re-running seed_org_communication is
--       idempotent — ON CONFLICT DO NOTHING on existing rows/channels).

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM organizations LOOP
    PERFORM seed_org_communication(v_org_id);
  END LOOP;
END $$;
