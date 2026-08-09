-- =============================================================================
-- Platform Administration → SaaS Operations Console (Information Architecture)
--
-- Four platform-wide aggregate RPCs, each reusing an existing table/view
-- rather than introducing new tracking: event_outbox_health (view, already
-- built for the tenant-scoped Communications module), outbound_messages
-- (existing), students' GDPR/consent columns + regulatory_workflows (existing,
-- already used per-org in 20260729000001), and event_outbox + organizations
-- (existing) for the recovery queue. No new business functionality — this is
-- the platform-wide counterpart to data that was previously only queryable
-- one organization at a time.
-- =============================================================================

-- ─── 1. Operations Center summary ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_platform_operations_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pending_count',     COALESCE((SELECT SUM(pending_count)     FROM public.event_outbox_health), 0),
    'processing_count',  COALESCE((SELECT SUM(processing_count)  FROM public.event_outbox_health), 0),
    'dead_letter_count', COALESCE((SELECT SUM(dead_letter_count) FROM public.event_outbox_health), 0),
    'failed_count',      COALESCE((SELECT SUM(failed_count)      FROM public.event_outbox_health), 0),
    'top_offenders', (
      SELECT COALESCE(jsonb_agg(t.row_data ORDER BY t.dl DESC), '[]'::jsonb)
      FROM (
        SELECT
          jsonb_build_object(
            'organization_id', h.organization_id,
            'org_name',        o.name,
            'event_type',      h.event_type,
            'pending_count',   h.pending_count,
            'dead_letter_count', h.dead_letter_count,
            'oldest_pending_at', h.oldest_pending_at
          ) AS row_data,
          h.dead_letter_count AS dl
        FROM public.event_outbox_health h
        LEFT JOIN public.organizations o ON o.id = h.organization_id
        WHERE h.dead_letter_count > 0 OR h.pending_count > 0
        ORDER BY h.dead_letter_count DESC, h.pending_count DESC
        LIMIT 20
      ) t
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_operations_summary() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_operations_summary() TO service_role;

-- ─── 2. Communications summary ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_platform_communications_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'by_channel', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'channel', channel,
        'sent',    COALESCE(sent, 0),
        'failed',  COALESCE(failed, 0),
        'pending', COALESCE(pending, 0)
      )), '[]'::jsonb)
      FROM (
        SELECT
          channel,
          COUNT(*) FILTER (WHERE status IN ('sent', 'delivered'))::int AS sent,
          COUNT(*) FILTER (WHERE status = 'failed')::int               AS failed,
          COUNT(*) FILTER (WHERE status IN ('pending', 'queued'))::int AS pending
        FROM public.outbound_messages
        WHERE deleted_at IS NULL AND created_at > now() - interval '7 days'
        GROUP BY channel
      ) c
    ),
    'recent_failed', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', m.id, 'organization_id', m.organization_id, 'org_name', o.name,
        'channel', m.channel, 'recipient_address', m.recipient_address,
        'error_message', m.error_message, 'retry_count', m.retry_count, 'created_at', m.created_at
      ) ORDER BY m.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM public.outbound_messages
        WHERE deleted_at IS NULL AND status = 'failed'
        ORDER BY created_at DESC
        LIMIT 20
      ) m
      LEFT JOIN public.organizations o ON o.id = m.organization_id
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_communications_summary() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_communications_summary() TO service_role;

-- ─── 3. Compliance summary (platform-wide) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_platform_compliance_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_students',           (SELECT COUNT(*)::int FROM public.students WHERE deleted_at IS NULL),
    'gdpr_consent_given_count', (SELECT COUNT(*)::int FROM public.students WHERE deleted_at IS NULL AND gdpr_consent_given_at IS NOT NULL),
    'regulatory_total',         (SELECT COUNT(*)::int FROM public.regulatory_workflows WHERE deleted_at IS NULL),
    'regulatory_overdue',       (SELECT COUNT(*)::int FROM public.regulatory_workflows WHERE deleted_at IS NULL AND due_date < now() AND confirmed_at IS NULL),
    'orgs_with_overdue_workflows', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'organization_id', t.organization_id, 'org_name', t.org_name, 'overdue_count', t.overdue_count
      ) ORDER BY t.overdue_count DESC), '[]'::jsonb)
      FROM (
        SELECT rw.organization_id, o.name AS org_name, COUNT(*)::int AS overdue_count
        FROM public.regulatory_workflows rw
        JOIN public.organizations o ON o.id = rw.organization_id
        WHERE rw.deleted_at IS NULL AND rw.due_date < now() AND rw.confirmed_at IS NULL
        GROUP BY rw.organization_id, o.name
        ORDER BY COUNT(*) DESC
        LIMIT 20
      ) t
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_compliance_summary() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_compliance_summary() TO service_role;

-- ─── 4. Recovery queue ──────────────────────────────────────────────────────
-- Cross-org list of organizations with something a Platform Administrator
-- would want to retry — reuses event_outbox exactly like
-- get_platform_operations_summary, framed around "what needs action" rather
-- than "what is the aggregate backlog."

CREATE OR REPLACE FUNCTION public.get_platform_recovery_queue()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'organization_id',   t.organization_id,
    'org_name',          t.org_name,
    'dead_letter_count', t.dead_letter_count,
    'failed_message_count', t.failed_message_count,
    'oldest_issue_at',   t.oldest_issue_at
  ) ORDER BY t.dead_letter_count DESC), '[]'::jsonb)
  FROM (
    SELECT
      o.id AS organization_id,
      o.name AS org_name,
      COALESCE((SELECT SUM(dead_letter_count) FROM public.event_outbox_health WHERE organization_id = o.id), 0)::int AS dead_letter_count,
      (SELECT COUNT(*)::int FROM public.outbound_messages WHERE organization_id = o.id AND status = 'failed' AND deleted_at IS NULL) AS failed_message_count,
      LEAST(
        (SELECT MIN(dead_lettered_at) FROM public.event_outbox WHERE organization_id = o.id AND status = 'dead_letter'),
        (SELECT MIN(created_at) FROM public.outbound_messages WHERE organization_id = o.id AND status = 'failed' AND deleted_at IS NULL)
      ) AS oldest_issue_at
    FROM public.organizations o
    WHERE o.deleted_at IS NULL
  ) t
  WHERE t.dead_letter_count > 0 OR t.failed_message_count > 0;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_recovery_queue() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_recovery_queue() TO service_role;
