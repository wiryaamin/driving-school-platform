-- =============================================================================
-- MIGRATION: 20260528000013_phase2e_archival_prep.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2E — Scheduling Administration & Dashboard Infrastructure (4 of 4)
-- Description:
--   Archival preparation infrastructure. Two dry-run-only functions that
--   document the archival architecture and provide safe pre-flight row counts.
--   NO data is moved or deleted by this migration or by these functions.
--
--   archive_scheduling_health(org_id, before_date, dry_run)
--     Pre-flight for scheduling_health_snapshots archival.
--     dry_run = true (default): returns row counts only.
--     dry_run = false: reserved for future implementation — raises NOTICE.
--
--   archive_generation_runs(org_id, before_date, dry_run)
--     Pre-flight for scheduling_generation_runs archival.
--     Only completed runs are archivable; failed/partial are retained for audit.
--     dry_run = true (default): returns row counts only.
--     dry_run = false: reserved for future implementation — raises NOTICE.
--
-- ARCHIVAL ARCHITECTURE — READ BEFORE IMPLEMENTING:
-- ──────────────────────────────────────────────────
-- When implementing full archival (Phase 3+), follow this pattern:
--
--   1. CREATE SCHEMA IF NOT EXISTS archive;
--
--   2. CREATE TABLE archive.scheduling_health_snapshots
--        (LIKE public.scheduling_health_snapshots INCLUDING ALL);
--      CREATE TABLE archive.scheduling_generation_runs
--        (LIKE public.scheduling_generation_runs INCLUDING ALL);
--
--   3. Archive in batches inside an explicit transaction:
--        BEGIN;
--          INSERT INTO archive.scheduling_health_snapshots
--            SELECT * FROM public.scheduling_health_snapshots
--            WHERE organization_id = p_organization_id
--              AND snapshot_date < p_before_date
--            ORDER BY snapshot_date
--            LIMIT 1000            -- batch size prevents long-hold locks
--            FOR UPDATE SKIP LOCKED;
--
--          DELETE FROM public.scheduling_health_snapshots
--            WHERE id IN (SELECT id FROM archive.scheduling_health_snapshots ...);
--        COMMIT;
--
--   4. Run in a pg_cron job or Edge Function cron:
--        SELECT public.archive_scheduling_health(NULL, CURRENT_DATE - 90, false);
--      Runs nightly; processes one batch at a time to stay low-locking.
--
--   5. For generation_runs: ONLY archive status = 'completed'. Never archive
--      'failed', 'partial', or 'running' — they are operational audit records.
--
-- RETENTION POLICY (RECOMMENDED):
--   scheduling_health_snapshots  : 90 days in public, then archive (infinite)
--   scheduling_generation_runs   : 90 days completed in public, then archive
--   scheduling_maintenance_ops   : never archive (append-only audit log)
--   lesson_slots (soft-deleted)  : 12 months, then hard-delete with legal review
--   lesson_bookings (soft-deleted): 7 years (Swedish Bokföringslagen requirement)
--
-- EXECUTION ORDER:
--   15. 20260528000013_phase2e_archival_prep.sql ← this file
-- =============================================================================


