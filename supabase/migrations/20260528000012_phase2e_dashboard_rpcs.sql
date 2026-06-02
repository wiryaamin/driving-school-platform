-- =============================================================================
-- MIGRATION: 20260528000012_phase2e_dashboard_rpcs.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2E — Scheduling Administration & Dashboard Infrastructure (3 of 4)
-- Description:
--   Three SECURITY DEFINER read-only RPC functions for dashboard data aggregation.
--   Each function returns a single JSONB payload covering its domain.
--   All are read-only — they never mutate data.
--
--   get_scheduling_dashboard(org_id)
--     Health + slot inventory + booking summary + generation summary.
--     Primary entry point for the main scheduling operations screen.
--
--   get_generation_dashboard(org_id)
--     Generation configs + failed runs + retry metrics + horizon coverage.
--     Used by the generation administration panel and workers.
--
--   get_capacity_dashboard(org_id)
--     Instructor utilization + lesson type capacity + weekly slot availability
--     + booking density by day-of-week.
--     Used by capacity planning and school management.
--
-- Security:
--   SECURITY DEFINER + internal permission guards. Background workers
--   (auth.uid() IS NULL) bypass guards by design.
--   Reads go directly to tables (not views) for tighter control over
--   what is included in each payload.
--
-- Performance:
--   All queries are bounded by org_id (single tenant at a time).
--   Slot queries filtered to future slots (starts_at >= CURRENT_TIMESTAMP).
--   Complex aggregations are isolated per JSONB section so partial results
--   can be returned even if one section is slow.
--
-- Execution order: must run after 20260528000011_phase2e_read_models.sql
-- =============================================================================


