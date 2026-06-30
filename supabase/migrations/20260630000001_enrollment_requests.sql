-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260630000001_enrollment_requests.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     Online Checkout & Enrollment — Sprint 1 (Lead-Based)
--
-- Creates:
--   enrollment_requests — public lead submissions from the Package Catalog
--
-- Flow:
--   Public visitor → submits form → enrollment_requests row (submitted)
--   Operator: approve / reject / convert → student
--
-- Permissions: enrollment:request:read / update / convert
-- ════════════════════════════════════════════════════════════════════════════

-- ── Status enum ───────────────────────────────────────────────────────────────

CREATE TYPE public.enrollment_status AS ENUM (
  'submitted',      -- Form submitted; awaiting operator review
  'pending_review', -- Operator has opened and is reviewing
  'approved',       -- Operator approved; ready to convert
  'rejected',       -- Operator rejected
  'converted'       -- Converted to a student record
);

-- ── enrollment_requests ───────────────────────────────────────────────────────

CREATE TABLE public.enrollment_requests (
  id                   uuid                       NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid                       NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status               public.enrollment_status   NOT NULL DEFAULT 'submitted',

  -- ── Package selection (snapshots at submission time) ─────────────────────
  package_offering_id  uuid                       NOT NULL REFERENCES public.package_offerings(id),
  package_name         text                       NOT NULL,
  package_code         text,
  lesson_category      text                       NOT NULL,
  package_quantity     int                        NOT NULL,

  -- ── Campaign reference (if active campaign was applied) ──────────────────
  campaign_id          uuid                       REFERENCES public.campaigns(id),
  campaign_name        text,

  -- ── Coupon reference (if coupon code was applied) ────────────────────────
  coupon_id            uuid                       REFERENCES public.campaign_coupon_codes(id),
  coupon_code          text,

  -- ── Price snapshot (immutable after submission) ───────────────────────────
  base_price           numeric(12,2)              NOT NULL CHECK (base_price >= 0),
  vat_rate             numeric(5,4)               NOT NULL CHECK (vat_rate >= 0),
  base_price_incl_vat  numeric(12,2)              NOT NULL CHECK (base_price_incl_vat >= 0),
  campaign_discount    numeric(12,2)              NOT NULL DEFAULT 0 CHECK (campaign_discount >= 0),
  coupon_discount      numeric(12,2)              NOT NULL DEFAULT 0 CHECK (coupon_discount >= 0),
  final_price          numeric(12,2)              NOT NULL CHECK (final_price >= 0),
  final_price_incl_vat numeric(12,2)              NOT NULL CHECK (final_price_incl_vat >= 0),
  currency             text                       NOT NULL DEFAULT 'SEK',

  -- ── Customer details ─────────────────────────────────────────────────────
  first_name           text                       NOT NULL,
  last_name            text                       NOT NULL,
  email                text                       NOT NULL,
  phone                text                       NOT NULL,
  personnummer         text,   -- optional; plaintext at lead stage (not a student yet)
  address              text,
  preferred_language   text                       NOT NULL DEFAULT 'sv',
  license_category     text                       NOT NULL DEFAULT 'B',
  comments             text,

  -- ── Conversion tracking ──────────────────────────────────────────────────
  student_id           uuid                       REFERENCES public.students(id),

  -- ── Operator workflow ────────────────────────────────────────────────────
  internal_notes       text,
  rejected_reason      text,
  reviewed_at          timestamptz,
  reviewed_by          uuid                       REFERENCES auth.users(id),
  converted_at         timestamptz,
  converted_by         uuid                       REFERENCES auth.users(id),

  -- ── Audit ────────────────────────────────────────────────────────────────
  submitted_at         timestamptz                NOT NULL DEFAULT now(),
  created_at           timestamptz                NOT NULL DEFAULT now(),
  updated_at           timestamptz                NOT NULL DEFAULT now(),

  -- ── Rate limiting support (stored for fraud prevention, never exposed) ───
  submitter_ip         text,

  -- ── Constraints ──────────────────────────────────────────────────────────
  CONSTRAINT chk_enrollment_converted CHECK (
    (status = 'converted' AND student_id IS NOT NULL) OR status <> 'converted'
  ),
  CONSTRAINT chk_enrollment_rejected CHECK (
    (status = 'rejected' AND rejected_reason IS NOT NULL) OR status <> 'rejected'
  )
);

