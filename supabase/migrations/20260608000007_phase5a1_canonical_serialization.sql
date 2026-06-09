-- Phase 5A.1: Canonical Serialization Foundation
-- Provides deterministic, timestamp-free serialization primitives used by all
-- subsequent replay-safe hash generation.
--
-- Functions (all IMMUTABLE PARALLEL SAFE — no DB reads):
--   canonical_jsonb(jsonb)        → jsonb   explicit canonical key ordering
--   normalize_decimal(numeric, int) → text  always N-decimal-place text

-- ── canonical_jsonb() ─────────────────────────────────────────────────────────
-- Returns a canonicalized jsonb value with stable key ordering at every level.
-- PostgreSQL's jsonb storage already lexicographically sorts object keys, so
-- this function is primarily a clarity/enforcement layer and handles recursion
-- for nested objects and arrays.

CREATE OR REPLACE FUNCTION canonical_jsonb(p_input jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT
  CASE jsonb_typeof(p_input)
    WHEN 'object' THEN
      COALESCE(
        (SELECT jsonb_object_agg(key, canonical_jsonb(value) ORDER BY key)
         FROM jsonb_each(p_input)),
        '{}'::jsonb
      )
    WHEN 'array' THEN
      COALESCE(
        (SELECT jsonb_agg(canonical_jsonb(elem))
         FROM jsonb_array_elements(p_input) AS elem),
        '[]'::jsonb
      )
    ELSE
      COALESCE(p_input, 'null'::jsonb)
  END
$$;

-- ── normalize_decimal() ───────────────────────────────────────────────────────
-- Returns a decimal value as text with exactly p_scale decimal places.
-- ROUND preserves trailing zeros on numeric type, so '1.00' not '1'.

CREATE OR REPLACE FUNCTION normalize_decimal(
  p_value numeric,
  p_scale int DEFAULT 2
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT ROUND(COALESCE(p_value, 0), p_scale)::text
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION canonical_jsonb(jsonb)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION normalize_decimal(numeric, int)  TO authenticated, service_role;
