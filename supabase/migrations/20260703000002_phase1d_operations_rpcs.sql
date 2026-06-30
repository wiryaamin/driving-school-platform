-- Phase 1D Operations Center RPCs
-- Platform Admin only — service_role execution, never directly by tenants or anon.
-- All functions: SECURITY DEFINER, SET search_path = public,
-- REVOKE from PUBLIC, GRANT to service_role only.

-- ─── 1. Platform admins with auth details ────────────────────────────────────
-- Richer than get_platform_admins_list: includes last_sign_in_at, mfa_enabled,
-- and includes inactive admins for full roster visibility.

CREATE OR REPLACE FUNCTION public.get_platform_admins_detail()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',               pa.id,
        'user_id',          pa.user_id,
        'role',             pa.role,
        'is_active',        pa.is_active,
        'granted_at',       pa.granted_at,
        'notes',            pa.notes,
        'email',            COALESCE(p.email, au.email),
        'first_name',       p.first_name,
        'last_name',        p.last_name,
        'last_sign_in_at',  au.last_sign_in_at,
        'mfa_enabled',      EXISTS (
                              SELECT 1 FROM auth.mfa_factors mf
                              WHERE mf.user_id = pa.user_id
                                AND mf.status  = 'verified'
                            )
      )
      ORDER BY pa.granted_at ASC
    ),
    '[]'::jsonb
  )
  FROM public.platform_admins pa
  LEFT JOIN public.profiles p  ON p.id  = pa.user_id
  LEFT JOIN auth.users      au ON au.id = pa.user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_admins_detail() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_admins_detail() TO service_role;

-- ─── 2. Platform audit log (paginated, filtered) ──────────────────────────────
-- Returns { total, rows } for the platform-wide audit log.
-- All filters are optional (NULL = no filter).
-- Excludes the system sentinel org (00000000-...).
-- Excludes rows where organization_id IS NULL (service-role internals).

