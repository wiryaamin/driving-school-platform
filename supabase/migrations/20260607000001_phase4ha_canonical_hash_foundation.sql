-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260607000001_phase4ha_canonical_hash_foundation.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H-A — Accounting Architecture Stabilization (Foundation)
--
-- Implements canonical hashing infrastructure and accounting layer registry:
--
--   canonical_accounting_hash(jsonb) → text
--     Deterministic SHA-256 hash over sorted account rows.
--     Normalizes decimals to 2dp, nulls to '0.00', encoding to UTF-8.
--     Input: jsonb array of {account_code, debit, credit, balance}.
--     Identical accounting state always produces identical hash.
--     IMMUTABLE — safe for indexing and caching.
--
--   deterministic_serializer(p_org_id, p_period_id) → jsonb
--     Reconstructs account-level aggregates from journal_lines only
--     (posted entries). Returns sorted jsonb array for canonical_accounting_hash.
--     Normalizes all amounts to ROUND(x, 2). STABLE.
--
--   accounting_layer_registry
--     Registry of all accounting architecture layers. Global config table.
--     Layer types: source_of_truth | projection | archive | governance | reporting
--     Seeded with the 5 canonical layers of the ERP accounting platform.
--
-- Architecture contract encoded:
--   1. journal_entries + journal_lines are the ONLY source of truth
--   2. account_balances is a mutable projection/cache — derived, not authoritative
--   3. canonical exports are immutable archives
--   4. replay governance tables are the immutable audit trail
--   5. views are ephemeral reporting — never persisted
--
-- Dependencies:
--   20260606000001_phase4h_replay_core.sql — ledger_replay_runs
--   20260606000005_phase4h_replay_validation.sql — canonical_replay_exports
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: accounting_layer_type enum ────────────────────────────────────

CREATE TYPE public.accounting_layer_type AS ENUM (
  'source_of_truth', -- journal_entries + journal_lines (immutable, authoritative)
  'projection',      -- account_balances cache (mutable, must match source)
  'archive',         -- canonical exports (immutable point-in-time snapshots)
  'governance',      -- replay audit trail (certifications, divergences)
  'reporting'        -- views (ephemeral, always computed on demand)
);

-- ── Section 2: canonical_accounting_hash ─────────────────────────────────────
-- Deterministic SHA-256 over sorted, normalized account balance rows.
--
-- Input format: jsonb array, each element: {account_code, debit, credit, balance}
-- Normalization rules:
--   • account_code: treated as text; NULL → empty string
--   • debit / credit / balance: ROUND(x::numeric, 2)::text; NULL → '0.00'
--   • Row delimiter: newline (E'\n')
--   • Field delimiter: pipe ('|')
--   • Sort order: account_code ASC (deterministic across identical journals)
--
-- Idempotency guarantee: identical journal_lines → identical hash.
-- Algorithm version: SHA-256 / canonical_accounting_hash_v1

CREATE OR REPLACE FUNCTION public.canonical_accounting_hash(
  p_rows jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT encode(
    sha256(
      COALESCE(
        (
          SELECT string_agg(
            COALESCE(elem->>'account_code', '')                              || '|' ||
            COALESCE(ROUND((elem->>'debit')::numeric,   2)::text, '0.00')   || '|' ||
            COALESCE(ROUND((elem->>'credit')::numeric,  2)::text, '0.00')   || '|' ||
            COALESCE(ROUND((elem->>'balance')::numeric, 2)::text, '0.00'),
            E'\n'
            ORDER BY elem->>'account_code' ASC
          )
          FROM jsonb_array_elements(p_rows) AS elem
        ),
        ''
      )::bytea
    ),
    'hex'
  )
$$;

COMMENT ON FUNCTION public.canonical_accounting_hash(jsonb) IS
  'Deterministic SHA-256 hash over sorted, normalized account balance rows. '
  'Input: jsonb array of {account_code, debit, credit, balance}. '
  'Normalizes: decimals to 2dp, nulls to 0.00, sort order by account_code ASC. '
  'Identical accounting state always produces identical hash (canonical_accounting_hash_v1).';

GRANT EXECUTE ON FUNCTION public.canonical_accounting_hash(jsonb) TO authenticated, service_role;

-- ── Section 3: deterministic_serializer ──────────────────────────────────────
-- Reconstructs canonical account-level balance aggregates from posted
-- journal_lines only. Returns a sorted jsonb array ready for
-- canonical_accounting_hash().
--
-- Source of truth: journal_entries (status='posted') + journal_lines.
-- Column references: journal_entries.financial_period_id (Phase 4D convention).
-- Returns '[]'::jsonb when no posted entries exist for the period.

CREATE OR REPLACE FUNCTION public.deterministic_serializer(
  p_org_id    uuid,
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'account_code', t.account_code,
        'debit',        t.debit,
        'credit',       t.credit,
        'balance',      t.balance
      )
      ORDER BY t.account_code ASC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      jl.account_code,
      ROUND(SUM(jl.debit_amount),                              2) AS debit,
      ROUND(SUM(jl.credit_amount),                             2) AS credit,
      ROUND(SUM(jl.debit_amount) - SUM(jl.credit_amount),     2) AS balance
    FROM   public.journal_lines   jl
    JOIN   public.journal_entries je ON je.id = jl.entry_id
    WHERE  je.organization_id     = p_org_id
      AND  je.financial_period_id = p_period_id
      AND  je.status              = 'posted'
    GROUP  BY jl.account_code
  ) t
