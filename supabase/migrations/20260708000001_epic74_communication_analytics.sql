-- =============================================================================
-- MIGRATION: 20260708000001_epic74_communication_analytics.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Epic:      7.4 — Communication Analytics, Monitoring & Operational Insights
-- Description:
--   1. worker_run_log            — domain-neutral worker execution history table,
--                                   modeled directly on the Phase 2E
--                                   scheduling_maintenance_operations pattern
--                                   (append-only, begin_*/complete_* SECURITY
--                                   DEFINER write path, platform-admin read).
--                                   Independent from scheduling_generation_runs,
--                                   scheduling_maintenance_operations, audit_logs,
--                                   and all replay_* infrastructure.
--   2. event_outbox_health        — view: per-org/event_type outbox backlog
--                                   (pending/processing/dead_letter counts, oldest
--                                   pending age). Same shape/grant convention as
--                                   communication_queue_health (20260619000004).
--   3. communication_template_usage — view: per-org/template/channel/status counts
--                                   over outbound_messages, same shape as
--                                   communication_daily_stats.
--   4. communication_delivery_latency_daily — view: per-org/channel/day average
--                                   dispatch latency (sent_at - created_at) over
--                                   outbound_messages.
--   5. get_platform_worker_runs / get_platform_worker_run_summary — platform-admin
--                                   RPCs, same convention as the Phase 1D
--                                   get_platform_audit_log family.
--
-- Architecture note: this migration introduces no new invariants, lock
-- strategy, or grant model — every object is a structural copy of an
-- already-approved pattern applied to the Communication domain.
-- =============================================================================


-- =============================================================================
-- SECTION 1: WORKER_RUN_LOG (EXECUTION HISTORY)
-- Tracks every invocation of any background worker (event-worker,
-- communication-worker, and any future worker) as a single append-only row.
--
-- Cross-tenant by design: a worker invocation processes ALL organizations in
-- one run, so — unlike scheduling_generation_runs / scheduling_maintenance_
-- operations — this table intentionally carries no organization_id / org FK.
--
-- WRITE PATH: SECURITY DEFINER helpers only — begin_worker_run() /
--   complete_worker_run(). No direct INSERT/UPDATE via REST API. The absence
--   of write RLS policies enforces this at the database level.
-- READ PATH: platform admins only (via platform-admin Edge Function, which
--   uses the service-role client and its own is_platform_admin check — the
--   RLS policy below is a second, independent layer of defense).
--
-- worker_name is a free-text identifier (no CHECK enum) so additional workers
-- can be recorded later without a schema change. Examples: 'event-worker',
-- 'communication-worker'.
-- =============================================================================

CREATE TABLE public.worker_run_log (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
  worker_name        text        NOT NULL,

  run_status         text        NOT NULL DEFAULT 'running',

  started_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  duration_ms        integer,

  processed_count    integer     NOT NULL DEFAULT 0,
  success_count      integer     NOT NULL DEFAULT 0,
  failed_count       integer     NOT NULL DEFAULT 0,
  retry_count        integer     NOT NULL DEFAULT 0,
  dead_letter_count  integer     NOT NULL DEFAULT 0,

  error_summary      text,
  metadata           jsonb       NOT NULL DEFAULT '{}',

  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT worker_run_log_pkey            PRIMARY KEY (id),
  CONSTRAINT worker_run_log_name_nn         CHECK (btrim(worker_name) <> ''),
  CONSTRAINT worker_run_log_status_check    CHECK (
    run_status IN ('running', 'completed', 'failed', 'partial')
  ),
  CONSTRAINT worker_run_log_completed_check CHECK (
    completed_at IS NULL OR completed_at >= started_at
  ),
  CONSTRAINT worker_run_log_counts_nn       CHECK (
    processed_count   >= 0 AND success_count  >= 0 AND failed_count >= 0 AND
    retry_count       >= 0 AND dead_letter_count >= 0
  )
);

