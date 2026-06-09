-- Phase 5A.1: Certification Snapshots + Replay Validation
--
-- Tables:
--   certification_snapshots  — immutable state capture at certification time
--
-- Functions:
--   create_certification_snapshot()  — captures timestamp-free entity state
--   validate_certification_replay()  — re-derives hash from stored state,
--                                      confirms snapshot is still reproducible

-- ── certification_snapshots (fully immutable) ─────────────────────────────────
-- Each row preserves the canonical (timestamp-free) entity state exactly as
-- it existed at certification time. The snapshot_hash is deterministically
-- derived from entity_state via generate_replay_safe_hash, so it can be
-- independently recomputed at any future date.

CREATE TABLE certification_snapshots (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type      text        NOT NULL,
  entity_id        uuid        NOT NULL,
  snapshot_hash    text        NOT NULL,   -- generate_replay_safe_hash(entity_type, entity_id, entity_state)
  entity_state     jsonb       NOT NULL,   -- canonicalize_export_payload(to_jsonb(entity)) at snapshot time
  certification_id uuid        REFERENCES filing_certifications(id) ON DELETE RESTRICT,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        REFERENCES auth.users(id)
);

ALTER TABLE certification_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY certification_snapshots_select ON certification_snapshots
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE OR REPLACE FUNCTION prevent_certification_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'certification_snapshots are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER certification_snapshots_immutable
  BEFORE UPDATE OR DELETE ON certification_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_certification_snapshot_mutation();

-- ── create_certification_snapshot() ──────────────────────────────────────────
-- Loads the current entity state, strips all runtime timestamps via
-- canonicalize_export_payload, derives a replay_safe_hash, and inserts the
-- snapshot. Supports: agi_submission, vat_declaration, saf_t_export.

CREATE OR REPLACE FUNCTION create_certification_snapshot(
  p_org_id      uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_actor_id    uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state        jsonb;
  v_canonical    jsonb;
  v_hash         text;
  v_snapshot_id  uuid;
BEGIN
  -- Load entity row as jsonb based on type
  CASE p_entity_type
    WHEN 'agi_submission' THEN
      SELECT to_jsonb(s.*) INTO v_state
      FROM agi_submissions s
      WHERE id = p_entity_id AND organization_id = p_org_id;

    WHEN 'vat_declaration' THEN
      SELECT to_jsonb(d.*) INTO v_state
      FROM vat_declarations d
      WHERE id = p_entity_id AND organization_id = p_org_id;

    WHEN 'saf_t_export' THEN
      SELECT to_jsonb(e.*) INTO v_state
      FROM saf_t_exports e
      WHERE id = p_entity_id AND organization_id = p_org_id;

    ELSE
      RAISE EXCEPTION 'Unsupported entity type for certification snapshot: %', p_entity_type
        USING ERRCODE = 'check_violation';
  END CASE;

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'Entity not found for snapshot: % %', p_entity_type, p_entity_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Strip all runtime-generated timestamp fields; canonicalize key ordering
  v_canonical := canonicalize_export_payload(v_state);

  -- Deterministic hash of canonical state — reproducible at any future date
  v_hash := generate_replay_safe_hash(p_entity_type, p_entity_id, v_canonical);

  INSERT INTO certification_snapshots (
    organization_id, entity_type, entity_id,
    snapshot_hash, entity_state, created_by
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    v_hash, v_canonical, p_actor_id
  ) RETURNING id INTO v_snapshot_id;

  -- Register in deterministic_export_registry (idempotent — UNIQUE(type,id))
  INSERT INTO deterministic_export_registry (
    organization_id, export_type, export_id,
    canonical_payload, replay_safe_hash, registered_by
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    v_canonical, v_hash, p_actor_id
  ) ON CONFLICT (export_type, export_id) DO NOTHING;

  RETURN v_snapshot_id;
END;
$$;

-- ── validate_certification_replay() ──────────────────────────────────────────
-- Re-derives the hash from the stored canonical entity_state and compares it
-- to the stored snapshot_hash. Because entity_state is timestamp-free, this
-- must always reproduce the same hash as long as the snapshot row is intact.

CREATE OR REPLACE FUNCTION validate_certification_replay(
  p_snapshot_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot    record;
  v_rehash      text;
  v_is_valid    boolean;
BEGIN
  SELECT * INTO v_snapshot
  FROM certification_snapshots
  WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Snapshot not found: ' || p_snapshot_id::text
    );
  END IF;

  -- Re-derive hash from stored canonical state (no DB reads beyond the snapshot)
  v_rehash := generate_replay_safe_hash(
    v_snapshot.entity_type,
    v_snapshot.entity_id,
    -- entity_state is already canonical; apply canonicalize again for safety
    canonicalize_export_payload(v_snapshot.entity_state)
  );

  v_is_valid := (v_snapshot.snapshot_hash = v_rehash);

  RETURN jsonb_build_object(
    'valid',            v_is_valid,
    'snapshot_id',      p_snapshot_id,
    'entity_type',      v_snapshot.entity_type,
    'entity_id',        v_snapshot.entity_id,
    'stored_hash',      v_snapshot.snapshot_hash,
    'recomputed_hash',  v_rehash,
    'snapshot_created', v_snapshot.created_at
  );
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON certification_snapshots TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_certification_snapshot(uuid, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION validate_certification_replay(uuid)                   TO service_role;
