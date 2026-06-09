-- Phase 6B: DevOps, Replay CI/CD & Production Operations Hardening
-- Migration 4: Archive Lifecycle Management

-- ── New compliance_event_type value ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE compliance_event_type ADD VALUE 'archive_lifecycle_executed';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── New enum type ─────────────────────────────────────────────────────────────

CREATE TYPE archive_lifecycle_status AS ENUM (
  'pending', 'archiving', 'archived', 'verified', 'failed'
);

-- ── chronology_archive_policies ───────────────────────────────────────────────
-- Mutable: one row per org+entity_type, configures archival lifecycle.

CREATE TABLE IF NOT EXISTS chronology_archive_policies (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type        text        NOT NULL,
  retention_days     integer     NOT NULL DEFAULT 2555,  -- 7 years
  archive_after_days integer     NOT NULL DEFAULT 365,
  policy_version     text        NOT NULL DEFAULT '6B.1',
  is_active          boolean     NOT NULL DEFAULT true,
  policy_hash        text        NOT NULL,
  actor_id           uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_cap_policy_hash CHECK (length(policy_hash) = 64),
  CONSTRAINT chk_cap_unique      UNIQUE (organization_id, entity_type)
);

ALTER TABLE chronology_archive_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY archive_policies_select ON chronology_archive_policies
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY archive_policies_service ON chronology_archive_policies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── replay_archive_batches ────────────────────────────────────────────────────
-- Immutable: each archival run produces one immutable batch record.

CREATE TABLE IF NOT EXISTS replay_archive_batches (
  id                uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid                    NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type       text                    NOT NULL,
  archive_status    archive_lifecycle_status NOT NULL DEFAULT 'archived',
  elements_archived integer                 NOT NULL DEFAULT 0,
  chain_hash_before text                    NOT NULL,
  chain_hash_after  text                    NOT NULL,
  archive_hash      text                    NOT NULL,
  actor_id          uuid,
  archived_at       timestamptz             NOT NULL DEFAULT now(),
  CONSTRAINT chk_rab_archive_hash CHECK (length(archive_hash) = 64)
);

ALTER TABLE replay_archive_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY archive_batches_select ON replay_archive_batches
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY archive_batches_service ON replay_archive_batches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_replay_archive_batch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_archive_batches rows are immutable';
END;
$$;

CREATE TRIGGER archive_batch_immutable
  BEFORE UPDATE OR DELETE ON replay_archive_batches
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_archive_batch();

CREATE INDEX IF NOT EXISTS idx_rab_brin ON replay_archive_batches
  USING brin (archived_at) WITH (pages_per_range = 128);

-- ── cold_storage_profiles ─────────────────────────────────────────────────────
-- Mutable: aggregate statistics per org, upserted on each archive run.

CREATE TABLE IF NOT EXISTS cold_storage_profiles (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  total_batches_archived  bigint      NOT NULL DEFAULT 0,
  total_elements_archived bigint      NOT NULL DEFAULT 0,
  last_archive_hash       text,
  last_archived_at        timestamptz,
  profile_version         text        NOT NULL DEFAULT '6B.1',
  CONSTRAINT chk_csp_unique UNIQUE (organization_id)
);

ALTER TABLE cold_storage_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY cold_storage_select ON cold_storage_profiles
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY cold_storage_service ON cold_storage_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── replay_archive_verifications ──────────────────────────────────────────────
-- Immutable: one row per integrity verification of an archive batch.

CREATE TABLE IF NOT EXISTS replay_archive_verifications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  batch_id            uuid        REFERENCES replay_archive_batches(id) ON DELETE RESTRICT,
  entity_type         text        NOT NULL,
  is_intact           boolean     NOT NULL DEFAULT false,
  chain_hash_verified text        NOT NULL,
  verification_hash   text        NOT NULL,
  actor_id            uuid,
  verified_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rav_verif_hash CHECK (length(verification_hash) = 64)
);

