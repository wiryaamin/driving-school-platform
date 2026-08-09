-- =============================================================================
-- Onboarding automation gaps — closing three confirmed inconsistencies found
-- during a pilot-readiness review of tenant provisioning:
--
--   1. Chart of accounts auto-seeds via a trigger on organizations; the
--      equally-standard Swedish dunning schedule (Inkassolagen 3-stage flow)
--      only ever seeded via a manual button on SwedishSettingsPage
--      ("Skapa inkassoflöde" -> POST /swedish-settings/seed-dunning). Every
--      tenant that never clicked it has zero collections automation.
--
--   2. automation_rules (reservation-expiry timeout, booking reminders at
--      24h/2h/1h, auto-confirm, waitlist-promotion deadline) has NO seed
--      mechanism at all — every org starts with all 6 rows entirely absent,
--      not merely disabled, unlike channel_configs/notification_rules which
--      at least seed disabled skeleton rows.
--
--   3. Five of the eighteen trigger events surfaced in NotificationRulesPage
--      (booking_rescheduled, invoice_due, permit_expiring, exam_scheduled)
--      have no system-default notification_templates row at all, and
--      student_created has none under that exact key even though an
--      equivalent (welcome.new_student) already exists — a tenant enabling
--      any of these hits "Inga aktiva mallar" and must hand-author Swedish
--      copy before the automation can run.
--
-- Fix: extend the existing organizations_seed_* trigger pattern (same
-- pattern as organizations_seed_chart_of_accounts /
-- organizations_seed_communication) so all three auto-seed at tenant
-- creation, then backfill every existing org. Both underlying seed
-- functions are already idempotent (ON CONFLICT DO NOTHING / existence
-- check), so re-running them for already-seeded orgs is a safe no-op.
-- =============================================================================

-- ─── 1. Auto-seed dunning schedule on org creation ───────────────────────────

CREATE OR REPLACE FUNCTION public.seed_new_org_dunning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_swedish_dunning_schedule(NEW.id, NULL);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.seed_new_org_dunning() IS
  'Trigger wrapper: seeds a newly-created organization''s default Swedish '
  '3-stage dunning schedule. Idempotent (seed_swedish_dunning_schedule '
  'checks for an existing is_default schedule before inserting), safe to re-run.';

DROP TRIGGER IF EXISTS organizations_seed_dunning ON public.organizations;
CREATE TRIGGER organizations_seed_dunning
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_new_org_dunning();

