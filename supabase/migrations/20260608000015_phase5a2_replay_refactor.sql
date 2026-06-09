-- Phase 5A.2: Replay Validation Refactor — Centralised Payload Pipeline
--
-- Rewrites two replay validation functions to use build_canonical_payload()
-- (and entity-specific IMMUTABLE builders) instead of inline payload
-- reconstruction. This eliminates the primary source of replay drift:
-- duplicated hash input logic scattered across multiple functions.
--
-- BEFORE (duplication):
--   assert_replay_determinism  — inline JOIN + jsonb_build_array for AGI/VAT/SAF-T
--   validate_filing_replay     — same inline JOIN + jsonb_build_array for AGI/VAT
--
-- AFTER (single source of truth):
--   both call build_canonical_payload() → routes to build_*_canonical_payload()
--   hash is then applied once per entity type

-- ── assert_replay_determinism() — centralised builder ─────────────────────────
-- Re-derives the canonical content hash for a given compliance entity using
-- build_canonical_payload() and compares it to the stored hash. Logs the
-- assertion result to replay_assertions.
--
-- Entity → stored hash field → hash function:
--   agi_submission  → submission_hash  → canonical_accounting_hash(builder output)
--   vat_declaration → declaration_hash → canonical_accounting_hash(builder output)
--   saf_t_export    → content_hash     → generate_replay_safe_hash(entity_id, builder output)

CREATE OR REPLACE FUNCTION assert_replay_determinism(
  p_org_id      uuid,
  p_entity_type text,
  p_entity_id   uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_hash     text;
  v_recomputed_hash text;
  v_canonical       jsonb;
  v_hash_matched    boolean := false;
  v_assertion_id    uuid;
  v_status          replay_assertion_status;
BEGIN
  CASE p_entity_type

    WHEN 'agi_submission' THEN
      SELECT submission_hash INTO v_stored_hash
      FROM agi_submissions
      WHERE id = p_entity_id AND organization_id = p_org_id;

      IF v_stored_hash IS NOT NULL THEN
        -- Single canonical entry point: no inline JOIN or array construction
        v_canonical       := build_canonical_payload('agi_submission', p_entity_id, p_org_id);
        v_recomputed_hash := canonical_accounting_hash(v_canonical);
      END IF;

    WHEN 'vat_declaration' THEN
      SELECT declaration_hash INTO v_stored_hash
      FROM vat_declarations
      WHERE id = p_entity_id AND organization_id = p_org_id;

      IF v_stored_hash IS NOT NULL THEN
        v_canonical       := build_canonical_payload('vat_declaration', p_entity_id, p_org_id);
        v_recomputed_hash := canonical_accounting_hash(v_canonical);
      END IF;

    WHEN 'saf_t_export' THEN
      SELECT content_hash INTO v_stored_hash
      FROM saf_t_exports
      WHERE id = p_entity_id AND organization_id = p_org_id;

      IF v_stored_hash IS NOT NULL THEN
        v_canonical       := build_canonical_payload('saf_t_export', p_entity_id, p_org_id);
        v_recomputed_hash := generate_replay_safe_hash('saf_t_export', p_entity_id, v_canonical);
      END IF;

    ELSE
      RETURN jsonb_build_object(
        'error', 'Unsupported entity type for replay assertion: ' || p_entity_type
      );
  END CASE;

  IF v_stored_hash IS NULL THEN
    v_status := 'inconclusive';
  ELSIF v_stored_hash = v_recomputed_hash THEN
    v_hash_matched := true;
    v_status       := 'passed';
  ELSE
    v_status := 'failed';
  END IF;

  INSERT INTO replay_assertions (
    organization_id, entity_type, entity_id,
    assertion_type, assertion_status,
    stored_hash, recomputed_hash, hash_matched,
    assertion_metadata
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    'determinism_check', v_status,
    v_stored_hash, v_recomputed_hash, v_hash_matched,
    jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id)
  ) RETURNING id INTO v_assertion_id;

  RETURN jsonb_build_object(
    'assertion_id',     v_assertion_id,
    'entity_type',      p_entity_type,
    'entity_id',        p_entity_id,
    'assertion_status', v_status,
    'hash_matched',     v_hash_matched,
    'stored_hash',      v_stored_hash,
    'recomputed_hash',  v_recomputed_hash
  );
END;
$$;

-- ── validate_filing_replay() — centralised builder ────────────────────────────
-- Re-derives hash from source data using build_canonical_payload() and compares
-- to the stored filing hash. Replaces the duplicate inline reconstruction that
-- existed alongside assert_replay_determinism.
--
-- Returns: { valid, filing_type, filing_id, stored_hash, recomputed_hash, entity_info }

CREATE OR REPLACE FUNCTION validate_filing_replay(
  p_org_id      uuid,
  p_filing_type filing_entity_type,
  p_filing_id   uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_hash     text;
  v_recomputed_hash text;
  v_entity_info     jsonb;
  v_canonical       jsonb;
  v_is_valid        boolean := false;
BEGIN
  CASE p_filing_type

    WHEN 'agi_submission' THEN
      SELECT
        submission_hash,
        jsonb_build_object(
          'submission_id',     id,
          'agi_export_id',     agi_export_id,
          'status',            submission_status,
          'certified_at',      certified_at
        )
      INTO v_stored_hash, v_entity_info
      FROM agi_submissions
      WHERE id = p_filing_id AND organization_id = p_org_id;

      IF v_stored_hash IS NOT NULL THEN
        v_canonical       := build_canonical_payload('agi_submission', p_filing_id, p_org_id);
        v_recomputed_hash := canonical_accounting_hash(v_canonical);
      END IF;

    WHEN 'vat_declaration' THEN
      SELECT
        declaration_hash,
        jsonb_build_object(
          'declaration_id', id,
          'vat_period_id',  vat_period_id,
          'status',         declaration_status,
          'certified_at',   certified_at
        )
      INTO v_stored_hash, v_entity_info
      FROM vat_declarations
      WHERE id = p_filing_id AND organization_id = p_org_id;

      IF v_stored_hash IS NOT NULL THEN
        v_canonical       := build_canonical_payload('vat_declaration', p_filing_id, p_org_id);
        v_recomputed_hash := canonical_accounting_hash(v_canonical);
      END IF;

    ELSE
      RETURN jsonb_build_object(
        'valid', false,
        'error', 'Unsupported filing type: ' || p_filing_type::text
      );
  END CASE;

  IF v_stored_hash IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Filing not found: ' || p_filing_id::text
    );
  END IF;

  v_is_valid := (v_stored_hash = v_recomputed_hash);

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, metadata)
  VALUES (p_org_id, 'compliance_hash_generated', p_filing_type::text, p_filing_id,
    jsonb_build_object(
      'valid',            v_is_valid,
      'stored_hash',      v_stored_hash,
      'recomputed_hash',  v_recomputed_hash
    ));

  RETURN jsonb_build_object(
    'valid',            v_is_valid,
    'filing_type',      p_filing_type,
    'filing_id',        p_filing_id,
    'stored_hash',      v_stored_hash,
    'recomputed_hash',  v_recomputed_hash,
    'entity_info',      v_entity_info
  );
END;
$$;

-- No new grants needed — both functions are CREATE OR REPLACE of existing ones.
