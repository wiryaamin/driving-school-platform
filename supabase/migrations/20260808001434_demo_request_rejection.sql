-- ════════════════════════════════════════════════════════════════════════════
-- Demo request rejection — Platform Admin can decline a demo/trial request
-- with a structured reason + free-text description, instead of only being
-- able to change status to 'declined' with no record of why. Reuses the
-- existing 'declined' status value (already in demo_requests_status_check,
-- 20260711000001) — this only adds the reason/description fields alongside
-- it, same additive pattern as 20260730000003_mandatory_onboarding_workflow_fields.sql.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS rejection_reason      text,
  ADD COLUMN IF NOT EXISTS rejection_description text,
  ADD COLUMN IF NOT EXISTS rejected_at            timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by            uuid REFERENCES auth.users(id);

ALTER TABLE public.demo_requests
  ADD CONSTRAINT demo_requests_rejection_reason_check
  CHECK (rejection_reason IS NULL OR rejection_reason IN (
    'duplicate_email',
    'duplicate_request',
    'spam_or_fraud',
    'incomplete_invalid_info',
    'not_target_market',
    'unable_to_verify_business',
    'outside_service_area',
    'other'
  ));

COMMENT ON COLUMN public.demo_requests.rejection_reason IS
  'Structured reason a platform admin declined this request — standard B2B lead-rejection taxonomy. NULL unless status=declined via the reject action.';
COMMENT ON COLUMN public.demo_requests.rejection_description IS
  'Free-text elaboration accompanying rejection_reason — required when rejection_reason = ''other''.';
