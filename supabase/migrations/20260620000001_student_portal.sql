-- ─── Student Self-Service Portal ─────────────────────────────────────────────
-- Token-based access sessions for the student portal.
-- Tokens are never stored plaintext — only a SHA-256 hex digest is persisted.
-- Admin staff generate tokens from the student detail page and share via SMS/email.

CREATE TABLE public.student_portal_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL REFERENCES public.students(id)       ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);

-- Fast lookup for active, non-expired sessions by token hash
CREATE UNIQUE INDEX student_portal_sessions_active_token_idx
  ON public.student_portal_sessions (token_hash)
  WHERE revoked_at IS NULL;

-- Support querying all sessions for a student (e.g., revoke all)
CREATE INDEX student_portal_sessions_student_idx
  ON public.student_portal_sessions (student_id, organization_id);

-- Service role only — no user-facing RLS policies needed.
-- All validation and mutations happen inside the student-portal Edge Function.
ALTER TABLE public.student_portal_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.student_portal_sessions IS
  'Token-based access sessions for the student self-service portal. Only SHA-256(token) is stored, never the raw token.';
