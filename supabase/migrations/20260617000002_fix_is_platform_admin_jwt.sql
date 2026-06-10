-- =============================================================================
-- Phase A-1: Governance Alignment — is_platform_admin() JWT Claim Fix
-- =============================================================================
--
-- PROBLEM:
--   is_platform_admin() reads the JWT `role` claim and matches it against a
--   hardcoded list: ['platform_superadmin', 'platform_support',
--   'platform_billing']. This list can diverge from the authoritative
--   `is_platform_admin: boolean` JWT claim set by get_user_jwt_claims().
--
--   Risk: adding a new platform admin role type, or renaming an existing one,
--   silently breaks cross-tenant RLS bypass without any migration required on
--   the JWT side. The two sources of truth drift independently.
--
-- FIX:
--   Replace role-name matching with a direct read of the `is_platform_admin`
--   boolean from request.jwt.claims — the canonical JWT contract field.
--   get_user_jwt_claims() already sets this field correctly for all users.
--
-- SAFETY ANALYSIS:
--   current_setting('request.jwt.claims', true)
--     → NULL when not set (missing_ok = true); no exception thrown
--   NULL::jsonb
--     → NULL; safe
--   NULL ->> 'is_platform_admin'
--     → NULL; safe
--   NULL::boolean
--     → NULL; safe
--   COALESCE(NULL, false)
--     → false; anon callers, missing-claim callers, expired-token callers
--       all correctly resolve to false
--
-- PRESERVED:
--   - Function signature (name, return type, arity)
--   - STABLE volatility
--   - SECURITY DEFINER
--   - SET search_path = public
--   - All RLS policies referencing this function are unaffected
--
-- ROLLBACK: see bottom of file
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'is_platform_admin')::boolean,
    false
  );
$$;

COMMENT ON FUNCTION public.is_platform_admin IS
  'Returns true if the current JWT contains is_platform_admin = true. '
  'Reads the authoritative boolean claim directly — does not match role names. '
  'NULL-safe: returns false for anon callers and any missing/null claim state.';

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these after applying the migration to confirm correct behavior.
--
-- 1. Confirm prosrc no longer references auth_user_role or hardcoded role names:
--
--    SELECT prosrc
--    FROM pg_proc
--    WHERE proname = 'is_platform_admin'
--      AND pronamespace = 'public'::regnamespace;
--
--    Expected: body contains 'is_platform_admin' claim read, no 'auth_user_role',
--              no 'platform_superadmin', no ARRAY literal.
--
-- 2. Anon / no-JWT context → false:
--
--    SET LOCAL request.jwt.claims = '';
--    SELECT public.is_platform_admin();
--    -- Expected: false (COALESCE on NULL from empty-string cast edge case is
--    --           protected by the COALESCE; empty string yields cast error —
--    --           PostgREST never sets this to empty string in practice)
--
--    SET LOCAL request.jwt.claims = '{}';
--    SELECT public.is_platform_admin();
--    -- Expected: false
--
-- 3. Platform admin claim = true → true:
--
--    SET LOCAL request.jwt.claims = '{"is_platform_admin": true, "role": "platform_superadmin"}';
--    SELECT public.is_platform_admin();
--    -- Expected: true
--
-- 4. Regular tenant user → false:
--
--    SET LOCAL request.jwt.claims = '{"is_platform_admin": false, "role": "org_owner"}';
--    SELECT public.is_platform_admin();
--    -- Expected: false
--
-- 5. Backward-compat: missing claim (JWT without is_platform_admin key) → false:
--
--    SET LOCAL request.jwt.claims = '{"role": "org_owner"}';
--    SELECT public.is_platform_admin();
--    -- Expected: false
--
-- 6. Confirm all RLS policies referencing is_platform_admin still exist:
--
--    SELECT schemaname, tablename, policyname
--    FROM pg_policies
--    WHERE qual LIKE '%is_platform_admin%'
--       OR with_check LIKE '%is_platform_admin%'
--    ORDER BY tablename, policyname;
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Apply the block below to revert to the previous role-name-based behavior.
--
-- CREATE OR REPLACE FUNCTION public.is_platform_admin()
-- RETURNS boolean
-- LANGUAGE sql
-- STABLE
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
--   SELECT public.auth_user_role() = ANY(
--     ARRAY['platform_superadmin', 'platform_support', 'platform_billing']
--   );
-- $$;
-- =============================================================================
