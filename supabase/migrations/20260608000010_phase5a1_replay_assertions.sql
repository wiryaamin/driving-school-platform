-- Phase 5A.1: Replay Assertions + Deterministic Export Registry
--
-- Tables:
--   replay_assertions           — immutable log of determinism checks
--   deterministic_export_registry — immutable canonical payload + hash registry
--
-- Functions:
--   assert_replay_determinism() — re-derives hash and logs assertion result

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE replay_assertion_type AS ENUM (
  'hash_match',
  'determinism_check',
  'replay_valid'
);

CREATE TYPE replay_assertion_status AS ENUM (
  'passed',
  'failed',
  'inconclusive'
);

-- ── replay_assertions (fully immutable) ──────────────────────────────────────
-- Each row records the outcome of one determinism check. Never updated or
-- deleted — the audit trail must be append-only.

CREATE TABLE replay_assertions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type          text        NOT NULL,
  entity_id            uuid        NOT NULL,
  assertion_type       replay_assertion_type NOT NULL DEFAULT 'determinism_check',
  assertion_status     replay_assertion_status NOT NULL,
  stored_hash          text,
  recomputed_hash      text,
  hash_matched         boolean     NOT NULL DEFAULT false,
  assertion_metadata   jsonb       NOT NULL DEFAULT '{}',
  asserted_at          timestamptz NOT NULL DEFAULT now(),
  asserted_by          uuid        REFERENCES auth.users(id)
);

ALTER TABLE replay_assertions ENABLE ROW LEVEL SECURITY;
CREATE POLICY replay_assertions_select ON replay_assertions
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE OR REPLACE FUNCTION prevent_replay_assertion_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_assertions are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER replay_assertions_immutable
  BEFORE UPDATE OR DELETE ON replay_assertions
  FOR EACH ROW EXECUTE FUNCTION prevent_replay_assertion_mutation();

-- ── deterministic_export_registry (immutable once registered) ─────────────────
-- Stores the canonical, timestamp-free payload and replay-safe hash for each
-- registered export. Prevents hash drift by anchoring the canonical form at
-- registration time.

CREATE TABLE deterministic_export_registry (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  export_type      text        NOT NULL,   -- 'agi_submission' | 'vat_declaration' | 'saf_t' | 'sie4'
  export_id        uuid        NOT NULL,
  canonical_payload jsonb      NOT NULL,   -- timestamp-free, canonical form
  replay_safe_hash  text       NOT NULL,
  profile_name      text       NOT NULL DEFAULT 'replay_safe_json_v1',
  registered_at     timestamptz NOT NULL DEFAULT now(),
  registered_by     uuid       REFERENCES auth.users(id),
  UNIQUE (export_type, export_id)
);

ALTER TABLE deterministic_export_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY deterministic_export_registry_select ON deterministic_export_registry
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE OR REPLACE FUNCTION prevent_deterministic_export_registry_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'deterministic_export_registry entries are immutable once registered'
    USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER deterministic_export_registry_immutable
  BEFORE UPDATE OR DELETE ON deterministic_export_registry
  FOR EACH ROW EXECUTE FUNCTION prevent_deterministic_export_registry_mutation();

-- ── assert_replay_determinism() ───────────────────────────────────────────────
-- Re-derives the canonical content hash for a given compliance entity and
-- compares it to the stored hash. Logs the assertion result to replay_assertions.
-- Supports: agi_submission, vat_declaration, saf_t_export.

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
        WHERE sub.id = p_entity_id AND sub.organization_id = p_org_id;
      END IF;

    WHEN 'vat_declaration' THEN
      SELECT declaration_hash INTO v_stored_hash
      FROM vat_declarations
      WHERE id = p_entity_id AND organization_id = p_org_id;

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
        WHERE declaration_id = p_entity_id AND organization_id = p_org_id;
      END IF;

    WHEN 'saf_t_export' THEN
      SELECT content_hash INTO v_stored_hash
      FROM saf_t_exports
      WHERE id = p_entity_id AND organization_id = p_org_id;

      IF v_stored_hash IS NOT NULL THEN
        SELECT encode(
          sha256((
            p_org_id::text              || '|' ||
            se.period_start::text       || '|' ||
            se.period_end::text         || '|' ||
            se.export_scope::text       || '|' ||
            se.journal_entry_count::text || '|' ||
            se.transaction_count::text   || '|' ||
            se.account_count::text
          )::bytea), 'hex'
        )
        INTO v_recomputed_hash
        FROM saf_t_exports se
        WHERE id = p_entity_id AND organization_id = p_org_id;
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

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON replay_assertions              TO authenticated, service_role;
GRANT SELECT ON deterministic_export_registry  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION assert_replay_determinism(uuid, text, uuid) TO service_role;