CREATE OR REPLACE FUNCTION public.get_platform_audit_log(
  p_org_id       uuid        DEFAULT NULL,
  p_actor_email  text        DEFAULT NULL,
  p_entity_type  text        DEFAULT NULL,
  p_operation    text        DEFAULT NULL,
  p_date_from    timestamptz DEFAULT NULL,
  p_date_to      timestamptz DEFAULT NULL,
  p_limit        int         DEFAULT 50,
  p_offset       int         DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_rows  jsonb;
BEGIN
  SELECT COUNT(*)::bigint
  INTO   v_total
  FROM   public.audit_logs al
  WHERE  al.organization_id IS NOT NULL
    AND  al.organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000000'::uuid
    AND  (p_org_id      IS NULL OR al.organization_id = p_org_id)
    AND  (p_actor_email IS NULL OR al.actor_email ILIKE '%' || p_actor_email || '%')
    AND  (p_entity_type IS NULL OR al.entity_type = p_entity_type)
    AND  (p_operation   IS NULL OR al.operation::text = p_operation)
    AND  (p_date_from   IS NULL OR al.occurred_at >= p_date_from)
    AND  (p_date_to     IS NULL OR al.occurred_at <= p_date_to);

  SELECT COALESCE(jsonb_agg(t.evt), '[]'::jsonb)
  INTO   v_rows
  FROM (
    SELECT jsonb_build_object(
      'id',              al.id,
      'organization_id', al.organization_id,
      'org_name',        o.name,
      'actor_id',        al.actor_id,
      'actor_email',     al.actor_email,
      'entity_type',     al.entity_type,
      'entity_id',       al.entity_id,
      'operation',       al.operation,
      'table_name',      al.table_name,
      'changed_fields',  al.changed_fields,
      'occurred_at',     al.occurred_at,
      'severity',        CASE
        WHEN al.entity_type = 'platform_admins'
          THEN 'critical'
        WHEN al.entity_type IN ('user_role_assignments', 'memberships')
          THEN 'high'
        WHEN al.entity_type = 'organizations'
          AND al.changed_fields IS NOT NULL
          AND al.changed_fields && ARRAY['status']
          THEN 'high'
        WHEN al.entity_type = 'organizations'
          AND al.changed_fields IS NOT NULL
          AND al.changed_fields && ARRAY['subscription_tier', 'subscription_status']
          THEN 'medium'
        ELSE 'low'
      END
    ) AS evt
    FROM  public.audit_logs al
    LEFT JOIN public.organizations o ON o.id = al.organization_id
    WHERE al.organization_id IS NOT NULL
      AND al.organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000000'::uuid
      AND (p_org_id      IS NULL OR al.organization_id = p_org_id)
      AND (p_actor_email IS NULL OR al.actor_email ILIKE '%' || p_actor_email || '%')
      AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
      AND (p_operation   IS NULL OR al.operation::text = p_operation)
      AND (p_date_from   IS NULL OR al.occurred_at >= p_date_from)
      AND (p_date_to     IS NULL OR al.occurred_at <= p_date_to)
    ORDER BY al.occurred_at DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) t;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_audit_log(uuid, text, text, text, timestamptz, timestamptz, int, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_audit_log(uuid, text, text, text, timestamptz, timestamptz, int, int) TO service_role;

-- ─── 3. Platform security events ─────────────────────────────────────────────
-- Security-relevant events across all tenants, newest first.
-- Covers: platform_admins changes, role assignments, org status changes,
-- membership changes. Severity is classified per row.

CREATE OR REPLACE FUNCTION public.get_platform_security_events(
  p_limit int DEFAULT 100
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(t.evt), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id',              al.id,
      'organization_id', al.organization_id,
      'org_name',        o.name,
      'actor_id',        al.actor_id,
      'actor_email',     al.actor_email,
      'entity_type',     al.entity_type,
      'entity_id',       al.entity_id,
      'operation',       al.operation,
      'changed_fields',  al.changed_fields,
      'new_values',      al.new_values,
      'occurred_at',     al.occurred_at,
      'severity',        CASE
        WHEN al.entity_type = 'platform_admins'                               THEN 'critical'
        WHEN al.entity_type = 'user_role_assignments'                         THEN 'high'
        WHEN al.entity_type = 'organizations'
          AND al.changed_fields IS NOT NULL
          AND al.changed_fields && ARRAY['status']                            THEN 'high'
        WHEN al.entity_type = 'memberships'                                   THEN 'medium'
        WHEN al.entity_type = 'organizations'
          AND al.changed_fields IS NOT NULL
          AND al.changed_fields && ARRAY['subscription_status', 'subscription_tier'] THEN 'medium'
        ELSE 'low'
      END
    ) AS evt
    FROM  public.audit_logs al
    LEFT JOIN public.organizations o ON o.id = al.organization_id
    WHERE (
      al.entity_type IN ('platform_admins', 'user_role_assignments', 'memberships')
      OR (
        al.entity_type = 'organizations'
        AND al.changed_fields IS NOT NULL
        AND al.changed_fields && ARRAY['status', 'subscription_status', 'subscription_tier']
      )
    )
    AND al.organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000000'::uuid
    ORDER BY al.occurred_at DESC
    LIMIT p_limit
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_security_events(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_security_events(int) TO service_role;

-- ─── 4. Organization health snapshot (support workspace) ─────────────────────
-- Full health profile for one organization for the support workspace.
-- Includes: org info, usage counts, last login, primary contact, recent events.

CREATE OR REPLACE FUNCTION public.get_platform_org_health(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'org_id',              o.id,
    'org_name',            o.name,
    'org_slug',            o.slug,
    'legal_name',          o.legal_name,
    'org_number',          o.org_number,
    'org_status',          o.status,
    'subscription_tier',   o.subscription_tier,
    'subscription_status', o.subscription_status,
    'trial_ends_at',       o.trial_ends_at,
    'max_users',           o.max_users,
    'max_locations',       o.max_locations,
    'created_at',          o.created_at,
    'member_count',        (SELECT COUNT(*)::int FROM public.memberships WHERE organization_id = p_org_id AND status = 'active'),
    'student_count',       (SELECT COUNT(*)::int FROM public.students     WHERE organization_id = p_org_id AND deleted_at IS NULL),
    'instructor_count',    (SELECT COUNT(*)::int FROM public.instructors  WHERE organization_id = p_org_id AND deleted_at IS NULL),
    'vehicle_count',       (SELECT COUNT(*)::int FROM public.vehicles     WHERE organization_id = p_org_id AND deleted_at IS NULL),
    'booking_count',       (SELECT COUNT(*)::int FROM public.lesson_bookings WHERE organization_id = p_org_id AND status NOT IN ('cancelled','draft')),
    'last_login_at',       (
                             SELECT MAX(au.last_sign_in_at)
                             FROM   public.memberships m2
                             JOIN   auth.users         au ON au.id = m2.user_id
                             WHERE  m2.organization_id = p_org_id
                               AND  m2.status          = 'active'
                           ),
    'last_activity_at',    (
                             SELECT MAX(al.occurred_at)
                             FROM   public.audit_logs al
                             WHERE  al.organization_id = p_org_id
                           ),
    'primary_contact',     (
                             SELECT jsonb_build_object(
                               'user_id',         p2.id,
                               'email',           p2.email,
                               'first_name',      p2.first_name,
                               'last_name',       p2.last_name,
                               'role',            r.name,
                               'role_display',    r.display_name,
                               'last_sign_in_at', au.last_sign_in_at
                             )
                             FROM   public.memberships       m2
                             JOIN   public.membership_roles  mr ON mr.membership_id = m2.id
                             JOIN   public.roles              r  ON r.id  = mr.role_id
                             JOIN   public.profiles           p2 ON p2.id = m2.user_id
                             LEFT JOIN auth.users             au ON au.id = m2.user_id
                             WHERE  m2.organization_id = p_org_id
                               AND  r.name IN ('org_owner', 'org_admin')
                               AND  mr.is_active = true
                               AND  m2.status    = 'active'
                             ORDER BY (r.name = 'org_owner') DESC
                             LIMIT 1
                           ),
    'recent_events',       (
                             SELECT COALESCE(jsonb_agg(t.evt), '[]'::jsonb)
                             FROM (
                               SELECT jsonb_build_object(
                                 'id',           al.id,
                                 'entity_type',  al.entity_type,
                                 'operation',    al.operation,
                                 'actor_email',  al.actor_email,
                                 'occurred_at',  al.occurred_at
                               ) AS evt
                               FROM  public.audit_logs al
                               WHERE al.organization_id = p_org_id
                               ORDER BY al.occurred_at DESC
                               LIMIT 10
                             ) t
                           )
  )
  FROM public.organizations o
  WHERE o.id         = p_org_id
    AND o.deleted_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_health(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_org_health(uuid) TO service_role;
