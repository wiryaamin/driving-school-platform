-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260607000004_phase4ha_async_execution.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H-A — Async Replay Execution Infrastructure
--
-- Implements async replay execution infrastructure:
--
--   replay_execution_jobs
--     Queue of replay jobs with priority and status lifecycle.
--     Supports types: period_replay | fiscal_year_replay | full_replay |
--                     certification | export.
--     Priority 1–100 (higher = processed first). Default = 50.
--     Transitions: queued → running → completed | failed | cancelled.
--
-- SECURITY DEFINER functions:
--
--   enqueue_replay_job(p_org_id, p_period_id, p_fiscal_year_id,
--                      p_job_type, p_priority, p_actor_id)
--     → Inserts a replay_execution_jobs record (status=queued).
--       Validates required period_id / fiscal_year_id per job type.
--       Returns job uuid.
--
--   dequeue_replay_job(p_org_id)
--     → Claims the highest-priority queued job with FOR UPDATE SKIP LOCKED.
--       Transitions status to 'running'. Returns JSONB job descriptor.
--       Returns NULL if no queued jobs exist for the org.
--
--   complete_replay_job(p_job_id, p_result, p_error)
--     → Finalizes a running job as 'completed' (p_error = NULL) or 'failed'.
--       Raises exception if job is not in 'running' state.
--
-- Design notes:
--   • SKIP LOCKED enables concurrent worker execution without deadlocks.
--   • result_data jsonb stored on completion for replay_run_id traceability.
--   • Immutability NOT applied (jobs need lifecycle updates).
--   • priority + queued_at ordering ensures fair scheduling within priority.
--
-- Dependencies:
--   20260606000001_phase4h_replay_core.sql — ledger_replay_runs
--   20260603000001_phase4e_reconciliation_core.sql — fiscal_years
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum types ─────────────────────────────────────────────────────

CREATE TYPE public.replay_job_type AS ENUM (
  'period_replay',      -- Replay a single financial period
  'fiscal_year_replay', -- Replay all periods in a fiscal year
  'full_replay',        -- Replay all periods for the organization
  'certification',      -- Certify a period's replay state
  'export'              -- Generate canonical replay export for a period
);

CREATE TYPE public.replay_job_status AS ENUM (
  'queued',     -- Waiting to be picked up by a worker
  'running',    -- Currently executing
  'completed',  -- Finished successfully
  'failed',     -- Failed with error
  'cancelled'   -- Cancelled before execution
);

-- ── Section 2: replay_execution_jobs ─────────────────────────────────────────

CREATE TABLE public.replay_execution_jobs (
  id               uuid                      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid                      NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id        uuid                      REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  fiscal_year_id   uuid                      REFERENCES public.fiscal_years(id) ON DELETE RESTRICT,
  job_type         public.replay_job_type    NOT NULL,
  status           public.replay_job_status  NOT NULL DEFAULT 'queued',
  priority         int                       NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  replay_run_id    uuid                      REFERENCES public.ledger_replay_runs(id) ON DELETE SET NULL,
  requested_by     uuid                      REFERENCES auth.users(id) ON DELETE SET NULL,
  queued_at        timestamptz               NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  error_detail     text,
  result_data      jsonb                     NOT NULL DEFAULT '{}',
  created_at       timestamptz               NOT NULL DEFAULT now(),
  updated_at       timestamptz               NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.replay_execution_jobs IS
  'Async replay execution queue. Supports priority-based scheduling and concurrent workers. '
  'Priority 1–100 (higher = processed first). SKIP LOCKED prevents race conditions. '
  'Transitions: queued → running → completed | failed | cancelled.';

CREATE TRIGGER set_replay_execution_jobs_updated_at
  BEFORE UPDATE ON public.replay_execution_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Section 3: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.replay_execution_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rej_org_read"
  ON public.replay_execution_jobs FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:replay:read')
  );

-- ── Section 4: Grants ─────────────────────────────────────────────────────────

GRANT SELECT                    ON public.replay_execution_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE    ON public.replay_execution_jobs TO service_role;

