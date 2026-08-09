-- =============================================================================
-- MIGRATION: 20260720000002_fix_instructor_read_rbac_gap.sql
-- Description:
--   Sprint 4I operational validation (Pilot Validation Tenant, instructor
--   login) found the dashboard's "Lärarstatus" widget always renders
--   "Inga instruktörer registrerade" (no instructors registered) for the
--   plain instructor role, even when instructors exist — because
--   GET /instructors returns 403 for that role.
--
--   Root cause: instructors:instructor:read is granted to org_owner,
--   org_admin, org_manager, and instructor_senior, but was never extended
--   to the plain instructor role, even though the instructor dashboard
--   calls this endpoint unconditionally to populate that widget.
--
--   Fix: grant instructors:instructor:read to the instructor role.
-- =============================================================================

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'instructor'
  AND r.is_system_role = true
  AND p.code = 'instructors:instructor:read'
ON CONFLICT (role_id, permission_id) DO NOTHING;