ALTER TABLE replay_archive_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY archive_verif_select ON replay_archive_verifications
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);
CREATE POLICY archive_verif_service ON replay_archive_verifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION restrict_replay_archive_verification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'replay_archive_verifications rows are immutable';
END;
$$;

CREATE TRIGGER archive_verif_immutable
  BEFORE UPDATE OR DELETE ON replay_archive_verifications
  FOR EACH ROW EXECUTE FUNCTION restrict_replay_archive_verification();

CREATE INDEX IF NOT EXISTS idx_rav_brin ON replay_archive_verifications
  USING brin (verified_at) WITH (pages_per_range = 128);

-- ── create_replay_archive_batch ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_replay_archive_batch(
  p_org_id         uuid,
  p_entity_type    text,
  p_elements_count integer,
  p_chain_before   text,
  p_actor_id       uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_id     uuid;
  v_chain_after  text;
  v_archive_hash text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  -- Extend chain: chain_after is deterministically derived from chain_before + entity_type + elements
  v_chain_after := encode(sha256(
    (p_chain_before || '|archive|' || canonical_text(p_entity_type) || '|' || p_elements_count::text)::bytea
  ), 'hex');

  v_archive_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || canonical_text(p_entity_type) || '|' ||
     canonical_text(p_chain_before) || '|' || canonical_text(v_chain_after) || '|' ||
     p_elements_count::text)::bytea
  ), 'hex');

  INSERT INTO replay_archive_batches (
    organization_id, entity_type, archive_status, elements_archived,
    chain_hash_before, chain_hash_after, archive_hash, actor_id
  ) VALUES (
    p_org_id, p_entity_type, 'archived', p_elements_count,
    p_chain_before, v_chain_after, v_archive_hash, p_actor_id
  ) RETURNING id INTO v_batch_id;

  INSERT INTO cold_storage_profiles (
    organization_id, total_batches_archived, total_elements_archived,
    last_archive_hash, last_archived_at
  ) VALUES (p_org_id, 1, p_elements_count, v_archive_hash, now())
  ON CONFLICT (organization_id) DO UPDATE
    SET total_batches_archived  = cold_storage_profiles.total_batches_archived  + 1,
        total_elements_archived = cold_storage_profiles.total_elements_archived + p_elements_count,
        last_archive_hash       = v_archive_hash,
        last_archived_at        = now();

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'archive_lifecycle_executed', p_entity_type, v_batch_id::text, p_actor_id,
    jsonb_build_object('elements', p_elements_count, 'archive_hash', v_archive_hash));

  RETURN jsonb_build_object(
    'batch_id',     v_batch_id,
    'entity_type',  p_entity_type,
    'elements',     p_elements_count,
    'chain_after',  v_chain_after,
    'archive_hash', v_archive_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_replay_archive_batch(uuid, text, integer, text, uuid) TO authenticated, service_role;

-- ── validate_archive_replay_integrity ────────────────────────────────────────

CREATE OR REPLACE FUNCTION validate_archive_replay_integrity(
  p_org_id   uuid,
  p_batch_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch      record;
  v_recomputed text;
  v_intact     boolean;
  v_verif_hash text;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT * INTO v_batch FROM replay_archive_batches
  WHERE id = p_batch_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archive batch % not found for org', p_batch_id;
  END IF;

  -- Re-derive archive_hash using the same formula as create_replay_archive_batch
  v_recomputed := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || canonical_text(v_batch.entity_type) || '|' ||
     canonical_text(v_batch.chain_hash_before) || '|' || canonical_text(v_batch.chain_hash_after) || '|' ||
     v_batch.elements_archived::text)::bytea
  ), 'hex');

  v_intact := (v_recomputed = v_batch.archive_hash);

  v_verif_hash := encode(sha256(
    (canonical_uuid(p_org_id::text) || '|' || p_batch_id::text || '|' ||
     v_batch.archive_hash || '|' || v_intact::text)::bytea
  ), 'hex');

  INSERT INTO replay_archive_verifications (
    organization_id, batch_id, entity_type, is_intact,
    chain_hash_verified, verification_hash, actor_id
  ) VALUES (
    p_org_id, p_batch_id, v_batch.entity_type, v_intact,
    v_batch.chain_hash_after, v_verif_hash, p_actor_id
  );

  RETURN jsonb_build_object(
    'batch_id',     p_batch_id,
    'is_intact',    v_intact,
    'archive_hash', v_batch.archive_hash,
    'recomputed',   v_recomputed,
    'verif_hash',   v_verif_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_archive_replay_integrity(uuid, uuid, uuid) TO authenticated, service_role;

-- ── verify_archive_hash_continuity ────────────────────────────────────────────
-- IMMUTABLE PARALLEL SAFE — pure formula validation.

CREATE OR REPLACE FUNCTION verify_archive_hash_continuity(
  p_chain_before   text,
  p_chain_after    text,
  p_entity_type    text,
  p_elements_count integer
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT jsonb_build_object(
  'chain_before',    p_chain_before,
  'chain_after',     p_chain_after,
  'entity_type',     p_entity_type,
  'elements_count',  p_elements_count,
  'is_continuous',   (
    length(p_chain_before) = 64 AND
    length(p_chain_after)  = 64 AND
    p_chain_before <> p_chain_after
  ),
  'continuity_hash', encode(sha256(
    (p_chain_before || '|archive_continuity|' || p_entity_type || '|' || p_elements_count::text)::bytea
  ), 'hex')
)
$$;

GRANT EXECUTE ON FUNCTION verify_archive_hash_continuity(text, text, text, integer) TO authenticated, service_role;

-- ── reconstruct_replay_from_archive ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION reconstruct_replay_from_archive(
  p_org_id   uuid,
  p_batch_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch       record;
  v_reconstruct text;
  v_valid       boolean;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT * INTO v_batch FROM replay_archive_batches
  WHERE id = p_batch_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archive batch % not found for org', p_batch_id;
  END IF;

  -- Re-derive chain_after from chain_before using the archival extension formula
  v_reconstruct := encode(sha256(
    (v_batch.chain_hash_before || '|archive|' ||
     canonical_text(v_batch.entity_type) || '|' || v_batch.elements_archived::text)::bytea
  ), 'hex');

  v_valid := (v_reconstruct = v_batch.chain_hash_after);

  RETURN jsonb_build_object(
    'batch_id',             p_batch_id,
    'entity_type',          v_batch.entity_type,
    'elements_archived',    v_batch.elements_archived,
    'reconstruction_valid', v_valid,
    'chain_after',          v_batch.chain_hash_after,
    'reconstructed_after',  v_reconstruct
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reconstruct_replay_from_archive(uuid, uuid, uuid) TO authenticated, service_role;

-- ── generate_archive_integrity_report ────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_archive_integrity_report(
  p_org_id   uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile      record;
  v_intact_count bigint;
BEGIN
  PERFORM internal_temporal_security.assert_temporal_security_context(p_org_id, p_actor_id);

  SELECT * INTO v_profile FROM cold_storage_profiles WHERE organization_id = p_org_id;

  SELECT count(*) INTO v_intact_count
  FROM replay_archive_verifications WHERE organization_id = p_org_id AND is_intact = true;

  RETURN jsonb_build_object(
    'organization_id',         p_org_id,
    'total_batches_archived',  COALESCE(v_profile.total_batches_archived, 0),
    'total_elements_archived', COALESCE(v_profile.total_elements_archived, 0),
    'intact_verifications',    v_intact_count,
    'last_archive_hash',       COALESCE(v_profile.last_archive_hash, ''),
    'last_archived_at',        v_profile.last_archived_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_archive_integrity_report(uuid, uuid) TO authenticated, service_role;
