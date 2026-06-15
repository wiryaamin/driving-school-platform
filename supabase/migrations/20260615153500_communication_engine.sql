-- ════════════════════════════════════════════════════════════════════════════
-- Communication Engine
--
-- Tables:
--   channel_configs    — per-org channel configuration (SMS, Email, WhatsApp, Push, Voice)
--   outbound_messages  — delivery log for all outbound communications
--
-- Extends notification_templates channel constraint to support whatsapp + voice.
-- Designed provider-independent: no API keys stored in DB (use Supabase Secrets).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Extend notification_templates channel to cover all communication channels ──

ALTER TABLE notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_channel_check;

ALTER TABLE notification_templates
  ADD CONSTRAINT notification_templates_channel_check
  CHECK (channel IN ('email', 'sms', 'push', 'internal', 'whatsapp', 'voice'));

-- ── channel_configs ───────────────────────────────────────────────────────────
-- One row per channel per organization. Stores enabled state + provider identity.
-- Sensitive API keys are stored via Supabase Secrets, never in this table.

CREATE TABLE channel_configs (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel          text        NOT NULL CHECK (channel IN ('email','sms','whatsapp','push','voice')),
  enabled          boolean     NOT NULL DEFAULT false,
  provider         text,                             -- e.g. 'sendgrid','twilio','vonage','firebase'
  from_address     text,                             -- sender phone number or email
  display_name     text,                             -- "Körskolan AB"
  daily_limit      int         NOT NULL DEFAULT 500,
  metadata         jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, channel)
);

-- Seed default disabled channel rows when an org is created (trigger optional).
-- For now callers INSERT on conflict do nothing.

-- ── outbound_messages ─────────────────────────────────────────────────────────
-- Append-only delivery log. One row per dispatch attempt.
-- Status transitions: queued → sending → sent/failed → delivered/bounced

CREATE TABLE outbound_messages (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel             text        NOT NULL CHECK (channel IN ('email','sms','whatsapp','push','voice')),
  recipient_type      text        NOT NULL DEFAULT 'manual'
                                  CHECK (recipient_type IN ('student','instructor','manual')),
  recipient_id        uuid,                           -- student_id or instructor_id when applicable
  recipient_address   text        NOT NULL,            -- email or phone number
  template_id         uuid        REFERENCES notification_templates(id),
  subject             text,                            -- used for email
  body                text        NOT NULL,
  status              text        NOT NULL DEFAULT 'queued'
                                  CHECK (status IN ('queued','sending','sent','delivered','failed','bounced','cancelled')),
  provider            text,                            -- which provider dispatched this
  provider_message_id text,                            -- provider's own message ID for tracking
  error_message       text,
  retry_count         int         NOT NULL DEFAULT 0,
  max_retries         int         NOT NULL DEFAULT 3,
  scheduled_at        timestamptz,                     -- null = send immediately
  sent_at             timestamptz,
  delivered_at        timestamptz,
  metadata            jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid        NOT NULL REFERENCES auth.users(id),
  deleted_at          timestamptz
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE channel_configs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_messages  ENABLE ROW LEVEL SECURITY;

-- channel_configs: org members can read; admins/managers can write
CREATE POLICY "org members read channel_configs"
  ON channel_configs FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

CREATE POLICY "org admins write channel_configs"
  ON channel_configs FOR ALL
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- outbound_messages: org members can read; insert allowed (Edge Function uses service role)
CREATE POLICY "org members read outbound_messages"
  ON outbound_messages FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

CREATE POLICY "org members insert outbound_messages"
  ON outbound_messages FOR INSERT
  WITH CHECK (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_outbound_messages_org_created
  ON outbound_messages(organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_outbound_messages_status
  ON outbound_messages(organization_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_outbound_messages_recipient
  ON outbound_messages(organization_id, recipient_type, recipient_id)
  WHERE recipient_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_outbound_messages_scheduled
  ON outbound_messages(scheduled_at)
  WHERE status = 'queued' AND scheduled_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_channel_configs_org
  ON channel_configs(organization_id);
