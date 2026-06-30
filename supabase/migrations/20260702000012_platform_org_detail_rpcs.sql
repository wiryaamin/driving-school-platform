-- Platform Org Detail RPCs — Phase 1B Organization Management
-- All functions: SECURITY DEFINER, SET search_path = public,
-- REVOKE from PUBLIC, GRANT to service_role only.

-- ─── 1. Per-org counts for the enriched organizations list ────────────────────

CREATE OR REPLACE FUNCTION public.get_platform_org_list_counts()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH member_counts AS (
    SELECT organization_id, COUNT(*)::int AS cnt
    FROM public.memberships
    WHERE status = 'active'
    GROUP BY organization_id
  ),
  student_counts AS (
    SELECT organization_id, COUNT(*)::int AS cnt
    FROM public.students
    WHERE deleted_at IS NULL
    GROUP BY organization_id
  ),
  instructor_counts AS (
    SELECT organization_id, COUNT(*)::int AS cnt
    FROM public.instructors
    WHERE deleted_at IS NULL
    GROUP BY organization_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'org_id',           o.id,
        'member_count',     COALESCE(m.cnt,  0),
        'student_count',    COALESCE(s.cnt,  0),
        'instructor_count', COALESCE(ic.cnt, 0)
      )
    ),
    '[]'::jsonb
  )
  FROM public.organizations o
  LEFT JOIN member_counts    m  ON m.organization_id  = o.id
  LEFT JOIN student_counts   s  ON s.organization_id  = o.id
  LEFT JOIN instructor_counts ic ON ic.organization_id = o.id
  WHERE o.deleted_at IS NULL
  AND   o.id != '00000000-0000-0000-0000-000000000000'::uuid;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_list_counts()    FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_org_list_counts()    TO service_role;

-- ─── 2. Full organization profile ─────────────────────────────────────────────

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
    'settings',            o.settings,
    'created_at',          o.created_at,
    'updated_at',          o.updated_at
  )
  FROM public.organizations o
  WHERE o.id = p_org_id
  AND   o.deleted_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_detail(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_org_detail(uuid) TO service_role;

-- ─── 3. Aggregate statistics for one organization ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_platform_org_stats(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'student_count',    (SELECT COUNT(*)::int FROM public.students        WHERE organization_id = p_org_id AND deleted_at IS NULL),
    'instructor_count', (SELECT COUNT(*)::int FROM public.instructors     WHERE organization_id = p_org_id AND deleted_at IS NULL),
    'vehicle_count',    (SELECT COUNT(*)::int FROM public.vehicles        WHERE organization_id = p_org_id AND deleted_at IS NULL),
    'booking_count',    (SELECT COUNT(*)::int FROM public.lesson_bookings WHERE organization_id = p_org_id AND status NOT IN ('cancelled','draft')),
    'package_count',    (SELECT COUNT(*)::int FROM public.student_packages WHERE organization_id = p_org_id AND archived_at IS NULL),
    'member_count',     (SELECT COUNT(*)::int FROM public.memberships WHERE organization_id = p_org_id AND status = 'active')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_stats(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_org_stats(uuid) TO service_role;

-- ─── 4. Organization administrators (org_owner, org_admin, org_manager) ───────

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
      mr.is_active,
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
    AND   m.status     = 'active'
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id',          user_id,
        'email',            email,
        'first_name',       first_name,
        'last_name',        last_name,
        'role',             role,
        'role_display',     role_display,
        'is_active',        is_active,
        'assigned_at',      assigned_at,
        'last_sign_in_at',  last_sign_in_at
      )
      ORDER BY assigned_at ASC
    ),
    '[]'::jsonb
  )
  FROM admins;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_admins(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_org_admins(uuid) TO service_role;

-- ─── 5. Organization timeline (50 most recent audit events) ───────────────────

CREATE OR REPLACE FUNCTION public.get_platform_org_timeline(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(t.evt ORDER BY t.occurred_at DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT
      jsonb_build_object(
        'id',             al.id,
        'event_type',
          CASE
            WHEN al.operation = 'INSERT'
              THEN 'org_created'
            WHEN al.operation = 'UPDATE'
              AND 'status' = ANY(al.changed_fields)
              AND (al.new_values->>'status') = 'suspended'
              THEN 'org_suspended'
            WHEN al.operation = 'UPDATE'
              AND 'status' = ANY(al.changed_fields)
              AND (al.new_values->>'status') = 'active'
              THEN 'org_reactivated'
            WHEN al.operation = 'UPDATE'
              AND 'status' = ANY(al.changed_fields)
              AND (al.new_values->>'status') = 'terminated'
              THEN 'org_terminated'
            WHEN al.operation = 'UPDATE'
              AND 'subscription_status' = ANY(al.changed_fields)
              AND (al.new_values->>'subscription_status') = 'trialing'
              THEN 'trial_started'
            WHEN al.operation = 'UPDATE'
              AND 'subscription_status' = ANY(al.changed_fields)
              AND (al.new_values->>'subscription_status') = 'active'
              THEN 'trial_ended'
            WHEN al.operation = 'UPDATE'
              AND 'trial_ends_at' = ANY(al.changed_fields)
              AND NOT ('subscription_status' = ANY(al.changed_fields))
              THEN 'trial_extended'
            WHEN al.operation = 'UPDATE'
              AND 'subscription_tier' = ANY(al.changed_fields)
              THEN 'tier_changed'
            ELSE 'org_updated'
          END,
        'actor_id',       al.actor_id,
        'actor_email',    al.actor_email,
        'occurred_at',    al.occurred_at,
        'changed_fields', al.changed_fields,
        'new_values',     al.new_values,
        'old_values',     al.old_values
      ) AS evt,
      al.occurred_at
    FROM public.audit_logs al
    WHERE al.organization_id = p_org_id
    AND   al.entity_type     = 'organizations'
    ORDER BY al.occurred_at DESC
    LIMIT 50
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_timeline(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_org_timeline(uuid) TO service_role;
