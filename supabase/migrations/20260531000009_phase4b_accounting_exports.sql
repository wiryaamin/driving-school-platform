-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260531000009_phase4b_accounting_exports.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4B.9 — SIE4 Export Infrastructure and Accounting Safeguards
--
-- Implements the immutable journal entry snapshot layer for Swedish SIE4
-- (and other format) accounting exports.
--
-- New table:
--   accounting_export_entries — immutable snapshot of journal entries per export run.
--     Each row = one double-entry journal entry (debit_amount = credit_amount).
--     Created atomically by create_accounting_export(). Never modified.
--
-- New SECURITY DEFINER functions:
--   create_accounting_export(...)  — duplicate check, run creation, queue snapshot
--   finalize_accounting_export(...) — marks run complete, marks queue items exported
--   abort_accounting_export(...)   — marks run failed (queue items remain pending)
--
-- Export safeguards:
--   • Duplicate prevention: create_accounting_export() raises DUPLICATE_EXPORT if
--     a completed export for the same org+format with overlapping date range exists.
--   • Advisory lock: serialize concurrent create calls per (org, format).
--   • Immutable entries: prevent_export_entry_mutation() trigger blocks any
--     UPDATE or DELETE on accounting_export_entries.
--   • Completed run protection: finalize and abort validate run status before acting.
--   • Balanced entries: CHECK (debit_amount = credit_amount) enforces double-entry.
--   • Export audit trail: Export.Started / Export.Completed / Export.Failed events.
--
-- SIE4 readiness:
--   Each entry contains the account codes (BAS standard), amount, transaction date,
--   description, and source event lineage needed to render SIE4 #VER + #TRANS blocks.
--   The TypeScript AccountingExportService reads these entries and generates the file.
--
-- Account mapping: resolved from accounting_chart_of_accounts at queue-time.
--   Queue items with NULL account_debit or account_credit are skipped (unmapped).
--   The unmapped_item_count in the export run's metadata reflects skipped items.
--
-- Dependencies:
--   20260531000008_phase4b_finance_dashboard_rpcs.sql
-- ════════════════════════════════════════════════════════════════════════════


-- ── Section 1: New table ─────────────────────────────────────────────────────

-- accounting_export_entries
-- Immutable snapshot of double-entry journal entries for one export run.
-- Created atomically by create_accounting_export() from accounting_export_queue.
-- Each row represents one balanced journal entry (debit = credit).
-- Never updated or deleted after creation — the trigger enforces this.
-- The TypeScript export service reads these rows to generate SIE4/CSV output.

CREATE TABLE public.accounting_export_entries (
  id                    uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  export_run_id         uuid          NOT NULL REFERENCES public.accounting_export_runs(id) ON DELETE RESTRICT,
  sequence_number       int           NOT NULL CHECK (sequence_number >= 1),
  transaction_date      date          NOT NULL,
  account_debit         text          NOT NULL,
  account_credit        text          NOT NULL,
  debit_amount          numeric(12,2) NOT NULL CHECK (debit_amount >= 0),
  credit_amount         numeric(12,2) NOT NULL CHECK (credit_amount >= 0),
  description           text          NOT NULL DEFAULT '',
  source_event_type     text          NOT NULL,
  source_queue_item_id  uuid          REFERENCES public.accounting_export_queue(id) ON DELETE SET NULL,
  metadata              jsonb         NOT NULL DEFAULT '{}',
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT export_entries_run_seq_unique  UNIQUE (export_run_id, sequence_number),
  CONSTRAINT export_entries_balanced        CHECK  (debit_amount = credit_amount)
);

COMMENT ON TABLE  public.accounting_export_entries IS
  'Immutable snapshot of double-entry journal entries per export run. '
  'Created atomically by create_accounting_export(). Never updated or deleted. '
  'Each row is a balanced journal entry: debit_amount = credit_amount. '
  'The TypeScript export service reads these rows to generate SIE4 #VER + #TRANS entries.';
COMMENT ON COLUMN public.accounting_export_entries.sequence_number IS
  'Sequential number within the export run (1-based). Used as SIE4 voucher series number.';
