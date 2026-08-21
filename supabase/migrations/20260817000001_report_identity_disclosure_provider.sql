-- =============================================================================
-- Personnummer disclosure in reports/exports — audit provider
--
-- The "Elevöversikt" report (apps/web/.../KunderRapportPage.tsx) gains an
-- opt-in, backend-enforced disclosure of the last 4 personnummer digits
-- (students.personnummer_last4), gated by the existing students:pii:read
-- permission and enforced server-side in a new students/report-identity
-- route. Per P-027 (identity-events.ts), the disclosure event must go
-- through the single existing writer (recordIdentityEvent() /
-- identity_security_events) rather than a new audit mechanism — this
-- migration only widens that table's provider CHECK constraint to admit
-- 'report_export', the same enum-drift-avoidance pattern already used for
-- 'person_lookup' (20260727000001_person_lookup_framework.sql).
-- =============================================================================

ALTER TABLE public.identity_security_events
  DROP CONSTRAINT identity_security_events_provider_check;

ALTER TABLE public.identity_security_events
  ADD CONSTRAINT identity_security_events_provider_check
  CHECK (provider IN ('password', 'bankid', 'entra_id', 'google_workspace', 'saml', 'person_lookup', 'report_export'));

COMMENT ON COLUMN public.identity_security_events.provider IS
  'Which authentication/identity provider — or, for report_export, which non-authentication '
  'identity-disclosure surface — the event relates to. New values extend this CHECK '
  'constraint only — never a parallel table or provider-specific event log (P-027).';
