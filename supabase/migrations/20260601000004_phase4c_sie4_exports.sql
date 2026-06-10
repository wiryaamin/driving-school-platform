-- ============================================================
-- Phase 4C — SIE4 File Generation
-- SIE4 export table, immutability trigger, and
-- generate_sie4_export() SECURITY DEFINER function that
-- produces a reproducible, SHA-256-verified SIE4 file.
-- ============================================================

-- ── Section 1: SIE4 Exports Table ────────────────────────────────────────────

CREATE TABLE public.sie4_exports (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id    uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  export_run_id      uuid        NOT NULL UNIQUE REFERENCES public.accounting_export_runs(id),
  content_text       text        NOT NULL,
  content_hash       text        NOT NULL,         -- SHA-256 hex, 64 chars
  voucher_count      int         NOT NULL DEFAULT 0,
  transaction_count  int         NOT NULL DEFAULT 0,
  from_date          date        NOT NULL,
  to_date            date        NOT NULL,
  fiscal_year_start  date,
  generated_at       timestamptz NOT NULL DEFAULT now(),
  generated_by       uuid        REFERENCES auth.users(id),

  CONSTRAINT sie4_content_hash_format  CHECK (length(content_hash) = 64),
  CONSTRAINT sie4_dates_valid          CHECK (to_date >= from_date)
);

COMMENT ON TABLE public.sie4_exports IS
  'Immutable SIE4 file exports. content_hash is SHA-256 of content_text — used for reproducibility verification.';

-- ── Section 2: Immutability Trigger ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_sie4_export_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'SIE4_IMMUTABLE: SIE4 export % cannot be modified after generation — Swedish audit law requires immutable bookkeeping records',
      OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SIE4_IMMUTABLE: SIE4 export % cannot be deleted — Swedish audit law requires permanent retention',
      OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER sie4_export_immutability_guard
  BEFORE UPDATE OR DELETE ON public.sie4_exports
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sie4_export_mutation();

-- ── Section 3: RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.sie4_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sie4_exports_org_isolation"
  ON public.sie4_exports
  FOR SELECT
  USING (organization_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid);

-- ── Section 4: generate_sie4_export() ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_sie4_export(
  p_export_run_id  uuid,
  p_actor_id       uuid
)
RETURNS uuid  -- sie4_exports.id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run          accounting_export_runs%ROWTYPE;
  v_settings     organization_swedish_settings%ROWTYPE;
  v_existing_id  uuid;
  v_content      text := '';
  v_line         text;
  v_acct         RECORD;
  v_entry        RECORD;
  v_ver          RECORD;
  v_voucher_num  int  := 1;
  v_voucher_count int := 0;
  v_trans_count  int := 0;
  v_from_date    date;
  v_to_date      date;
  v_fiscal_start date;
  v_hash         text;
  v_export_id    uuid;
  v_gen_date     text;
  v_from_str     text;
  v_to_str       text;
  v_fiscal_str   text;
  v_prev_event   text := '';