$$;

COMMENT ON FUNCTION public.deterministic_serializer(uuid, uuid) IS
  'Reconstructs canonical account aggregates from posted journal_lines only. '
  'Returns sorted jsonb array of {account_code, debit, credit, balance} for canonical_accounting_hash(). '
  'Source of truth: journal_entries.financial_period_id + journal_lines (no cache reliance).';

GRANT EXECUTE ON FUNCTION public.deterministic_serializer(uuid, uuid) TO service_role;

-- ── Section 4: accounting_layer_registry ─────────────────────────────────────
-- Global registry of accounting architecture layers.
-- NOT per-organisation — describes the platform's accounting model.
-- No RLS needed: config data visible to all authenticated users.

CREATE TABLE public.accounting_layer_registry (
  id                 uuid                          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  layer_name         text                          NOT NULL UNIQUE,
  layer_type         public.accounting_layer_type  NOT NULL,
  table_names        text[]                        NOT NULL DEFAULT '{}',
  description        text                          NOT NULL,
  is_mutable         boolean                       NOT NULL DEFAULT true,
  is_source_of_truth boolean                       NOT NULL DEFAULT false,
  is_derived         boolean                       NOT NULL DEFAULT false,
  sort_order         int                           NOT NULL DEFAULT 100,
  created_at         timestamptz                   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.accounting_layer_registry IS
  'Global registry of the five canonical accounting architecture layers. '
  'Encodes: which tables are source-of-truth, which are projections, archives, governance, or reporting. '
  'Not per-organisation; no RLS required. Used for architecture introspection and audit.';

GRANT SELECT ON public.accounting_layer_registry TO authenticated, service_role;

-- ── Section 5: Seed accounting layer data ────────────────────────────────────

INSERT INTO public.accounting_layer_registry
  (layer_name, layer_type, table_names, description,
   is_mutable, is_source_of_truth, is_derived, sort_order)
VALUES
  (
    'source_of_truth',
    'source_of_truth',
    ARRAY['journal_entries', 'journal_lines'],
    'Immutable double-entry journal. The ONLY authoritative source for all account balances. '
    'All financial state must be fully reconstructable from these two tables alone.',
    false, true, false, 1
  ),
  (
    'balance_projections',
    'projection',
    ARRAY['account_balances'],
    'Mutable balance cache derived from journal_lines. Must always equal deterministic_serializer() output. '
    'Never authoritative — treat as a performance optimisation, not a source of truth.',
    true, false, true, 2
  ),
  (
    'canonical_archives',
    'archive',
    ARRAY[
      'canonical_accounting_exports',
      'canonical_replay_exports',
      'canonical_export_hashes'
    ],
    'Immutable point-in-time accounting snapshots with deterministic SHA-256 hashes. '
    'Produced by canonical_accounting_hash(). Used for audit evidence and external compliance.',
    false, false, true, 3
  ),
  (
    'replay_governance',
    'governance',
    ARRAY[
      'ledger_replay_runs',
      'replay_validation_deltas',
      'replay_certifications',
      'replay_integrity_certificates',
      'replay_divergence_events',
      'replay_validation_reports',
      'replay_hash_registry',
      'replay_execution_jobs'
    ],
    'Immutable audit trail of all replay runs, certifications, divergence events, and governance state. '
    'Storage-light design: only divergences are persisted (not full reconstructed snapshots).',
    false, false, false, 4
  ),
  (
    'reporting_views',
    'reporting',
    ARRAY[
      'v_replay_governance_dashboard',
      'v_accounting_layer_model',
      'v_certification_dashboard',
      'v_replay_execution_status',
      'v_delta_summary'
    ],
    'Database views for reporting and dashboards. Never persisted; always computed on demand. '
    'security_invoker = true on all views.',
    false, false, true, 5
  );
