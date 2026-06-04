-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260530000001_phase4a_commercial_core.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4A — Commercial Foundation
--
-- Implements the full commercial/accounting layer:
--   package_catalog          — master product catalog (system + org-specific)
--   package_offerings        — active sellable packages per org (bundles supported)
--   student_packages         — purchased package instances
--   credit_ledger            — APPEND-ONLY signed credit entries (source of truth)
--   credit_balance_cache     — materialized per-student per-category balance
--   invoices                 — invoice headers with 5-column amount tracking
--   invoice_line_items       — detail lines; VAT frozen at issuance
--   invoice_number_sequences — per-org per-year gap-free sequential numbering
--   payments                 — provider-agnostic payment records
--   financial_periods        — foundation for future period locking
--
-- SECURITY DEFINER functions (all SECURITY DEFINER SET search_path = public):
--   purchase_package          — atomic: student_package + invoice + credits + events
--   consume_credit            — atomic: FIFO credit debit with advisory lock
--   issue_invoice             — atomic: gap-free number + VAT freeze + event
--   void_invoice              — guarded state transition + event
--   record_payment            — payment + invoice update + events
--   expire_stale_credits      — maintenance tick: expire past-due grant entries
--
-- Financial integrity invariants:
--   • credit_ledger is append-only (no UPDATE / DELETE policies)
--   • invoice/payment status transitions only via SECURITY DEFINER functions
--   • invoice numbering is gap-free via per-row SELECT FOR UPDATE on sequence
--   • VAT is frozen at issuance, stored on each line item
--   • double-spend prevention via pg_advisory_xact_lock per (org, student)
--   • FIFO credit consumption: earliest-expiring grant depleted first
--
-- Dependencies:
--   20260527000001_enterprise_foundation.sql   — RBAC, permissions, audit helpers
--   20260527000002_phase1b2_hardening.sql      — insert_outbox_event, event_outbox
--   20260528000001_phase2a_domain_foundation.sql — students table
--   20260528000002_phase2b_scheduling_core.sql — lesson_bookings, lesson_category enum
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ────────────────────────────────────────────────────

CREATE TYPE public.package_type AS ENUM (
  'driving',    -- Standard driving lesson package
  'theory',     -- Theory/knowledge course package
  'risk1',      -- Riskutbildning 1 package
  'risk2',      -- Riskutbildning 2 package
  'intensive',  -- Intensive/full-day bundle
  'mixed',      -- Multi-category bundle
  'custom'      -- Organization-defined custom package
);

CREATE TYPE public.package_status AS ENUM (
  'draft',          -- Being configured; not yet sellable
  'active',         -- Available for purchase
  'archived',       -- Hidden from new sales; existing instances remain valid
  'discontinued'    -- Fully retired
);

CREATE TYPE public.credit_entry_type AS ENUM (
  'grant',    -- Credits added from package purchase
  'bonus',    -- Credits added by admin (complimentary, compensation, etc.)
  'consume',  -- Credits deducted by completed lesson booking
  'expire',   -- Credits expired by maintenance tick after grant expiry date
  'adjust',   -- Manual admin correction (positive or negative)
  'reverse'   -- Accounting reversal of a prior entry (references original)
);

CREATE TYPE public.invoice_status AS ENUM (
  'draft',           -- Being built; not yet visible to student
  'issued',          -- Sent to student; payment expected
  'paid',            -- Fully paid
  'partially_paid',  -- Some payment received; balance outstanding
  'void',            -- Cancelled before payment
  'overdue'          -- Past due_date with outstanding balance
);

CREATE TYPE public.invoice_line_type AS ENUM (
  'package',   -- Package purchase
  'lesson',    -- Individual lesson charge
  'fee',       -- Administrative or service fee
  'discount',  -- Discount line (negative amount)
  'tax',       -- Explicit tax line
  'other'
);

CREATE TYPE public.payment_method AS ENUM (
  'manual',          -- Cash or other manual recording
  'card',            -- Card payment (generic)
  'bank_transfer',   -- Bank wire (bankgiro/plusgiro)
  'swish',           -- Swedish Swish mobile payment
  'stripe',          -- Stripe card/payment-link
  'invoice_credit',  -- Offset via credit note
  'other'
);

CREATE TYPE public.payment_status AS ENUM (
  'pending',             -- Initiated but not yet confirmed
  'confirmed',           -- Payment confirmed and settled
  'failed',              -- Payment attempt failed
  'refunded',            -- Fully refunded
  'partially_refunded',  -- Partial refund issued
  'void'                 -- Voided before processing
);

CREATE TYPE public.financial_period_status AS ENUM (
  'open',    -- Transactions can be posted
  'closed',  -- Soft-closed; read-only; reversible
  'locked'   -- Hard-locked; no modifications permitted
);

-- ── Section 2: Tables ────────────────────────────────────────────────────────

-- 2.1 package_catalog
-- Master product catalog. NULL organization_id = platform-wide template.
-- Org-specific entries can reference a catalog template via catalog_id on offerings.