-- ── FUNCTION: enqueue_replay_job ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_replay_job(
  p_org_id         uuid,
  p_period_id      uuid                   DEFAULT NULL,
  p_fiscal_year_id uuid                   DEFAULT NULL,
  p_job_type       public.replay_job_type DEFAULT 'period_replay',
  p_priority       int                    DEFAULT 50,
  p_actor_id       uuid                   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  -- Validate: period-scoped jobs require p_period_id
  IF p_job_type IN ('period_replay', 'certification', 'export')
     AND p_period_id IS NULL THEN
    RAISE EXCEPTION 'ENQUEUE_FAILED: p_period_id required for job type %', p_job_type
      USING ERRCODE = 'P0003';
  END IF;

  -- Validate: fiscal_year_replay requires p_fiscal_year_id
  IF p_job_type = 'fiscal_year_replay' AND p_fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'ENQUEUE_FAILED: p_fiscal_year_id required for fiscal_year_replay'
      USING ERRCODE = 'P0003';
  END IF;

  -- Validate priority range
  IF p_priority < 1 OR p_priority > 100 THEN
    RAISE EXCEPTION 'ENQUEUE_FAILED: priority must be between 1 and 100 (got %)', p_priority
      USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.replay_execution_jobs(
    organization_id, period_id, fiscal_year_id,
    job_type, status, priority, requested_by
  )
  VALUES (
    p_org_id, p_period_id, p_fiscal_year_id,
    p_job_type, 'queued', p_priority, p_actor_id
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

COMMENT ON FUNCTION public.enqueue_replay_job(uuid, uuid, uuid, public.replay_job_type, int, uuid) IS
  'Enqueues an async replay job. Returns job uuid. '
  'period_replay/certification/export require p_period_id. '
  'fiscal_year_replay requires p_fiscal_year_id.';

GRANT EXECUTE ON FUNCTION public.enqueue_replay_job(uuid, uuid, uuid, public.replay_job_type, int, uuid) TO service_role;

-- ── FUNCTION: dequeue_replay_job ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dequeue_replay_job(
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
BEGIN
  -- Claim highest-priority queued job; SKIP LOCKED for concurrent workers
  SELECT * INTO v_job
  FROM   public.replay_execution_jobs
  WHERE  organization_id = p_org_id
    AND  status          = 'queued'
  ORDER  BY priority DESC, queued_at ASC
  LIMIT  1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.replay_execution_jobs SET
    status     = 'running',
    started_at = now(),
    updated_at = now()
  WHERE id = v_job.id;

  RETURN jsonb_build_object(
    'job_id',         v_job.id,
    'job_type',       v_job.job_type,
    'period_id',      v_job.period_id,
    'fiscal_year_id', v_job.fiscal_year_id,
    'priority',       v_job.priority,
    'queued_at',      v_job.queued_at
  );
END;
$$;

COMMENT ON FUNCTION public.dequeue_replay_job(uuid) IS
  'Claims the highest-priority queued replay job (SKIP LOCKED, concurrent-safe). '
  'Transitions status queued → running. Returns job descriptor JSONB or NULL if queue empty.';

GRANT EXECUTE ON FUNCTION public.dequeue_replay_job(uuid) TO service_role;

-- ── FUNCTION: complete_replay_job ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_replay_job(
  p_job_id    uuid,
  p_result    jsonb DEFAULT NULL,
  p_error     text  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.replay_execution_jobs SET
    status       = CASE WHEN p_error IS NULL THEN 'completed'::public.replay_job_status
                        ELSE 'failed'::public.replay_job_status END,
    completed_at = now(),
    result_data  = COALESCE(p_result, '{}'),
    error_detail = p_error,
    updated_at   = now()
  WHERE id     = p_job_id
    AND status = 'running';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'COMPLETE_JOB_FAILED: job % is not in running state', p_job_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.complete_replay_job(uuid, jsonb, text) IS
  'Finalizes a running replay job. p_error=NULL → completed; p_error=text → failed. '
  'Raises exception if job is not in running state.';

GRANT EXECUTE ON FUNCTION public.complete_replay_job(uuid, jsonb, text) TO service_role;
