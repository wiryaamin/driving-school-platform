-- =============================================================================
-- MIGRATION: 20260720000003_grant_receptionist_instructor_read.sql
-- Description:
--   Sprint 4I operational validation (Pilot Validation Tenant, receptionist
--   login) found GET /instructors returns 403 on the student detail page.
--   Receptionist is the role responsible for day-to-day scheduling
--   (CLAUDE.md: "day-to-day operational workflows — students, bookings,
--   packages, invoices"), which requires assigning an instructor to a
--   booking. Without this permission, receptionist cannot see the
--   instructor list at all, blocking that workflow entirely.
--
--   Fix: grant instructors:instructor:read to the receptionist role,
--   matching org_manager/instructor/instructor_senior which already have it.
-- =============================================================================

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'receptionist'
  AND r.is_system_role = true
  AND p.code = 'instructors:instructor:read'
ON CONFLICT (role_id, permission_id) DO NOTHING;
