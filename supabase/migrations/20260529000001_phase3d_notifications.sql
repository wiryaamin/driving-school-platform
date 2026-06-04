-- ════════════════════════════════════════════════════════════════════════════
-- Phase 3D: Automation + Notification Orchestration
--
-- Tables:
--   notification_templates   — provider-agnostic message templates (multilingual)
--   notifications            — notification audit log with idempotency + retry
--   notification_preferences — per-profile opt-in/out per channel + type
--   lesson_reminders         — scheduled pre-lesson reminders with claim pattern
--   waitlist_entries         — per-slot student waitlist with priority ordering
--   automation_rules         — per-org configurable automation configuration
--
-- DB Functions:
--   schedule_lesson_reminders(booking_id)  — create reminder rows from org rules
--   cancel_lesson_reminders(booking_id)    — cancel scheduled reminders on cancel
--   drain_due_reminders(limit)             — atomic claim of due reminders
--   promote_waitlist_next(slot_id)         — promote top waitlist entry + publish event
--   expire_stale_reservations(timeout_min) — expire stale draft/reserved bookings
--
-- Events published:
--   Waitlist.Promoted, Reservation.Expired (via insert_outbox_event)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ────────────────────────────────────────────────────

CREATE TYPE notification_status AS ENUM (
  'pending', 'sending', 'sent', 'failed', 'cancelled'
);

CREATE TYPE reminder_status AS ENUM (
  'scheduled', 'sending', 'sent', 'failed', 'cancelled', 'skipped'
);

CREATE TYPE waitlist_status AS ENUM (
  'waiting', 'promoted', 'expired', 'cancelled'
);

CREATE TYPE automation_rule_type AS ENUM (
  'reservation_expiry',
  'reminder_24h',
  'reminder_2h',
  'reminder_1h',
  'auto_confirm',
  'waitlist_promotion'
);

-- ── Section 2: notification_templates ───────────────────────────────────────
-- organization_id IS NULL = system-wide template (visible to all orgs).
-- Org-specific templates override system defaults for the same key+locale+channel.

CREATE TABLE notification_templates (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid        REFERENCES organizations(id) ON DELETE CASCADE,
  key              text        NOT NULL,
  locale           text        NOT NULL DEFAULT 'sv',
  channel          text        NOT NULL CHECK (channel IN ('email','sms','push','internal')),
  subject          text,
  body_html        text,
  body_text        text        NOT NULL,
  variables        text[]      NOT NULL DEFAULT '{}',
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX notification_templates_system_unique
  ON notification_templates (key, locale, channel)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX notification_templates_org_unique
  ON notification_templates (organization_id, key, locale, channel)
  WHERE organization_id IS NOT NULL;

CREATE INDEX notification_templates_key_idx ON notification_templates (key);

-- ── Section 3: notifications ─────────────────────────────────────────────────
-- Notification audit log. One row per dispatch attempt.
-- idempotency_key prevents double-sending (set by caller, unique constraint).
-- scheduled_for = NULL means dispatch immediately; non-NULL = delayed.

CREATE TABLE notifications (
  id                uuid               NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid               NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_id      uuid               NOT NULL,
  recipient_type    text               NOT NULL CHECK (recipient_type IN ('student','instructor','admin')),
  channel           text               NOT NULL CHECK (channel IN ('email','sms','push','internal')),
  template_key      text               NOT NULL,
  locale            text               NOT NULL DEFAULT 'sv',
  subject           text,
  body              text,
  metadata          jsonb              NOT NULL DEFAULT '{}',
  status            notification_status NOT NULL DEFAULT 'pending',
  status_changed_at timestamptz,
  sent_at           timestamptz,
  failed_at         timestamptz,
  failure_reason    text,
  retry_count       int                NOT NULL DEFAULT 0,
  max_retries       int                NOT NULL DEFAULT 3,
  idempotency_key   text               UNIQUE,
  scheduled_for     timestamptz,
  reference_type    text,
  reference_id      uuid,
  created_at        timestamptz        NOT NULL DEFAULT now(),
  updated_at        timestamptz        NOT NULL DEFAULT now()
);

CREATE INDEX notifications_org_status_idx    ON notifications (organization_id, status);
CREATE INDEX notifications_recipient_idx     ON notifications (organization_id, recipient_id);
CREATE INDEX notifications_scheduled_idx     ON notifications (scheduled_for) WHERE status = 'pending';

-- ── Section 4: notification_preferences ──────────────────────────────────────

CREATE TABLE notification_preferences (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id        uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel           text        NOT NULL CHECK (channel IN ('email','sms','push','internal')),
  notification_type text        NOT NULL,
  enabled           boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, channel, notification_type)
);

