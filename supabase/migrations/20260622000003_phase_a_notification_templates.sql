-- ════════════════════════════════════════════════════════════════════════════
-- Phase A: SMS & Email Reminders — System Templates + Org Bootstrap
--
-- 1. Seeds system-level notification_templates (organization_id IS NULL).
--    These are visible to all orgs and used as defaults.
--    Key format: <domain>.<event>.<channel>  (locale = 'sv')
--
-- 2. Creates seed_org_communication(p_org_id) — call once per new org to:
--      a) Insert disabled channel_configs rows (all 5 channels)
--      b) Insert notification_rules pointing to the system templates
--         (rules start disabled so admins consciously activate them)
--
-- Template variables used (via applyTemplateVars in _shared/template-utils.ts):
--   {förnamn}         — recipient first name
--   {datum}           — lesson date (weekday + date, sv-SE)
--   {tid}             — lesson time (HH:MM)
--   {trafikskola}     — organization display name (optional, falls back to 'Trafikskolan')
--   {fakturanr}       — invoice number
--   {belopp}          — invoice amount
--   {förfallodatum}   — invoice due date
--   {antal_lektioner} — number of lessons (instructor digest)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. System notification templates ─────────────────────────────────────────

INSERT INTO notification_templates
  (organization_id, key, locale, channel, subject, body_text, variables, is_active)
VALUES

-- ── Booking confirmed ─────────────────────────────────────────────────────────
(NULL, 'booking.confirmed', 'sv', 'sms',
 NULL,
 'Hej {förnamn}! Din körlektion är bokad {datum} kl. {tid}. Välkommen! / {trafikskola}',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true),

(NULL, 'booking.confirmed', 'sv', 'email',
 'Bokningsbekräftelse — {datum} kl. {tid}',
 E'Hej {förnamn},\n\nDin körlektion är bekräftad:\n\nDatum: {datum}\nTid: {tid}\n\nVi ses! Om du behöver avboka, vänligen gör det minst 24 timmar i förväg.\n\nMed vänliga hälsningar\n{trafikskola}',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true),

-- ── Booking cancelled ─────────────────────────────────────────────────────────
(NULL, 'booking.cancelled', 'sv', 'sms',
 NULL,
 'Hej {förnamn}! Din körlektion {datum} kl. {tid} är avbokad. Kontakta oss för ombokning. / {trafikskola}',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true),

(NULL, 'booking.cancelled', 'sv', 'email',
 'Avbokning bekräftad — {datum} kl. {tid}',
 E'Hej {förnamn},\n\nDin körlektion {datum} kl. {tid} har avbokats.\n\nVill du boka en ny tid? Logga in i elevportalen eller kontakta oss.\n\nMed vänliga hälsningar\n{trafikskola}',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true),

-- ── Booking reminder 24h ──────────────────────────────────────────────────────
(NULL, 'booking.reminder.24h', 'sv', 'sms',
 NULL,
 'Påminnelse: Du har körlektion imorgon {datum} kl. {tid}. Vi ses! / {trafikskola}',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true),

(NULL, 'booking.reminder.24h', 'sv', 'email',
 'Påminnelse: Körlektion imorgon kl. {tid}',
 E'Hej {förnamn},\n\nEn påminnelse om din körlektion imorgon:\n\nDatum: {datum}\nTid: {tid}\n\nKom ihåg att vara i tid. Om du behöver avboka kontaktar du oss snarast.\n\nMed vänliga hälsningar\n{trafikskola}',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true),

-- ── Booking reminder same day ─────────────────────────────────────────────────
(NULL, 'booking.reminder.same_day', 'sv', 'sms',
 NULL,
 'Påminnelse: Körlektion idag kl. {tid}. Vi ses! / {trafikskola}',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true),

(NULL, 'booking.reminder.same_day', 'sv', 'email',
 'Påminnelse: Körlektion idag kl. {tid}',
 E'Hej {förnamn},\n\nDu har körlektion idag kl. {tid}.\n\nVi ses!\n\nMed vänliga hälsningar\n{trafikskola}',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true),