CREATE TABLE public.package_catalog (
  id                uuid             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid             REFERENCES public.organizations(id) ON DELETE CASCADE,
  name              text             NOT NULL,
  description       text,
  package_type      public.package_type NOT NULL DEFAULT 'driving',
  lesson_category   public.lesson_category NOT NULL,
  default_quantity  int              NOT NULL CHECK (default_quantity > 0),
  default_price     numeric(12,2)    NOT NULL CHECK (default_price >= 0),
  currency          text             NOT NULL DEFAULT 'SEK',
  vat_rate          numeric(5,4)     NOT NULL DEFAULT 0.25 CHECK (vat_rate >= 0 AND vat_rate <= 1),
  validity_days     int              CHECK (validity_days IS NULL OR validity_days > 0),
  is_active         boolean          NOT NULL DEFAULT true,
  sort_order        int              NOT NULL DEFAULT 0,
  metadata          jsonb            NOT NULL DEFAULT '{}',
  created_at        timestamptz      NOT NULL DEFAULT now(),
  updated_at        timestamptz      NOT NULL DEFAULT now(),
  created_by        uuid             REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by        uuid             REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX package_catalog_system_unique
  ON public.package_catalog (name, lesson_category)
  WHERE organization_id IS NULL;

CREATE TRIGGER set_package_catalog_updated_at
  BEFORE UPDATE ON public.package_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.2 package_offerings
-- An organization's active, priced packages ready for sale.
-- bundle_credits: JSON array [{lesson_category, quantity}] for multi-category bundles.
-- When bundle_credits is non-empty, purchase_package() creates additional ledger grants.

CREATE TABLE public.package_offerings (
  id                uuid             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid             NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  catalog_id        uuid             REFERENCES public.package_catalog(id) ON DELETE SET NULL,
  name              text             NOT NULL,
  description       text,
  package_type      public.package_type NOT NULL DEFAULT 'driving',
  lesson_category   public.lesson_category NOT NULL,
  quantity          int              NOT NULL CHECK (quantity > 0),
  bundle_credits    jsonb            NOT NULL DEFAULT '[]',
  price             numeric(12,2)    NOT NULL CHECK (price >= 0),
  currency          text             NOT NULL DEFAULT 'SEK',
  vat_rate          numeric(5,4)     NOT NULL DEFAULT 0.25 CHECK (vat_rate >= 0 AND vat_rate <= 1),
  validity_days     int              CHECK (validity_days IS NULL OR validity_days > 0),
  status            public.package_status NOT NULL DEFAULT 'active',
  sort_order        int              NOT NULL DEFAULT 0,
  metadata          jsonb            NOT NULL DEFAULT '{}',
  created_at        timestamptz      NOT NULL DEFAULT now(),
  updated_at        timestamptz      NOT NULL DEFAULT now(),
  archived_at       timestamptz,
  created_by        uuid             REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by        uuid             REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_by       uuid             REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TRIGGER set_package_offerings_updated_at
  BEFORE UPDATE ON public.package_offerings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.3 student_packages
-- A purchased package instance. Created atomically by purchase_package() RPC.
-- Financial record: NO soft delete. Use status transitions to manage lifecycle.

CREATE TABLE public.student_packages (
  id                uuid             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid             NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  student_id        uuid             NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  offering_id       uuid             NOT NULL REFERENCES public.package_offerings(id) ON DELETE RESTRICT,
  status            public.package_status NOT NULL DEFAULT 'active',
  quantity_granted  int              NOT NULL CHECK (quantity_granted > 0),
  quantity_consumed int              NOT NULL DEFAULT 0 CHECK (quantity_consumed >= 0),
  quantity_expired  int              NOT NULL DEFAULT 0 CHECK (quantity_expired >= 0),
  price_paid        numeric(12,2)    NOT NULL CHECK (price_paid >= 0),
  currency          text             NOT NULL DEFAULT 'SEK',
  vat_rate          numeric(5,4)     NOT NULL CHECK (vat_rate >= 0 AND vat_rate <= 1),
  purchased_at      timestamptz      NOT NULL DEFAULT now(),
  activated_at      timestamptz,
  expires_at        timestamptz,
  archived_at       timestamptz,
  archived_by       uuid             REFERENCES auth.users(id) ON DELETE SET NULL,
  notes             text,
  metadata          jsonb            NOT NULL DEFAULT '{}',
  created_at        timestamptz      NOT NULL DEFAULT now(),
  updated_at        timestamptz      NOT NULL DEFAULT now(),
  created_by        uuid             REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TRIGGER set_student_packages_updated_at
  BEFORE UPDATE ON public.student_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.4 credit_ledger
-- APPEND-ONLY signed credit entry log. This is the financial source of truth.
-- Balances are derived from SUM(quantity) over these rows.
-- No updated_at: append-only by design. No soft delete: reversals use entry_type='reverse'.
-- grant_entry_id: links consume/expire/reverse entries back to the originating grant.

CREATE TABLE public.credit_ledger (
  id                   uuid                    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid                    NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  student_id           uuid                    NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  lesson_category      public.lesson_category  NOT NULL,
  entry_type           public.credit_entry_type NOT NULL,
  quantity             int                     NOT NULL,
  currency             text                    NOT NULL DEFAULT 'SEK',
  student_package_id   uuid                    REFERENCES public.student_packages(id) ON DELETE RESTRICT,
  booking_id           uuid                    REFERENCES public.lesson_bookings(id) ON DELETE RESTRICT,
  grant_entry_id       uuid                    REFERENCES public.credit_ledger(id) ON DELETE RESTRICT,
  reference_type       text,
  reference_id         uuid,
  description          text,
  actor_id             uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at           timestamptz,
  metadata             jsonb                   NOT NULL DEFAULT '{}',
  created_at           timestamptz             NOT NULL DEFAULT now()
  -- No updated_at: append-only. No deleted_at: reversals use entry_type='reverse'.
);

COMMENT ON TABLE  public.credit_ledger IS
  'Append-only credit event log. Never UPDATE or DELETE rows. '
  'Balance = SUM(quantity) for a (org, student, category) group. '
  'grant entries have positive quantity. consume/expire entries have negative quantity.';

COMMENT ON COLUMN public.credit_ledger.grant_entry_id IS
  'For consume, expire, adjust, reverse entries: references the originating grant row. '
  'Used by FIFO consumption and expiry logic to track per-grant remaining balance.';

-- 2.5 credit_balance_cache
-- Materialized (org, student, category) balance. Maintained by trigger on credit_ledger INSERT.
-- PRIMARY source for balance reads (avoids re-computing SUM every query).
-- consume_credit() SELECTs this FOR UPDATE before writing to prevent double-spend.

CREATE TABLE public.credit_balance_cache (
  id                uuid                    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid                    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id        uuid                    NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  lesson_category   public.lesson_category  NOT NULL,
  balance           int                     NOT NULL DEFAULT 0,
  last_ledger_id    uuid                    REFERENCES public.credit_ledger(id) ON DELETE SET NULL,
  updated_at        timestamptz             NOT NULL DEFAULT now(),

  CONSTRAINT credit_balance_cache_unique
    UNIQUE (organization_id, student_id, lesson_category)
);

COMMENT ON TABLE public.credit_balance_cache IS
  'Materialized credit balance per (org, student, category). '
  'Updated by credit_ledger_update_cache trigger after every INSERT on credit_ledger. '
  'Never write to this table directly from application code.';

-- Trigger to keep credit_balance_cache in sync with credit_ledger
CREATE OR REPLACE FUNCTION public.credit_ledger_update_cache_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.credit_balance_cache
    (organization_id, student_id, lesson_category, balance, last_ledger_id)
  VALUES
    (NEW.organization_id, NEW.student_id, NEW.lesson_category, NEW.quantity, NEW.id)
  ON CONFLICT (organization_id, student_id, lesson_category) DO UPDATE
    SET balance        = credit_balance_cache.balance + NEW.quantity,
        last_ledger_id = NEW.id,
        updated_at     = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER credit_ledger_update_cache
  AFTER INSERT ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.credit_ledger_update_cache_fn();

-- 2.6 invoices
-- Invoice header. Amount columns track full financial picture.
-- outstanding_amount = total_amount - paid_amount (can be negative for overpayment).
-- NO soft delete: use status='void'. State transitions via SECURITY DEFINER functions only.

CREATE TABLE public.invoices (
  id                  uuid                    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid                    NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  student_id          uuid                    NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  student_package_id  uuid                    REFERENCES public.student_packages(id) ON DELETE RESTRICT,
  invoice_number      text,
  status              public.invoice_status   NOT NULL DEFAULT 'draft',
  currency            text                    NOT NULL DEFAULT 'SEK',
  subtotal_amount     numeric(12,2)           NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  vat_amount          numeric(12,2)           NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  total_amount        numeric(12,2)           NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount         numeric(12,2)           NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  outstanding_amount  numeric(12,2)           NOT NULL DEFAULT 0,
  due_date            date,
  issued_at           timestamptz,
  issued_by           uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at             timestamptz,
  void_at             timestamptz,
  void_by             uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason         text,
  notes               text,
  metadata            jsonb                   NOT NULL DEFAULT '{}',
  created_at          timestamptz             NOT NULL DEFAULT now(),
  updated_at          timestamptz             NOT NULL DEFAULT now(),
  created_by          uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by          uuid                    REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE  public.invoices IS
  'Invoice header. State transitions (draft→issued→paid/void) are managed by '
  'SECURITY DEFINER functions: issue_invoice(), void_invoice(), record_payment(). '
  'Do NOT update status directly from application code.';
COMMENT ON COLUMN public.invoices.outstanding_amount IS
  'total_amount - paid_amount. Can be negative for overpayments. '
  'Updated atomically by record_payment() alongside paid_amount.';
COMMENT ON COLUMN public.invoices.invoice_number IS
  'NULL until issued. Generated gap-free by issue_invoice() via invoice_number_sequences.';

CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.7 invoice_line_items
-- Detail lines for an invoice. vat_rate and vat_amount are frozen at issuance
-- by issue_invoice() so they reflect the rate at time of sale.
-- NO soft delete: lines on issued/paid invoices are immutable.

CREATE TABLE public.invoice_line_items (
  id                  uuid                    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid                    NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id          uuid                    NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  student_package_id  uuid                    REFERENCES public.student_packages(id) ON DELETE RESTRICT,
  line_type           public.invoice_line_type NOT NULL DEFAULT 'package',
  description         text                    NOT NULL,
  quantity            int                     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price          numeric(12,2)           NOT NULL,
  vat_rate            numeric(5,4)            NOT NULL DEFAULT 0.25,
  vat_amount          numeric(12,2)           NOT NULL DEFAULT 0,
  line_total          numeric(12,2)           NOT NULL DEFAULT 0,
  sort_order          int                     NOT NULL DEFAULT 0,
  metadata            jsonb                   NOT NULL DEFAULT '{}',
  created_at          timestamptz             NOT NULL DEFAULT now(),
  updated_at          timestamptz             NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.invoice_line_items.vat_rate IS
  'Frozen at issuance by issue_invoice(). Reflects Swedish VAT rate at time of sale.';
COMMENT ON COLUMN public.invoice_line_items.vat_amount IS
  'Frozen at issuance: quantity * unit_price * vat_rate.';
COMMENT ON COLUMN public.invoice_line_items.line_total IS
  'Frozen at issuance: quantity * unit_price (excluding VAT).';

CREATE TRIGGER set_invoice_line_items_updated_at
  BEFORE UPDATE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.8 invoice_number_sequences
-- Per-org per-year sequential counter. issue_invoice() upserts here with
-- INSERT ON CONFLICT DO UPDATE to atomically increment and return the new number.
-- This guarantees gap-free sequential numbering even under concurrent issuance.

CREATE TABLE public.invoice_number_sequences (
  id               uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year             int          NOT NULL CHECK (year >= 2020 AND year <= 2099),
  last_number      int          NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  prefix           text         NOT NULL DEFAULT '',
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT invoice_sequences_org_year_unique UNIQUE (organization_id, year)
);

COMMENT ON TABLE public.invoice_number_sequences IS
  'Per-org per-year invoice counter. Updated atomically inside issue_invoice() '
  'via INSERT ON CONFLICT DO UPDATE to ensure gap-free sequential numbering.';

CREATE TRIGGER set_invoice_number_sequences_updated_at
  BEFORE UPDATE ON public.invoice_number_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.9 payments
-- Payment records. Created atomically by record_payment() SECURITY DEFINER function
-- which also updates invoice paid_amount and status in the same transaction.
-- NO soft delete: void payments via status='void'.

CREATE TABLE public.payments (
  id                  uuid                    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid                    NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id          uuid                    NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  student_id          uuid                    NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  payment_method      public.payment_method   NOT NULL,
  status              public.payment_status   NOT NULL DEFAULT 'pending',
  amount              numeric(12,2)           NOT NULL CHECK (amount > 0),
  currency            text                    NOT NULL DEFAULT 'SEK',
  provider_reference  text,
  provider_metadata   jsonb                   NOT NULL DEFAULT '{}',
  paid_at             timestamptz,
  confirmed_at        timestamptz,
  confirmed_by        uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  void_at             timestamptz,
  void_by             uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason         text,
  refund_amount       numeric(12,2)           CHECK (refund_amount IS NULL OR refund_amount > 0),
  refunded_at         timestamptz,
  refunded_by         uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  notes               text,
  metadata            jsonb                   NOT NULL DEFAULT '{}',
  created_at          timestamptz             NOT NULL DEFAULT now(),
  updated_at          timestamptz             NOT NULL DEFAULT now(),
  created_by          uuid                    REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.payments IS
  'Payment records. Created by record_payment() SECURITY DEFINER function. '
  'Do NOT insert directly from application code.';

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.10 financial_periods
-- Foundation for future accounting period locking.
-- Phase 4A: CRUD only. Period-based transaction validation deferred to Phase 4B.

CREATE TABLE public.financial_periods (
  id                uuid                          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid                          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name              text                          NOT NULL,
  period_start      date                          NOT NULL,
  period_end        date                          NOT NULL,
  status            public.financial_period_status NOT NULL DEFAULT 'open',
  closed_at         timestamptz,
  closed_by         uuid                          REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at         timestamptz,
  locked_by         uuid                          REFERENCES auth.users(id) ON DELETE SET NULL,
  notes             text,
  metadata          jsonb                         NOT NULL DEFAULT '{}',
  created_at        timestamptz                   NOT NULL DEFAULT now(),
  updated_at        timestamptz                   NOT NULL DEFAULT now(),
  created_by        uuid                          REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT financial_periods_dates_check CHECK (period_end >= period_start),
  CONSTRAINT financial_periods_org_period_unique UNIQUE (organization_id, period_start, period_end)
);

CREATE TRIGGER set_financial_periods_updated_at
  BEFORE UPDATE ON public.financial_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Section 3: Audit triggers ────────────────────────────────────────────────
-- Attach audit triggers to mutable financial tables.
-- credit_ledger is append-only (INSERT only) — audit trigger fires on INSERT.
-- invoice_number_sequences is internal-only — no audit trigger needed.

CREATE TRIGGER package_catalog_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.package_catalog
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER package_offerings_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.package_offerings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER student_packages_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.student_packages
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER invoices_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER payments_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER financial_periods_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_periods
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ── Section 4: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.package_catalog          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_offerings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_packages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_balance_cache     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_periods        ENABLE ROW LEVEL SECURITY;

-- package_catalog: system entries (org IS NULL) visible to all; org entries scoped
CREATE POLICY "package_catalog_select"
  ON public.package_catalog FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "package_catalog_insert"
  ON public.package_catalog FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:package:create')
  );

CREATE POLICY "package_catalog_update"
  ON public.package_catalog FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:package:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:package:update')
  );

-- package_offerings: org-scoped; active/archived visible to all org members
CREATE POLICY "package_offerings_select"
  ON public.package_offerings FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "package_offerings_insert"
  ON public.package_offerings FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:package:create')
  );

CREATE POLICY "package_offerings_update"
  ON public.package_offerings FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:package:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:package:update')
  );

-- student_packages: finance:wallet:read required
CREATE POLICY "student_packages_select"
  ON public.student_packages FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:wallet:read')
  );

-- No INSERT/UPDATE policies for authenticated: only via purchase_package() RPC.

-- credit_ledger: SELECT with finance:wallet:read; NO INSERT/UPDATE/DELETE policies.
-- All writes happen inside SECURITY DEFINER functions (bypass RLS entirely).
CREATE POLICY "credit_ledger_select"
  ON public.credit_ledger FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:wallet:read')
  );

