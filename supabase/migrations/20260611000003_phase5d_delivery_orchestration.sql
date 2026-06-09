-- Phase 5D: Transport Trust & Regulatory Delivery
-- Step 3: Delivery Orchestration (chain hash, deliveries, attempts, integrity)

-- ── submission_deliveries ─────────────────────────────────────────────────────
-- Semi-immutable: delivery_status and finalized_at may transition; all other fields locked.
-- delivery_chain_hash = generate_delivery_chain_hash([prior_chain_hash?,  manifest_hash])
-- delivery_hash       = SHA-256(canonical_jsonb of 7 identity fields)
-- prior_delivery_id   preserves retry lineage in the chain.

CREATE TABLE submission_deliveries (
  id                    uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid               NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  entity_type           filing_entity_type NOT NULL,
  entity_id             uuid               NOT NULL,
  transport_manifest_id uuid               NOT NULL REFERENCES transport_manifests(id) ON DELETE RESTRICT,
  endpoint_id           uuid               NOT NULL REFERENCES regulatory_endpoints(id) ON DELETE RESTRICT,
  prior_delivery_id     uuid               REFERENCES submission_deliveries(id) ON DELETE RESTRICT,
  delivery_version      text               NOT NULL DEFAULT '5D.1',
  delivery_chain_hash   text               NOT NULL,
  delivery_status       delivery_status    NOT NULL DEFAULT 'pending',
  delivery_hash         text               NOT NULL,
  finalized_at          timestamptz,
  actor_id              uuid               REFERENCES auth.users(id),
  metadata              jsonb              NOT NULL DEFAULT '{}',
  initiated_at          timestamptz        NOT NULL DEFAULT now(),

  CONSTRAINT chk_delivery_chain_hash CHECK (length(delivery_chain_hash) = 64),
  CONSTRAINT chk_delivery_hash       CHECK (length(delivery_hash) = 64)
);

ALTER TABLE submission_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY submission_deliveries_select ON submission_deliveries
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY submission_deliveries_service ON submission_deliveries
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Core fields are immutable; only delivery_status and finalized_at may change.
CREATE OR REPLACE FUNCTION restrict_submission_delivery_core()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id       <> OLD.organization_id       OR
     NEW.entity_type           <> OLD.entity_type           OR
     NEW.entity_id             <> OLD.entity_id             OR
     NEW.transport_manifest_id <> OLD.transport_manifest_id OR
     NEW.endpoint_id           <> OLD.endpoint_id           OR
     NEW.delivery_version      <> OLD.delivery_version      OR
     NEW.delivery_chain_hash   <> OLD.delivery_chain_hash   OR
     NEW.delivery_hash         <> OLD.delivery_hash         OR
     NEW.initiated_at          <> OLD.initiated_at          OR
     NEW.prior_delivery_id     IS DISTINCT FROM OLD.prior_delivery_id
  THEN
    RAISE EXCEPTION 'submission_deliveries: core identity fields are immutable after creation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_submission_deliveries_restrict_core
BEFORE UPDATE ON submission_deliveries
FOR EACH ROW EXECUTE FUNCTION restrict_submission_delivery_core();

CREATE OR REPLACE FUNCTION prevent_submission_delivery_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'submission_deliveries records cannot be deleted';
END;
$$;

CREATE TRIGGER trg_submission_deliveries_no_delete
BEFORE DELETE ON submission_deliveries
FOR EACH ROW EXECUTE FUNCTION prevent_submission_delivery_delete();

-- ── delivery_attempts ─────────────────────────────────────────────────────────
-- Fully immutable: once an attempt is recorded it cannot be changed.
-- response_hash = SHA-256(canonical_jsonb(transport_response) || '|' || delivery_id || '|' || attempt_number)
-- attempt_number is enforced unique per delivery — prevents out-of-order insertion.

