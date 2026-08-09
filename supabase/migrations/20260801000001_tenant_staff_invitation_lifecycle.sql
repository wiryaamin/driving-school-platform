-- =============================================================================
-- Tenant Staff Invitation Lifecycle
--
-- Completes the existing invite-user capability (Sprint 4) with the same
-- operational lifecycle already built for Platform Administration's org-admin
-- management (20260711000004_platform_org_admin_management.sql /
-- 20260711000005_platform_org_admin_invitation_lifecycle.sql), extended to
-- cover ALL invitable staff roles within a tenant (instructors, receptionists,
-- etc.), not just admin-tier. Same technique — invitation_status derived from
-- auth.users.last_sign_in_at, no new table, no new column — applied to a
-- broader role set and callable by a tenant's own org_admin/org_owner rather
-- than only a platform administrator.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_org_staff_invitations(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH staff AS (
    SELECT
      p.id              AS user_id,
      p.email,
      p.first_name,
      p.last_name,
      p.is_active,
      r.name            AS role,
      r.display_name    AS role_display,
      m.status          AS membership_status,
      CASE WHEN au.last_sign_in_at IS NULL THEN 'pending' ELSE 'accepted' END AS invitation_status,
      au.invited_at,
      au.last_sign_in_at,
      m.joined_at
    FROM public.memberships       m
    JOIN public.membership_roles  mr ON mr.membership_id = m.id
    JOIN public.roles              r  ON r.id  = mr.role_id
    JOIN public.profiles           p  ON p.id  = m.user_id
    LEFT JOIN auth.users           au ON au.id = m.user_id
    WHERE m.organization_id = p_org_id
    AND   mr.is_active = true
    AND   m.status     IN ('active', 'suspended')
    AND   p.deleted_at IS NULL
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id',            user_id,
        'email',               email,
        'first_name',          first_name,
        'last_name',           last_name,
        'is_active',           is_active,
        'role',                role,
        'role_display',        role_display,
        'membership_status',   membership_status,
        'invitation_status',   invitation_status,
        'invited_at',          invited_at,
        'last_sign_in_at',     last_sign_in_at,
        'joined_at',           joined_at
      )
      ORDER BY joined_at ASC
    ),
    '[]'::jsonb
  )
  FROM staff;
$$;

COMMENT ON FUNCTION public.get_org_staff_invitations(uuid) IS
  'Returns every staff member of an organization with invitation lifecycle status, '
  'for the tenant Users settings page. Mirrors get_platform_org_admins'' technique '
  '(invitation_status derived from auth.users.last_sign_in_at) but covers all '
  'invitable roles, not just admin-tier, and is callable by a tenant''s own '
  'org_admin/org_owner via invite-user Edge Function rather than only a platform administrator.';

-- Callable only through invite-user (SECURITY DEFINER, service-role invocation
-- from the Edge Function) — same posture as get_platform_org_admins.
REVOKE EXECUTE ON FUNCTION public.get_org_staff_invitations(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_org_staff_invitations(uuid) TO service_role;
