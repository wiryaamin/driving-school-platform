-- rc1: WP1 — Corporate contract persistence.
-- Replaces ephemeral React local state with a durable, tenant-isolated table.
-- Linked to corporate_customers via FK; soft-deleted (deleted_at) on archive.

CREATE TABLE IF NOT EXISTS public.corporate_contracts (
  id                    uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid              NOT NULL REFERENCES public.organizations(id)        ON DELETE CASCADE,
  corporate_customer_id uuid              NOT NULL REFERENCES public.corporate_customers(id)  ON DELETE CASCADE,

  name                  text              NOT NULL CHECK (char_length(name) <= 200),
  er_ref                text                       CHECK (char_length(er_ref) <= 200),
  payment_terms_days    integer                    CHECK (payment_terms_days >= 0),
  credit_limit_sek      numeric(12,2)              CHECK (credit_limit_sek >= 0),
  discount_pct          numeric(5,2)               CHECK (discount_pct >= 0 AND discount_pct <= 100),
  is_active             boolean           NOT NULL  DEFAULT true,
  comment               text                       CHECK (char_length(comment) <= 5000),
  contact_email         text                       CHECK (char_length(contact_email) <= 200),
  contact_name          text                       CHECK (char_length(contact_name) <= 200),
  contact_phone         text                       CHECK (char_length(contact_phone) <= 50),

  deleted_at            timestamptz,
  created_at            timestamptz       NOT NULL  DEFAULT now(),
  updated_at            timestamptz       NOT NULL  DEFAULT now(),
  created_by            uuid              REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by            uuid              REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Covering index for per-customer contract listing (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_corporate_contracts_by_customer
  ON public.corporate_contracts(organization_id, corporate_customer_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Auto-update updated_at via the project-standard trigger function
CREATE TRIGGER trg_corporate_contracts_updated_at
  BEFORE UPDATE ON public.corporate_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tenant isolation via RLS
ALTER TABLE public.corporate_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corporate_contracts_select" ON public.corporate_contracts
  FOR SELECT TO authenticated
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at IS NULL
  );

CREATE POLICY "corporate_contracts_insert" ON public.corporate_contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.auth_organization_id()
  );

CREATE POLICY "corporate_contracts_update" ON public.corporate_contracts
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at IS NULL
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
  );
