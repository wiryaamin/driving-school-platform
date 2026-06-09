-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260607000005_phase4ha_canonical_export_hashes.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H-A — Canonical Export Hashes (Unified Hash Registry)
--
-- Implements a cross-type canonical hash registry for all exports:
--
--   canonical_export_hashes
--     Immutable record of every deterministic export hash ever produced.
--     Covers: canonical_replay | canonical_accounting | sie4 | agi.
--     algorithm column tracks hash algorithm version for future migration.
--     export_id references the actual export record (no FK — cross-type).
--
-- Updated SECURITY DEFINER function:
--
--   generate_canonical_replay_export(p_org_id, p_period_id, p_notes, p_actor_id)
--     REFACTORED: no longer reads from replay_snapshots.
--     Uses deterministic_serializer() + canonical_accounting_hash() directly.
--     Writes to canonical_export_hashes (in addition to canonical_replay_exports
--     and replay_hash_registry as before).
--
-- Design notes:
--   • canonical_export_hashes complements replay_hash_registry:
--       replay_hash_registry = per-(org, period, type) LATEST hash
--       canonical_export_hashes = full immutable history of all export hashes
--   • export_id has no FK constraint (cross-type reference)
--   • algorithm = 'canonical_accounting_hash_v1' (upgradeable)
--
-- Dependencies:
--   20260607000001_phase4ha_canonical_hash_foundation.sql
--     — canonical_accounting_hash(), deterministic_serializer()
--   20260607000002_phase4ha_replay_delta_storage.sql
--     — replay_period_state (storage-light version)
--   20260606000005_phase4h_replay_validation.sql
--     — canonical_replay_exports, replay_hash_registry
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: canonical_export_type enum ────────────────────────────────────

CREATE TYPE public.canonical_export_type AS ENUM (
  'canonical_replay',      -- From canonical_replay_exports (reconstructed balances hash)
  'canonical_accounting',  -- From canonical_accounting_exports (journal_lines hash)
  'sie4',                  -- SIE4 export hash
  'agi'                    -- AGI regulatory export hash
);

-- ── Section 2: canonical_export_hashes ───────────────────────────────────────
-- Immutable unified registry of canonical export hashes across all export types.
-- Each row records one export event: what was exported, its hash, and the algorithm.
-- export_id: uuid of the export record (no FK — cross-type reference).
-- algorithm: always 'canonical_accounting_hash_v1' in Phase 4H-A.

CREATE TABLE public.canonical_export_hashes (
  id               uuid                        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid                        NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id        uuid                        REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  fiscal_year_id   uuid                        REFERENCES public.fiscal_years(id) ON DELETE RESTRICT,
  export_type      public.canonical_export_type NOT NULL,
  export_id        uuid                        NOT NULL,
  hash_value       text                        NOT NULL CHECK (length(hash_value) = 64),
  algorithm        text                        NOT NULL DEFAULT 'canonical_accounting_hash_v1',
  generated_at     timestamptz                 NOT NULL DEFAULT now(),
  generated_by     uuid                        REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT ceh_period_or_year CHECK (
    period_id IS NOT NULL OR fiscal_year_id IS NOT NULL
  )
);

COMMENT ON TABLE public.canonical_export_hashes IS
  'Immutable unified hash registry for all canonical export events. '
  'Covers: canonical_replay | canonical_accounting | sie4 | agi. '
  'export_id references the export record (cross-type, no FK). '
  'algorithm = canonical_accounting_hash_v1 (SHA-256, normalized 2dp, newline-delimited). '
  'Complements replay_hash_registry (which stores only the LATEST hash per period+type).';

CREATE OR REPLACE FUNCTION public.prevent_canonical_export_hash_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'CANONICAL_EXPORT_HASH_IMMUTABLE: export hash records are permanent audit evidence.'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER canonical_export_hashes_immutability
  BEFORE UPDATE OR DELETE ON public.canonical_export_hashes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_canonical_export_hash_mutation();

-- ── Section 3: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.canonical_export_hashes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ceh_org_read"
  ON public.canonical_export_hashes FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