COMMENT ON TABLE  public.worker_run_log IS
  'Domain-neutral, append-only execution history for background workers. '
  'Written exclusively through begin_worker_run() / complete_worker_run() '
  'SECURITY DEFINER helpers — mirrors the Phase 2E scheduling_maintenance_operations '
  'pattern. Cross-tenant (no organization_id): a single invocation processes all orgs.';
COMMENT ON COLUMN public.worker_run_log.worker_name IS
  'Free-text worker identifier, e.g. ''event-worker'', ''communication-worker''. '
  'No CHECK enum — new workers are recorded without a migration.';
COMMENT ON COLUMN public.worker_run_log.metadata IS
  'Extensible payload set at completion time: per-worker metric breakdowns '
  '(e.g. events_dead_lettered, reminders_processed) beyond the generic counters above.';

REVOKE ALL ON TABLE public.worker_run_log FROM anon;

ALTER TABLE public.worker_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "worker_run_log_select_platform"
  ON public.worker_run_log FOR SELECT
  USING (public.is_platform_admin());

-- Dashboard: most recent runs per worker
CREATE INDEX idx_worker_run_log_name_started
  ON public.worker_run_log (worker_name, started_at DESC);

-- Stuck-run detection: runs stuck in 'running' beyond expected duration
CREATE INDEX idx_worker_run_log_running
  ON public.worker_run_log (started_at)
  WHERE run_status = 'running';

-- Incident response: failed or partial runs
CREATE INDEX idx_worker_run_log_failed
  ON public.worker_run_log (worker_name, started_at DESC)
  WHERE run_status IN ('failed', 'partial');


-- =============================================================================
-- SECTION 2: begin_worker_run() / complete_worker_run()
-- Structured begin/complete lifecycle pattern — direct structural copy of
-- begin_maintenance_operation() / complete_maintenance_operation()
-- (20260528000010_phase2e_admin_infra.sql).
--
-- GRANT POLICY: not granted to 'authenticated'. Called only from service-role
-- Edge Functions (event-worker, communication-worker) to prevent fake
-- execution-log injection via REST API.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.begin_worker_run(
  p_worker_name text,
  p_metadata    jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
BEGIN
  INSERT INTO public.worker_run_log (
    worker_name, run_status, metadata
  ) VALUES (
    p_worker_name, 'running', COALESCE(p_metadata, '{}')
  )
  RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION public.begin_worker_run(text, jsonb) IS
  'Opens a new worker_run_log record in ''running'' state. Returns the run UUID '
  'for use with complete_worker_run(). Call at the start of every worker invocation.';

CREATE OR REPLACE FUNCTION public.complete_worker_run(
  p_run_id            uuid,
  p_status             text,           -- 'completed' | 'failed' | 'partial'
  p_processed_count    integer DEFAULT 0,
  p_success_count      integer DEFAULT 0,
  p_failed_count       integer DEFAULT 0,
  p_retry_count        integer DEFAULT 0,
  p_dead_letter_count  integer DEFAULT 0,
  p_error_summary      text    DEFAULT NULL,
  p_metadata           jsonb   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started_at timestamptz;
BEGIN
  SELECT started_at INTO v_started_at FROM public.worker_run_log WHERE id = p_run_id;

  UPDATE public.worker_run_log
  SET
    run_status        = p_status,
    completed_at       = now(),
    duration_ms         = CASE WHEN v_started_at IS NOT NULL
                            THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (now() - v_started_at)) * 1000))::integer
                            ELSE duration_ms END,
    processed_count      = p_processed_count,
    success_count         = p_success_count,
    failed_count           = p_failed_count,
    retry_count             = p_retry_count,
    dead_letter_count        = p_dead_letter_count,
    error_summary             = p_error_summary,
    metadata                  = CASE WHEN p_metadata IS NOT NULL
                                 THEN metadata || p_metadata
                                 ELSE metadata END
  WHERE id = p_run_id;
END;
$$;

