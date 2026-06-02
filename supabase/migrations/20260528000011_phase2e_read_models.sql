-- =============================================================================
-- MIGRATION: 20260528000011_phase2e_read_models.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2E — Scheduling Administration & Dashboard Infrastructure (2 of 4)
-- Description:
--   Seven SECURITY INVOKER read-only views for operational dashboards and
--   analytics. All views respect the underlying table RLS policies automatically
--   because they are defined with security_invoker = true.
--
--   Operational views (4):
--     vw_scheduling_health        — latest health snapshot per organisation
--     vw_generation_status        — generation config + last run per lesson type
--     vw_failed_generation_runs   — failed/partial runs with retry history
--     vw_slot_inventory           — future slot counts by org + lesson type + instructor
--
--   Analytics views (3):
--     vw_instructor_utilization   — instructor capacity and booking rate
--     vw_lesson_type_utilization  — lesson type capacity and consumption
--     vw_booking_trends           — rolling 90-day booking activity by local date
--
-- Tenancy isolation:
--   All views use WITH (security_invoker = true) (PostgreSQL 15+). The caller's
--   JWT context is preserved: auth_organization_id(), is_platform_admin(), and
--   has_permission() fire against each underlying table's RLS policies.
--   Org staff see only their own organisation. Platform admins see all orgs.
--
-- Execution order: must run after 20260528000010_phase2e_admin_infra.sql
-- =============================================================================


-- =============================================================================
-- SECTION 1: vw_scheduling_health
-- Latest health snapshot per organisation with org metadata.
-- Used by: health dashboard, alert rules, monitoring integrations.
--
-- NOTE: timezone is stored in organizations.settings->>'timezone' (JSONB).
-- Defaults to 'Europe/Stockholm' when not configured.
-- =============================================================================

CREATE OR REPLACE VIEW public.vw_scheduling_health
WITH (security_invoker = true)
AS
SELECT
  o.id                                                        AS organization_id,
  o.name                                                      AS organization_name,
  o.slug,
  COALESCE(o.settings->>'timezone', 'Europe/Stockholm')       AS timezone,
  o.subscription_tier,

  hs.id                                                       AS snapshot_id,
  hs.snapshot_date,
  hs.future_slots_count,
  hs.open_slots_count,
  hs.booked_slots_count,
  hs.cancelled_slots_count,
  hs.orphaned_slots_count,
  hs.overlapping_slots_detected,
  hs.failed_generation_runs,
  hs.generation_lag_days,
  hs.health_status,
  hs.metadata                                                 AS snapshot_findings,
  hs.created_at                                               AS snapshot_captured_at,

  -- Convenience: days since last snapshot (NULL = never captured)
  CASE WHEN hs.snapshot_date IS NOT NULL
    THEN (CURRENT_DATE - hs.snapshot_date)
  END                                                         AS days_since_snapshot

FROM public.organizations o
LEFT JOIN LATERAL (
  -- Latest snapshot only — one row per organisation
  SELECT s.id, s.snapshot_date, s.future_slots_count, s.open_slots_count,
         s.booked_slots_count, s.cancelled_slots_count, s.orphaned_slots_count,
         s.overlapping_slots_detected, s.failed_generation_runs,
         s.generation_lag_days, s.health_status, s.metadata, s.created_at
  FROM   public.scheduling_health_snapshots s
  WHERE  s.organization_id = o.id
  ORDER  BY s.snapshot_date DESC
  LIMIT  1
) hs ON true

WHERE o.deleted_at IS NULL;

COMMENT ON VIEW public.vw_scheduling_health IS
  'Latest health snapshot per organisation. One row per org regardless of whether '
  'a snapshot has been captured (hs columns NULL if none exists). '
  'Security: security_invoker — org staff see only their org; platform admins see all.';


-- =============================================================================
-- SECTION 2: vw_generation_status
-- Generation configuration with last-run context per lesson type.
-- Used by: generation admin panel, worker health monitoring.
--
-- LATERAL join: fetches the most recent non-running run per (org, lesson_type).
-- Performance: covered by Phase 2C index idx_gen_runs_org_lt_status on
-- (organization_id, lesson_type_id, status, completed_at DESC NULLS LAST).
-- =============================================================================

