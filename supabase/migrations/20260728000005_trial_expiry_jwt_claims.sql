-- ════════════════════════════════════════════════════════════════════════════
-- Trial Expiry Enforcement — JWT claims
--
-- organizations.subscription_status / trial_ends_at have existed since launch
-- but were never exposed anywhere: not in the JWT, not checked by any Edge
-- Function, not enforced client-side. A trial that ended kept full access
-- forever until a platform admin manually intervened.
--
-- Approved design: 7-day grace period (banner shown, full access continues),
-- then a hard lock (blocked) until a platform admin extends/upgrades. This
-- migration adds subscription_status + trial_ends_at to get_user_jwt_claims()
-- so both Edge Functions (_shared/context.ts) and the frontend (already
-- loading the full organizations row via AuthProvider) can compute the same
-- lock state from the same two fields — no new scheduled job, no stored
-- "locked" flag to fall out of sync, just a pure function of data that
-- already exists.
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
  v_status           text;
  v_trial_ends_at    timestamptz;
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
      SELECT o.subscription_tier::text, o.subscription_status::text, o.trial_ends_at
      INTO   v_tier, v_status, v_trial_ends_at
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
          'subscription_status',  v_status,
          'trial_ends_at',        v_trial_ends_at,
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
      'subscription_status',  NULL,
      'trial_ends_at',        NULL,
      'is_platform_admin',    true
    );
  END IF;

  -- ── 2. Resolve active membership ──────────────────────────────────────────
  --    p_target_org_id = NULL   → most recently joined active org (default)
  --    p_target_org_id = <uuid> → explicit org selection (tenant switch)
  SELECT m.id, m.organization_id, o.subscription_tier::text, o.subscription_status::text, o.trial_ends_at
  INTO   v_membership_id, v_organization_id, v_tier, v_status, v_trial_ends_at
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
      'subscription_status',  NULL,
      'trial_ends_at',        NULL,
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
    'subscription_status',  v_status,
    'trial_ends_at',        v_trial_ends_at,
    'is_platform_admin',    false
  );
END;
$$;

COMMENT ON FUNCTION public.get_user_jwt_claims IS
  'Called by the Supabase Auth Hook Edge Function at every sign-in and token refresh. '
  'Returns JWT custom claims: organization_id, active_membership_id, role, '
  'permissions[], location_ids[], subscription_tier, subscription_status, '
  'trial_ends_at, is_platform_admin. '
  'subscription_status/trial_ends_at drive the 7-day-grace-then-lock trial '
  'expiry check in _shared/context.ts and the frontend (getTrialLockState). '
  'H-6: Platform admins may receive tenant-scoped claims when p_target_org_id '
  'references an existing active organization (org existence guard enforced). '
  'Null-org PA claims are returned when p_target_org_id is NULL or the target org '
  'is not found or inactive. '
  'Callable only via service role — never expose to client-side code.';