COMMENT ON FUNCTION public.complete_worker_run(uuid, text, integer, integer, integer, integer, integer, text, jsonb) IS
  'Finalises a worker_run_log record. Call on both success and failure paths. '
  'p_metadata is merged into existing metadata; p_error_summary set only on failure/partial.';

REVOKE ALL ON FUNCTION public.begin_worker_run(text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.begin_worker_run(text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.complete_worker_run(uuid, text, integer, integer, integer, integer, integer, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complete_worker_run(uuid, text, integer, integer, integer, integer, integer, text, jsonb) TO service_role;


-- =============================================================================
-- SECTION 3: EVENT_OUTBOX_HEALTH (VIEW)
-- Per-org/event_type backlog snapshot of event_outbox. Same shape/grant
-- convention as communication_queue_health (20260619000004_comm_analytics_views.sql).
-- =============================================================================

CREATE OR REPLACE VIEW public.event_outbox_health AS
SELECT
  organization_id,
  event_type,
  COUNT(*) FILTER (WHERE status = 'pending')::INT                    AS pending_count,
  COUNT(*) FILTER (WHERE status = 'processing')::INT                 AS processing_count,
  COUNT(*) FILTER (WHERE status = 'dead_letter')::INT                AS dead_letter_count,
  COUNT(*) FILTER (WHERE status = 'failed')::INT                     AS failed_count,
  MIN(created_at) FILTER (WHERE status IN ('pending', 'processing')) AS oldest_pending_at
FROM public.event_outbox
GROUP BY organization_id, event_type;

COMMENT ON VIEW public.event_outbox_health IS
  'Real-time event-outbox backlog snapshot per org/event_type. Queried by the '
  'communications Edge Function outbox-health route.';

GRANT SELECT ON public.event_outbox_health TO service_role;


-- =============================================================================
-- SECTION 4: COMMUNICATION_TEMPLATE_USAGE (VIEW)
-- Per-org/template/channel/status message counts. Same shape as
-- communication_daily_stats — the Edge Function aggregates further.
-- =============================================================================

CREATE OR REPLACE VIEW public.communication_template_usage AS
SELECT
  om.organization_id,
  om.template_id,
  nt.key    AS template_key,
  om.channel,
  om.status,
  COUNT(*)::INT AS message_count
FROM public.outbound_messages om
LEFT JOIN public.notification_templates nt ON nt.id = om.template_id
WHERE om.deleted_at IS NULL
  AND om.template_id IS NOT NULL
GROUP BY om.organization_id, om.template_id, nt.key, om.channel, om.status;

COMMENT ON VIEW public.communication_template_usage IS
  'Message counts per org/template/channel/status. Queried by the communications '
  'Edge Function analytics route (format=templates).';

GRANT SELECT ON public.communication_template_usage TO service_role;


-- =============================================================================
-- SECTION 5: COMMUNICATION_DELIVERY_LATENCY_DAILY (VIEW)
-- Per-org/channel/day average dispatch latency (created_at -> sent_at) over
-- delivered outbound_messages. Requires no schema change — both timestamp
-- columns already exist on outbound_messages.
-- =============================================================================

CREATE OR REPLACE VIEW public.communication_delivery_latency_daily AS
SELECT
  organization_id,
  channel,
  DATE(created_at AT TIME ZONE 'UTC')::TEXT AS stat_date,
  ROUND(AVG(EXTRACT(EPOCH FROM (sent_at - created_at))))::INT AS avg_latency_seconds,
  COUNT(*)::INT                                                AS delivered_count
FROM public.outbound_messages
WHERE deleted_at IS NULL
  AND sent_at    IS NOT NULL
  AND status     IN ('sent', 'delivered')
GROUP BY organization_id, channel, DATE(created_at AT TIME ZONE 'UTC');

COMMENT ON VIEW public.communication_delivery_latency_daily IS
  'Average dispatch latency (seconds) per org/channel/day. Queried by the '
  'communications Edge Function analytics route (format=latency).';

GRANT SELECT ON public.communication_delivery_latency_daily TO service_role;


-- =============================================================================
-- SECTION 6: PLATFORM-ADMIN WORKER RUN RPCs
-- Same convention as the Phase 1D get_platform_audit_log family
-- (20260703000002_phase1d_operations_rpcs.sql): SECURITY DEFINER, STABLE,
-- REVOKE FROM PUBLIC, GRANT to service_role only. Returns { total, rows }.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_platform_worker_runs(
  p_worker_name text        DEFAULT NULL,
  p_status      text        DEFAULT NULL,
  p_limit       int         DEFAULT 50,
  p_offset      int         DEFAULT 0
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
  FROM   public.worker_run_log wrl
  WHERE  (p_worker_name IS NULL OR wrl.worker_name = p_worker_name)
    AND  (p_status      IS NULL OR wrl.run_status  = p_status);

  SELECT COALESCE(jsonb_agg(t.run ORDER BY t.started_at DESC), '[]'::jsonb)
  INTO   v_rows
  FROM (
    SELECT
      wrl.started_at,
      jsonb_build_object(
        'id',                wrl.id,
        'worker_name',       wrl.worker_name,
        'run_status',        wrl.run_status,
        'started_at',        wrl.started_at,
        'completed_at',      wrl.completed_at,
        'duration_ms',       wrl.duration_ms,
        'processed_count',   wrl.processed_count,
        'success_count',     wrl.success_count,
        'failed_count',      wrl.failed_count,
        'retry_count',       wrl.retry_count,
        'dead_letter_count', wrl.dead_letter_count,
        'error_summary',     wrl.error_summary,
        'metadata',          wrl.metadata
      ) AS run
    FROM public.worker_run_log wrl
    WHERE (p_worker_name IS NULL OR wrl.worker_name = p_worker_name)
      AND (p_status      IS NULL OR wrl.run_status  = p_status)
    ORDER BY wrl.started_at DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) t;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

COMMENT ON FUNCTION public.get_platform_worker_runs(text, text, int, int) IS
  'Paginated worker_run_log listing for the platform ops center. Platform-admin only.';

REVOKE ALL ON FUNCTION public.get_platform_worker_runs(text, text, int, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_worker_runs(text, text, int, int) TO service_role;

-- ─── Worker run summary — latest run + rolling 24h stats per worker_name ──────

CREATE OR REPLACE FUNCTION public.get_platform_worker_run_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (worker_name)
      worker_name, run_status, started_at, completed_at, duration_ms, error_summary
    FROM public.worker_run_log
    ORDER BY worker_name, started_at DESC
  ),
  rolling AS (
    SELECT
      worker_name,
      COUNT(*)::INT                                              AS runs_24h,
      COUNT(*) FILTER (WHERE run_status = 'failed')::INT         AS failed_24h,
      COUNT(*) FILTER (WHERE run_status = 'running'
                        AND started_at < now() - interval '15 minutes')::INT AS stuck_count,
      ROUND(AVG(duration_ms))::INT                               AS avg_duration_ms
    FROM public.worker_run_log
    WHERE started_at >= now() - interval '24 hours'
    GROUP BY worker_name
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'worker_name',        l.worker_name,
      'last_run_status',    l.run_status,
      'last_started_at',    l.started_at,
      'last_completed_at',  l.completed_at,
      'last_duration_ms',   l.duration_ms,
      'last_error_summary', l.error_summary,
      'runs_24h',           COALESCE(r.runs_24h, 0),
      'failed_24h',         COALESCE(r.failed_24h, 0),
      'stuck_count',        COALESCE(r.stuck_count, 0),
      'avg_duration_ms_24h', r.avg_duration_ms
    )
    ORDER BY l.worker_name
  ), '[]'::jsonb)
  FROM latest l
  LEFT JOIN rolling r ON r.worker_name = l.worker_name;
$$;

COMMENT ON FUNCTION public.get_platform_worker_run_summary() IS
  'Latest run + rolling 24h health per worker_name, for platform ops center KPI tiles.';

REVOKE ALL ON FUNCTION public.get_platform_worker_run_summary() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_worker_run_summary() TO service_role;
