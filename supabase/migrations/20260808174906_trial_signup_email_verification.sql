-- ════════════════════════════════════════════════════════════════════════════
-- Trial Signup — email verification gate.
--
-- Requested by the Product Owner: the first email in the trial-signup
-- sequence must verify the tenant actually owns/controls the address they
-- registered with (and that Resend can actually deliver to it) BEFORE the
-- welcome email + business-interview link goes out. Previously both emails
-- fired unconditionally at POST / with no real gate — TrialSignupForm.tsx's
-- own header comment already described "Verify email as a genuine,
-- non-skippable step" as the intent, but no code enforced it.
--
-- email_verified_at is the gate: NULL until the tenant clicks the link in
-- the verification email, checked by handleGetSession/handleSaveAnswers/
-- handleComplete in trial-signup/index.ts so simply knowing the session
-- token is never enough on its own to reach the interview or complete it.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tenant_trial_sessions
  ADD COLUMN email_verified_at timestamptz;

COMMENT ON COLUMN public.tenant_trial_sessions.email_verified_at IS
  'Set when the tenant clicks the verification link in the first trial-signup '
  'email (GET /trial-signup/:token/verify-email). NULL blocks access to the '
  'business interview and completion — see trial-signup/index.ts.';