CREATE TRIGGER set_enrollment_requests_updated_at
  BEFORE UPDATE ON public.enrollment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.enrollment_requests ENABLE ROW LEVEL SECURITY;

-- Operators read their org's enrollments
CREATE POLICY "enrollment_requests_select" ON public.enrollment_requests
  FOR SELECT USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('enrollment:request:read')
  );

-- Operators update (approve/reject/notes) their org's enrollments
CREATE POLICY "enrollment_requests_update" ON public.enrollment_requests
  FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('enrollment:request:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('enrollment:request:update')
  );

-- Inserts and conversion updates via service_role only (public-enrollment Edge Function)
-- No INSERT policy for authenticated users — public submissions bypass RLS via service role

-- ── Table grants ──────────────────────────────────────────────────────────────

GRANT SELECT, UPDATE    ON public.enrollment_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.enrollment_requests TO service_role;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_enrollment_requests_org_status
  ON public.enrollment_requests (organization_id, status);

CREATE INDEX idx_enrollment_requests_org_submitted
  ON public.enrollment_requests (organization_id, submitted_at DESC);

CREATE INDEX idx_enrollment_requests_email
  ON public.enrollment_requests (organization_id, lower(email));

CREATE INDEX idx_enrollment_requests_package
  ON public.enrollment_requests (organization_id, package_offering_id);

CREATE INDEX idx_enrollment_requests_student
  ON public.enrollment_requests (student_id)
  WHERE student_id IS NOT NULL;

-- Rate limiting support: recent submissions by email (used by public-enrollment function)
CREATE INDEX idx_enrollment_requests_rate_limit
  ON public.enrollment_requests (organization_id, lower(email), submitted_at DESC);

-- ── Permissions ───────────────────────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'enrollment:request:read',    'enrollment', 'request', 'read',    'View enrollment requests from the public catalog'),
  (gen_random_uuid(), 'enrollment:request:update',  'enrollment', 'request', 'update',  'Approve, reject, and annotate enrollment requests'),
  (gen_random_uuid(), 'enrollment:request:convert', 'enrollment', 'request', 'convert', 'Convert an approved enrollment request to a student')
ON CONFLICT (code) DO NOTHING;

-- ── Helper: atomic coupon redemption increment ───────────────────────────────
-- Called by public-enrollment Edge Function (service role) after enrollment insert.
-- SECURITY DEFINER so it can write to campaign_coupon_codes regardless of RLS.

CREATE OR REPLACE FUNCTION public.increment_coupon_redemptions(p_coupon_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.campaign_coupon_codes
     SET redemptions_count = redemptions_count + 1
   WHERE id = p_coupon_id;
$$;

REVOKE ALL ON FUNCTION public.increment_coupon_redemptions(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_coupon_redemptions(uuid) TO service_role;

-- ── Role assignments ──────────────────────────────────────────────────────────

-- org_owner and org_admin get all three permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin') AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'enrollment:request:read',
    'enrollment:request:update',
    'enrollment:request:convert'
  ])
ON CONFLICT DO NOTHING;

-- org_manager gets read + update (no convert)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name = 'org_manager' AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'enrollment:request:read',
    'enrollment:request:update'
  ])
ON CONFLICT DO NOTHING;

-- finance_admin gets read-only
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name = 'finance_admin' AND r.is_system_role = true
  AND  p.code = 'enrollment:request:read'
ON CONFLICT DO NOTHING;
