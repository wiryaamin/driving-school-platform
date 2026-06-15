-- Phase 5E: PKI Trust Infrastructure & Authority Authenticity
-- Step 2: Certificate Chains + Revocation

-- ── certificate_chains ───────────────────────────────────────────────────────
-- Semi-immutable: core identity fields locked after registration.
-- Only revocation fields (revocation_state, revoked_at, revocation_reason, revocation_hash) may change.
-- certificate_hash = SHA-256(canonical_jsonb of 8 identity fields, chain_version '5E.1')
-- subject_fingerprint = SHA-256(cert_material || '|' || subject_cn)
-- issuer_fingerprint  = SHA-256(issuer_material || '|' || issuer_cn)

CREATE TABLE certificate_chains (
  id                   uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id             text                        NOT NULL UNIQUE,
  trust_anchor_id      uuid                        NOT NULL REFERENCES trust_anchors(id) ON DELETE RESTRICT,
  endpoint_id          uuid                        REFERENCES regulatory_endpoints(id) ON DELETE RESTRICT,
  subject_common_name  text                        NOT NULL,
  subject_organization text                        NOT NULL,
  issuer_common_name   text                        NOT NULL,
  issuer_organization  text                        NOT NULL,
  subject_fingerprint  text                        NOT NULL,
  issuer_fingerprint   text                        NOT NULL,
  certificate_hash     text                        NOT NULL,
  chain_depth          integer                     NOT NULL DEFAULT 1,
  issuer_lineage       jsonb                       NOT NULL DEFAULT '[]',
  validity_not_before  timestamptz                 NOT NULL,
  validity_not_after   timestamptz                 NOT NULL,
  revocation_state     certificate_revocation_state NOT NULL DEFAULT 'active',
  revocation_hash      text,
  revoked_at           timestamptz,
  revocation_reason    text,
  algorithm            text                        NOT NULL DEFAULT 'sha256WithRSAEncryption',
  metadata             jsonb                       NOT NULL DEFAULT '{}',
  registered_at        timestamptz                 NOT NULL DEFAULT now(),

  CONSTRAINT chk_cert_chain_subject_fp    CHECK (length(subject_fingerprint) = 64),
  CONSTRAINT chk_cert_chain_issuer_fp     CHECK (length(issuer_fingerprint) = 64),
  CONSTRAINT chk_cert_chain_hash          CHECK (length(certificate_hash) = 64),
  CONSTRAINT chk_cert_chain_revhash       CHECK (revocation_hash IS NULL OR length(revocation_hash) = 64),
  CONSTRAINT chk_cert_chain_validity      CHECK (validity_not_before < validity_not_after),
  CONSTRAINT chk_cert_chain_revocation    CHECK (
    revoked_at IS NULL OR revocation_reason IS NOT NULL
  )
);

ALTER TABLE certificate_chains ENABLE ROW LEVEL SECURITY;

-- Platform-level: any authenticated user can read chains
CREATE POLICY certificate_chains_select ON certificate_chains
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY certificate_chains_service ON certificate_chains
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Core identity fields are immutable; only revocation fields may update.
CREATE OR REPLACE FUNCTION restrict_certificate_chain_core()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.chain_id             <> OLD.chain_id             OR
     NEW.trust_anchor_id      <> OLD.trust_anchor_id      OR
     NEW.subject_common_name  <> OLD.subject_common_name  OR
     NEW.subject_organization <> OLD.subject_organization OR
     NEW.issuer_common_name   <> OLD.issuer_common_name   OR
     NEW.issuer_organization  <> OLD.issuer_organization  OR
     NEW.subject_fingerprint  <> OLD.subject_fingerprint  OR
     NEW.issuer_fingerprint   <> OLD.issuer_fingerprint   OR
     NEW.certificate_hash     <> OLD.certificate_hash     OR
     NEW.chain_depth          <> OLD.chain_depth          OR
     NEW.validity_not_before  <> OLD.validity_not_before  OR
     NEW.validity_not_after   <> OLD.validity_not_after   OR
     NEW.algorithm            <> OLD.algorithm            OR
     NEW.registered_at        <> OLD.registered_at        OR
     NEW.endpoint_id          IS DISTINCT FROM OLD.endpoint_id
  THEN
    RAISE EXCEPTION 'certificate_chains: core identity fields are immutable after registration';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_certificate_chains_restrict_core
BEFORE UPDATE ON certificate_chains
FOR EACH ROW EXECUTE FUNCTION restrict_certificate_chain_core();

CREATE OR REPLACE FUNCTION prevent_certificate_chain_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'certificate_chains records cannot be deleted';
END;
$$;

CREATE TRIGGER trg_certificate_chains_no_delete
BEFORE DELETE ON certificate_chains
FOR EACH ROW EXECUTE FUNCTION prevent_certificate_chain_delete();

