-- =============================================================================
-- MIGRATION: 20260720000004_grant_receptionist_package_create.sql
-- Description:
--   Sprint 4I operational validation (Pilot Validation Tenant, receptionist
--   login) found the "Sälj paket" (sell package) button never renders for
--   receptionist — it's gated behind finance:package:create, which
--   receptionist doesn't have (only finance:package:read). Receptionist is
--   the documented role for day-to-day package sales (CLAUDE.md /
--   PILOT_VALIDATION_TENANT.md: "day-to-day operational workflows —
--   students, bookings, packages, invoices").
--
--   Companion defect (fixed in the same commit as this migration, in
--   supabase/functions/student-packages/index.ts): the POST purchase
--   handler was authorizing this money-moving action against
--   finance:package:read instead of finance:package:create, meaning any
--   read-only role could call the endpoint directly regardless of what the
--   UI showed. That handler now checks finance:package:create, matching
--   the frontend's PermissionGate — so this grant is required for the
--   receptionist workflow to function end-to-end, not just for the button
--   to appear.
--
--   Fix: grant finance:package:create to receptionist.
-- =============================================================================

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'receptionist'
  AND r.is_system_role = true
  AND p.code = 'finance:package:create'
ON CONFLICT (role_id, permission_id) DO NOTHING;