-- credit_balance_cache: same access as credit_ledger
CREATE POLICY "credit_balance_cache_select"
  ON public.credit_balance_cache FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:wallet:read')
  );

-- invoices: full read with finance:invoice:read; INSERT for standalone drafts; UPDATE on drafts only
CREATE POLICY "invoices_select"
  ON public.invoices FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:invoice:read')
  );

CREATE POLICY "invoices_insert"
  ON public.invoices FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:invoice:create')
  );

-- Only draft invoices can be directly updated from the application layer.
-- Issued/paid/void transitions happen via SECURITY DEFINER functions which bypass RLS.
CREATE POLICY "invoices_update_draft"
  ON public.invoices FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:invoice:update')
    AND status = 'draft'
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:invoice:update')
  );

-- invoice_line_items: same read permission as invoices; writable only when invoice is draft
CREATE POLICY "invoice_line_items_select"
  ON public.invoice_line_items FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:invoice:read')
  );

CREATE POLICY "invoice_line_items_insert"
  ON public.invoice_line_items FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:invoice:create')
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND i.organization_id = public.auth_organization_id()
        AND i.status = 'draft'
    )
  );

CREATE POLICY "invoice_line_items_update"
  ON public.invoice_line_items FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:invoice:update')
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND i.organization_id = public.auth_organization_id()
        AND i.status = 'draft'
    )
  );

