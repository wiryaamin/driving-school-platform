-- Phase 5A.1: Hash Normalization — Deterministic Replay-Safe Hashing
--
-- Provides:
--   generate_replay_safe_hash()    — canonical, timestamp-free hash (IMMUTABLE)
--   canonicalize_export_payload()  — strips all runtime timestamps from a jsonb payload
--
-- Then replaces 4 functions whose certification hashes included now()::text:
--   certify_agi_submission    — was: ...|| now()::text
--   create_agi_correction     — was: ...|| now()::text
--   certify_vat_declaration   — was: ...|| now()::text
--   create_vat_correction     — was: ...|| now()::text
--
-- The now() was excluded from hash inputs so the same submission/correction
-- always produces the same hash regardless of when it is recomputed.

-- ── canonicalize_export_payload() ─────────────────────────────────────────────
-- Removes well-known runtime-timestamp fields from a jsonb payload, then runs
-- canonical_jsonb to ensure stable key ordering. The result is safe to use as
-- hash input: the same logical content always yields the same bytes.

CREATE OR REPLACE FUNCTION canonicalize_export_payload(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT canonical_jsonb(
  p_payload
  - 'generated_at'
  - 'created_at'
  - 'updated_at'
  - 'certified_at'
  - 'submitted_at'
  - 'exported_at'
  - 'filed_at'
  - 'occurred_at'
  - 'timestamp'
  - 'now'
  - 'checked_at'
)
$$;

-- ── generate_replay_safe_hash() ────────────────────────────────────────────────
-- IMMUTABLE, PARALLEL SAFE: depends only on its arguments.
-- Excludes all timestamps, uses canonical_jsonb for stable key ordering,
-- normalizes via UTF-8 bytea encoding.
-- Compatible input: pass canonicalize_export_payload(content) for full safety.

CREATE OR REPLACE FUNCTION generate_replay_safe_hash(
  p_entity_type text,
  p_entity_id   uuid,
  p_content     jsonb
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
SELECT encode(
  sha256((
    COALESCE(p_entity_type, '')     || '|' ||
    COALESCE(p_entity_id::text, '') || '|' ||
    COALESCE(canonical_jsonb(p_content)::text, '{}')
  )::bytea),
  'hex'
)
$$;

-- ── certify_agi_submission() — hash normalization fix ─────────────────────────
-- CHANGED: certification_hash now uses generate_replay_safe_hash instead of
--          encode(sha256(... || now()::text ...), 'hex')
-- All other logic is identical to the Phase 5A version.

CREATE OR REPLACE FUNCTION certify_agi_submission(
  p_org_id        uuid,
  p_submission_id uuid,
  p_receipt       text DEFAULT NULL,
  p_actor_id      uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub  record;
  v_hash text;
BEGIN
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
$$;

-- ── create_agi_correction() — hash normalization fix ─────────────────────────

CREATE OR REPLACE FUNCTION create_agi_correction(
  p_org_id                 uuid,
  p_original_submission_id uuid,
  p_correction_reason      agi_correction_reason,
  p_description            text,
  p_actor_id               uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original  record;
  v_corr_id   uuid;
  v_hash      text;
BEGIN
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
$$;

-- ── certify_vat_declaration() — hash normalization fix ────────────────────────

CREATE OR REPLACE FUNCTION certify_vat_declaration(
  p_org_id         uuid,
  p_declaration_id uuid,
  p_receipt        text DEFAULT NULL,
  p_actor_id       uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decl  record;
  v_hash  text;
BEGIN
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
$$;

-- ── create_vat_correction() — hash normalization fix ─────────────────────────

CREATE OR REPLACE FUNCTION create_vat_correction(
  p_org_id                  uuid,
  p_original_declaration_id uuid,
  p_correction_type         vat_correction_type,
  p_description             text,
  p_actor_id                uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original  record;
  v_corr_id   uuid;
  v_hash      text;
BEGIN
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
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION canonicalize_export_payload(jsonb)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION generate_replay_safe_hash(text, uuid, jsonb)  TO authenticated, service_role;
