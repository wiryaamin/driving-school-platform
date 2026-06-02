-- =============================================================================
-- MIGRATION: 20260528000010_phase2e_admin_infra.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2E — Scheduling Administration & Dashboard Infrastructure (1 of 4)
-- Description:
--   Operational administration infrastructure:
--     • scheduling_maintenance_operations  — audit log for all maintenance actions
--     • acquire_scheduling_org_lock()      — non-blocking session advisory lock
--     • release_scheduling_org_lock()      — release session advisory lock
--     • begin_maintenance_operation()      — structured operation start logging
--     • complete_maintenance_operation()   — structured operation completion logging
--     • RLS for scheduling_maintenance_operations
--     • 1 new permission: scheduling:maintenance:read
--     • 3 hot-path indexes
--
-- Execution order:
--   1.  20260527000001_enterprise_foundation.sql
--   2.  20260527000002_phase1b2_hardening.sql
--   3.  20260528000001_phase2a_domain_foundation.sql
--   4–7. Phase 2B (scheduling core, RLS, events, indexes)
--   8–9. Phase 2C (slot generator infra + functions)
--   10–11. Phase 2D (ops infra + functions)
--   12. 20260528000010_phase2e_admin_infra.sql       ← this file
--   13. 20260528000011_phase2e_read_models.sql
--   14. 20260528000012_phase2e_dashboard_rpcs.sql
--   15. 20260528000013_phase2e_archival_prep.sql
--
-- Dependencies:
--   Phase 1A: organizations, has_permission, is_platform_admin, auth_organization_id,
--             roles, role_permissions, permissions
--   Phase 2D: scheduling_generation_configs, scheduling_health_snapshots
-- =============================================================================


-- =============================================================================
-- SECTION 1: SCHEDULING_MAINTENANCE_OPERATIONS (AUDIT LOG)
-- Enterprise-grade audit trail for all operational scheduling actions.
--
-- WRITE PATH: SECURITY DEFINER helpers only — begin_maintenance_operation() /
--   complete_maintenance_operation(). No direct INSERT/UPDATE via REST API.
--   The absence of write RLS policies enforces this at the database level.
-- READ PATH: org staff with scheduling:maintenance:read; platform admins.
--
-- Append-semantics: rows are created by begin_maintenance_operation() and
-- finalised by complete_maintenance_operation(). Never hard-deleted.
-- Soft-delete is NOT applied — this table IS the audit record.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.scheduling_maintenance_operations (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL,

  -- Lifecycle classification
  operation_type      text        NOT NULL,
  operation_status    text        NOT NULL DEFAULT 'running',

  -- Attribution: NULL when called by a background worker (no JWT context)
  initiated_by        uuid,

  -- Duration tracking
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,

  -- What entity this operation targeted (optional, for drill-down)
  target_entity_type  text,      -- 'organization' | 'generation_run' | 'lesson_type' | etc.
  target_entity_id    uuid,

  -- Extensible: run_id, slots_affected, config_id, batch_id, retry_of, etc.
  metadata            jsonb       NOT NULL DEFAULT '{}',

  -- Set by complete_maintenance_operation() on failure
  error_message       text,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT scheduling_maintenance_ops_pkey           PRIMARY KEY (id),
  CONSTRAINT scheduling_maintenance_ops_org_fkey       FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,

  CONSTRAINT scheduling_maintenance_ops_type_check     CHECK (operation_type IN (
    'regenerate_missing_slots',
    'retry_failed_generation_run',
    'capture_health_snapshot',
    'validate_integrity',
    'worker_trigger',
    'manual_slot_correction',
    'bulk_cancellation',
    'config_update',
    'advisory_lock_acquired',
    'archival_run'
  )),
  CONSTRAINT scheduling_maintenance_ops_status_check   CHECK (
    operation_status IN ('running', 'completed', 'failed', 'partial')
  ),
  CONSTRAINT scheduling_maintenance_ops_completed_check CHECK (
    completed_at IS NULL OR completed_at >= started_at
  )
);

COMMENT ON TABLE  public.scheduling_maintenance_operations IS
  'Append-only audit log for all operational scheduling actions. '
  'Written exclusively through begin_maintenance_operation() / '
  'complete_maintenance_operation() SECURITY DEFINER helpers.';
COMMENT ON COLUMN public.scheduling_maintenance_operations.initiated_by IS
  'auth.uid() of the user who triggered the operation. '
  'NULL when called by a background worker with no JWT context.';
COMMENT ON COLUMN public.scheduling_maintenance_operations.operation_type IS
  'Machine-readable action identifier. Extend the CHECK constraint in a new '
  'migration when adding new operation types — do not widen it here.';
COMMENT ON COLUMN public.scheduling_maintenance_operations.metadata IS
  'Extensible payload: run_id, slots_affected, config_id, retry_of, batch_id, '
  'result_summary. Added at completion time by complete_maintenance_operation().';

