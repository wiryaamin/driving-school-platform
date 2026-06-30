-- =============================================================================
-- MIGRATION: 20260702000009_m2_corporate_contact_customer_read.sql
-- Remediation: M2 — corporate_contact missing corporate:customer:read
--
-- Root cause:
--   Migration 20260613000100_corporate_customers.sql seeded corporate:customer:*
--   permissions and assigned them to org_owner, org_admin, org_manager,
--   receptionist, and instructor roles — but omitted corporate_contact.
--   Without corporate:customer:read, the Edge Function requirePerm() check at
--   GET /corporate-customers/:id returns 403 FORBIDDEN, preventing any user
--   with the corporate_contact role from loading the Corporate Customer detail
--   page.
--
-- Fix:
--   Grant corporate:customer:read (read-only) to corporate_contact.
--   No other permissions are added. Least-privilege principle is preserved:
--   - corporate_contact cannot create corporate customers
--   - corporate_contact cannot update corporate customers
--   - corporate_contact cannot delete/archive corporate customers
--   - corporate_contact retains existing contract read/write access
--     (corporate:contract:create/read/update/delete from foundation + M05)
--
-- Permission already exists in public.permissions (seeded in 20260613000100).
-- Only the role_permissions join row is missing.
--
-- Idempotent: ON CONFLICT DO NOTHING.
-- =============================================================================

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
       CROSS JOIN public.permissions p
WHERE  r.name          = 'corporate_contact'
  AND  r.is_system_role = true
  AND  p.code          = 'corporate:customer:read'
ON CONFLICT DO NOTHING;
