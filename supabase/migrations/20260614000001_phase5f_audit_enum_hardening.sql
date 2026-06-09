-- Phase 5F-Audit: Temporal Replay Hardening & Deterministic Evidence Stabilization
-- Step 1: Enum Hardening + Deterministic Seed Stabilization

-- ── Idempotent enum additions (safe DO $$ wrapper replaces ADD VALUE IF NOT EXISTS) ──
-- Pattern: EXCEPTION WHEN duplicate_object THEN NULL — survives re-runs, shadow DB,
-- supabase db reset cycles, and branch rebuilds without raising on pre-existing values.

DO $$
BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'serializer_profile_registered';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'replay_range_window_created';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'temporal_security_validated';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'chronology_archive_prepared';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Deterministic Seed Stabilization ──────────────────────────────────────────
-- Replace now()-based validity dates in seed data with fixed deterministic timestamps.
-- now() in migration seeds produces different values each supabase db reset, making
-- replay validation non-deterministic.
--
-- Fixed dates:
--   validity_not_before = 2026-01-01T00:00:00Z (project genesis date)
--   validity_not_after  = 2036-01-01T00:00:00Z (root CAs / TSAs — 10-year window)
--   cert validity_not_after = 2028-01-01T00:00:00Z (signing certs — 2-year window)

-- trust_anchors: mutable — no trigger restriction on validity fields
UPDATE trust_anchors
SET validity_not_before = TIMESTAMPTZ '2026-01-01T00:00:00Z',
    validity_not_after  = TIMESTAMPTZ '2036-01-01T00:00:00Z',
    updated_at          = TIMESTAMPTZ '2026-01-01T00:00:00Z'
WHERE anchor_id IN ('skatteverket-root-ca-v1', 'bolagsverket-root-ca-v1');

-- timestamp_authorities: mutable — no trigger restriction on validity fields
UPDATE timestamp_authorities
SET validity_not_before = TIMESTAMPTZ '2026-01-01T00:00:00Z',
    validity_not_after  = TIMESTAMPTZ '2036-01-01T00:00:00Z',
    updated_at          = TIMESTAMPTZ '2026-01-01T00:00:00Z'
WHERE authority_id IN ('skatteverket-tsa-v1', 'bolagsverket-tsa-v1');

-- certificate_chains: semi-immutable — restrict_certificate_chain_core() blocks
-- validity_not_before / validity_not_after changes. Temporarily disable the trigger
-- for the deterministic seed correction only. Re-enabled immediately after.
ALTER TABLE certificate_chains DISABLE TRIGGER trg_certificate_chains_restrict_core;

UPDATE certificate_chains
SET validity_not_before = TIMESTAMPTZ '2026-01-01T00:00:00Z',
    validity_not_after  = TIMESTAMPTZ '2028-01-01T00:00:00Z'
WHERE chain_id IN ('skatteverket-agi-signing-chain-v1', 'skatteverket-vat-signing-chain-v1');

ALTER TABLE certificate_chains ENABLE TRIGGER trg_certificate_chains_restrict_core;
