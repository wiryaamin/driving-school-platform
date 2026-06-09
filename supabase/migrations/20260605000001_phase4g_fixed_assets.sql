-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260605000001_phase4g_fixed_assets.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4G — Fixed Assets, Accruals & Advanced Accounting (Core)
--
-- Implements the fixed asset subledger structural foundation:
--   • 3 new enum types: fixed_asset_status, depreciation_method, asset_disposal_type
--   • 12 new BAS 2020 accounts (anläggningstillgångar and periodiseringar)
--   • fixed_asset_classes — platform-global BAS-mapped asset class registry (4 seeded)
--   • fixed_assets — individual asset records with full lifecycle state machine
--   • asset_disposals — fully immutable disposal/write-off records
--
-- Accounting invariants enforced at DB level:
--   • acquisition_cost > residual_value (CHECK constraint)
--   • net_book_value >= 0 (CHECK constraint)
--   • Once status ∈ {active, impaired, fully_depreciated, disposed}:
--       acquisition_cost and residual_value are immutable (trigger guard)
--   • asset_disposals: fully immutable (trigger blocks ALL UPDATE/DELETE)
--   • gain_loss = proceeds - net_book_value_at_disposal (CHECK constraint)
--
-- Swedish BAS 2020 accounts added:
--   1110: Byggnader och markanläggningar       (Buildings)
--   1119: Ackumulerade avskrivningar byggnader  (Acc. depr. buildings — contra-asset)
--   1210: Maskiner och tekniska anläggningar    (Machinery)
--   1219: Ackumulerade avskrivningar maskiner   (Acc. depr. machinery — contra-asset)
--   1250: Inventarier, verktyg, installationer  (Equipment)
--   1259: Ackumulerade avskrivningar inventarier(Acc. depr. equipment — contra-asset)
--   1710: Förutbetalda kostnader                (Prepaid expenses)
--   2900: Upplupna kostnader                    (Accrued liabilities)
--   3970: Realisationsvinst anläggningstillgångar (Gain on disposal)
--   6970: Realisationsförlust anläggningstillgångar (Loss on disposal)
--   7810: Avskrivningar på byggnader            (Depreciation expense — buildings)
--   7820: Avskrivningar på maskiner/inventarier (Depreciation expense — equipment)
--
-- Dependencies:
--   20260601000001_phase4c_swedish_finance_foundation.sql — bas_account_catalog
--   20260602000001_phase4d_ledger_core.sql — journal_entries, has_permission
--   20260530000001_phase4a_commercial_core.sql — financial_periods
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ────────────────────────────────────────────────────

CREATE TYPE public.fixed_asset_status AS ENUM (
  'draft',             -- Registered but not yet active; pre-acquisition or import
  'active',            -- In productive use; scheduled depreciation applies
  'impaired',          -- NBV written down; depreciation continues on reduced basis
  'fully_depreciated', -- accumulated_depreciation = acquisition_cost - residual_value
  'disposed'           -- Sold, scrapped, or transferred; no further depreciation
);

CREATE TYPE public.depreciation_method AS ENUM (
  'straight_line',     -- Equal monthly amounts: depreciable_amount / useful_life_months
  'declining_balance', -- Double declining balance: 2 × (1/useful_life) × current NBV
  'none'               -- Non-depreciable asset (land); no schedule generated
);

CREATE TYPE public.asset_disposal_type AS ENUM (
  'sale',      -- Sold to third party; proceeds received
  'write_off', -- Scrapped or destroyed; zero proceeds
  'transfer',  -- Transferred to another entity (typically at book value)
  'trade_in'   -- Traded against a new asset purchase
);

-- ── Section 2: BAS 2020 Account Seeds (Phase 4G) ─────────────────────────────

INSERT INTO public.bas_account_catalog
  (account_code, account_name, account_name_en, account_type, normal_balance, sort_order)