-- =============================================================================
-- SECTION 1: archive_scheduling_health()
-- Dry-run pre-flight for health snapshot archival.
-- Returns row counts per org for operator review before live archival.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.archive_scheduling_health(
  p_organization_id  uuid     DEFAULT NULL,
  p_before_date      date     DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
  p_dry_run          boolean  DEFAULT true
)
RETURNS TABLE (
  organization_id     uuid,
  rows_to_archive     bigint,
  oldest_snapshot     date,
  newest_snapshot     date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op_id uuid;
BEGIN
  -- Platform admin only: archival is a platform-level operation
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'archive operations require platform admin privileges'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Only log when scoped to a specific org: nil UUID fails the FK constraint.
  -- Platform-wide archival (p_organization_id IS NULL) skips audit logging.
  IF p_organization_id IS NOT NULL THEN
    v_op_id := public.begin_maintenance_operation(
      p_organization_id,
      'archival_run', 'organization', p_organization_id,
      jsonb_build_object(
        'target_table', 'scheduling_health_snapshots',
        'before_date',  p_before_date,
        'dry_run',      p_dry_run
      )
    );
  END IF;

  IF NOT p_dry_run THEN
    -- Live archival NOT YET IMPLEMENTED.
    -- See the archival architecture documentation at the top of this migration.
    -- Activate when archive schema and archival batch job are in place.
    RAISE NOTICE
      'archive_scheduling_health: live archival not yet implemented. '
      'Returning dry-run counts. See Phase 2E archival architecture docs.';
  END IF;

  -- Single completion point (always returns dry-run counts until Phase 3 implements live archival)
  IF v_op_id IS NOT NULL THEN
    PERFORM public.complete_maintenance_operation(v_op_id, 'completed',
      jsonb_build_object('mode', 'dry_run', 'live_requested', NOT p_dry_run));
  END IF;

  RETURN QUERY
  SELECT
    hs.organization_id,
    COUNT(*)::bigint         AS rows_to_archive,
    MIN(hs.snapshot_date)    AS oldest_snapshot,
    MAX(hs.snapshot_date)    AS newest_snapshot
  FROM public.scheduling_health_snapshots hs
  WHERE (p_organization_id IS NULL OR hs.organization_id = p_organization_id)
    AND hs.snapshot_date < p_before_date
  GROUP BY hs.organization_id
  ORDER BY hs.organization_id;

EXCEPTION WHEN OTHERS THEN
  IF v_op_id IS NOT NULL THEN
    PERFORM public.complete_maintenance_operation(v_op_id, 'failed', NULL, SQLERRM);
  END IF;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.archive_scheduling_health(uuid, date, boolean) IS
  'Dry-run archival pre-flight for scheduling_health_snapshots. '
  'Always returns row counts (live archival not yet implemented). '
  'p_before_date defaults to 90 days ago. Platform admin only. '
  'See migration comments for full archival architecture guide.';


-- =============================================================================
-- SECTION 2: archive_generation_runs()
-- Dry-run pre-flight for generation run archival.
-- Only completed runs are archivable. Failed/partial are retained for audit.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.archive_generation_runs(
  p_organization_id  uuid        DEFAULT NULL,
  p_before_date      timestamptz DEFAULT (now() - INTERVAL '90 days'),
  p_dry_run          boolean     DEFAULT true
)
RETURNS TABLE (
  organization_id     uuid,
  rows_to_archive     bigint,
  oldest_run_at       timestamptz,
  newest_run_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'archive operations require platform admin privileges'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Only log when scoped to a specific org: nil UUID fails the FK constraint.
  -- Platform-wide archival (p_organization_id IS NULL) skips audit logging.
  IF p_organization_id IS NOT NULL THEN
    v_op_id := public.begin_maintenance_operation(
      p_organization_id,
      'archival_run', 'organization', p_organization_id,
      jsonb_build_object(
        'target_table', 'scheduling_generation_runs',
        'before_date',  p_before_date,
        'dry_run',      p_dry_run,
        'status_filter','completed only'
      )
    );
  END IF;

  IF NOT p_dry_run THEN
    -- Live archival NOT YET IMPLEMENTED.
    -- See the archival architecture documentation at the top of this migration.
    -- Activate when archive schema and archival batch job are in place.
    RAISE NOTICE
      'archive_generation_runs: live archival not yet implemented. '
      'Returning dry-run counts. See Phase 2E archival architecture docs.';
  END IF;

  -- Single completion point (always returns dry-run counts until Phase 3 implements live archival)
  -- Only status = 'completed' is archivable.
  -- failed / partial / running are operational audit records — never archive.
  IF v_op_id IS NOT NULL THEN
    PERFORM public.complete_maintenance_operation(v_op_id, 'completed',
      jsonb_build_object('mode', 'dry_run', 'live_requested', NOT p_dry_run));
  END IF;

  RETURN QUERY
  SELECT
    r.organization_id,
    COUNT(*)::bigint   AS rows_to_archive,
    MIN(r.started_at)  AS oldest_run_at,
    MAX(r.started_at)  AS newest_run_at
  FROM public.scheduling_generation_runs r
  WHERE (p_organization_id IS NULL OR r.organization_id = p_organization_id)
    AND r.status = 'completed'
    AND r.started_at < p_before_date
  GROUP BY r.organization_id
  ORDER BY r.organization_id;

EXCEPTION WHEN OTHERS THEN
  IF v_op_id IS NOT NULL THEN
    PERFORM public.complete_maintenance_operation(v_op_id, 'failed', NULL, SQLERRM);
  END IF;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.archive_generation_runs(uuid, timestamptz, boolean) IS
  'Dry-run archival pre-flight for scheduling_generation_runs (completed only). '
  'failed/partial runs are never archivable — they are audit records. '
  'p_before_date defaults to 90 days ago. Platform admin only. '
  'See migration comments for full archival architecture guide.';


-- =============================================================================
-- SECTION 3: GRANT EXECUTE
-- Archive functions: service_role only (platform admin check is internal).
-- Not exposed to authenticated — these are platform operator tools.
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.archive_scheduling_health(uuid, date, boolean)        TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_generation_runs(uuid, timestamptz, boolean)   TO service_role;

REVOKE ALL ON FUNCTION public.archive_scheduling_health(uuid, date, boolean)        FROM anon;
REVOKE ALL ON FUNCTION public.archive_generation_runs(uuid, timestamptz, boolean)   FROM anon;
