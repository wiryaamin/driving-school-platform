-- SECURITY REMEDIATION WAVE 2C-B — REGULATORY FINANCE + PAYROLL + BANK
-- MATCHING + CREDIT/PACKAGE/COUPON AUTHORIZATION
--
-- Fixes the remaining 38 CRITICAL/HIGH finance-domain SECURITY DEFINER
-- functions deferred from Wave 2B/2C-A, across four areas: AGI/VAT/SAF-T
-- regulatory filings, payroll (runs/entries/reversal/tax remittance), bank
-- reconciliation line matching, and credit/package/coupon/order mutations.
-- Live inventory re-verified fresh for this wave — not reused from any
-- prior wave's estimate.
--
-- Same fix pattern as Waves 2A/2B/2C-A: direct p_org_id/p_organization_id
-- parameters get an early guard against public.auth_organization_id()
-- (Pattern A); entity-derived functions with no org parameter get a
-- merged not-found/wrong-org exception reusing the function's own existing
-- message right after the entity fetch (Pattern B); the one LANGUAGE sql
-- function (increment_coupon_redemptions) gets a WHERE-clause guard
-- producing a silent no-op for cross-tenant calls, matching Wave 2C-A's
-- pattern for LANGUAGE sql functions. public.is_platform_admin() and
-- public.is_trusted_service_context() (both from earlier waves, reused
-- unchanged) bypass throughout — no new authorization mechanism.
--
-- Two functions in this wave are NOT simple additions and are called out
-- individually below: emit_order_event already had an ad-hoc, INCOMPLETE
-- tenant check that silently passed for any caller with no organization_id
-- JWT claim (including anon) rather than actually rejecting it — replaced
-- with the standard pattern. complete_tax_remittance and
-- update_payroll_run_totals had no entity fetch of any kind (a bare
-- UPDATE ... WHERE id = p_x with no organization_id filter anywhere) — both
-- restructured to fetch-then-authorize-then-mutate.
--
-- Two functions (expire_stale_packages_all, expire_stale_credits) get a
-- grant-only change: both are pure global, cross-organization background
-- sweeps with no organization parameter at all (by design — they process
-- every tenant's stale records in one pass) and are confirmed, by reading
-- event-worker/index.ts directly, to have their only real caller using
-- createServiceClient() with no forwarded user JWT. There is no legitimate
-- authenticated-tenant use case for triggering a platform-wide sweep, so
-- these are restricted to service_role only (grant model A) rather than
-- given an org check that would have nothing to check against — their
-- function bodies are unchanged.
--
-- WAVE 2A LESSON reapplied: every REVOKE below explicitly includes PUBLIC,
-- anon, and authenticated together; every grant is re-verified live via
-- has_function_privilege() after applying this migration.

-- ============================================================================
-- A. REGULATORY FINANCE — AGI
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_agi_export(p_org_id uuid, p_payroll_run_id uuid, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run          record;
  v_export_id    uuid;
  v_content_hash text;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'AGI_EXPORT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_run
  FROM payroll_runs
  WHERE id = p_payroll_run_id
    AND organization_id = p_org_id
    AND status = 'posted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Posted payroll run not found: %', p_payroll_run_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotent: return existing export
  SELECT id INTO v_export_id
  FROM agi_exports
  WHERE organization_id = p_org_id AND payroll_run_id = p_payroll_run_id;
  IF FOUND THEN RETURN v_export_id; END IF;

  -- Canonical hash
  v_content_hash := encode(
    sha256((
      p_org_id::text             || '|' ||
      p_payroll_run_id::text     || '|' ||
      ROUND(v_run.total_gross, 2)::text            || '|' ||
      ROUND(v_run.total_withheld_tax, 2)::text     || '|' ||
      ROUND(v_run.total_employer_contrib, 2)::text
    )::bytea),
    'hex'
  );

  INSERT INTO agi_exports (
    organization_id,
    financial_period_id,
    payroll_run_id,
    declaration_month,
    total_gross,
    total_withheld_tax,
    total_employer_contrib,
    total_benefits,
    employee_count,
    status,
    content_hash,
    notes,
    created_by
  ) VALUES (
    p_org_id,
    v_run.financial_period_id,
    p_payroll_run_id,
    to_char(v_run.pay_period_start, 'YYYY-MM'),
    v_run.total_gross,
    v_run.total_withheld_tax,
    v_run.total_employer_contrib,
    COALESCE((
      SELECT SUM(benefits_amount) FROM payroll_entries
      WHERE payroll_run_id = p_payroll_run_id AND organization_id = p_org_id
    ), 0),
    COALESCE((
      SELECT COUNT(*) FROM payroll_entries
      WHERE payroll_run_id = p_payroll_run_id AND organization_id = p_org_id
    ), 0)::integer,
    'draft',
    v_content_hash,
    p_notes,
    p_actor_id
  ) RETURNING id INTO v_export_id;

  INSERT INTO agi_export_lines (
    organization_id, agi_export_id, payroll_entry_id,
    employee_id, gross_salary, withheld_tax, employer_contrib, benefits_amount, pension_amount
  )
  SELECT
    p_org_id, v_export_id, id,
    employee_id, gross_salary, withheld_tax, employer_contrib_amount, benefits_amount, pension_amount
  FROM payroll_entries
  WHERE payroll_run_id = p_payroll_run_id AND organization_id = p_org_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'agi_export_generated', 'agi_export', v_export_id, p_actor_id,
    jsonb_build_object('payroll_run_id', p_payroll_run_id, 'content_hash', v_content_hash));

  RETURN v_export_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_agi_submission(p_org_id uuid, p_agi_export_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_export        record;
  v_submission_id uuid;
  v_hash          text;
  v_period_start  date;
  v_period_end    date;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'AGI_SUBMISSION_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_export
  FROM agi_exports
  WHERE id = p_agi_export_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGI export not found: %', p_agi_export_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_export.status NOT IN ('finalized', 'submitted') THEN
    RAISE EXCEPTION 'AGI export must be finalized before submission (status: %)', v_export.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotent
  SELECT id INTO v_submission_id
  FROM agi_submissions
  WHERE organization_id = p_org_id
    AND agi_export_id = p_agi_export_id
    AND correction_of_id IS NULL;
  IF FOUND THEN RETURN v_submission_id; END IF;

  -- Derive period from declaration_month (format 'YYYY-MM')
  v_period_start := to_date(v_export.declaration_month || '-01', 'YYYY-MM-DD');
  v_period_end   := (v_period_start + interval '1 month - 1 day')::date;

  -- Canonical hash via centralised builder — no inline payload reconstruction
  v_hash := canonical_accounting_hash(
    build_agi_canonical_payload(
      v_export.total_gross,
      v_export.total_withheld_tax,
      v_export.total_employer_contrib
    )
  );

  INSERT INTO agi_submissions (
    organization_id, agi_export_id,
    declaration_period_start, declaration_period_end,
    submission_status, submission_hash, created_by
  ) VALUES (
    p_org_id, p_agi_export_id,
    v_period_start, v_period_end,
    'pending', v_hash, p_actor_id
  ) RETURNING id INTO v_submission_id;

  INSERT INTO agi_submission_lines (
    organization_id, submission_id, agi_export_line_id,
    employee_id, gross_salary, withheld_tax, employer_contrib, benefits_amount, pension_amount
  )
  SELECT
    p_org_id, v_submission_id, id,
    employee_id, gross_salary, withheld_tax, employer_contrib, benefits_amount, pension_amount
  FROM agi_export_lines
  WHERE agi_export_id = p_agi_export_id AND organization_id = p_org_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'agi_submission_generated', 'agi_submission', v_submission_id, p_actor_id,
    jsonb_build_object('agi_export_id', p_agi_export_id, 'hash', v_hash));

  RETURN v_submission_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.certify_agi_submission(p_org_id uuid, p_submission_id uuid, p_receipt text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub  record;
  v_hash text;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'AGI_CERTIFY_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub
  FROM agi_submissions
  WHERE id = p_submission_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGI submission not found: %', p_submission_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_sub.submission_status NOT IN ('pending', 'submitted') THEN
    RAISE EXCEPTION 'Cannot certify AGI submission in status: %', v_sub.submission_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Deterministic certification hash: no timestamps
  v_hash := generate_replay_safe_hash(
    'agi_certification',
    p_submission_id,
    jsonb_build_object(
      'submission_hash', v_sub.submission_hash,
      'receipt',         COALESCE(p_receipt, '')
    )
  );

  UPDATE agi_submissions SET
    submission_status    = 'submitted',
    skatteverket_receipt = COALESCE(p_receipt, skatteverket_receipt),
    submitted_at         = COALESCE(submitted_at, now()),
    submitted_by         = COALESCE(submitted_by, p_actor_id),
    certified_at         = now(),
    certified_by         = p_actor_id,
    certification_hash   = v_hash
  WHERE id = p_submission_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'agi_submission_certified', 'agi_submission', p_submission_id, p_actor_id,
    jsonb_build_object('certification_hash', v_hash, 'receipt', p_receipt));

  RETURN jsonb_build_object(
    'submission_id',      p_submission_id,
    'certification_hash', v_hash,
    'certified_at',       now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_agi_correction(p_org_id uuid, p_original_submission_id uuid, p_correction_reason agi_correction_reason, p_description text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_original  record;
  v_corr_id   uuid;
  v_hash      text;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'AGI_CORRECTION_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_original
  FROM agi_submissions
  WHERE id = p_original_submission_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGI submission not found: %', p_original_submission_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_original.submission_status NOT IN ('submitted', 'accepted', 'rejected') THEN
    RAISE EXCEPTION 'Can only correct submitted/accepted/rejected submissions (status: %)',
      v_original.submission_status USING ERRCODE = 'check_violation';
  END IF;

  -- Deterministic correction hash: no timestamps
  v_hash := generate_replay_safe_hash(
    'agi_correction',
    p_original_submission_id,
    jsonb_build_object(
      'correction_reason', p_correction_reason::text,
      'description',       p_description
    )
  );

  INSERT INTO agi_corrections (
    organization_id, original_submission_id,
    correction_reason, correction_description, correction_hash, created_by
  ) VALUES (
    p_org_id, p_original_submission_id,
    p_correction_reason, p_description, v_hash, p_actor_id
  ) RETURNING id INTO v_corr_id;

  UPDATE agi_submissions SET submission_status = 'corrected'
  WHERE id = p_original_submission_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'agi_correction_created', 'agi_correction', v_corr_id, p_actor_id,
    jsonb_build_object('original_submission_id', p_original_submission_id,
                       'correction_reason', p_correction_reason));

  RETURN v_corr_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lock_agi_export(p_agi_export_id uuid, p_receipt text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_export agi_exports%ROWTYPE;
BEGIN
  SELECT * INTO v_export FROM agi_exports WHERE id = p_agi_export_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGI_EXPORT_NOT_FOUND: %', p_agi_export_id USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_export.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'AGI_EXPORT_NOT_FOUND: %', p_agi_export_id USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'AGI_LOCK_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_export.status = 'submitted' THEN
    RETURN; -- Already submitted — idempotent
  END IF;

  IF v_export.status != 'finalized' THEN
    RAISE EXCEPTION 'AGI_EXPORT_NOT_FINALIZABLE: export % must be finalized before submission (status: %)',
      p_agi_export_id, v_export.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_export.content_hash IS NULL THEN
    RAISE EXCEPTION 'AGI_EXPORT_NO_HASH: export % has no content hash — regenerate the export',
      p_agi_export_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE agi_exports
  SET status                = 'submitted',
      submitted_at          = now(),
      submitted_by          = p_actor_id,
      skatteverket_receipt  = COALESCE(p_receipt, skatteverket_receipt)
  WHERE id = p_agi_export_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_agi_export_integrity(p_agi_export_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_export       agi_exports%ROWTYPE;
  v_content_data text;
  v_current_hash text;
  v_line_count   int;
BEGIN
  SELECT * INTO v_export FROM agi_exports WHERE id = p_agi_export_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AGI_EXPORT_NOT_FOUND: %', p_agi_export_id USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_export.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'AGI_EXPORT_NOT_FOUND: %', p_agi_export_id USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*), string_agg(
    employee_id::text || '|' ||
    gross_salary::text || '|' ||
    withheld_tax::text || '|' ||
    employer_contrib::text || '|' ||
    benefits_amount::text,
    chr(10) ORDER BY employee_id
  )
  INTO v_line_count, v_content_data
  FROM agi_export_lines
  WHERE agi_export_id = p_agi_export_id;

  v_current_hash := encode(digest(COALESCE(v_content_data, ''), 'sha256'), 'hex');

  RETURN jsonb_build_object(
    'agi_export_id',    p_agi_export_id,
    'status',           v_export.status,
    'declaration_month', v_export.declaration_month,
    'line_count',       v_line_count,
    'stored_hash',      v_export.content_hash,
    'current_hash',     v_current_hash,
    'matches',          v_export.content_hash = v_current_hash,
    'integrity',        CASE WHEN v_export.content_hash = v_current_hash THEN 'verified' ELSE 'tampered' END,
    'verified_at',      now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.build_regulatory_evidence_package(p_org_id uuid, p_entity_type filing_entity_type, p_entity_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cert_ids      jsonb;
  v_cert_hashes   text[];
  v_snapshot_ids  jsonb;
  v_assertion_ids jsonb;
  v_canonical     jsonb;
  v_payload_hash  text;
  v_latest_cert   record;
  v_chain_hash    text;
  v_manifest      jsonb;
  v_evidence_hash text;
  v_pkg_id        uuid;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'EVIDENCE_PACKAGE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Collect all certification IDs and their hashes (oldest-first for chain)
  SELECT
    jsonb_agg(id            ORDER BY certified_at ASC),
    array_agg(certificate_hash ORDER BY certified_at ASC)
  INTO v_cert_ids, v_cert_hashes
  FROM regulatory_certifications
  WHERE entity_type    = p_entity_type
    AND entity_id      = p_entity_id
    AND organization_id = p_org_id;

  v_cert_ids    := COALESCE(v_cert_ids,    '[]'::jsonb);
  v_cert_hashes := COALESCE(v_cert_hashes, ARRAY[]::text[]);

  -- Collect all snapshot IDs for this entity
  SELECT jsonb_agg(id ORDER BY created_at ASC)
  INTO v_snapshot_ids
  FROM certification_snapshots
  WHERE entity_type   = p_entity_type::text
    AND entity_id     = p_entity_id
    AND organization_id = p_org_id;

  v_snapshot_ids := COALESCE(v_snapshot_ids, '[]'::jsonb);

  -- Collect all assertion IDs for this entity
  SELECT jsonb_agg(id ORDER BY asserted_at ASC)
  INTO v_assertion_ids
  FROM replay_assertions
  WHERE entity_type   = p_entity_type::text
    AND entity_id     = p_entity_id
    AND organization_id = p_org_id;

  v_assertion_ids := COALESCE(v_assertion_ids, '[]'::jsonb);

  -- Build canonical payload and compute its hash
  v_canonical    := build_canonical_payload(p_entity_type::text, p_entity_id, p_org_id);
  v_payload_hash := generate_replay_safe_hash(p_entity_type::text, p_entity_id, v_canonical);

  -- Latest certification for manifest header
  SELECT * INTO v_latest_cert
  FROM regulatory_certifications
  WHERE entity_type    = p_entity_type
    AND entity_id      = p_entity_id
    AND organization_id = p_org_id
  ORDER BY certified_at DESC LIMIT 1;

  -- Sequential chain hash over all certification hashes
  v_chain_hash := generate_export_chain_hash(v_cert_hashes);

  -- Build canonical manifest (IMMUTABLE — reproducible)
  v_manifest := build_certification_manifest(
    p_entity_type::text,
    p_entity_id,
    v_payload_hash,
    COALESCE(v_latest_cert.certificate_hash,    ''),
    v_chain_hash,
    v_cert_ids,
    v_snapshot_ids,
    v_assertion_ids,
    'serialization_standards_v1',
    'replay_safe_json_v1'
  );

  -- Evidence hash: SHA-256 of canonical manifest (reproducible)
  v_evidence_hash := encode(
    sha256(canonical_jsonb(v_manifest)::text::bytea),
    'hex'
  );

  INSERT INTO regulatory_evidence_packages (
    organization_id, entity_type, entity_id,
    manifest, evidence_hash,
    certification_ids, snapshot_ids, assertion_ids,
    chain_hash, assembled_by
  ) VALUES (
    p_org_id, p_entity_type, p_entity_id,
    v_manifest, v_evidence_hash,
    v_cert_ids, v_snapshot_ids, v_assertion_ids,
    v_chain_hash, p_actor_id
  ) RETURNING id INTO v_pkg_id;

  INSERT INTO compliance_events (
    organization_id, event_type, entity_type, entity_id, actor_id, metadata
  ) VALUES (
    p_org_id, 'evidence_package_assembled', p_entity_type::text, p_entity_id, p_actor_id,
    jsonb_build_object(
      'evidence_package_id', v_pkg_id,
      'evidence_hash',       v_evidence_hash,
      'chain_hash',          v_chain_hash,
      'certification_count', jsonb_array_length(v_cert_ids)
    )
  );

  RETURN jsonb_build_object(
    'evidence_id',   v_pkg_id,
    'entity_type',   p_entity_type,
    'entity_id',     p_entity_id,
    'evidence_hash', v_evidence_hash,
    'chain_hash',    v_chain_hash,
    'manifest',      v_manifest
  );
END;
$function$;

-- ============================================================================
-- B. REGULATORY FINANCE — VAT DECLARATION / VAT PERIOD / SAF-T
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_vat_declaration(p_org_id uuid, p_vat_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period    record;
  v_decl_id   uuid;
  v_hash      text;
  v_out_25    numeric := 0;
  v_out_12    numeric := 0;
  v_out_6     numeric := 0;
  v_taxable   numeric := 0;
  v_input_vat numeric := 0;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'VAT_DECLARATION_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_period
  FROM vat_periods
  WHERE id = p_vat_period_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT period not found: %', p_vat_period_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_period.status NOT IN ('locked', 'filed') THEN
    RAISE EXCEPTION 'VAT period must be locked before generating declaration (status: %)', v_period.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Idempotent: return existing non-corrected declaration
  SELECT id INTO v_decl_id
  FROM vat_declarations
  WHERE organization_id = p_org_id
    AND vat_period_id = p_vat_period_id
    AND correction_of_id IS NULL
    AND declaration_status != 'corrected';
  IF FOUND THEN RETURN v_decl_id; END IF;

  -- Aggregate output VAT by rate from vat_report_entries
  SELECT
    COALESCE(SUM(CASE WHEN vat_rate_code = 'SE25' THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN vat_rate_code = 'SE12' THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN vat_rate_code = 'SE6'  THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN net_amount > 0 THEN net_amount ELSE 0 END), 0)
  INTO v_out_25, v_out_12, v_out_6, v_taxable
  FROM vat_report_entries
  WHERE vat_period_id = p_vat_period_id AND organization_id = p_org_id;

  v_input_vat := COALESCE(v_period.total_input_vat, 0);

  -- Canonical hash via centralised builder — no inline payload reconstruction
  v_hash := canonical_accounting_hash(
    build_vat_canonical_payload(v_taxable, v_out_25, v_out_12, v_out_6, v_input_vat)
  );

  INSERT INTO vat_declarations (
    organization_id, vat_period_id, declaration_status,
    box_05_taxable_turnover, box_10_output_vat_25, box_11_output_vat_12,
    box_12_output_vat_6, box_30_input_vat,
    declaration_hash, created_by
  ) VALUES (
    p_org_id, p_vat_period_id, 'pending',
    v_taxable, v_out_25, v_out_12, v_out_6, v_input_vat,
    v_hash, p_actor_id
  ) RETURNING id INTO v_decl_id;

  -- Declaration lines (Swedish SKV 4700 boxes)
  INSERT INTO vat_declaration_lines (organization_id, declaration_id, box_code, box_name, base_amount, vat_amount, vat_rate_code, sort_order)
  VALUES
    (p_org_id, v_decl_id, '05', 'Momspliktig omsättning',  v_taxable,   0,         NULL,   5),
    (p_org_id, v_decl_id, '10', 'Utgående moms 25%',       v_taxable,   v_out_25,  'SE25', 10),
    (p_org_id, v_decl_id, '11', 'Utgående moms 12%',       0,           v_out_12,  'SE12', 11),
    (p_org_id, v_decl_id, '12', 'Utgående moms 6%',        0,           v_out_6,   'SE6',  12),
    (p_org_id, v_decl_id, '30', 'Ingående moms att dra av', 0,          v_input_vat, NULL, 30),
    (p_org_id, v_decl_id, '49', 'Moms att betala/återfå',  0,
      v_out_25 + v_out_12 + v_out_6 - v_input_vat, NULL, 49);

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'vat_declaration_generated', 'vat_declaration', v_decl_id, p_actor_id,
    jsonb_build_object('vat_period_id', p_vat_period_id, 'hash', v_hash));

  RETURN v_decl_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.certify_vat_declaration(p_org_id uuid, p_declaration_id uuid, p_receipt text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_decl  record;
  v_hash  text;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'VAT_CERTIFY_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_decl
  FROM vat_declarations
  WHERE id = p_declaration_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT declaration not found: %', p_declaration_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_decl.declaration_status NOT IN ('pending', 'submitted') THEN
    RAISE EXCEPTION 'Cannot certify VAT declaration in status: %', v_decl.declaration_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Deterministic certification hash: no timestamps
  v_hash := generate_replay_safe_hash(
    'vat_certification',
    p_declaration_id,
    jsonb_build_object(
      'declaration_hash', v_decl.declaration_hash,
      'receipt',          COALESCE(p_receipt, '')
    )
  );

  UPDATE vat_declarations SET
    declaration_status   = 'submitted',
    skatteverket_receipt = COALESCE(p_receipt, skatteverket_receipt),
    submitted_at         = COALESCE(submitted_at, now()),
    submitted_by         = COALESCE(submitted_by, p_actor_id),
    certified_at         = now(),
    certified_by         = p_actor_id,
    certification_hash   = v_hash
  WHERE id = p_declaration_id;

  -- Mark VAT period as filed
  UPDATE vat_periods
  SET status   = 'filed',
      filed_at = now(),
      filed_by = p_actor_id
  WHERE id = v_decl.vat_period_id AND organization_id = p_org_id
    AND status IN ('locked', 'filed');

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'vat_declaration_certified', 'vat_declaration', p_declaration_id, p_actor_id,
    jsonb_build_object('certification_hash', v_hash, 'receipt', p_receipt));

  RETURN jsonb_build_object(
    'declaration_id',     p_declaration_id,
    'certification_hash', v_hash,
    'certified_at',       now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_vat_correction(p_org_id uuid, p_original_declaration_id uuid, p_correction_type vat_correction_type, p_description text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_original  record;
  v_corr_id   uuid;
  v_hash      text;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'VAT_CORRECTION_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_original
  FROM vat_declarations
  WHERE id = p_original_declaration_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT declaration not found: %', p_original_declaration_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_original.declaration_status NOT IN ('submitted', 'accepted', 'rejected') THEN
    RAISE EXCEPTION 'Can only correct submitted/accepted/rejected declarations (status: %)',
      v_original.declaration_status USING ERRCODE = 'check_violation';
  END IF;

  -- Deterministic correction hash: no timestamps
  v_hash := generate_replay_safe_hash(
    'vat_correction',
    p_original_declaration_id,
    jsonb_build_object(
      'correction_type', p_correction_type::text,
      'description',     p_description
    )
  );

  INSERT INTO vat_corrections (
    organization_id, original_declaration_id,
    correction_type, correction_description, correction_hash, created_by
  ) VALUES (
    p_org_id, p_original_declaration_id,
    p_correction_type, p_description, v_hash, p_actor_id
  ) RETURNING id INTO v_corr_id;

  UPDATE vat_declarations SET declaration_status = 'corrected'
  WHERE id = p_original_declaration_id;

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'vat_correction_created', 'vat_correction', v_corr_id, p_actor_id,
    jsonb_build_object('original_declaration_id', p_original_declaration_id,
                       'correction_type', p_correction_type));

  RETURN v_corr_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_saf_t_export(p_org_id uuid, p_period_start date, p_period_end date, p_scope saft_export_scope DEFAULT 'full'::saft_export_scope, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_export_id    uuid;
  v_content_hash text;
  v_je_count     integer := 0;
  v_tx_count     integer := 0;
  v_acc_count    integer := 0;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'SAFT_EXPORT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Count source data in period
  SELECT COUNT(*) INTO v_je_count
  FROM journal_entries
  WHERE organization_id = p_org_id
    AND entry_date BETWEEN p_period_start AND p_period_end
    AND status = 'posted';

  SELECT COUNT(*) INTO v_tx_count
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE je.organization_id = p_org_id
    AND je.entry_date BETWEEN p_period_start AND p_period_end
    AND je.status = 'posted';

  SELECT COUNT(DISTINCT jl.account_code) INTO v_acc_count
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  WHERE je.organization_id = p_org_id
    AND je.entry_date BETWEEN p_period_start AND p_period_end;

  -- Pre-generate UUID so it can be part of the replay-safe hash
  v_export_id := gen_random_uuid();

  -- Canonical hash via centralised builder — entity ID + canonical payload
  v_content_hash := generate_replay_safe_hash(
    'saf_t_export',
    v_export_id,
    build_saft_canonical_payload(
      p_org_id, p_period_start, p_period_end,
      p_scope::text, v_je_count, v_tx_count, v_acc_count
    )
  );

  INSERT INTO saf_t_exports (
    id,
    organization_id,
    period_start, period_end,
    export_scope, export_status,
    journal_entry_count, transaction_count, account_count,
    content_hash, created_by
  ) VALUES (
    v_export_id,
    p_org_id,
    p_period_start, p_period_end,
    p_scope, 'ready',
    v_je_count, v_tx_count, v_acc_count,
    v_content_hash, p_actor_id
  );

  -- Register in regulatory_export_hashes
  INSERT INTO regulatory_export_hashes (
    organization_id, export_type, export_id,
    period_start, period_end,
    hash_value, hash_input_summary, generated_by
  ) VALUES (
    p_org_id, 'saf_t', v_export_id,
    p_period_start, p_period_end,
    v_content_hash,
    'SAF-T ' || p_scope::text || ': ' || v_je_count || ' journal entries, ' || v_tx_count || ' lines',
    p_actor_id
  );

  INSERT INTO compliance_events (organization_id, event_type, entity_type, entity_id, actor_id, metadata)
  VALUES (p_org_id, 'saft_export_generated', 'saf_t_export', v_export_id, p_actor_id,
    jsonb_build_object(
      'period_start',  p_period_start,
      'period_end',    p_period_end,
      'scope',         p_scope,
      'content_hash',  v_content_hash,
      'je_count',      v_je_count
    ));

  RETURN v_export_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_vat_period(p_org_id uuid, p_period_start date, p_period_end date, p_frequency vat_period_frequency DEFAULT 'monthly'::vat_period_frequency, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period_id uuid;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'VAT_PERIOD_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'VAT_PERIOD_INVALID_DATES: period_end must be >= period_start'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM vat_periods
    WHERE organization_id = p_org_id
      AND period_start = p_period_start
      AND period_end   = p_period_end
  ) THEN
    RAISE EXCEPTION 'VAT_PERIOD_DUPLICATE: a period % to % already exists for this organization',
      p_period_start, p_period_end
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO vat_periods (organization_id, period_start, period_end, frequency)
  VALUES (p_org_id, p_period_start, p_period_end, p_frequency)
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lock_vat_period(p_period_id uuid, p_actor_id uuid, p_filing_reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period vat_periods%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM vat_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT_PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_period.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'VAT_PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'VAT_PERIOD_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_period.status NOT IN ('open', 'amended') THEN
    RAISE EXCEPTION 'VAT_PERIOD_CANNOT_LOCK: period % has status %, expected open or amended',
      p_period_id, v_period.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE vat_periods
  SET
    status            = 'locked',
    locked_at         = now(),
    locked_by         = p_actor_id,
    filing_reference  = COALESCE(p_filing_reference, filing_reference),
    filed_at          = CASE WHEN p_filing_reference IS NOT NULL THEN now() ELSE filed_at END,
    filed_by          = CASE WHEN p_filing_reference IS NOT NULL THEN p_actor_id ELSE filed_by END,
    updated_at        = now()
  WHERE id = p_period_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.populate_vat_period(p_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period    vat_periods%ROWTYPE;
  v_count     int := 0;
  v_invoice   RECORD;
BEGIN
  SELECT * INTO v_period FROM vat_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT_PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_period.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'VAT_PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'VAT_PERIOD_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_period.status <> 'open' THEN
    RAISE EXCEPTION 'VAT_PERIOD_NOT_OPEN: period % has status %, must be open to populate',
      p_period_id, v_period.status USING ERRCODE = 'P0001';
  END IF;

  -- Clear existing entries for this period before repopulating (idempotent)
  DELETE FROM vat_report_entries WHERE vat_period_id = p_period_id;

  -- Pull issued invoices within the period date range
  FOR v_invoice IN
    SELECT
      i.id            AS invoice_id,
      i.issued_at::date AS transaction_date,
      i.subtotal_amount AS net_amount,
      i.vat_amount,
      i.total_amount  AS gross_amount,
      COALESCE(acc.bas_account_debit_id::text, '1510') AS bas_account,
      COALESCE(acc.vat_rate_code, 'SE25') AS vat_rate_code
    FROM invoices i
    LEFT JOIN accounting_chart_of_accounts acc
      ON acc.organization_id = i.organization_id
     AND acc.event_type = 'Invoice.Issued'
    WHERE i.organization_id = v_period.organization_id
      AND i.status IN ('issued','paid','partially_paid','overdue')
      AND i.issued_at::date BETWEEN v_period.period_start AND v_period.period_end
  LOOP
    INSERT INTO vat_report_entries (
      organization_id,
      vat_period_id,
      invoice_id,
      transaction_date,
      vat_rate_code,
      net_amount,
      vat_amount,
      gross_amount,
      bas_account,
      source_type,
      source_id,
      description
    ) VALUES (
      v_period.organization_id,
      p_period_id,
      v_invoice.invoice_id,
      v_invoice.transaction_date,
      v_invoice.vat_rate_code,
      v_invoice.net_amount,
      v_invoice.vat_amount,
      v_invoice.gross_amount,
      v_invoice.bas_account,
      'invoice',
      v_invoice.invoice_id,
      'Faktura utfärdad'
    );
    v_count := v_count + 1;
  END LOOP;

  -- Update summary totals
  UPDATE vat_periods
  SET
    total_output_vat = (SELECT COALESCE(SUM(vat_amount), 0) FROM vat_report_entries WHERE vat_period_id = p_period_id AND source_type = 'invoice'),
    total_input_vat  = (SELECT COALESCE(SUM(vat_amount), 0) FROM vat_report_entries WHERE vat_period_id = p_period_id AND source_type = 'adjustment'),
    net_vat_payable  = (SELECT COALESCE(SUM(vat_amount), 0) FROM vat_report_entries WHERE vat_period_id = p_period_id AND source_type = 'invoice')
                     - (SELECT COALESCE(SUM(vat_amount), 0) FROM vat_report_entries WHERE vat_period_id = p_period_id AND source_type = 'adjustment'),
    updated_at       = now()
  WHERE id = p_period_id;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_vat_period(p_vat_period_id uuid, p_financial_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fp              financial_periods%ROWTYPE;
  v_vat             vat_periods%ROWTYPE;
  v_ledger_balance  numeric(14,2) := 0;
  v_vat_total       numeric(14,2) := 0;
  v_variance        numeric(14,2);
  v_is_reconciled   boolean;
  v_run_id          uuid;
BEGIN
  SELECT * INTO v_fp FROM financial_periods WHERE id = p_financial_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_financial_period_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_vat FROM vat_periods WHERE id = p_vat_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT_PERIOD_NOT_FOUND: VAT period % not found', p_vat_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_vat.organization_id <> v_fp.organization_id THEN
    RAISE EXCEPTION 'VAT_RECON_ORG_MISMATCH: VAT period and financial period belong to different organizations'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_fp.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_financial_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'VAT_RECONCILIATION_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Account 2610 (Utgående moms 25%) — credit-normal, so closing_balance is negative
  -- ABS(closing_balance) = total output VAT in ledger
  SELECT COALESCE(ABS(closing_balance), 0) INTO v_ledger_balance
  FROM account_balances
  WHERE financial_period_id = p_financial_period_id
    AND account_code = '2610'
  LIMIT 1;

  v_vat_total     := COALESCE(v_vat.total_output_vat, 0);
  v_variance      := v_ledger_balance - v_vat_total;
  v_is_reconciled := ABS(v_variance) < 0.01;

  INSERT INTO reconciliation_runs (
    organization_id, financial_period_id, reconciliation_type, status,
    total_items, matched_items, unmatched_items, exception_items,
    is_reconciled, variance_amount, completed_at, actor_id,
    result_summary
  ) VALUES (
    v_fp.organization_id, p_financial_period_id, 'vat',
    CASE WHEN v_is_reconciled THEN 'completed' ELSE 'needs_review' END,
    1, CASE WHEN v_is_reconciled THEN 1 ELSE 0 END,
    CASE WHEN v_is_reconciled THEN 0 ELSE 1 END, 0,
    v_is_reconciled, v_variance, now(), p_actor_id,
    jsonb_build_object(
      'ledger_account',     '2610',
      'ledger_vat_balance', v_ledger_balance,
      'vat_period_total',   v_vat_total,
      'vat_period_status',  v_vat.status,
      'variance',           v_variance,
      'is_reconciled',      v_is_reconciled
    )
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_vat_clearing_run(p_org_id uuid, p_financial_period_id uuid, p_vat_period_id uuid DEFAULT NULL::uuid, p_run_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id        uuid;
  v_o25           numeric(12,2) := 0;
  v_o12           numeric(12,2) := 0;
  v_o6            numeric(12,2) := 0;
  v_input         numeric(12,2) := 0;
  v_total_out     numeric(12,2);
  v_net           numeric(12,2);
  v_bal           record;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'VAT_CLEARING_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF p_financial_period_id IS NULL THEN
    RAISE EXCEPTION 'VAT_CLEARING_PERIOD_REQUIRED: financial_period_id is required' USING ERRCODE = 'P0001';
  END IF;

  -- Read current closing balances for VAT accounts
  FOR v_bal IN
    SELECT account_code, closing_balance
    FROM   account_balances
    WHERE  organization_id     = p_org_id
      AND  financial_period_id = p_financial_period_id
      AND  account_code        IN ('2610', '2612', '2621', '2640')
  LOOP
    CASE v_bal.account_code
      WHEN '2610' THEN v_o25   := ABS(LEAST(v_bal.closing_balance, 0));
      WHEN '2612' THEN v_o12   := ABS(LEAST(v_bal.closing_balance, 0));
      WHEN '2621' THEN v_o6    := ABS(LEAST(v_bal.closing_balance, 0));
      WHEN '2640' THEN v_input := GREATEST(v_bal.closing_balance, 0);
    END CASE;
  END LOOP;

  v_total_out := v_o25 + v_o12 + v_o6;
  v_net       := v_total_out - v_input;

  IF v_total_out = 0 AND v_input = 0 THEN
    RAISE EXCEPTION 'VAT_CLEARING_NOTHING_TO_CLEAR: no VAT balances found for period %', p_financial_period_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO vat_clearing_runs (
    organization_id, vat_period_id, financial_period_id, run_date,
    output_vat_25, output_vat_12, output_vat_6, total_output_vat,
    total_input_vat, net_vat_payable, notes, created_by
  ) VALUES (
    p_org_id, p_vat_period_id, p_financial_period_id, COALESCE(p_run_date, CURRENT_DATE),
    v_o25, v_o12, v_o6, v_total_out,
    v_input, v_net, p_notes, p_actor_id
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

-- ============================================================================
-- C. PAYROLL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_payroll_run(p_org_id uuid, p_financial_period_id uuid DEFAULT NULL::uuid, p_pay_period_start date DEFAULT NULL::date, p_pay_period_end date DEFAULT NULL::date, p_pay_date date DEFAULT NULL::date, p_run_type payroll_run_type DEFAULT 'regular'::payroll_run_type, p_correction_of_run_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id uuid;
  v_start  date;
  v_end    date;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PAYROLL_RUN_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  v_start := COALESCE(p_pay_period_start, date_trunc('month', CURRENT_DATE)::date);
  v_end   := COALESCE(p_pay_period_end,   (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date);

  IF v_end < v_start THEN
    RAISE EXCEPTION 'PAYROLL_INVALID_DATES: pay_period_end (%) must not be before pay_period_start (%)',
      v_end, v_start
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate correction_of_run_id is posted if provided
  IF p_correction_of_run_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM payroll_runs
      WHERE id = p_correction_of_run_id AND organization_id = p_org_id AND status = 'posted'
    ) THEN
      RAISE EXCEPTION 'PAYROLL_CORRECTION_TARGET_INVALID: correction_of_run_id % must reference a posted run',
        p_correction_of_run_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO payroll_runs (
    organization_id, financial_period_id, run_type,
    pay_period_start, pay_period_end, pay_date,
    correction_of_run_id, notes, created_by
  ) VALUES (
    p_org_id, p_financial_period_id, p_run_type,
    v_start, v_end, p_pay_date,
    p_correction_of_run_id, p_notes, p_actor_id
  ) RETURNING id INTO v_run_id;

  RETURN v_run_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_payroll_entry(p_run_id uuid, p_employee_id uuid, p_gross_salary numeric, p_withheld_tax numeric DEFAULT 0, p_employer_contrib_rate numeric DEFAULT 0.3142, p_pension_amount numeric DEFAULT 0, p_benefits_amount numeric DEFAULT 0, p_instructor_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run           payroll_runs%ROWTYPE;
  v_entry_id      uuid;
  v_contrib       numeric(12,2);
  v_net_pay       numeric(12,2);
BEGIN
  -- 1. Validate run state
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_run.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PAYROLL_ENTRY_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_run.status NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_EDITABLE: run % is % — only draft/ready runs can be modified',
      p_run_id, v_run.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Validate amounts
  IF p_gross_salary <= 0 THEN
    RAISE EXCEPTION 'PAYROLL_INVALID_GROSS: gross_salary must be > 0' USING ERRCODE = 'P0001';
  END IF;
  IF p_withheld_tax < 0 OR p_withheld_tax > p_gross_salary THEN
    RAISE EXCEPTION 'PAYROLL_INVALID_TAX: withheld_tax must be >= 0 and <= gross_salary' USING ERRCODE = 'P0001';
  END IF;
  IF p_employer_contrib_rate < 0 OR p_employer_contrib_rate >= 1 THEN
    RAISE EXCEPTION 'PAYROLL_INVALID_RATE: employer_contrib_rate must be in [0, 1)' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Derive computed fields
  v_contrib := ROUND(p_gross_salary * p_employer_contrib_rate, 2);
  v_net_pay := p_gross_salary - p_withheld_tax;

  -- 4. Insert or update (upsert on employee for same run)
  INSERT INTO payroll_entries (
    organization_id, payroll_run_id, employee_id, instructor_id,
    gross_salary, withheld_tax, employer_contrib_rate, employer_contrib_amount,
    pension_amount, benefits_amount, net_pay, notes, created_by
  ) VALUES (
    v_run.organization_id, p_run_id, p_employee_id, p_instructor_id,
    p_gross_salary, p_withheld_tax, p_employer_contrib_rate, v_contrib,
    p_pension_amount, p_benefits_amount, v_net_pay, p_notes, p_actor_id
  )
  ON CONFLICT (payroll_run_id, employee_id) DO UPDATE
    SET gross_salary           = EXCLUDED.gross_salary,
        withheld_tax           = EXCLUDED.withheld_tax,
        employer_contrib_rate  = EXCLUDED.employer_contrib_rate,
        employer_contrib_amount = EXCLUDED.employer_contrib_amount,
        pension_amount         = EXCLUDED.pension_amount,
        benefits_amount        = EXCLUDED.benefits_amount,
        net_pay                = EXCLUDED.net_pay,
        notes                  = EXCLUDED.notes
  RETURNING id INTO v_entry_id;

  -- 5. Recalculate run aggregates
  PERFORM public.update_payroll_run_totals(p_run_id);

  RETURN v_entry_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_payroll_run(p_run_id uuid, p_reason text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run              payroll_runs%ROWTYPE;
  v_orig_entry_id    uuid;
  v_reversal_id      uuid;
  v_reversal_lines   jsonb := '[]'::jsonb;
  v_line             record;
  v_reversal_date    date;
  v_period_id        uuid;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'PAYROLL_REVERSE_REASON_REQUIRED: a reason is required to reverse a payroll run'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_run.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PAYROLL_REVERSE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_run.status != 'posted' THEN
    RAISE EXCEPTION 'PAYROLL_NOT_REVERSIBLE: run % must be posted to reverse (status: %)',
      p_run_id, v_run.status
      USING ERRCODE = 'P0001';
  END IF;

  v_orig_entry_id := v_run.journal_entry_id;

  -- Idempotency: check if reversal already exists
  SELECT id INTO v_reversal_id
  FROM   journal_entries
  WHERE  reversal_of_entry_id = v_orig_entry_id
    AND  status = 'posted'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_reversal_id;
  END IF;

  -- Build reversal lines: swap debit/credit of each original line
  FOR v_line IN
    SELECT account_code, debit_amount, credit_amount, vat_rate_code, vat_amount, description
    FROM   journal_lines
    WHERE  entry_id = v_orig_entry_id
    ORDER  BY line_number
  LOOP
    v_reversal_lines := v_reversal_lines || jsonb_build_object(
      'account_code',  v_line.account_code,
      'debit_amount',  v_line.credit_amount,   -- swapped
      'credit_amount', v_line.debit_amount,    -- swapped
      'description',   'Reversal: ' || v_line.description,
      'vat_rate_code', v_line.vat_rate_code,
      'vat_amount',    v_line.vat_amount
    );
  END LOOP;

  v_reversal_date := CURRENT_DATE;
  v_period_id     := public.find_period_for_date(v_run.organization_id, v_reversal_date);

  v_reversal_id := public.post_journal_entry(
    p_org_id               := v_run.organization_id,
    p_period_id            := COALESCE(v_period_id, v_run.financial_period_id),
    p_entry_type           := 'reversal',
    p_entry_date           := v_reversal_date,
    p_description          := 'Reversering löner ' || to_char(v_run.pay_period_start, 'YYYY-MM') || ': ' || p_reason,
    p_lines                := v_reversal_lines,
    p_source_event_type    := 'Payroll.Reversed',
    p_source_entity_type   := 'payroll_run',
    p_source_entity_id     := p_run_id,
    p_voucher_series       := 'L',
    p_reversal_of_entry_id := v_orig_entry_id,
    p_actor_id             := p_actor_id
  );

  -- Mark original run as reversed
  UPDATE payroll_runs SET status = 'reversed' WHERE id = p_run_id;

  RETURN v_reversal_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_payroll_run_totals(p_run_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PAYROLL_RUN_NOT_FOUND: %', p_run_id USING ERRCODE = 'P0001';
  END IF;

  UPDATE payroll_runs
  SET total_gross            = (SELECT COALESCE(sum(gross_salary),            0) FROM payroll_entries WHERE payroll_run_id = p_run_id),
      total_withheld_tax     = (SELECT COALESCE(sum(withheld_tax),             0) FROM payroll_entries WHERE payroll_run_id = p_run_id),
      total_employer_contrib = (SELECT COALESCE(sum(employer_contrib_amount), 0) FROM payroll_entries WHERE payroll_run_id = p_run_id),
      total_net_pay          = (SELECT COALESCE(sum(net_pay),                  0) FROM payroll_entries WHERE payroll_run_id = p_run_id),
      entry_count            = (SELECT count(*)                                   FROM payroll_entries WHERE payroll_run_id = p_run_id)
  WHERE id = p_run_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_tax_remittance(p_org_id uuid, p_financial_period_id uuid DEFAULT NULL::uuid, p_payroll_run_id uuid DEFAULT NULL::uuid, p_declaration_start date DEFAULT NULL::date, p_declaration_end date DEFAULT NULL::date, p_due_date date DEFAULT NULL::date, p_withheld_tax_amount numeric DEFAULT 0, p_employer_contrib_amount numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id      uuid;
  v_total   numeric(12,2);
  v_start   date;
  v_end     date;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  v_start := COALESCE(p_declaration_start, date_trunc('month', CURRENT_DATE)::date);
  v_end   := COALESCE(p_declaration_end,   (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date);
  v_total := COALESCE(p_withheld_tax_amount, 0) + COALESCE(p_employer_contrib_amount, 0);

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_ZERO: total remittance amount must be > 0' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO tax_remittances (
    organization_id, financial_period_id, payroll_run_id,
    declaration_period_start, declaration_period_end, due_date,
    withheld_tax_amount, employer_contrib_amount, total_amount,
    notes, created_by
  ) VALUES (
    p_org_id, p_financial_period_id, p_payroll_run_id,
    v_start, v_end, p_due_date,
    COALESCE(p_withheld_tax_amount, 0), COALESCE(p_employer_contrib_amount, 0), v_total,
    p_notes, p_actor_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_tax_remittance(p_remittance_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rem tax_remittances%ROWTYPE;
BEGIN
  SELECT * INTO v_rem FROM tax_remittances WHERE id = p_remittance_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_CANNOT_COMPLETE: remittance % must be in payment_posted status',
      p_remittance_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_rem.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_CANNOT_COMPLETE: remittance % must be in payment_posted status',
      p_remittance_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_COMPLETE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  UPDATE tax_remittances
  SET status = 'completed'
  WHERE id     = p_remittance_id
    AND status = 'payment_posted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAX_REMITTANCE_CANNOT_COMPLETE: remittance % must be in payment_posted status',
      p_remittance_id
      USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

-- ============================================================================
-- D. BANK RECONCILIATION — LINE MATCHING DETAIL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_match_bank_lines(p_import_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_import      bank_statement_imports%ROWTYPE;
  v_line        bank_statement_lines%ROWTYPE;
  v_payment_id  uuid;
  v_match_count int := 0;
BEGIN
  SELECT * INTO v_import FROM bank_statement_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_RECON_NOT_FOUND: bank_statement_import % not found', p_import_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_import.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'BANK_RECON_NOT_FOUND: bank_statement_import % not found', p_import_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'BANK_MATCH_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_import.status = 'confirmed' THEN
    RAISE EXCEPTION 'BANK_RECON_CONFIRMED: import % is already confirmed; cannot re-match', p_import_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE bank_statement_imports
  SET status = 'reconciling', updated_at = now()
  WHERE id = p_import_id;

  FOR v_line IN
    SELECT * FROM bank_statement_lines
    WHERE import_id = p_import_id
      AND status = 'unmatched'
      AND amount > 0
    ORDER BY transaction_date, line_number
  LOOP
    -- Find exactly one matching confirmed payment not already linked
    SELECT p.id INTO v_payment_id
    FROM payments p
    WHERE p.organization_id = v_import.organization_id
      AND p.status = 'confirmed'
      AND p.amount = v_line.amount
      AND p.paid_at::date BETWEEN v_line.transaction_date - 5 AND v_line.transaction_date + 5
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement_lines bsl2
        WHERE bsl2.payment_id = p.id
          AND bsl2.status IN ('matched', 'confirmed')
          AND bsl2.id <> v_line.id
      )
    ORDER BY ABS(p.paid_at::date - v_line.transaction_date)
    LIMIT 2;  -- fetch up to 2 to detect ambiguous matches

    -- Only auto-match if exactly 1 result (LIMIT 2 lets us detect duplicates via count)
    IF FOUND THEN
      -- v_payment_id is set; check there's only one by trying a second fetch
      DECLARE
        v_second_payment_id uuid;
      BEGIN
        SELECT p.id INTO v_second_payment_id
        FROM payments p
        WHERE p.organization_id = v_import.organization_id
          AND p.status = 'confirmed'
          AND p.amount = v_line.amount
          AND p.paid_at::date BETWEEN v_line.transaction_date - 5 AND v_line.transaction_date + 5
          AND NOT EXISTS (
            SELECT 1 FROM bank_statement_lines bsl2
            WHERE bsl2.payment_id = p.id
              AND bsl2.status IN ('matched', 'confirmed')
              AND bsl2.id <> v_line.id
          )
          AND p.id <> v_payment_id;

        IF NOT FOUND THEN
          -- Exactly one match — auto-match
          UPDATE bank_statement_lines
          SET status       = 'matched',
              payment_id   = v_payment_id,
              match_method = 'automatic',
              matched_at   = now(),
              matched_by   = p_actor_id,
              updated_at   = now()
          WHERE id = v_line.id;
          v_match_count := v_match_count + 1;
        END IF;
      END;
    END IF;
  END LOOP;

  RETURN v_match_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.manual_match_bank_line(p_line_id uuid, p_payment_id uuid, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_line    bank_statement_lines%ROWTYPE;
  v_payment payments%ROWTYPE;
BEGIN
  SELECT * INTO v_line FROM bank_statement_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_RECON_LINE_NOT_FOUND: bank statement line % not found', p_line_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_line.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'BANK_RECON_LINE_NOT_FOUND: bank statement line % not found', p_line_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'BANK_MATCH_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_line.status = 'confirmed' THEN
    RAISE EXCEPTION 'BANK_RECON_LINE_CONFIRMED: line % is already confirmed; cannot re-match', p_line_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_RECON_PAYMENT_NOT_FOUND: payment % not found', p_payment_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_payment.organization_id <> v_line.organization_id THEN
    RAISE EXCEPTION 'BANK_RECON_ORG_MISMATCH: payment % belongs to a different organization', p_payment_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE bank_statement_lines
  SET status       = 'matched',
      payment_id   = p_payment_id,
      match_method = 'manual',
      match_notes  = p_notes,
      matched_at   = now(),
      matched_by   = p_actor_id,
      updated_at   = now()
  WHERE id = p_line_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unmatch_bank_line(p_line_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_line bank_statement_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_line FROM bank_statement_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_RECON_LINE_NOT_FOUND: bank statement line % not found', p_line_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_line.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'BANK_RECON_LINE_NOT_FOUND: bank statement line % not found', p_line_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'BANK_MATCH_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  IF v_line.status = 'confirmed' THEN
    RAISE EXCEPTION 'BANK_RECON_LINE_CONFIRMED: confirmed line % cannot be unmatched', p_line_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE bank_statement_lines
  SET status       = 'unmatched',
      payment_id   = NULL,
      match_method = NULL,
      match_notes  = NULL,
      matched_at   = NULL,
      matched_by   = NULL,
      updated_at   = now()
  WHERE id = p_line_id;
END;
$function$;

-- ============================================================================
-- E. CREDIT / PACKAGE / COUPON / ORDER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consume_credit(p_org_id uuid, p_student_id uuid, p_booking_id uuid, p_category lesson_category, p_quantity integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance    int;
  v_currency   text;
  v_grant_id   uuid;
  v_ledger_id  uuid;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;

  -- 1. Advisory transaction lock: one consumer per (org, student) at a time
  PERFORM pg_advisory_xact_lock(
    hashtext(p_org_id::text),
    hashtext(p_student_id::text)
  );

  -- 2. Period lock guard (Phase 4B addition)
  PERFORM assert_period_not_locked(p_org_id, now()::date);

  -- 3. Read balance from cache with FOR UPDATE (ensures fresh read after lock)
  SELECT balance, 'SEK'
  INTO   v_balance, v_currency
  FROM   credit_balance_cache
  WHERE  organization_id = p_org_id
    AND  student_id      = p_student_id
    AND  lesson_category = p_category
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: student % has % credits for %, needs %',
      p_student_id,
      COALESCE(v_balance, 0),
      p_category,
      p_quantity
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Find earliest-expiring grant with remaining balance (FIFO)
  WITH grant_remainders AS (
    SELECT
      g.id,
      g.expires_at,
      g.quantity + COALESCE(SUM(c.quantity), 0) AS remaining
    FROM   credit_ledger g
    LEFT   JOIN credit_ledger c
      ON   c.grant_entry_id = g.id
      AND  c.entry_type IN ('consume', 'expire', 'adjust', 'reverse')
    WHERE  g.organization_id = p_org_id
      AND  g.student_id      = p_student_id
      AND  g.lesson_category = p_category
      AND  g.entry_type      = 'grant'
      AND  (g.expires_at IS NULL OR g.expires_at > now())
    GROUP  BY g.id, g.quantity, g.expires_at
    ORDER  BY g.expires_at ASC NULLS LAST
  )
  SELECT id
  INTO   v_grant_id
  FROM   grant_remainders
  WHERE  remaining >= p_quantity
  LIMIT  1;

  IF v_grant_id IS NULL THEN
    RAISE EXCEPTION 'NO_VALID_GRANT: no single non-expired grant has >= % credits for student % category %',
      p_quantity, p_student_id, p_category
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Insert consume entry (trigger updates credit_balance_cache automatically)
  INSERT INTO credit_ledger (
    organization_id, student_id, lesson_category,
    entry_type, quantity, currency,
    booking_id, grant_entry_id,
    reference_type, reference_id,
    description
  ) VALUES (
    p_org_id, p_student_id, p_category,
    'consume', -p_quantity, COALESCE(v_currency, 'SEK'),
    p_booking_id, v_grant_id,
    'booking', p_booking_id,
    'Lesson completed: booking ' || p_booking_id::text
  ) RETURNING id INTO v_ledger_id;

  -- 6. Publish Credit.Consumed
  PERFORM insert_outbox_event(
    'Credit.Consumed',
    'accounting',
    jsonb_build_object(
      'ledger_id',       v_ledger_id,
      'student_id',      p_student_id,
      'lesson_category', p_category,
      'quantity',        -p_quantity,
      'booking_id',      p_booking_id,
      'grant_entry_id',  v_grant_id
    ),
    p_org_id,
    p_student_id::text
  );

  RETURN v_ledger_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_lesson_credit(p_assignment_id uuid, p_organization_id uuid, p_booking_id uuid DEFAULT NULL::uuid, p_lesson_category text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid, p_actor_email text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asgn     RECORD;
  v_new_used int;
  v_completed boolean;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_organization_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'CREDIT_CONSUME_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO   v_asgn
  FROM   public.student_package_assignments
  WHERE  id              = p_assignment_id
    AND  organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package assignment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_asgn.status != 'active' THEN
    RAISE EXCEPTION 'Package is % — only active packages can consume credits', v_asgn.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_asgn.expires_at IS NOT NULL AND v_asgn.expires_at < now() THEN
    RAISE EXCEPTION 'Package has expired — credits cannot be consumed after expiry'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_asgn.lessons_used >= v_asgn.package_quantity THEN
    RAISE EXCEPTION 'No remaining credits in package'
      USING ERRCODE = 'P0001';
  END IF;

  v_new_used  := v_asgn.lessons_used + 1;
  v_completed := v_new_used >= v_asgn.package_quantity;

  UPDATE public.student_package_assignments
  SET    lessons_used = v_new_used,
         status       = CASE WHEN v_completed THEN 'completed' ELSE status END,
         updated_at   = now()
  WHERE  id = p_assignment_id;

  -- credit_ledger_update_cache trigger keeps credit_balance_cache in sync.
  INSERT INTO public.credit_ledger (
    organization_id, student_id, lesson_category,
    entry_type, quantity, currency,
    booking_id,
    reference_type, reference_id,
    description, actor_id
  ) VALUES (
    p_organization_id, v_asgn.student_id, v_asgn.lesson_category::public.lesson_category,
    'consume', -1, 'SEK',
    p_booking_id,
    'student_package_assignment', p_assignment_id,
    'Lesson credit consumed', p_actor_id
  );

  INSERT INTO public.package_consumption_events (
    organization_id, assignment_id, student_id, event_type,
    booking_id, credits_delta, lessons_used_after,
    actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, p_assignment_id, v_asgn.student_id, 'credit_consumed',
    p_booking_id, 1, v_new_used,
    p_actor_id, p_actor_email,
    p_metadata || CASE
      WHEN p_lesson_category IS NOT NULL
      THEN jsonb_build_object('lesson_category', p_lesson_category)
      ELSE '{}'::jsonb
    END
  );

  IF v_completed THEN
    INSERT INTO public.package_consumption_events (
      organization_id, assignment_id, student_id, event_type,
      credits_delta, lessons_used_after, actor_id, actor_email, metadata
    ) VALUES (
      p_organization_id, p_assignment_id, v_asgn.student_id, 'package_completed',
      0, v_new_used, p_actor_id, p_actor_email, '{}'
    );
  END IF;

  RETURN jsonb_build_object(
    'assignment_id',     p_assignment_id,
    'student_id',        v_asgn.student_id,
    'lessons_used',      v_new_used,
    'lessons_remaining', v_asgn.package_quantity - v_new_used,
    'package_completed', v_completed,
    'status',            CASE WHEN v_completed THEN 'completed' ELSE v_asgn.status END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_lesson_credit(p_assignment_id uuid, p_organization_id uuid, p_reversal_type text, p_reason text, p_booking_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asgn        RECORD;
  v_new_used    int;
  v_reversal_id uuid;
  v_reactivated boolean;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_organization_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'CREDIT_REVERSE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO   v_asgn
  FROM   public.student_package_assignments
  WHERE  id              = p_assignment_id
    AND  organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package assignment not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_asgn.status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'Cannot reverse credits on a % package', v_asgn.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_asgn.lessons_used <= 0 THEN
    RAISE EXCEPTION 'No consumed credits to reverse'
      USING ERRCODE = 'P0001';
  END IF;

  v_new_used    := v_asgn.lessons_used - 1;
  v_reactivated := v_asgn.status = 'completed';

  INSERT INTO public.package_credit_reversals (
    organization_id, assignment_id, student_id, booking_id,
    reversal_type, reason, credits_restored, reversed_by
  ) VALUES (
    p_organization_id, p_assignment_id, v_asgn.student_id, p_booking_id,
    p_reversal_type, p_reason, 1, p_actor_id
  )
  RETURNING id INTO v_reversal_id;

  UPDATE public.student_package_assignments
  SET    lessons_used = v_new_used,
         status       = CASE WHEN v_reactivated THEN 'active' ELSE status END,
         updated_at   = now()
  WHERE  id = p_assignment_id;

  -- Symmetric to consume_lesson_credit's ledger entry, so the ledger stays
  -- balanced (a consume + its reversal always nets to zero).
  INSERT INTO public.credit_ledger (
    organization_id, student_id, lesson_category,
    entry_type, quantity, currency,
    booking_id,
    reference_type, reference_id,
    description, actor_id
  ) VALUES (
    p_organization_id, v_asgn.student_id, v_asgn.lesson_category::public.lesson_category,
    'reverse', 1, 'SEK',
    p_booking_id,
    'package_credit_reversal', v_reversal_id,
    'Lesson credit reversed: ' || p_reason, p_actor_id
  );

  INSERT INTO public.package_consumption_events (
    organization_id, assignment_id, student_id, event_type,
    booking_id, reversal_id, credits_delta, lessons_used_after,
    actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, p_assignment_id, v_asgn.student_id, 'credit_reversed',
    p_booking_id, v_reversal_id, -1, v_new_used,
    p_actor_id, p_actor_email,
    jsonb_build_object('reversal_type', p_reversal_type, 'reason', p_reason)
  );

  IF v_reactivated THEN
    INSERT INTO public.package_consumption_events (
      organization_id, assignment_id, student_id, event_type,
      credits_delta, lessons_used_after, actor_id, actor_email, metadata
    ) VALUES (
      p_organization_id, p_assignment_id, v_asgn.student_id, 'package_reactivated',
      0, v_new_used, p_actor_id, p_actor_email, '{}'
    );
  END IF;

  RETURN jsonb_build_object(
    'assignment_id',     p_assignment_id,
    'reversal_id',       v_reversal_id,
    'lessons_used',      v_new_used,
    'lessons_remaining', v_asgn.package_quantity - v_new_used,
    'reactivated',       v_reactivated,
    'status',            CASE WHEN v_reactivated THEN 'active' ELSE v_asgn.status END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_package(p_org_id uuid, p_student_id uuid, p_offering_id uuid, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offering       package_offerings%ROWTYPE;
  v_package_id     uuid;
  v_invoice_id     uuid;
  v_ledger_id      uuid;
  v_expires_at     timestamptz;
  v_vat_amount     numeric(12,2);
  v_line_total     numeric(12,2);
  v_total_amount   numeric(12,2);
  v_bundle_item    jsonb;
  v_bundle_cat     text;
  v_bundle_qty     int;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PACKAGE_PURCHASE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Period lock guard (Phase 4B addition)
  PERFORM assert_period_not_locked(p_org_id, now()::date);

  -- 1. Lock offering (FOR SHARE allows concurrent readers; blocks concurrent writers)
  SELECT * INTO v_offering
  FROM   package_offerings
  WHERE  id              = p_offering_id
    AND  organization_id = p_org_id
    AND  status          = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OFFERING_NOT_FOUND: offering % not found or not active in org %',
      p_offering_id, p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Calculate expiry date
  v_expires_at := CASE
    WHEN v_offering.validity_days IS NOT NULL
    THEN now() + make_interval(days := v_offering.validity_days)
    ELSE NULL
  END;

  -- 3. Create student_package
  INSERT INTO student_packages (
    organization_id, student_id, offering_id,
    quantity_granted, price_paid, currency, vat_rate,
    purchased_at, activated_at, expires_at, created_by
  ) VALUES (
    p_org_id, p_student_id, p_offering_id,
    v_offering.quantity, v_offering.price, v_offering.currency, v_offering.vat_rate,
    now(), now(), v_expires_at, p_actor_id
  ) RETURNING id INTO v_package_id;

  -- 4. Calculate invoice amounts (VAT-inclusive total)
  v_line_total   := v_offering.price;
  v_vat_amount   := v_line_total * v_offering.vat_rate;
  v_total_amount := v_line_total + v_vat_amount;

  -- 4b. Mirror this purchase into student_package_assignments
  INSERT INTO student_package_assignments (
    organization_id, student_id, enrollment_id, package_offering_id,
    package_name, package_code, lesson_category, package_quantity,
    campaign_id, campaign_name, coupon_id, coupon_code,
    base_price, vat_rate, campaign_discount, coupon_discount,
    final_price, final_price_incl_vat, currency,
    lessons_used, status, expires_at,
    assigned_at, assigned_by
  ) VALUES (
    p_org_id, p_student_id, NULL, p_offering_id,
    v_offering.name, v_offering.package_code, v_offering.lesson_category, v_offering.quantity,
    NULL, NULL, NULL, NULL,
    v_line_total, v_offering.vat_rate, 0, 0,
    v_line_total, v_total_amount, v_offering.currency,
    0, 'active', v_expires_at,
    now(), p_actor_id
  );

  -- 5. Create draft invoice with pre-computed totals
  INSERT INTO invoices (
    organization_id, student_id, student_package_id,
    currency,
    subtotal_amount, vat_amount, total_amount, outstanding_amount,
    created_by
  ) VALUES (
    p_org_id, p_student_id, v_package_id,
    v_offering.currency,
    v_line_total, v_vat_amount, v_total_amount, v_total_amount,
    p_actor_id
  ) RETURNING id INTO v_invoice_id;

  -- 6. Create invoice line item
  INSERT INTO invoice_line_items (
    organization_id, invoice_id, student_package_id,
    line_type, description, quantity,
    unit_price, vat_rate, vat_amount, line_total
  ) VALUES (
    p_org_id, v_invoice_id, v_package_id,
    'package', v_offering.name, 1,
    v_offering.price,
    v_offering.vat_rate,
    v_vat_amount,
    v_line_total
  );

  -- 7. Create credit_ledger grant for primary category
  INSERT INTO credit_ledger (
    organization_id, student_id, lesson_category,
    entry_type, quantity, currency,
    student_package_id, grant_entry_id,
    reference_type, reference_id,
    description, actor_id, expires_at
  ) VALUES (
    p_org_id, p_student_id, v_offering.lesson_category,
    'grant', v_offering.quantity, v_offering.currency,
    v_package_id, NULL,
    'student_package', v_package_id,
    'Package purchase: ' || v_offering.name,
    p_actor_id, v_expires_at
  ) RETURNING id INTO v_ledger_id;

  PERFORM insert_outbox_event(
    'Credit.Granted',
    'accounting',
    jsonb_build_object(
      'ledger_id',          v_ledger_id,
      'student_id',         p_student_id,
      'lesson_category',    v_offering.lesson_category,
      'quantity',           v_offering.quantity,
      'expires_at',         v_expires_at,
      'student_package_id', v_package_id
    ),
    p_org_id,
    p_student_id::text
  );

  -- 8. Create additional credit_ledger grants for bundle categories
  IF v_offering.bundle_credits IS NOT NULL
    AND jsonb_array_length(v_offering.bundle_credits) > 0
  THEN
    FOR v_bundle_item IN
      SELECT value FROM jsonb_array_elements(v_offering.bundle_credits)
    LOOP
      v_bundle_cat := v_bundle_item->>'lesson_category';
      v_bundle_qty := (v_bundle_item->>'quantity')::int;

      CONTINUE WHEN v_bundle_cat IS NULL OR v_bundle_qty <= 0;

      INSERT INTO credit_ledger (
        organization_id, student_id, lesson_category,
        entry_type, quantity, currency,
        student_package_id, grant_entry_id,
        reference_type, reference_id,
        description, actor_id, expires_at
      ) VALUES (
        p_org_id, p_student_id, v_bundle_cat::lesson_category,
        'grant', v_bundle_qty, v_offering.currency,
        v_package_id, NULL,
        'student_package', v_package_id,
        'Bundle grant: ' || v_offering.name || ' (' || v_bundle_cat || ')',
        p_actor_id, v_expires_at
      ) RETURNING id INTO v_ledger_id;

      PERFORM insert_outbox_event(
        'Credit.Granted',
        'accounting',
        jsonb_build_object(
          'ledger_id',          v_ledger_id,
          'student_id',         p_student_id,
          'lesson_category',    v_bundle_cat,
          'quantity',           v_bundle_qty,
          'expires_at',         v_expires_at,
          'student_package_id', v_package_id
        ),
        p_org_id,
        p_student_id::text
      );
    END LOOP;
  END IF;

  -- 9. Publish Package.Purchased
  PERFORM insert_outbox_event(
    'Package.Purchased',
    'accounting',
    jsonb_build_object(
      'student_package_id', v_package_id,
      'student_id',         p_student_id,
      'offering_id',        p_offering_id,
      'offering_name',      v_offering.name,
      'quantity_granted',   v_offering.quantity,
      'invoice_id',         v_invoice_id,
      'lesson_category',    v_offering.lesson_category,
      'price',              v_offering.price,
      'currency',           v_offering.currency,
      'expires_at',         v_expires_at
    ),
    p_org_id,
    p_student_id::text
  );

  RETURN v_package_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_package_assigned_event(p_assignment_id uuid, p_organization_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_actor_email text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asgn RECORD;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_organization_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PACKAGE_EVENT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT student_id, package_name, lesson_category, package_quantity
  INTO   v_asgn
  FROM   public.student_package_assignments
  WHERE  id              = p_assignment_id
    AND  organization_id = p_organization_id;

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.package_consumption_events (
    organization_id, assignment_id, student_id, event_type,
    credits_delta, lessons_used_after, actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, p_assignment_id, v_asgn.student_id, 'package_assigned',
    0, 0, p_actor_id, p_actor_email,
    jsonb_build_object(
      'package_name',     v_asgn.package_name,
      'lesson_category',  v_asgn.lesson_category,
      'package_quantity', v_asgn.package_quantity
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_coupon(p_org_id uuid, p_invoice_id uuid, p_coupon_code text, p_student_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coupon          coupon_codes%ROWTYPE;
  v_student_count   int;
  v_application_id  uuid;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'COUPON_REDEEM_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Lock coupon row (serializes concurrent redemptions for the same code)
  SELECT * INTO v_coupon
  FROM   coupon_codes
  WHERE  code             = p_coupon_code
    AND  organization_id  = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COUPON_NOT_FOUND: coupon code "%" not found in org %',
      p_coupon_code, p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_coupon.is_active THEN
    RAISE EXCEPTION 'COUPON_INACTIVE: coupon "%" is not active', p_coupon_code
      USING ERRCODE = 'P0001';
  END IF;

  IF v_coupon.valid_from IS NOT NULL AND now()::date < v_coupon.valid_from THEN
    RAISE EXCEPTION 'COUPON_NOT_YET_VALID: coupon "%" is valid from %',
      p_coupon_code, v_coupon.valid_from
      USING ERRCODE = 'P0001';
  END IF;

  IF v_coupon.valid_to IS NOT NULL AND now()::date > v_coupon.valid_to THEN
    RAISE EXCEPTION 'COUPON_EXPIRED: coupon "%" expired on %',
      p_coupon_code, v_coupon.valid_to
      USING ERRCODE = 'P0001';
  END IF;

  -- Check total redemption limit
  IF v_coupon.redemption_limit_total IS NOT NULL
    AND v_coupon.redemptions_count >= v_coupon.redemption_limit_total
  THEN
    RAISE EXCEPTION 'COUPON_LIMIT_REACHED: coupon "%" has reached its total redemption limit of %',
      p_coupon_code, v_coupon.redemption_limit_total
      USING ERRCODE = 'P0001';
  END IF;

  -- Check per-student limit
  IF v_coupon.redemption_limit_per_student IS NOT NULL THEN
    SELECT COUNT(*)
    INTO   v_student_count
    FROM   discount_applications
    WHERE  coupon_id   = v_coupon.id
      AND  student_id  = p_student_id;

    IF v_student_count >= v_coupon.redemption_limit_per_student THEN
      RAISE EXCEPTION 'COUPON_STUDENT_LIMIT: coupon "%" already used % time(s) by this student (limit: %)',
        p_coupon_code, v_student_count, v_coupon.redemption_limit_per_student
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Apply the discount (handles all remaining validation + line item + event)
  v_application_id := apply_discount(p_org_id, p_invoice_id, v_coupon.discount_id, p_actor_id);

  -- Update the discount_application to link the coupon
  UPDATE discount_applications
  SET coupon_id = v_coupon.id
  WHERE id = v_application_id;

  -- Increment redemption counter (atomically, since we hold FOR UPDATE on coupon row)
  UPDATE coupon_codes
  SET
    redemptions_count = redemptions_count + 1,
    updated_at        = now()
  WHERE id = v_coupon.id;

  -- Emit Coupon.Redeemed (in addition to Discount.Applied from apply_discount)
  PERFORM insert_outbox_event(
    'Coupon.Redeemed',
    'internal',
    jsonb_build_object(
      'coupon_id',       v_coupon.id,
      'coupon_code',     p_coupon_code,
      'application_id',  v_application_id,
      'student_id',      p_student_id,
      'invoice_id',      p_invoice_id,
      'redemption_count', v_coupon.redemptions_count + 1
    ),
    p_org_id,
    p_student_id::text
  );

  RETURN v_application_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_discount(p_org_id uuid, p_invoice_id uuid, p_discount_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice          invoices%ROWTYPE;
  v_discount         discount_definitions%ROWTYPE;
  v_current_subtotal numeric(12,2);
  v_discount_amount  numeric(12,2);
  v_line_item_id     uuid;
  v_application_id   uuid;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'DISCOUNT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Lock and validate invoice
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id              = p_invoice_id
    AND  organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'INVOICE_NOT_DRAFT: discounts can only be applied to draft invoices; invoice % has status %',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Period lock guard
  PERFORM assert_period_not_locked(p_org_id, now()::date);

  -- 2. Validate discount definition
  SELECT * INTO v_discount
  FROM   discount_definitions
  WHERE  id              = p_discount_id
    AND  organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISCOUNT_NOT_FOUND: discount % not found in org %',
      p_discount_id, p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_discount.is_active THEN
    RAISE EXCEPTION 'DISCOUNT_INACTIVE: discount % is not active', p_discount_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_discount.valid_from IS NOT NULL AND now()::date < v_discount.valid_from THEN
    RAISE EXCEPTION 'DISCOUNT_NOT_YET_VALID: discount % is valid from %',
      p_discount_id, v_discount.valid_from
      USING ERRCODE = 'P0001';
  END IF;

  IF v_discount.valid_to IS NOT NULL AND now()::date > v_discount.valid_to THEN
    RAISE EXCEPTION 'DISCOUNT_EXPIRED: discount % expired on %',
      p_discount_id, v_discount.valid_to
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate scope
  IF v_discount.discount_scope = 'offering' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   invoice_line_items ili
      JOIN   student_packages   sp ON sp.id  = ili.student_package_id
      JOIN   package_offerings  po ON po.id  = sp.offering_id
      WHERE  ili.invoice_id = p_invoice_id
        AND  po.id          = v_discount.scope_reference_id
    ) THEN
      RAISE EXCEPTION 'DISCOUNT_SCOPE_MISMATCH: discount % requires offering % on invoice %',
        p_discount_id, v_discount.scope_reference_id, p_invoice_id
        USING ERRCODE = 'P0001';
    END IF;

  ELSIF v_discount.discount_scope = 'catalog' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   invoice_line_items ili
      JOIN   student_packages   sp ON sp.id  = ili.student_package_id
      JOIN   package_offerings  po ON po.id  = sp.offering_id
      WHERE  ili.invoice_id = p_invoice_id
        AND  po.catalog_id  = v_discount.scope_reference_id
    ) THEN
      RAISE EXCEPTION 'DISCOUNT_SCOPE_MISMATCH: discount % requires catalog % on invoice %',
        p_discount_id, v_discount.scope_reference_id, p_invoice_id
        USING ERRCODE = 'P0001';
    END IF;

  ELSIF v_discount.discount_scope = 'category' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM   invoice_line_items ili
      JOIN   student_packages   sp ON sp.id  = ili.student_package_id
      JOIN   package_offerings  po ON po.id  = sp.offering_id
      WHERE  ili.invoice_id     = p_invoice_id
        AND  po.lesson_category = v_discount.scope_category
    ) THEN
      RAISE EXCEPTION 'DISCOUNT_SCOPE_MISMATCH: discount % requires category % on invoice %',
        p_discount_id, v_discount.scope_category, p_invoice_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 4. Compute current subtotal (excluding existing discount lines)
  SELECT COALESCE(SUM(line_total), 0)
  INTO   v_current_subtotal
  FROM   invoice_line_items
  WHERE  invoice_id = p_invoice_id
    AND  line_type <> 'discount';

  -- 5. Calculate discount amount
  IF v_discount.discount_type = 'percentage' THEN
    v_discount_amount := v_current_subtotal * v_discount.discount_value;
    IF v_discount.max_discount_amount IS NOT NULL THEN
      v_discount_amount := LEAST(v_discount_amount, v_discount.max_discount_amount);
    END IF;
  ELSE
    v_discount_amount := v_discount.discount_value;
  END IF;

  v_discount_amount := ROUND(v_discount_amount, 2);

  -- 6. Over-discount protection: discount cannot bring subtotal negative
  IF v_discount_amount > v_current_subtotal THEN
    v_discount_amount := v_current_subtotal;
  END IF;

  IF v_discount_amount <= 0 THEN
    RAISE EXCEPTION 'DISCOUNT_ZERO: computed discount amount is 0 for invoice % with discount %',
      p_invoice_id, p_discount_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Insert discount line item (negative unit_price; vat_rate=0 for discount lines)
  INSERT INTO invoice_line_items (
    organization_id, invoice_id,
    line_type, description,
    quantity, unit_price,
    vat_rate, vat_amount, line_total,
    sort_order
  ) VALUES (
    p_org_id, p_invoice_id,
    'discount',
    v_discount.name,
    1,
    -v_discount_amount,
    0, 0, -v_discount_amount,
    1000
  ) RETURNING id INTO v_line_item_id;

  -- 8. Insert discount_application record
  INSERT INTO discount_applications (
    organization_id, invoice_id, invoice_line_item_id,
    discount_id, coupon_id,
    student_id,
    original_subtotal, discount_amount,
    applied_by
  ) VALUES (
    p_org_id, p_invoice_id, v_line_item_id,
    p_discount_id, NULL,
    v_invoice.student_id,
    v_current_subtotal, v_discount_amount,
    p_actor_id
  ) RETURNING id INTO v_application_id;

  -- 9. Emit Discount.Applied
  PERFORM insert_outbox_event(
    'Discount.Applied',
    'internal',
    jsonb_build_object(
      'application_id',    v_application_id,
      'discount_id',       p_discount_id,
      'discount_name',     v_discount.name,
      'invoice_id',        p_invoice_id,
      'line_item_id',      v_line_item_id,
      'student_id',        v_invoice.student_id,
      'discount_amount',   v_discount_amount,
      'original_subtotal', v_current_subtotal
    ),
    p_org_id,
    v_invoice.student_id::text
  );

  RETURN v_application_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_order_assignment(p_order_id uuid, p_assignment_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_organization_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders
     SET assignment_id = p_assignment_id
   WHERE id              = p_order_id
     AND organization_id = p_organization_id
     AND deleted_at      IS NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_order_event(p_organization_id uuid, p_order_id uuid, p_event_type text, p_actor_id uuid DEFAULT NULL::uuid, p_actor_email text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id   uuid;
BEGIN
  -- Tenant isolation: caller's organization must match the target
  -- organization unless legitimately platform-admin or a trusted
  -- contextless service-role caller. The prior version of this check only
  -- compared against the caller's org when that org claim was present,
  -- which silently let ANY caller with no organization_id JWT claim
  -- (including a bare anon-key call, since anon has no such claim) through
  -- unchecked — closed by using the same is_trusted_service_context()
  -- bypass every other function in this security program uses, instead of
  -- treating "no org claim" itself as authorization.
  IF NOT public.is_trusted_service_context()
     AND p_organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'emit_order_event: organization mismatch — cross-tenant injection rejected'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ORDER_EVENT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  -- Order membership: the order must exist and belong to the stated organization.
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id              = p_order_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'emit_order_event: order not found in organization'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.order_events (
    organization_id, order_id, event_type,
    actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, p_order_id, p_event_type,
    p_actor_id, p_actor_email, COALESCE(p_metadata, '{}')
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_stale_packages(p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec   RECORD;
  v_count int := 0;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_organization_id
      USING ERRCODE = '42501';
  END IF;

  FOR v_rec IN
    SELECT id, student_id, lessons_used
    FROM   public.student_package_assignments
    WHERE  organization_id = p_organization_id
      AND  status          = 'active'
      AND  expires_at      IS NOT NULL
      AND  expires_at      <  now()
    FOR UPDATE
  LOOP
    UPDATE public.student_package_assignments
    SET    status     = 'expired',
           updated_at = now()
    WHERE  id = v_rec.id;

    INSERT INTO public.package_consumption_events (
      organization_id, assignment_id, student_id, event_type,
      credits_delta, lessons_used_after, metadata
    ) VALUES (
      p_organization_id, v_rec.id, v_rec.student_id, 'package_expired',
      0, v_rec.lessons_used,
      jsonb_build_object('expired_at', now())
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_coupon_redemptions(p_coupon_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.campaign_coupon_codes
     SET redemptions_count = redemptions_count + 1
   WHERE id = p_coupon_id
     AND (organization_id = public.auth_organization_id() OR public.is_trusted_service_context());
$function$;

-- ============================================================================
-- F. GRANTS — PUBLIC, anon, and authenticated explicitly revoked together
--    (Wave 2A lesson). All 36 functions above (excluding the two
--    grant-only bulk-sweep functions below) have real `authenticated`-role
--    callers, confirmed by reading financial-close/index.ts, payroll/
--    index.ts, reconciliation/index.ts, refunds/index.ts, orders/index.ts,
--    student-packages/index.ts, discounts/index.ts, enrollments/index.ts,
--    package-consumption/index.ts, event-worker/index.ts directly.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.generate_agi_export(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_agi_export(uuid, uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_agi_submission(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_agi_submission(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.certify_agi_submission(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.certify_agi_submission(uuid, uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_agi_correction(uuid, uuid, agi_correction_reason, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_agi_correction(uuid, uuid, agi_correction_reason, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.lock_agi_export(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_agi_export(uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.verify_agi_export_integrity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_agi_export_integrity(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.build_regulatory_evidence_package(uuid, filing_entity_type, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_regulatory_evidence_package(uuid, filing_entity_type, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_vat_declaration(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_vat_declaration(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.certify_vat_declaration(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.certify_vat_declaration(uuid, uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_vat_correction(uuid, uuid, vat_correction_type, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_vat_correction(uuid, uuid, vat_correction_type, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.generate_saf_t_export(uuid, date, date, saft_export_scope, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_saf_t_export(uuid, date, date, saft_export_scope, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_vat_period(uuid, date, date, vat_period_frequency, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_vat_period(uuid, date, date, vat_period_frequency, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.lock_vat_period(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_vat_period(uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.populate_vat_period(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.populate_vat_period(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reconcile_vat_period(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_vat_period(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_vat_clearing_run(uuid, uuid, uuid, date, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_vat_clearing_run(uuid, uuid, uuid, date, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_payroll_run(uuid, uuid, date, date, date, payroll_run_type, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payroll_run(uuid, uuid, date, date, date, payroll_run_type, uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.add_payroll_entry(uuid, uuid, numeric, numeric, numeric, numeric, numeric, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_payroll_entry(uuid, uuid, numeric, numeric, numeric, numeric, numeric, uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reverse_payroll_run(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_payroll_run(uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_payroll_run_totals(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_payroll_run_totals(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_tax_remittance(uuid, uuid, uuid, date, date, date, numeric, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tax_remittance(uuid, uuid, uuid, date, date, date, numeric, numeric, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.complete_tax_remittance(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_tax_remittance(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.auto_match_bank_lines(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_lines(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.manual_match_bank_line(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_match_bank_line(uuid, uuid, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.unmatch_bank_line(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unmatch_bank_line(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.consume_credit(uuid, uuid, uuid, lesson_category, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credit(uuid, uuid, uuid, lesson_category, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.consume_lesson_credit(uuid, uuid, uuid, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_lesson_credit(uuid, uuid, uuid, text, uuid, text, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reverse_lesson_credit(uuid, uuid, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_lesson_credit(uuid, uuid, text, text, uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.purchase_package(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_package(uuid, uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_package_assigned_event(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_package_assigned_event(uuid, uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.redeem_coupon(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(uuid, uuid, text, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.apply_discount(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_discount(uuid, uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.link_order_assignment(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_order_assignment(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.emit_order_event(uuid, uuid, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_order_event(uuid, uuid, text, uuid, text, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.expire_stale_packages(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_packages(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.increment_coupon_redemptions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_coupon_redemptions(uuid) TO authenticated, service_role;

-- Grant-only: global cross-organization background sweeps, no organization
-- parameter by design, confirmed sole caller is event-worker's
-- createServiceClient() (no forwarded user JWT). No legitimate tenant-level
-- caller exists for a platform-wide sweep, so restricted to service_role
-- only rather than given an org check with nothing to check against.
-- Function bodies unchanged.
REVOKE EXECUTE ON FUNCTION public.expire_stale_packages_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_packages_all() TO service_role;

REVOKE EXECUTE ON FUNCTION public.expire_stale_credits(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_credits(integer) TO service_role;
