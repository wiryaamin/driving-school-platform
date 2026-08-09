-- =============================================================================
-- MIGRATION: 20260720000008_grant_receptionist_slot_create.sql
-- Description:
--   Sprint 4I operational validation (Pilot Validation Tenant, receptionist
--   login) found the "+ Nytt pass" button on Bokningsschema — visible and
--   clickable for receptionist, not hidden behind any PermissionGate —
--   returns 403 on submit because POST /slots requires
--   scheduling:slot:create, which receptionist doesn't have (only
--   org_owner/org_admin/org_manager/instructor/instructor_senior do).
--
--   Receptionist is the documented role for day-to-day operational
--   workflows including bookings/scheduling (CLAUDE.md, PILOT_VALIDATION_
--   TENANT.md), and scheduling an instructor's availability slot is a
--   prerequisite for taking any booking at all — without this permission,
--   receptionist can see the "create slot" affordance but can never
--   successfully use it.
--
--   Fix: grant scheduling:slot:create to receptionist.
-- =============================================================================

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'receptionist'
  AND r.is_system_role = true
  AND p.code = 'scheduling:slot:create'
ON CONFLICT (role_id, permission_id) DO NOTHING;