-- ── Section 4: Grants ─────────────────────────────────────────────────────────

GRANT SELECT         ON public.canonical_export_hashes TO authenticated;
GRANT SELECT, INSERT ON public.canonical_export_hashes TO service_role;

-- ── FUNCTION: generate_canonical_replay_export (REFACTORED) ──────────────────
-- CHANGED from Phase 4H: no longer reads from replay_snapshots.
-- Uses deterministic_serializer() to build canonical rows from journal_lines.
-- Uses canonical_accounting_hash() for the deterministic SHA-256.
-- Also writes to canonical_export_hashes (new in Phase 4H-A).
-- Backwards-compatible: still writes to canonical_replay_exports and
-- replay_hash_registry exactly as before.

CREATE OR REPLACE FUNCTION public.generate_canonical_replay_export(
  p_org_id    uuid,
  p_period_id uuid,
  p_notes     text DEFAULT NULL,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_replay_result  jsonb;
  v_run_id         uuid;
  v_canonical_rows jsonb;
  v_content_hash   text;
  v_account_count  int;
  v_total_debit    numeric(14,2) := 0;
  v_total_credit   numeric(14,2) := 0;
  v_export_id      uuid;
  v_rec            jsonb;
BEGIN
  -- Run a fresh replay to create the ledger_replay_runs record
  v_replay_result := public.replay_period_state(p_org_id, p_period_id, p_actor_id);
  v_run_id        := (v_replay_result->>'replay_run_id')::uuid;

  -- Build canonical rows from journal_lines directly (no snapshot lookup)
  v_canonical_rows := public.deterministic_serializer(p_org_id, p_period_id);
  v_account_count  := jsonb_array_length(v_canonical_rows);

  -- Compute canonical hash using canonical_accounting_hash
  v_content_hash := public.canonical_accounting_hash(v_canonical_rows);

  -- Sum totals from canonical rows
  SELECT
    COALESCE(SUM((elem->>'debit')::numeric),  0),
    COALESCE(SUM((elem->>'credit')::numeric), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(v_canonical_rows) AS elem;

  -- Insert canonical_replay_exports (same as before — backward compat)
  INSERT INTO public.canonical_replay_exports(
    organization_id, period_id, replay_run_id,
    export_content, content_hash,
    account_count, total_debit, total_credit,
    notes, created_by
  )
  VALUES (
    p_org_id, p_period_id, v_run_id,
    v_canonical_rows, v_content_hash,
    v_account_count, v_total_debit, v_total_credit,
    p_notes, p_actor_id
  )
  RETURNING id INTO v_export_id;

  -- Upsert canonical_export hash in replay_hash_registry (same as before)
  INSERT INTO public.replay_hash_registry(
    organization_id, period_id, replay_run_id, hash_value, hash_type
  )
  VALUES (p_org_id, p_period_id, v_run_id, v_content_hash, 'canonical_export')
  ON CONFLICT (organization_id, period_id, hash_type) DO UPDATE SET
    replay_run_id = EXCLUDED.replay_run_id,
    hash_value    = EXCLUDED.hash_value;

  -- NEW: Record in canonical_export_hashes (immutable history)
  INSERT INTO public.canonical_export_hashes(
    organization_id, period_id,
    export_type, export_id, hash_value,
    generated_by
  )
  VALUES (
    p_org_id, p_period_id,
    'canonical_replay', v_export_id, v_content_hash,
    p_actor_id
  );

  RETURN v_export_id;
END;
$$;

COMMENT ON FUNCTION public.generate_canonical_replay_export(uuid, uuid, text, uuid) IS
  'REFACTORED (Phase 4H-A): uses deterministic_serializer() + canonical_accounting_hash(). '
  'No longer reads from replay_snapshots. Storage-light. '
  'Writes to: canonical_replay_exports, replay_hash_registry, canonical_export_hashes. '
  'Returns canonical_replay_exports.id.';

GRANT EXECUTE ON FUNCTION public.generate_canonical_replay_export(uuid, uuid, text, uuid) TO service_role;