CREATE INDEX notification_preferences_profile_idx ON notification_preferences (profile_id);

-- ── Section 5: lesson_reminders ───────────────────────────────────────────────
-- Scheduled reminder rows created by schedule_lesson_reminders().
-- Claimed atomically by drain_due_reminders() (sets status = 'sending').
-- idempotency_key prevents duplicate rows for the same booking+recipient+type.

CREATE TABLE lesson_reminders (
  id               uuid           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  booking_id       uuid           NOT NULL REFERENCES lesson_bookings(id) ON DELETE CASCADE,
  recipient_id     uuid           NOT NULL,
  recipient_type   text           NOT NULL DEFAULT 'student' CHECK (recipient_type IN ('student','instructor')),
  reminder_type    text           NOT NULL,
  offset_minutes   int            NOT NULL,
  scheduled_for    timestamptz    NOT NULL,
  status           reminder_status NOT NULL DEFAULT 'scheduled',
  notification_id  uuid           REFERENCES notifications(id),
  idempotency_key  text           NOT NULL UNIQUE,
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX lesson_reminders_booking_idx ON lesson_reminders (booking_id);
CREATE INDEX lesson_reminders_due_idx
  ON lesson_reminders (scheduled_for)
  WHERE status = 'scheduled';

-- ── Section 6: waitlist_entries ───────────────────────────────────────────────
-- Per-slot student waitlist. Unique active entry per student per slot.
-- priority: lower value = higher priority (0 = highest).

CREATE TABLE waitlist_entries (
  id                   uuid           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slot_id              uuid           NOT NULL REFERENCES lesson_slots(id) ON DELETE CASCADE,
  student_id           uuid           NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  priority             int            NOT NULL DEFAULT 0,
  status               waitlist_status NOT NULL DEFAULT 'waiting',
  status_changed_at    timestamptz,
  expires_at           timestamptz,
  promoted_booking_id  uuid           REFERENCES lesson_bookings(id),
  notified_at          timestamptz,
  reservation_deadline timestamptz,
  notes                text,
  created_at           timestamptz    NOT NULL DEFAULT now(),
  updated_at           timestamptz    NOT NULL DEFAULT now()
);

-- One active entry per student per slot
CREATE UNIQUE INDEX waitlist_entries_active_unique
  ON waitlist_entries (slot_id, student_id)
  WHERE status = 'waiting';

CREATE INDEX waitlist_entries_slot_idx
  ON waitlist_entries (slot_id, priority, created_at)
  WHERE status = 'waiting';

CREATE INDEX waitlist_entries_student_idx
  ON waitlist_entries (student_id)
  WHERE status = 'waiting';

-- ── Section 7: automation_rules ───────────────────────────────────────────────
-- One row per rule_type per organization. config stores rule-specific parameters.
-- Examples:
--   reservation_expiry: {"timeout_minutes": 30}
--   reminder_24h:       {"offset_minutes": 1440, "channels": ["email"]}
--   waitlist_promotion: {"reservation_deadline_minutes": 60}

CREATE TABLE automation_rules (
  id               uuid               NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid               NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_type        automation_rule_type NOT NULL,
  enabled          boolean            NOT NULL DEFAULT true,
  config           jsonb              NOT NULL DEFAULT '{}',
  created_at       timestamptz        NOT NULL DEFAULT now(),
  updated_at       timestamptz        NOT NULL DEFAULT now(),
  UNIQUE (organization_id, rule_type)
);

-- ── Section 8: Updated-at triggers ───────────────────────────────────────────

CREATE TRIGGER set_notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_lesson_reminders_updated_at
  BEFORE UPDATE ON lesson_reminders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_waitlist_entries_updated_at
  BEFORE UPDATE ON waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_automation_rules_updated_at
  BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Section 9: Row Level Security ────────────────────────────────────────────

ALTER TABLE notification_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_reminders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules         ENABLE ROW LEVEL SECURITY;

-- notification_templates: system templates (org IS NULL) visible to all;
--                         org templates scoped to the org
CREATE POLICY "notification_templates_select"
  ON notification_templates FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id = auth_organization_id()
  );

