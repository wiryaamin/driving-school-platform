-- Phase 5A: VAT Declaration Infrastructure
-- Tables:    vat_declarations, vat_declaration_lines (immutable), vat_corrections (immutable)
-- Functions: generate_vat_declaration, certify_vat_declaration, create_vat_correction

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE vat_declaration_status AS ENUM (
  'draft',
  'pending',
  'submitted',
  'accepted',
  'rejected',
  'corrected'
);

CREATE TYPE vat_correction_type AS ENUM (
  'supplementary',
  'amendment',
  'cancellation'
);

-- ── vat_declarations ──────────────────────────────────────────────────────────

CREATE TABLE vat_declarations (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  vat_period_id           uuid        NOT NULL REFERENCES vat_periods(id) ON DELETE RESTRICT,
  declaration_status      vat_declaration_status NOT NULL DEFAULT 'pending',
  declaration_reference   text,
  -- Swedish momsdeklaration boxes (SKV 4700)
  box_05_taxable_turnover numeric(15,2) NOT NULL DEFAULT 0,  -- Momspliktig omsättning
  box_10_output_vat_25    numeric(15,2) NOT NULL DEFAULT 0,  -- Utgående moms 25%
  box_11_output_vat_12    numeric(15,2) NOT NULL DEFAULT 0,  -- Utgående moms 12%
  box_12_output_vat_6     numeric(15,2) NOT NULL DEFAULT 0,  -- Utgående moms 6%
  box_30_input_vat        numeric(15,2) NOT NULL DEFAULT 0,  -- Ingående moms att dra av
  box_49_net_vat          numeric(15,2) GENERATED ALWAYS AS (
    box_10_output_vat_25 + box_11_output_vat_12 + box_12_output_vat_6 - box_30_input_vat
  ) STORED,
  declaration_hash        text        NOT NULL,
  skatteverket_receipt    text,
  correction_of_id        uuid        REFERENCES vat_declarations(id) ON DELETE RESTRICT,
  submitted_at            timestamptz,
  submitted_by            uuid        REFERENCES auth.users(id),
  certified_at            timestamptz,
  certified_by            uuid        REFERENCES auth.users(id),
  certification_hash      text,
  notes                   text,
  metadata                jsonb       NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid        REFERENCES auth.users(id)
);

ALTER TABLE vat_declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY vat_declarations_select ON vat_declarations
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

-- Protect amounts and hash once set; allow status/certification columns to change
CREATE OR REPLACE FUNCTION prevent_vat_declaration_amount_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.box_05_taxable_turnover != OLD.box_05_taxable_turnover
  OR NEW.box_10_output_vat_25    != OLD.box_10_output_vat_25
  OR NEW.box_11_output_vat_12    != OLD.box_11_output_vat_12
  OR NEW.box_12_output_vat_6     != OLD.box_12_output_vat_6
  OR NEW.box_30_input_vat        != OLD.box_30_input_vat
  OR NEW.declaration_hash        != OLD.declaration_hash
  OR NEW.vat_period_id           != OLD.vat_period_id THEN
    RAISE EXCEPTION 'vat_declaration amounts and hash are immutable once set'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vat_declarations_protect_amounts
  BEFORE UPDATE ON vat_declarations
  FOR EACH ROW EXECUTE FUNCTION prevent_vat_declaration_amount_mutation();

-- ── vat_declaration_lines (fully immutable) ───────────────────────────────────

