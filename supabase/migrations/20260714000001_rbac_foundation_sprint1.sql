-- =============================================================================
-- MIGRATION: 20260714000001_rbac_foundation_sprint1.sql
-- RBAC Stabilization — Sprint 1 (RBAC Foundation)
--
-- Scope: the 10 permissions identified by the RBAC Integrity Audit as having
-- a broken frontend-catalog <-> database <-> role-mapping chain, where the
-- enforcing PermissionGate/PermissionGate-equivalent already exists in
-- shipped code (SIE4ExportsPage.tsx, InvoiceDetailPage.tsx,
-- MomsperioderPage.tsx, SwedishSettingsPage.tsx, FortnoxPage.tsx). No
-- frontend code changes accompany this migration — this closes the DB/role
-- side of the chain only, per the approved RBAC Execution Plan Phase 1.
--
-- Grant tiers mirror the already-correct sibling permissions in the same
-- Bokforing/Finance-settings family:
--   :read   actions -> org_owner, org_admin, finance_admin, org_manager
--           (matches finance:ledger:read, finance:reconciliation:read,
--           finance:close:read)
--   :manage / :run / :approve actions -> org_owner, org_admin, finance_admin
--           (matches finance:ledger:manage, finance:reconciliation:manage,
--           finance:close:manage, finance:invoice:void)
--
-- Idempotent: all inserts use ON CONFLICT DO NOTHING.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Unit 1 — SIE4 export (finance:sie_export:read, finance:sie_export:run)
-- Root cause: declared in apps/web/src/core/rbac/permissions.ts and consumed
-- by SIE4ExportsPage.tsx, but never seeded into public.permissions at all.
-- Naming note: the resource segment is "sie_export", not "sie4" — the
-- permissions_code_format constraint (^[a-z_]+:[a-z_]+:[a-z_]+$) forbids
-- digits, so the code cannot literally spell "sie4"; only SIE4 is
-- implemented in this codebase, so "sie_export" is unambiguous.
-- -----------------------------------------------------------------------------

INSERT INTO public.permissions (id, code, domain, resource, action, description)
VALUES (
  gen_random_uuid(),
  'finance:sie_export:read',
  'finance',
  'sie_export',
  'read',
  'View SIE4 export files and their generation status'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions (id, code, domain, resource, action, description)
VALUES (
  gen_random_uuid(),
  'finance:sie_export:run',
  'finance',
  'sie_export',
  'run',
  'Generate and export SIE4 accounting files'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.is_system_role = true
  AND  r.name IN ('org_owner', 'org_admin', 'finance_admin', 'org_manager')
  AND  p.code = 'finance:sie_export:read'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.is_system_role = true
  AND  r.name IN ('org_owner', 'org_admin', 'finance_admin')
  AND  p.code = 'finance:sie_export:run'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Unit 2 — Invoice approval (finance:invoice:approve)
-- Root cause: declared and consumed by InvoiceDetailPage.tsx's "Godkann"
-- action, but never seeded into public.permissions.
-- -----------------------------------------------------------------------------

INSERT INTO public.permissions (id, code, domain, resource, action, description)
VALUES (
  gen_random_uuid(),
  'finance:invoice:approve',
  'finance',
  'invoice',
  'approve',
  'Approve invoices pending review before finalization'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.is_system_role = true
  AND  r.name IN ('org_owner', 'org_admin', 'finance_admin')
  AND  p.code = 'finance:invoice:approve'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Unit 3 — VAT periods (finance:vat:read, finance:vat:manage)
-- Root cause: permissions already seeded (Phase 4C), but never granted to
-- any role. Consumed by MomsperioderPage.tsx.
-- -----------------------------------------------------------------------------

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.is_system_role = true
  AND  r.name IN ('org_owner', 'org_admin', 'finance_admin', 'org_manager')
  AND  p.code = 'finance:vat:read'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.is_system_role = true
  AND  r.name IN ('org_owner', 'org_admin', 'finance_admin')
  AND  p.code = 'finance:vat:manage'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Unit 4 — BAS accounts (finance:bas:read, finance:bas:manage)
-- Root cause: same as Unit 3 — seeded, never granted. Consumed by
-- SwedishSettingsPage.tsx.
-- -----------------------------------------------------------------------------

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.is_system_role = true
  AND  r.name IN ('org_owner', 'org_admin', 'finance_admin', 'org_manager')
  AND  p.code = 'finance:bas:read'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.is_system_role = true
  AND  r.name IN ('org_owner', 'org_admin', 'finance_admin')
  AND  p.code = 'finance:bas:manage'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Unit 5 — Finance settings (finance:settings:read, finance:settings:manage)
-- Root cause: same as Unit 3 — seeded, never granted. Consumed by
-- SwedishSettingsPage.tsx.
-- -----------------------------------------------------------------------------

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.is_system_role = true
  AND  r.name IN ('org_owner', 'org_admin', 'finance_admin', 'org_manager')
  AND  p.code = 'finance:settings:read'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.is_system_role = true
  AND  r.name IN ('org_owner', 'org_admin', 'finance_admin')
  AND  p.code = 'finance:settings:manage'
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Unit 6 — Fortnox sync (finance:fortnox:manage)
-- Root cause: same as Unit 3 — seeded, never granted. Consumed by
-- FortnoxPage.tsx.
-- -----------------------------------------------------------------------------

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.is_system_role = true
  AND  r.name IN ('org_owner', 'org_admin', 'finance_admin')
  AND  p.code = 'finance:fortnox:manage'
ON CONFLICT DO NOTHING;
