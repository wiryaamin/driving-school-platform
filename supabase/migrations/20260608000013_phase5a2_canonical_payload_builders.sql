-- Phase 5A.2: Centralized Canonical Payload Builders
--
-- Provides six pure IMMUTABLE builder functions (one per entity domain) plus a
-- SECURITY DEFINER dispatcher that reads from the database and routes to the
-- correct builder. ALL replay validation must call build_canonical_payload() or
-- a specific build_*_canonical_payload() — never reconstruct payloads inline.
--
-- Functions (IMMUTABLE — depend only on their arguments):
--   build_agi_canonical_payload(numeric, numeric, numeric) → jsonb
--   build_vat_canonical_payload(numeric, numeric, numeric, numeric, numeric) → jsonb
--   build_saft_canonical_payload(uuid, date, date, text, int, int, int) → jsonb
--   build_sie4_canonical_payload(uuid, uuid, date, date, int, int) → jsonb
--   build_invoice_canonical_payload(uuid, text, uuid, numeric, numeric, date) → jsonb
--
-- Dispatcher (SECURITY DEFINER — reads from DB):
--   build_canonical_payload(entity_type, entity_id, org_id) → jsonb

-- ── build_agi_canonical_payload() ─────────────────────────────────────────────
-- Returns the canonical jsonb array used to compute agi_submissions.submission_hash
-- via canonical_accounting_hash(). Normalizes all amounts to 2 decimal places.
-- Deterministic: given the same totals, always returns byte-identical jsonb.

