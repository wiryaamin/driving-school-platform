-- Phase 5A: SAF-T Export + Regulatory Export Hash Infrastructure
-- Tables:    saf_t_exports, regulatory_export_hashes (immutable)
-- Functions: generate_saf_t_export

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE saft_export_status AS ENUM (
  'generating',
  'ready',
  'submitted',
  'archived'
);

CREATE TYPE saft_export_scope AS ENUM (
  'full',
  'gl',
  'ar',
  'ap',
  'fixed_assets'
);

-- ── saf_t_exports ─────────────────────────────────────────────────────────────

CREATE TABLE saf_t_exports (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  fiscal_year_id         uuid        REFERENCES fiscal_years(id) ON DELETE RESTRICT,
  period_start           date        NOT NULL,
  period_end             date        NOT NULL,
  export_scope           saft_export_scope NOT NULL DEFAULT 'full',
  export_status          saft_export_status NOT NULL DEFAULT 'generating',
  saft_version           text        NOT NULL DEFAULT '1.0',
  journal_entry_count    integer     NOT NULL DEFAULT 0,
  transaction_count      integer     NOT NULL DEFAULT 0,
  account_count          integer     NOT NULL DEFAULT 0,
  content_hash           text,
  export_file_reference  text,
  submitted_at           timestamptz,
  submitted_by           uuid        REFERENCES auth.users(id),
  skatteverket_reference text,
  notes                  text,
  metadata               jsonb       NOT NULL DEFAULT '{}',
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid        REFERENCES auth.users(id),
  CONSTRAINT saf_t_exports_period_check CHECK (period_end >= period_start)
);

ALTER TABLE saf_t_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY saf_t_exports_select ON saf_t_exports
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

-- ── regulatory_export_hashes (fully immutable) ────────────────────────────────
-- Unified hash registry for all Swedish regulatory exports.
-- Distinct from canonical_export_hashes (Phase 4H-A) which covers replay/ledger exports.

CREATE TABLE regulatory_export_hashes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  export_type         text        NOT NULL,   -- 'agi_submission'|'vat_declaration'|'saf_t'|'sie4'|'agi'
  export_id           uuid        NOT NULL,   -- ID in the source table (no FK — cross-type)
  period_start        date,
  period_end          date,
  hash_value          text        NOT NULL,
  hash_algorithm      text        NOT NULL DEFAULT 'canonical_accounting_hash_v1',
  hash_input_summary  text,
  generated_at        timestamptz NOT NULL DEFAULT now(),
  generated_by        uuid        REFERENCES auth.users(id),
  CONSTRAINT regulatory_export_hashes_period_check
    CHECK (period_start IS NOT NULL OR period_end IS NOT NULL)
);

ALTER TABLE regulatory_export_hashes ENABLE ROW LEVEL SECURITY;
CREATE POLICY regulatory_export_hashes_select ON regulatory_export_hashes
  FOR SELECT USING (organization_id = (auth.jwt()->'app_metadata'->>'organization_id')::uuid);

CREATE OR REPLACE FUNCTION prevent_regulatory_export_hash_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'regulatory_export_hashes are immutable' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER regulatory_export_hashes_immutable
  BEFORE UPDATE OR DELETE ON regulatory_export_hashes
  FOR EACH ROW EXECUTE FUNCTION prevent_regulatory_export_hash_mutation();

-- ── generate_saf_t_export() ───────────────────────────────────────────────────

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

  -- Deterministic hash of source data fingerprint
  v_content_hash := encode(
    sha256((
      p_org_id::text       || '|' ||
      p_period_start::text || '|' ||
      p_period_end::text   || '|' ||
      p_scope::text        || '|' ||
      v_je_count::text     || '|' ||
      v_tx_count::text     || '|' ||
      v_acc_count::text
    )::bytea),
    'hex'
  );

  INSERT INTO saf_t_exports (
    organization_id,
    period_start, period_end,
    export_scope, export_status,
    journal_entry_count, transaction_count, account_count,
    content_hash, created_by
  ) VALUES (
    p_org_id,
    p_period_start, p_period_end,
    p_scope, 'ready',
    v_je_count, v_tx_count, v_acc_count,
    v_content_hash, p_actor_id
  ) RETURNING id INTO v_export_id;

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

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON saf_t_exports             TO authenticated, service_role;
GRANT SELECT ON regulatory_export_hashes  TO authenticated, service_role;