-- ── Booking reminder 2h ───────────────────────────────────────────────────────
(NULL, 'booking.reminder.2h', 'sv', 'sms',
 NULL,
 'Påminnelse: Körlektion om 2 timmar, kl. {tid}. Vi ses! / {trafikskola}',
 ARRAY['förnamn','tid','trafikskola'],
 true),

-- ── Invoice issued ────────────────────────────────────────────────────────────
(NULL, 'invoice.issued', 'sv', 'email',
 'Ny faktura #{fakturanr} — {belopp} kr',
 E'Hej {förnamn},\n\nEn ny faktura har skapats för ditt konto:\n\nFakturanummer: #{fakturanr}\nBelopp: {belopp} kr\nFörfallodatum: {förfallodatum}\n\nBetala gärna i tid för att undvika påminnelseavgifter.\n\nMed vänliga hälsningar\n{trafikskola}',
 ARRAY['förnamn','fakturanr','belopp','förfallodatum','trafikskola'],
 true),

-- ── Invoice overdue ───────────────────────────────────────────────────────────
(NULL, 'invoice.overdue', 'sv', 'email',
 'Betalningspåminnelse — faktura #{fakturanr} förfallen',
 E'Hej {förnamn},\n\nVi saknar betalning för faktura #{fakturanr} på {belopp} kr som förföll {förfallodatum}.\n\nVänligen betala snarast för att undvika ytterligare avgifter.\n\nHar du frågor? Kontakta oss.\n\nMed vänliga hälsningar\n{trafikskola}',
 ARRAY['förnamn','fakturanr','belopp','förfallodatum','trafikskola'],
 true),

-- ── Instructor schedule daily ─────────────────────────────────────────────────
(NULL, 'instructor.schedule.daily', 'sv', 'sms',
 NULL,
 'God morgon {förnamn}! Du har {antal_lektioner} lektion(er) idag, {datum}. / {trafikskola}',
 ARRAY['förnamn','datum','antal_lektioner','trafikskola'],
 true),

(NULL, 'instructor.schedule.daily', 'sv', 'email',
 'Ditt schema idag — {datum}',
 E'God morgon {förnamn},\n\nDu har {antal_lektioner} lektion(er) inbokad(e) idag, {datum}.\n\nLogga in i instruktörsappen för att se ditt fullständiga schema.\n\nMed vänliga hälsningar\n{trafikskola}',
 ARRAY['förnamn','datum','antal_lektioner','trafikskola'],
 true),

-- ── Waitlist promoted ─────────────────────────────────────────────────────────
(NULL, 'waitlist.promoted', 'sv', 'sms',
 NULL,
 'Hej {förnamn}! En plats har öppnats {datum} kl. {tid}. Logga in och boka nu — platsen är reserverad kortvarigt! / {trafikskola}',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true),

(NULL, 'waitlist.promoted', 'sv', 'email',
 'En plats har öppnats — {datum} kl. {tid}',
 E'Hej {förnamn},\n\nEn ledig körplats har öppnats på din väntelista:\n\nDatum: {datum}\nTid: {tid}\n\nLogga in i elevportalen och boka platsen snarast — reservationstiden är begränsad.\n\nMed vänliga hälsningar\n{trafikskola}',
 ARRAY['förnamn','datum','tid','trafikskola'],
 true)

ON CONFLICT DO NOTHING;

-- ── 2. seed_org_communication(p_org_id) ──────────────────────────────────────
-- Call once per new org (e.g. from bootstrap SQL, org creation trigger, or
-- POST /communications/seed-defaults).
-- Idempotent via ON CONFLICT DO NOTHING.

CREATE OR REPLACE FUNCTION seed_org_communication(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channels_added  int := 0;
  v_rules_added     int := 0;

  -- System template UUIDs looked up by key+channel
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
BEGIN

  -- ── Resolve system template IDs ──────────────────────────────────────────
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
      ('waitlist_promoted',         'email', v_tpl_waitlist_promoted_email, 'student')
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

-- ── 3. Seed existing orgs ─────────────────────────────────────────────────────
-- Run seed_org_communication for each org that has no channel_configs yet.

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN
    SELECT id FROM organizations
    WHERE id NOT IN (SELECT DISTINCT organization_id FROM channel_configs)
  LOOP
    PERFORM seed_org_communication(v_org_id);
  END LOOP;
END $$;
