-- Phase 5A.1: Indexes for Deterministic Compliance Replay Tables
-- Covers: canonicalization_profiles, replay_assertions,
--         deterministic_export_registry, certification_snapshots

-- ── canonicalization_profiles ─────────────────────────────────────────────────
CREATE INDEX idx_canonicalization_profiles_active
  ON canonicalization_profiles (profile_type)
  WHERE is_active = true;

-- ── replay_assertions ─────────────────────────────────────────────────────────
CREATE INDEX idx_replay_assertions_org_entity
  ON replay_assertions (organization_id, entity_type, entity_id);

CREATE INDEX idx_replay_assertions_status
  ON replay_assertions (organization_id, assertion_status);

CREATE INDEX idx_replay_assertions_asserted_at
  ON replay_assertions (organization_id, asserted_at DESC);

CREATE INDEX idx_replay_assertions_entity_type_id
  ON replay_assertions (entity_type, entity_id, asserted_at DESC);

-- ── deterministic_export_registry ─────────────────────────────────────────────
-- Primary lookup: by org + export type + id
CREATE INDEX idx_deterministic_export_registry_org_type
  ON deterministic_export_registry (organization_id, export_type);

CREATE INDEX idx_deterministic_export_registry_org_registered
  ON deterministic_export_registry (organization_id, registered_at DESC);

-- ── certification_snapshots ───────────────────────────────────────────────────
CREATE INDEX idx_certification_snapshots_org_entity
  ON certification_snapshots (organization_id, entity_type, entity_id);

CREATE INDEX idx_certification_snapshots_entity_id
  ON certification_snapshots (entity_id, created_at DESC);

CREATE INDEX idx_certification_snapshots_certification_id
  ON certification_snapshots (certification_id)
  WHERE certification_id IS NOT NULL;

CREATE INDEX idx_certification_snapshots_created_at
  ON certification_snapshots (organization_id, created_at DESC);