CREATE OR REPLACE VIEW public.vw_generation_status
WITH (security_invoker = true)
AS
SELECT
  gc.id                                                       AS config_id,
  gc.organization_id,
  o.name                                                      AS organization_name,
  gc.lesson_type_id,
  lt.name                                                     AS lesson_type_name,
  lt.code                                                     AS lesson_type_code,

  gc.generation_horizon_days,
  gc.generation_frequency,
  gc.auto_generation_enabled,
  gc.is_active,
  gc.last_generation_at,
  gc.next_generation_at,
  gc.retry_count,
  gc.max_retry_count,
  gc.failure_backoff_minutes,

  -- Dead-letter state: retry exhausted and auto-disabled by worker
  (gc.retry_count >= gc.max_retry_count AND NOT gc.is_active)  AS is_dead_letter,

  -- Overdue: auto-enabled config whose next run is in the past
  (
    gc.auto_generation_enabled
    AND gc.is_active
    AND gc.next_generation_at IS NOT NULL
    AND gc.next_generation_at < now()
  )                                                            AS is_overdue,

  gc.updated_at                                                AS config_updated_at,

  -- Last completed/failed/partial run for this config
  lr.run_id                                                    AS last_run_id,
  lr.run_status                                                AS last_run_status,
  lr.run_started_at                                            AS last_run_started_at,
  lr.run_completed_at                                          AS last_run_completed_at,
  lr.records_created                                           AS last_run_records_created,
  lr.conflicts_detected                                        AS last_run_conflicts

FROM public.scheduling_generation_configs gc
JOIN  public.organizations o  ON o.id  = gc.organization_id AND o.deleted_at IS NULL
JOIN  public.lesson_types  lt ON lt.id = gc.lesson_type_id

LEFT JOIN LATERAL (
  SELECT
    r.id           AS run_id,
    r.status       AS run_status,
    r.started_at   AS run_started_at,
    r.completed_at AS run_completed_at,
    r.records_created,
    r.conflicts_detected
  FROM   public.scheduling_generation_runs r
  WHERE  r.organization_id = gc.organization_id
    AND  r.lesson_type_id  = gc.lesson_type_id
    AND  r.status != 'running'
  ORDER  BY r.started_at DESC
  LIMIT  1
) lr ON true;

COMMENT ON VIEW public.vw_generation_status IS
  'Generation config with the most recent non-running run per (org, lesson_type). '
  'is_dead_letter and is_overdue are computed convenience flags for dashboard alerting.';


-- =============================================================================
-- SECTION 3: vw_failed_generation_runs
-- All failed and partial generation runs with retry lineage.
-- Used by: incident response panel, retry workflow.
-- =============================================================================

CREATE OR REPLACE VIEW public.vw_failed_generation_runs
WITH (security_invoker = true)
AS
SELECT
  r.id                                                        AS run_id,
  r.organization_id,
  o.name                                                      AS organization_name,
  r.lesson_type_id,
  lt.name                                                     AS lesson_type_name,
  r.generation_scope,
  r.scope_id,
  r.status,
  r.start_date                                                AS generation_start_date,
  r.end_date                                                  AS generation_end_date,
  r.started_at,
  r.completed_at,
  r.records_created,
  r.records_skipped,
  r.conflicts_detected,
  r.error_message,
  r.triggered_by,
  r.metadata,

  -- Retry lineage: was this run retried?
  (r.metadata ->> 'retried_as') IS NOT NULL                   AS was_retried,
  (r.metadata ->> 'retried_as')::uuid                         AS retried_as_run_id,
  (r.metadata ->> 'retried_at')::timestamptz                  AS retried_at,

  -- Was this run itself a retry of another?
  (r.metadata ->> 'retried_from') IS NOT NULL                 AS is_retry,
  (r.metadata ->> 'retried_from')::uuid                       AS retry_of_run_id,

  -- Age of the failure for SLA tracking
  EXTRACT(EPOCH FROM (now() - r.started_at)) / 3600.0         AS age_hours

FROM public.scheduling_generation_runs r
JOIN  public.organizations o  ON o.id  = r.organization_id AND o.deleted_at IS NULL
LEFT JOIN public.lesson_types lt ON lt.id = r.lesson_type_id

WHERE r.status IN ('failed', 'partial')
  AND r.started_at >= CURRENT_TIMESTAMP - INTERVAL '90 days';

COMMENT ON VIEW public.vw_failed_generation_runs IS
  'Failed and partial generation runs, last 90 days, with retry lineage decoded from metadata. '
  'age_hours enables SLA alerting on unresolved failures. '
  'For older failures query scheduling_generation_runs directly with a date range.';


