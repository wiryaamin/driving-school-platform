-- SECURITY REMEDIATION WAVE 2C-B (CORRECTIVE) — MISSED REGULATORY FUNCTIONS
--
-- Follow-up to 20260815200000 (Wave 2C-B). A retroactive audit requested
-- after that migration was already applied found the original inventory's
-- search terms never included "regulatory" and so missed 5 CRITICAL
-- functions in the same regulatory-filing domain, all still fully exposed
-- to anon at the time of this migration: certify_regulatory_filing,
-- finalize_regulatory_delivery, generate_regulatory_audit_export,
-- register_regulatory_endpoint, sign_regulatory_certificate.
--
-- Same fix pattern as every function in this security program:
--   - certify_regulatory_filing: direct p_org_id parameter, no prior check
--     at all — Pattern A early guard.
--   - finalize_regulatory_delivery, sign_regulatory_certificate: both
--     already had a partial check (entity fetch filtered by
--     organization_id = p_org_id) but never verified p_org_id itself
--     against the caller — same "entity-consistency-but-no-caller-check"
--     gap Wave 2C-B already fixed on manual_match_bank_line and
--     reconcile_vat_period. Pattern A guard added.
--   - generate_regulatory_audit_export: the most severe of the five — its
--     financial_periods fetch had NO organization filter of any kind, so a
--     caller's own p_org_id could be combined with ANY other org's
--     p_period_id. Fixed with a Pattern A guard on p_org_id PLUS a new
--     v_period.organization_id consistency check (merged into the
--     existing PERIOD_NOT_FOUND exception) that did not exist before this
--     migration — the one function in this wave requiring a genuinely new
--     check, not just a caller-org guard on an existing filter.
--   - register_regulatory_endpoint: structurally different from the other
--     four. Its target table, regulatory_endpoints, has no
--     organization_id column at all — confirmed via information_schema —
--     it is genuinely platform-global regulatory-authority configuration
--     (submission endpoint URLs, trust material, eIDAS settings), not
--     tenant data. There is no p_org_id to check against a caller. Its
--     real Edge Function caller (compliance/index.ts
--     handleRegisterEndpoint) currently gates it only with the ordinary
--     tenant-level permission finance:compliance:write, which — combined
--     with the RPC's total lack of a boundary — meant any org admin
--     holding that permission in their own tenant could register or
--     overwrite platform-wide regulatory endpoint trust material. Per
--     explicit approval, restricted to
--     public.is_platform_admin() OR public.is_trusted_service_context()
--     (the same is_trusted_service_context() helper reused throughout,
--     no new mechanism) — this intentionally also closes the tenant-admin
--     Edge Function path, since a platform-global configuration table has
--     no legitimate per-tenant caller.
--
-- WAVE 2A LESSON reapplied: every REVOKE below explicitly includes PUBLIC,
-- anon, and authenticated together; every grant is re-verified live via
-- has_function_privilege() after applying this migration.

