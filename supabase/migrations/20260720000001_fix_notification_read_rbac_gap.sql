-- =============================================================================
-- MIGRATION: 20260720000001_fix_notification_read_rbac_gap.sql
-- Description:
--   Sprint 4I operational validation (Pilot Validation Tenant, receptionist
--   login) found that the TopBar NotificationBell — rendered unconditionally
--   for every authenticated AppShell user, with no PermissionGate — returns
--   403 for any role other than org_owner / org_admin / org_manager.
--
--   Root cause: migration 20260619000007_seed_notifications_permissions.sql
--   granted notifications:notification:read only to the three
--   all-permission/manager roles and never extended it to the operational
--   staff roles that also use the AppShell (receptionist, instructor,
--   instructor_senior, finance_admin, student_admin, reporting_viewer,
--   corporate_contact — none of which have a dedicated portal layout).
--
--   Fix: grant notifications:notification:read to those roles so the bell
--   loads for every AppShell-based role. student / student_guardian are
--   intentionally excluded — they use StudentPortalLayout / GuardianPortal
--   layout, not AppShell/TopBar, and are unaffected by this defect.
-- =============================================================================

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN (
    'receptionist',
    'instructor',
    'instructor_senior',
    'finance_admin',
    'student_admin',
    'reporting_viewer',
    'corporate_contact'
  )
  AND r.is_system_role = true
  AND p.code = 'notifications:notification:read'
ON CONFLICT (role_id, permission_id) DO NOTHING;