-- =============================================================================
-- SECTION 4: vw_slot_inventory
-- Future slot counts aggregated by organisation + lesson type + instructor.
-- Used by: capacity planning, instructor workload dashboard.
--
-- Scope: future slots only (starts_at >= CURRENT_TIMESTAMP), excluding
-- soft-deleted slots. Past slots are out of scope for capacity planning.
--
-- Status semantics:
--   open         — has remaining capacity; student can still book
--   full         — max_bookings reached (current_bookings = max_bookings)
--   in_progress  — lesson is currently running
--   cancelled    — slot cancelled; excluded from active counts
--   blocked      — admin-blocked; excluded from active counts
-- =============================================================================

CREATE OR REPLACE VIEW public.vw_slot_inventory
WITH (security_invoker = true)
AS
SELECT
  ls.organization_id,
  o.name                                                      AS organization_name,
  ls.lesson_type_id,
  lt.name                                                     AS lesson_type_name,
  lt.code                                                     AS lesson_type_code,
  ls.instructor_id,
  i.first_name || ' ' || i.last_name                          AS instructor_name,
  i.email                                                     AS instructor_email,

  COUNT(*)                                                    AS total_future_slots,
  COUNT(*) FILTER (WHERE ls.status NOT IN ('cancelled', 'blocked'))
                                                              AS active_slots,
  COUNT(*) FILTER (WHERE ls.status = 'open')                  AS open_slots,
  COUNT(*) FILTER (WHERE ls.status = 'full')                  AS full_slots,
  COUNT(*) FILTER (WHERE ls.status = 'in_progress')           AS in_progress_slots,
  COUNT(*) FILTER (WHERE ls.status = 'cancelled')             AS cancelled_slots,
  COUNT(*) FILTER (WHERE ls.status = 'blocked')               AS blocked_slots,

  -- Utilization: full + in_progress / total active (open + full + in_progress)
  ROUND(
    COUNT(*) FILTER (WHERE ls.status IN ('full', 'in_progress'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE ls.status NOT IN ('cancelled', 'blocked')), 0)
    * 100,
    1
  )                                                           AS utilization_pct,

  MIN(ls.starts_at) FILTER (WHERE ls.status = 'open')         AS earliest_open_slot,
  MAX(ls.starts_at) FILTER (WHERE ls.status = 'open')         AS latest_open_slot

FROM public.lesson_slots ls
JOIN  public.organizations o  ON o.id  = ls.organization_id AND o.deleted_at IS NULL
LEFT JOIN public.lesson_types  lt ON lt.id = ls.lesson_type_id
LEFT JOIN public.instructors   i  ON i.id  = ls.instructor_id

WHERE ls.deleted_at IS NULL
  AND ls.starts_at >= CURRENT_TIMESTAMP

GROUP BY
  ls.organization_id, o.name,
  ls.lesson_type_id,  lt.name, lt.code,
  ls.instructor_id,   i.first_name, i.last_name, i.email;

COMMENT ON VIEW public.vw_slot_inventory IS
  'Future slot counts grouped by org + lesson type + instructor. '
  'Excludes soft-deleted slots and past slots. '
  'utilization_pct = (full + in_progress) / active * 100.';


-- =============================================================================
-- SECTION 5: vw_instructor_utilization
-- Instructor capacity metrics for future bookable slots.
-- Used by: workload balancing, instructor performance dashboards.
--
-- Starts from instructors table (not lesson_slots) so instructors with no
-- future slots appear with zero counts — critical for workload visibility.
-- =============================================================================

CREATE OR REPLACE VIEW public.vw_instructor_utilization
WITH (security_invoker = true)
AS
SELECT
  i.id                                                        AS instructor_id,
  i.organization_id,
  o.name                                                      AS organization_name,
  i.first_name,
  i.last_name,
  i.first_name || ' ' || i.last_name                          AS instructor_name,
  i.email,
  i.teaching_categories,

  ls.lesson_type_id,
  lt.name                                                     AS lesson_type_name,

  COUNT(ls.id)                                                AS future_slots_total,
  COUNT(ls.id) FILTER (WHERE ls.status NOT IN ('cancelled', 'blocked'))
                                                              AS active_slots,
  COUNT(ls.id) FILTER (WHERE ls.status = 'open')              AS open_slots,
  COUNT(ls.id) FILTER (WHERE ls.status = 'full')              AS full_slots,

  ROUND(
    COUNT(ls.id) FILTER (WHERE ls.status IN ('full', 'in_progress'))::numeric
    / NULLIF(COUNT(ls.id) FILTER (WHERE ls.status NOT IN ('cancelled', 'blocked')), 0)
    * 100,
    1
  )                                                           AS utilization_pct,

  -- Capacity in decimal hours (wall-clock duration)
  ROUND(
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (ls.ends_at - ls.starts_at)) / 3600.0
    ) FILTER (WHERE ls.status NOT IN ('cancelled', 'blocked')), 0),
    1
  )                                                           AS capacity_hours,

  ROUND(
    COALESCE(SUM(
      EXTRACT(EPOCH FROM (ls.ends_at - ls.starts_at)) / 3600.0
    ) FILTER (WHERE ls.status IN ('full', 'in_progress')), 0),
    1
  )                                                           AS booked_hours

