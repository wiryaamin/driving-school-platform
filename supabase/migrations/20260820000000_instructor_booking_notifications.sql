-- =============================================================================
-- PORTALS V1.1 — Phase 2: Instructor booking-change notifications
--
-- Context: 'instructor' has been an allowed recipient_type on
-- notification_rules/outbound_messages/notifications since their original
-- migrations — only one trigger_event (instructor_schedule_daily) was ever
-- seeded for it. Instructors currently receive zero notification when a
-- booking on their own schedule is created, cancelled, or rescheduled by
-- someone else (student self-service, reception, or another workflow) — the
-- single biggest instructor-workload gap found in the Portal Readiness Audit.
--
-- This migration:
--   1. Seeds three new system notification_templates (org-scoped NULL),
--      instructor-facing copy — distinct from the existing student/guardian
--      templates, which read "Din körlektion..." (addressed to the person
--      whose own lesson it is). An instructor's notification is about their
--      STUDENT's lesson, so it needs its own {elev_fornamn} variable and its
--      own wording, not a verbatim reuse of the student template.
--   2. Extends seed_org_communication() with three new, disabled-by-default
--      rules per org: booking_confirmed, booking_cancelled, booking_rescheduled
--      x sms/email, recipient_type='instructor' — same trigger_event names
--      the student/guardian rules already use, same seed-function mechanism,
--      no new architecture.
--   3. Backfills every existing org, matching the established pattern.
--
-- No recipient_type CHECK-constraint widening needed anywhere — 'instructor'
-- has been present on every relevant table since it was created.
-- =============================================================================

-- ── 1. New instructor-facing system templates ────────────────────────────────

INSERT INTO notification_templates
  (organization_id, key, locale, channel, subject, body_text, variables, is_active)
VALUES

-- ── Booking confirmed (instructor) ───────────────────────────────────────────
(NULL, 'booking.confirmed.instructor', 'sv', 'sms',
 NULL,
 'Hej {förnamn}! Ny lektion inbokad: {elev_fornamn}, {datum} kl. {tid}. / {trafikskola}',
 ARRAY['förnamn','elev_fornamn','datum','tid','trafikskola'],
 true),

(NULL, 'booking.confirmed.instructor', 'sv', 'email',
 'Ny bokning — {datum} kl. {tid}',
 E'Hej {förnamn},\n\nEn ny lektion har bokats in i ditt schema:\n\nElev: {elev_fornamn}\nDatum: {datum}\nTid: {tid}\n\nLogga in i instruktörsappen för fler detaljer.\n\nMed vänliga hälsningar\n{trafikskola}',
 ARRAY['förnamn','elev_fornamn','datum','tid','trafikskola'],
 true),

-- ── Booking cancelled (instructor) ───────────────────────────────────────────
(NULL, 'booking.cancelled.instructor', 'sv', 'sms',
 NULL,
 'Hej {förnamn}! Lektionen med {elev_fornamn} {datum} kl. {tid} är avbokad. / {trafikskola}',
 ARRAY['förnamn','elev_fornamn','datum','tid','trafikskola'],
 true),

(NULL, 'booking.cancelled.instructor', 'sv', 'email',
 'Avbokad lektion — {datum} kl. {tid}',
 E'Hej {förnamn},\n\nLektionen med {elev_fornamn} {datum} kl. {tid} har avbokats. Ditt schema är uppdaterat.\n\nMed vänliga hälsningar\n{trafikskola}',
 ARRAY['förnamn','elev_fornamn','datum','tid','trafikskola'],
 true),

-- ── Booking rescheduled (instructor) ─────────────────────────────────────────
(NULL, 'booking.rescheduled.instructor', 'sv', 'sms',
 NULL,
 'Hej {förnamn}! Lektionen med {elev_fornamn} har flyttats till {datum} kl. {tid}. / {trafikskola}',
 ARRAY['förnamn','elev_fornamn','datum','tid','trafikskola'],
 true),

(NULL, 'booking.rescheduled.instructor', 'sv', 'email',
 'Ombokad lektion — ny tid {datum} kl. {tid}',
 E'Hej {förnamn},\n\nLektionen med {elev_fornamn} har flyttats till ny tid:\n\nDatum: {datum}\nTid: {tid}\n\nLogga in i instruktörsappen för fler detaljer.\n\nMed vänliga hälsningar\n{trafikskola}',
 ARRAY['förnamn','elev_fornamn','datum','tid','trafikskola'],
 true);

-- ── 2. Extend seed_org_communication() with the three new instructor rules ──
-- Full CREATE OR REPLACE, matching the exact shape of every prior extension
-- (...20260804000003 -> 20260807090000 -> 20260819010000 -> this one).

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

-- ── 3. Backfill: add the three new instructor rules to every existing org ───
--       that already has communication seeded (idempotent — ON CONFLICT DO
--       NOTHING on existing (organization_id, trigger_event, channel,
--       recipient_type) rows/channels, matching every prior backfill).

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM organizations LOOP
    PERFORM seed_org_communication(v_org_id);
  END LOOP;
END $$;
