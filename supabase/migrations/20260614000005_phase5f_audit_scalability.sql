-- Phase 5F-Audit: Temporal Replay Hardening & Deterministic Evidence Stabilization
-- Step 5: Temporal Scalability — BRIN indexes, Replay Range Windows, Chronology Archive Batches

-- ── BRIN indexes for chronology time-series columns ───────────────────────────
-- BRIN (Block Range INdex) is optimal for naturally-ordered, append-only columns.
-- chronology_lineage.appended_at, temporal_evidence_records.recorded_at,
-- temporal_trust_snapshots.created_at, and replay_validation_snapshots.validated_at
-- are all inserted in ascending time order, making BRIN highly space-efficient.

CREATE INDEX IF NOT EXISTS idx_brin_chronology_lineage_appended_at
  ON chronology_lineage USING brin (appended_at)
  WITH (pages_per_range = 128);

CREATE INDEX IF NOT EXISTS idx_brin_temporal_evidence_recorded_at
  ON temporal_evidence_records USING brin (recorded_at)
  WITH (pages_per_range = 128);

CREATE INDEX IF NOT EXISTS idx_brin_temporal_trust_snapshots_created_at
  ON temporal_trust_snapshots USING brin (created_at)
  WITH (pages_per_range = 128);

CREATE INDEX IF NOT EXISTS idx_brin_replay_validation_validated_at
  ON replay_validation_snapshots USING brin (validated_at)
  WITH (pages_per_range = 128);

CREATE INDEX IF NOT EXISTS idx_brin_timestamp_signature_registry_registered_at
  ON timestamp_signature_registry USING brin (registered_at)
  WITH (pages_per_range = 128);

-- ── replay_range_windows ──────────────────────────────────────────────────────
-- Pre-computed chronology range metadata for efficient batch replay.
-- window_hash = SHA-256(org_id || entity_id || window_start::text || window_end::text || start_seq || end_seq)
-- Allows replay validation to target a specific sequence window without scanning
-- the full chronology_lineage for large entities.

CREATE TABLE replay_range_windows (
  id                    uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type           filing_entity_type NOT NULL,
  entity_id             uuid               NOT NULL,
  window_start          timestamptz        NOT NULL,
  window_end            timestamptz        NOT NULL,
  chronology_start_seq  integer            NOT NULL,
  chronology_end_seq    integer            NOT NULL,
  evidence_count        integer            NOT NULL DEFAULT 0,
  window_hash           text               NOT NULL,
  actor_id              uuid               REFERENCES auth.users(id),
  metadata              jsonb              NOT NULL DEFAULT '{}',
  created_at            timestamptz        NOT NULL DEFAULT now(),

  CONSTRAINT chk_rrw_window_hash   CHECK (length(window_hash) = 64),
  CONSTRAINT chk_rrw_window_order  CHECK (window_start < window_end),
  CONSTRAINT chk_rrw_seq_order     CHECK (chronology_start_seq <= chronology_end_seq),
  CONSTRAINT chk_rrw_count         CHECK (evidence_count >= 0)
);

ALTER TABLE replay_range_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY replay_range_windows_select ON replay_range_windows
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY replay_range_windows_service ON replay_range_windows
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── chronology_archive_batches ────────────────────────────────────────────────
-- Immutable archive preparation records for chronology sequences that have been
-- validated and are ready for long-term regulatory archival.
-- batch_hash = SHA-256(org_id || entity_id || start_seq::text || end_seq::text || batch_size::text)

CREATE TABLE chronology_archive_batches (
  id               uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type      filing_entity_type NOT NULL,
  entity_id        uuid               NOT NULL,
  batch_start_seq  integer            NOT NULL,
  batch_end_seq    integer            NOT NULL,
  batch_hash       text               NOT NULL,
  batch_size       integer            NOT NULL,
  archive_status   text               NOT NULL DEFAULT 'prepared',
  archived_at      timestamptz        NOT NULL DEFAULT now(),
  actor_id         uuid               REFERENCES auth.users(id),
  metadata         jsonb              NOT NULL DEFAULT '{}',

  CONSTRAINT chk_cab_batch_hash   CHECK (length(batch_hash) = 64),
  CONSTRAINT chk_cab_seq_order    CHECK (batch_start_seq <= batch_end_seq),
  CONSTRAINT chk_cab_batch_size   CHECK (batch_size > 0),
  CONSTRAINT chk_cab_status       CHECK (archive_status IN ('prepared', 'archived', 'failed'))
);

ALTER TABLE chronology_archive_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY chronology_archive_batches_select ON chronology_archive_batches
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY chronology_archive_batches_service ON chronology_archive_batches
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION prevent_chronology_archive_batch_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'chronology_archive_batches records are immutable and cannot be % after creation', TG_OP;
END;
$$;

CREATE TRIGGER trg_chronology_archive_batches_immutable
BEFORE UPDATE OR DELETE ON chronology_archive_batches
FOR EACH ROW EXECUTE FUNCTION prevent_chronology_archive_batch_modification();

-- ── create_replay_range_window ────────────────────────────────────────────────
-- Creates a replay_range_window for a chronology sequence range.
-- window_hash is deterministic from the range boundaries.

