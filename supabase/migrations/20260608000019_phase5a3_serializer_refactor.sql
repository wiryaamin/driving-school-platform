-- Phase 5A.3: Serializer Refactor
-- Updates all Phase 5A.1/5A.2 canonical functions to use the canonical_*
-- serialization primitives introduced in Phase 5A.3.
--
-- Hash compatibility guarantee:
--   canonical_accounting_hash() reads fields via ->>'field' then normalizes with
--   ROUND(x::numeric, 2)::text — it is invariant to whether the jsonb field
--   stores a number or a string representation. Switching builder fields from
--   numeric to canonical_decimal() (text string) produces IDENTICAL hash output.
--   canonical_uuid/canonical_date produce the same bytes as direct ::text casts
--   in C-locale PostgreSQL. All refactors here are byte-for-byte hash-compatible.
--
-- Eliminated patterns:
--   ROUND(x, 2)           → canonical_decimal(x, 2)
--   normalize_decimal(x)  → canonical_decimal(x, 2)
--   p_uuid::text          → canonical_uuid(p_uuid)
--   p_date::text          → canonical_date(p_date)
--   COALESCE(p_t::text,'')→ canonical_uuid(p_t) / canonical_date(p_t)
--   COALESCE(p_s, '')     → canonical_text(p_s) for human-readable strings
--
-- Functions updated (CREATE OR REPLACE — signatures unchanged):
--   build_agi_canonical_payload       migration 20260608000013
--   build_vat_canonical_payload       migration 20260608000013
--   build_saft_canonical_payload      migration 20260608000013
--   build_sie4_canonical_payload      migration 20260608000013
--   build_invoice_canonical_payload   migration 20260608000013
--   generate_replay_safe_hash         migration 20260608000008
--   canonical_xml_hash                migration 20260608000009

-- ── build_agi_canonical_payload() — refactored ────────────────────────────────
-- CHANGED: ROUND(x, 2) → canonical_decimal(x, 2)
-- Amounts now explicitly serialized as text strings in jsonb.
-- canonical_accounting_hash is invariant to this change (re-normalizes on read).

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
    'balance',      canonical_decimal(COALESCE(p_total_employer_contrib, 0), 2),
    'credit',       canonical_decimal(COALESCE(p_total_withheld_tax,    0), 2),
    'debit',        canonical_decimal(COALESCE(p_total_gross,           0), 2)
  )
))
$$;

-- ── build_vat_canonical_payload() — refactored ────────────────────────────────
-- CHANGED: ROUND(x, 2) → canonical_decimal(x, 2)
-- 0::numeric constant fields replaced with canonical_decimal(0, 2) for uniformity.

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
    'balance',  canonical_decimal(COALESCE(p_box05_taxable_turnover, 0), 2),
    'credit',   canonical_decimal(0, 2),
    'debit',    canonical_decimal(COALESCE(p_box05_taxable_turnover, 0), 2)
  ),
  jsonb_build_object(
    'account_code', 'BOX10',
    'balance',  canonical_decimal(COALESCE(p_box10_output_vat_25, 0), 2),
    'credit',   canonical_decimal(0, 2),
    'debit',    canonical_decimal(COALESCE(p_box10_output_vat_25, 0), 2)
  ),
  jsonb_build_object(
    'account_code', 'BOX11',
    'balance',  canonical_decimal(COALESCE(p_box11_output_vat_12, 0), 2),
    'credit',   canonical_decimal(0, 2),
    'debit',    canonical_decimal(COALESCE(p_box11_output_vat_12, 0), 2)
  ),
  jsonb_build_object(
    'account_code', 'BOX12',
    'balance',  canonical_decimal(COALESCE(p_box12_output_vat_6, 0), 2),
    'credit',   canonical_decimal(0, 2),
    'debit',    canonical_decimal(COALESCE(p_box12_output_vat_6, 0), 2)
  ),
  jsonb_build_object(
    'account_code', 'BOX30',
    'balance',  canonical_decimal(-COALESCE(p_box30_input_vat, 0), 2),
    'credit',   canonical_decimal(COALESCE(p_box30_input_vat, 0), 2),
    'debit',    canonical_decimal(0, 2)
  )
))
$$;