REVOKE ALL ON TABLE public.scheduling_maintenance_operations FROM anon;


-- =============================================================================
-- SECTION 2: ADVISORY LOCK FUNCTIONS
-- PostgreSQL session-level advisory locks for worker concurrency control.
--
-- LOCK NAMESPACE: hashtext('sched_maint') — separate from Phase 2D's
--   generation-layer namespace hashtext('slot_gen_org:' || id).
--
-- SESSION vs TRANSACTION SCOPED:
--   These functions use SESSION-level pg_try_advisory_lock. Session locks persist
--   across transaction boundaries and must be explicitly released via
--   release_scheduling_org_lock(). This is the correct choice for long-running
--   orchestration flows that span multiple transactions.
--
-- PGBOUNCER WARNING:
--   In Supabase's default PgBouncer transaction-pooling mode, session-level
--   advisory locks DO NOT reliably survive between statements because the
--   connection may be returned to the pool between calls. When using these
--   from Edge Functions:
--     OPTION A (recommended): Use a dedicated long-lived connection or
--       Supabase's `db.connect()` session mode.
--     OPTION B: Replace with pg_try_advisory_xact_lock (transaction-scoped,
--       auto-releases on commit/rollback; no explicit release needed).
--   The functions below use session-scope to enable explicit release; callers
--   must be aware of the PgBouncer constraint.
--
-- LOCK KEY DERIVATION:
--   Two-argument form (int4, int4) avoids hashtext collision across domains.
--   Namespace = hashtext('sched_maint') is stable across PostgreSQL versions.
--   Object  = hashtext(org_id::text)   is consistent for the same UUID.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.acquire_scheduling_org_lock(p_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ns  int4 := hashtext('sched_maint');
  v_key int4 := hashtext(p_organization_id::text);
BEGIN
  -- pg_try_advisory_lock: non-blocking. Returns true if acquired, false if
  -- already held by another session. Callers must check the return value.
  RETURN pg_try_advisory_lock(v_ns, v_key);
END;
$$;

COMMENT ON FUNCTION public.acquire_scheduling_org_lock(uuid) IS
  'Non-blocking session-level advisory lock for an organisation scheduling context. '
  'Returns true if acquired; false if another session holds the lock. '
  'Always pair with release_scheduling_org_lock() in a BEGIN/EXCEPTION/END block. '
  'See PgBouncer transaction-pooling caveat in migration comments.';

CREATE OR REPLACE FUNCTION public.release_scheduling_org_lock(p_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ns  int4 := hashtext('sched_maint');
  v_key int4 := hashtext(p_organization_id::text);
BEGIN
  -- pg_advisory_unlock: returns true if lock was held by this session and
  -- successfully released; false if lock was not held by this session.
  RETURN pg_advisory_unlock(v_ns, v_key);
END;
$$;

COMMENT ON FUNCTION public.release_scheduling_org_lock(uuid) IS
  'Releases the session-level advisory lock acquired by acquire_scheduling_org_lock(). '
  'Returns false if the lock was not held by the current session (safe to ignore on cleanup).';


-- =============================================================================
-- SECTION 3: MAINTENANCE OPERATION LIFECYCLE HELPERS
-- Structured begin/complete pattern for all operational functions.
--
-- DESIGN:
--   begin_maintenance_operation() — inserts a 'running' record, returns the UUID.
--   complete_maintenance_operation() — finalises the record with status + metadata.
--
--   These helpers are SECURITY DEFINER so they bypass the write-RLS absence on
--   scheduling_maintenance_operations (write-through-function-only enforced).
--
-- USAGE:
--   DECLARE v_op_id uuid;
--   BEGIN
--     SELECT public.begin_maintenance_operation(p_org_id, 'capture_health_snapshot',
--       'organization', p_org_id, '{"triggered_by_rpc": true}') INTO v_op_id;
--     -- ... perform work ...
--     PERFORM public.complete_maintenance_operation(v_op_id, 'completed',
--       jsonb_build_object('snapshot_id', v_snapshot_id));
--   EXCEPTION WHEN OTHERS THEN
--     PERFORM public.complete_maintenance_operation(v_op_id, 'failed', NULL, SQLERRM);
--     RAISE;
--   END;
--
-- GRANT POLICY:
--   Not granted to 'authenticated'. Called only from SECURITY DEFINER RPCs and
--   service-role Edge Functions. This prevents fake log injection via REST API.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.begin_maintenance_operation(
  p_organization_id    uuid,
  p_operation_type     text,
  p_target_entity_type text    DEFAULT NULL,
  p_target_entity_id   uuid    DEFAULT NULL,
  p_metadata           jsonb   DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op_id uuid;
BEGIN
  INSERT INTO public.scheduling_maintenance_operations (
    organization_id,
    operation_type,
    operation_status,
    initiated_by,
    target_entity_type,
    target_entity_id,
    metadata
  ) VALUES (
    p_organization_id,
    p_operation_type,
    'running',
    auth.uid(),              -- NULL for background workers — expected and valid
    p_target_entity_type,
    p_target_entity_id,
    COALESCE(p_metadata, '{}')
  )
  RETURNING id INTO v_op_id;

  RETURN v_op_id;
END;
$$;

COMMENT ON FUNCTION public.begin_maintenance_operation(uuid, text, text, uuid, jsonb) IS
  'Opens a new scheduling_maintenance_operations record in ''running'' state. '
  'Returns the operation UUID for use with complete_maintenance_operation(). '
  'Call at the start of every operational function; always complete in an EXCEPTION handler.';

CREATE OR REPLACE FUNCTION public.complete_maintenance_operation(
  p_operation_id uuid,
  p_status       text,           -- 'completed' | 'failed' | 'partial'
  p_metadata     jsonb  DEFAULT NULL,
  p_error        text   DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.scheduling_maintenance_operations
  SET
    operation_status = p_status,
    completed_at     = now(),
    error_message    = p_error,
    -- Merge additional result metadata into the existing metadata JSONB
    metadata         = CASE
                         WHEN p_metadata IS NOT NULL
                         THEN metadata || p_metadata
                         ELSE metadata
                       END
  WHERE id = p_operation_id;
END;
$$;

COMMENT ON FUNCTION public.complete_maintenance_operation(uuid, text, jsonb, text) IS
  'Finalises a scheduling_maintenance_operations record. '
  'Call on both success and failure paths. p_metadata is merged into existing metadata. '
  'p_error is set only on failure for incident-response queries.';


-- =============================================================================
-- SECTION 4: RLS — SCHEDULING_MAINTENANCE_OPERATIONS
-- REST API is read-only. All writes go through SECURITY DEFINER helpers.
-- Absence of INSERT/UPDATE/DELETE policies enforces write-through-function-only.
-- =============================================================================

ALTER TABLE public.scheduling_maintenance_operations ENABLE ROW LEVEL SECURITY;

-- Org staff: read their organisation's maintenance history
DO $pol$ BEGIN
  CREATE POLICY "maint_ops_select_staff"
    ON public.scheduling_maintenance_operations FOR SELECT
    USING (
      organization_id = public.auth_organization_id()
      AND public.has_permission('scheduling:maintenance:read')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;

-- Platform admin: full read visibility across all organisations
DO $pol$ BEGIN
  CREATE POLICY "maint_ops_select_platform"
    ON public.scheduling_maintenance_operations FOR SELECT
    USING (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $pol$;


-- =============================================================================
-- SECTION 5: OPERATIONAL PERMISSIONS (1 NEW)
-- scheduling:maintenance:read — view the maintenance operations audit log
-- =============================================================================

INSERT INTO public.permissions (id, code, domain, resource, action, description)
VALUES (
  gen_random_uuid(),
  'scheduling:maintenance:read',
  'scheduling', 'maintenance', 'read',
  'View scheduling maintenance operations audit log, advisory lock history, and operational event trail'
)
ON CONFLICT (code) DO NOTHING;

-- org_owner, org_admin, org_manager: all can read the maintenance log
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin', 'org_manager')
  AND  r.is_system_role = true
  AND  p.code = 'scheduling:maintenance:read'
ON CONFLICT DO NOTHING;


-- =============================================================================
-- SECTION 6: HOT-PATH INDEXES
-- =============================================================================

-- Dashboard / incident response: recent operations per organisation
CREATE INDEX IF NOT EXISTS idx_maint_ops_org_started
  ON public.scheduling_maintenance_operations (organization_id, started_at DESC);

-- Incident response: failed or partial operations per organisation
CREATE INDEX IF NOT EXISTS idx_maint_ops_failed
  ON public.scheduling_maintenance_operations (organization_id, started_at DESC)
  WHERE operation_status IN ('failed', 'partial');

-- Stuck-worker detection: find operations in 'running' state for >N minutes
CREATE INDEX IF NOT EXISTS idx_maint_ops_running
  ON public.scheduling_maintenance_operations (started_at)
  WHERE operation_status = 'running';


-- =============================================================================
-- SECTION 7: GRANT EXECUTE
-- Advisory lock and helper functions are not granted to 'authenticated'.
-- They are called exclusively from SECURITY DEFINER RPCs and service-role
-- Edge Functions to prevent fake audit-log injection via REST API.
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.acquire_scheduling_org_lock(uuid)          TO service_role;
GRANT EXECUTE ON FUNCTION public.release_scheduling_org_lock(uuid)          TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_maintenance_operation(uuid,text,text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_maintenance_operation(uuid,text,jsonb,text)   TO service_role;
