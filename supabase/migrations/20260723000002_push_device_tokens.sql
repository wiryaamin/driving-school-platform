-- ════════════════════════════════════════════════════════════════════════════
-- Push Device Tokens — FCM Registration Token Store
--
-- Approved production push architecture (2026-07-23): Firebase Cloud
-- Messaging (FCM). This table stores FCM device registration tokens
-- (opaque strings returned by the client's `getToken()` call), the model
-- dispatchFirebase()/dispatchOneSignal() in _shared/comm-providers.ts
-- already expect (`to` = device token), as opposed to the deprecated
-- push_subscriptions table (Web Push endpoint/p256dh/auth model — not the
-- approved architecture, retained only as documented deprecated
-- infrastructure per the Commissioning Register).
--
-- One row per registered device. A recipient may have multiple active
-- devices (multiple browser profiles, phone + desktop, etc); dispatch fans
-- out to every non-revoked token for the recipient.
--
-- Mutations are service-role only — every owner type authenticates through
-- its own existing session mechanism (student/instructor/guardian portal
-- session tokens, or a normal staff JWT for user_id), validated inside the
-- respective Edge Function before it calls through to this table, mirroring
-- the access pattern already established by push_subscriptions.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS push_device_tokens (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Exactly one owner column is set — see push_device_tokens_owner_check below.
  user_id          uuid        REFERENCES auth.users(id)      ON DELETE CASCADE,  -- staff/admin
  student_id       uuid        REFERENCES students(id)        ON DELETE CASCADE,  -- Student Portal
  instructor_id    uuid        REFERENCES instructors(id)     ON DELETE CASCADE,  -- Instructor Portal
  guardian_id      uuid        REFERENCES student_guardians(id) ON DELETE CASCADE, -- Guardian Portal

  provider         text        NOT NULL DEFAULT 'firebase' CHECK (provider IN ('firebase', 'onesignal')),
  token            text        NOT NULL,
  platform         text        NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'ios', 'android')),
  user_agent       text,

  registered_at    timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz,
  revoked_at       timestamptz,
  revoked_reason   text,  -- e.g. 'client_unsubscribed', 'provider_reported_invalid'

  CONSTRAINT push_device_tokens_owner_check CHECK (
    (user_id IS NOT NULL)::int + (student_id IS NOT NULL)::int +
    (instructor_id IS NOT NULL)::int + (guardian_id IS NOT NULL)::int = 1
  )
);

COMMENT ON TABLE push_device_tokens IS
  'FCM (or future OneSignal) device registration tokens. One row per device. dispatch fans out to every non-revoked token for a recipient.';

-- A given device's token string is unique among active registrations. When a
-- client re-registers with a refreshed token, the caller revokes the old row
-- and inserts a new one (see _shared/push-tokens.ts registerPushToken()).
CREATE UNIQUE INDEX push_device_tokens_token_idx
  ON push_device_tokens(token)
  WHERE revoked_at IS NULL;

CREATE INDEX push_device_tokens_user_idx
  ON push_device_tokens(user_id, organization_id)
  WHERE user_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX push_device_tokens_student_idx
  ON push_device_tokens(student_id, organization_id)
  WHERE student_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX push_device_tokens_instructor_idx
  ON push_device_tokens(instructor_id, organization_id)
  WHERE instructor_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX push_device_tokens_guardian_idx
  ON push_device_tokens(guardian_id, organization_id)
  WHERE guardian_id IS NOT NULL AND revoked_at IS NULL;

ALTER TABLE push_device_tokens ENABLE ROW LEVEL SECURITY;

-- Service role only — mutations via Edge Function, matching push_subscriptions'
-- established access pattern. No `authenticated` policy: every owner type
-- (student/instructor/guardian portal sessions, and staff JWTs) is validated
-- inside its own Edge Function, which then uses the service-role client.
GRANT SELECT, INSERT, UPDATE ON push_device_tokens TO service_role;
