-- =============================================================================
-- Customer Lifecycle Operations — generalizes the existing admin-tier-only
-- member list (get_platform_org_admins) to every tenant user, for the new
-- "Users" tab. Same tables, same shape, role filter removed — not a
-- duplicate API, the completion of the existing one for non-admin roles
-- (instructors, receptionists, etc.) that were previously invisible here.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_platform_org_users(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH users AS (
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
  FROM users;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_users(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_org_users(uuid) TO service_role;
