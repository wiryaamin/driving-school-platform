-- ════════════════════════════════════════════════════════════════════════════
-- Phase D: PWA Push Subscriptions + Parent/Guardian Portal
--
-- Tables:
--   push_subscriptions         — Web Push endpoint + auth keys per user/device
--   student_guardians          — parent/guardian contacts linked to a student
--   guardian_portal_sessions   — token-based sessions for guardian portal access
--
-- All are multi-tenant (organization_id NOT NULL).
-- Guardian sessions reuse the same HMAC-based token mechanism as student sessions.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. push_subscriptions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Either a staff user_id (admin/instructor) or a student portal session owner
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id      uuid        REFERENCES students(id)   ON DELETE CASCADE,
  guardian_id     uuid,       -- references student_guardians.id (set after insert)
  -- Web Push Subscription fields
  endpoint        text        NOT NULL,
  p256dh          text        NOT NULL,  -- client public key
  auth            text        NOT NULL,  -- HMAC authentication key
  -- Device context
  user_agent      text,
  subscribed_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  CONSTRAINT push_sub_owner_check CHECK (
    (user_id IS NOT NULL)::int + (student_id IS NOT NULL)::int = 1
  )
);

COMMENT ON TABLE push_subscriptions IS
  'Web Push API subscriptions per device. user_id = admin/instructor, student_id = student portal user.';

CREATE UNIQUE INDEX push_subscriptions_endpoint_idx
  ON push_subscriptions(endpoint)
  WHERE revoked_at IS NULL;

CREATE INDEX push_subscriptions_user_idx
  ON push_subscriptions(user_id, organization_id)
  WHERE user_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX push_subscriptions_student_idx
  ON push_subscriptions(student_id, organization_id)
  WHERE student_id IS NOT NULL AND revoked_at IS NULL;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Service role only — mutations via Edge Function
GRANT SELECT, INSERT, UPDATE ON push_subscriptions TO service_role;

-- ── 2. student_guardians ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_guardians (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,
  student_id      uuid        NOT NULL REFERENCES students(id)        ON DELETE CASCADE,
  email           text        NOT NULL,
  first_name      text        NOT NULL,
  last_name       text        NOT NULL,
  phone           text,
  relation        text,       -- 'Förälder', 'Vårdnadshavare', etc.
  can_pay         boolean     NOT NULL DEFAULT true,
  created_by      uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

COMMENT ON TABLE student_guardians IS
  'Parent/guardian contacts for a student. can_pay controls whether the guardian portal shows the payment section.';

CREATE INDEX student_guardians_student_idx
  ON student_guardians(student_id, organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX student_guardians_email_idx
  ON student_guardians(organization_id, email)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS student_guardians_set_updated_at ON student_guardians;
CREATE TRIGGER student_guardians_set_updated_at
  BEFORE UPDATE ON student_guardians
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_guardians_tenant_read ON student_guardians
  FOR SELECT TO authenticated
  USING (
    organization_id = (
      current_setting('request.jwt.claims', true)::jsonb->>'organization_id'
    )::uuid
  );

CREATE POLICY student_guardians_tenant_write ON student_guardians
  FOR ALL TO authenticated
  USING (
    organization_id = (
      current_setting('request.jwt.claims', true)::jsonb->>'organization_id'
    )::uuid
  )
  WITH CHECK (
    organization_id = (
      current_setting('request.jwt.claims', true)::jsonb->>'organization_id'
    )::uuid
  );

GRANT SELECT, INSERT, UPDATE ON student_guardians TO authenticated;
GRANT ALL ON student_guardians TO service_role;

-- ── 3. guardian_portal_sessions ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS guardian_portal_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  guardian_id     uuid        NOT NULL REFERENCES student_guardians(id) ON DELETE CASCADE,
  student_id      uuid        NOT NULL REFERENCES students(id)          ON DELETE CASCADE,
  token_hash      text        NOT NULL,
  expires_at      timestamptz NOT NULL,
  created_by      uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz
);

COMMENT ON TABLE guardian_portal_sessions IS
  'Token-based portal sessions for parents/guardians. Mirrors student_portal_sessions but for guardian accounts.';

CREATE UNIQUE INDEX guardian_portal_sessions_token_idx
  ON guardian_portal_sessions(token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX guardian_portal_sessions_guardian_idx
  ON guardian_portal_sessions(guardian_id, organization_id);

ALTER TABLE guardian_portal_sessions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON guardian_portal_sessions TO service_role;

-- ── 4. Back-reference: guardian_id on push_subscriptions ──────────────────────

ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_guardian_id_fk
  FOREIGN KEY (guardian_id) REFERENCES student_guardians(id) ON DELETE CASCADE;