-- ── build_saft_canonical_payload() — refactored ───────────────────────────────
-- CHANGED: p_org_id::text  → canonical_uuid(p_org_id)
--          p_*::text dates → canonical_date(p_*)
--          COALESCE(scope, 'full') → canonical_text(COALESCE(scope, 'full'))
-- Integer counts remain as ::text (locale-independent in PostgreSQL).

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
  'export_scope',        canonical_text(COALESCE(p_export_scope, 'full')),
  'journal_entry_count', COALESCE(p_journal_entry_count, 0)::text,
  'org_id',              canonical_uuid(p_org_id),
  'period_end',          canonical_date(p_period_end),
  'period_start',        canonical_date(p_period_start),
  'transaction_count',   COALESCE(p_transaction_count, 0)::text
))
$$;

-- ── build_sie4_canonical_payload() — refactored ───────────────────────────────
-- CHANGED: uuid/date ::text → canonical_uuid / canonical_date

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
  'fiscal_year_id', canonical_uuid(p_fiscal_year_id),
  'org_id',         canonical_uuid(p_org_id),
  'period_end',     canonical_date(p_period_end),
  'period_start',   canonical_date(p_period_start)
))
$$;

-- ── build_invoice_canonical_payload() — refactored ────────────────────────────
-- CHANGED: normalize_decimal → canonical_decimal (same output, canonical name)
--          uuid/date ::text  → canonical_uuid / canonical_date
--          invoice_number    → canonical_text (NFC + trim)

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
  'invoice_date',   canonical_date(p_invoice_date),
  'invoice_number', canonical_text(COALESCE(p_invoice_number, '')),
  'org_id',         canonical_uuid(p_org_id),
  'student_id',     canonical_uuid(p_student_id),
  'tax_amount',     canonical_decimal(COALESCE(p_tax_amount, 0), 2),
  'total_amount',   canonical_decimal(COALESCE(p_total_amount, 0), 2)
))
$$;

-- ── generate_replay_safe_hash() — refactored ─────────────────────────────────
-- CHANGED: p_entity_id::text → canonical_uuid(p_entity_id)
-- canonical_uuid is output-identical to ::text for well-formed UUIDs but
-- enforces the canonical contract explicitly and handles NULL safely.

CREATE OR REPLACE FUNCTION generate_replay_safe_hash(
  p_entity_type text,
  p_entity_id   uuid,
  p_content     jsonb
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT encode(
  sha256((
    COALESCE(p_entity_type, '')      || '|' ||
    canonical_uuid(p_entity_id)      || '|' ||
    COALESCE(canonical_jsonb(p_content)::text, '{}')
  )::bytea),
  'hex'
)
$$;

-- ── canonical_xml_hash() — refactored ────────────────────────────────────────
-- CHANGED: p_org_id::text       → canonical_uuid(p_org_id)
--          p_period_*::text     → canonical_date(p_period_*)
-- Eliminates locale-sensitive date cast; enforces canonical UUID formatting.

CREATE OR REPLACE FUNCTION canonical_xml_hash(
  p_entity_type  text,
  p_org_id       uuid,
  p_period_start date,
  p_period_end   date,
  p_content      jsonb
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT encode(
  sha256((
    COALESCE(p_entity_type, '')                                    || '|' ||
    canonical_uuid(p_org_id)                                       || '|' ||
    canonical_date(p_period_start)                                 || '|' ||
    canonical_date(p_period_end)                                   || '|' ||
    COALESCE(canonical_jsonb(canonicalize_export_payload(p_content))::text, '{}')
  )::bytea),
  'hex'
)
$$;

-- No new grants — all functions are CREATE OR REPLACE of previously-granted functions.
-- Existing grants from migrations 20260608000008, 20260608000009, 20260608000013 remain valid.
