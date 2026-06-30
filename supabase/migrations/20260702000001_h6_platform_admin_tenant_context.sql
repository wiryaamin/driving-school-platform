-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260702000001_h6_platform_admin_tenant_context.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Sprint:    H-6 — Platform Admin Tenant Context Support
--
-- DEFECT RESOLVED:
--   Platform admins (PAs) were unable to obtain tenant-scoped JWTs.
--   get_user_jwt_claims() PA branch unconditionally returned
--   organization_id = NULL regardless of p_target_org_id, making it
--   structurally impossible for PAs to switch into a tenant context.
--
--   Root cause: the PA early-return at line 1 of the IF block returned
--   before p_target_org_id was ever evaluated. The argument was
--   structurally unreachable for all PA callers.
--
--   Two walls identified in H-6 Root Cause Analysis:
--     Wall 1: switch-tenant validation gate —
--             custom.organization_id !== target_org_id
--             → null !== target_org_id → 403
--             (resolved by this migration: get_user_jwt_claims now
--             returns organization_id = target_org_id for valid PA+org)
--     Wall 2: get_user_jwt_claims PA early return ignores p_target_org_id
--             (fixed here: PA branch now evaluates p_target_org_id)
--
-- FIX:
--   When p_target_org_id IS NOT NULL:
--     → SELECT from public.organizations WHERE id = p_target_org_id
--       AND status = 'active' AND deleted_at IS NULL
--     → If org found (v_tier IS NOT NULL):
--         Return tenant-scoped PA claims with organization_id = p_target_org_id.
--         is_platform_admin remains true. permissions remains [].
--         subscription_tier comes from the validated org row.
--     → If org not found or inactive (v_tier IS NULL):
--         Fall through to null-org PA return.
--         switch-tenant's existing validation check then correctly returns 403:
--         custom.organization_id = null ≠ target_org_id → access denied.
--         This prevents phantom org IDs from entering JWTs.
--   When p_target_org_id IS NULL:
--     → Null-org PA return fires immediately (behavior unchanged).
--
-- ORG EXISTENCE GUARD:
--   The v_tier IS NOT NULL guard is the org existence and activity check.
--   It enforces three conditions simultaneously:
--     1. Org row exists in public.organizations
--     2. org.status = 'active'
--     3. org.deleted_at IS NULL (not soft-deleted)
--   Only orgs satisfying all three conditions receive a scoped PA JWT.
--
-- BACKWARD COMPATIBILITY:
--   Regular users:
--     PA existence check (SELECT FROM platform_admins) fails → PA branch
--     never entered → steps 2-6 unchanged → no behavioral change.
--   PAs (no switch staged / fresh login):
--     p_target_org_id IS NULL → null-org return fires without org lookup →
--     identical to pre-H-6 behavior.
--   PAs (valid switch staged):
--     NEW: tenant-scoped claims returned. Wall 1 and Wall 2 both resolved.
--   PAs (stale or invalid preferred_org_id):
--     Org lookup returns no row → null-org PA return → switch-tenant 403.
--     Correct and safe.
--   Auth hook (supabase/functions/auth-hook/index.ts):
--     No code change required. Already passes preferred_org_id as
--     p_target_org_id. Now receives correct tenant-scoped claims.
--   RLS:
--     is_platform_admin() RLS function reads JWT claim — still true.
--     auth_organization_id() now returns target_org_id for switched PAs.
--     This correctly scopes PA data access to the switched tenant.
--
-- WHAT IS UNCHANGED:
--   - Function signature: get_user_jwt_claims(uuid, uuid DEFAULT NULL)
--   - Return type: jsonb
--   - SECURITY DEFINER / SET search_path = public
--   - Regular user membership resolution (steps 2-6)
--   - Null-org PA return shape (all keys preserved, same values)
--   - switch-tenant validation logic (no code change required)
--   - REVOKE / GRANT set
--   - All RLS policies
--   - All other Edge Functions
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_jwt_claims(
  p_user_id        uuid,
  p_target_org_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_id    uuid;
  v_organization_id  uuid;
  v_role             text;
  v_tier             text;
  v_permissions      text[];
  v_location_ids     uuid[];
BEGIN
  -- ── 1. Platform admins bypass org membership entirely ──────────────────────
  IF EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = p_user_id AND is_active = true
  ) THEN
    SELECT role INTO v_role
    FROM public.platform_admins
    WHERE user_id = p_user_id AND is_active = true
    LIMIT 1;

    -- ── 1a. Tenant-scoped PA JWT (H-6) ─────────────────────────────────────
    -- Evaluate p_target_org_id only when provided. Validate org existence and
    -- activity before embedding. v_tier IS NOT NULL iff the org is found,
    -- active, and not soft-deleted — this is the org existence guard.
    IF p_target_org_id IS NOT NULL THEN
      SELECT o.subscription_tier::text
      INTO   v_tier
      FROM   public.organizations o
      WHERE  o.id         = p_target_org_id
        AND  o.status     = 'active'
        AND  o.deleted_at IS NULL;

      IF v_tier IS NOT NULL THEN
        RETURN jsonb_build_object(
          'organization_id',      p_target_org_id,
          'active_membership_id', NULL,
          'role',                 v_role,
          'permissions',          '[]'::jsonb,
          'location_ids',         '[]'::jsonb,
          'subscription_tier',    v_tier,
          'is_platform_admin',    true
        );
      END IF;
      -- Org not found or inactive: fall through to null-org PA return.
      -- switch-tenant's existing validation gate (organization_id !== target)
      -- then correctly returns 403 — no phantom org IDs enter any JWT.
    END IF;

    -- ── 1b. Null-org PA JWT (fresh login or invalid/inactive target org) ─────
    RETURN jsonb_build_object(
      'organization_id',      NULL,
      'active_membership_id', NULL,
      'role',                 v_role,
      'permissions',          '[]'::jsonb,
      'location_ids',         '[]'::jsonb,
      'subscription_tier',    'enterprise',
      'is_platform_admin',    true
    );
  END IF;

  -- ── 2. Resolve active membership ──────────────────────────────────────────
  --    p_target_org_id = NULL   → most recently joined active org (default)
  --    p_target_org_id = <uuid> → explicit org selection (tenant switch)
  SELECT m.id, m.organization_id, o.subscription_tier::text
  INTO   v_membership_id, v_organization_id, v_tier
  FROM   public.memberships m
  JOIN   public.organizations o
         ON o.id = m.organization_id AND o.status = 'active'
  WHERE  m.user_id = p_user_id
    AND  m.status  = 'active'
    AND  (p_target_org_id IS NULL OR m.organization_id = p_target_org_id)
  ORDER  BY m.joined_at DESC
  LIMIT  1;

  -- ── 3. No active membership → empty claims (new invitee, offboarded user) ──
  IF v_membership_id IS NULL THEN
    RETURN jsonb_build_object(
      'organization_id',      NULL,
      'active_membership_id', NULL,
      'role',                 NULL,
      'permissions',          '[]'::jsonb,
      'location_ids',         '[]'::jsonb,
      'subscription_tier',    'trial',
      'is_platform_admin',    false
    );
  END IF;

  -- ── 4. Primary org-wide role (lowest sort_order = highest seniority) ───────
  SELECT r.name INTO v_role
  FROM   public.membership_roles mr
  JOIN   public.roles r ON r.id = mr.role_id
  WHERE  mr.membership_id = v_membership_id
    AND  mr.is_active     = true
    AND  mr.location_id   IS NULL
    AND  (mr.expires_at IS NULL OR mr.expires_at > now())
  ORDER  BY r.sort_order ASC
  LIMIT  1;

  -- ── 5. All effective permissions (deduped across all role assignments) ──────
  SELECT array_agg(DISTINCT uep.permission_code)
  INTO   v_permissions
  FROM   public.user_effective_permissions uep
  WHERE  uep.user_id         = p_user_id
    AND  uep.organization_id = v_organization_id;

  -- ── 6. Location IDs where user has a location-scoped role ──────────────────
  SELECT array_agg(DISTINCT mr.location_id)
  INTO   v_location_ids
  FROM   public.membership_roles mr
  WHERE  mr.membership_id = v_membership_id
    AND  mr.is_active     = true
    AND  mr.location_id   IS NOT NULL
    AND  (mr.expires_at IS NULL OR mr.expires_at > now());

  RETURN jsonb_build_object(
    'organization_id',      v_organization_id,
    'active_membership_id', v_membership_id,
    'role',                 COALESCE(v_role, 'org_member'),
    'permissions',          COALESCE(to_jsonb(v_permissions), '[]'::jsonb),
    'location_ids',         COALESCE(to_jsonb(v_location_ids), '[]'::jsonb),
    'subscription_tier',    COALESCE(v_tier, 'trial'),
    'is_platform_admin',    false
  );
END;
$$;

COMMENT ON FUNCTION public.get_user_jwt_claims IS
  'Called by the Supabase Auth Hook Edge Function at every sign-in and token refresh. '
  'Returns JWT custom claims: organization_id, active_membership_id, role, '
  'permissions[], location_ids[], subscription_tier, is_platform_admin. '
  'H-6: Platform admins may receive tenant-scoped claims when p_target_org_id '
  'references an existing active organization (org existence guard enforced). '
  'Null-org PA claims are returned when p_target_org_id is NULL or the target org '
  'is not found or inactive. '
  'Callable only via service role — never expose to client-side code.';