VALUES
  -- Fixed asset cost accounts (anläggningstillgångar)
  ('1110', 'Byggnader och markanläggningar',
           'Buildings and land improvements',                  'asset',     'debit',  1110),
  ('1119', 'Ackumulerade avskrivningar på byggnader',
           'Accumulated depreciation — buildings',             'asset',     'credit', 1119),
  ('1210', 'Maskiner och andra tekniska anläggningar',
           'Machinery and technical equipment',                'asset',     'debit',  1210),
  ('1219', 'Ackumulerade avskrivningar på maskiner',
           'Accumulated depreciation — machinery',             'asset',     'credit', 1219),
  ('1250', 'Inventarier, verktyg och installationer',
           'Equipment, tools and installations',               'asset',     'debit',  1250),
  ('1259', 'Ackumulerade avskrivningar, inventarier',
           'Accumulated depreciation — equipment',             'asset',     'credit', 1259),
  -- Periodization accounts
  ('1710', 'Förutbetalda kostnader',
           'Prepaid expenses',                                 'asset',     'debit',  1710),
  ('2900', 'Upplupna kostnader och förutbetalda intäkter',
           'Accrued liabilities and deferred income',          'liability', 'credit', 2900),
  -- Disposal gain/loss
  ('3970', 'Realisationsvinst, anläggningstillgångar',
           'Gain on disposal of fixed assets',                 'revenue',   'credit', 3970),
  ('6970', 'Realisationsförlust, anläggningstillgångar',
           'Loss on disposal of fixed assets',                 'expense',   'debit',  6970),
  -- Depreciation expense
  ('7810', 'Avskrivningar på byggnader och markanläggningar',
           'Depreciation expense — buildings',                 'expense',   'debit',  7810),
  ('7820', 'Avskrivningar på maskiner och inventarier',
           'Depreciation expense — equipment',                 'expense',   'debit',  7820)
ON CONFLICT (account_code) DO NOTHING;

-- ── Section 3: Fixed Asset Classes ───────────────────────────────────────────
-- Platform-global registry that maps each asset type to its BAS accounts.
-- Seeded with 4 standard Swedish fixed asset classes.
-- Organizations inherit these classes; custom classes can be added per-org in future.

