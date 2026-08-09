-- =============================================================================
-- Platform Administration → SaaS Operations Console
--
-- Adds the small set of genuinely-missing data-layer pieces needed to
-- consolidate customer operations into Platform Administration, so a
-- Platform Administrator almost never needs Supabase Dashboard for normal
-- operations. Everything here reuses existing tables (identity_security_events,
-- event_outbox, students' GDPR/consent columns, regulatory_workflows) —
-- no new business functionality, no parallel implementations.
-- =============================================================================

-- ─── 1. Organization-scoped security events ────────────────────────────────
-- get_platform_security_events() is platform-wide only. Reuses the exact
-- same identity_security_events table, just filtered to one organization,
-- for the new per-org Security tab.

CREATE OR REPLACE FUNCTION public.get_platform_org_security_events(p_org_id uuid, p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(t.evt ORDER BY t.occurred_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      jsonb_build_object(
        'id',              e.id,
        'event_type',      e.event_type,
        'provider',        e.provider,
        'severity',        e.severity,
        'user_id',         e.user_id,
        'actor_email',     e.actor_email,
        'ip_address',      e.ip_address,
        'occurred_at',     e.occurred_at,
        'metadata',        e.metadata
      ) AS evt,
      e.occurred_at AS occurred_at
    FROM public.identity_security_events e
    WHERE e.organization_id = p_org_id
    ORDER BY e.occurred_at DESC
    LIMIT p_limit
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_security_events(uuid, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_org_security_events(uuid, int) TO service_role;

-- ─── 2. Organization compliance summary ────────────────────────────────────
-- Aggregates the GDPR/consent columns that already exist on students, plus
-- the existing regulatory_workflows table — no new compliance subsystem.

CREATE OR REPLACE FUNCTION public.get_platform_org_compliance(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'org_status', (SELECT status FROM public.organizations WHERE id = p_org_id),
    'student_consent', jsonb_build_object(
      'total_students',            (SELECT COUNT(*)::int FROM public.students WHERE organization_id = p_org_id AND deleted_at IS NULL),
      'gdpr_consent_given_count',  (SELECT COUNT(*)::int FROM public.students WHERE organization_id = p_org_id AND deleted_at IS NULL AND gdpr_consent_given_at IS NOT NULL),
      'data_processing_consent_count', (SELECT COUNT(*)::int FROM public.students WHERE organization_id = p_org_id AND deleted_at IS NULL AND data_processing_consent = true),
      'marketing_consent_count',   (SELECT COUNT(*)::int FROM public.students WHERE organization_id = p_org_id AND deleted_at IS NULL AND marketing_consent = true),
      'email_opt_in_count',        (SELECT COUNT(*)::int FROM public.students WHERE organization_id = p_org_id AND deleted_at IS NULL AND communication_opt_in_email = true),
      'sms_opt_in_count',          (SELECT COUNT(*)::int FROM public.students WHERE organization_id = p_org_id AND deleted_at IS NULL AND communication_opt_in_sms = true)
    ),
    'regulatory_workflows', jsonb_build_object(
      'total',      (SELECT COUNT(*)::int FROM public.regulatory_workflows WHERE organization_id = p_org_id AND deleted_at IS NULL),
      'overdue',    (SELECT COUNT(*)::int FROM public.regulatory_workflows WHERE organization_id = p_org_id AND deleted_at IS NULL AND due_date < now() AND confirmed_at IS NULL),
      'confirmed',  (SELECT COUNT(*)::int FROM public.regulatory_workflows WHERE organization_id = p_org_id AND deleted_at IS NULL AND confirmed_at IS NOT NULL)
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_compliance(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_org_compliance(uuid) TO service_role;

-- ─── 3. Organization operational health (queue / dead-letter) ──────────────
-- Reuses event_outbox exactly as QueueMonitorPage / requeue_dead_letter_events
-- already do, scoped to one organization instead of platform-wide.

CREATE OR REPLACE FUNCTION public.get_platform_org_operations(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pending_count',      (SELECT COUNT(*)::int FROM public.event_outbox WHERE organization_id = p_org_id AND status = 'pending'),
    'processing_count',   (SELECT COUNT(*)::int FROM public.event_outbox WHERE organization_id = p_org_id AND status = 'processing'),
    'dead_letter_count',  (SELECT COUNT(*)::int FROM public.event_outbox WHERE organization_id = p_org_id AND status = 'dead_letter'),
    'failed_last_24h',    (SELECT COUNT(*)::int FROM public.event_outbox WHERE organization_id = p_org_id AND status = 'dead_letter' AND dead_lettered_at > now() - interval '24 hours'),
    'recent_dead_letters', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id, 'event_type', d.event_type, 'channel', d.channel,
        'retry_count', d.retry_count, 'last_error', d.last_error,
        'dead_lettered_at', d.dead_lettered_at
      ) ORDER BY d.dead_lettered_at DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM public.event_outbox
        WHERE organization_id = p_org_id AND status = 'dead_letter'
        ORDER BY dead_lettered_at DESC
        LIMIT 20
      ) d
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_operations(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_org_operations(uuid) TO service_role;

-- ─── 4. Internal support notes ─────────────────────────────────────────────
-- Platform-admin-only field (not exposed to tenant RLS-scoped reads) for
-- support-context notes on an organization, per the Support operational area.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS internal_notes_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS internal_notes_updated_by uuid REFERENCES auth.users(id);