CREATE OR REPLACE FUNCTION public.certify_regulatory_filing(p_org_id uuid, p_entity_type filing_entity_type, p_entity_id uuid, p_certification_type regulatory_certification_type DEFAULT 'regulatory_seal'::regulatory_certification_type, p_reason text DEFAULT ''::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_canonical     jsonb;
  v_payload_hash  text;
  v_filing_hash   text;
  v_prior_id      uuid;
  v_prior_chain   text;
  v_chain_hash    text;
  v_cert_hash     text;
  v_cert_id       uuid;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'REGULATORY_CERTIFY_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Build canonical payload via Phase 5A.2 dispatcher
  v_canonical := build_canonical_payload(p_entity_type::text, p_entity_id, p_org_id);

  -- Timestamp-free canonical payload hash
  v_payload_hash := generate_replay_safe_hash(p_entity_type::text, p_entity_id, v_canonical);

  -- Retrieve entity's stored filing hash
  CASE p_entity_type
    WHEN 'agi_submission' THEN
      SELECT submission_hash INTO v_filing_hash
      FROM agi_submissions WHERE id = p_entity_id AND organization_id = p_org_id;
    WHEN 'vat_declaration' THEN
      SELECT declaration_hash INTO v_filing_hash
      FROM vat_declarations WHERE id = p_entity_id AND organization_id = p_org_id;
    WHEN 'saf_t_export' THEN
      SELECT content_hash INTO v_filing_hash
      FROM saf_t_exports WHERE id = p_entity_id AND organization_id = p_org_id;
    ELSE
      v_filing_hash := NULL;
  END CASE;

  -- Chain to prior certification for this entity (if any)
  SELECT id, lineage_chain_hash
  INTO   v_prior_id, v_prior_chain
  FROM   regulatory_certifications
  WHERE  entity_type = p_entity_type
    AND  entity_id   = p_entity_id
    AND  organization_id = p_org_id
  ORDER  BY certified_at DESC LIMIT 1;

  -- Lineage chain hash: SHA-256(prior_chain_hash|canonical_payload_hash)
  v_chain_hash := encode(sha256((
    COALESCE(v_prior_chain, 'genesis') || '|' || v_payload_hash
  )::bytea), 'hex');

  -- Certificate hash: timestamp-free, fully deterministic
  v_cert_hash := encode(sha256((
    canonical_uuid(p_entity_id)                                 || '|' ||
    canonical_text(p_entity_type::text)                         || '|' ||
    v_payload_hash                                              || '|' ||
    canonical_text(p_certification_type::text)                  || '|' ||
    canonical_text(COALESCE(p_reason, ''))                      || '|' ||
    v_chain_hash
  )::bytea), 'hex');

  INSERT INTO regulatory_certifications (
    organization_id, entity_type, entity_id,
    certification_type, canonical_payload_hash,
    lineage_chain_hash, prior_certification_id,
    filing_hash, certificate_hash,
    certification_reason, actor_id
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    p_certification_type, v_payload_hash,
    v_chain_hash, v_prior_id,
    v_filing_hash, v_cert_hash,
    COALESCE(p_reason, ''), p_actor_id
  ) RETURNING id INTO v_cert_id;

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'filing_certified', p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'certification_id',       v_cert_id,
      'certificate_hash',       v_cert_hash,
      'canonical_payload_hash', v_payload_hash,
      'certification_type',     p_certification_type
    )
  );

  RETURN jsonb_build_object(
    'certification_id',       v_cert_id,
    'entity_type',            p_entity_type,
    'entity_id',              p_entity_id,
    'certification_type',     p_certification_type,
    'certificate_hash',       v_cert_hash,
    'canonical_payload_hash', v_payload_hash,
    'lineage_chain_hash',     v_chain_hash,
    'prior_certification_id', v_prior_id,
    'certification_reason',   COALESCE(p_reason, '')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_regulatory_delivery(p_org_id uuid, p_delivery_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_delivery    submission_deliveries%ROWTYPE;
  v_has_success boolean;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'REGULATORY_DELIVERY_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.generate_regulatory_audit_export(p_org_id uuid, p_period_id uuid, p_export_type text, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_export_id   uuid;
  v_period      financial_periods%ROWTYPE;
  v_hash        text;
  v_row_count   int := 0;
  v_data        text;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'REGULATORY_EXPORT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
  END IF;

  -- New check: the original function trusted p_org_id for the data
  -- aggregation queries below without ever confirming p_period_id actually
  -- belongs to that organization, letting a caller blend one org's real
  -- period dates into another org's aggregated export.
  IF v_period.organization_id IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
  END IF;

  IF p_export_type NOT IN ('agi', 'vat_declaration', 'payroll_register', 'trial_balance', 'general_ledger') THEN
    RAISE EXCEPTION 'UNKNOWN_EXPORT_TYPE: % must be one of: agi, vat_declaration, payroll_register, trial_balance, general_ledger',
      p_export_type
      USING ERRCODE = 'P0001';
  END IF;

  -- Build content hash depending on export type
  CASE p_export_type
    WHEN 'payroll_register' THEN
      SELECT count(*), encode(digest(COALESCE(string_agg(
        pe.id::text || pe.employee_id::text || pe.gross_salary::text,
        '' ORDER BY pe.id), ''), 'sha256'), 'hex')
      INTO v_row_count, v_hash
      FROM payroll_entries pe
      JOIN payroll_runs pr ON pr.id = pe.payroll_run_id
      WHERE pr.organization_id     = p_org_id
        AND pr.financial_period_id = p_period_id
        AND pr.status              = 'posted';

    WHEN 'trial_balance' THEN
      SELECT count(*), encode(digest(COALESCE(string_agg(
        account_code || closing_balance::text,
        '' ORDER BY account_code), ''), 'sha256'), 'hex')
      INTO v_row_count, v_hash
      FROM account_balances
      WHERE organization_id     = p_org_id
        AND financial_period_id = p_period_id;

    WHEN 'general_ledger' THEN
      SELECT count(*), encode(digest(COALESCE(string_agg(
        jl.id::text, '' ORDER BY je.voucher_number, jl.line_number), ''), 'sha256'), 'hex')
      INTO v_row_count, v_hash
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE je.organization_id     = p_org_id
        AND je.financial_period_id = p_period_id
        AND je.status              = 'posted';

    WHEN 'agi' THEN
      SELECT count(*), encode(digest(COALESCE(string_agg(
        ae.id::text || ae.declaration_month::text || ae.total_gross::text,
        '' ORDER BY ae.declaration_month), ''), 'sha256'), 'hex')
      INTO v_row_count, v_hash
      FROM agi_exports ae
      WHERE ae.organization_id     = p_org_id
        AND ae.financial_period_id = p_period_id
        AND ae.status              IN ('finalized', 'submitted');

    WHEN 'vat_declaration' THEN
      SELECT count(*), encode(digest(COALESCE(string_agg(
        vcr.id::text || vcr.net_vat_payable::text,
        '' ORDER BY vcr.run_date), ''), 'sha256'), 'hex')
      INTO v_row_count, v_hash
      FROM vat_clearing_runs vcr
      WHERE vcr.organization_id     = p_org_id
        AND vcr.financial_period_id = p_period_id;
  END CASE;

  INSERT INTO regulatory_audit_exports (
    organization_id, financial_period_id, export_type,
    period_start, period_end, content_hash, row_count,
    status, notes, created_by
  ) VALUES (
    p_org_id, p_period_id, p_export_type,
    v_period.period_start, v_period.period_end,
    v_hash, COALESCE(v_row_count, 0),
    'generated', p_notes, p_actor_id
  ) RETURNING id INTO v_export_id;

  RETURN v_export_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sign_regulatory_certificate(p_org_id uuid, p_cert_id uuid, p_signing_key_id text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key          signing_key_registry%ROWTYPE;
  v_cert         regulatory_certifications%ROWTYPE;
  v_payload      jsonb;
  v_payload_hash text;
  v_sig_value    text;
  v_sig_id       uuid;
  v_eidas_level  eidas_level_type;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'REGULATORY_SIGN_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_key
  FROM signing_key_registry
  WHERE key_id = p_signing_key_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'signing key not found or inactive: %', p_signing_key_id;
  END IF;

  SELECT * INTO v_cert
  FROM regulatory_certifications
  WHERE id = p_cert_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'certification not found: %', p_cert_id;
  END IF;

  v_payload      := generate_signature_payload(p_cert_id);
  v_payload_hash := encode(sha256(canonical_jsonb(v_payload)::text::bytea), 'hex');

  -- Keyed hash using key_fingerprint as signing material
  v_sig_value := encode(
    sha256((v_key.key_fingerprint || '|' || v_payload_hash)::bytea),
    'hex'
  );

  IF v_key.eidas_compatible THEN
    v_eidas_level := 'AdES';
  END IF;

  INSERT INTO certificate_signatures (
    organization_id, certification_id, signing_key_id, algorithm,
    signature_version, signature_payload_hash, signature_value,
    eidas_level, actor_id
  ) VALUES (
    p_org_id, p_cert_id, p_signing_key_id, v_key.algorithm,
    'sigv1', v_payload_hash, v_sig_value,
    v_eidas_level, p_actor_id
  ) RETURNING id INTO v_sig_id;

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'certificate_signed',
    'certificate_signature', v_sig_id,
    p_actor_id,
    jsonb_build_object(
      'certification_id', p_cert_id,
      'signing_key_id',   p_signing_key_id,
      'algorithm',        v_key.algorithm
    )
  );

  RETURN jsonb_build_object(
    'signature_id',           v_sig_id,
    'certification_id',       p_cert_id,
    'signing_key_id',         p_signing_key_id,
    'algorithm',              v_key.algorithm,
    'signature_version',      'sigv1',
    'signature_payload_hash', v_payload_hash,
    'signature_value',        v_sig_value,
    'eidas_level',            v_eidas_level,
    'signed_at',              now()
  );
END;
$function$;

-- register_regulatory_endpoint: platform-global configuration, no
-- organization_id column on its target table at all. Restricted to
-- platform-admin / trusted-service-role only, per explicit approval —
-- this also closes the existing tenant-admin Edge Function path
-- (compliance/index.ts handleRegisterEndpoint), which previously gated it
-- only with the ordinary tenant-level finance:compliance:write
-- permission.
CREATE OR REPLACE FUNCTION public.register_regulatory_endpoint(p_endpoint_key text, p_authority_name text, p_protocol text, p_endpoint_version text DEFAULT 'v1'::text, p_eidas_compatible boolean DEFAULT false, p_trust_material text DEFAULT NULL::text, p_authority_metadata jsonb DEFAULT '{}'::jsonb, p_transport_metadata jsonb DEFAULT '{}'::jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_trust_fingerprint      text;
  v_endpoint_identity_hash text;
  v_new_id                 uuid;
BEGIN
  IF NOT public.is_trusted_service_context() THEN
    RAISE EXCEPTION 'REGULATORY_ENDPOINT_FORBIDDEN: registering a regulatory endpoint requires platform-admin or service-role authorization'
      USING ERRCODE = '42501';
  END IF;

  -- trust_fingerprint: SHA-256 of trust material (or endpoint_key as fallback)
  v_trust_fingerprint := encode(
    sha256(COALESCE(p_trust_material, p_endpoint_key)::bytea),
    'hex'
  );

  -- endpoint_identity_hash: deterministic, replay-safe, covers all identity fields
  v_endpoint_identity_hash := encode(sha256(
    canonical_jsonb(jsonb_build_object(
      'endpoint_key',      canonical_text(p_endpoint_key),
      'authority_name',    canonical_text(p_authority_name),
      'protocol',          canonical_text(p_protocol),
      'endpoint_version',  canonical_text(COALESCE(p_endpoint_version, 'v1')),
      'trust_fingerprint', v_trust_fingerprint
    ))::text::bytea
  ), 'hex');

  v_new_id := gen_random_uuid();

  INSERT INTO regulatory_endpoints (
    id, endpoint_key, authority_name, protocol, endpoint_version,
    trust_fingerprint, endpoint_identity_hash, is_active, eidas_compatible,
    authority_metadata, transport_metadata, metadata
  ) VALUES (
    v_new_id, p_endpoint_key, p_authority_name, p_protocol,
    COALESCE(p_endpoint_version, 'v1'),
    v_trust_fingerprint, v_endpoint_identity_hash, true,
    COALESCE(p_eidas_compatible, false),
    COALESCE(p_authority_metadata, '{}'),
    COALESCE(p_transport_metadata, '{}'),
    '{}'
  );

  RETURN jsonb_build_object(
    'id',                     v_new_id,
    'endpoint_key',           p_endpoint_key,
    'trust_fingerprint',      v_trust_fingerprint,
    'endpoint_identity_hash', v_endpoint_identity_hash
  );
END;
$function$;

-- ============================================================================
-- GRANTS — PUBLIC, anon, and authenticated explicitly revoked together
-- (Wave 2A lesson). Four functions have real authenticated callers
-- (compliance/index.ts, regulatory-exports/index.ts, both confirmed using
-- anon-key + forwarded Authorization header). register_regulatory_endpoint
-- is restricted to service_role only, per its body-level platform-admin/
-- service-role-only check above — a plain authenticated grant would be
-- harmless given the internal check, but service_role-only keeps the
-- grant model consistent with what the function actually permits.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.certify_regulatory_filing(uuid, filing_entity_type, uuid, regulatory_certification_type, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.certify_regulatory_filing(uuid, filing_entity_type, uuid, regulatory_certification_type, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.finalize_regulatory_delivery(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_regulatory_delivery(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_regulatory_audit_export(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_regulatory_audit_export(uuid, uuid, text, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.sign_regulatory_certificate(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_regulatory_certificate(uuid, uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.register_regulatory_endpoint(text, text, text, text, boolean, text, jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_regulatory_endpoint(text, text, text, text, boolean, text, jsonb, jsonb, uuid) TO service_role;
