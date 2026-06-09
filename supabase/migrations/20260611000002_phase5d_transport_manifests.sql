-- Phase 5D: Transport Trust & Regulatory Delivery
-- Step 2: Transport Manifests

-- ── transport_manifests ───────────────────────────────────────────────────────
-- Immutable: once sealed, the manifest cannot be altered.
-- manifest_hash = SHA-256(canonical_jsonb(manifest_content)::text) — timestamp-free.
-- Endpoint fields (key, name, protocol, identity_hash) are snapshotted at sealing
-- so re-derivation is always possible even if the endpoint is later revoked/updated.

CREATE TABLE transport_manifests (
  id                     uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type            filing_entity_type NOT NULL,
  entity_id              uuid               NOT NULL,
  submission_envelope_id uuid               NOT NULL REFERENCES submission_envelopes(id) ON DELETE RESTRICT,
  endpoint_id            uuid               NOT NULL REFERENCES regulatory_endpoints(id) ON DELETE RESTRICT,
  manifest_version       text               NOT NULL DEFAULT '5D.1',
  -- snapshotted from submission_envelope (immutable)
  envelope_hash          text               NOT NULL,
  trust_chain_hash       text               NOT NULL,
  -- snapshotted from regulatory_endpoint at sealing time
  endpoint_key           text               NOT NULL,
  authority_name         text               NOT NULL,
  protocol               text               NOT NULL,
  endpoint_identity_hash text               NOT NULL,
  -- transport & replay fields
  transport_metadata     jsonb              NOT NULL DEFAULT '{}',
  authority_metadata     jsonb              NOT NULL DEFAULT '{}',
  serializer_version     text               NOT NULL,
  replay_profile         text               NOT NULL,
  replay_metadata        jsonb              NOT NULL DEFAULT '{}',
  manifest_hash          text               NOT NULL,
  actor_id               uuid               REFERENCES auth.users(id),
  metadata               jsonb              NOT NULL DEFAULT '{}',
  sealed_at              timestamptz        NOT NULL DEFAULT now(),

  CONSTRAINT chk_transport_manifest_hash         CHECK (length(manifest_hash) = 64),
  CONSTRAINT chk_transport_envelope_hash         CHECK (length(envelope_hash) = 64),
  CONSTRAINT chk_transport_trust_chain_hash      CHECK (length(trust_chain_hash) = 64),
  CONSTRAINT chk_transport_endpoint_identity     CHECK (length(endpoint_identity_hash) = 64)
);

ALTER TABLE transport_manifests ENABLE ROW LEVEL SECURITY;

CREATE POLICY transport_manifests_select ON transport_manifests
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY transport_manifests_service ON transport_manifests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION prevent_transport_manifest_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'transport_manifests records are immutable and cannot be % after creation', TG_OP;
END;
$$;

CREATE TRIGGER trg_transport_manifests_immutable
BEFORE UPDATE OR DELETE ON transport_manifests
FOR EACH ROW EXECUTE FUNCTION prevent_transport_manifest_modification();

-- ── build_transport_manifest ──────────────────────────────────────────────────
-- Seals a transport manifest from the latest submission_envelope + registered endpoint.
-- manifest_content covers 12 canonical fields; manifest_hash = SHA-256 of canonical_jsonb.
-- Endpoint identity fields snapshotted to enable future re-derivation without mutable JOIN.

CREATE OR REPLACE FUNCTION build_transport_manifest(
  p_org_id      uuid,
  p_entity_type filing_entity_type,
  p_entity_id   uuid,
  p_endpoint_id uuid,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_envelope         submission_envelopes%ROWTYPE;
  v_endpoint         regulatory_endpoints%ROWTYPE;
  v_cert             regulatory_certifications%ROWTYPE;
  v_manifest_content jsonb;
  v_manifest_hash    text;
  v_new_id           uuid;
BEGIN
  -- Latest submission envelope for entity
  SELECT se.* INTO v_envelope
  FROM submission_envelopes se
  WHERE se.organization_id = p_org_id
    AND se.entity_type      = p_entity_type
    AND se.entity_id        = p_entity_id
  ORDER BY se.sealed_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No submission envelope found for % % in org %', p_entity_type, p_entity_id, p_org_id;
  END IF;

  SELECT * INTO v_endpoint FROM regulatory_endpoints WHERE id = p_endpoint_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Regulatory endpoint not found: %', p_endpoint_id;
  END IF;
  IF NOT v_endpoint.is_active THEN
    RAISE EXCEPTION 'Regulatory endpoint % is not active', v_endpoint.endpoint_key;
  END IF;

  SELECT * INTO v_cert FROM regulatory_certifications WHERE id = v_envelope.certification_id;

  -- Deterministic manifest content — 12 canonical fields
  v_manifest_content := canonical_jsonb(jsonb_build_object(
    'entity_type',            canonical_text(p_entity_type::text),
    'entity_id',              canonical_uuid(p_entity_id),
    'organization_id',        canonical_uuid(p_org_id),
    'envelope_hash',          COALESCE(v_envelope.envelope_hash, ''),
    'trust_chain_hash',       COALESCE(v_envelope.trust_chain_hash, ''),
    'endpoint_key',           canonical_text(v_endpoint.endpoint_key),
    'authority_name',         canonical_text(v_endpoint.authority_name),
    'protocol',               canonical_text(v_endpoint.protocol),
    'endpoint_identity_hash', COALESCE(v_endpoint.endpoint_identity_hash, ''),
    'serializer_version',     canonical_text(COALESCE(v_cert.serializer_version, '')),
    'replay_profile',         canonical_text(COALESCE(v_cert.replay_profile_version, '')),
    'manifest_version',       '5D.1'
  ));

  v_manifest_hash := encode(sha256(v_manifest_content::text::bytea), 'hex');
  v_new_id        := gen_random_uuid();

  INSERT INTO transport_manifests (
    id, organization_id, entity_type, entity_id,
    submission_envelope_id, endpoint_id, manifest_version,
    envelope_hash, trust_chain_hash,
    endpoint_key, authority_name, protocol, endpoint_identity_hash,
    transport_metadata, authority_metadata,
    serializer_version, replay_profile, replay_metadata,
    manifest_hash, actor_id
  ) VALUES (
    v_new_id, p_org_id, p_entity_type, p_entity_id,
    v_envelope.id, p_endpoint_id, '5D.1',
    v_envelope.envelope_hash, v_envelope.trust_chain_hash,
    v_endpoint.endpoint_key, v_endpoint.authority_name,
    v_endpoint.protocol, v_endpoint.endpoint_identity_hash,
    v_endpoint.transport_metadata, v_endpoint.authority_metadata,
    COALESCE(v_cert.serializer_version, ''),
    COALESCE(v_cert.replay_profile_version, ''),
    jsonb_build_object(
      'certification_id', v_cert.id::text,
      'envelope_id',      v_envelope.id::text
    ),
    v_manifest_hash, p_actor_id
  );

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'transport_manifest_sealed', p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'manifest_id',    v_new_id::text,
      'manifest_hash',  v_manifest_hash,
      'endpoint_key',   v_endpoint.endpoint_key
    )
  );

  RETURN jsonb_build_object(
    'id',                 v_new_id,
    'manifest_hash',      v_manifest_hash,
    'envelope_hash',      v_envelope.envelope_hash,
    'trust_chain_hash',   v_envelope.trust_chain_hash,
    'endpoint_key',       v_endpoint.endpoint_key,
    'serializer_version', COALESCE(v_cert.serializer_version, ''),
    'replay_profile',     COALESCE(v_cert.replay_profile_version, '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION build_transport_manifest TO service_role;
