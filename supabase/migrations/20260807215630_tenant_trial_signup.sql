-- ════════════════════════════════════════════════════════════════════════════
-- Tenant Trial Signup — self-service trial creation + pre-account guided
-- business interview.
--
-- New architecture requested directly by the Product Owner (2026-08-07): a
-- prospective customer starts a trial without any admin involvement, answers
-- a guided business interview BEFORE any password/account exists, the
-- platform automatically configures the tenant from those answers, and only
-- THEN is an administrator account created and a password set.
--
-- This is genuinely new infrastructure — no prior migration, doc, or commit
-- in this repository describes a pre-account onboarding token or a public
-- trial-signup entry point (confirmed by full-repo/history search before
-- writing this). The one existing "Frozen/approved" architecture doc
-- (docs/CUSTOMER_PROVISIONING_ONBOARDING_ARCHITECTURE.md) describes the
-- opposite order (account created first, then invited, then onboarded) —
-- that document is now superseded for the *self-service* path by this one;
-- it still describes the manual/admin-provisioned path, which is unchanged
-- and left running side by side (staff invites, bootstrap_org_admin.sql).
--
-- tenant_trial_sessions is the pre-account session: a secure token tied to
-- an email + an already-created (but not-yet-real) organization shell. The
-- organization row is created immediately (Provisioning/compliance writes —
-- lesson types, branch, packages — need a real organization_id to write
-- into), but no auth.users row, membership, or role exists until the
-- interview is submitted and the configuration engine has run — matching
-- the requirement that "Create Administrator Account" and "Customer creates
-- password" happen strictly after the interview, not before.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.tenant_trial_sessions (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
  token              text        NOT NULL,
  email              text        NOT NULL,
  driving_school_name text       NOT NULL,
  organization_id    uuid        NOT NULL,
  admin_user_id      uuid,
  status             text        NOT NULL DEFAULT 'in_progress',
  interview_answers  jsonb       NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  completed_at       timestamptz,

  CONSTRAINT tenant_trial_sessions_pkey        PRIMARY KEY (id),
  CONSTRAINT tenant_trial_sessions_token_key   UNIQUE (token),
  CONSTRAINT tenant_trial_sessions_org_fkey    FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT tenant_trial_sessions_status_chk  CHECK (status IN ('in_progress', 'completed', 'expired'))
);

CREATE INDEX tenant_trial_sessions_token_idx ON public.tenant_trial_sessions (token) WHERE status = 'in_progress';
CREATE INDEX tenant_trial_sessions_email_idx ON public.tenant_trial_sessions (email);

COMMENT ON TABLE public.tenant_trial_sessions IS
  'Pre-account trial-signup session. Tracks a secure onboarding token from '
  '"Welcome" email through guided business interview to automatic '
  'configuration and administrator account creation. No end-user has direct '
  '(RLS) access to this table — it is only ever touched by the trial-signup '
  'Edge Function using the service-role client, matching demo_requests.';

COMMENT ON COLUMN public.tenant_trial_sessions.token IS
  'Opaque random token embedded in /onboarding/{token} — the only credential '
  'this session has until the interview completes and a real account exists.';

COMMENT ON COLUMN public.tenant_trial_sessions.organization_id IS
  'Created eagerly at trial-signup time (Provisioning writes need a real '
  'organization_id to target) but has no administrator, membership, or '
  'login-capable user until this session reaches status=completed.';

-- No RLS policies are added — this table is intentionally only reachable via
-- the service-role client from the trial-signup Edge Function (matching
-- demo_requests' own access model), never directly from an authenticated or
-- anonymous PostgREST request.
ALTER TABLE public.tenant_trial_sessions ENABLE ROW LEVEL SECURITY;