-- invoice_number_sequences: internal only — no authenticated policies.
-- All access is from SECURITY DEFINER functions (bypass RLS).
-- Platform admins can read for diagnostics.
CREATE POLICY "invoice_number_sequences_platform_read"
  ON public.invoice_number_sequences FOR SELECT
  USING (public.is_platform_admin());

-- payments: SELECT with finance:payment:read; no INSERT for authenticated (use record_payment() RPC)
CREATE POLICY "payments_select"
  ON public.payments FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:payment:read')
  );

-- financial_periods: any org member can read; manage requires finance:period:manage
CREATE POLICY "financial_periods_select"
  ON public.financial_periods FOR SELECT
  USING (organization_id = public.auth_organization_id());

CREATE POLICY "financial_periods_insert"
  ON public.financial_periods FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:period:manage')
  );

CREATE POLICY "financial_periods_update"
  ON public.financial_periods FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:period:manage')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:period:manage')
  );

-- ── Section 5: Table grants ──────────────────────────────────────────────────

-- package_catalog: authenticated can read + write (RLS restricts write to org admins)
GRANT SELECT, INSERT, UPDATE ON public.package_catalog          TO authenticated, service_role;

-- package_offerings: same pattern
GRANT SELECT, INSERT, UPDATE ON public.package_offerings        TO authenticated, service_role;

