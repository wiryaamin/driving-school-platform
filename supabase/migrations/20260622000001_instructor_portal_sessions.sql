-- ─── Instructor Self-Service Portal Sessions ──────────────────────────────────
-- Token-based access sessions for the instructor portal.
-- Tokens are never stored plaintext — only a SHA-256 hex digest is persisted.
-- Admin staff generate tokens from the instructor detail page and share via SMS/email.

CREATE TABLE public.instructor_portal_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instructor_id   UUID        NOT NULL REFERENCES public.instructors(id)   ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);

-- Fast lookup for active, non-expired sessions by token hash
CREATE UNIQUE INDEX instructor_portal_sessions_active_token_idx
  ON public.instructor_portal_sessions (token_hash)
  WHERE revoked_at IS NULL;

-- Support querying all sessions for an instructor (e.g., revoke all)
CREATE INDEX instructor_portal_sessions_instructor_idx
  ON public.instructor_portal_sessions (instructor_id, organization_id);

-- Service role only — all validation and mutations happen inside the Edge Function.
ALTER TABLE public.instructor_portal_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.instructor_portal_sessions IS
  'Token-based access sessions for the instructor self-service portal. Only SHA-256(token) is stored, never the raw token.';