CREATE OR REPLACE FUNCTION build_agi_canonical_payload(
  p_total_gross            numeric,
  p_total_withheld_tax     numeric,
  p_total_employer_contrib numeric
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT canonical_jsonb(jsonb_build_array(
  jsonb_build_object(
    'account_code', 'AGI',
    'balance',      ROUND(COALESCE(p_total_employer_contrib, 0), 2),
    'credit',       ROUND(COALESCE(p_total_withheld_tax,    0), 2),
    'debit',        ROUND(COALESCE(p_total_gross,           0), 2)
  )
))
$$;

-- ── build_vat_canonical_payload() ─────────────────────────────────────────────
-- Returns the canonical jsonb array used to compute vat_declarations.declaration_hash
-- via canonical_accounting_hash(). Boxes: 05 (taxable), 10/11/12 (output VAT),
-- 30 (input VAT). Does NOT include computed BOX49 (net) — consistent with the
-- original hash computation in generate_vat_declaration.

CREATE OR REPLACE FUNCTION build_vat_canonical_payload(
  p_box05_taxable_turnover numeric,
  p_box10_output_vat_25    numeric,
  p_box11_output_vat_12    numeric,
  p_box12_output_vat_6     numeric,
  p_box30_input_vat        numeric
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT canonical_jsonb(jsonb_build_array(
  jsonb_build_object(
    'account_code', 'BOX05',
    'balance',  ROUND(COALESCE(p_box05_taxable_turnover, 0), 2),
    'credit',   0::numeric,
    'debit',    ROUND(COALESCE(p_box05_taxable_turnover, 0), 2)
  ),
  jsonb_build_object(
    'account_code', 'BOX10',
    'balance',  ROUND(COALESCE(p_box10_output_vat_25, 0), 2),
    'credit',   0::numeric,
    'debit',    ROUND(COALESCE(p_box10_output_vat_25, 0), 2)
  ),
  jsonb_build_object(
    'account_code', 'BOX11',
    'balance',  ROUND(COALESCE(p_box11_output_vat_12, 0), 2),
    'credit',   0::numeric,
    'debit',    ROUND(COALESCE(p_box11_output_vat_12, 0), 2)
  ),
  jsonb_build_object(
    'account_code', 'BOX12',
    'balance',  ROUND(COALESCE(p_box12_output_vat_6, 0), 2),
    'credit',   0::numeric,
    'debit',    ROUND(COALESCE(p_box12_output_vat_6, 0), 2)
  ),
  jsonb_build_object(
    'account_code', 'BOX30',
    'balance',  ROUND(-COALESCE(p_box30_input_vat, 0), 2),
    'credit',   ROUND(COALESCE(p_box30_input_vat, 0), 2),
    'debit',    0::numeric
  )
))
$$;

-- ── build_saft_canonical_payload() ────────────────────────────────────────────
-- Returns the canonical jsonb object used to compute saf_t_exports.content_hash
-- via generate_replay_safe_hash(). Represents the data fingerprint of the SAF-T
-- package: org, period, scope, and source record counts.
-- All values stored as text to guarantee byte-stable serialization.

CREATE OR REPLACE FUNCTION build_saft_canonical_payload(
  p_org_id              uuid,
  p_period_start        date,
  p_period_end          date,
  p_export_scope        text,
  p_journal_entry_count integer,
  p_transaction_count   integer,
  p_account_count       integer
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT canonical_jsonb(jsonb_build_object(
  'account_count',       COALESCE(p_account_count, 0)::text,
  'export_scope',        COALESCE(p_export_scope, 'full'),
  'journal_entry_count', COALESCE(p_journal_entry_count, 0)::text,
  'org_id',              COALESCE(p_org_id::text, ''),
  'period_end',          COALESCE(p_period_end::text, ''),
  'period_start',        COALESCE(p_period_start::text, ''),
  'transaction_count',   COALESCE(p_transaction_count, 0)::text
))
$$;

-- ── build_sie4_canonical_payload() ────────────────────────────────────────────
-- Returns the canonical jsonb for a SIE4 export file fingerprint.
-- Forward-looking builder for PEPPOL/regulatory integrations. Stable once
-- the export is generated; no runtime state included.

CREATE OR REPLACE FUNCTION build_sie4_canonical_payload(
  p_org_id         uuid,
  p_fiscal_year_id uuid,
  p_period_start   date,
  p_period_end     date,
  p_entry_count    integer,
  p_account_count  integer
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT canonical_jsonb(jsonb_build_object(
  'account_count',  COALESCE(p_account_count, 0)::text,
  'entity_type',    'sie4_export',
  'entry_count',    COALESCE(p_entry_count, 0)::text,
  'fiscal_year_id', COALESCE(p_fiscal_year_id::text, ''),
  'org_id',         COALESCE(p_org_id::text, ''),
  'period_end',     COALESCE(p_period_end::text, ''),
  'period_start',   COALESCE(p_period_start::text, '')
))
$$;

-- ── build_invoice_canonical_payload() ─────────────────────────────────────────
-- Returns the canonical jsonb for an invoice. Forward-looking builder for
-- PEPPOL/BIS-3 invoice generation and archival hash registration.
-- Amounts normalized to 2 decimal places via normalize_decimal().

CREATE OR REPLACE FUNCTION build_invoice_canonical_payload(
  p_org_id         uuid,
  p_invoice_number text,
  p_student_id     uuid,
  p_total_amount   numeric,
  p_tax_amount     numeric,
  p_invoice_date   date
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT canonical_jsonb(jsonb_build_object(
  'entity_type',    'invoice',
  'invoice_date',   COALESCE(p_invoice_date::text, ''),
  'invoice_number', COALESCE(p_invoice_number, ''),
  'org_id',         COALESCE(p_org_id::text, ''),
  'student_id',     COALESCE(p_student_id::text, ''),
  'tax_amount',     normalize_decimal(COALESCE(p_tax_amount, 0), 2),
  'total_amount',   normalize_decimal(COALESCE(p_total_amount, 0), 2)
))
$$;

-- ── build_canonical_payload() ─────────────────────────────────────────────────
-- SECURITY DEFINER dispatcher: reads the entity from the database and routes to
-- the appropriate IMMUTABLE builder. This is the single entry point for ALL
-- replay validation logic — eliminates duplicated payload reconstruction.
--
-- Supported entity_types: 'agi_submission', 'vat_declaration', 'saf_t_export'
-- Returns: canonical, timestamp-free jsonb payload ready for hashing

CREATE OR REPLACE FUNCTION build_canonical_payload(
  p_entity_type text,
  p_entity_id   uuid,
  p_org_id      uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  CASE p_entity_type

    WHEN 'agi_submission' THEN
      SELECT build_agi_canonical_payload(
        ae.total_gross,
        ae.total_withheld_tax,
        ae.total_employer_contrib
      )
      INTO v_result
      FROM agi_submissions sub
      JOIN agi_exports ae ON ae.id = sub.agi_export_id
      WHERE sub.id = p_entity_id
        AND sub.organization_id = p_org_id;

    WHEN 'vat_declaration' THEN
      SELECT build_vat_canonical_payload(
        d.box_05_taxable_turnover,
        d.box_10_output_vat_25,
        d.box_11_output_vat_12,
        d.box_12_output_vat_6,
        d.box_30_input_vat
      )
      INTO v_result
      FROM vat_declarations d
      WHERE d.id = p_entity_id
        AND d.organization_id = p_org_id;

    WHEN 'saf_t_export' THEN
      SELECT build_saft_canonical_payload(
        p_org_id,
        se.period_start,
        se.period_end,
        se.export_scope::text,
        se.journal_entry_count,
        se.transaction_count,
        se.account_count
      )
      INTO v_result
      FROM saf_t_exports se
      WHERE se.id = p_entity_id
        AND se.organization_id = p_org_id;

    ELSE
      RAISE EXCEPTION 'Unsupported entity type for canonical payload: %', p_entity_type
        USING ERRCODE = 'check_violation';
  END CASE;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Entity not found for canonical payload: % %', p_entity_type, p_entity_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_result;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION build_agi_canonical_payload(numeric, numeric, numeric)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION build_vat_canonical_payload(numeric, numeric, numeric, numeric, numeric)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION build_saft_canonical_payload(uuid, date, date, text, integer, integer, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION build_sie4_canonical_payload(uuid, uuid, date, date, integer, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION build_invoice_canonical_payload(uuid, text, uuid, numeric, numeric, date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION build_canonical_payload(text, uuid, uuid)
  TO service_role;