-- ── register_certificate_chain ────────────────────────────────────────────────
-- Registers a certificate chain anchored to a trust_anchor.
-- subject_fingerprint = SHA-256(cert_material || '|' || subject_cn)
-- issuer_fingerprint  = SHA-256(issuer_material || '|' || issuer_cn)
-- certificate_hash    = SHA-256(canonical_jsonb of 8 fields, chain_version 5E.1)
-- chain_depth         = length(issuer_lineage) + 1

CREATE OR REPLACE FUNCTION register_certificate_chain(
  p_chain_id             text,
  p_trust_anchor_id      uuid,
  p_subject_cn           text,
  p_subject_org          text,
  p_issuer_cn            text,
  p_issuer_org           text,
  p_cert_material        text,
  p_issuer_material      text,
  p_validity_not_before  timestamptz,
  p_validity_not_after   timestamptz,
  p_endpoint_id          uuid        DEFAULT NULL,
  p_issuer_lineage       jsonb       DEFAULT '[]',
  p_algorithm            text        DEFAULT 'sha256WithRSAEncryption',
  p_actor_id             uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anchor              trust_anchors%ROWTYPE;
  v_subject_fingerprint text;
  v_issuer_fingerprint  text;
  v_certificate_hash    text;
  v_chain_depth         integer;
  v_new_id              uuid;
BEGIN
  SELECT * INTO v_anchor FROM trust_anchors WHERE id = p_trust_anchor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trust anchor not found: %', p_trust_anchor_id;
  END IF;

  v_subject_fingerprint := encode(sha256((
    COALESCE(p_cert_material, '') || '|' || p_subject_cn
  )::bytea), 'hex');

  v_issuer_fingerprint := encode(sha256((
    COALESCE(p_issuer_material, '') || '|' || p_issuer_cn
  )::bytea), 'hex');

  v_certificate_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'chain_id',           canonical_text(p_chain_id),
      'trust_anchor_id',    canonical_uuid(p_trust_anchor_id),
      'subject_fingerprint', v_subject_fingerprint,
      'issuer_fingerprint',  v_issuer_fingerprint,
      'subject_cn',          canonical_text(p_subject_cn),
      'issuer_cn',           canonical_text(p_issuer_cn),
      'algorithm',           canonical_text(COALESCE(p_algorithm, 'sha256WithRSAEncryption')),
      'chain_version',       '5E.1'
    ))::text::bytea
  ), 'hex');

  v_chain_depth := COALESCE(jsonb_array_length(COALESCE(p_issuer_lineage, '[]'::jsonb)), 0) + 1;
  v_new_id      := gen_random_uuid();

  INSERT INTO certificate_chains (
    id, chain_id, trust_anchor_id, endpoint_id,
    subject_common_name, subject_organization,
    issuer_common_name, issuer_organization,
    subject_fingerprint, issuer_fingerprint, certificate_hash,
    chain_depth, issuer_lineage,
    validity_not_before, validity_not_after,
    algorithm, metadata
  ) VALUES (
    v_new_id, p_chain_id, p_trust_anchor_id, p_endpoint_id,
    p_subject_cn, p_subject_org,
    p_issuer_cn, p_issuer_org,
    v_subject_fingerprint, v_issuer_fingerprint, v_certificate_hash,
    v_chain_depth, COALESCE(p_issuer_lineage, '[]'::jsonb),
    p_validity_not_before, p_validity_not_after,
    COALESCE(p_algorithm, 'sha256WithRSAEncryption'), '{}'
  );

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    'certificate_chain_registered',
    'regulatory_audit_export',
    v_new_id,
    p_actor_id,
    jsonb_build_object(
      'chain_id',          p_chain_id,
      'certificate_hash',  v_certificate_hash,
      'trust_anchor_id',   p_trust_anchor_id::text
    )
  );

  RETURN jsonb_build_object(
    'id',                  v_new_id,
    'chain_id',            p_chain_id,
    'subject_fingerprint', v_subject_fingerprint,
    'issuer_fingerprint',  v_issuer_fingerprint,
    'certificate_hash',    v_certificate_hash,
    'chain_depth',         v_chain_depth
  );
END;
$$;

-- ── validate_certificate_chain ────────────────────────────────────────────────
-- 5-check chain validation:
-- Check 1: trust anchor active (is_active AND not revoked)
-- Check 2: within validity window (now() before validity_not_after)
-- Check 3: revocation state = 'active'
-- Check 4: certificate_hash re-derivable from 8 stored fields
-- Check 5: trust anchor's trust_identity_hash re-derivable (tampering detection)