FROM public.instructors i
JOIN  public.organizations o ON o.id = i.organization_id AND o.deleted_at IS NULL
LEFT JOIN public.lesson_slots ls
  ON  ls.instructor_id = i.id
  AND ls.deleted_at    IS NULL
  AND ls.starts_at     >= CURRENT_TIMESTAMP
LEFT JOIN public.lesson_types lt ON lt.id = ls.lesson_type_id

WHERE i.deleted_at IS NULL

GROUP BY
  i.id, i.organization_id, o.name,
  i.first_name, i.last_name, i.email, i.teaching_categories,
  ls.lesson_type_id, lt.name;

COMMENT ON VIEW public.vw_instructor_utilization IS
  'Instructor capacity metrics for future bookable slots by lesson type. '
  'Instructors with no future slots appear with zero counts. '
  'capacity_hours and booked_hours are wall-clock durations (not lesson count).';


-- =============================================================================
-- SECTION 6: vw_lesson_type_utilization
-- Lesson type capacity and consumption for future slots.
-- Used by: capacity planning, lesson type demand analysis.
--
-- Starts from lesson_types (not lesson_slots) so active lesson types with
-- no future slots appear with zero counts.
-- =============================================================================

CREATE OR REPLACE VIEW public.vw_lesson_type_utilization
WITH (security_invoker = true)
AS
SELECT
  lt.id                                                       AS lesson_type_id,
  lt.organization_id,
  o.name                                                      AS organization_name,
  lt.name                                                     AS lesson_type_name,
  lt.code                                                     AS lesson_type_code,
  lt.category,
  lt.default_duration_minutes,
  lt.max_students_per_slot,

  COUNT(ls.id)                                                AS future_slots_total,
  COUNT(ls.id) FILTER (WHERE ls.status NOT IN ('cancelled', 'blocked'))
                                                              AS active_slots,
  COUNT(ls.id) FILTER (WHERE ls.status = 'open')              AS open_slots,
  COUNT(ls.id) FILTER (WHERE ls.status = 'full')              AS full_slots,

  ROUND(
    COUNT(ls.id) FILTER (WHERE ls.status IN ('full', 'in_progress'))::numeric
    / NULLIF(COUNT(ls.id) FILTER (WHERE ls.status NOT IN ('cancelled', 'blocked')), 0)
    * 100,
    1
  )                                                           AS utilization_pct,

  -- Capacity in minutes (lesson count × default duration)
  COUNT(ls.id) FILTER (WHERE ls.status NOT IN ('cancelled', 'blocked'))
    * lt.default_duration_minutes                             AS capacity_minutes,

  COUNT(ls.id) FILTER (WHERE ls.status IN ('full', 'in_progress'))
    * lt.default_duration_minutes                             AS consumed_minutes,

  -- Availability ratio: 1.0 = fully available, 0.0 = fully booked
  ROUND(
    1.0 - (
      COUNT(ls.id) FILTER (WHERE ls.status IN ('full', 'in_progress'))::numeric
      / NULLIF(COUNT(ls.id) FILTER (WHERE ls.status NOT IN ('cancelled', 'blocked')), 0)
    ),
    3
  )                                                           AS availability_ratio

FROM public.lesson_types lt
JOIN  public.organizations o ON o.id = lt.organization_id AND o.deleted_at IS NULL
LEFT JOIN public.lesson_slots ls
  ON  ls.lesson_type_id = lt.id
  AND ls.deleted_at     IS NULL
  AND ls.starts_at      >= CURRENT_TIMESTAMP

WHERE lt.is_active = true

GROUP BY
  lt.id, lt.organization_id, o.name,
  lt.name, lt.code, lt.category,
  lt.default_duration_minutes, lt.max_students_per_slot;

