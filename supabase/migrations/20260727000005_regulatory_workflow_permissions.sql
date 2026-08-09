-- =============================================================================
-- Regulatory Workflow Tracker — permission seeding
--
-- 20260727000003 created the regulatory_workflows/regulatory_workflow_documents
-- tables and their RLS policies referencing 'regulatory:workflow:*' permission
-- codes — but, as with every domain on this platform, RLS's has_permission()
-- only evaluates true if the code actually exists in public.permissions and
-- is granted to a role via public.role_permissions. Without this migration,
-- no role — including org_owner — would actually have these permissions,
-- and every insert/update would be silently rejected by RLS. Mirrors the
-- exact seeding pattern already established for vehicles:vehicle:* in
-- 20260528000001_phase2a_domain_foundation.sql.
-- =============================================================================

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'regulatory:workflow:create', 'regulatory', 'workflow', 'create', 'Create a tracked regulatory workflow item (Transportstyrelsen/Trafikverket)'),
  (gen_random_uuid(), 'regulatory:workflow:read',   'regulatory', 'workflow', 'read',   'View tracked regulatory workflow items'),
  (gen_random_uuid(), 'regulatory:workflow:update', 'regulatory', 'workflow', 'update', 'Update status, confirmation number, notes, or documents on a regulatory workflow item'),
  (gen_random_uuid(), 'regulatory:workflow:delete', 'regulatory', 'workflow', 'delete', 'Remove a tracked regulatory workflow item');

-- org_owner and org_admin: all regulatory workflow permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('org_owner', 'org_admin') AND r.is_system_role = true
  AND p.domain = 'regulatory';

-- org_manager: all except delete
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'org_manager' AND r.is_system_role = true
  AND p.code = ANY(ARRAY[
    'regulatory:workflow:create', 'regulatory:workflow:read', 'regulatory:workflow:update'
  ]);

-- instructor, instructor_senior, receptionist: read-only (awareness)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('instructor', 'instructor_senior', 'receptionist') AND r.is_system_role = true
  AND p.code = 'regulatory:workflow:read';
