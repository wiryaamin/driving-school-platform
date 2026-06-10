-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260617000003_permission_catalog_alignment.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     A-8 — Permission Catalog Drift Remediation
--
-- PROBLEM:
--   7 permission constants defined in apps/web/src/core/rbac/permissions.ts
--   had no corresponding row in the public.permissions table. Any PermissionGate
--   or ProtectedRoute using these constants silently denied access to all users
--   (including org_owner and org_admin) because the JWT permissions array is built
--   from DB rows — absent rows are never included in the JWT.
--
-- PERMISSIONS ADDED:
--   students:progress:read      — view student training progress and permit stages
--   students:progress:update    — update student training progress records
--   students:pii:read           — view sensitive student PII (personnummer, address)
--   reporting:financial:export  — export financial reports (SIE4, CSV, accounting data)
--   administration:location:manage  — combined location create/update/delete action
--   administration:subscription:read    — view org subscription tier and limits
--   administration:subscription:manage  — change org subscription or add-ons
--
-- ROLE ASSIGNMENTS:
--   org_owner / org_admin  — all 7
--   org_manager            — progress:read, pii:read, subscription:read
--   student_admin          — progress:read, progress:update, pii:read
--   instructor_senior      — progress:read, progress:update
--   instructor             — progress:read, progress:update
--   finance_admin          — reporting:financial:export
--   reporting_viewer       — reporting:financial:export
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Insert missing permissions ─────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'students:progress:read',           'students',       'progress',     'read',   'View student training progress, permit lifecycle, and lesson history'),
  (gen_random_uuid(), 'students:progress:update',         'students',       'progress',     'update', 'Update student training progress records and permit stages'),
  (gen_random_uuid(), 'students:pii:read',                'students',       'pii',          'read',   'View sensitive student PII: personnummer, home address, contact details'),
  (gen_random_uuid(), 'reporting:financial:export',       'reporting',      'financial',    'export', 'Export financial reports to SIE4, CSV, or accounting system formats'),
  (gen_random_uuid(), 'administration:location:manage',   'administration', 'location',     'manage', 'Create, edit, and deactivate locations (combined manage action)'),
  (gen_random_uuid(), 'administration:subscription:read', 'administration', 'subscription', 'read',   'View organization subscription tier, feature flags, and usage limits'),
  (gen_random_uuid(), 'administration:subscription:manage','administration','subscription', 'manage', 'Change subscription tier, manage add-ons and billing seat counts')
ON CONFLICT (code) DO NOTHING;

-- ── 2. Assign to org_owner and org_admin (full access) ────────────────────────

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin')
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'students:progress:read',
    'students:progress:update',
    'students:pii:read',
    'reporting:financial:export',
    'administration:location:manage',
    'administration:subscription:read',
    'administration:subscription:manage'
  ])
ON CONFLICT DO NOTHING;

-- ── 3. Assign to org_manager (visibility into students + location + subscription) ──

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_manager'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'students:progress:read',
    'students:pii:read',
    'administration:location:manage',
    'administration:subscription:read'
  ])
ON CONFLICT DO NOTHING;

-- ── 4. Assign to student_admin (full student lifecycle) ───────────────────────

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'student_admin'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'students:progress:read',
    'students:progress:update',
    'students:pii:read'
  ])
ON CONFLICT DO NOTHING;

-- ── 5. Assign to instructors (track training progress of own students) ────────

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name IN ('instructor', 'instructor_senior')
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'students:progress:read',
    'students:progress:update'
  ])
ON CONFLICT DO NOTHING;

-- ── 6. Assign reporting:financial:export to finance and reporting roles ────────

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name IN ('finance_admin', 'reporting_viewer')
  AND  r.is_system_role = true
  AND  p.code = 'reporting:financial:export'
ON CONFLICT DO NOTHING;
