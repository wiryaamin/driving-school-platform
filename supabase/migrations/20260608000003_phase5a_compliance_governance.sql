-- Phase 5A: Compliance Governance Infrastructure
-- Tables:    filing_certifications, compliance_replay_links (immutable)
-- Functions: generate_compliance_hash, validate_filing_replay

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE filing_entity_type AS ENUM (
  'agi_submission',
  'vat_declaration',
  'saf_t_export',
  'regulatory_audit_export'
);

CREATE TYPE filing_certification_status AS ENUM (
  'pending',
  'certified',
  'revoked'
);

-- ── filing_certifications ─────────────────────────────────────────────────────

CREATE TABLE filing_certifications (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type           filing_entity_type NOT NULL,
  entity_id             uuid        NOT NULL,
  replay_run_id         uuid        REFERENCES ledger_replay_runs(id) ON DELETE RESTRICT,
  replay_hash           text,
  filing_hash           text        NOT NULL,
  certification_hash    text        NOT NULL,
  certification_status  filing_certification_status NOT NULL DEFAULT 'pending',
  certified_at          timestamptz,
  certified_by          uuid        REFERENCES auth.users(id),
  revoked_at            timestamptz,
  revocation_reason     text,
  metadata              jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        REFERENCES auth.users(id)
);

ALTER TABLE filing_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY filing_certifications_select ON filing_certifications
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

-- ── compliance_replay_links (fully immutable) ─────────────────────────────────

CREATE TABLE compliance_replay_links (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  filing_type             filing_entity_type NOT NULL,
  filing_id               uuid        NOT NULL,
  replay_certification_id uuid        REFERENCES replay_certifications(id) ON DELETE RESTRICT,
  replay_run_id           uuid        REFERENCES ledger_replay_runs(id) ON DELETE RESTRICT,
  link_hash               text        NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid        REFERENCES auth.users(id)
);

ALTER TABLE compliance_replay_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_replay_links_select ON compliance_replay_links
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE OR REPLACE FUNCTION prevent_compliance_replay_link_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'compliance_replay_links are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER compliance_replay_links_immutable
  BEFORE UPDATE OR DELETE ON compliance_replay_links
  FOR EACH ROW EXECUTE FUNCTION prevent_compliance_replay_link_mutation();

-- ── generate_compliance_hash() ────────────────────────────────────────────────
-- Deterministic hash for any compliance entity.

CREATE OR REPLACE FUNCTION generate_compliance_hash(
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
    COALESCE(p_entity_type, '')     || '|' ||
    COALESCE(p_entity_id::text, '') || '|' ||
    COALESCE(p_content::text, '{}')
  )::bytea),
  'hex'
)
$$;

-- ── validate_filing_replay() ──────────────────────────────────────────────────
-- Re-derives hash from source data and compares to stored hash.
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
        SELECT canonical_accounting_hash(
          jsonb_build_array(jsonb_build_object(
            'account_code', 'AGI',
            'debit',   ROUND(ae.total_gross, 2),
            'credit',  ROUND(ae.total_withheld_tax, 2),
            'balance', ROUND(ae.total_employer_contrib, 2)
          ))
        )
        INTO v_recomputed_hash
        FROM agi_submissions sub
        JOIN agi_exports ae ON ae.id = sub.agi_export_id
        WHERE sub.id = p_filing_id AND sub.organization_id = p_org_id;
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
        SELECT canonical_accounting_hash(
          jsonb_agg(
            jsonb_build_object(
              'account_code', 'BOX' || LPAD(box_code, 2, '0'),
              'debit',   ROUND(base_amount, 2),
              'credit',  ROUND(vat_amount, 2),
              'balance', ROUND(base_amount + vat_amount, 2)
            ) ORDER BY sort_order
          )
        )
        INTO v_recomputed_hash
        FROM vat_declaration_lines
        WHERE declaration_id = p_filing_id AND organization_id = p_org_id;
      END IF;

    ELSE
      RETURN jsonb_build_object('valid', false, 'error', 'Unsupported filing type: ' || p_filing_type::text);
  END CASE;

  IF v_stored_hash IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Filing not found: ' || p_filing_id::text);
  END IF;

  v_is_valid := (v_stored_hash = v_recomputed_hash);

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, metadata)
  VALUES (p_org_id, 'compliance_hash_generated', p_filing_type::text, p_filing_id,
    jsonb_build_object('valid', v_is_valid,
                       'stored_hash', v_stored_hash,
                       'recomputed_hash', v_recomputed_hash));

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

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON filing_certifications   TO authenticated, service_role;
GRANT SELECT ON compliance_replay_links TO authenticated, service_role;