CREATE TABLE delivery_attempts (
  id                       uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid                     NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  delivery_id              uuid                     NOT NULL REFERENCES submission_deliveries(id) ON DELETE RESTRICT,
  attempt_number           integer                  NOT NULL,
  attempt_outcome          delivery_attempt_outcome NOT NULL,
  transport_response       jsonb                    NOT NULL DEFAULT '{}',
  response_hash            text                     NOT NULL,
  authority_acknowledgment text,
  acknowledged_at          timestamptz,
  error_details            text,
  actor_id                 uuid                     REFERENCES auth.users(id),
  metadata                 jsonb                    NOT NULL DEFAULT '{}',
  attempted_at             timestamptz              NOT NULL DEFAULT now(),

  CONSTRAINT uq_delivery_attempt_number UNIQUE (delivery_id, attempt_number),
  CONSTRAINT chk_attempt_response_hash  CHECK (length(response_hash) = 64)
);

ALTER TABLE delivery_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_attempts_select ON delivery_attempts
  FOR SELECT TO authenticated
  USING (organization_id = (current_setting('app.current_org_id', true))::uuid);

CREATE POLICY delivery_attempts_service ON delivery_attempts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION prevent_delivery_attempt_modification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'delivery_attempts records are immutable and cannot be % after creation', TG_OP;
END;
$$;

CREATE TRIGGER trg_delivery_attempts_immutable
BEFORE UPDATE OR DELETE ON delivery_attempts
FOR EACH ROW EXECUTE FUNCTION prevent_delivery_attempt_modification();

-- ── generate_delivery_chain_hash ──────────────────────────────────────────────
-- IMMUTABLE: SHA-256 recursive chain anchored at 'delivery-genesis'.
-- Distinct from generate_trust_chain_hash ('trust-genesis') and
-- generate_export_chain_hash ('genesis') — same input → different output.
-- Order-sensitive: preserves retry lineage when prior_delivery_chain_hash prepended.

CREATE OR REPLACE FUNCTION generate_delivery_chain_hash(p_hashes text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $func$
WITH RECURSIVE chain AS (
  SELECT 0 AS idx,
         encode(sha256('delivery-genesis'::bytea), 'hex') AS h
  UNION ALL
  SELECT c.idx + 1,
         encode(
           sha256((c.h || '|' || COALESCE(p_hashes[c.idx + 1], ''))::bytea),
           'hex'
         )
  FROM chain c
  WHERE c.idx < cardinality(COALESCE(p_hashes, ARRAY[]::text[]))
)
SELECT h FROM chain ORDER BY idx DESC LIMIT 1
$func$;

-- ── create_submission_delivery ────────────────────────────────────────────────
-- Creates a delivery record anchored to a transport_manifest.
-- delivery_chain_hash folds in prior chain for retries: ARRAY[prior_chain, manifest_hash].
-- First delivery: ARRAY[manifest_hash] only.

CREATE OR REPLACE FUNCTION create_submission_delivery(
  p_org_id                uuid,
  p_entity_type           filing_entity_type,
  p_entity_id             uuid,
  p_transport_manifest_id uuid,
  p_prior_delivery_id     uuid DEFAULT NULL,
  p_actor_id              uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_manifest            transport_manifests%ROWTYPE;
  v_prior_chain_hash    text;
  v_chain_hashes        text[];
  v_delivery_chain_hash text;
  v_delivery_content    jsonb;
  v_delivery_hash       text;
  v_new_id              uuid;
BEGIN
  SELECT * INTO v_manifest FROM transport_manifests WHERE id = p_transport_manifest_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transport manifest not found: %', p_transport_manifest_id;
  END IF;

  -- Build chain: prepend prior delivery chain hash for retry lineage
  IF p_prior_delivery_id IS NOT NULL THEN
    SELECT delivery_chain_hash INTO v_prior_chain_hash
    FROM submission_deliveries WHERE id = p_prior_delivery_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Prior delivery not found: %', p_prior_delivery_id;
    END IF;
    v_chain_hashes := ARRAY[v_prior_chain_hash, v_manifest.manifest_hash];
  ELSE
    v_chain_hashes := ARRAY[v_manifest.manifest_hash];
  END IF;

  v_delivery_chain_hash := generate_delivery_chain_hash(v_chain_hashes);

  -- Deterministic delivery hash over 7 identity fields
  v_delivery_content := canonical_jsonb(jsonb_build_object(
    'organization_id',        canonical_uuid(p_org_id),
    'entity_type',            canonical_text(p_entity_type::text),
    'entity_id',              canonical_uuid(p_entity_id),
    'transport_manifest_id',  canonical_uuid(p_transport_manifest_id),
    'endpoint_id',            canonical_uuid(v_manifest.endpoint_id),
    'delivery_chain_hash',    v_delivery_chain_hash,
    'delivery_version',       '5D.1'
  ));

  v_delivery_hash := encode(sha256(v_delivery_content::text::bytea), 'hex');
  v_new_id        := gen_random_uuid();

  INSERT INTO submission_deliveries (
    id, organization_id, entity_type, entity_id,
    transport_manifest_id, endpoint_id, prior_delivery_id,
    delivery_version, delivery_chain_hash, delivery_status,
    delivery_hash, actor_id
  ) VALUES (
    v_new_id, p_org_id, p_entity_type, p_entity_id,
    p_transport_manifest_id, v_manifest.endpoint_id, p_prior_delivery_id,
    '5D.1', v_delivery_chain_hash, 'pending',
    v_delivery_hash, p_actor_id
  );

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'delivery_created', p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'delivery_id',         v_new_id::text,
      'delivery_chain_hash', v_delivery_chain_hash,
      'prior_delivery_id',   p_prior_delivery_id::text
    )
  );

  RETURN jsonb_build_object(
    'id',                  v_new_id,
    'delivery_chain_hash', v_delivery_chain_hash,
    'delivery_hash',       v_delivery_hash,
    'delivery_status',     'pending'
  );