CREATE TABLE public.fixed_asset_classes (
  id                       uuid                       NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_code               text                       NOT NULL UNIQUE,
  class_name               text                       NOT NULL,
  class_name_en            text,
  asset_account            text                       NOT NULL REFERENCES public.bas_account_catalog(account_code),
  accumulated_depr_account text                       NOT NULL REFERENCES public.bas_account_catalog(account_code),
  depreciation_exp_account text                       NOT NULL REFERENCES public.bas_account_catalog(account_code),
  disposal_gain_account    text                       NOT NULL REFERENCES public.bas_account_catalog(account_code),
  disposal_loss_account    text                       NOT NULL REFERENCES public.bas_account_catalog(account_code),
  default_method           public.depreciation_method NOT NULL DEFAULT 'straight_line',
  default_useful_life_months int                      NOT NULL DEFAULT 60
                              CHECK (default_useful_life_months > 0),
  is_active                boolean                    NOT NULL DEFAULT true,
  created_at               timestamptz                NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fixed_asset_classes IS
  'Platform-global asset class registry. Maps each class to BAS accounts for '
  'acquisition (asset_account), depreciation (accumulated_depr_account, depreciation_exp_account), '
  'and disposal (disposal_gain_account, disposal_loss_account). '
  'Seeded with standard Swedish BAS 2020 classes.';
COMMENT ON COLUMN public.fixed_asset_classes.accumulated_depr_account IS
  'Contra-asset BAS account (credit-normal) for accumulated depreciation. '
  'e.g. 1119 (buildings), 1219 (machinery), 1259 (equipment).';

INSERT INTO public.fixed_asset_classes
  (class_code, class_name, class_name_en,
   asset_account, accumulated_depr_account, depreciation_exp_account,
   disposal_gain_account, disposal_loss_account,
   default_method, default_useful_life_months)
VALUES
  ('BUILDINGS', 'Byggnader och markanläggningar', 'Buildings and land improvements',
   '1110', '1119', '7810', '3970', '6970', 'straight_line', 360),
  ('MACHINERY',  'Maskiner och tekniska anläggningar', 'Machinery and technical equipment',
   '1210', '1219', '7820', '3970', '6970', 'straight_line', 120),
  ('EQUIPMENT',  'Inventarier och verktyg', 'Equipment and tools',
   '1250', '1259', '7820', '3970', '6970', 'straight_line', 60),
  ('COMPUTERS',  'Datorer och IT-utrustning', 'Computers and IT equipment',
   '1250', '1259', '7820', '3970', '6970', 'straight_line', 36)
ON CONFLICT (class_code) DO NOTHING;

-- ── Section 4: Fixed Assets ───────────────────────────────────────────────────
-- One row per physical or intangible asset. Tracks lifecycle from draft → active
-- through depreciation to disposal. net_book_value is maintained by the
-- depreciation and impairment posting functions.

CREATE TABLE public.fixed_assets (
  id                       uuid                       NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id          uuid                       NOT NULL REFERENCES public.organizations(id)       ON DELETE RESTRICT,
  asset_class_id           uuid                       NOT NULL REFERENCES public.fixed_asset_classes(id) ON DELETE RESTRICT,
  financial_period_id      uuid                                REFERENCES public.financial_periods(id)   ON DELETE RESTRICT,
  asset_code               text                       NOT NULL,
  asset_name               text                       NOT NULL,
  description              text,
  acquisition_date         date                       NOT NULL,
  acquisition_cost         numeric(14,2)              NOT NULL CHECK (acquisition_cost > 0),
  residual_value           numeric(14,2)              NOT NULL DEFAULT 0 CHECK (residual_value >= 0),
  useful_life_months       int                        NOT NULL CHECK (useful_life_months > 0),
  depreciation_method      public.depreciation_method NOT NULL DEFAULT 'straight_line',
  status                   public.fixed_asset_status  NOT NULL DEFAULT 'draft',
  net_book_value           numeric(14,2)              NOT NULL CHECK (net_book_value >= 0),
  accumulated_depreciation numeric(14,2)              NOT NULL DEFAULT 0
                            CHECK (accumulated_depreciation >= 0),
  periods_posted           int                        NOT NULL DEFAULT 0
                            CHECK (periods_posted >= 0),
  acquisition_entry_id     uuid                                REFERENCES public.journal_entries(id)     ON DELETE RESTRICT,
  last_depreciation_date   date,
  fully_depreciated_at     date,
  disposal_id              uuid,  -- back-reference set by post_asset_disposal()
  notes                    text,
  metadata                 jsonb                      NOT NULL DEFAULT '{}',
  created_at               timestamptz                NOT NULL DEFAULT now(),
  updated_at               timestamptz                NOT NULL DEFAULT now(),
  created_by               uuid                                REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by               uuid                                REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT fa_residual_lt_cost       CHECK (residual_value < acquisition_cost),
  CONSTRAINT fa_nbv_nonneg             CHECK (net_book_value >= 0),
  CONSTRAINT fa_acc_depr_lte_cost      CHECK (accumulated_depreciation <= acquisition_cost),
  CONSTRAINT fa_asset_code_org_unique  UNIQUE (organization_id, asset_code)
);

COMMENT ON TABLE public.fixed_assets IS
  'Fixed asset subledger. One row per asset. '
  'net_book_value = acquisition_cost - accumulated_depreciation (maintained by posting functions). '
  'Once active: acquisition_cost and residual_value are immutable (trigger guard). '
  'Use post_impairment_adjustment() to write down NBV on active assets. '
  'Use post_asset_disposal() to record disposals (creates immutable asset_disposals record).';
COMMENT ON COLUMN public.fixed_assets.periods_posted IS
  'Count of depreciation periods posted = MAX(period_number) in depreciation_schedules WHERE is_posted.';
COMMENT ON COLUMN public.fixed_assets.disposal_id IS
  'Back-reference to asset_disposals.id, set by post_asset_disposal(). NULL until disposed.';

CREATE TRIGGER set_fixed_assets_updated_at
  BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Guard: block modification of acquisition_cost and residual_value once asset is active.
-- Corrections to asset value must go through post_impairment_adjustment() to maintain audit trail.
CREATE OR REPLACE FUNCTION public.prevent_active_asset_cost_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('active', 'impaired', 'fully_depreciated', 'disposed') THEN
    IF NEW.acquisition_cost <> OLD.acquisition_cost THEN
      RAISE EXCEPTION
        'ASSET_COST_IMMUTABLE: acquisition_cost cannot be changed once the asset is active. '
        'Use post_impairment_adjustment() to write down the net book value.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.residual_value <> OLD.residual_value THEN
      RAISE EXCEPTION
        'ASSET_RESIDUAL_IMMUTABLE: residual_value cannot be changed on an active asset.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_active_asset_cost_mutation() IS
  'BEFORE UPDATE guard on fixed_assets. '
  'Blocks changes to acquisition_cost and residual_value once status ∈ {active, impaired, fully_depreciated, disposed}. '
  'Enforces immutable asset accounting principle.';

CREATE TRIGGER fixed_assets_cost_immutability
  BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.prevent_active_asset_cost_mutation();

-- ── Section 5: Asset Disposals ────────────────────────────────────────────────
-- Fully immutable disposal records. One per asset (UNIQUE on asset_id).
-- Created by post_asset_disposal(). No further UPDATE or DELETE permitted.

CREATE TABLE public.asset_disposals (
  id                         uuid                       NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id            uuid                       NOT NULL REFERENCES public.organizations(id)   ON DELETE RESTRICT,
  asset_id                   uuid                       NOT NULL UNIQUE
                               REFERENCES public.fixed_assets(id)  ON DELETE RESTRICT,
  disposal_type              public.asset_disposal_type NOT NULL,
  disposal_date              date                       NOT NULL,
  net_book_value_at_disposal numeric(14,2)              NOT NULL CHECK (net_book_value_at_disposal >= 0),
  proceeds                   numeric(14,2)              NOT NULL DEFAULT 0 CHECK (proceeds >= 0),
  gain_loss                  numeric(14,2)              NOT NULL,
  journal_entry_id           uuid                                REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  notes                      text,
  metadata                   jsonb                      NOT NULL DEFAULT '{}',
  created_at                 timestamptz                NOT NULL DEFAULT now(),
  created_by                 uuid                                REFERENCES auth.users(id)             ON DELETE SET NULL,

  CONSTRAINT ad_gain_loss_consistent
    CHECK (ABS(gain_loss - (proceeds - net_book_value_at_disposal)) < 0.01)
);

COMMENT ON TABLE public.asset_disposals IS
  'Immutable fixed asset disposal records. One record per disposed asset. '
  'gain_loss = proceeds - net_book_value_at_disposal (positive = gain, negative = loss). '
  'Created by post_asset_disposal(). ALL UPDATE/DELETE blocked by trigger.';
COMMENT ON COLUMN public.asset_disposals.gain_loss IS
  'Realized gain (positive) or loss (negative) on disposal. '
  'gain = proceeds > NBV: CR 3970 Realisationsvinst. '
  'loss = proceeds < NBV: DR 6970 Realisationsförlust.';

CREATE OR REPLACE FUNCTION public.prevent_asset_disposal_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'ASSET_DISPOSAL_IMMUTABLE: disposal records are permanent accounting entries. '
    'Corrections require a manual journal entry adjustment.'
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.prevent_asset_disposal_mutation() IS
  'BEFORE UPDATE OR DELETE guard on asset_disposals. Fully immutable.';

CREATE TRIGGER asset_disposals_immutability
  BEFORE UPDATE OR DELETE ON public.asset_disposals
  FOR EACH ROW EXECUTE FUNCTION public.prevent_asset_disposal_mutation();

-- ── Section 6: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.fixed_asset_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_assets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_disposals     ENABLE ROW LEVEL SECURITY;

-- fixed_asset_classes: platform-global reference; authenticated users read active classes
CREATE POLICY "fac_authenticated_read"
  ON public.fixed_asset_classes FOR SELECT
  USING (is_active = true);

CREATE POLICY "fa_org_read"
  ON public.fixed_assets FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:assets:read')
  );

