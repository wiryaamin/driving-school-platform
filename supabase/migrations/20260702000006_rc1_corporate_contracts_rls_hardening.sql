-- rc1: H1 Security hardening — add RBAC enforcement to corporate_contracts RLS.
--
-- Security audit finding: corporate_contracts RLS policies had no has_permission()
-- checks, allowing any authenticated org member to read, insert, and update
-- contracts via direct SDK calls, bypassing Edge Function permission gates.
--
-- Drops the 3 permissive policies and recreates them with dual-layered checks:
-- tenant isolation (organization_id) + permission (has_permission), matching
-- the pattern established by corporate_customers. A platform admin SELECT bypass
-- policy is added consistent with corp_cust_select_platform.

DROP POLICY IF EXISTS "corporate_contracts_select" ON public.corporate_contracts;
DROP POLICY IF EXISTS "corporate_contracts_insert" ON public.corporate_contracts;
DROP POLICY IF EXISTS "corporate_contracts_update" ON public.corporate_contracts;

-- SELECT: tenant isolation + permission guard
CREATE POLICY "corporate_contracts_select"
  ON public.corporate_contracts FOR SELECT TO authenticated
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('corporate:contract:read')
  );

-- SELECT: platform admin bypass (consistent with corp_cust_select_platform)
CREATE POLICY "corporate_contracts_select_platform"
  ON public.corporate_contracts FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- INSERT: tenant isolation + permission guard
CREATE POLICY "corporate_contracts_insert"
  ON public.corporate_contracts FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('corporate:contract:create')
  );

-- UPDATE: tenant isolation + permission guard (soft-delete guard on USING only)
CREATE POLICY "corporate_contracts_update"
  ON public.corporate_contracts FOR UPDATE TO authenticated
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('corporate:contract:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('corporate:contract:update')
  );