END;
$$;

-- ── register_delivery_attempt ─────────────────────────────────────────────────
-- Records an immutable delivery attempt and updates delivery_status.
-- response_hash = SHA-256(canonical_jsonb(transport_response) || '|' || delivery_id || '|' || attempt_number)

CREATE OR REPLACE FUNCTION register_delivery_attempt(
  p_org_id                   uuid,
  p_delivery_id              uuid,
  p_outcome                  delivery_attempt_outcome,
  p_transport_response       jsonb       DEFAULT '{}',
  p_authority_acknowledgment text        DEFAULT NULL,
  p_acknowledged_at          timestamptz DEFAULT NULL,
  p_actor_id                 uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery      submission_deliveries%ROWTYPE;
  v_attempt_num   integer;
  v_response_hash text;
  v_new_id        uuid;
  v_new_status    delivery_status;
BEGIN
  SELECT * INTO v_delivery
  FROM submission_deliveries
  WHERE id = p_delivery_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found: %', p_delivery_id;
  END IF;

  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_attempt_num
  FROM delivery_attempts WHERE delivery_id = p_delivery_id;

  -- response_hash: deterministic from response + delivery_id + attempt_number
  v_response_hash := encode(sha256((
    canonical_jsonb(COALESCE(p_transport_response, '{}'::jsonb))::text || '|' ||
    p_delivery_id::text                                                  || '|' ||
    v_attempt_num::text
  )::bytea), 'hex');

  v_new_id := gen_random_uuid();

  INSERT INTO delivery_attempts (
    id, organization_id, delivery_id, attempt_number,
    attempt_outcome, transport_response, response_hash,
    authority_acknowledgment, acknowledged_at, actor_id
  ) VALUES (
    v_new_id, p_org_id, p_delivery_id, v_attempt_num,
    p_outcome,
    COALESCE(p_transport_response, '{}'),
    v_response_hash,
    p_authority_acknowledgment, p_acknowledged_at, p_actor_id
  );

  -- Advance delivery status based on outcome
  v_new_status := CASE p_outcome
    WHEN 'success'  THEN 'delivered'::delivery_status
    WHEN 'rejected' THEN 'rejected'::delivery_status
    WHEN 'failure'  THEN 'failed'::delivery_status
    WHEN 'timeout'  THEN 'failed'::delivery_status
    ELSE v_delivery.delivery_status
  END;

  IF v_new_status <> v_delivery.delivery_status THEN
    UPDATE submission_deliveries SET delivery_status = v_new_status WHERE id = p_delivery_id;
  END IF;

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'delivery_attempt_registered',
    v_delivery.entity_type::text, v_delivery.entity_id, p_actor_id,
    jsonb_build_object(
      'delivery_id',    p_delivery_id::text,
      'attempt_number', v_attempt_num,
      'outcome',        p_outcome::text,
      'response_hash',  v_response_hash
    )
  );

  RETURN jsonb_build_object(
    'id',             v_new_id,
    'attempt_number', v_attempt_num,
    'response_hash',  v_response_hash,
    'new_status',     v_new_status::text
  );