CREATE POLICY "ad_org_read"
  ON public.asset_disposals FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:assets:read')
  );

-- ── Section 7: Table Grants ───────────────────────────────────────────────────

GRANT SELECT                   ON public.fixed_asset_classes TO authenticated, service_role;
GRANT SELECT                   ON public.fixed_assets        TO authenticated;
GRANT SELECT, INSERT, UPDATE   ON public.fixed_assets        TO service_role;
GRANT SELECT                   ON public.asset_disposals      TO authenticated;
GRANT SELECT, INSERT           ON public.asset_disposals      TO service_role;

-- ── Section 8: Permissions ────────────────────────────────────────────────────

INSERT INTO public.permissions (code, domain, resource, action, description) VALUES
  ('finance:assets:read',       'finance', 'assets',    'read',       'View fixed assets, depreciation schedules, and disposal records'),
  ('finance:assets:manage',     'finance', 'assets',    'manage',     'Register and manage fixed assets'),
  ('finance:assets:depreciate', 'finance', 'assets',    'depreciate', 'Post depreciation and impairment journal entries'),
  ('finance:accruals:read',     'finance', 'accruals',  'read',       'View accrual schedules and deferred revenue releases'),
  ('finance:accruals:manage',   'finance', 'accruals',  'manage',     'Create and manage accrual and prepaid expense schedules'),
  ('finance:integrity:read',    'finance', 'integrity', 'read',       'View fiscal integrity checks and replay validation results'),
  ('finance:integrity:manage',  'finance', 'integrity', 'manage',     'Run replay validations and generate canonical accounting exports')
ON CONFLICT (code) DO NOTHING;

-- org_owner, org_admin, finance_admin: full Phase 4G access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin', 'finance_admin')
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:assets:read', 'finance:assets:manage', 'finance:assets:depreciate',
    'finance:accruals:read', 'finance:accruals:manage',
    'finance:integrity:read', 'finance:integrity:manage'
  ])
ON CONFLICT DO NOTHING;

-- org_manager: read-only access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_manager'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:assets:read', 'finance:accruals:read', 'finance:integrity:read'
  ])
ON CONFLICT DO NOTHING;