CREATE OR REPLACE FUNCTION validate_certificate_chain(p_chain_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chain               certificate_chains%ROWTYPE;
  v_anchor              trust_anchors%ROWTYPE;
  v_checks              jsonb := '[]'::jsonb;
  v_recomputed          text;
  v_anchor_active       boolean;
  v_within_validity     boolean;
  v_revoke_active       boolean;
  v_cert_hash_valid     boolean;
  v_anchor_id_valid     boolean;
  v_all_valid           boolean;
BEGIN
  SELECT * INTO v_chain FROM certificate_chains WHERE id = p_chain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Certificate chain not found: %', p_chain_id;
  END IF;

  SELECT * INTO v_anchor FROM trust_anchors WHERE id = v_chain.trust_anchor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trust anchor not found for chain: %', v_chain.chain_id;
  END IF;

  -- Check 1: trust anchor active and not revoked
  v_anchor_active := v_anchor.is_active AND v_anchor.revoked_at IS NULL;
  v_checks := v_checks || jsonb_build_object(
    'check', 'trust_anchor_active', 'result', v_anchor_active
  );

  -- Check 2: certificate within validity window
  v_within_validity := (v_chain.validity_not_after > now());
  v_checks := v_checks || jsonb_build_object(
    'check', 'within_validity_window', 'result', v_within_validity,
    'validity_not_after', v_chain.validity_not_after
  );

  -- Check 3: revocation state
  v_revoke_active := (v_chain.revocation_state = 'active');
  v_checks := v_checks || jsonb_build_object(
    'check', 'revocation_state_active', 'result', v_revoke_active,
    'revocation_state', v_chain.revocation_state
  );

  -- Check 4: certificate_hash re-derivable from stored fields
  v_recomputed := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'chain_id',           canonical_text(v_chain.chain_id),
      'trust_anchor_id',    canonical_uuid(v_chain.trust_anchor_id),
      'subject_fingerprint', v_chain.subject_fingerprint,
      'issuer_fingerprint',  v_chain.issuer_fingerprint,
      'subject_cn',          canonical_text(v_chain.subject_common_name),
      'issuer_cn',           canonical_text(v_chain.issuer_common_name),
      'algorithm',           canonical_text(v_chain.algorithm),
      'chain_version',       '5E.1'
    ))::text::bytea
  ), 'hex');
  v_cert_hash_valid := (v_recomputed = v_chain.certificate_hash);
  v_checks := v_checks || jsonb_build_object(
    'check', 'certificate_hash_valid', 'result', v_cert_hash_valid
  );

  -- Check 5: trust anchor identity hash re-derivable (detects anchor tampering)
  v_recomputed := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'anchor_id',          canonical_text(v_anchor.anchor_id),
      'common_name',        canonical_text(v_anchor.common_name),
      'organization',       canonical_text(v_anchor.organization),
      'jurisdiction',       canonical_text(v_anchor.jurisdiction),
      'anchor_fingerprint', v_anchor.anchor_fingerprint
    ))::text::bytea
  ), 'hex');
  v_anchor_id_valid := (v_recomputed = v_anchor.trust_identity_hash);
  v_checks := v_checks || jsonb_build_object(
    'check', 'trust_anchor_identity_intact', 'result', v_anchor_id_valid
  );

  v_all_valid := v_anchor_active AND v_within_validity AND v_revoke_active
              AND v_cert_hash_valid AND v_anchor_id_valid;

  RETURN jsonb_build_object(
    'is_valid',  v_all_valid,
    'chain_id',  v_chain.chain_id,
    'anchor_id', v_anchor.anchor_id,
    'checks',    v_checks
  );
END;
$$;

-- ── verify_revocation_status ──────────────────────────────────────────────────
-- Reports the full revocation picture: chain state, anchor state, validity window.
-- is_valid = true only when chain is active, anchor is active, and cert is not expired.

CREATE OR REPLACE FUNCTION verify_revocation_status(p_chain_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chain              certificate_chains%ROWTYPE;
  v_anchor             trust_anchors%ROWTYPE;
  v_anchor_active      boolean;
  v_within_validity    boolean;
BEGIN
  SELECT * INTO v_chain FROM certificate_chains WHERE id = p_chain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Certificate chain not found: %', p_chain_id;
  END IF;

  SELECT * INTO v_anchor FROM trust_anchors WHERE id = v_chain.trust_anchor_id;

  v_anchor_active   := v_anchor.is_active AND v_anchor.revoked_at IS NULL;
  v_within_validity := (v_chain.validity_not_after > now());

  RETURN jsonb_build_object(
    'is_valid',            (v_chain.revocation_state = 'active') AND v_anchor_active AND v_within_validity,
    'revocation_state',    v_chain.revocation_state,
    'trust_anchor_active', v_anchor_active,
    'within_validity',     v_within_validity,
    'chain_id',            v_chain.chain_id,
    'revoked_at',          v_chain.revoked_at,
    'anchor_revoked_at',   v_anchor.revoked_at,
    'validity_not_after',  v_chain.validity_not_after
  );
END;
$$;

GRANT EXECUTE ON FUNCTION register_certificate_chain  TO service_role;
GRANT EXECUTE ON FUNCTION validate_certificate_chain  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION verify_revocation_status    TO authenticated, service_role;
