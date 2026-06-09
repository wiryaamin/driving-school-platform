-- Phase 5A.3: Collection Ordering Standards
-- Enforces deterministic ordering for ALL dynamic collections used in canonical payloads.
-- Implicit insertion-order aggregation is prohibited; every jsonb array used in a
-- hash input must either be positionally constructed (builder controls order) or
-- pass through canonical_collection() with an explicit sort key.
--
-- Functions (all IMMUTABLE PARALLEL SAFE):
--   canonical_sort_key(jsonb, text[])  → text   composite sort key from object fields
--   canonical_collection(jsonb, text)  → jsonb  array sorted by key or full element text
--
-- Views:
--   canonical_ordering_policy  — authoritative ORDER BY rules for each collection

-- ── canonical_sort_key() ──────────────────────────────────────────────────────
-- Extracts a stable, composite sort key from a jsonb object by reading the values
-- of the specified field names in the given array order, joining with '|'.
-- Used as the ORDER BY expression when building sorted collections of jsonb objects.
-- NULL field values become empty string (not NULL) to maintain stable ordering.
--
-- Example: canonical_sort_key('{"a":"1","b":"2"}'::jsonb, ARRAY['b','a']) → '2|1'

CREATE OR REPLACE FUNCTION canonical_sort_key(
  p_obj  jsonb,
  p_keys text[]
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT string_agg(COALESCE(p_obj->>k, ''), '|' ORDER BY ordinality)
FROM unnest(p_keys) WITH ORDINALITY AS t(k, ordinality)
$$;

-- ── canonical_collection() ────────────────────────────────────────────────────
-- Returns a jsonb array with elements sorted for deterministic canonical ordering.
-- Rejects implicit (insertion-order) aggregation by making the sort contract explicit.
--
-- Behaviour:
--   p_sort_key = NULL   → sort by full element::text (jsonb text serialization)
--   p_sort_key = 'x'    → sort by the text value of element->>'x'
--   NULL/null input     → returns '[]' (empty array, never NULL)
--   non-array input     → wraps in single-element array after canonical_jsonb
--
-- This function does NOT modify element values — only their order.
-- Apply canonical_jsonb() to elements before calling if key ordering is also required.
--
-- Example (sort by 'account_code'):
--   canonical_collection('[{"account_code":"B"},{"account_code":"A"}]', 'account_code')
--   → [{"account_code":"A"},{"account_code":"B"}]

CREATE OR REPLACE FUNCTION canonical_collection(
  p_array    jsonb,
  p_sort_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT CASE
  WHEN p_array IS NULL OR jsonb_typeof(p_array) = 'null' THEN
    '[]'::jsonb

  WHEN jsonb_typeof(p_array) <> 'array' THEN
    jsonb_build_array(canonical_jsonb(p_array))

  WHEN p_sort_key IS NULL THEN
    COALESCE(
      (SELECT jsonb_agg(elem ORDER BY elem::text)
       FROM jsonb_array_elements(p_array) AS elem),
      '[]'::jsonb
    )

  ELSE
    COALESCE(
      (SELECT jsonb_agg(elem ORDER BY elem->>p_sort_key)
       FROM jsonb_array_elements(p_array) AS elem),
      '[]'::jsonb
    )
END
$$;

-- ── canonical_ordering_policy VIEW ────────────────────────────────────────────
-- Authoritative documentation of the required sort order for each dynamic collection
-- used in canonical payloads. Every jsonb_agg() or jsonb_build_array() that feeds
-- into a hash input must comply with the sort_key and sort_direction listed here.
--
-- Rule: If a collection is not listed here, it must use a positional builder
--       (explicit element order in the SQL source). Unordered aggregation is prohibited.

CREATE OR REPLACE VIEW canonical_ordering_policy
WITH (security_invoker = true)
AS
SELECT
  collection_name,
  entity_context,
  sort_key,
  sort_direction,
  builder_function,
  notes
FROM (VALUES
  ('agi_export_lines',
   'agi_submissions',
   'account_code',
   'ASC',
   'build_agi_canonical_payload',
   'Single AGI entry in practice; positional builder controls order'),

  ('vat_declaration_boxes',
   'vat_declarations',
   'account_code',
   'ASC',
   'build_vat_canonical_payload',
   'Boxes BOX05/10/11/12/30 in fixed position order; builder controls order explicitly'),

  ('saft_journal_entries',
   'saf_t_exports',
   'journal_entry_id',
   'ASC',
   'build_saft_canonical_payload',
   'Sort by stable UUID entry ID; count in payload, not individual entries'),

  ('saft_accounts',
   'saf_t_exports',
   'account_code',
   'ASC',
   'build_saft_canonical_payload',
   'BAS account codes sort lexicographically (1000–9999)'),

  ('journal_entry_lines',
   'journal_entries',
   'account_code|sort_order',
   'ASC',
   'canonical_collection',
   'Composite sort: account_code then sort_order; use canonical_sort_key(obj, ARRAY[''account_code'',''sort_order''])'),

  ('replay_assertions',
   'replay_validation',
   'entity_type|entity_id',
   'ASC',
   'canonical_collection',
   'Composite sort for deterministic assertion batches'),

  ('compliance_events',
   'compliance_governance',
   'occurred_at|id',
   'ASC',
   'canonical_collection',
   'Stable ordering for compliance event audit streams; id breaks ties'),

  ('certification_snapshots',
   'filing_certifications',
   'created_at|id',
   'ASC',
   'canonical_collection',
   'Chronological with id tiebreaker for certification audit trails'),

  ('bas_accounts',
   'bas_accounting',
   'account_code',
   'ASC',
   'canonical_collection',
   'BAS 2020 account codes sort lexicographically'),

  ('payroll_run_lines',
   'payroll_runs',
   'employee_id|account_code',
   'ASC',
   'canonical_collection',
   'Per-employee then per-account for deterministic payroll hash inputs')

) AS t(collection_name, entity_context, sort_key, sort_direction, builder_function, notes);

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION canonical_sort_key(jsonb, text[])  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION canonical_collection(jsonb, text)  TO authenticated, service_role;
GRANT SELECT  ON canonical_ordering_policy                   TO authenticated, service_role;
