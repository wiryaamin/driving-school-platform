-- Phase 5A.3: Canonical Serialization Standards
-- Provides platform-wide deterministic serialization primitives.
-- ALL hash inputs and canonical payload fields must use these functions —
-- never raw casts (p_date::text, p_uuid::text) or inline ROUND(...)::text.
--
-- Functions (all IMMUTABLE PARALLEL SAFE — no DB reads):
--   canonical_decimal(numeric, int)          → text   fixed-scale decimal string
--   canonical_date(date)                     → text   ISO 8601 YYYY-MM-DD, '' for NULL
--   canonical_uuid(uuid)                     → text   lowercase-hyphenated UUID, '' for NULL
--   canonical_text(text)                     → text   NFC, trimmed, single-spaced, '' for NULL
--   canonical_monetary_json(numeric, text)   → jsonb  {amount:"0.00", currency:"SEK"}
--   canonical_entity_serializer(text, jsonb) → jsonb  {entity_type:"...", fields:{...}}
--
-- Backward compatibility:
--   canonical_decimal is output-identical to normalize_decimal for all finite inputs.
--   canonical_uuid/canonical_date produce the same output as direct ::text casts in
--   C-locale PostgreSQL. Refactoring existing builders to use these functions does
--   NOT change any stored hash values.

-- ── canonical_decimal() ───────────────────────────────────────────────────────
-- Returns a numeric value as text with exactly p_scale decimal places.
-- Normalizes trailing zeros: 1 → '1.00', 1.1 → '1.10', 1000 → '1000.00'
-- NULL input → '0.00' (coerced, not propagated).
-- Eliminates all raw ROUND(...)::text patterns from canonical builder code.
-- Output is locale-independent: PostgreSQL numeric::text always uses '.' separator.

CREATE OR REPLACE FUNCTION canonical_decimal(
  p_value numeric,
  p_scale int DEFAULT 2
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT ROUND(COALESCE(p_value, 0), COALESCE(p_scale, 2))::text
$$;

-- ── canonical_date() ──────────────────────────────────────────────────────────
-- Returns a date as ISO 8601 text: YYYY-MM-DD.
-- NULL input → '' (not NULL — canonical payloads must not contain NULL fields).
-- Uses to_char with explicit format mask to guarantee locale-independence.
-- Eliminates p_date::text patterns that depend on session DateStyle.

CREATE OR REPLACE FUNCTION canonical_date(
  p_value date
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT COALESCE(to_char(p_value, 'YYYY-MM-DD'), '')
$$;

-- ── canonical_uuid() ──────────────────────────────────────────────────────────
-- Returns a UUID as lowercase hyphenated text: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
-- NULL input → '' (empty string, not NULL — for safe concatenation in hash inputs).
-- PostgreSQL uuid::text already outputs lowercase; lower() makes the contract explicit.
-- Eliminates p_uuid::text and COALESCE(p_uuid::text, '') patterns.

CREATE OR REPLACE FUNCTION canonical_uuid(
  p_value uuid
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT COALESCE(lower(p_value::text), '')
$$;

-- ── canonical_text() ──────────────────────────────────────────────────────────
-- Returns text that is: NFC-normalized, trimmed, and internally single-spaced.
-- NFC normalization eliminates multi-codepoint Unicode equivalences that would
-- produce different hash inputs for semantically identical strings.
-- NULL input → '' (canonical payloads always use empty string for absent text).

CREATE OR REPLACE FUNCTION canonical_text(
  p_value text
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT trim(
  regexp_replace(
    normalize(COALESCE(p_value, ''), NFC),
    '\s+', ' ', 'g'
  )
)
$$;

-- ── canonical_monetary_json() ─────────────────────────────────────────────────
-- Returns a canonical jsonb representation of a monetary amount.
-- Amount serialized as a fixed-2dp string via canonical_decimal (never a number).
-- Currency uppercased for cross-locale consistency.
-- Used in invoice builders, PEPPOL/BIS-3 exports, and any monetary field in a
-- hash payload where string representation is required.
--
-- Example: canonical_monetary_json(1234.5) → {"amount":"1234.50","currency":"SEK"}

CREATE OR REPLACE FUNCTION canonical_monetary_json(
  p_amount   numeric,
  p_currency text DEFAULT 'SEK'
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT canonical_jsonb(jsonb_build_object(
  'amount',   canonical_decimal(COALESCE(p_amount, 0), 2),
  'currency', upper(COALESCE(p_currency, 'SEK'))
))
$$;

-- ── canonical_entity_serializer() ─────────────────────────────────────────────
-- Returns a canonical jsonb envelope for a generic entity payload.
-- entity_type is canonical_text-normalized (trimmed, NFC, single-spaced).
-- fields are canonical_jsonb-sorted (stable key ordering at every level).
-- Forward-looking builder for PEPPOL/BIS-3, cross-system exports, and any
-- entity that does not yet have a dedicated build_*_canonical_payload() function.
--
-- Example: canonical_entity_serializer('invoice', '{"amount":"100.00"}')
--          → {"entity_type":"invoice","fields":{"amount":"100.00"}}

CREATE OR REPLACE FUNCTION canonical_entity_serializer(
  p_entity_type text,
  p_fields      jsonb
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT canonical_jsonb(jsonb_build_object(
  'entity_type', canonical_text(COALESCE(p_entity_type, '')),
  'fields',      canonical_jsonb(COALESCE(p_fields, '{}'::jsonb))
))
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION canonical_decimal(numeric, int)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION canonical_date(date)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION canonical_uuid(uuid)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION canonical_text(text)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION canonical_monetary_json(numeric, text)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION canonical_entity_serializer(text, jsonb)   TO authenticated, service_role;
