-- =============================================================================
-- MIGRATION: 20260613000100_corporate_customers.sql
-- Platform:  Trafikskolan SaaS
-- Phase:     UI-6 — Företagskunder (Corporate Customers)
-- Description:
--   Introduces the corporate_customers table for B2B accounts, with full RLS,
--   soft-delete, audit triggers, and permission seeding for all tenant roles.
-- =============================================================================

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE public.corporate_customers (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  -- Company identity
  org_number           TEXT,                             -- Swedish org nr: 556xxx-xxxx
  company_name         TEXT        NOT NULL,

  -- Address
  address_line1        TEXT,
  address_line2        TEXT,
  postal_code          TEXT,
  city                 TEXT,

  -- Contact reference (referensperson)
  contact_first_name   TEXT,
  contact_last_name    TEXT,
  contact_email        TEXT,
  contact_phone        TEXT,

  -- Billing
  invoice_text         TEXT,
  notes                TEXT,

  -- Lifecycle
  status               TEXT        NOT NULL DEFAULT 'active'
                         CONSTRAINT corp_cust_status_check
                         CHECK (status IN ('active', 'paused', 'archived')),

  -- Audit
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,
  created_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Auto-update updated_at
CREATE TRIGGER corp_cust_updated_at
  BEFORE UPDATE ON public.corporate_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.corporate_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corp_cust_select_staff"
  ON public.corporate_customers FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('corporate:customer:read')
  );

CREATE POLICY "corp_cust_select_platform"
  ON public.corporate_customers FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "corp_cust_insert"
  ON public.corporate_customers FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('corporate:customer:create')
  );

CREATE POLICY "corp_cust_update"
  ON public.corporate_customers FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('corporate:customer:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('corporate:customer:update')
  );

CREATE POLICY "corp_cust_delete"
  ON public.corporate_customers FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('corporate:customer:delete')
  );

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_corp_cust_org_status
  ON public.corporate_customers (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_corp_cust_company_name
  ON public.corporate_customers (organization_id, lower(company_name))
  WHERE deleted_at IS NULL;

CREATE INDEX idx_corp_cust_org_number
  ON public.corporate_customers (organization_id, org_number)
  WHERE deleted_at IS NULL AND org_number IS NOT NULL;

-- ─── Permissions ─────────────────────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description)
VALUES
  (gen_random_uuid(), 'corporate:customer:read',   'corporate', 'customer', 'read',   'View corporate customer profiles'),
  (gen_random_uuid(), 'corporate:customer:create', 'corporate', 'customer', 'create', 'Create corporate customers'),
  (gen_random_uuid(), 'corporate:customer:update', 'corporate', 'customer', 'update', 'Edit corporate customer details'),
  (gen_random_uuid(), 'corporate:customer:delete', 'corporate', 'customer', 'delete', 'Archive corporate customers')
ON CONFLICT (code) DO NOTHING;

-- Assign to roles: owner, admin, manager get full access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('org_owner', 'org_admin', 'org_manager') AND r.is_system_role = true
  AND p.code IN (
    'corporate:customer:read',
    'corporate:customer:create',
    'corporate:customer:update',
    'corporate:customer:delete'
  )
ON CONFLICT DO NOTHING;

-- Receptionist: read + create + update (no delete)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'receptionist' AND r.is_system_role = true
  AND p.code IN (
    'corporate:customer:read',
    'corporate:customer:create',
    'corporate:customer:update'
  )
ON CONFLICT DO NOTHING;

-- Instructor: read only
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('instructor', 'instructor_senior') AND r.is_system_role = true
  AND p.code = 'corporate:customer:read'
ON CONFLICT DO NOTHING;