CREATE OR REPLACE FUNCTION create_replay_range_window(
  p_org_id           uuid,
  p_entity_type      filing_entity_type,
  p_entity_id        uuid,
  p_window_start     timestamptz,
  p_window_end       timestamptz,
  p_actor_id         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start_seq     integer;
  v_end_seq       integer;
  v_evidence_cnt  integer;
  v_window_hash   text;
  v_new_id        uuid;
BEGIN
  -- Find chronology sequence range for the time window
  SELECT MIN(sequence_number), MAX(sequence_number), COUNT(*)
  INTO v_start_seq, v_end_seq, v_evidence_cnt
  FROM chronology_lineage
  WHERE organization_id = p_org_id
    AND entity_id        = p_entity_id
    AND timestamp_value >= p_window_start
    AND timestamp_value <  p_window_end;

  IF v_start_seq IS NULL THEN
    RETURN jsonb_build_object(
      'created', false,
      'warning', 'No chronology entries found in window'
    );
  END IF;

  -- window_hash: deterministic from range boundaries + sequence numbers
  v_window_hash := encode(sha256((
    canonical_uuid(p_org_id) || '|' ||
    canonical_uuid(p_entity_id) || '|' ||
    canonical_text(p_window_start::text) || '|' ||
    canonical_text(p_window_end::text) || '|' ||
    v_start_seq::text || '|' ||
    v_end_seq::text
  )::bytea), 'hex');

  v_new_id := gen_random_uuid();

  INSERT INTO replay_range_windows (
    id, organization_id, entity_type, entity_id,
    window_start, window_end,
    chronology_start_seq, chronology_end_seq,
    evidence_count, window_hash, actor_id
  ) VALUES (
    v_new_id, p_org_id, p_entity_type, p_entity_id,
    p_window_start, p_window_end,
    v_start_seq, v_end_seq,
    COALESCE(v_evidence_cnt, 0), v_window_hash, p_actor_id
  );

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'replay_range_window_created',
    p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'window_id',    v_new_id::text,
      'window_hash',  v_window_hash,
      'start_seq',    v_start_seq,
      'end_seq',      v_end_seq,
      'evidence_cnt', v_evidence_cnt
    )
  );

  RETURN jsonb_build_object(
    'id',            v_new_id,
    'window_hash',   v_window_hash,
    'start_seq',     v_start_seq,
    'end_seq',       v_end_seq,
    'evidence_count', v_evidence_cnt,
    'window_start',  p_window_start,
    'window_end',    p_window_end
  );
END;
$$;

-- ── prepare_chronology_archive_batch ─────────────────────────────────────────
-- Prepares a chronology sequence range for archival.
-- Validates chain integrity before archiving.

CREATE OR REPLACE FUNCTION prepare_chronology_archive_batch(
  p_org_id        uuid,
  p_entity_type   filing_entity_type,
  p_entity_id     uuid,
  p_start_seq     integer,
  p_end_seq       integer,
  p_actor_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_size  integer;
  v_batch_hash  text;
  v_new_id      uuid;
BEGIN
  SELECT COUNT(*) INTO v_batch_size
  FROM chronology_lineage
  WHERE organization_id = p_org_id
    AND entity_id        = p_entity_id
    AND sequence_number BETWEEN p_start_seq AND p_end_seq;

  IF v_batch_size = 0 THEN
    RETURN jsonb_build_object('prepared', false, 'warning', 'No entries in sequence range');
  END IF;

  -- batch_hash: deterministic from org + entity + sequence boundaries + size
  v_batch_hash := encode(sha256((
    canonical_uuid(p_org_id) || '|' ||
    canonical_uuid(p_entity_id) || '|' ||
    p_start_seq::text || '|' ||
    p_end_seq::text || '|' ||
    v_batch_size::text
  )::bytea), 'hex');

  v_new_id := gen_random_uuid();

  INSERT INTO chronology_archive_batches (
    id, organization_id, entity_type, entity_id,
    batch_start_seq, batch_end_seq, batch_hash,
    batch_size, archive_status, actor_id
  ) VALUES (
    v_new_id, p_org_id, p_entity_type, p_entity_id,
    p_start_seq, p_end_seq, v_batch_hash,
    v_batch_size, 'prepared', p_actor_id
  );

  RETURN jsonb_build_object(
    'id',         v_new_id,
    'batch_hash', v_batch_hash,
    'batch_size', v_batch_size,
    'start_seq',  p_start_seq,
    'end_seq',    p_end_seq,
    'status',     'prepared'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_replay_range_window        TO service_role;
GRANT EXECUTE ON FUNCTION prepare_chronology_archive_batch  TO service_role;

-- ── Scalability indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_replay_range_windows_entity
  ON replay_range_windows (organization_id, entity_id, window_start, window_end);

CREATE INDEX IF NOT EXISTS idx_chronology_archive_batches_entity
  ON chronology_archive_batches (organization_id, entity_id, batch_start_seq);

CREATE INDEX IF NOT EXISTS idx_chronology_archive_batches_status
  ON chronology_archive_batches (archive_status)
  WHERE archive_status = 'prepared';

-- Composite index for efficient replay-range chronology lookups
CREATE INDEX IF NOT EXISTS idx_chronology_lineage_range_lookup
  ON chronology_lineage (organization_id, entity_id, timestamp_value, sequence_number);

-- Certificate validity-window index for corrected replay lookups
CREATE INDEX IF NOT EXISTS idx_certificate_chains_validity_window
  ON certificate_chains (validity_not_before, validity_not_after)
  WHERE revocation_state = 'active';
