-- =============================================================================
-- Tenant BAS Account Resolution — Hybrid Platform/Tenant Architecture
--
-- Verified against real Swedish accounting practice (BAS is a voluntary de
-- facto standard, not legally mandated; per-company/per-auditor account
-- customization — including payment-method-specific clearing accounts — is
-- normal practice, explicitly confirmed for driving schools).
--
-- Approved architecture:
--   Platform owns: BAS 2020 structure, default event mappings, posting
--                   engine, ledger rules, VAT logic, SIE4 compliance,
--                   accounting integrity.
--   Tenant owns:   Chart of Accounts, bank/settlement accounts, payment
--                   method account mappings, cost centers, account
--                   selection within its own Chart of Accounts.
--
-- What this migration does:
--   1. Adds platform default template rows (platform_bas_event_mappings) for
--      the account slots the posting engine previously hardcoded — single-
--      account event types store the same code in account_debit and
--      account_credit (that table's columns are NOT NULL; callers read
--      account_debit by convention for these).
--   2. Adds resolve_org_bas_account(org, event_type, fallback?) — the runtime
--      lookup: tenant's accounting_chart_of_accounts first (source of
--      truth), platform_bas_event_mappings only as an unseeded-org safety
--      net (template, not runtime source of truth), validated against
--      bas_account_catalog, fails loudly (RAISE EXCEPTION) rather than
--      posting to an unvalidated/missing account.
--   3. Widens accounting_chart_of_accounts RLS to finance:bas:manage (the
--      permission already gating the seed-bas endpoint) in addition to the
--      existing finance:export:run, since this table is now a live posting
--      dependency, not only an export input.
--   4. Adds an AFTER INSERT trigger on organizations that seeds the new
--      org's Chart of Accounts from platform templates automatically —
--      seed_org_chart_of_accounts() already loops over every active
--      platform_bas_event_mappings row and is idempotent (ON CONFLICT DO
--      NOTHING), so it requires no changes itself.
--
-- post_invoice_journal_entry / post_payment_journal_entry are updated in the
-- companion migration 20260724000006 to call the new resolver instead of
-- using hardcoded literals — kept separate so the schema/data change and the
-- posting-engine behavior change are independently reviewable.
-- =============================================================================

-- ─── 1. Platform default templates for previously-hardcoded account slots ────

INSERT INTO public.platform_bas_event_mappings
  (event_type, account_debit, account_credit, vat_rate_code, description)
VALUES
  -- Single-account slots: account_debit = account_credit by convention.
  ('AR.Account',              '1510', '1510', NULL,   'Kundfordringar — kontrolkonto för kundreskontra'),
  ('VAT.Output25',            '2610', '2610', 'SE25', 'Utgående moms 25%'),
  ('Revenue.Direct',          '3041', '3041', NULL,   'Intäkt vid direkt fakturering (ej förskott)'),
  ('Revenue.Deferred',        '2970', '2970', NULL,   'Förutbetalda intäkter (paketfakturering)'),
  ('Payment.Cash.bank_transfer', '1920', '1920', NULL, 'Kontantkonto — banköverföring (PlusGiro/BankGiro)'),
  ('Payment.Cash.swish',      '1930', '1930', NULL,   'Kontantkonto — Swish'),
  ('Payment.Cash.card',       '1930', '1930', NULL,   'Kontantkonto — kortbetalning'),
  ('Payment.Cash.stripe',     '1930', '1930', NULL,   'Kontantkonto — Stripe'),
  ('Payment.Cash.manual',     '1930', '1930', NULL,   'Kontantkonto — manuell registrering'),
  ('Payment.Cash.default',    '1930', '1930', NULL,   'Kontantkonto — okänd/ospecificerad betalmetod (fallback)')
ON CONFLICT (event_type) DO NOTHING;

-- ─── 2. resolve_org_bas_account — runtime account resolution ─────────────────
--
-- Lookup order: tenant accounting_chart_of_accounts (source of truth) →
-- platform_bas_event_mappings (template fallback for an unseeded org) →
-- p_fallback_event_type (same order) if provided → RAISE EXCEPTION.
-- Every resolved code is validated against bas_account_catalog before being
-- returned — an org that has hand-edited its mapping to a retired/invalid
-- code fails posting loudly instead of silently posting to nowhere.