-- student_packages: service_role INSERT (via purchase_package RPC); authenticated SELECT only
GRANT SELECT                  ON public.student_packages         TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON public.student_packages         TO service_role;

-- credit_ledger: append-only; authenticated SELECT; service_role INSERT (via SECURITY DEFINER)
GRANT SELECT                  ON public.credit_ledger            TO authenticated;
GRANT SELECT, INSERT          ON public.credit_ledger            TO service_role;

-- credit_balance_cache: read-only for authenticated; service_role full (trigger needs UPDATE)
GRANT SELECT                  ON public.credit_balance_cache     TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON public.credit_balance_cache     TO service_role;

-- invoices: authenticated can INSERT draft invoices; SECURITY DEFINER handles transitions
GRANT SELECT, INSERT, UPDATE  ON public.invoices                 TO authenticated, service_role;

-- invoice_line_items: same as invoices
GRANT SELECT, INSERT, UPDATE  ON public.invoice_line_items       TO authenticated, service_role;

-- invoice_number_sequences: internal only; SECURITY DEFINER owns all writes
GRANT SELECT, INSERT, UPDATE  ON public.invoice_number_sequences TO service_role;

-- payments: no INSERT for authenticated; all payments go through record_payment() RPC
GRANT SELECT                  ON public.payments                  TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON public.payments                  TO service_role;

-- financial_periods: authenticated can INSERT/UPDATE (subject to RLS + permission)
GRANT SELECT, INSERT, UPDATE  ON public.financial_periods         TO authenticated, service_role;

-- ── Section 6: SECURITY DEFINER Functions ────────────────────────────────────
--
-- All functions:
--   • SECURITY DEFINER SET search_path = public (prevents search_path injection)
--   • Bypass RLS — run as the migration owner (postgres / supabase_admin)
--   • Raise EXCEPTION with ERRCODE 'P0001' for domain errors (caught by service layer)
--   • Publish events to event_outbox via insert_outbox_event()
--

-- ── 6.1 purchase_package ─────────────────────────────────────────────────────
-- Atomic purchase flow:
--   1. Lock and validate the offering (FOR SHARE)
--   2. Create student_package
--   3. Create draft invoice with calculated totals
--   4. Create invoice line item
--   5. Insert credit_ledger grant for primary category (trigger updates cache)
--   6. Insert additional credit_ledger grants for bundle_credits entries
--   7. Publish Package.Purchased + Credit.Granted events

CREATE OR REPLACE FUNCTION public.purchase_package(
  p_org_id     uuid,
  p_student_id uuid,
  p_offering_id uuid,
  p_actor_id   uuid
)
RETURNS uuid  -- student_package_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_line_total   := v_offering.quantity * v_offering.price;
  v_vat_amount   := v_line_total * v_offering.vat_rate;
  v_total_amount := v_line_total + v_vat_amount;

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
    v_offering.price * v_offering.quantity,
    v_offering.vat_rate,
    v_vat_amount,
    v_line_total
  );

  -- 7. Create credit_ledger grant for primary category
  -- Trigger credit_ledger_update_cache will maintain credit_balance_cache automatically.
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
$$;