CREATE TABLE vat_declaration_lines (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  declaration_id  uuid        NOT NULL REFERENCES vat_declarations(id) ON DELETE RESTRICT,
  box_code        text        NOT NULL,   -- Swedish form box code: '05', '10', '30', '49'
  box_name        text        NOT NULL,
  base_amount     numeric(15,2) NOT NULL DEFAULT 0,
  vat_amount      numeric(15,2) NOT NULL DEFAULT 0,
  vat_rate_code   text,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vat_declaration_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY vat_declaration_lines_select ON vat_declaration_lines
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE OR REPLACE FUNCTION prevent_vat_declaration_line_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'vat_declaration_lines are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER vat_declaration_lines_immutable
  BEFORE UPDATE OR DELETE ON vat_declaration_lines
  FOR EACH ROW EXECUTE FUNCTION prevent_vat_declaration_line_mutation();

-- ── vat_corrections (fully immutable) ────────────────────────────────────────

CREATE TABLE vat_corrections (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  original_declaration_id   uuid        NOT NULL REFERENCES vat_declarations(id) ON DELETE RESTRICT,
  correction_declaration_id uuid        REFERENCES vat_declarations(id) ON DELETE RESTRICT,
  correction_type           vat_correction_type NOT NULL,
  correction_description    text        NOT NULL,
  correction_hash           text        NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid        REFERENCES auth.users(id)
);

ALTER TABLE vat_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY vat_corrections_select ON vat_corrections
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE OR REPLACE FUNCTION prevent_vat_correction_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'vat_corrections are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER vat_corrections_immutable
  BEFORE UPDATE OR DELETE ON vat_corrections
  FOR EACH ROW EXECUTE FUNCTION prevent_vat_correction_mutation();

-- ── generate_vat_declaration() ────────────────────────────────────────────────

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

  -- Aggregate output VAT by rate from vat_report_entries (sales = positive net_amount)
  SELECT
    COALESCE(SUM(CASE WHEN vat_rate_code = 'SE25' THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN vat_rate_code = 'SE12' THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN vat_rate_code = 'SE6'  THEN vat_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN net_amount > 0 THEN net_amount ELSE 0 END), 0)
  INTO v_out_25, v_out_12, v_out_6, v_taxable
  FROM vat_report_entries
  WHERE vat_period_id = p_vat_period_id AND organization_id = p_org_id;

  -- Input VAT from period aggregate
  v_input_vat := COALESCE(v_period.total_input_vat, 0);

  -- Canonical hash
  v_hash := canonical_accounting_hash(
    jsonb_build_array(
      jsonb_build_object('account_code', 'BOX05', 'debit', ROUND(v_taxable, 2),   'credit', 0::numeric, 'balance', ROUND(v_taxable, 2)),
      jsonb_build_object('account_code', 'BOX10', 'debit', ROUND(v_out_25, 2),    'credit', 0::numeric, 'balance', ROUND(v_out_25, 2)),
      jsonb_build_object('account_code', 'BOX11', 'debit', ROUND(v_out_12, 2),    'credit', 0::numeric, 'balance', ROUND(v_out_12, 2)),
      jsonb_build_object('account_code', 'BOX12', 'debit', ROUND(v_out_6, 2),     'credit', 0::numeric, 'balance', ROUND(v_out_6, 2)),
      jsonb_build_object('account_code', 'BOX30', 'debit', 0::numeric, 'credit', ROUND(v_input_vat, 2), 'balance', ROUND(-v_input_vat, 2))
    )
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

-- ── certify_vat_declaration() ─────────────────────────────────────────────────

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

  v_hash := encode(
    sha256((
      p_declaration_id::text   || '|' ||
      v_decl.declaration_hash  || '|' ||
      COALESCE(p_receipt, '')  || '|' ||
      now()::text
    )::bytea),
    'hex'
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
  SET status    = 'filed',
      filed_at  = now(),
      filed_by  = p_actor_id
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

-- ── create_vat_correction() ───────────────────────────────────────────────────

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

  v_hash := encode(
    sha256((
      p_original_declaration_id::text || '|' ||
      p_correction_type::text         || '|' ||
      p_description                   || '|' ||
      now()::text
    )::bytea),
    'hex'
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

GRANT SELECT ON vat_declarations      TO authenticated, service_role;
GRANT SELECT ON vat_declaration_lines TO authenticated, service_role;
GRANT SELECT ON vat_corrections       TO authenticated, service_role;
