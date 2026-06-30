-- Phase 1C Subscription Center RPCs
-- Platform Admin only — service_role execution, never directly by tenants or anon.
-- All functions: SECURITY DEFINER, SET search_path = public,
-- REVOKE from PUBLIC, GRANT to service_role only.

-- ─── 1. Subscription list ─────────────────────────────────────────────────────
-- Returns all orgs with subscription data + live usage counts.

CREATE OR REPLACE FUNCTION public.get_platform_subscription_list()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH usage AS (
    SELECT
      o.id AS org_id,
      (SELECT COUNT(*)::int FROM public.students    WHERE organization_id = o.id AND deleted_at IS NULL) AS student_count,
      (SELECT COUNT(*)::int FROM public.instructors WHERE organization_id = o.id AND deleted_at IS NULL) AS instructor_count,
      (SELECT COUNT(*)::int FROM public.memberships WHERE organization_id = o.id AND status = 'active') AS member_count
    FROM public.organizations o
    WHERE o.deleted_at IS NULL
    AND   o.id != '00000000-0000-0000-0000-000000000000'::uuid
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'org_id',              o.id,
        'org_name',            o.name,
        'org_slug',            o.slug,
        'org_status',          o.status,
        'subscription_tier',   o.subscription_tier,
        'subscription_status', o.subscription_status,
        'trial_ends_at',       o.trial_ends_at,
        'max_users',           o.max_users,
        'max_locations',       o.max_locations,
        'created_at',          o.created_at,
        'student_count',       COALESCE(u.student_count,    0),
        'instructor_count',    COALESCE(u.instructor_count, 0),
        'member_count',        COALESCE(u.member_count,     0)
      )
      ORDER BY o.name ASC
    ),
    '[]'::jsonb
  )
  FROM public.organizations o
  LEFT JOIN usage u ON u.org_id = o.id
  WHERE o.deleted_at IS NULL
  AND   o.id != '00000000-0000-0000-0000-000000000000'::uuid;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_subscription_list() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_subscription_list() TO service_role;

-- ─── 2. Subscription detail ───────────────────────────────────────────────────
-- Full subscription profile for one organization including usage stats.

CREATE OR REPLACE FUNCTION public.get_platform_subscription_detail(p_org_id uuid)
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
    'settings',            o.settings,
    'metadata',            o.metadata,
    'created_at',          o.created_at,
    'updated_at',          o.updated_at,
    'student_count',    (SELECT COUNT(*)::int FROM public.students       WHERE organization_id = p_org_id AND deleted_at IS NULL),
    'instructor_count', (SELECT COUNT(*)::int FROM public.instructors    WHERE organization_id = p_org_id AND deleted_at IS NULL),
    'vehicle_count',    (SELECT COUNT(*)::int FROM public.vehicles       WHERE organization_id = p_org_id AND deleted_at IS NULL),
    'booking_count',    (SELECT COUNT(*)::int FROM public.lesson_bookings WHERE organization_id = p_org_id AND status NOT IN ('cancelled','draft')),
    'package_count',    (SELECT COUNT(*)::int FROM public.student_packages WHERE organization_id = p_org_id AND archived_at IS NULL),
    'member_count',     (SELECT COUNT(*)::int FROM public.memberships WHERE organization_id = p_org_id AND status = 'active')
  )
  FROM public.organizations o
  WHERE o.id = p_org_id
  AND   o.deleted_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_subscription_detail(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_subscription_detail(uuid) TO service_role;

-- ─── 3. Subscription history ──────────────────────────────────────────────────
-- Subscription-relevant audit events for one organization (up to 100).
-- Filters audit_logs to rows where subscription_status, subscription_tier,
-- or trial_ends_at changed; INSERT events treated as subscription_created.

CREATE OR REPLACE FUNCTION public.get_platform_subscription_history(p_org_id uuid)
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
              THEN 'subscription_created'
            WHEN al.operation = 'UPDATE'
              AND 'subscription_status' = ANY(al.changed_fields)
              AND (al.new_values->>'subscription_status') = 'trialing'
              AND (al.old_values->>'subscription_status') IS DISTINCT FROM 'trialing'
              THEN 'trial_started'
            WHEN al.operation = 'UPDATE'
              AND 'subscription_status' = ANY(al.changed_fields)
              AND (al.new_values->>'subscription_status') = 'active'
              AND (al.old_values->>'subscription_status') = 'trialing'
              THEN 'trial_converted'
            WHEN al.operation = 'UPDATE'
              AND 'subscription_status' = ANY(al.changed_fields)
              AND (al.new_values->>'subscription_status') = 'active'
              AND (al.old_values->>'subscription_status') IS DISTINCT FROM 'trialing'
              THEN 'subscription_activated'
            WHEN al.operation = 'UPDATE'
              AND 'subscription_status' = ANY(al.changed_fields)
              AND (al.new_values->>'subscription_status') = 'past_due'
              THEN 'payment_past_due'
            WHEN al.operation = 'UPDATE'
              AND 'subscription_status' = ANY(al.changed_fields)
              AND (al.new_values->>'subscription_status') = 'cancelled'
              THEN 'subscription_cancelled'
            WHEN al.operation = 'UPDATE'
              AND 'subscription_status' = ANY(al.changed_fields)
              AND (al.new_values->>'subscription_status') = 'suspended'
              THEN 'subscription_suspended'
            WHEN al.operation = 'UPDATE'
              AND 'trial_ends_at' = ANY(al.changed_fields)
              AND NOT ('subscription_status' = ANY(al.changed_fields))
              THEN 'trial_extended'
            WHEN al.operation = 'UPDATE'
              AND 'subscription_tier' = ANY(al.changed_fields)
              THEN 'plan_changed'
            ELSE NULL
          END,
        'actor_id',        al.actor_id,
        'actor_email',     al.actor_email,
        'occurred_at',     al.occurred_at,
        'old_tier',        al.old_values->>'subscription_tier',
        'new_tier',        al.new_values->>'subscription_tier',
        'old_status',      al.old_values->>'subscription_status',
        'new_status',      al.new_values->>'subscription_status',
        'old_trial_ends',  al.old_values->>'trial_ends_at',
        'new_trial_ends',  al.new_values->>'trial_ends_at'
      ) AS evt,
      al.occurred_at
    FROM public.audit_logs al
    WHERE al.organization_id = p_org_id
    AND   al.entity_type     = 'organizations'
    AND (
      al.operation = 'INSERT'
      OR (
        al.operation = 'UPDATE'
        AND al.changed_fields && ARRAY['subscription_status','subscription_tier','trial_ends_at']
      )
    )
    ORDER BY al.occurred_at DESC
    LIMIT 100
  ) t
  WHERE t.evt->>'event_type' IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_subscription_history(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_subscription_history(uuid) TO service_role;