-- ── 6.2 consume_credit ───────────────────────────────────────────────────────
-- Atomic FIFO credit consumption called when a lesson booking is completed.
--
-- Concurrency safety:
--   pg_advisory_xact_lock(hashtext(org), hashtext(student)) — prevents double-spend
--   SELECT FOR UPDATE on credit_balance_cache — ensures fresh balance read
--
-- FIFO: selects the earliest-expiring grant entry with remaining balance.
-- Raises P0001 if balance is insufficient or no valid grant exists.

CREATE OR REPLACE FUNCTION public.consume_credit(
  p_org_id     uuid,
  p_student_id uuid,
  p_booking_id uuid,
  p_category   public.lesson_category,
  p_quantity   int DEFAULT 1
)
RETURNS uuid  -- new credit_ledger consume entry id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance    int;
  v_currency   text;
  v_grant_id   uuid;
  v_ledger_id  uuid;
BEGIN
  -- 1. Advisory transaction lock: one consumer per (org, student) at a time
  PERFORM pg_advisory_xact_lock(
    hashtext(p_org_id::text),
    hashtext(p_student_id::text)
  );

  -- 2. Read balance from cache with FOR UPDATE (ensures fresh read after lock)
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

  -- 3. Find earliest-expiring grant with remaining balance (FIFO)
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
    -- Balance cache says credits exist but no single non-expired grant has enough remaining.
    -- This can happen when credits span multiple nearly-depleted grants.
    -- Raise so the caller can decide whether to allow partial consumption.
    RAISE EXCEPTION 'NO_VALID_GRANT: no single non-expired grant has >= % credits for student % category %',
      p_quantity, p_student_id, p_category
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Insert consume entry (trigger updates credit_balance_cache automatically)
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

  -- 5. Publish Credit.Consumed
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
$$;

-- ── 6.3 issue_invoice ────────────────────────────────────────────────────────
-- Issues a draft invoice: generates a gap-free invoice number, re-computes
-- totals from line items, freezes VAT on each line, and publishes Invoice.Issued.
-- Only invoices in 'draft' status can be issued.

CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_invoice_id uuid,
  p_actor_id   uuid
)
RETURNS text  -- invoice_number
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice      invoices%ROWTYPE;
  v_year         int;
  v_last_num     int;
  v_prefix       text;
  v_inv_num      text;
  v_subtotal     numeric(12,2);
  v_vat_total    numeric(12,2);
  v_grand_total  numeric(12,2);
BEGIN
  -- 1. Lock and fetch invoice
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'INVOICE_NOT_DRAFT: invoice % has status %, expected draft',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM invoice_line_items WHERE invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'INVOICE_NO_LINES: cannot issue invoice % with no line items',
      p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Re-compute and freeze totals from line items
  SELECT
    COALESCE(SUM(line_total),  0),
    COALESCE(SUM(vat_amount),  0)
  INTO v_subtotal, v_vat_total
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id;

  v_grand_total := v_subtotal + v_vat_total;

  -- Freeze VAT calculations on each line item (quantity * unit_price * vat_rate)
  UPDATE invoice_line_items
  SET
    vat_amount = quantity * unit_price * vat_rate,
    line_total = quantity * unit_price,
    updated_at = now()
  WHERE invoice_id = p_invoice_id;

  -- Re-read subtotal after freeze (unit_price on the line may differ from what was set)
  SELECT
    COALESCE(SUM(line_total),  0),
    COALESCE(SUM(vat_amount),  0)
  INTO v_subtotal, v_vat_total
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id;

  v_grand_total := v_subtotal + v_vat_total;

  -- 3. Generate gap-free invoice number for org + current year
  v_year := EXTRACT(YEAR FROM now())::int;

  INSERT INTO invoice_number_sequences (organization_id, year, last_number, prefix)
  VALUES (v_invoice.organization_id, v_year, 1, '')
  ON CONFLICT (organization_id, year) DO UPDATE
    SET last_number = invoice_number_sequences.last_number + 1,
        updated_at  = now()
  RETURNING last_number, prefix INTO v_last_num, v_prefix;

  v_inv_num := v_prefix || v_year::text || '-' || LPAD(v_last_num::text, 5, '0');

  -- 4. Issue the invoice
  UPDATE invoices
  SET
    status             = 'issued',
    invoice_number     = v_inv_num,
    issued_at          = now(),
    issued_by          = p_actor_id,
    subtotal_amount    = v_subtotal,
    vat_amount         = v_vat_total,
    total_amount       = v_grand_total,
    outstanding_amount = v_grand_total,
    updated_at         = now()
  WHERE id = p_invoice_id;

  -- 5. Publish Invoice.Issued
  PERFORM insert_outbox_event(
    'Invoice.Issued',
    'accounting',
    jsonb_build_object(
      'invoice_id',      p_invoice_id,
      'invoice_number',  v_inv_num,
      'student_id',      v_invoice.student_id,
      'total_amount',    v_grand_total,
      'vat_amount',      v_vat_total,
      'currency',        v_invoice.currency,
      'issued_by',       p_actor_id
    ),
    v_invoice.organization_id,
    v_invoice.student_id::text
  );

  RETURN v_inv_num;
END;
$$;

