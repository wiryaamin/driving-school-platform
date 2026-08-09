-- ════════════════════════════════════════════════════════════════════════════
-- Trial Onboarding — Platform Admin lifecycle control.
--
-- Requested by the Product Owner: email verification (previous migration)
-- proves the applicant controls the address — it does NOT mean the trial is
-- approved. Platform Admin needs full visibility and control over a trial
-- request BEFORE the organization is created (view/approve/reject/cancel/
-- expire/delete/resend) and the request must not become a real organization,
-- tenant user, or externally-provisioned integration until it reaches an
-- approved/provisioning state.
--
-- Two changes:
--   1. tenant_trial_sessions.status gains the full lifecycle (see CHECK
--      below) and organization_id becomes nullable — trial-signup/index.ts
--      now defers the actual `organizations` INSERT to the provisioning
--      step inside handleComplete, instead of creating it eagerly at
--      POST / as before. Existing rows are migrated forward, never dropped.
--   2. tenant_trial_events is new: a lightweight, append-only log of every
--      lifecycle transition (who, when, why). Not a duplicate of
--      audit_logs — audit_logs is driven by a trigger on the `organizations`
--      table and only starts capturing once that row exists; this table
--      covers everything that happens *before* that, and survives session
--      deletion (ON DELETE SET NULL + denormalized email/school name) so
--      "preserve the audit record" holds even for a hard-deleted abandoned
--      request.
-- ════════════════════════════════════════════════════════════════════════════

-- Drop the old, narrower constraint FIRST — the data migration below writes
-- values ('active', 'questionnaire_in_progress', 'pending_verification')
-- that the old constraint doesn't allow yet.
ALTER TABLE public.tenant_trial_sessions DROP CONSTRAINT tenant_trial_sessions_status_chk;

-- ── Migrate existing status values forward ──────────────────────────────────
UPDATE public.tenant_trial_sessions SET status = 'active' WHERE status = 'completed';
UPDATE public.tenant_trial_sessions SET status = 'questionnaire_in_progress' WHERE status = 'in_progress' AND email_verified_at IS NOT NULL;
UPDATE public.tenant_trial_sessions SET status = 'pending_verification' WHERE status = 'in_progress' AND email_verified_at IS NULL;

ALTER TABLE public.tenant_trial_sessions ADD CONSTRAINT tenant_trial_sessions_status_chk
  CHECK (status IN (
    'pending_verification', 'email_verified', 'questionnaire_in_progress', 'questionnaire_completed',
    'approved', 'provisioning', 'active',
    'rejected', 'cancelled', 'expired'
  ));

-- Organization creation is now deferred to the provisioning step — no org
-- exists for a session sitting anywhere before 'provisioning'.
ALTER TABLE public.tenant_trial_sessions ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE public.tenant_trial_sessions
  ADD COLUMN rejected_at         timestamptz,
  ADD COLUMN rejected_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN rejection_reason    text,
  ADD COLUMN cancelled_at        timestamptz,
  ADD COLUMN cancelled_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN cancellation_reason text;

COMMENT ON COLUMN public.tenant_trial_sessions.status IS
  'Full lifecycle: pending_verification -> email_verified -> '
  'questionnaire_in_progress -> questionnaire_completed -> approved -> '
  'provisioning -> active. Terminal/administrative: rejected, cancelled, '
  'expired. Post-provisioning tenant lifecycle (suspend/convert) is tracked '
  'on organizations.status/subscription_tier as before, not here.';

COMMENT ON COLUMN public.tenant_trial_sessions.organization_id IS
  'NULL until the session reaches provisioning — the organizations row is '
  'created inside handleComplete, not eagerly at signup, so a rejected or '
  'cancelled trial never creates an organization, tenant user, or '
  'externally-provisioned integration.';

-- ── tenant_trial_events — append-only lifecycle audit trail ────────────────

CREATE TABLE public.tenant_trial_events (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  session_id           uuid        REFERENCES public.tenant_trial_sessions(id) ON DELETE SET NULL,
  email                text        NOT NULL,
  driving_school_name  text        NOT NULL,
  event_type           text        NOT NULL,
  actor_type           text        NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system', 'applicant', 'admin')),
  actor_id             uuid,
  actor_email          text,
  metadata             jsonb       NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_trial_events_pkey PRIMARY KEY (id)
);

CREATE INDEX tenant_trial_events_session_idx ON public.tenant_trial_events (session_id, created_at);
CREATE INDEX tenant_trial_events_email_idx   ON public.tenant_trial_events (email);

COMMENT ON TABLE public.tenant_trial_events IS
  'Append-only lifecycle audit trail for tenant_trial_sessions — request '
  'created, email verified, questionnaire started/completed, approved, '
  'provisioning started/completed, rejected, cancelled, expired. Survives '
  'session deletion (session_id SET NULL, email/school name denormalized) '
  'so an abandoned/abusive request can be safely deleted while the record '
  'that it existed and what happened to it is preserved.';

-- No RLS policies — service-role only, same access model as
-- tenant_trial_sessions itself (trial-signup + platform-admin Edge
-- Functions only).
ALTER TABLE public.tenant_trial_events ENABLE ROW LEVEL SECURITY;
