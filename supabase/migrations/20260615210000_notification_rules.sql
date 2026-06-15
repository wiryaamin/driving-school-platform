-- ════════════════════════════════════════════════════════════════════════════
-- Notification Rules + Communication Worker Support
--
-- Tables:
--   notification_rules — per-org declarative event-triggered notification rules
--
-- Functions (SECURITY DEFINER):
--   claim_scheduled_messages(max_count) — atomically claim scheduled queue items
--   claim_retry_messages(max_count)     — atomically claim failed-retry candidates
--
-- Rules are decoupled from business modules: they declare WHAT template to send
-- on WHICH trigger event. The communication-worker reads rules and dispatches.
-- Business modules fire events; they do not call communication code directly.
-- ════════════════════════════════════════════════════════════════════════════

-- ── notification_rules ────────────────────────────────────────────────────────

CREATE TABLE notification_rules (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_event    text        NOT NULL,
  channel          text        NOT NULL CHECK (channel IN ('email','sms','whatsapp','push','voice')),
  template_id      uuid        NOT NULL REFERENCES notification_templates(id),
  recipient_type   text        NOT NULL DEFAULT 'student'
                               CHECK (recipient_type IN ('student','instructor')),
  enabled          boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- One rule per trigger+channel+recipient combination per org
  UNIQUE(organization_id, trigger_event, channel, recipient_type)
);

ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read notification_rules"
  ON notification_rules FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

CREATE POLICY "org admins write notification_rules"
  ON notification_rules FOR ALL
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- Partial index: quick lookup of enabled rules by trigger (used by worker)
CREATE INDEX idx_notification_rules_active
  ON notification_rules(organization_id, trigger_event)
  WHERE enabled = true;

-- ── Atomic claim functions for the communication worker ───────────────────────
-- Use FOR UPDATE SKIP LOCKED to prevent concurrent workers from double-dispatching.

CREATE OR REPLACE FUNCTION claim_scheduled_messages(max_count int DEFAULT 50)
RETURNS SETOF outbound_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE outbound_messages
  SET status = 'sending'
  WHERE id IN (
    SELECT id FROM outbound_messages
    WHERE  status       = 'queued'
      AND  scheduled_at IS NOT NULL
      AND  scheduled_at <= now()
      AND  deleted_at   IS NULL
    ORDER  BY scheduled_at
    LIMIT  max_count
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION claim_retry_messages(max_count int DEFAULT 20)
RETURNS SETOF outbound_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE outbound_messages
  SET status = 'sending'
  WHERE id IN (
    SELECT id FROM outbound_messages
    WHERE  status       = 'failed'
      AND  retry_after  IS NOT NULL
      AND  retry_after  <= now()
      AND  retry_count  < max_retries
      AND  deleted_at   IS NULL
    ORDER  BY retry_after
    LIMIT  max_count
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- Grant execute to service_role (used by Edge Functions with service key)
GRANT EXECUTE ON FUNCTION claim_scheduled_messages(int) TO service_role;
GRANT EXECUTE ON FUNCTION claim_retry_messages(int)     TO service_role;