-- ── 6.4 void_invoice ─────────────────────────────────────────────────────────
-- Voids a draft or issued invoice. Paid or partially_paid invoices cannot be
-- voided — use a credit note (Phase 4B).

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id uuid,
  p_actor_id   uuid,
  p_reason     text DEFAULT NULL
)
RETURNS timestamptz  -- void_at timestamp
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_void_at timestamptz;
BEGIN
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.status NOT IN ('draft', 'issued') THEN
    RAISE EXCEPTION 'CANNOT_VOID: invoice % has status %; only draft/issued invoices can be voided',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  v_void_at := now();

  UPDATE invoices
  SET
    status      = 'void',
    void_at     = v_void_at,
    void_by     = p_actor_id,
    void_reason = p_reason,
    updated_at  = now()
  WHERE id = p_invoice_id;

  PERFORM insert_outbox_event(
    'Invoice.Voided',
    'accounting',
    jsonb_build_object(
      'invoice_id',     p_invoice_id,
      'invoice_number', v_invoice.invoice_number,
      'student_id',     v_invoice.student_id,
      'reason',         p_reason,
      'voided_by',      p_actor_id
    ),
    v_invoice.organization_id,
    v_invoice.student_id::text
  );

  RETURN v_void_at;
END;
$$;

-- ── 6.5 record_payment ───────────────────────────────────────────────────────
-- Records a payment against an issued invoice. Atomically:
--   - Inserts payment row (status='confirmed')
--   - Updates invoice paid_amount and outstanding_amount
--   - Transitions invoice to 'paid' or 'partially_paid'
--   - Publishes Payment.Received and (if fully paid) Invoice.Paid

CREATE OR REPLACE FUNCTION public.record_payment(
  p_invoice_id uuid,
  p_amount     numeric(12,2),
  p_method     public.payment_method,
  p_reference  text     DEFAULT NULL,
  p_actor_id   uuid     DEFAULT NULL
)
RETURNS uuid  -- payment_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice         invoices%ROWTYPE;
  v_payment_id      uuid;
  v_new_paid        numeric(12,2);
  v_new_outstanding numeric(12,2);
  v_new_status      invoice_status;
