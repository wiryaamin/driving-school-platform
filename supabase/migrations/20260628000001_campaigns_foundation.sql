-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260628000001_campaigns_foundation.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     Campaign Management — Foundation
--
-- Creates:
--   campaigns               — org-scoped campaign definitions
--   campaign_package_links  — many-to-many campaigns ↔ package_offerings
--   campaign_coupon_codes   — campaign-specific coupon codes
--   campaign_applications   — append-only application audit log
--
-- Permissions: finance:campaign:read/create/update/archive
-- ════════════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE public.campaign_type AS ENUM (
  'percentage_discount',
  'fixed_discount',
  'bonus_lessons',
  'free_risk1',
  'free_risk2',
  'seasonal',
  'promotional_pricing'
);

CREATE TYPE public.campaign_status AS ENUM (
  'draft',
  'scheduled',
  'active',
  'paused',
  'expired',
  'archived'
);

-- ── campaigns ─────────────────────────────────────────────────────────────────

CREATE TABLE public.campaigns (
  id                   uuid                    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid                    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                 text                    NOT NULL,
  description          text,
  campaign_type        public.campaign_type    NOT NULL,
  status               public.campaign_status  NOT NULL DEFAULT 'draft',
  visibility           text                    NOT NULL DEFAULT 'internal'
                       CONSTRAINT chk_campaign_visibility
                       CHECK (visibility IN ('public', 'website', 'student_portal', 'internal')),
  priority             int                     NOT NULL DEFAULT 0,
  -- Discount fields (used by percentage_discount, fixed_discount, promotional_pricing)
  discount_value       numeric(10,4)           CHECK (discount_value IS NULL OR discount_value > 0),
  discount_is_pct      boolean,
  max_discount_amount  numeric(12,2)           CHECK (max_discount_amount IS NULL OR max_discount_amount > 0),
  -- Bonus fields (used by bonus_lessons)
  bonus_lessons        int                     CHECK (bonus_lessons IS NULL OR bonus_lessons > 0),
  -- Schedule
  starts_at            timestamptz,
  ends_at              timestamptz,
  -- Meta
  internal_notes       text,
  metadata             jsonb                   NOT NULL DEFAULT '{}',
  created_at           timestamptz             NOT NULL DEFAULT now(),
  updated_at           timestamptz             NOT NULL DEFAULT now(),
  created_by           uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at          timestamptz,
  archived_by          uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT chk_campaign_dates CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at
  )
);

CREATE TRIGGER set_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── campaign_package_links ────────────────────────────────────────────────────
-- Many-to-many: one campaign → many offerings, one offering → many campaigns

CREATE TABLE public.campaign_package_links (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id     uuid        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  offering_id     uuid        NOT NULL REFERENCES public.package_offerings(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_campaign_package_link UNIQUE (campaign_id, offering_id)
);

-- ── campaign_coupon_codes ─────────────────────────────────────────────────────

CREATE TABLE public.campaign_coupon_codes (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id       uuid        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  code              text        NOT NULL,
  max_redemptions   int         CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemptions_count int         NOT NULL DEFAULT 0 CHECK (redemptions_count >= 0),
  valid_from        date,
  valid_to          date,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT uq_campaign_coupon_code UNIQUE (organization_id, code),
  CONSTRAINT chk_coupon_dates CHECK (
    valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from
  )
);

-- ── campaign_applications ─────────────────────────────────────────────────────
-- Append-only — never modified after creation

CREATE TABLE public.campaign_applications (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  campaign_id     uuid        NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  coupon_id       uuid        REFERENCES public.campaign_coupon_codes(id),
  student_id      uuid        REFERENCES public.students(id) ON DELETE RESTRICT,
  invoice_id      uuid        REFERENCES public.invoices(id) ON DELETE RESTRICT,
  applied_at      timestamptz NOT NULL DEFAULT now(),
  applied_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ── Audit triggers ────────────────────────────────────────────────────────────

CREATE TRIGGER campaigns_audit
  AFTER INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.campaigns              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_package_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_coupon_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_applications  ENABLE ROW LEVEL SECURITY;

-- campaigns
CREATE POLICY "campaigns_select" ON public.campaigns
  FOR SELECT USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:read')
  );

CREATE POLICY "campaigns_insert" ON public.campaigns
  FOR INSERT WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:create')
  );

CREATE POLICY "campaigns_update" ON public.campaigns
  FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:update')
  );

-- campaign_package_links
CREATE POLICY "campaign_links_select" ON public.campaign_package_links
  FOR SELECT USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:read')
  );

CREATE POLICY "campaign_links_insert" ON public.campaign_package_links
  FOR INSERT WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:update')
  );

CREATE POLICY "campaign_links_delete" ON public.campaign_package_links
  FOR DELETE USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:update')
  );

-- campaign_coupon_codes
CREATE POLICY "campaign_coupons_select" ON public.campaign_coupon_codes
  FOR SELECT USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:read')
  );

CREATE POLICY "campaign_coupons_insert" ON public.campaign_coupon_codes
  FOR INSERT WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:update')
  );

-- campaign_applications: read via permission; inserts via service_role only
CREATE POLICY "campaign_applications_select" ON public.campaign_applications
  FOR SELECT USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:read')
  );

-- ── Table grants ──────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.campaigns              TO authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON public.campaign_package_links TO authenticated, service_role;
GRANT SELECT, INSERT         ON public.campaign_coupon_codes  TO authenticated, service_role;
GRANT SELECT                 ON public.campaign_applications  TO authenticated;
GRANT SELECT, INSERT         ON public.campaign_applications  TO service_role;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_campaigns_org_status
  ON public.campaigns (organization_id, status);

CREATE INDEX idx_campaigns_org_type
  ON public.campaigns (organization_id, campaign_type);

CREATE INDEX idx_campaigns_schedule
  ON public.campaigns (organization_id, starts_at, ends_at)
  WHERE status IN ('scheduled', 'active');

CREATE INDEX idx_campaign_package_links_campaign
  ON public.campaign_package_links (campaign_id);

CREATE INDEX idx_campaign_package_links_offering
  ON public.campaign_package_links (offering_id);

CREATE INDEX idx_campaign_coupon_codes_campaign
  ON public.campaign_coupon_codes (campaign_id);

-- ── Permissions ───────────────────────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'finance:campaign:create',  'finance', 'campaign', 'create',  'Create and manage campaigns'),
  (gen_random_uuid(), 'finance:campaign:read',    'finance', 'campaign', 'read',    'View campaigns and linked packages'),
  (gen_random_uuid(), 'finance:campaign:update',  'finance', 'campaign', 'update',  'Edit campaigns, link packages, change status'),
  (gen_random_uuid(), 'finance:campaign:archive', 'finance', 'campaign', 'archive', 'Archive campaigns')
ON CONFLICT (code) DO NOTHING;

-- ── Role assignments ──────────────────────────────────────────────────────────

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name = 'org_owner' AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:campaign:create','finance:campaign:read',
    'finance:campaign:update','finance:campaign:archive'
  ])
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name = 'org_admin' AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:campaign:create','finance:campaign:read',
    'finance:campaign:update','finance:campaign:archive'
  ])
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name = 'finance_admin' AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:campaign:create','finance:campaign:read',
    'finance:campaign:update','finance:campaign:archive'
  ])
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r CROSS JOIN public.permissions p
WHERE  r.name = 'org_manager' AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:campaign:read','finance:campaign:update'
  ])
ON CONFLICT DO NOTHING;
