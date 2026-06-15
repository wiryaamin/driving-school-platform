-- =============================================================================
-- MIGRATION: 20260619000007_seed_notifications_permissions.sql
-- Description:
--   The notifications:read / write / preferences:manage permission codes were
--   referenced in phase3d RLS policies but were never inserted into the
--   public.permissions table.  This means NO role has them in role_permissions,
--   so every call to the notifications Edge Function returns 403.
--
--   Fix:
--   1. Insert the three missing notification permission codes.
--   2. Grant them to org_owner and org_admin (all-permission roles).
--   3. Grant notifications:read to org_manager (operational visibility).
-- =============================================================================

-- 1. Insert missing permissions (idempotent via DO block)
-- Codes follow the 3-segment format enforced by permissions_code_format constraint:
--   domain:resource:action  (^[a-z_]+:[a-z_]+:[a-z_]+$)
-- The notifications Edge Function is updated to check these same codes.
DO $$
BEGIN
  INSERT INTO public.permissions (id, code, domain, resource, action, description)
  VALUES
    (gen_random_uuid(), 'notifications:notification:read',    'notifications', 'notification', 'read',   'View notification history and delivery status'),
    (gen_random_uuid(), 'notifications:notification:create',  'notifications', 'notification', 'create', 'Create and cancel notifications'),
    (gen_random_uuid(), 'notifications:preferences:manage',   'notifications', 'preferences',  'manage', 'Manage notification preferences for profiles')
  ON CONFLICT (code) DO NOTHING;
END $$;

-- 2. Grant all three to org_owner (all-permission role)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'org_owner'
  AND r.is_system_role = true
  AND p.code IN ('notifications:notification:read', 'notifications:notification:create', 'notifications:preferences:manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Grant all three to org_admin (all-permission role)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'org_admin'
  AND r.is_system_role = true
  AND p.code IN ('notifications:notification:read', 'notifications:notification:create', 'notifications:preferences:manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Grant notifications:notification:read to org_manager (operational visibility)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'org_manager'
  AND r.is_system_role = true
  AND p.code = 'notifications:notification:read'
ON CONFLICT (role_id, permission_id) DO NOTHING;