CREATE OR REPLACE FUNCTION public.resolve_org_bas_account(
  p_org_id              uuid,
  p_event_type          text,
  p_fallback_event_type text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code       text;
  v_is_valid   boolean;
  v_event_type text := p_event_type;
BEGIN
  <<resolve>>
  LOOP
    -- 1. Tenant Chart of Accounts — the runtime source of truth.
    SELECT account_debit INTO v_code
    FROM   accounting_chart_of_accounts
    WHERE  organization_id = p_org_id
      AND  event_type      = v_event_type
      AND  is_active        = true;

    -- 2. Platform default template — fallback only for an org not yet seeded.
    IF v_code IS NULL THEN
      SELECT account_debit INTO v_code
      FROM   platform_bas_event_mappings
      WHERE  event_type = v_event_type
        AND  is_active  = true;
    END IF;

    IF v_code IS NOT NULL THEN
      EXIT resolve;
    END IF;

    IF p_fallback_event_type IS NOT NULL AND v_event_type != p_fallback_event_type THEN
      v_event_type := p_fallback_event_type;
      CONTINUE resolve;
    END IF;

    RAISE EXCEPTION 'BAS_EVENT_MAPPING_NOT_FOUND: no account mapping for event_type % (org %)',
      p_event_type, p_org_id
      USING ERRCODE = 'P0001';
  END LOOP;

  -- 3. Validate against the platform's BAS account catalog before trusting it.
  SELECT EXISTS (
    SELECT 1 FROM bas_account_catalog WHERE account_code = v_code AND is_active = true
  ) INTO v_is_valid;

  IF NOT v_is_valid THEN
    RAISE EXCEPTION 'BAS_ACCOUNT_INVALID: account % (event_type %, org %) is not a valid active BAS account',
      v_code, p_event_type, p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.resolve_org_bas_account(uuid, text, text) IS
  'Runtime BAS account resolution for the posting engine. Tenant accounting_chart_of_accounts '
  'is the source of truth; platform_bas_event_mappings is a template fallback for unseeded orgs '
  'only. Every resolved account is validated against bas_account_catalog. Raises on no mapping '
  'or an invalid/retired account rather than posting silently.';

GRANT EXECUTE ON FUNCTION public.resolve_org_bas_account(uuid, text, text) TO authenticated, service_role;

-- ─── 3. Widen accounting_chart_of_accounts RLS ────────────────────────────────
-- This table is now a live posting dependency, not only an export input —
-- finance:bas:manage (already gating the seed-bas endpoint) can manage it
-- alongside the existing finance:export:run.

DROP POLICY IF EXISTS "chart_of_accounts_select" ON public.accounting_chart_of_accounts;
CREATE POLICY "chart_of_accounts_select"
  ON public.accounting_chart_of_accounts FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND (public.has_permission('finance:export:run') OR public.has_permission('finance:bas:manage'))
  );

DROP POLICY IF EXISTS "chart_of_accounts_insert" ON public.accounting_chart_of_accounts;
CREATE POLICY "chart_of_accounts_insert"
  ON public.accounting_chart_of_accounts FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND (public.has_permission('finance:export:run') OR public.has_permission('finance:bas:manage'))
  );

DROP POLICY IF EXISTS "chart_of_accounts_update" ON public.accounting_chart_of_accounts;
CREATE POLICY "chart_of_accounts_update"
  ON public.accounting_chart_of_accounts FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND (public.has_permission('finance:export:run') OR public.has_permission('finance:bas:manage'))
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND (public.has_permission('finance:export:run') OR public.has_permission('finance:bas:manage'))
  );

-- ─── 4. Auto-seed a new org's Chart of Accounts from platform templates ──────
-- seed_org_chart_of_accounts() already loops over every active
-- platform_bas_event_mappings row and is idempotent (ON CONFLICT DO
-- NOTHING per organization_id+event_type) — no change needed to the
-- function itself, only a trigger to call it automatically going forward.

CREATE OR REPLACE FUNCTION public.seed_new_org_chart_of_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_org_chart_of_accounts(NEW.id, NULL);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.seed_new_org_chart_of_accounts() IS
  'Trigger wrapper: seeds a newly-created organization''s Chart of Accounts '
  'from platform_bas_event_mappings templates. Idempotent, safe to re-run.';

DROP TRIGGER IF EXISTS organizations_seed_chart_of_accounts ON public.organizations;
CREATE TRIGGER organizations_seed_chart_of_accounts
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_new_org_chart_of_accounts();

-- ─── 5. Backfill existing orgs ─────────────────────────────────────────────
-- Orgs created before this migration never had seed_org_chart_of_accounts()
-- called automatically. Seed them now (idempotent — ON CONFLICT DO NOTHING —
-- safe to run against orgs that already called POST /swedish-settings/seed-bas
-- manually).

DO $$
DECLARE
  v_org record;
BEGIN
  FOR v_org IN
    SELECT id FROM public.organizations
    WHERE deleted_at IS NULL
      AND id != '00000000-0000-0000-0000-000000000000'  -- platform system sentinel, never a real tenant
  LOOP
    PERFORM public.seed_org_chart_of_accounts(v_org.id, NULL);
  END LOOP;
END;
$$;
