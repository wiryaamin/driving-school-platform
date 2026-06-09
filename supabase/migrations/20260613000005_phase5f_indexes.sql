-- Phase 5F: Temporal Evidence & Cryptographic Replay Integrity
-- Step 5: Indexes

-- timestamp_authorities indexes
CREATE INDEX IF NOT EXISTS idx_timestamp_authorities_authority_id
  ON timestamp_authorities (authority_id);

CREATE INDEX IF NOT EXISTS idx_timestamp_authorities_status
  ON timestamp_authorities (authority_status)
  WHERE authority_status = 'active';

CREATE INDEX IF NOT EXISTS idx_timestamp_authorities_trust_anchor
  ON timestamp_authorities (trust_anchor_id)
  WHERE trust_anchor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_timestamp_authorities_validity
  ON timestamp_authorities (validity_not_after);

-- temporal_evidence_records indexes
CREATE INDEX IF NOT EXISTS idx_temporal_evidence_records_org_entity
  ON temporal_evidence_records (organization_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_temporal_evidence_records_timestamp
  ON temporal_evidence_records (timestamp_value DESC);

CREATE INDEX IF NOT EXISTS idx_temporal_evidence_records_authority
  ON temporal_evidence_records (authority_id);

-- timestamp_signature_registry indexes
CREATE INDEX IF NOT EXISTS idx_timestamp_signature_registry_evidence
  ON timestamp_signature_registry (evidence_id);

CREATE INDEX IF NOT EXISTS idx_timestamp_signature_registry_authority
  ON timestamp_signature_registry (authority_id);

-- chronology_lineage indexes
CREATE INDEX IF NOT EXISTS idx_chronology_lineage_entity_seq
  ON chronology_lineage (organization_id, entity_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_chronology_lineage_timestamp
  ON chronology_lineage (timestamp_value DESC);

-- temporal_trust_snapshots indexes
CREATE INDEX IF NOT EXISTS idx_temporal_trust_snapshots_entity
  ON temporal_trust_snapshots (organization_id, entity_id, snapshot_timestamp DESC);

-- replay_validation_snapshots indexes
CREATE INDEX IF NOT EXISTS idx_replay_validation_snapshots_entity
  ON replay_validation_snapshots (organization_id, entity_id, validation_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_replay_validation_snapshots_is_valid
  ON replay_validation_snapshots (is_valid, validated_at DESC);
