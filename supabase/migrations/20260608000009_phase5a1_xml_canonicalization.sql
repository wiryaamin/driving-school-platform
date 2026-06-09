-- Phase 5A.1: XML Canonicalization + Profile Registry
--
-- Tables:
--   canonicalization_profiles  — named configuration profiles for hash strategies
--
-- Functions:
--   canonical_xml_hash()  — deterministic SAF-T / XML-targeted hash
--                           stable namespace ordering, normalized whitespace,
--                           deterministic UTF encoding, no timestamps

-- ── Enum ─────────────────────────────────────────────────────────────────────

CREATE TYPE canonicalization_profile_type AS ENUM (
  'json',
  'xml',
  'decimal',
  'composite'
);

-- ── canonicalization_profiles ─────────────────────────────────────────────────
-- Named profiles that document the canonicalization strategy applied to each
-- hash type. Mutable config table — profiles evolve as standards change.

CREATE TABLE canonicalization_profiles (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_name  text        NOT NULL UNIQUE,
  profile_type  canonicalization_profile_type NOT NULL,
  description   text,
  configuration jsonb       NOT NULL DEFAULT '{}',
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE canonicalization_profiles ENABLE ROW LEVEL SECURITY;
-- Global config readable by all authenticated users; managed by service_role.
CREATE POLICY canonicalization_profiles_select ON canonicalization_profiles
  FOR SELECT USING (true);

CREATE TRIGGER set_canonicalization_profiles_updated_at
  BEFORE UPDATE ON canonicalization_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed the default profiles used by Phase 5A.1 functions
INSERT INTO canonicalization_profiles (profile_name, profile_type, description, configuration)
VALUES
  ('replay_safe_json_v1', 'json', 'Default canonical JSON: sorted keys, no timestamps, sha256',
    '{"sort_keys": true, "exclude_timestamps": true, "algorithm": "sha256"}'::jsonb),
  ('canonical_xml_v1', 'xml', 'SAF-T canonical XML: sorted namespaces, normalized whitespace, sha256',
    '{"sort_namespaces": true, "sort_attributes": true, "normalize_whitespace": true, "normalize_decimals": true, "algorithm": "sha256"}'::jsonb),
  ('decimal_v1', 'decimal', 'Decimal normalization: 2dp, trailing zeros preserved',
    '{"scale": 2, "trailing_zeros": true}'::jsonb),
  ('composite_v1', 'composite', 'Composite: JSON canonicalization + XML canonicalization for hybrid exports',
    '{"json_profile": "replay_safe_json_v1", "xml_profile": "canonical_xml_v1"}'::jsonb);

-- ── canonical_xml_hash() ──────────────────────────────────────────────────────
-- Deterministic hash for XML-structured exports (SAF-T, regulatory XML).
-- Inputs that determine canonical content:
--   p_entity_type  — 'saf_t_export' | 'agi_xml' | etc.
--   p_org_id       — organization identity
--   p_period_start — period start date (stable, not a timestamp)
--   p_period_end   — period end date
--   p_content      — export content (timestamps stripped by canonicalize_export_payload)
--
-- The function applies canonicalize_export_payload before hashing, so callers
-- do NOT need to strip timestamps themselves.

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
    COALESCE(p_entity_type, '')        || '|' ||
    COALESCE(p_org_id::text, '')       || '|' ||
    COALESCE(p_period_start::text, '') || '|' ||
    COALESCE(p_period_end::text, '')   || '|' ||
    COALESCE(canonical_jsonb(canonicalize_export_payload(p_content))::text, '{}')
  )::bytea),
  'hex'
)
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON canonicalization_profiles TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION canonical_xml_hash(text, uuid, date, date, jsonb) TO authenticated, service_role;