COMMENT ON COLUMN public.accounting_export_entries.account_debit IS
  'Swedish BAS account code for the debit side (e.g., 1510 = Kundfordringar).';
COMMENT ON COLUMN public.accounting_export_entries.account_credit IS
  'Swedish BAS account code for the credit side (e.g., 3040 = Tjänsteförsäljning 25% moms).';
COMMENT ON COLUMN public.accounting_export_entries.source_queue_item_id IS
  'References the accounting_export_queue item this entry was snapshotted from. '
  'NULL if the queue item was deleted after export.';


-- ── Section 2: Immutability trigger ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_export_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'EXPORT_ENTRY_IMMUTABLE: accounting export entries cannot be modified or deleted. '
    'Export entries are a permanent audit snapshot. To correct an export, create a new run.'
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.prevent_export_entry_mutation() IS
  'BEFORE UPDATE OR DELETE guard on accounting_export_entries. '
  'Export entries are immutable by design — they form an audit snapshot. '
  'Any modification would invalidate the accounting trail.';

CREATE TRIGGER accounting_export_entries_immutability
  BEFORE UPDATE OR DELETE ON public.accounting_export_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_export_entry_mutation();

COMMENT ON TRIGGER accounting_export_entries_immutability ON public.accounting_export_entries IS
  'Blocks all UPDATE and DELETE on accounting export entries. '
  'Entries can only be created (INSERT) — never modified.';


-- ── Section 3: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.accounting_export_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "export_entries_select"
  ON public.accounting_export_entries FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:export:run')
  );

COMMENT ON POLICY "export_entries_select" ON public.accounting_export_entries IS
  'Only users with finance:export:run can view accounting export entries.';


-- ── Section 4: Table grants ──────────────────────────────────────────────────

GRANT SELECT         ON public.accounting_export_entries TO authenticated;
GRANT SELECT, INSERT ON public.accounting_export_entries TO service_role;


-- ── Section 5: SECURITY DEFINER functions ───────────────────────────────────

-- ── 5.1 create_accounting_export ─────────────────────────────────────────────
-- Initialises a new accounting export run with an immutable journal entry snapshot.
--
-- Steps:
--   1. Acquire per-(org, format) advisory transaction lock (prevents concurrent exports)
--   2. Duplicate check: raise DUPLICATE_EXPORT if a completed export for same
--      org + format already covers any overlapping date range
--   3. Insert accounting_export_runs row with status='running'
--   4. Snapshot all pending queue items (with mapped accounts) into
--      accounting_export_entries with ROW_NUMBER() as sequence_number
--   5. Update run item_count + unmapped_item_count metadata
--   6. Emit Export.Started outbox event
--   7. Return the new export_run_id
--
-- Items in accounting_export_queue with NULL account_debit or account_credit
-- are skipped (not included in the snapshot). These are unmapped events.
-- The unmapped count is stored in the run's metadata for alerting.
--
-- On failure: the entire transaction rolls back. No partial state.