CREATE POLICY "notification_templates_insert"
  ON notification_templates FOR INSERT
  WITH CHECK (
    organization_id = auth_organization_id()
    AND has_permission('notifications:template:create')
  );

CREATE POLICY "notification_templates_update"
  ON notification_templates FOR UPDATE
  USING (
    organization_id = auth_organization_id()
    AND has_permission('notifications:template:update')
  );

-- notifications: org-scoped, requires notifications:read
CREATE POLICY "notifications_select"
  ON notifications FOR SELECT
  USING (
    organization_id = auth_organization_id()
    AND has_permission('notifications:read')
  );

CREATE POLICY "notifications_insert"
  ON notifications FOR INSERT
  WITH CHECK (organization_id = auth_organization_id());

CREATE POLICY "notifications_update"
  ON notifications FOR UPDATE
  USING (organization_id = auth_organization_id());

-- notification_preferences: own profile or admin
CREATE POLICY "notification_preferences_select"
  ON notification_preferences FOR SELECT
  USING (
    organization_id = auth_organization_id()
    AND (
      profile_id = auth.uid()
      OR has_permission('notifications:preferences:manage')
    )
  );

CREATE POLICY "notification_preferences_insert"
  ON notification_preferences FOR INSERT
  WITH CHECK (
    organization_id = auth_organization_id()
    AND (
      profile_id = auth.uid()
      OR has_permission('notifications:preferences:manage')
    )
  );

CREATE POLICY "notification_preferences_update"
  ON notification_preferences FOR UPDATE
  USING (
    organization_id = auth_organization_id()
    AND (
      profile_id = auth.uid()
      OR has_permission('notifications:preferences:manage')
    )
  );

-- lesson_reminders: scheduling read permission
CREATE POLICY "lesson_reminders_select"
  ON lesson_reminders FOR SELECT
  USING (
    organization_id = auth_organization_id()
    AND has_permission('scheduling:booking:read')
  );

CREATE POLICY "lesson_reminders_insert"
  ON lesson_reminders FOR INSERT
  WITH CHECK (organization_id = auth_organization_id());

CREATE POLICY "lesson_reminders_update"
  ON lesson_reminders FOR UPDATE
  USING (organization_id = auth_organization_id());

-- waitlist_entries
CREATE POLICY "waitlist_entries_select"
  ON waitlist_entries FOR SELECT
  USING (
    organization_id = auth_organization_id()
    AND has_permission('scheduling:booking:read')
  );

CREATE POLICY "waitlist_entries_insert"
  ON waitlist_entries FOR INSERT
  WITH CHECK (
    organization_id = auth_organization_id()
    AND has_permission('scheduling:booking:create')
  );

CREATE POLICY "waitlist_entries_update"
  ON waitlist_entries FOR UPDATE
  USING (
    organization_id = auth_organization_id()
    AND has_permission('scheduling:booking:update')
  );

-- automation_rules
CREATE POLICY "automation_rules_select"
  ON automation_rules FOR SELECT
  USING (organization_id = auth_organization_id());

CREATE POLICY "automation_rules_insert"
  ON automation_rules FOR INSERT
  WITH CHECK (
    organization_id = auth_organization_id()
    AND has_permission('org:settings:update')
  );

CREATE POLICY "automation_rules_update"
  ON automation_rules FOR UPDATE
  USING (
    organization_id = auth_organization_id()
    AND has_permission('org:settings:update')
  );