END;
$$;

-- ── verify_delivery_integrity ─────────────────────────────────────────────────
-- 5-check comprehensive integrity verification for the latest delivery of an entity.
-- Check 1: manifest_hash re-derivable from 12 snapshotted fields.
-- Check 2: delivery_chain_hash re-derivable (with/without prior chain).
-- Check 3: endpoint identity hash intact (identity_hash_match, not is_active).
-- Check 4: all response_hashes in delivery_attempts re-derivable.
-- Check 5: serializer_version non-empty (compatibility guard).

CREATE OR REPLACE FUNCTION verify_delivery_integrity(
  p_org_id      uuid,
  p_entity_type filing_entity_type,
  p_entity_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery          submission_deliveries%ROWTYPE;
  v_manifest          transport_manifests%ROWTYPE;
  v_checks            jsonb := '[]'::jsonb;
  v_recomputed        text;
  v_prior_chain_hash  text;
  v_chain_hashes      text[];
  v_endpoint_result   jsonb;
  v_attempt           record;
  v_recomputed_rh     text;
  v_manifest_valid    boolean;
  v_chain_valid       boolean;
  v_endpoint_valid    boolean;
  v_responses_valid   boolean := true;
  v_serializer_valid  boolean;
  v_all_valid         boolean;
  v_attempt_count     integer := 0;
BEGIN
  -- Latest delivery for entity
  SELECT sd.* INTO v_delivery
  FROM submission_deliveries sd
  WHERE sd.organization_id = p_org_id
    AND sd.entity_type      = p_entity_type
    AND sd.entity_id        = p_entity_id
  ORDER BY sd.initiated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('is_valid', false, 'error', 'No delivery found for entity');
  END IF;

  SELECT * INTO v_manifest FROM transport_manifests WHERE id = v_delivery.transport_manifest_id;

  -- Check 1: manifest_hash re-derivable from 12 snapshotted fields
  v_recomputed := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'entity_type',            canonical_text(v_manifest.entity_type::text),
      'entity_id',              canonical_uuid(v_manifest.entity_id),
      'organization_id',        canonical_uuid(v_manifest.organization_id),
      'envelope_hash',          COALESCE(v_manifest.envelope_hash, ''),
      'trust_chain_hash',       COALESCE(v_manifest.trust_chain_hash, ''),
      'endpoint_key',           canonical_text(v_manifest.endpoint_key),
      'authority_name',         canonical_text(v_manifest.authority_name),
      'protocol',               canonical_text(v_manifest.protocol),
      'endpoint_identity_hash', COALESCE(v_manifest.endpoint_identity_hash, ''),
      'serializer_version',     canonical_text(COALESCE(v_manifest.serializer_version, '')),
      'replay_profile',         canonical_text(COALESCE(v_manifest.replay_profile, '')),
      'manifest_version',       '5D.1'
    ))::text::bytea
  ), 'hex');
  v_manifest_valid := (v_recomputed = v_manifest.manifest_hash);
  v_checks := v_checks || jsonb_build_object(
    'check', 'manifest_hash_valid', 'result', v_manifest_valid
  );

  -- Check 2: delivery_chain_hash re-derivable
  IF v_delivery.prior_delivery_id IS NOT NULL THEN
    SELECT delivery_chain_hash INTO v_prior_chain_hash
    FROM submission_deliveries WHERE id = v_delivery.prior_delivery_id;
    v_chain_hashes := ARRAY[v_prior_chain_hash, v_manifest.manifest_hash];
  ELSE
    v_chain_hashes := ARRAY[v_manifest.manifest_hash];
  END IF;
  v_recomputed  := generate_delivery_chain_hash(v_chain_hashes);
  v_chain_valid := (v_recomputed = v_delivery.delivery_chain_hash);
  v_checks := v_checks || jsonb_build_object(
    'check', 'delivery_chain_valid', 'result', v_chain_valid
  );

  -- Check 3: endpoint identity hash intact (identity_hash_match only — active state is informational)
  v_endpoint_result := verify_endpoint_trust(v_manifest.endpoint_id);
  v_endpoint_valid  := (v_endpoint_result->>'identity_hash_match')::boolean;
  v_checks := v_checks || jsonb_build_object(
    'check',            'endpoint_trust_valid',
    'result',           v_endpoint_valid,
    'endpoint_active',  (v_endpoint_result->>'is_active')::boolean
  );

  -- Check 4: all attempt response_hashes re-derivable
  FOR v_attempt IN
    SELECT * FROM delivery_attempts
    WHERE delivery_id = v_delivery.id
    ORDER BY attempt_number
  LOOP
    v_attempt_count := v_attempt_count + 1;
    v_recomputed_rh := encode(sha256((
      canonical_jsonb(COALESCE(v_attempt.transport_response, '{}'::jsonb))::text || '|' ||
      v_delivery.id::text                                                          || '|' ||
      v_attempt.attempt_number::text
    )::bytea), 'hex');
    IF v_recomputed_rh <> v_attempt.response_hash THEN
      v_responses_valid := false;
    END IF;
  END LOOP;
  v_checks := v_checks || jsonb_build_object(
    'check',              'response_hashes_valid',
    'result',             v_responses_valid,
    'attempts_verified',  v_attempt_count
  );

  -- Check 5: serializer version non-empty
  v_serializer_valid := (v_manifest.serializer_version IS NOT NULL AND v_manifest.serializer_version <> '');
  v_checks := v_checks || jsonb_build_object(
    'check',               'serializer_compatible',
    'result',              v_serializer_valid,
    'serializer_version',  COALESCE(v_manifest.serializer_version, '')
  );

  v_all_valid := v_manifest_valid AND v_chain_valid AND v_endpoint_valid AND v_responses_valid AND v_serializer_valid;

  RETURN jsonb_build_object(
    'is_valid',        v_all_valid,
    'delivery_id',     v_delivery.id,
    'manifest_id',     v_manifest.id,
    'delivery_status', v_delivery.delivery_status,
    'attempt_count',   v_attempt_count,
    'checks',          v_checks
  );
