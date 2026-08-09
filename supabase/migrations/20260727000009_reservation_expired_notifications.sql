-- ════════════════════════════════════════════════════════════════════════════
-- Reservation Expired — Notification Templates + Rules
--
-- event-worker's handleReservationExpired() has been a `// TODO Phase 4:
-- dispatch reservation.expired notification email` no-op since it was
-- written — a promoted waitlist student who doesn't confirm in time is
-- currently never told their reservation expired, and the vacated slot is
-- never re-offered to the next waitlist entry. This migration adds the
-- missing system templates + rules, following the exact same pattern as
-- 20260723000001's push-template completion; the event-worker code change
-- (re-promotion + enqueue) is deployed alongside this migration.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. System templates for the new event ─────────────────────────────────────

INSERT INTO notification_templates
  (organization_id, key, locale, channel, subject, body_text, variables, is_active)
VALUES

(NULL, 'reservation.expired', 'sv', 'sms',
 NULL,
 'Din reserverade plats {datum} kl. {tid} har gått ut eftersom bokningen inte bekräftades i tid. Kontakta oss om du fortfarande vill boka.',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true),

(NULL, 'reservation.expired', 'sv', 'email',
 'Din reserverade plats har gått ut',
 E'Hej {{recipient_name}},\n\nDin reserverade plats {{datum}} kl. {{tid}} har gått ut eftersom bokningen inte bekräftades i tid.\n\nKontakta oss om du fortfarande vill boka en tid.\n\nMed vänliga hälsningar\n{{school_name}}',
 ARRAY['recipient_name','datum','tid','school_name'],
 true),

(NULL, 'reservation.expired', 'sv', 'push',
 'Reservation utgången',
 'Din reserverade plats {datum} kl. {tid} har gått ut. Kontakta oss om du fortfarande vill boka.',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true)

ON CONFLICT DO NOTHING;

-- ── 2. Extend seed_org_communication() to wire reservation_expired rules ──────
-- CREATE OR REPLACE per this project's append-only migration convention
-- (never edit a historical migration file) — same function as
-- 20260622000003/20260723000001, extended with one more event.

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
  v_tpl_booking_confirmed_push       uuid;
  v_tpl_booking_cancelled_sms        uuid;
  v_tpl_booking_cancelled_email      uuid;
  v_tpl_booking_cancelled_push       uuid;
  v_tpl_reminder_24h_sms             uuid;
  v_tpl_reminder_24h_email           uuid;
  v_tpl_reminder_24h_push            uuid;
  v_tpl_reminder_same_day_sms        uuid;
  v_tpl_reminder_same_day_email      uuid;
  v_tpl_reminder_same_day_push       uuid;
  v_tpl_reminder_2h_sms              uuid;
  v_tpl_reminder_2h_push             uuid;
  v_tpl_invoice_issued_email         uuid;
  v_tpl_invoice_overdue_email        uuid;
  v_tpl_instr_daily_sms              uuid;
  v_tpl_instr_daily_email            uuid;
  v_tpl_instr_daily_push             uuid;
  v_tpl_waitlist_promoted_sms        uuid;
  v_tpl_waitlist_promoted_email      uuid;
  v_tpl_waitlist_promoted_push       uuid;
  v_tpl_reservation_expired_sms      uuid;
  v_tpl_reservation_expired_email    uuid;
  v_tpl_reservation_expired_push     uuid;
BEGIN

  -- ── Resolve system template IDs ──────────────────────────────────────────
  SELECT id INTO v_tpl_booking_confirmed_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.confirmed'        AND channel = 'sms';
  SELECT id INTO v_tpl_booking_confirmed_email FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.confirmed'        AND channel = 'email';
  SELECT id INTO v_tpl_booking_confirmed_push  FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.confirmed'        AND channel = 'push';
  SELECT id INTO v_tpl_booking_cancelled_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.cancelled'        AND channel = 'sms';
  SELECT id INTO v_tpl_booking_cancelled_email FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.cancelled'        AND channel = 'email';
  SELECT id INTO v_tpl_booking_cancelled_push  FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.cancelled'        AND channel = 'push';
  SELECT id INTO v_tpl_reminder_24h_sms        FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.24h'    AND channel = 'sms';
  SELECT id INTO v_tpl_reminder_24h_email      FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.24h'    AND channel = 'email';
  SELECT id INTO v_tpl_reminder_24h_push       FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.24h'    AND channel = 'push';
  SELECT id INTO v_tpl_reminder_same_day_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.same_day' AND channel = 'sms';
  SELECT id INTO v_tpl_reminder_same_day_email FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.same_day' AND channel = 'email';
  SELECT id INTO v_tpl_reminder_same_day_push  FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.same_day' AND channel = 'push';
  SELECT id INTO v_tpl_reminder_2h_sms         FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.2h'     AND channel = 'sms';
  SELECT id INTO v_tpl_reminder_2h_push        FROM notification_templates WHERE organization_id IS NULL AND key = 'booking.reminder.2h'     AND channel = 'push';
  SELECT id INTO v_tpl_invoice_issued_email    FROM notification_templates WHERE organization_id IS NULL AND key = 'invoice.issued'           AND channel = 'email';
  SELECT id INTO v_tpl_invoice_overdue_email   FROM notification_templates WHERE organization_id IS NULL AND key = 'invoice.overdue'          AND channel = 'email';
  SELECT id INTO v_tpl_instr_daily_sms         FROM notification_templates WHERE organization_id IS NULL AND key = 'instructor.schedule.daily' AND channel = 'sms';
  SELECT id INTO v_tpl_instr_daily_email       FROM notification_templates WHERE organization_id IS NULL AND key = 'instructor.schedule.daily' AND channel = 'email';
  SELECT id INTO v_tpl_instr_daily_push        FROM notification_templates WHERE organization_id IS NULL AND key = 'instructor.schedule.daily' AND channel = 'push';
  SELECT id INTO v_tpl_waitlist_promoted_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'waitlist.promoted'        AND channel = 'sms';
  SELECT id INTO v_tpl_waitlist_promoted_email FROM notification_templates WHERE organization_id IS NULL AND key = 'waitlist.promoted'        AND channel = 'email';
  SELECT id INTO v_tpl_waitlist_promoted_push  FROM notification_templates WHERE organization_id IS NULL AND key = 'waitlist.promoted'        AND channel = 'push';
  SELECT id INTO v_tpl_reservation_expired_sms   FROM notification_templates WHERE organization_id IS NULL AND key = 'reservation.expired'    AND channel = 'sms';
  SELECT id INTO v_tpl_reservation_expired_email FROM notification_templates WHERE organization_id IS NULL AND key = 'reservation.expired'    AND channel = 'email';
  SELECT id INTO v_tpl_reservation_expired_push  FROM notification_templates WHERE organization_id IS NULL AND key = 'reservation.expired'    AND channel = 'push';

  -- ── a) Default channel_configs (all disabled — admin must configure provider) ──

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

  -- ── b) Default notification_rules (all disabled, pointing to system templates) ──

  WITH inserted AS (
    INSERT INTO notification_rules
      (organization_id, trigger_event, channel, template_id, recipient_type, enabled)
    SELECT p_org_id, t.trigger_event, t.channel, t.template_id, t.recipient_type, false
    FROM (VALUES
      ('booking_confirmed',         'sms',   v_tpl_booking_confirmed_sms,   'student'),
      ('booking_confirmed',         'email', v_tpl_booking_confirmed_email, 'student'),
      ('booking_confirmed',         'push',  v_tpl_booking_confirmed_push,  'student'),
      ('booking_cancelled',         'sms',   v_tpl_booking_cancelled_sms,   'student'),
      ('booking_cancelled',         'email', v_tpl_booking_cancelled_email, 'student'),
      ('booking_cancelled',         'push',  v_tpl_booking_cancelled_push,  'student'),
      ('booking_reminder_24h',      'sms',   v_tpl_reminder_24h_sms,        'student'),
      ('booking_reminder_24h',      'email', v_tpl_reminder_24h_email,      'student'),
      ('booking_reminder_24h',      'push',  v_tpl_reminder_24h_push,       'student'),
      ('booking_reminder_same_day', 'sms',   v_tpl_reminder_same_day_sms,   'student'),
      ('booking_reminder_same_day', 'email', v_tpl_reminder_same_day_email, 'student'),
      ('booking_reminder_same_day', 'push',  v_tpl_reminder_same_day_push,  'student'),
      ('booking_reminder_24h',      'sms',   v_tpl_reminder_2h_sms,         'student'),
      ('booking_reminder_24h',      'push',  v_tpl_reminder_2h_push,        'student'),
      ('invoice_issued',            'email', v_tpl_invoice_issued_email,    'student'),
      ('invoice_overdue',           'email', v_tpl_invoice_overdue_email,   'student'),
      ('instructor_schedule_daily', 'sms',   v_tpl_instr_daily_sms,         'instructor'),
      ('instructor_schedule_daily', 'email', v_tpl_instr_daily_email,       'instructor'),
      ('instructor_schedule_daily', 'push',  v_tpl_instr_daily_push,        'instructor'),
      ('waitlist_promoted',         'sms',   v_tpl_waitlist_promoted_sms,   'student'),
      ('waitlist_promoted',         'email', v_tpl_waitlist_promoted_email, 'student'),
      ('waitlist_promoted',         'push',  v_tpl_waitlist_promoted_push,  'student'),
      ('reservation_expired',       'sms',   v_tpl_reservation_expired_sms,   'student'),
      ('reservation_expired',       'email', v_tpl_reservation_expired_email, 'student'),
      ('reservation_expired',       'push',  v_tpl_reservation_expired_push,  'student')
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

-- ── 3. Backfill reservation_expired notification_rules for existing orgs ──────
-- Idempotent (ON CONFLICT DO NOTHING on both inserts) — safe to re-run for
-- every existing org, not just new ones.

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM organizations
  LOOP
    PERFORM seed_org_communication(v_org_id);
  END LOOP;
END $$;
