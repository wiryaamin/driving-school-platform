-- The instructor system role had no scheduling:slot:read/update permissions
-- — instructors reach the app mostly through instructor-app's own token/
-- session-scoped views, not the standard RBAC-gated settings surface. That
-- meant nobody except an admin/owner could adjust a lesson type's duration,
-- even though instructors are the ones who actually know how long a given
-- licence category's lessons run in practice.
--
-- Granting read+update (not create/delete) lets instructors reach the
-- existing Lektionstyper settings page and edit an existing lesson type —
-- deliberately not the ability to create or delete lesson types, which
-- stays admin/owner-only. Same lesson_types_update RLS policy every other
-- role already relies on (scheduling:slot:update) — no new policy, no new
-- permission code. Mirrors 20260720000008_grant_receptionist_slot_create.sql's
-- exact shape.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'instructor'
  AND r.is_system_role = true
  AND p.code IN ('scheduling:slot:read', 'scheduling:slot:update')
ON CONFLICT (role_id, permission_id) DO NOTHING;