-- ── Section 10: Table grants ──────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON notification_templates   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON notifications            TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON notification_preferences TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON lesson_reminders         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON waitlist_entries         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON automation_rules         TO authenticated, service_role;

-- ── Section 11: DB Functions ──────────────────────────────────────────────────

-- schedule_lesson_reminders
-- Creates lesson_reminders rows for a booking based on org automation rules.
-- Called from the event-worker after Lesson.Created.
-- Idempotent: ON CONFLICT DO NOTHING on idempotency_key.

CREATE OR REPLACE FUNCTION schedule_lesson_reminders(
  p_booking_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking  RECORD;
  v_rule     RECORD;
  v_offset   int;
  v_sched    timestamptz;
  v_idem     text;
  v_count    int := 0;
  v_inserted int;
BEGIN
  SELECT lb.id, lb.organization_id, lb.student_id, lb.instructor_id,
         ls.starts_at
  INTO v_booking
  FROM lesson_bookings lb
  JOIN lesson_slots    ls ON lb.slot_id = ls.id
  WHERE lb.id = p_booking_id
    AND lb.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR v_rule IN
    SELECT rule_type, config
    FROM   automation_rules
    WHERE  organization_id = v_booking.organization_id
      AND  rule_type IN ('reminder_24h', 'reminder_2h', 'reminder_1h')
      AND  enabled = true
  LOOP
    v_offset := CASE v_rule.rule_type
      WHEN 'reminder_24h' THEN 1440
      WHEN 'reminder_2h'  THEN 120
      WHEN 'reminder_1h'  THEN 60
      ELSE COALESCE((v_rule.config->>'offset_minutes')::int, 60)
    END;

    v_sched := v_booking.starts_at::timestamptz
               - make_interval(mins := v_offset);

    -- Skip reminders that would fire in the past
    IF v_sched <= now() THEN
      CONTINUE;
    END IF;

    -- Student reminder
    v_idem := 'reminder:' || p_booking_id::text || ':student:' || v_rule.rule_type;
    INSERT INTO lesson_reminders (
      organization_id, booking_id, recipient_id, recipient_type,
      reminder_type, offset_minutes, scheduled_for, status, idempotency_key
    ) VALUES (
      v_booking.organization_id, p_booking_id,
      v_booking.student_id, 'student',
      v_rule.rule_type::text, v_offset, v_sched, 'scheduled', v_idem
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_count := v_count + v_inserted;

    -- Instructor reminder
    IF v_booking.instructor_id IS NOT NULL THEN
      v_idem := 'reminder:' || p_booking_id::text || ':instructor:' || v_rule.rule_type;
      INSERT INTO lesson_reminders (
        organization_id, booking_id, recipient_id, recipient_type,
        reminder_type, offset_minutes, scheduled_for, status, idempotency_key
      ) VALUES (
        v_booking.organization_id, p_booking_id,
        v_booking.instructor_id, 'instructor',
        v_rule.rule_type::text, v_offset, v_sched, 'scheduled', v_idem
      )
      ON CONFLICT (idempotency_key) DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_count := v_count + v_inserted;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- cancel_lesson_reminders
-- Cancels all 'scheduled' reminders for a booking (called on lesson cancellation).

CREATE OR REPLACE FUNCTION cancel_lesson_reminders(
  p_booking_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH cancelled AS (
    UPDATE lesson_reminders
    SET    status     = 'cancelled',
           updated_at = now()
    WHERE  booking_id = p_booking_id
      AND  status     = 'scheduled'
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM cancelled;

  RETURN v_count;
END;
$$;

-- drain_due_reminders
-- Atomically claims up to p_limit reminders whose scheduled_for <= now().
-- Sets status = 'sending' to prevent concurrent double-processing (SKIP LOCKED).

CREATE OR REPLACE FUNCTION drain_due_reminders(
  p_limit int DEFAULT 20
)
RETURNS SETOF lesson_reminders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE lesson_reminders
  SET    status     = 'sending',
         updated_at = now()
  WHERE  id IN (
    SELECT id
    FROM   lesson_reminders
    WHERE  status        = 'scheduled'
      AND  scheduled_for <= now()
    ORDER BY scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- promote_waitlist_next
-- Promotes the highest-priority waiting entry for a slot.
-- Concurrency-safe via FOR UPDATE SKIP LOCKED.
-- Publishes Waitlist.Promoted to event_outbox.
-- Returns the promoted entry's UUID, or NULL if waitlist is empty.

CREATE OR REPLACE FUNCTION promote_waitlist_next(
  p_slot_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry    RECORD;
  v_minutes  int;
  v_deadline timestamptz;
BEGIN
  SELECT we.*,
         COALESCE(
           (ar.config->>'reservation_deadline_minutes')::int,
           60
         ) AS cfg_deadline_minutes
  INTO v_entry
  FROM waitlist_entries we
  LEFT JOIN automation_rules ar
    ON  ar.organization_id = we.organization_id
    AND ar.rule_type        = 'waitlist_promotion'
    AND ar.enabled          = true
  WHERE we.slot_id = p_slot_id
    AND we.status  = 'waiting'
    AND (we.expires_at IS NULL OR we.expires_at > now())
  ORDER BY we.priority ASC, we.created_at ASC
  LIMIT 1
  FOR UPDATE OF we SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_minutes  := v_entry.cfg_deadline_minutes;
  v_deadline := now() + make_interval(mins := v_minutes);

  UPDATE waitlist_entries
  SET    status               = 'promoted',
         status_changed_at    = now(),
         reservation_deadline = v_deadline,
         updated_at           = now()
  WHERE  id = v_entry.id;

  PERFORM insert_outbox_event(
    p_event_type      := 'Waitlist.Promoted',
    p_channel         := 'internal',
    p_payload         := jsonb_build_object(
      'waitlist_entry_id',  v_entry.id,
      'slot_id',            p_slot_id,
      'student_id',         v_entry.student_id,
      'reservation_deadline', v_deadline
    ),
    p_organization_id := v_entry.organization_id,
    p_target_id       := v_entry.id::text
  );

  RETURN v_entry.id;
END;
$$;

-- expire_stale_reservations
-- Sweeps all orgs for draft/reserved bookings older than their org's configured
-- timeout (falls back to p_timeout_minutes if no automation rule configured).
-- Publishes Reservation.Expired for each expired booking.

CREATE OR REPLACE FUNCTION expire_stale_reservations(
  p_timeout_minutes int DEFAULT 30
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec    RECORD;
  v_count  int := 0;
BEGIN
  FOR v_rec IN
    SELECT lb.id,
           lb.organization_id,
           lb.student_id,
           lb.slot_id,
           lb.updated_at,
           COALESCE(
             (SELECT (ar.config->>'timeout_minutes')::int
              FROM   automation_rules ar
              WHERE  ar.organization_id = lb.organization_id
                AND  ar.rule_type       = 'reservation_expiry'
                AND  ar.enabled         = true
              LIMIT 1),
             p_timeout_minutes
           ) AS timeout_min
    FROM lesson_bookings lb
    WHERE lb.status     IN ('draft', 'reserved')
      AND lb.deleted_at IS NULL
      AND lb.updated_at  < now() - make_interval(mins := p_timeout_minutes)
  LOOP
    -- Per-booking expiry check using org-specific timeout
    IF v_rec.updated_at >= now() - make_interval(mins := v_rec.timeout_min) THEN
      CONTINUE;
    END IF;

    UPDATE lesson_bookings
    SET    status               = 'cancelled',
           status_changed_at    = now(),
           cancelled_at         = now(),
           cancellation_reason  = 'Reservation expired automatically',
           cancellation_category = 'other',
           updated_at           = now()
    WHERE  id     = v_rec.id
      AND  status IN ('draft', 'reserved'); -- guard against concurrent update

    IF FOUND THEN
      PERFORM insert_outbox_event(
        p_event_type      := 'Reservation.Expired',
        p_channel         := 'internal',
        p_payload         := jsonb_build_object(
          'booking_id', v_rec.id,
          'student_id', v_rec.student_id,
          'slot_id',    v_rec.slot_id
        ),
        p_organization_id := v_rec.organization_id,
        p_target_id       := v_rec.id::text
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Grant execute to service_role (used by event-worker)
GRANT EXECUTE ON FUNCTION schedule_lesson_reminders(uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION cancel_lesson_reminders(uuid)    TO service_role;
GRANT EXECUTE ON FUNCTION drain_due_reminders(int)         TO service_role;
GRANT EXECUTE ON FUNCTION promote_waitlist_next(uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION expire_stale_reservations(int)   TO service_role;

-- ── Section 12: Seed — System Notification Templates (Swedish) ───────────────

INSERT INTO notification_templates
  (organization_id, key, locale, channel, subject, body_text, variables)
VALUES
  -- Lesson reminders
  (NULL, 'lesson.reminder.24h', 'sv', 'email',
   'Påminnelse: Körlektion imorgon kl {{starts_at_time}}',
   E'Hej {{recipient_name}},\n\nDu har en körlektion imorgon kl {{starts_at_time}} med instruktör {{instructor_name}}.\n\nPlats: {{location_name}}\n\nMed vänliga hälsningar\n{{school_name}}',
   ARRAY['recipient_name','starts_at_time','instructor_name','location_name','school_name']),

  (NULL, 'lesson.reminder.2h', 'sv', 'email',
   'Påminnelse: Körlektion om 2 timmar',
   E'Hej {{recipient_name}},\n\nDu har en körlektion om 2 timmar kl {{starts_at_time}}.\n\nMed vänliga hälsningar\n{{school_name}}',
   ARRAY['recipient_name','starts_at_time','school_name']),

  (NULL, 'lesson.reminder.1h', 'sv', 'email',
   'Påminnelse: Körlektion om 1 timme',
   E'Hej {{recipient_name}},\n\nDu har en körlektion om 1 timme kl {{starts_at_time}}.\n\nMed vänliga hälsningar\n{{school_name}}',
   ARRAY['recipient_name','starts_at_time','school_name']),

  -- Booking lifecycle
  (NULL, 'booking.confirmed', 'sv', 'email',
   'Bokningsbekräftelse: Körlektion {{starts_at_date}}',
   E'Hej {{student_name}},\n\nDin körlektion är bokad!\n\nDatum: {{starts_at_date}}\nTid: {{starts_at_time}}–{{ends_at_time}}\nInstruktör: {{instructor_name}}\nPlats: {{location_name}}\n\nMed vänliga hälsningar\n{{school_name}}',
   ARRAY['student_name','starts_at_date','starts_at_time','ends_at_time','instructor_name','location_name','school_name']),

  (NULL, 'booking.cancelled', 'sv', 'email',
   'Avbokad: Körlektion {{starts_at_date}}',
   E'Hej {{student_name}},\n\nDin körlektion {{starts_at_date}} kl {{starts_at_time}} har avbokats.\n\nOrsak: {{cancellation_reason}}\n\nMed vänliga hälsningar\n{{school_name}}',
   ARRAY['student_name','starts_at_date','starts_at_time','cancellation_reason','school_name']),

  -- Waitlist + reservation
  (NULL, 'waitlist.promoted', 'sv', 'email',
   'En plats är ledig: Körlektion {{starts_at_date}}',
   E'Hej {{student_name}},\n\nEn plats har blivit ledig för körlektion {{starts_at_date}} kl {{starts_at_time}}!\n\nBoka din plats senast {{reservation_deadline}}.\n\nMed vänliga hälsningar\n{{school_name}}',
   ARRAY['student_name','starts_at_date','starts_at_time','reservation_deadline','school_name']),

  (NULL, 'reservation.expired', 'sv', 'email',
   'Din reservation har gått ut',
   E'Hej {{student_name}},\n\nDin reservation för körlektion {{starts_at_date}} kl {{starts_at_time}} gick ut och avbokades automatiskt.\n\nBoka en ny tid via vår hemsida.\n\nMed vänliga hälsningar\n{{school_name}}',
   ARRAY['student_name','starts_at_date','starts_at_time','school_name'])
ON CONFLICT DO NOTHING;
