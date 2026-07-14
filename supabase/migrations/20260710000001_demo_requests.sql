-- =============================================================================
-- DEMO REQUESTS — Release 2.0, Epic 2
--
-- Backs the public "Boka en personlig visning" form (apps/web/src/modules/
-- demo-page). A demo request is a platform-level sales lead, not a tenant
-- business record: the visitor submitting it does not have an organization
-- in the system yet — that is the entire point of the form. This table
-- therefore carries NO organization_id, matching the precedent set by
-- other genuinely platform-scoped tables (platform_admins, event_outbox,
-- worker_run_log — see 20260527000002_phase1b2_hardening.sql and
-- 20260708000001_epic74_communication_analytics.sql), not the org-scoped
-- lead tables (student_leads, enrollment_requests), which model a *specific
-- driving school's own* prospective students/customers — a different
-- concept from a prospect evaluating TrafikskolaOS itself.
--
-- Writes happen exclusively through the `demo-requests` Edge Function using
-- a service-role client (bypasses RLS by design, same as public-booking and
-- public-enrollment's own insert paths). No INSERT policy is defined for
-- `anon`/`authenticated` — the absence of one is itself the control,
-- matching the exact pattern already used by enrollment_requests and
-- worker_run_log.
--
-- Audit trail: `audit_trigger_fn()` is deliberately NOT attached — none of
-- this table's closest analogs (student_leads, enrollment_requests,
-- worker_run_log, platform_admins, event_outbox) use it either. Its
-- `organization_id`-keyed design doesn't fit a table with no
-- organization_id, and `created_at`/`updated_at`/`contacted_at`/
-- `converted_at` plus the `status` lifecycle already provide this table's
-- own audit trail, consistent with how its sibling tables handle this.
-- =============================================================================

CREATE TABLE public.demo_requests (
  id                       uuid          NOT NULL DEFAULT gen_random_uuid(),

  -- ── Visitor-submitted fields (mirrors apps/web/.../demo-page/lib/demoRequestSchema.ts) ──
  name                     text          NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  school_name              text          NOT NULL CHECK (char_length(school_name) BETWEEN 2 AND 150),
  email                    text          NOT NULL CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone                    text          NOT NULL CHECK (char_length(phone) BETWEEN 6 AND 30),
  municipality             text          NOT NULL CHECK (char_length(municipality) BETWEEN 2 AND 100),
  location_count           integer       NOT NULL CHECK (location_count >= 1),
  student_count            integer       NOT NULL CHECK (student_count >= 0),
  current_system           text          NOT NULL CHECK (current_system IN ('spreadsheets', 'other_software', 'manual', 'other')),
  message                  text          NOT NULL DEFAULT '' CHECK (char_length(message) <= 1000),

  -- ── Submission provenance (captured server-side, for spam/abuse review) ──
  source                   text          NOT NULL DEFAULT 'public_demo_form',
  ip_address               inet,
  user_agent               text,

  -- ── Lead lifecycle (Platform Administration manages this; see Section 9 ──
  -- ── of the Release 2.0 Epic 2 report for how it will surface in the UI) ──
  status                   text          NOT NULL DEFAULT 'new'
                                          CHECK (status IN ('new', 'contacted', 'scheduled', 'completed', 'converted', 'declined', 'spam')),
  assigned_to              uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_notes           text          NOT NULL DEFAULT '',
  converted_organization_id uuid         REFERENCES public.organizations(id) ON DELETE SET NULL,

  -- ── Timestamps ──────────────────────────────────────────────────────────
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  contacted_at              timestamptz,
  converted_at              timestamptz,

  CONSTRAINT demo_requests_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.demo_requests IS
  'Platform-level sales leads from the public "Boka en personlig visning" form. No organization_id — the prospect has no tenant yet. Visible to Platform Administrators only; never to any tenant.';
COMMENT ON COLUMN public.demo_requests.converted_organization_id IS
  'Set when this lead becomes a real paying tenant, linking the lead to the organization it produced. Nullable until (if ever) conversion happens.';

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX demo_requests_status_idx      ON public.demo_requests (status);
CREATE INDEX demo_requests_created_at_idx  ON public.demo_requests (created_at DESC);
CREATE INDEX demo_requests_email_idx       ON public.demo_requests (email);
CREATE INDEX demo_requests_assigned_to_idx ON public.demo_requests (assigned_to) WHERE assigned_to IS NOT NULL;

-- ── updated_at trigger (existing shared function, not a new mechanism) ───────
CREATE TRIGGER set_demo_requests_updated_at
  BEFORE UPDATE ON public.demo_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
--
-- Three audiences, three explicit decisions:
--   1. Anonymous visitors  — write-only, via service role (no RLS policy
--      grants this directly; the Edge Function's service-role client
--      bypasses RLS entirely, which is the established pattern for every
--      public lead-capture endpoint in this codebase).
--   2. Platform Administrators — full read/update access, to work leads
--      through their lifecycle. Gated by is_platform_admin(), the same
--      helper every other platform-scoped table's RLS already uses.
--   3. Tenants (org staff) — explicitly NO access, at any permission level.
--      There is no organization_id on this table for a tenant-scoped policy
--      to even key off of, and no policy grants org-scoped roles anything —
--      this is enforced by omission, the same way enrollment_requests
--      omits an INSERT policy for authenticated users.
-- =============================================================================

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

-- Defence in depth: even though no policy below grants anon anything, this
-- makes the "anonymous visitors cannot read/write directly" guarantee
-- explicit rather than implicit, matching the REVOKE pattern already used
-- on platform_admins and event_outbox.
REVOKE ALL ON TABLE public.demo_requests FROM anon;

-- Platform Administrators may view every demo request — there is no
-- narrower scope to apply (no organization_id, no "own requests only"
-- concept; any platform admin may work any lead).
CREATE POLICY "demo_requests_select_platform_admin"
  ON public.demo_requests FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- Platform Administrators may update lifecycle fields (status, assignment,
-- internal_notes, conversion linkage) as they work a lead. WITH CHECK
-- mirrors USING so a platform admin cannot use UPDATE to somehow move a row
-- into a state only visible to a different, non-platform-admin actor —
-- there isn't one, but the mirrored check is the standing convention for
-- every UPDATE policy elsewhere in this schema (see enrollment_requests).
CREATE POLICY "demo_requests_update_platform_admin"
  ON public.demo_requests FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- No INSERT policy for anon or authenticated: the only insert path is the
-- demo-requests Edge Function's service-role client, which bypasses RLS by
-- design. This is deliberate, not an oversight — matching
-- enrollment_requests' and worker_run_log's own "absence of a write policy
-- enforces service-role-only" pattern.
--
-- No DELETE policy for anyone, including platform admins: demo requests are
-- not hard-deleted through the application. This table does not carry
-- deleted_at (that whitelist — organizations, organization_locations,
-- profiles — is intentionally not extended here; see soft_delete()'s
-- comment in 20260527000002_phase1b2_hardening.sql), so if a lead ever
-- needs to be removed (e.g. GDPR erasure request), that is a manual
-- operator action, not an application code path — an appropriate level of
-- friction for personal-data records with no existing self-service delete
-- flow.

GRANT SELECT, UPDATE         ON public.demo_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.demo_requests TO service_role;