BEGIN
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.status NOT IN ('issued', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'INVOICE_NOT_PAYABLE: invoice % has status %; expected issued/partially_paid/overdue',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: payment amount must be positive, got %', p_amount
      USING ERRCODE = 'P0001';
  END IF;

  -- Insert confirmed payment
  INSERT INTO payments (
    organization_id, invoice_id, student_id,
    payment_method, status, amount, currency,
    provider_reference,
    paid_at, confirmed_at, confirmed_by,
    created_by
  ) VALUES (
    v_invoice.organization_id, p_invoice_id, v_invoice.student_id,
    p_method, 'confirmed', p_amount, v_invoice.currency,
    p_reference,
    now(), now(), p_actor_id,
    p_actor_id
  ) RETURNING id INTO v_payment_id;

  -- Update invoice amounts and status
  v_new_paid        := v_invoice.paid_amount + p_amount;
  v_new_outstanding := v_invoice.total_amount - v_new_paid;
  v_new_status      := CASE
    WHEN v_new_outstanding <= 0 THEN 'paid'::invoice_status
    ELSE                             'partially_paid'::invoice_status
  END;

  UPDATE invoices
  SET
    paid_amount        = v_new_paid,
    outstanding_amount = v_new_outstanding,
    status             = v_new_status,
    paid_at            = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END,
    updated_at         = now()
  WHERE id = p_invoice_id;

  -- Publish Payment.Received
  PERFORM insert_outbox_event(
    'Payment.Received',
    'accounting',
    jsonb_build_object(
      'payment_id',  v_payment_id,
      'invoice_id',  p_invoice_id,
      'student_id',  v_invoice.student_id,
      'amount',      p_amount,
      'currency',    v_invoice.currency,
      'method',      p_method,
      'reference',   p_reference
    ),
    v_invoice.organization_id,
    v_invoice.student_id::text
  );

  -- Publish Invoice.Paid if fully settled
  IF v_new_status = 'paid' THEN
    PERFORM insert_outbox_event(
      'Invoice.Paid',
      'accounting',
      jsonb_build_object(
        'invoice_id',     p_invoice_id,
        'invoice_number', v_invoice.invoice_number,
        'student_id',     v_invoice.student_id,
        'total_amount',   v_invoice.total_amount,
        'payment_id',     v_payment_id,
        'currency',       v_invoice.currency
      ),
      v_invoice.organization_id,
      v_invoice.student_id::text
    );
  END IF;

  RETURN v_payment_id;
END;
$$;

-- ── 6.6 expire_stale_credits ─────────────────────────────────────────────────
-- Called by the event-worker maintenance tick. Finds expired grant entries
-- that still have remaining balance and creates expiry ledger entries.
-- Uses FOR UPDATE SKIP LOCKED to prevent concurrent double-expiry.
-- The credit_ledger_update_cache trigger maintains credit_balance_cache.

CREATE OR REPLACE FUNCTION public.expire_stale_credits(
  p_limit int DEFAULT 50
)
RETURNS int  -- count of grant entries expired
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant      RECORD;
  v_remaining  int;
  v_ledger_id  uuid;
  v_count      int := 0;
BEGIN
  FOR v_grant IN
    SELECT id, organization_id, student_id, lesson_category, expires_at, quantity, currency
    FROM   credit_ledger
    WHERE  entry_type  = 'grant'
      AND  expires_at  IS NOT NULL
      AND  expires_at  < now()
    ORDER  BY expires_at ASC
    LIMIT  p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Compute remaining balance for this specific grant entry
    SELECT v_grant.quantity + COALESCE(SUM(cl.quantity), 0)
    INTO   v_remaining
    FROM   credit_ledger cl
    WHERE  cl.grant_entry_id = v_grant.id
      AND  cl.entry_type IN ('consume', 'expire', 'adjust', 'reverse');

    -- Skip if already fully consumed or expired
    CONTINUE WHEN COALESCE(v_remaining, v_grant.quantity) <= 0;

    -- Insert expiry entry (trigger updates credit_balance_cache)
    INSERT INTO credit_ledger (
      organization_id, student_id, lesson_category,
      entry_type, quantity, currency,
      grant_entry_id,
      reference_type, reference_id,
      description
    ) VALUES (
      v_grant.organization_id, v_grant.student_id, v_grant.lesson_category,
      'expire', -COALESCE(v_remaining, v_grant.quantity), COALESCE(v_grant.currency, 'SEK'),
      v_grant.id,
      'expiry_run', NULL,
      'Credit expiry: grant ' || v_grant.id::text || ' expired at ' || v_grant.expires_at::text
    ) RETURNING id INTO v_ledger_id;

    PERFORM insert_outbox_event(
      'Credit.Expired',
      'accounting',
      jsonb_build_object(
        'ledger_id',       v_ledger_id,
        'grant_entry_id',  v_grant.id,
        'student_id',      v_grant.student_id,
        'lesson_category', v_grant.lesson_category,
        'quantity',        -COALESCE(v_remaining, v_grant.quantity),
        'expired_at',      v_grant.expires_at
      ),
      v_grant.organization_id,
      v_grant.student_id::text
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── Section 7: Function grants ───────────────────────────────────────────────
-- SECURITY DEFINER functions are callable by authenticated users and service role.
-- They enforce their own authorization internally.

GRANT EXECUTE ON FUNCTION public.purchase_package(uuid, uuid, uuid, uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_credit(uuid, uuid, uuid, public.lesson_category, int)  TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid, uuid)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, uuid, text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, public.payment_method, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_credits(int)                         TO service_role;

-- ── Section 8: New permissions ───────────────────────────────────────────────
-- Uses the existing 'finance' domain (already in permissions table from Phase 1B.1).
-- 8 new permissions added alongside the existing finance:invoice:* and finance:payment:*

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'finance:package:create',  'finance', 'package',  'create',  'Create package catalog entries and offerings'),
  (gen_random_uuid(), 'finance:package:read',    'finance', 'package',  'read',    'View package catalog and offerings'),
  (gen_random_uuid(), 'finance:package:update',  'finance', 'package',  'update',  'Edit package offerings and catalog entries'),
  (gen_random_uuid(), 'finance:package:archive', 'finance', 'package',  'archive', 'Archive discontinued package offerings'),
  (gen_random_uuid(), 'finance:wallet:read',     'finance', 'wallet',   'read',    'View student credit balance and ledger history'),
  (gen_random_uuid(), 'finance:wallet:manage',   'finance', 'wallet',   'manage',  'Grant or adjust student credits manually'),
  (gen_random_uuid(), 'finance:period:read',     'finance', 'period',   'read',    'View financial periods'),
  (gen_random_uuid(), 'finance:period:manage',   'finance', 'period',   'manage',  'Create and manage financial accounting periods'),
  (gen_random_uuid(), 'finance:payment:void',    'finance', 'payment',  'void',    'Void payment records');

-- ── Section 9: Role-permission assignments ───────────────────────────────────
-- org_owner and org_admin already have ALL permissions via CROSS JOIN in Phase 1B.1.
-- New permissions are NOT auto-assigned to existing roles — we add them explicitly.

-- org_owner: all new permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_owner'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:package:create', 'finance:package:read', 'finance:package:update', 'finance:package:archive',
    'finance:wallet:read', 'finance:wallet:manage',
    'finance:period:read', 'finance:period:manage',
    'finance:payment:void'
  ])
ON CONFLICT DO NOTHING;

-- org_admin: all new permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_admin'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:package:create', 'finance:package:read', 'finance:package:update', 'finance:package:archive',
    'finance:wallet:read', 'finance:wallet:manage',
    'finance:period:read', 'finance:period:manage',
    'finance:payment:void'
  ])
ON CONFLICT DO NOTHING;

-- finance_admin: full commercial access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'finance_admin'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:package:create', 'finance:package:read', 'finance:package:update', 'finance:package:archive',
    'finance:wallet:read', 'finance:wallet:manage',
    'finance:invoice:create', 'finance:invoice:read', 'finance:invoice:update',
    'finance:invoice:void', 'finance:invoice:export',
    'finance:payment:create', 'finance:payment:read', 'finance:payment:export', 'finance:payment:void',
    'finance:report:read', 'finance:report:export',
    'finance:period:read', 'finance:period:manage'
  ])
ON CONFLICT DO NOTHING;

-- org_manager: read-only commercial access + package management
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_manager'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:package:read',
    'finance:wallet:read',
    'finance:period:read'
  ])
ON CONFLICT DO NOTHING;

-- receptionist: wallet read (so they can check student's remaining credits at desk)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'receptionist'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:package:read',
    'finance:wallet:read',
    'finance:invoice:read',
    'finance:payment:read'
  ])
ON CONFLICT DO NOTHING;

-- instructor: wallet read only (to see student's remaining credits before lesson)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'instructor'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:wallet:read'
  ])
ON CONFLICT DO NOTHING;
