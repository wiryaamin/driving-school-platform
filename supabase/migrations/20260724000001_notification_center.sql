-- ════════════════════════════════════════════════════════════════════════════
-- Unified Notification Center (Version 1.1)
--
-- Evolves the existing `notifications` table (Phase 3D, previously fed only
-- by the lesson-reminder scheduler) into the canonical, cross-channel
-- notification history the Student/Guardian/Instructor portal bells read.
--
-- Principle: a Notification is a BUSINESS EVENT record, not a delivery. Push/
-- Email/SMS are delivery channels tracked separately in `outbound_messages`
-- (unchanged) — this migration only adds the link (`notification_id`) and
-- the reader-facing lifecycle columns (read/archived/expires) to the
-- existing canonical table.
--
-- Purely additive: no existing column is dropped, renamed, or retyped, and
-- no existing row's meaning changes. The lesson-reminder scheduler
-- (schedule_lesson_reminders / drain_due_reminders / lesson_reminders.status
-- lifecycle) is untouched and keeps working exactly as before.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. New enum types ──────────────────────────────────────────────────────

CREATE TYPE notification_category AS ENUM (
  'booking', 'lesson', 'payment', 'invoice', 'waitlist',
  'certificate', 'account', 'security', 'system', 'marketing'
);

CREATE TYPE notification_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- ── 2. Extend notifications — additive columns only ────────────────────────

ALTER TABLE notifications
  ADD COLUMN read_at              timestamptz,
  ADD COLUMN archived_at          timestamptz,
  ADD COLUMN expires_at           timestamptz,
  ADD COLUMN priority             notification_priority NOT NULL DEFAULT 'normal',
  ADD COLUMN category             notification_category,
  -- A stable route identifier the frontend resolves to an actual URL
  -- (e.g. 'booking_detail'), deliberately NOT a stored path — so a future
  -- routing change never requires a data migration. The existing
  -- reference_type/reference_id columns carry which entity it points to.
  ADD COLUMN deep_link_identifier text;

COMMENT ON COLUMN notifications.read_at IS
  'NULL = unread. Set once by the recipient viewing/acknowledging it — lifecycle field, mutable after creation.';
COMMENT ON COLUMN notifications.archived_at IS
  'Recipient-dismissed or auto-expired — excluded from default history views. Lifecycle field, mutable after creation.';
COMMENT ON COLUMN notifications.deep_link_identifier IS
  'Stable frontend route key (e.g. booking_detail, waitlist, invoice_detail) — resolved to a URL client-side using reference_type/reference_id, never a stored path.';

-- Widen recipient_type for the full Notification Center recipient model
-- (Students, Guardians, Instructors, Staff) without a schema redesign.
-- Existing values ('student','instructor','admin') keep working unmodified.
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_recipient_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_recipient_type_check
  CHECK (recipient_type IN ('student', 'instructor', 'guardian', 'staff', 'admin'));

-- ── 3. Link outbound_messages (delivery attempts) to their canonical notification ──
-- One notification → many outbound_messages (one per channel attempt).
-- Nullable: existing delivery rows predate this feature and simply have no
-- canonical parent, which is a fully valid, backward-compatible state.

ALTER TABLE outbound_messages
  ADD COLUMN notification_id uuid REFERENCES notifications(id) ON DELETE SET NULL;

COMMENT ON COLUMN outbound_messages.notification_id IS
  'The canonical notifications row this delivery attempt belongs to. A delivery failing here never affects the parent notification — history and delivery state are deliberately independent.';

-- ── 4. Indexes ──────────────────────────────────────────────────────────────

-- Unread/inbox list queries: "my notifications, not archived, newest first"
CREATE INDEX notifications_recipient_inbox_idx
  ON notifications (organization_id, recipient_id, recipient_type, created_at DESC)
  WHERE archived_at IS NULL;

-- Fast unread-count queries
CREATE INDEX notifications_recipient_unread_idx
  ON notifications (organization_id, recipient_id, recipient_type)
  WHERE read_at IS NULL AND archived_at IS NULL;

CREATE INDEX outbound_messages_notification_idx
  ON outbound_messages (notification_id)
  WHERE notification_id IS NOT NULL;

-- ── 5. Immutability guard ───────────────────────────────────────────────────
-- Notification records are business history: content is fixed at creation.
-- Only the reader-facing lifecycle columns (read_at/archived_at/expires_at)
-- and updated_at may change afterward. This is a data-integrity guard, not a
-- compliance-grade cryptographic ledger (unlike the finance journal) — a
-- plain trigger is proportionate here.
--
-- Deliberately NOT included in the guard: channel/status/status_changed_at/
-- sent_at/failed_at/failure_reason/retry_count/scheduled_for — these remain
-- exactly as mutable as before, since the pre-existing lesson-reminder flow
-- (supabase/functions/notifications/index.ts handleCancel) already updates
-- status/status_changed_at on existing rows and must keep working unchanged.

CREATE OR REPLACE FUNCTION prevent_notification_content_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id       IS DISTINCT FROM OLD.organization_id
     OR NEW.recipient_id         IS DISTINCT FROM OLD.recipient_id
     OR NEW.recipient_type       IS DISTINCT FROM OLD.recipient_type
     OR NEW.category             IS DISTINCT FROM OLD.category
     OR NEW.template_key         IS DISTINCT FROM OLD.template_key
     OR NEW.locale                IS DISTINCT FROM OLD.locale
     OR NEW.subject               IS DISTINCT FROM OLD.subject
     OR NEW.body                  IS DISTINCT FROM OLD.body
     OR NEW.deep_link_identifier  IS DISTINCT FROM OLD.deep_link_identifier
     OR NEW.reference_type        IS DISTINCT FROM OLD.reference_type
     OR NEW.reference_id          IS DISTINCT FROM OLD.reference_id
     OR NEW.priority               IS DISTINCT FROM OLD.priority
     OR NEW.metadata                IS DISTINCT FROM OLD.metadata
     OR NEW.created_at              IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'notifications: business content is immutable after creation (id=%). Only read_at/archived_at/expires_at (and the pre-existing delivery-status columns) may change.',
      OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notifications_prevent_content_mutation
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION prevent_notification_content_mutation();
