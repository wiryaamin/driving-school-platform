-- ============================================================
-- Phase 4C — Swedish Finance Foundation
-- BAS 2020 account catalog, VAT rate table, platform event
-- mappings, and per-org chart bootstrap seed function.
-- ============================================================

-- ── Section 1: BAS 2020 Account Catalog (platform-global) ────────────────────

CREATE TABLE public.bas_account_catalog (
  id              uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_code    text    NOT NULL UNIQUE,
  account_name    text    NOT NULL,
  account_name_en text,
  account_type    text    NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense','vat')),
  normal_balance  text    NOT NULL CHECK (normal_balance IN ('debit','credit')),
  vat_code        text,
  parent_code     text,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bas_account_catalog IS
  'Platform-global BAS 2020 chart of accounts. Not per-org — shared reference data.';

-- ── Section 2: VAT Rate Table ─────────────────────────────────────────────────

CREATE TABLE public.vat_rates (
  id              uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rate_code       text          NOT NULL UNIQUE,   -- SE25, SE12, SE6, SE0
  rate_percent    numeric(5,4)  NOT NULL,           -- 0.2500, 0.1200, 0.0600, 0.0000
  description     text          NOT NULL,
  description_en  text,
  is_standard     boolean       NOT NULL DEFAULT false,
  effective_from  date          NOT NULL,
  effective_to    date,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT vat_rates_rate_check CHECK (rate_percent >= 0 AND rate_percent < 1)
);

COMMENT ON TABLE public.vat_rates IS
  'Swedish VAT rate catalog (momsatser). SE25=25%, SE12=12%, SE6=6%, SE0=0%.';

-- ── Section 3: Platform BAS Event Mappings ────────────────────────────────────

CREATE TABLE public.platform_bas_event_mappings (
  id              uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type      text    NOT NULL UNIQUE,
  account_debit   text    NOT NULL REFERENCES public.bas_account_catalog(account_code),
  account_credit  text    NOT NULL REFERENCES public.bas_account_catalog(account_code),
  vat_rate_code   text    REFERENCES public.vat_rates(rate_code),
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_bas_event_mappings IS
  'Default debit/credit BAS account mapping for each domain event type.';

-- ── Section 4: Extend accounting_chart_of_accounts with BAS columns ──────────

ALTER TABLE public.accounting_chart_of_accounts
  ADD COLUMN IF NOT EXISTS bas_account_debit_id  uuid REFERENCES public.bas_account_catalog(id),
  ADD COLUMN IF NOT EXISTS bas_account_credit_id uuid REFERENCES public.bas_account_catalog(id),
  ADD COLUMN IF NOT EXISTS vat_rate_code         text REFERENCES public.vat_rates(rate_code);

COMMENT ON COLUMN public.accounting_chart_of_accounts.bas_account_debit_id  IS 'Maps to BAS 2020 debit account for this event type.';
COMMENT ON COLUMN public.accounting_chart_of_accounts.bas_account_credit_id IS 'Maps to BAS 2020 credit account for this event type.';
COMMENT ON COLUMN public.accounting_chart_of_accounts.vat_rate_code         IS 'Swedish VAT rate applied when this event type involves VAT.';

-- ── Section 5: Seed BAS 2020 Accounts ────────────────────────────────────────

INSERT INTO public.bas_account_catalog
  (account_code, account_name, account_name_en, account_type, normal_balance, sort_order)
VALUES
  -- Assets (1xxx)
  ('1500', 'Kundfordringar',               'Accounts receivable',            'asset',     'debit',   1500),
  ('1510', 'Kundfordringar',               'Trade receivables',               'asset',     'debit',   1510),
  ('1630', 'Avräkning för skatter och avgifter', 'Tax settlement account',    'asset',     'debit',   1630),
  ('1920', 'PlusGirot',                    'PlusGiro',                        'asset',     'debit',   1920),
  ('1930', 'Företagskonto / checkkonto',   'Business account / checking',     'asset',     'debit',   1930),
  ('1940', 'Bankgiro',                     'BankGiro',                        'asset',     'debit',   1940),

  -- Liabilities (2xxx)
  ('2420', 'Skulder till kreditinstitut',  'Liabilities to credit institutions', 'liability', 'credit', 2420),
  ('2421', 'Förskottsbetalning kunder',    'Customer advance payments',       'liability', 'credit',  2421),

  -- VAT accounts (2xxx)
  ('2610', 'Utgående moms, 25%',           'Output VAT 25%',                  'vat',       'credit',  2610),
  ('2611', 'Utgående moms, 25% (varor)',   'Output VAT 25% (goods)',          'vat',       'credit',  2611),
  ('2640', 'Ingående moms',                'Input VAT',                       'vat',       'debit',   2640),
  ('2641', 'Ingående moms att lyfta',      'Input VAT to recover',            'vat',       'debit',   2641),
  ('2650', 'Redovisningskonto för moms',   'VAT clearing account',            'vat',       'credit',  2650),

  -- Accruals / other liabilities (2xxx)
  ('2970', 'Förutbetalda intäkter',        'Deferred revenue',                'liability', 'credit',  2970),

  -- Revenue (3xxx)
  ('3040', 'Försäljning tjänster, 25%',    'Sales services 25% VAT',          'revenue',   'credit',  3040),
  ('3041', 'Försäljning körlektioner',     'Sales driving lessons',           'revenue',   'credit',  3041),

  -- Credit notes (3xxx)
  ('3740', 'Öresutjämning / rabatter',     'Rounding / discounts granted',    'revenue',   'debit',   3740),

  -- Operating expenses (5xxx-6xxx)
  ('5600', 'Förbrukningsinventarier',      'Low-value assets / consumables',  'expense',   'debit',   5600),
  ('6570', 'Bankkostnader',                'Bank charges',                    'expense',   'debit',   6570),

  -- Personnel (7xxx)
  ('7010', 'Lön',                          'Salaries',                        'expense',   'debit',   7010),

  -- Financial income/expense (8xxx)
  ('8310', 'Ränteintäkter',               'Interest income',                  'revenue',   'credit',  8310),
  ('8410', 'Räntekostnader',              'Interest expense',                  'expense',   'debit',   8410)
ON CONFLICT (account_code) DO NOTHING;

-- ── Section 6: Seed VAT Rates ────────────────────────────────────────────────

INSERT INTO public.vat_rates
  (rate_code, rate_percent, description, description_en, is_standard, effective_from)
VALUES
  ('SE25', 0.2500, 'Normalskattesats 25%',      'Standard rate 25%',    true,  '1995-01-01'),
  ('SE12', 0.1200, 'Reducerad skattesats 12%',   'Reduced rate 12%',     false, '1995-01-01'),
  ('SE6',  0.0600, 'Reducerad skattesats 6%',    'Reduced rate 6%',      false, '1995-01-01'),
  ('SE0',  0.0000, 'Noll-skattesats / momsfritt', 'Zero-rated / exempt', false, '1995-01-01')
ON CONFLICT (rate_code) DO NOTHING;

-- ── Section 7: Seed Platform BAS Event Mappings ───────────────────────────────

INSERT INTO public.platform_bas_event_mappings
  (event_type, account_debit, account_credit, vat_rate_code, description)
VALUES
  ('Invoice.Issued',      '1510', '3041', 'SE25', 'Fakturering — kundfordran + intäkt'),
  ('Invoice.Paid',        '1930', '1510', NULL,   'Betalning mottagen — bank + kundfordran'),
  ('Payment.Received',    '1930', '1510', NULL,   'Inbetalning — alias för Invoice.Paid'),
  ('Refund.Processed',    '3041', '1930', 'SE25', 'Återbetalning — intäktskorrigering'),
  ('Credit.Granted',      '2421', '2970', NULL,   'Förskottsbetalning mottagen'),
  ('Credit.Consumed',     '2970', '3041', 'SE25', 'Kredit löst in mot intäkt'),
  ('Package.Purchased',   '1930', '2421', NULL,   'Paketköp — bank + kundförskott'),
  ('Payment.Reconciled',  '1930', '1510', NULL,   'Reconciliering — bank + kundfordran')
ON CONFLICT (event_type) DO NOTHING;

-- ── Section 8: Helper Functions ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_bas_account(p_code text)
RETURNS public.bas_account_catalog
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM bas_account_catalog WHERE account_code = p_code AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.seed_org_chart_of_accounts(
  p_org_id    uuid,
  p_actor_id  uuid
)
RETURNS int  -- rows inserted
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_debit_id  uuid;
  v_credit_id uuid;
  v_mapping   public.platform_bas_event_mappings%ROWTYPE;
BEGIN
  FOR v_mapping IN
    SELECT * FROM platform_bas_event_mappings WHERE is_active = true
  LOOP
    SELECT id INTO v_debit_id  FROM bas_account_catalog WHERE account_code = v_mapping.account_debit;
    SELECT id INTO v_credit_id FROM bas_account_catalog WHERE account_code = v_mapping.account_credit;

    INSERT INTO accounting_chart_of_accounts (
      organization_id,
      event_type,
      bas_account_debit_id,
      bas_account_credit_id,
      vat_rate_code,
      is_active,
      created_by
    )
    VALUES (
      p_org_id,
      v_mapping.event_type,
      v_debit_id,
      v_credit_id,
      v_mapping.vat_rate_code,
      true,
      p_actor_id
    )
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── Section 9: RLS ────────────────────────────────────────────────────────────

-- bas_account_catalog: platform-global, all authenticated users can read
ALTER TABLE public.bas_account_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bas_account_catalog_read"
  ON public.bas_account_catalog
  FOR SELECT
  USING (is_active = true);

-- vat_rates: platform-global, all authenticated users can read
ALTER TABLE public.vat_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vat_rates_read"
  ON public.vat_rates
  FOR SELECT
  USING (true);

-- platform_bas_event_mappings: platform-global, all authenticated users can read
ALTER TABLE public.platform_bas_event_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_bas_event_mappings_read"
  ON public.platform_bas_event_mappings
  FOR SELECT
  USING (is_active = true);

-- ── Section 10: Permissions ───────────────────────────────────────────────────

INSERT INTO public.permissions (code, domain, resource, action, description)
VALUES
  ('finance:bas:read',   'finance', 'bas', 'read',   'Read BAS account catalog and event mappings'),
  ('finance:bas:manage', 'finance', 'bas', 'manage', 'Manage BAS account mappings per organization')
ON CONFLICT (code) DO NOTHING;
