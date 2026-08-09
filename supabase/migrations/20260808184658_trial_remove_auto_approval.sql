-- ════════════════════════════════════════════════════════════════════════════
-- Trial Onboarding — final hardening: remove auto-approval, allow
-- provisioning to fail safely and be retried.
--
-- Previously (migration 20260808180915) a completed questionnaire
-- auto-approved and immediately provisioned in the same request — Platform
-- Admin's control window was real but implicit (reject/cancel before the
-- tenant clicked submit). Now approval is explicit: questionnaire_completed
-- sessions sit and wait for Platform Admin's POST /trial-requests/:id/
-- approve (platform-admin/index.ts) before anything is provisioned.
--
-- provisioning_failed is new: if organization creation, the configuration
-- pipeline, validation, or administrator-account creation fails during
-- approval, _shared/trial-provisioning.ts's rollbackTrialProvisioning()
-- tears down everything that run created and the session lands here —
-- correctable (the applicant can still PATCH answers and resubmit via
-- POST /:token/complete, which returns it to questionnaire_completed) and
-- retriable (Platform Admin can approve again), never a dangling
-- half-provisioned organization.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tenant_trial_sessions DROP CONSTRAINT tenant_trial_sessions_status_chk;
ALTER TABLE public.tenant_trial_sessions ADD CONSTRAINT tenant_trial_sessions_status_chk
  CHECK (status IN (
    'pending_verification', 'email_verified', 'questionnaire_in_progress', 'questionnaire_completed',
    'approved', 'provisioning', 'provisioning_failed', 'active',
    'rejected', 'cancelled', 'expired'
  ));

COMMENT ON COLUMN public.tenant_trial_sessions.status IS
  'Full lifecycle: pending_verification -> email_verified -> '
  'questionnaire_in_progress -> questionnaire_completed -> (Platform Admin '
  'approves) -> approved -> provisioning -> active. provisioning_failed is '
  'a correctable dead end: a failure during approval rolls back everything '
  'created and lands here; the applicant can PATCH + resubmit '
  '(POST /:token/complete) back to questionnaire_completed for another '
  'approval attempt. Terminal/administrative: rejected, cancelled, expired. '
  'Post-provisioning tenant lifecycle (suspend/convert) is tracked on '
  'organizations.status/subscription_tier as before, not here.';