BEGIN
  -- 1. Fetch export run (must be 'completed')
  SELECT * INTO v_run
  FROM   accounting_export_runs
  WHERE  id = p_export_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXPORT_RUN_NOT_FOUND: %', p_export_run_id USING ERRCODE = 'P0001';
  END IF;

  IF v_run.status <> 'completed' THEN
    RAISE EXCEPTION 'EXPORT_RUN_NOT_COMPLETE: run % has status %, expected completed',
      p_export_run_id, v_run.status USING ERRCODE = 'P0001';
  END IF;

  -- 2. Check idempotency — return existing SIE4 if already generated
  SELECT id INTO v_existing_id FROM sie4_exports WHERE export_run_id = p_export_run_id;
  IF FOUND THEN
    RETURN v_existing_id;
  END IF;

  -- 3. Fetch Swedish settings
  SELECT * INTO v_settings
  FROM   organization_swedish_settings
  WHERE  organization_id = v_run.organization_id;

  -- 4. Determine date range from export entries
  SELECT
    MIN(e.transaction_date),
    MAX(e.transaction_date)
  INTO v_from_date, v_to_date
  FROM accounting_export_entries e
  WHERE e.export_run_id = p_export_run_id;

  IF v_from_date IS NULL THEN
    RAISE EXCEPTION 'SIE4_NO_ENTRIES: export run % has no entries', p_export_run_id
      USING ERRCODE = 'P0001';
  END IF;

  v_fiscal_start := COALESCE(
    v_settings.sie4_fiscal_year_start,
    date_trunc('year', v_from_date)::date
  );

  -- Format dates as YYYYMMDD (SIE4 standard)
  v_gen_date    := to_char(now(),            'YYYYMMDD');
  v_from_str    := to_char(v_from_date,      'YYYYMMDD');
  v_to_str      := to_char(v_to_date,        'YYYYMMDD');
  v_fiscal_str  := to_char(v_fiscal_start,   'YYYYMMDD');

  -- ── 5. Build SIE4 header ─────────────────────────────────────────────────
  v_content := v_content ||
    '#FILTYP SIE4' || E'\n' ||
    '#FORMAT PC8'  || E'\n' ||
    '#GEN '        || v_gen_date || E'\n' ||
    '#SIETYP 4'    || E'\n' ||
    '#PROGRAM "Driving School ERP" "1.0"' || E'\n' ||
    '#FNAMN "'     || replace(COALESCE(v_settings.sie4_company_name, 'Okänt företag'), '"', '') || '"' || E'\n';

  IF v_settings.org_number IS NOT NULL THEN
    v_content := v_content || '#ORGNR ' || replace(v_settings.org_number, '-', '') || E'\n';
  END IF;

  IF v_settings.vat_reg_number IS NOT NULL THEN
    v_content := v_content || '#MOMSNR ' || v_settings.vat_reg_number || E'\n';
  END IF;

  v_content := v_content ||
    '#KPTYP BAS2020' || E'\n' ||
    '#RAR 0 '        || v_fiscal_str || ' ' || to_char(v_from_date + interval '1 year - 1 day', 'YYYYMMDD') || E'\n';

  -- ── 6. Emit #KONTO lines for all unique accounts used in this export ──────
  FOR v_acct IN
    SELECT DISTINCT
      COALESCE(bac_d.account_code, '') AS debit_code,
      COALESCE(bac_d.account_name, '') AS debit_name,
      COALESCE(bac_c.account_code, '') AS credit_code,
      COALESCE(bac_c.account_name, '') AS credit_name
    FROM accounting_export_entries aee
    LEFT JOIN accounting_chart_of_accounts acc
      ON acc.organization_id = aee.organization_id
     AND acc.event_type      = aee.event_type
    LEFT JOIN bas_account_catalog bac_d ON bac_d.id = acc.bas_account_debit_id
    LEFT JOIN bas_account_catalog bac_c ON bac_c.id = acc.bas_account_credit_id
    WHERE aee.export_run_id = p_export_run_id
  LOOP
    IF v_acct.debit_code <> '' THEN
      v_content := v_content ||
        '#KONTO ' || v_acct.debit_code || ' "' || replace(v_acct.debit_name, '"', '') || '"' || E'\n';
    END IF;
    IF v_acct.credit_code <> '' AND v_acct.credit_code <> v_acct.debit_code THEN
      v_content := v_content ||
        '#KONTO ' || v_acct.credit_code || ' "' || replace(v_acct.credit_name, '"', '') || '"' || E'\n';
    END IF;
  END LOOP;

  -- ── 7. Emit #VER vouchers grouped by event_type + transaction_date ────────
  FOR v_ver IN
    SELECT
      aee.event_type,
      aee.transaction_date,
      aee.description,
      aee.debit_amount,
      aee.credit_amount,
      aee.bas_account_code,
      COALESCE(bac_d.account_code, '1510') AS debit_code,
      COALESCE(bac_c.account_code, '3041') AS credit_code,
      to_char(aee.transaction_date, 'YYYYMMDD') AS date_str
    FROM accounting_export_entries aee
    LEFT JOIN accounting_chart_of_accounts acc
      ON acc.organization_id = aee.organization_id
     AND acc.event_type      = aee.event_type
    LEFT JOIN bas_account_catalog bac_d ON bac_d.id = acc.bas_account_debit_id
    LEFT JOIN bas_account_catalog bac_c ON bac_c.id = acc.bas_account_credit_id
    WHERE aee.export_run_id = p_export_run_id
    ORDER BY aee.transaction_date, aee.event_type, aee.id
  LOOP
    -- Open a new voucher for each entry (simplified 2-leg balanced entry)
    v_content := v_content ||
      '#VER A ' || v_voucher_num::text || ' ' || v_ver.date_str ||
      ' "' || replace(COALESCE(v_ver.event_type, ''), '"', '') || '"' || E'\n' ||
      '{' || E'\n' ||
      '  #TRANS ' || v_ver.debit_code  || ' {} '  || to_char(v_ver.debit_amount,  'FM999999990.00') ||
      ' ' || v_ver.date_str || ' "' || replace(COALESCE(v_ver.description, ''), '"', '') || '"' || E'\n' ||
      '  #TRANS ' || v_ver.credit_code || ' {} -' || to_char(v_ver.credit_amount, 'FM999999990.00') ||
      ' ' || v_ver.date_str || ' "' || replace(COALESCE(v_ver.description, ''), '"', '') || '"' || E'\n' ||
      '}' || E'\n';

    v_voucher_num   := v_voucher_num + 1;
    v_voucher_count := v_voucher_count + 1;
    v_trans_count   := v_trans_count + 2;  -- 2 lines per voucher (debit + credit)
  END LOOP;

  -- ── 8. Compute SHA-256 hash ───────────────────────────────────────────────
  v_hash := encode(sha256(convert_to(v_content, 'UTF8')), 'hex');

  -- ── 9. Insert SIE4 export record ─────────────────────────────────────────
  INSERT INTO sie4_exports (
    organization_id,
    export_run_id,
    content_text,
    content_hash,
    voucher_count,
    transaction_count,
    from_date,
    to_date,
    fiscal_year_start,
    generated_at,
    generated_by
  )
  VALUES (
    v_run.organization_id,
    p_export_run_id,
    v_content,
    v_hash,
    v_voucher_count,
    v_trans_count,
    v_from_date,
    v_to_date,
    v_fiscal_start,
    now(),
    p_actor_id
  )
  RETURNING id INTO v_export_id;

  -- ── 10. Emit SIE4.Generated event ────────────────────────────────────────
  PERFORM insert_outbox_event(
    'SIE4.Generated',
    'accounting',
    jsonb_build_object(
      'sie4_export_id',   v_export_id,
      'export_run_id',    p_export_run_id,
      'voucher_count',    v_voucher_count,
      'transaction_count', v_trans_count,
      'from_date',        v_from_date,
      'to_date',          v_to_date,
      'content_hash',     v_hash,
      'generated_by',     p_actor_id
    ),
    v_run.organization_id,
    NULL
  );

  RETURN v_export_id;
END;
$$;

COMMENT ON FUNCTION public.generate_sie4_export(uuid, uuid) IS
  'Generates an immutable SIE4 bookkeeping file from a completed accounting export run. Idempotent — returns existing sie4_export_id if run already has one.';

-- ── Section 5: Permissions ────────────────────────────────────────────────────
-- Resource is 'sie' (not 'sie4') — format constraint prohibits digits in any
-- segment. SIE is the format family; type 4 is a protocol version, not a
-- resource discriminator. Action is 'export' — generating a SIE4 file is a
-- file-artifact operation consistent with finance:invoice:export and
-- finance:ledger:export. The 'run' action is reserved for pipeline triggers.

INSERT INTO public.permissions (code, domain, resource, action, description)
VALUES
  ('finance:sie:export', 'finance', 'sie', 'export', 'Generate a SIE4 bookkeeping file from a completed accounting export run'),
  ('finance:sie:read',   'finance', 'sie', 'read',   'Read and download SIE4 export files')
ON CONFLICT (code) DO NOTHING;