-- =============================================================================
-- SECTION 1: get_scheduling_dashboard(org_id)
-- Returns: health + slot inventory + booking summary + generation summary
-- Permission: scheduling:health:read
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_scheduling_dashboard(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_health          jsonb;
  v_slot_inventory  jsonb;
  v_booking_summary jsonb;
  v_gen_summary     jsonb;
BEGIN
  -- Permission guard (skipped for background workers: auth.uid() IS NULL)
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      IF public.auth_organization_id() IS DISTINCT FROM p_organization_id
         OR NOT public.has_permission('scheduling:health:read')
      THEN
        RAISE EXCEPTION 'permission denied for get_scheduling_dashboard'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- ── HEALTH SUMMARY ──────────────────────────────────────────────────────────
  -- Latest snapshot, or null-filled object when no snapshot exists yet.
  SELECT jsonb_build_object(
    'health_status',          hs.health_status,
    'snapshot_date',          hs.snapshot_date,
    'future_slots_count',     hs.future_slots_count,
    'open_slots_count',       hs.open_slots_count,
    'booked_slots_count',     hs.booked_slots_count,
    'cancelled_slots_count',  hs.cancelled_slots_count,
    'orphaned_slots_count',   hs.orphaned_slots_count,
    'overlapping_detected',   hs.overlapping_slots_detected,
    'generation_lag_days',    hs.generation_lag_days,
    'failed_generation_runs', hs.failed_generation_runs,
    'snapshot_captured_at',   hs.created_at
  )
  INTO v_health
  FROM public.scheduling_health_snapshots hs
  WHERE hs.organization_id = p_organization_id
  ORDER BY hs.snapshot_date DESC
  LIMIT 1;

  -- ── SLOT INVENTORY SUMMARY ──────────────────────────────────────────────────
  -- Live counts from lesson_slots (not cached snapshot) for real-time accuracy.
  SELECT jsonb_build_object(
    'total_future_slots',   COUNT(*),
    'open_slots',           COUNT(*) FILTER (WHERE status = 'open'),
    'full_slots',           COUNT(*) FILTER (WHERE status = 'full'),
    'in_progress_slots',    COUNT(*) FILTER (WHERE status = 'in_progress'),
    'cancelled_slots',      COUNT(*) FILTER (WHERE status = 'cancelled'),
    'blocked_slots',        COUNT(*) FILTER (WHERE status = 'blocked'),
    'utilization_pct',      ROUND(
      COUNT(*) FILTER (WHERE status IN ('full', 'in_progress'))::numeric
      / NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'blocked')), 0)
      * 100, 1
    ),
    'active_instructors',   COUNT(DISTINCT instructor_id),
    'active_lesson_types',  COUNT(DISTINCT lesson_type_id)
  )
  INTO v_slot_inventory
  FROM public.lesson_slots
  WHERE organization_id = p_organization_id
    AND deleted_at IS NULL
    AND starts_at >= CURRENT_TIMESTAMP;

  -- ── BOOKING SUMMARY (LAST 30 DAYS) ──────────────────────────────────────────
  SELECT jsonb_build_object(
    'total_bookings_30d',       COUNT(*),
    'active_bookings_30d',      COUNT(*) FILTER (WHERE lb.status IN ('draft', 'reserved', 'confirmed')),
    'cancellations_30d',        COUNT(*) FILTER (WHERE lb.status = 'cancelled'),
    'completions_30d',          COUNT(*) FILTER (WHERE lb.status = 'completed'),
    'no_shows_30d',             COUNT(*) FILTER (WHERE lb.status = 'no_show'),
    'rescheduled_30d',          COUNT(*) FILTER (WHERE lb.status = 'rescheduled'),
    'unique_students_30d',      COUNT(DISTINCT lb.student_id),
    'cancellation_rate_30d',    ROUND(
      COUNT(*) FILTER (WHERE lb.status = 'cancelled')::numeric
      / NULLIF(COUNT(*), 0) * 100, 1
    )
  )
  INTO v_booking_summary
  FROM public.lesson_bookings lb
  WHERE lb.organization_id = p_organization_id
    AND lb.deleted_at IS NULL
    AND lb.created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days';

  -- ── GENERATION SUMMARY ──────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total_configs',       COUNT(*),
    'active_configs',      COUNT(*) FILTER (WHERE gc.is_active),
    'auto_enabled_configs',COUNT(*) FILTER (WHERE gc.auto_generation_enabled AND gc.is_active),
    'overdue_configs',     COUNT(*) FILTER (
      WHERE gc.auto_generation_enabled
        AND gc.is_active
        AND gc.next_generation_at IS NOT NULL
        AND gc.next_generation_at < now()
    ),
    'dead_letter_configs', COUNT(*) FILTER (
      WHERE gc.retry_count >= gc.max_retry_count AND NOT gc.is_active
    ),
    'failed_runs_7d',      (
      SELECT COUNT(*)
      FROM   public.scheduling_generation_runs r
      WHERE  r.organization_id = p_organization_id
        AND  r.status IN ('failed', 'partial')
        AND  r.started_at >= now() - INTERVAL '7 days'
    )
  )
  INTO v_gen_summary
  FROM public.scheduling_generation_configs gc
  WHERE gc.organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'organization_id',    p_organization_id,
    'generated_at',       now(),
    'health',             COALESCE(v_health, 'null'::jsonb),
    'slot_inventory',     COALESCE(v_slot_inventory, '{}'::jsonb),
    'booking_summary',    COALESCE(v_booking_summary, '{}'::jsonb),
    'generation_summary', COALESCE(v_gen_summary, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_scheduling_dashboard(uuid) IS
  'Main scheduling dashboard payload: health + slot inventory + booking summary + '
  'generation summary. Read-only. Permission: scheduling:health:read.';


-- =============================================================================
-- SECTION 2: get_generation_dashboard(org_id)
-- Returns: generation configs + failed runs + retry metrics + horizon coverage
-- Permission: scheduling:config:read OR scheduling:generation:read
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_generation_dashboard(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_configs       jsonb;
  v_failed_runs   jsonb;
  v_retry_metrics jsonb;
  v_horizon       jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      IF public.auth_organization_id() IS DISTINCT FROM p_organization_id
         OR NOT (
           public.has_permission('scheduling:config:read')
           OR public.has_permission('scheduling:generation:read')
         )
      THEN
        RAISE EXCEPTION 'permission denied for get_generation_dashboard'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- ── GENERATION CONFIGS ───────────────────────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'config_id',              gc.id,
      'lesson_type_id',         gc.lesson_type_id,
      'lesson_type_name',       lt.name,
      'lesson_type_code',       lt.code,
      'frequency',              gc.generation_frequency,
      'horizon_days',           gc.generation_horizon_days,
      'auto_enabled',           gc.auto_generation_enabled,
      'is_active',              gc.is_active,
      'last_generation_at',     gc.last_generation_at,
      'next_generation_at',     gc.next_generation_at,
      'retry_count',            gc.retry_count,
      'max_retry_count',        gc.max_retry_count,
      'failure_backoff_minutes',gc.failure_backoff_minutes,
      'is_dead_letter',         (gc.retry_count >= gc.max_retry_count AND NOT gc.is_active),
      'is_overdue',             (
        gc.auto_generation_enabled AND gc.is_active
        AND gc.next_generation_at IS NOT NULL
        AND gc.next_generation_at < now()
      ),
      'config_updated_at',      gc.updated_at
    )
    ORDER BY lt.name
  )
  INTO v_configs
  FROM public.scheduling_generation_configs gc
  LEFT JOIN public.lesson_types lt ON lt.id = gc.lesson_type_id
  WHERE gc.organization_id = p_organization_id;

  -- ── FAILED / PARTIAL RUNS (LAST 30 DAYS) ────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'run_id',          r.id,
      'status',          r.status,
      'lesson_type_id',  r.lesson_type_id,
      'lesson_type_name',lt.name,
      'scope',           r.generation_scope,
      'started_at',      r.started_at,
      'completed_at',    r.completed_at,
      'records_created', r.records_created,
      'conflicts',       r.conflicts_detected,
      'error_message',   r.error_message,
      'was_retried',     (r.metadata ->> 'retried_as') IS NOT NULL,
      'is_retry',        (r.metadata ->> 'retried_from') IS NOT NULL
    )
    ORDER BY r.started_at DESC
  )
  INTO v_failed_runs
  FROM public.scheduling_generation_runs r
  LEFT JOIN public.lesson_types lt ON lt.id = r.lesson_type_id
  WHERE r.organization_id = p_organization_id
    AND r.status IN ('failed', 'partial')
    AND r.started_at >= now() - INTERVAL '30 days';

  -- ── RETRY METRICS (LAST 30 DAYS) ────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total_runs_30d',      COUNT(*),
    'completed_30d',       COUNT(*) FILTER (WHERE r.status = 'completed'),
    'failed_30d',          COUNT(*) FILTER (WHERE r.status = 'failed'),
    'partial_30d',         COUNT(*) FILTER (WHERE r.status = 'partial'),
    'running_30d',         COUNT(*) FILTER (WHERE r.status = 'running'),
    'retried_runs_30d',    COUNT(*) FILTER (
      WHERE (r.metadata ->> 'retried_from') IS NOT NULL
    ),
    'success_rate_pct',    ROUND(
      COUNT(*) FILTER (WHERE r.status = 'completed')::numeric
      / NULLIF(COUNT(*) FILTER (WHERE r.status != 'running'), 0) * 100, 1
    ),
    'stale_running_count', (
      SELECT COUNT(*)
      FROM   public.scheduling_generation_runs sr
      WHERE  sr.organization_id = p_organization_id
        AND  sr.status = 'running'
        AND  sr.started_at < now() - INTERVAL '1 hour'
    )
  )
  INTO v_retry_metrics
  FROM public.scheduling_generation_runs r
  WHERE r.organization_id = p_organization_id
    AND r.started_at >= now() - INTERVAL '30 days';

  -- ── HORIZON COVERAGE ────────────────────────────────────────────────────────
  -- Gap = max configured horizon − (furthest future open slot date − today).
  -- Positive gap = generation is behind target horizon.
  -- NULL furthest_slot = no open future slots at all (full gap = horizon).
  SELECT jsonb_build_object(
    'max_config_horizon_days',  MAX(gc.generation_horizon_days),
    'furthest_open_slot_date',  MAX(ls.starts_at)::date,
    'coverage_days_ahead',      COALESCE(MAX(ls.starts_at)::date - CURRENT_DATE, 0),
    'coverage_gap_days',        GREATEST(0,
      MAX(gc.generation_horizon_days)
      - COALESCE(MAX(ls.starts_at)::date - CURRENT_DATE, 0)
    ),
    'auto_configs_count',       COUNT(gc.id) FILTER (
      WHERE gc.auto_generation_enabled AND gc.is_active
    )
  )
  INTO v_horizon
  FROM public.scheduling_generation_configs gc
  LEFT JOIN public.lesson_slots ls
    ON  ls.organization_id = gc.organization_id
    AND ls.deleted_at IS NULL
    AND ls.status = 'open'
    AND ls.starts_at >= CURRENT_TIMESTAMP
  WHERE gc.organization_id = p_organization_id
    AND gc.is_active = true;

  RETURN jsonb_build_object(
    'organization_id',  p_organization_id,
    'generated_at',     now(),
    'configs',          COALESCE(v_configs, '[]'::jsonb),
    'failed_runs',      COALESCE(v_failed_runs, '[]'::jsonb),
    'retry_metrics',    COALESCE(v_retry_metrics, '{}'::jsonb),
    'horizon',          COALESCE(v_horizon, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_generation_dashboard(uuid) IS
  'Generation administration payload: configs + failed runs + retry metrics + '
  'horizon coverage. Read-only. Permission: scheduling:config:read or scheduling:generation:read.';


-- =============================================================================
-- SECTION 3: get_capacity_dashboard(org_id)
-- Returns: instructor utilization + lesson type capacity + weekly availability
--          + booking density by day-of-week
-- Permission: scheduling:health:read
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_capacity_dashboard(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instructor_util jsonb;
  v_lesson_type_cap jsonb;
  v_weekly_avail    jsonb;
  v_booking_density jsonb;
  v_org_timezone    text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      IF public.auth_organization_id() IS DISTINCT FROM p_organization_id
         OR NOT public.has_permission('scheduling:health:read')
      THEN
        RAISE EXCEPTION 'permission denied for get_capacity_dashboard'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Resolve org timezone once for date grouping
  SELECT COALESCE(o.settings->>'timezone', 'Europe/Stockholm')
  INTO   v_org_timezone
  FROM   public.organizations o
  WHERE  o.id = p_organization_id;

  -- ── INSTRUCTOR UTILIZATION ───────────────────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'instructor_id',    ls.instructor_id,
      'total_slots',      COUNT(*),
      'active_slots',     COUNT(*) FILTER (WHERE ls.status NOT IN ('cancelled','blocked')),
      'open_slots',       COUNT(*) FILTER (WHERE ls.status = 'open'),
      'full_slots',       COUNT(*) FILTER (WHERE ls.status = 'full'),
      'utilization_pct',  ROUND(
        COUNT(*) FILTER (WHERE ls.status IN ('full','in_progress'))::numeric
        / NULLIF(COUNT(*) FILTER (WHERE ls.status NOT IN ('cancelled','blocked')), 0)
        * 100, 1
      ),
      'capacity_hours',   ROUND(
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (ls.ends_at - ls.starts_at)) / 3600.0
        ) FILTER (WHERE ls.status NOT IN ('cancelled','blocked')), 0), 1
      )
    )
    ORDER BY COUNT(*) FILTER (WHERE ls.status IN ('full','in_progress')) DESC
  )
  INTO v_instructor_util
  FROM public.lesson_slots ls
  WHERE ls.organization_id = p_organization_id
    AND ls.deleted_at IS NULL
    AND ls.starts_at >= CURRENT_TIMESTAMP
  GROUP BY ls.instructor_id;

  -- ── LESSON TYPE CAPACITY ─────────────────────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'lesson_type_id',   ls.lesson_type_id,
      'lesson_type_name', lt.name,
      'lesson_type_code', lt.code,
      'total_slots',      COUNT(*),
      'active_slots',     COUNT(*) FILTER (WHERE ls.status NOT IN ('cancelled','blocked')),
      'open_slots',       COUNT(*) FILTER (WHERE ls.status = 'open'),
      'full_slots',       COUNT(*) FILTER (WHERE ls.status = 'full'),
      'utilization_pct',  ROUND(
        COUNT(*) FILTER (WHERE ls.status IN ('full','in_progress'))::numeric
        / NULLIF(COUNT(*) FILTER (WHERE ls.status NOT IN ('cancelled','blocked')), 0)
        * 100, 1
      )
    )
    ORDER BY lt.name
  )
  INTO v_lesson_type_cap
  FROM public.lesson_slots ls
  LEFT JOIN public.lesson_types lt ON lt.id = ls.lesson_type_id
  WHERE ls.organization_id = p_organization_id
    AND ls.deleted_at IS NULL
    AND ls.starts_at >= CURRENT_TIMESTAMP
  GROUP BY ls.lesson_type_id, lt.name, lt.code;

  -- ── WEEKLY SLOT AVAILABILITY (NEXT 6 WEEKS) ──────────────────────────────────
  -- Grouped by ISO week start for calendar-aligned capacity views.
  SELECT jsonb_agg(
    jsonb_build_object(
      'week_start',     date_trunc('week', ls.starts_at AT TIME ZONE v_org_timezone)::date,
      'total_slots',    COUNT(*),
      'open_slots',     COUNT(*) FILTER (WHERE ls.status = 'open'),
      'full_slots',     COUNT(*) FILTER (WHERE ls.status = 'full'),
      'cancelled_slots',COUNT(*) FILTER (WHERE ls.status = 'cancelled')
    )
    ORDER BY date_trunc('week', ls.starts_at AT TIME ZONE v_org_timezone)
  )
  INTO v_weekly_avail
  FROM public.lesson_slots ls
  WHERE ls.organization_id = p_organization_id
    AND ls.deleted_at IS NULL
    AND ls.starts_at BETWEEN CURRENT_TIMESTAMP
                         AND CURRENT_TIMESTAMP + INTERVAL '6 weeks'
  GROUP BY date_trunc('week', ls.starts_at AT TIME ZONE v_org_timezone);

  -- ── BOOKING DENSITY BY DAY-OF-WEEK (LAST 4 WEEKS) ───────────────────────────
  -- Day-of-week in the org's local timezone (0=Sunday, 6=Saturday).
  -- Averages over 4-week sample to smooth weekly variation.
  SELECT jsonb_agg(
    jsonb_build_object(
      'dow',            EXTRACT(DOW FROM lb.starts_at AT TIME ZONE v_org_timezone),
      'dow_name',       TO_CHAR(lb.starts_at AT TIME ZONE v_org_timezone, 'Day'),
      'total_bookings', COUNT(*),
      'avg_per_week',   ROUND(COUNT(*)::numeric / 4, 1),
      'cancellations',  COUNT(*) FILTER (WHERE lb.status = 'cancelled')
    )
    ORDER BY EXTRACT(DOW FROM lb.starts_at AT TIME ZONE v_org_timezone)
  )
  INTO v_booking_density
  FROM public.lesson_bookings lb
  WHERE lb.organization_id = p_organization_id
    AND lb.deleted_at IS NULL
    AND lb.starts_at >= CURRENT_TIMESTAMP - INTERVAL '4 weeks'
    AND lb.starts_at < CURRENT_TIMESTAMP
  GROUP BY EXTRACT(DOW FROM lb.starts_at AT TIME ZONE v_org_timezone),
           TO_CHAR(lb.starts_at AT TIME ZONE v_org_timezone, 'Day');

  RETURN jsonb_build_object(
    'organization_id',        p_organization_id,
    'generated_at',           now(),
    'org_timezone',           v_org_timezone,
    'instructor_utilization', COALESCE(v_instructor_util, '[]'::jsonb),
    'lesson_type_capacity',   COALESCE(v_lesson_type_cap, '[]'::jsonb),
    'weekly_availability',    COALESCE(v_weekly_avail, '[]'::jsonb),
    'booking_density_by_dow', COALESCE(v_booking_density, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_capacity_dashboard(uuid) IS
  'Capacity planning payload: instructor utilization + lesson type capacity + '
  'weekly slot availability + booking density by day-of-week. '
  'Read-only. Permission: scheduling:health:read.';


-- =============================================================================
-- SECTION 4: GRANT EXECUTE + REVOKE ANON
-- All three dashboard RPCs granted to authenticated.
-- Dashboard RPCs are purely read-only: no writes to scheduling_maintenance_operations.
-- begin/complete_maintenance_operation are service_role only (file 10) and are not
-- called from dashboard reads — maintenance logging belongs in operational functions.
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_scheduling_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_generation_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_capacity_dashboard(uuid)   TO authenticated;

REVOKE ALL ON FUNCTION public.get_scheduling_dashboard(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_generation_dashboard(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_capacity_dashboard(uuid)   FROM anon;
