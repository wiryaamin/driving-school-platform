-- =============================================================================
-- Organization Administration Capability — Stage 1 Implementation
--
-- Extends two existing Phase 1B RPCs (20260702000012_platform_org_detail_rpcs.sql)
-- rather than introducing new ones, per the Capability Review's "extend, do not
-- redesign" directive. No new tables — administrator management (invite, role
-- change, disable/reactivate, ownership transfer) operates entirely on the
-- existing memberships / membership_roles / roles tables, exactly as
-- handleProvision already does for the first administrator at org creation.
-- =============================================================================

-- ─── 1. get_platform_org_admins — add invitation lifecycle + membership status ─
--
-- Two changes from the original:
--   1. invitation_status ('pending' | 'accepted') is derived from
--      auth.users.last_sign_in_at — no new column, no new table. A "pending"
--      admin is one who was created (by Invite Administrator, or by
--      Provisioning) but has never logged in.
--   2. The WHERE clause previously required m.status = 'active', which meant a
--      disabled (suspended) administrator disappeared from this list entirely
--      — the wrong behavior once Disable/Reactivate exists, since a platform
--      admin needs to see who's disabled in order to reactivate them. Now
--      includes 'suspended' memberships too (never 'removed' — this
--      capability never removes a membership, only suspends it). The
--      previously-returned mr.is_active field (always true, since the WHERE
--      clause already filtered to is_active=true — effectively dead data) is
--      replaced with the actually-meaningful membership_status.

CREATE OR REPLACE FUNCTION public.get_platform_org_admins(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH admins AS (
    SELECT
      p.id              AS user_id,
      p.email,
      p.first_name,
      p.last_name,
      r.name            AS role,
      r.display_name    AS role_display,
      m.status          AS membership_status,
      CASE WHEN au.last_sign_in_at IS NULL THEN 'pending' ELSE 'accepted' END AS invitation_status,
      mr.assigned_at,
      au.last_sign_in_at
    FROM public.memberships       m
    JOIN public.membership_roles  mr ON mr.membership_id = m.id
    JOIN public.roles              r  ON r.id  = mr.role_id
    JOIN public.profiles           p  ON p.id  = m.user_id
    LEFT JOIN auth.users           au ON au.id = m.user_id
    WHERE m.organization_id = p_org_id
    AND   r.name IN ('org_owner','org_admin','org_manager')
    AND   mr.is_active = true
    AND   m.status     IN ('active', 'suspended')
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id',            user_id,
        'email',               email,
        'first_name',          first_name,
        'last_name',           last_name,
        'role',                role,
        'role_display',        role_display,
        'membership_status',   membership_status,
        'invitation_status',   invitation_status,
        'assigned_at',         assigned_at,
        'last_sign_in_at',     last_sign_in_at
      )
      ORDER BY assigned_at ASC
    ),
    '[]'::jsonb
  )
  FROM admins;
$$;

-- ─── 2. get_platform_org_detail — expose max_users / max_locations ────────────

CREATE OR REPLACE FUNCTION public.get_platform_org_detail(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',                  o.id,
    'slug',                o.slug,
    'name',                o.name,
    'legal_name',          o.legal_name,
    'org_number',          o.org_number,
    'status',              o.status,
    'subscription_tier',   o.subscription_tier,
    'subscription_status', o.subscription_status,
    'trial_ends_at',       o.trial_ends_at,
    'max_users',           o.max_users,
    'max_locations',       o.max_locations,
    'settings',            o.settings,
    'created_at',          o.created_at,
    'updated_at',          o.updated_at
  )
  FROM public.organizations o
  WHERE o.id = p_org_id
  AND   o.deleted_at IS NULL;
$$;

-- Both functions already have their REVOKE/GRANT from the original migration
-- (CREATE OR REPLACE preserves existing grants) — no permission changes needed.
