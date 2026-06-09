-- Phase 5A.2: Export Generation — Deterministic Payload Pipeline
--
-- Updates three generation functions to use the centralized canonical payload
-- builders from migration 000013. The hash computation logic is now in ONE place;
-- the generation functions delegate to build_*_canonical_payload instead of
-- building the hash input inline.
--
-- Functions updated:
--   generate_agi_submission   — submission_hash via build_agi_canonical_payload
--   generate_vat_declaration  — declaration_hash via build_vat_canonical_payload
--   generate_saf_t_export     — content_hash via build_saft_canonical_payload
--                               + generate_replay_safe_hash (UUID pre-generated)

-- ── generate_agi_submission() — builder pipeline ──────────────────────────────
-- CHANGED: v_hash now computed via canonical_accounting_hash(build_agi_canonical_payload(...))
-- instead of canonical_accounting_hash(jsonb_build_array(jsonb_build_object(...))) inline.
-- Hash value is identical — the logic is simply centralised.

CREATE OR REPLACE FUNCTION generate_agi_submission(
  p_org_id        uuid,
  p_agi_export_id uuid,
  p_actor_id      uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_export        record;
  v_submission_id uuid;
  v_hash          text;
  v_period_start  date;
  v_period_end    date;
BEGIN
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
$$;

-- ── generate_vat_declaration() — builder pipeline ─────────────────────────────
-- CHANGED: v_hash now computed via canonical_accounting_hash(build_vat_canonical_payload(...))
-- instead of a five-entry inline jsonb_build_array. Hash value is identical.

CREATE OR REPLACE FUNCTION generate_vat_declaration(
  p_org_id        uuid,
  p_vat_period_id uuid,
  p_actor_id      uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- ── generate_saf_t_export() — builder pipeline ────────────────────────────────
-- CHANGED:
--   1. UUID is pre-generated so it can be included in generate_replay_safe_hash
--   2. content_hash uses generate_replay_safe_hash(build_saft_canonical_payload(...))
--      instead of raw encode(sha256(string_concat), 'hex')
--   3. INSERT uses explicit id column (no RETURNING needed for id)

CREATE OR REPLACE FUNCTION generate_saf_t_export(
  p_org_id       uuid,
  p_period_start date,
  p_period_end   date,
  p_scope        saft_export_scope DEFAULT 'full',
  p_actor_id     uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_export_id    uuid;
  v_content_hash text;
  v_je_count     integer := 0;
  v_tx_count     integer := 0;
  v_acc_count    integer := 0;
BEGIN
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
$$;

-- No new grants needed — functions are CREATE OR REPLACE of existing ones.
-- Callers already have GRANT EXECUTE from the original migrations.
