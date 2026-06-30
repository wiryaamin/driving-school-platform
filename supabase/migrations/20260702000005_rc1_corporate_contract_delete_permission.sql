-- rc1: RBAC fix — seed corporate:contract:delete permission and assign to roles.
--
-- QA finding: corporate-contracts Edge Function's handleArchive requires
-- 'corporate:contract:delete', but the foundation migration seeded
-- 'corporate:contract:approve' as the 4th contract permission instead.
-- This caused 403 FORBIDDEN for all non-platform-admin users on archive.
--
-- This migration is idempotent: all inserts use ON CONFLICT DO NOTHING.

-- 1. Seed the missing permission
INSERT INTO public.permissions (id, code, domain, resource, action, description)
VALUES (
  gen_random_uuid(),
  'corporate:contract:delete',
  'corporate',
  'contract',
  'delete',
  'Archive (soft-delete) corporate contracts'
)
ON CONFLICT (code) DO NOTHING;

-- 2. Grant to org_owner
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.name           = 'org_owner'
  AND  r.is_system_role = true
  AND  p.code           = 'corporate:contract:delete'
ON CONFLICT DO NOTHING;

-- 3. Grant to org_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.name           = 'org_admin'
  AND  r.is_system_role = true
  AND  p.code           = 'corporate:contract:delete'
ON CONFLICT DO NOTHING;

-- 4. Grant to corporate_contact
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.name           = 'corporate_contact'
  AND  r.is_system_role = true
  AND  p.code           = 'corporate:contract:delete'
ON CONFLICT DO NOTHING;
