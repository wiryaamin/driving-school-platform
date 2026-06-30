-- Phase 1D QA Fixes
-- Fix B-1: Standardize severity classification across audit log and security events.
--          Memberships were 'high' in get_platform_audit_log but 'medium' in
--          get_platform_security_events. Both now delegate to audit_event_severity().
-- Fix B-2: Audit date_to filter now includes the full calendar day.
--          Previously: occurred_at <= date_to (excluded events after midnight on date_to)
--          Fixed:      occurred_at <  date_to + interval '1 day'
-- Optional: Centralized audit_event_severity() helper eliminates future divergence.

-- ─── Centralized severity helper ──────────────────────────────────────────────
-- IMMUTABLE — inlinable by the planner. Single definition used by both audit RPCs.
-- Updating this function propagates to all callers automatically.

CREATE OR REPLACE FUNCTION public.audit_event_severity(
  p_entity_type    text,
  p_changed_fields text[]
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_entity_type = 'platform_admins'
      THEN 'critical'
    WHEN p_entity_type IN ('user_role_assignments', 'memberships')
      THEN 'high'
    WHEN p_entity_type = 'organizations'
      AND p_changed_fields IS NOT NULL
      AND p_changed_fields && ARRAY['status']
      THEN 'high'
    WHEN p_entity_type = 'organizations'
      AND p_changed_fields IS NOT NULL
      AND p_changed_fields && ARRAY['subscription_tier', 'subscription_status']
      THEN 'medium'
    ELSE 'low'
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_event_severity(text, text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.audit_event_severity(text, text[]) TO service_role;

-- ─── Fix B-1 + B-2: Reissue get_platform_audit_log ──────────────────────────
-- B-1: Replaces inline severity CASE with audit_event_severity() helper.
--      memberships severity was already 'high' here — unchanged.
-- B-2: date_to comparison changed from <= to < date_to + interval '1 day'
--      so the selected end date includes events for the full calendar day.
--      Single-day: date_from = date_to = '2026-06-25'
--        → occurred_at >= '2026-06-25 00:00:00+00' AND < '2026-06-26 00:00:00+00' ✓
--      Multi-day: date_from = '2026-06-01', date_to = '2026-06-30'
--        → all events in June ✓

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
    AND  (p_date_to     IS NULL OR al.occurred_at  < p_date_to + interval '1 day');

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
      'severity',        public.audit_event_severity(al.entity_type, al.changed_fields)
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
      AND (p_date_to     IS NULL OR al.occurred_at  < p_date_to + interval '1 day')
    ORDER BY al.occurred_at DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) t;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_audit_log(uuid, text, text, text, timestamptz, timestamptz, int, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_audit_log(uuid, text, text, text, timestamptz, timestamptz, int, int) TO service_role;

-- ─── Fix B-1: Reissue get_platform_security_events ───────────────────────────
-- Replaces inline severity CASE with audit_event_severity() helper.
-- memberships: was 'medium' (wrong) → now 'high' via helper (matches audit log).

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
      'severity',        public.audit_event_severity(al.entity_type, al.changed_fields)
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