COMMENT ON VIEW public.vw_lesson_type_utilization IS
  'Lesson type capacity and consumption for future slots. '
  'Active lesson types with no future slots appear with zero counts. '
  'availability_ratio approaches 0 as the type fills up.';


-- =============================================================================
-- SECTION 7: vw_booking_trends
-- Rolling 90-day booking activity aggregated by local calendar date.
-- Used by: BI dashboards, demand forecasting, management reports.
--
-- Date grouping uses the organisation's configured timezone
-- (settings->>'timezone', defaulting to 'Europe/Stockholm') so that
-- "Monday bookings" reflect the school's local working day, not UTC midnight.
--
-- Window: last 90 days of created_at. The view re-computes on each query.
-- For larger time ranges use a materialised view or the archival schema.
-- =============================================================================

CREATE OR REPLACE VIEW public.vw_booking_trends
WITH (security_invoker = true)
AS
SELECT
  lb.organization_id,
  o.name                                                      AS organization_name,

  -- Local calendar date using the org's timezone
  (lb.created_at AT TIME ZONE
    COALESCE(o.settings->>'timezone', 'Europe/Stockholm')
  )::date                                                     AS booking_date,

  COUNT(*)                                                    AS total_bookings,
  COUNT(*) FILTER (WHERE lb.status = 'cancelled')             AS cancellations,
  COUNT(*) FILTER (WHERE lb.status = 'completed')             AS completions,
  COUNT(*) FILTER (WHERE lb.status = 'no_show')               AS no_shows,
  COUNT(*) FILTER (WHERE lb.status = 'rescheduled')           AS rescheduled,
  COUNT(*) FILTER (WHERE lb.status IN ('draft', 'reserved', 'confirmed'))
                                                              AS active_bookings,

  -- Unique students who booked on this date
  COUNT(DISTINCT lb.student_id)                               AS unique_students,

  -- Cancellation rate for this date (0–1 range)
  ROUND(
    COUNT(*) FILTER (WHERE lb.status = 'cancelled')::numeric
    / NULLIF(COUNT(*), 0),
    3
  )                                                           AS cancellation_rate

FROM public.lesson_bookings lb
JOIN public.organizations o ON o.id = lb.organization_id AND o.deleted_at IS NULL

WHERE lb.deleted_at IS NULL
  AND lb.created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'

GROUP BY
  lb.organization_id,
  o.name,
  (lb.created_at AT TIME ZONE COALESCE(o.settings->>'timezone', 'Europe/Stockholm'))::date;

COMMENT ON VIEW public.vw_booking_trends IS
  'Rolling 90-day booking activity by organisation local calendar date. '
  'Regenerates on every query. For date ranges >90 days use the archival schema. '
  'booking_date is in the org''s local timezone (settings->timezone), not UTC.';


-- =============================================================================
-- SECTION 8: GRANT SELECT + REVOKE ANON
-- Authenticated role needs SELECT on views for PostgREST access.
-- Underlying table RLS provides tenant isolation (security_invoker = true).
-- =============================================================================

GRANT SELECT ON public.vw_scheduling_health      TO authenticated;
GRANT SELECT ON public.vw_generation_status      TO authenticated;
GRANT SELECT ON public.vw_failed_generation_runs TO authenticated;
GRANT SELECT ON public.vw_slot_inventory         TO authenticated;
GRANT SELECT ON public.vw_instructor_utilization  TO authenticated;
GRANT SELECT ON public.vw_lesson_type_utilization TO authenticated;
GRANT SELECT ON public.vw_booking_trends         TO authenticated;

REVOKE ALL ON public.vw_scheduling_health      FROM anon;
REVOKE ALL ON public.vw_generation_status      FROM anon;
REVOKE ALL ON public.vw_failed_generation_runs FROM anon;
REVOKE ALL ON public.vw_slot_inventory         FROM anon;
REVOKE ALL ON public.vw_instructor_utilization  FROM anon;
REVOKE ALL ON public.vw_lesson_type_utilization FROM anon;
REVOKE ALL ON public.vw_booking_trends         FROM anon;


-- =============================================================================
-- SECTION 9: PERFORMANCE INDEX
-- Covers the LATERAL subquery in vw_generation_status which orders by
-- started_at DESC. The Phase 2C idx_gen_runs_org_lt_status covers
-- (organization_id, lesson_type_id, status, completed_at DESC) but cannot
-- satisfy ORDER BY started_at DESC — this index fills that gap.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_gen_runs_org_lt_started
  ON public.scheduling_generation_runs (organization_id, lesson_type_id, started_at DESC)
  WHERE status != 'running';
