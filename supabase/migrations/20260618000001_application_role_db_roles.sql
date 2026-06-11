-- =============================================================================
-- Migration: 20260618000001_application_role_db_roles.sql
-- Phase: Auth Session Continuity — PostgreSQL Role Registration
-- =============================================================================
--
-- PROBLEM:
--   PostgREST reads the JWT `role` claim and executes SET LOCAL ROLE <value>.
--   get_user_jwt_claims() returns the application role name (e.g. 'org_owner')
--   as the JWT `role` claim. PostgREST then attempts:
--
--     SET LOCAL ROLE "org_owner"
--
--   This fails with ERROR: role "org_owner" does not exist, and PostgREST
--   returns 401 Unauthorized. The application role names existed only as rows
--   in public.roles — not as PostgreSQL database roles.
--
-- FIX:
--   Create a PostgreSQL database role for every application role name in
--   public.roles (system roles only — organisation-specific custom roles are
--   excluded as they don't appear in JWT claims):
--
--   1. CREATE ROLE <name>  — so PostgREST's SET ROLE succeeds.
--   2. GRANT authenticated TO <name>  — so all RLS policies using
--      TO authenticated continue to apply when the session role is an app role.
--      (pg_has_role(current_user, 'authenticated', 'usage') = true for the role.)
--   3. GRANT <name> TO authenticator  — so PostgREST's connection role
--      (authenticator) is allowed to SET ROLE to each app role.
--
-- PRESERVED:
--   - JWT structure unchanged
--   - auth hook unchanged
--   - get_user_jwt_claims() unchanged
--   - All RLS policies unchanged
--   - auth_user_role() / is_org_admin() / is_platform_admin() unchanged
--   - No permissions granted directly to application roles
--
-- SAFE TO RE-RUN:
--   All CREATE ROLE and GRANT statements are guarded by IF NOT EXISTS / DO NOTHING
--   equivalent checks.
-- =============================================================================

DO $$
DECLARE
  v_role_name  text;
  v_role_names text[] := ARRAY[
    -- Platform roles (match public.roles + platform_admins CHECK constraint)
    'platform_superadmin',
    'platform_support',
    'platform_billing',
    -- Organization roles (match public.roles system roles)
    'org_owner',
    'org_admin',
    'org_manager',
    'instructor_senior',
    'instructor',
    'receptionist',
    'finance_admin',
    'student_admin',
    'reporting_viewer',
    'corporate_contact',
    'student',
    'student_guardian'
  ];
BEGIN
  FOREACH v_role_name IN ARRAY v_role_names
  LOOP
    -- ── 1. Create the PostgreSQL role if it does not already exist ─────────────
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role_name) THEN
      EXECUTE format('CREATE ROLE %I', v_role_name);
      RAISE NOTICE 'Created PostgreSQL role: %', v_role_name;
    END IF;

    -- ── 2. Grant authenticated to this role ────────────────────────────────────
    -- Ensures pg_has_role(current_user, 'authenticated', 'usage') = true when
    -- PostgREST does SET LOCAL ROLE <app_role>.
    -- This makes every TO authenticated RLS policy apply for app-role sessions.
    -- GRANT ... IF NOT EXISTS syntax not available in PG15 for roles, so we
    -- check pg_auth_members directly.
    IF NOT EXISTS (
      SELECT 1
      FROM   pg_catalog.pg_auth_members
      WHERE  roleid = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
        AND  member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = v_role_name)
    ) THEN
      EXECUTE format('GRANT authenticated TO %I', v_role_name);
    END IF;

    -- ── 3. Grant this role to authenticator ────────────────────────────────────
    -- PostgREST connects as the `authenticator` role and switches to the
    -- JWT role via SET LOCAL ROLE. authenticator must be a member of the target
    -- role for this switch to be permitted.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM   pg_catalog.pg_auth_members
        WHERE  roleid = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = v_role_name)
          AND  member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticator')
      ) THEN
        EXECUTE format('GRANT %I TO authenticator', v_role_name);
      END IF;
    END IF;

  END LOOP;

  RAISE NOTICE 'Application role database registration complete.';
END $$;
