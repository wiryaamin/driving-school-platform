-- ============================================================
-- Phase 4C — Swedish VAT Architecture
-- VAT periods (momsperioder), transaction entries, period
-- locking with immutability trigger, and summary views.
-- ============================================================

-- ── Section 1: Enums ─────────────────────────────────────────────────────────

CREATE TYPE public.vat_period_frequency AS ENUM ('monthly', 'quarterly', 'annually');
CREATE TYPE public.vat_period_status    AS ENUM ('open', 'locked', 'filed', 'amended');

-- ── Section 2: VAT Periods (momsperioder) ────────────────────────────────────

CREATE TABLE public.vat_periods (
  id                uuid                        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid                        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start      date                        NOT NULL,
  period_end        date                        NOT NULL,
  frequency         public.vat_period_frequency NOT NULL DEFAULT 'monthly',
  status            public.vat_period_status    NOT NULL DEFAULT 'open',
  filing_reference  text,
  filed_at          timestamptz,
  filed_by          uuid                        REFERENCES auth.users(id),
  locked_at         timestamptz,
  locked_by         uuid                        REFERENCES auth.users(id),
  total_output_vat  numeric(12,2)               NOT NULL DEFAULT 0,
  total_input_vat   numeric(12,2)               NOT NULL DEFAULT 0,
  net_vat_payable   numeric(12,2)               NOT NULL DEFAULT 0,
  notes             text,
  metadata          jsonb                       NOT NULL DEFAULT '{}',
  created_at        timestamptz                 NOT NULL DEFAULT now(),
  updated_at        timestamptz                 NOT NULL DEFAULT now(),

  CONSTRAINT vat_periods_org_dates_unique UNIQUE (organization_id, period_start, period_end),
  CONSTRAINT vat_period_dates_check       CHECK  (period_end >= period_start)
);

CREATE TRIGGER set_vat_periods_updated_at
  BEFORE UPDATE ON public.vat_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.vat_periods IS
  'Swedish VAT reporting periods (momsperioder). Once filed/locked, immutable.';

-- ── Section 3: VAT Report Entries ────────────────────────────────────────────

CREATE TABLE public.vat_report_entries (
  id               uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vat_period_id    uuid          NOT NULL REFERENCES public.vat_periods(id),
  invoice_id       uuid          REFERENCES public.invoices(id),
  transaction_date date          NOT NULL,
  vat_rate_code    text          REFERENCES public.vat_rates(rate_code),
  net_amount       numeric(12,2) NOT NULL,
  vat_amount       numeric(12,2) NOT NULL,
  gross_amount     numeric(12,2) NOT NULL,
  bas_account      text          NOT NULL,
  vat_account      text,
  description      text,
  source_type      text          NOT NULL CHECK (source_type IN ('invoice','refund','credit_note','adjustment')),
  source_id        uuid          NOT NULL,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vat_report_entries IS
  'Transaction-level VAT entries that feed into a VAT period summary for Skatteverket.';

-- ── Section 4: RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.vat_periods       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_report_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vat_periods_org_isolation"
  ON public.vat_periods
  FOR ALL
  USING (organization_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid);

CREATE POLICY "vat_report_entries_org_isolation"
  ON public.vat_report_entries
  FOR ALL
  USING (organization_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid);

-- ── Section 5: Immutability Trigger — prevent VAT period unlock ───────────────

CREATE OR REPLACE FUNCTION public.prevent_vat_period_unlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Once a VAT period reaches 'locked' or 'filed', it cannot be reopened to 'open'
  IF OLD.status IN ('locked', 'filed') AND NEW.status = 'open' THEN
    RAISE EXCEPTION 'VAT_PERIOD_IMMUTABLE: period % cannot be re-opened once % — Swedish accounting law prohibits unlocking filed periods',
      OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vat_period_immutability_guard
  BEFORE UPDATE ON public.vat_periods
  FOR EACH ROW EXECUTE FUNCTION public.prevent_vat_period_unlock();

-- ── Section 6: SECURITY DEFINER Functions ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_vat_period(
  p_org_id        uuid,
  p_period_start  date,
  p_period_end    date,
  p_frequency     public.vat_period_frequency DEFAULT 'monthly',
  p_actor_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.populate_vat_period(
  p_period_id uuid,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS int  -- rows inserted
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period    vat_periods%ROWTYPE;
  v_count     int := 0;
  v_invoice   RECORD;
BEGIN
  SELECT * INTO v_period FROM vat_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT_PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
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
$$;

CREATE OR REPLACE FUNCTION public.lock_vat_period(
  p_period_id      uuid,
  p_actor_id       uuid,
  p_filing_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period vat_periods%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM vat_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAT_PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
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
$$;

-- ── Section 7: Summary View ───────────────────────────────────────────────────

CREATE VIEW public.v_vat_period_summary
WITH (security_invoker = true)
AS
SELECT
  vp.id,
  vp.organization_id,
  vp.period_start,
  vp.period_end,
  vp.frequency,
  vp.status,
  vp.filing_reference,
  vp.filed_at,
  vp.locked_at,
  vp.total_output_vat,
  vp.total_input_vat,
  vp.net_vat_payable,
  COUNT(vre.id)             AS entry_count,
  SUM(vre.net_amount)       AS total_net_amount,
  SUM(vre.gross_amount)     AS total_gross_amount,
  vp.created_at,
  vp.updated_at
FROM public.vat_periods vp
LEFT JOIN public.vat_report_entries vre ON vre.vat_period_id = vp.id
GROUP BY
  vp.id, vp.organization_id, vp.period_start, vp.period_end,
  vp.frequency, vp.status, vp.filing_reference, vp.filed_at, vp.locked_at,
  vp.total_output_vat, vp.total_input_vat, vp.net_vat_payable,
  vp.created_at, vp.updated_at;

COMMENT ON VIEW public.v_vat_period_summary IS
  'VAT period overview with totals and entry counts. SECURITY INVOKER — RLS on underlying tables.';

-- ── Section 8: Permissions ────────────────────────────────────────────────────

INSERT INTO public.permissions (code, domain, resource, action, description)
VALUES
  ('finance:vat:read',   'finance', 'vat', 'read',   'Read VAT periods and report entries'),
  ('finance:vat:manage', 'finance', 'vat', 'manage', 'Create and lock VAT periods (momsperioder)')
ON CONFLICT (code) DO NOTHING;