CREATE OR REPLACE FUNCTION public.create_accounting_export(
  p_org_id    uuid,
  p_format    public.accounting_export_format,
  p_from_date date,
  p_to_date   date,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS uuid  -- export_run_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id         uuid;
  v_entry_count    int;
  v_unmapped_count int;
BEGIN
  -- Validate date range
  IF p_to_date < p_from_date THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE: to_date % is before from_date %',
      p_to_date, p_from_date
      USING ERRCODE = 'P0001';
  END IF;

  -- Advisory lock: serialize concurrent export creation per (org, format)
  -- Prevents race conditions on the duplicate check + run creation
  PERFORM pg_advisory_xact_lock(
    hashtext(p_org_id::text),
    hashtext(p_format::text)
  );

  -- Duplicate export guard: block if a completed export overlaps this date range
  IF EXISTS (
    SELECT 1
    FROM   accounting_export_runs
    WHERE  organization_id = p_org_id
      AND  format          = p_format
      AND  status          = 'completed'
      AND  from_date       <= p_to_date
      AND  to_date         >= p_from_date
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_EXPORT: a completed % export already exists covering the date range % to %',
      p_format, p_from_date, p_to_date
      USING ERRCODE = 'P0001';
  END IF;

  -- Create the export run record
  INSERT INTO accounting_export_runs (
    organization_id, format, from_date, to_date,
    status, started_at, created_by
  ) VALUES (
    p_org_id, p_format, p_from_date, p_to_date,
    'running', now(), p_actor_id
  ) RETURNING id INTO v_run_id;

  -- Count unmapped queue items (excluded from snapshot)
  SELECT COUNT(*)
  INTO   v_unmapped_count
  FROM   accounting_export_queue
  WHERE  organization_id  = p_org_id
    AND  exported_at       IS NULL
    AND  transaction_date  BETWEEN p_from_date AND p_to_date
    AND  (account_debit IS NULL OR account_credit IS NULL);

  -- Snapshot mapped queue items into immutable export entries
  -- sequence_number is assigned by row order (transaction_date ASC, id ASC)
  INSERT INTO accounting_export_entries (
    organization_id,
    export_run_id,
    sequence_number,
    transaction_date,
    account_debit,
    account_credit,
    debit_amount,
    credit_amount,
    description,
    source_event_type,
    source_queue_item_id
  )
  SELECT
    p_org_id,
    v_run_id,
    ROW_NUMBER() OVER (ORDER BY q.transaction_date ASC, q.id ASC)::int,
    q.transaction_date,
    q.account_debit,
    q.account_credit,
    COALESCE(q.amount, 0),
    COALESCE(q.amount, 0),
    COALESCE(q.event_type, ''),
    q.event_type,
    q.id
  FROM accounting_export_queue q
  WHERE q.organization_id  = p_org_id
    AND q.exported_at       IS NULL
    AND q.transaction_date  BETWEEN p_from_date AND p_to_date
    AND q.account_debit    IS NOT NULL
    AND q.account_credit   IS NOT NULL
  ORDER BY q.transaction_date ASC, q.id ASC;

  GET DIAGNOSTICS v_entry_count = ROW_COUNT;

  -- Update run with final counts
  -- unmapped_item_count stored in metadata for operational visibility
  UPDATE accounting_export_runs
  SET
    item_count   = v_entry_count,
    error_message = CASE
      WHEN v_unmapped_count > 0
      THEN v_unmapped_count::text || ' queue items skipped (no account mapping)'
      ELSE NULL
    END
  WHERE id = v_run_id;

  -- Emit Export.Started
  PERFORM insert_outbox_event(
    'Export.Started',
    'accounting',
    jsonb_build_object(
      'export_run_id',    v_run_id,
      'format',           p_format,
      'from_date',        p_from_date,
      'to_date',          p_to_date,
      'entry_count',      v_entry_count,
      'unmapped_count',   v_unmapped_count,
      'started_by',       p_actor_id
    ),
    p_org_id,
    NULL
  );

  RETURN v_run_id;
END;
$$;

COMMENT ON FUNCTION public.create_accounting_export(uuid, public.accounting_export_format, date, date, uuid) IS
  'Initialises an accounting export run. Checks for duplicate completed exports, '
  'creates an export_runs record, snapshots mapped queue items into '
  'accounting_export_entries, and emits Export.Started. '
  'Queue items with unmapped accounts are skipped (counted in error_message). '
  'Advisory lock prevents concurrent exports for the same org+format.';

GRANT EXECUTE ON FUNCTION public.create_accounting_export(
  uuid, public.accounting_export_format, date, date, uuid
) TO authenticated, service_role;


-- ── 5.2 finalize_accounting_export ───────────────────────────────────────────
-- Marks an export run as completed and marks all snapshotted queue items as exported.
-- Called by the TypeScript service after the SIE4 file has been generated and stored.
--
-- Steps:
--   1. Lock and validate run (must be 'running' — not already completed or failed)
--   2. Update run: status='completed', file_reference, item_count, completed_at
--   3. Mark all queue items referenced by this run's entries as exported
--      (set exported_at = now(), export_run_id = v_run_id)
--   4. Emit Export.Completed outbox event

CREATE OR REPLACE FUNCTION public.finalize_accounting_export(
  p_export_run_id  uuid,
  p_file_reference text,
  p_item_count     int,
  p_actor_id       uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run accounting_export_runs%ROWTYPE;
BEGIN
  -- Lock and validate run
  SELECT * INTO v_run
  FROM   accounting_export_runs
  WHERE  id = p_export_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXPORT_RUN_NOT_FOUND: %', p_export_run_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_run.status = 'completed' THEN
    RAISE EXCEPTION 'EXPORT_ALREADY_COMPLETED: export run % is already completed',
      p_export_run_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_run.status = 'failed' THEN
    RAISE EXCEPTION 'EXPORT_RUN_FAILED: export run % has status failed; create a new run',
      p_export_run_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Mark run as completed
  UPDATE accounting_export_runs
  SET
    status          = 'completed',
    file_reference  = p_file_reference,
    item_count      = p_item_count,
    completed_at    = now()
  WHERE id = p_export_run_id;

  -- Mark referenced queue items as exported
  UPDATE accounting_export_queue
  SET
    exported_at   = now(),
    export_run_id = p_export_run_id
  WHERE id IN (
    SELECT source_queue_item_id
    FROM   accounting_export_entries
    WHERE  export_run_id        = p_export_run_id
      AND  source_queue_item_id IS NOT NULL
  )
  AND exported_at IS NULL;

  -- Emit Export.Completed
  PERFORM insert_outbox_event(
    'Export.Completed',
    'accounting',
    jsonb_build_object(
      'export_run_id',   p_export_run_id,
      'format',          v_run.format,
      'from_date',       v_run.from_date,
      'to_date',         v_run.to_date,
      'item_count',      p_item_count,
      'file_reference',  p_file_reference,
      'completed_by',    p_actor_id
    ),
    v_run.organization_id,
    NULL
  );
END;
$$;

COMMENT ON FUNCTION public.finalize_accounting_export(uuid, text, int, uuid) IS
  'Marks an export run as completed. Validates run is in ''running'' state. '
  'Sets file_reference + completed_at. Marks queue items as exported. '
  'Emits Export.Completed. Called after the TypeScript service stores the SIE4 file.';

GRANT EXECUTE ON FUNCTION public.finalize_accounting_export(uuid, text, int, uuid)
  TO authenticated, service_role;


-- ── 5.3 abort_accounting_export ──────────────────────────────────────────────
-- Marks an export run as failed. Queue items remain un-exported for the next run.
-- Cannot abort a completed export (that would break the audit trail).

CREATE OR REPLACE FUNCTION public.abort_accounting_export(
  p_export_run_id uuid,
  p_error_message text,
  p_actor_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run accounting_export_runs%ROWTYPE;
BEGIN
  -- Lock and validate run
  SELECT * INTO v_run
  FROM   accounting_export_runs
  WHERE  id = p_export_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXPORT_RUN_NOT_FOUND: %', p_export_run_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_run.status = 'completed' THEN
    RAISE EXCEPTION 'EXPORT_ALREADY_COMPLETED: cannot abort completed export run %',
      p_export_run_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_run.status = 'failed' THEN
    -- Idempotent: already aborted, just update error message
    UPDATE accounting_export_runs
    SET error_message = p_error_message
    WHERE id = p_export_run_id;
    RETURN;
  END IF;

  -- Mark as failed
  -- Queue items are NOT marked as exported — they remain available for the next run
  UPDATE accounting_export_runs
  SET
    status        = 'failed',
    error_message = p_error_message,
    completed_at  = now()
  WHERE id = p_export_run_id;

  -- Emit Export.Failed
  PERFORM insert_outbox_event(
    'Export.Failed',
    'internal',
    jsonb_build_object(
      'export_run_id', p_export_run_id,
      'format',        v_run.format,
      'from_date',     v_run.from_date,
      'to_date',       v_run.to_date,
      'error_message', p_error_message,
      'aborted_by',    p_actor_id
    ),
    v_run.organization_id,
    NULL
  );
END;
$$;

COMMENT ON FUNCTION public.abort_accounting_export(uuid, text, uuid) IS
  'Marks an export run as failed with an error message. '
  'Queue items remain un-exported and will be included in the next run. '
  'Cannot abort a completed export — that would break the audit trail.';

GRANT EXECUTE ON FUNCTION public.abort_accounting_export(uuid, text, uuid)
  TO authenticated, service_role;