END;
$$;

-- ── finalize_regulatory_delivery ──────────────────────────────────────────────
-- Sets delivery_status = 'delivered' and records finalized_at.
-- Requires at least one successful delivery_attempt to prevent premature finalization.

CREATE OR REPLACE FUNCTION finalize_regulatory_delivery(
  p_org_id      uuid,
  p_delivery_id uuid,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery    submission_deliveries%ROWTYPE;
  v_has_success boolean;
BEGIN
  SELECT * INTO v_delivery
  FROM submission_deliveries
  WHERE id = p_delivery_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found or access denied: %', p_delivery_id;
  END IF;

  IF v_delivery.delivery_status = 'delivered' AND v_delivery.finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('id', p_delivery_id, 'status', 'delivered', 'already_finalized', true);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM delivery_attempts
    WHERE delivery_id = p_delivery_id AND attempt_outcome = 'success'
  ) INTO v_has_success;

  IF NOT v_has_success THEN
    RAISE EXCEPTION 'Cannot finalize delivery: no successful attempt recorded for delivery %', p_delivery_id;
  END IF;

  UPDATE submission_deliveries
  SET delivery_status = 'delivered',
      finalized_at    = now()
  WHERE id = p_delivery_id;

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'delivery_finalized',
    v_delivery.entity_type::text, v_delivery.entity_id, p_actor_id,
    jsonb_build_object(
      'delivery_id',   p_delivery_id::text,
      'delivery_hash', v_delivery.delivery_hash
    )
  );

  RETURN jsonb_build_object('id', p_delivery_id, 'status', 'delivered', 'finalized', true);
END;
$$;

GRANT EXECUTE ON FUNCTION generate_delivery_chain_hash  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION create_submission_delivery    TO service_role;
GRANT EXECUTE ON FUNCTION register_delivery_attempt     TO service_role;
GRANT EXECUTE ON FUNCTION verify_delivery_integrity     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION finalize_regulatory_delivery  TO service_role;