-- ─── 2. Auto-seed automation_rules on org creation ───────────────────────────
--
-- Defaults chosen conservatively: rules that dispatch a message to a student
-- (reminders, waitlist promotion) seed disabled, matching the same
-- "scaffold it, let the tenant opt in" convention as notification_rules —
-- a tenant should never be surprised by an SMS going out before they've
-- reviewed anything. reservation_expiry is pure internal cleanup (frees a
-- slot nobody confirmed in time) with no customer-facing side effect of its
-- own, so it seeds enabled. auto_confirm is a genuine operating-policy
-- choice (some schools want to review every booking before it's final) and
-- seeds disabled.

CREATE OR REPLACE FUNCTION public.seed_org_automation_rules(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_added integer;
BEGIN
  WITH inserted AS (
    INSERT INTO public.automation_rules (organization_id, rule_type, enabled, config)
    VALUES
      (p_org_id, 'reservation_expiry',  true,  jsonb_build_object('timeout_minutes', 30)),
      (p_org_id, 'reminder_24h',        false, jsonb_build_object('offset_minutes', 1440)),
      (p_org_id, 'reminder_2h',         false, jsonb_build_object('offset_minutes', 120)),
      (p_org_id, 'reminder_1h',         false, jsonb_build_object('offset_minutes', 60)),
      (p_org_id, 'auto_confirm',        false, '{}'::jsonb),
      (p_org_id, 'waitlist_promotion',  false, jsonb_build_object('reservation_deadline_minutes', 60))
    ON CONFLICT (organization_id, rule_type) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_added FROM inserted;
  RETURN v_added;
END;
$$;

COMMENT ON FUNCTION public.seed_org_automation_rules(uuid) IS
  'Seeds all 6 automation_rule_type rows for an org with the same defaults '
  'AutomatiseringsReglerPage.tsx already uses client-side. Idempotent via '
  'ON CONFLICT DO NOTHING on the (organization_id, rule_type) unique constraint.';

GRANT EXECUTE ON FUNCTION public.seed_org_automation_rules(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.seed_new_org_automation_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_org_automation_rules(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_seed_automation_rules ON public.organizations;
CREATE TRIGGER organizations_seed_automation_rules
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_new_org_automation_rules();

-- ─── 3. Four missing system-default notification templates ──────────────────
-- Single-brace {var} syntax, matching the active applyTemplateVars engine
-- (supabase/functions/_shared/template-utils.ts and
-- apps/web/.../templatePreview.ts both use /\{([^}]+)\}/g) — not the
-- {{double-brace}} syntax some older phase3d rows still carry, which that
-- engine does not substitute.

INSERT INTO public.notification_templates
  (organization_id, key, locale, channel, subject, body_text, variables, is_active)
VALUES
  (NULL, 'booking.rescheduled', 'sv', 'email',
   'Din körlektion har ombokats',
   E'Hej {förnamn},\n\nDin körlektion har flyttats till en ny tid: {datum} kl. {tid}.\n\nVälkommen!\n{trafikskola}',
   ARRAY['förnamn','datum','tid','trafikskola'], true),
  (NULL, 'booking.rescheduled', 'sv', 'sms', NULL,
   'Din körlektion har ombokats till {datum} kl {tid}. Välkommen! {trafikskola}',
   ARRAY['datum','tid','trafikskola'], true),
  (NULL, 'booking.rescheduled', 'sv', 'push', NULL,
   'Din körlektion har flyttats till {datum} kl. {tid}.',
   ARRAY['datum','tid'], true),

  (NULL, 'invoice.due', 'sv', 'email',
   'Din faktura förfaller snart',
   E'Hej {förnamn},\n\nDin faktura {fakturanummer} på {belopp} kr förfaller {förfallodatum}.\n\nVänligen betala i tid för att undvika påminnelseavgift.\n\n{trafikskola}',
   ARRAY['förnamn','fakturanummer','belopp','förfallodatum','trafikskola'], true),

  (NULL, 'permit.expiring', 'sv', 'email',
   'Ditt tillstånd går ut snart',
   E'Hej {förnamn},\n\nDitt körkortstillstånd går ut {utgångsdatum}. Kontakta oss om du behöver hjälp med förnyelse.\n\n{trafikskola}',
   ARRAY['förnamn','utgångsdatum','trafikskola'], true),
  (NULL, 'permit.expiring', 'sv', 'sms', NULL,
   'Hej {förnamn}, ditt tillstånd går ut {utgångsdatum}. Kontakta oss vid frågor. {trafikskola}',
   ARRAY['förnamn','utgångsdatum','trafikskola'], true),

  (NULL, 'exam.scheduled', 'sv', 'email',
   'Ditt prov är bokat',
   E'Hej {förnamn},\n\nDitt prov är bokat till {datum} kl. {tid}.\n\nLycka till!\n{trafikskola}',
   ARRAY['förnamn','datum','tid','trafikskola'], true),
  (NULL, 'exam.scheduled', 'sv', 'sms', NULL,
   'Ditt prov är bokat {datum} kl {tid}. Lycka till! {trafikskola}',
   ARRAY['datum','tid','trafikskola'], true)
ON CONFLICT DO NOTHING;

-- ─── 4. Extend seed_org_communication() to wire the new/reused rules ────────
-- Same shape as every prior extension of this function (each earlier
-- migration CREATE OR REPLACEs it to add its own new trigger_event rows) —
-- this is the (n+1)th such extension, not a new mechanism. student_created
-- reuses the existing welcome.new_student template rather than new content,
-- since that template's own purpose already is "a new student was created."

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
      ('booking_rescheduled',       'sms',   v_tpl_booking_rescheduled_sms,   'student'),
      ('booking_rescheduled',       'email', v_tpl_booking_rescheduled_email, 'student'),
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

-- ─── 5. Backfill every existing org for all three seeds ─────────────────────

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  FOR v_org_id IN SELECT id FROM organizations LOOP
    PERFORM seed_swedish_dunning_schedule(v_org_id, NULL);
    PERFORM seed_org_automation_rules(v_org_id);
    PERFORM seed_org_communication(v_org_id);
  END LOOP;
END $$;
