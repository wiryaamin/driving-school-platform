-- ============================================================
-- Phase 4C — Swedish Invoice Compliance
-- Organization Swedish settings (org number, VAT reg, BG/PG),
-- OCR payment references (Luhn mod-10), financial period
-- immutability trigger, Swedish dunning defaults, and
-- updated issue_invoice() with OCR generation.
-- ============================================================

-- ── Section 1: Organization Swedish Settings ─────────────────────────────────

CREATE TABLE public.organization_swedish_settings (
  id                      uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id         uuid          NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_number              text,           -- 559000-0000 format
  vat_reg_number          text,           -- SE559000000001 format
  f_tax_registered        boolean       NOT NULL DEFAULT false,
  bankgiro_number         text,
  plusgiro_number         text,
  invoice_payment_days    int           NOT NULL DEFAULT 30,
  reminder_fee_amount     numeric(12,2) NOT NULL DEFAULT 60.00,  -- påminnelseavgift, min 60 SEK by law
  late_interest_rate      numeric(6,4)  NOT NULL DEFAULT 0.0800, -- dröjsmålsränta, reference + 8%
  sie4_company_name       text,
  sie4_fiscal_year_start  date,
  invoice_footer_text     text,
  invoice_header_logo_url text,
  is_active               boolean       NOT NULL DEFAULT true,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT swedish_settings_payment_days_positive CHECK (invoice_payment_days > 0),
  CONSTRAINT swedish_settings_reminder_fee_min      CHECK (reminder_fee_amount >= 60.00),
  CONSTRAINT swedish_settings_interest_rate_valid   CHECK (late_interest_rate >= 0 AND late_interest_rate < 1)
);

CREATE TRIGGER set_org_swedish_settings_updated_at
  BEFORE UPDATE ON public.organization_swedish_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.organization_swedish_settings IS
  'Swedish-specific org settings: org number, F-tax, BankGiro/PlusGiro, SIE4 name, invoice terms.';
COMMENT ON COLUMN public.organization_swedish_settings.reminder_fee_amount IS
  'Påminnelseavgift. Minimum 60 SEK by Swedish law (Inkassolagen).';
COMMENT ON COLUMN public.organization_swedish_settings.late_interest_rate IS
  'Dröjsmålsränta. Reference rate + 8% per Swedish Räntelagen. Stored as decimal (0.08 = 8%).';

-- ── Section 2: Invoice OCR References ────────────────────────────────────────

CREATE TABLE public.invoice_ocr_references (
  id               uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id       uuid    NOT NULL UNIQUE REFERENCES public.invoices(id),
  ocr_reference    text    NOT NULL,   -- numeric digits only, Luhn check digit appended
  payment_ref_full text    NOT NULL,   -- e.g. "BG 123-4567 OCR 12345678901"
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.invoice_ocr_references IS
  'Swedish OCR payment references per invoice. OCR is a Luhn mod-10 numeric string for bank payment matching.';
COMMENT ON COLUMN public.invoice_ocr_references.ocr_reference IS
  'Numeric-only OCR reference with Luhn check digit. Printed on invoice for customer BankGiro payment.';

-- ── Section 3: RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.organization_swedish_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_ocr_references        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swedish_settings_org_isolation"
  ON public.organization_swedish_settings
  FOR ALL
  USING (organization_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid);

CREATE POLICY "invoice_ocr_org_isolation"
  ON public.invoice_ocr_references
  FOR ALL
  USING (organization_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'org_id')::uuid);

-- ── Section 4: Luhn mod-10 OCR Reference Generator ───────────────────────────

CREATE OR REPLACE FUNCTION public.generate_ocr_reference(p_base text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum    int  := 0;
  v_double boolean := false;
  v_digit  int;
  v_check  int;
  v_i      int;
BEGIN
  -- Luhn mod-10: process digits right-to-left
  FOR v_i IN REVERSE length(p_base)..1 LOOP
    v_digit := substr(p_base, v_i, 1)::int;
    IF v_double THEN
      v_digit := v_digit * 2;
      IF v_digit > 9 THEN
        v_digit := v_digit - 9;
      END IF;
    END IF;
    v_sum    := v_sum + v_digit;
    v_double := NOT v_double;
  END LOOP;

  v_check := (10 - (v_sum % 10)) % 10;
  RETURN p_base || v_check::text;
END;
$$;

COMMENT ON FUNCTION public.generate_ocr_reference(text) IS
  'Appends Luhn mod-10 check digit to a numeric base string. IMMUTABLE — result depends only on input.';

-- ── Section 5: OCR Reference Issuance ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.issue_ocr_reference(
  p_invoice_id uuid,
  p_org_id     uuid
)
RETURNS text   -- ocr_reference
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice     invoices%ROWTYPE;
  v_settings    organization_swedish_settings%ROWTYPE;
  v_base        text;
  v_ocr         text;
  v_full_ref    text;
  v_bg_prefix   text;
BEGIN
  SELECT * INTO v_invoice  FROM invoices                       WHERE id = p_invoice_id;
  SELECT * INTO v_settings FROM organization_swedish_settings  WHERE organization_id = p_org_id;

  -- Strip non-digits from invoice_number to form the OCR base
  v_base := regexp_replace(COALESCE(v_invoice.invoice_number, p_invoice_id::text), '[^0-9]', '', 'g');

  -- Pad to at least 4 digits
  IF length(v_base) < 4 THEN
    v_base := lpad(v_base, 4, '0');
  END IF;

  v_ocr := generate_ocr_reference(v_base);

  -- Build human-readable full payment reference
  IF v_settings.bankgiro_number IS NOT NULL THEN
    v_full_ref := 'BG ' || v_settings.bankgiro_number || '  OCR ' || v_ocr;
  ELSIF v_settings.plusgiro_number IS NOT NULL THEN
    v_full_ref := 'PG ' || v_settings.plusgiro_number || '  OCR ' || v_ocr;
  ELSE
    v_full_ref := 'OCR ' || v_ocr;
  END IF;

  INSERT INTO invoice_ocr_references (organization_id, invoice_id, ocr_reference, payment_ref_full)
  VALUES (p_org_id, p_invoice_id, v_ocr, v_full_ref)
  ON CONFLICT (invoice_id) DO UPDATE
    SET ocr_reference    = EXCLUDED.ocr_reference,
        payment_ref_full = EXCLUDED.payment_ref_full;

  RETURN v_ocr;
END;
$$;

-- ── Section 6: issue_invoice — updated with OCR reference generation ──────────
-- CREATE OR REPLACE: preserves same signature as Phase 4B version.
-- Adds: PERFORM issue_ocr_reference() after invoice number assignment.

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

  -- Period lock guard (Phase 4B addition)
  PERFORM assert_period_not_locked(v_invoice.organization_id, now()::date);

  -- 2. Re-compute and freeze totals from line items
  SELECT
    COALESCE(SUM(line_total),  0),
    COALESCE(SUM(vat_amount),  0)
  INTO v_subtotal, v_vat_total
  FROM invoice_line_items
  WHERE invoice_id = p_invoice_id;

  v_grand_total := v_subtotal + v_vat_total;

  -- Freeze VAT calculations on each line item
  UPDATE invoice_line_items
  SET
    vat_amount = quantity * unit_price * vat_rate,
    line_total = quantity * unit_price,
    updated_at = now()
  WHERE invoice_id = p_invoice_id;

  -- Re-read subtotal after freeze
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

  -- 5. Generate Swedish OCR payment reference (Phase 4C addition)
  PERFORM issue_ocr_reference(p_invoice_id, v_invoice.organization_id);

  -- 6. Publish Invoice.Issued
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

-- ── Section 7: financial_periods immutability trigger ────────────────────────
-- Prevents unlocking a locked financial period at the database level.

CREATE OR REPLACE FUNCTION public.prevent_financial_period_unlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'locked' AND NEW.status <> 'locked' THEN
    RAISE EXCEPTION 'PERIOD_IMMUTABLE: financial period % cannot be unlocked once locked — Swedish accounting law requires permanent period closure',
      OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_period_immutability_guard
  BEFORE UPDATE ON public.financial_periods
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_period_unlock();

-- ── Section 8: Swedish Dunning Default Schedule ───────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_swedish_dunning_schedule(
  p_org_id   uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS uuid  -- schedule_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule_id  uuid;
  v_exists       boolean;
BEGIN
  -- Only seed if no default schedule exists
  SELECT EXISTS(
    SELECT 1 FROM dunning_schedules
    WHERE organization_id = p_org_id AND is_default = true
  ) INTO v_exists;

  IF v_exists THEN
    SELECT id INTO v_schedule_id
    FROM dunning_schedules
    WHERE organization_id = p_org_id AND is_default = true
    LIMIT 1;
    RETURN v_schedule_id;
  END IF;

  INSERT INTO dunning_schedules (
    organization_id,
    name,
    description,
    is_default,
    is_active,
    created_by
  )
  VALUES (
    p_org_id,
    'Svensk standardpåminnelse',
    '3-stegs påminnelseprocess enligt Inkassolagen: påminnelse, krav, inkasso',
    true,
    true,
    p_actor_id
  )
  RETURNING id INTO v_schedule_id;

  -- Stage 1: Påminnelse (14 days, email, 60 SEK fee — minimum by law)
  INSERT INTO dunning_schedule_stages
    (schedule_id, stage_number, days_after_due, action_type, reminder_fee_amount, email_template, is_active)
  VALUES
    (v_schedule_id, 1, 14, 'email', 60.00, 'invoice_reminder_sv', true);

  -- Stage 2: Betalningspåminnelse (28 days, both email+letter, 60 SEK)
  INSERT INTO dunning_schedule_stages
    (schedule_id, stage_number, days_after_due, action_type, reminder_fee_amount, email_template, is_active)
  VALUES
    (v_schedule_id, 2, 28, 'both', 60.00, 'invoice_final_reminder_sv', true);

  -- Stage 3: Inkassovarning (45 days, legal action notification)
  INSERT INTO dunning_schedule_stages
    (schedule_id, stage_number, days_after_due, action_type, reminder_fee_amount, email_template, is_active)
  VALUES
    (v_schedule_id, 3, 45, 'legal', 0.00, 'invoice_legal_warning_sv', true);

  RETURN v_schedule_id;
END;
$$;

COMMENT ON FUNCTION public.seed_swedish_dunning_schedule(uuid, uuid) IS
  'Creates a default 3-stage Swedish dunning schedule per org. Idempotent. Stages: Påminnelse (14d/60SEK), Krav (28d/60SEK), Inkasso (45d).';

-- ── Section 9: Permissions ────────────────────────────────────────────────────

INSERT INTO public.permissions (code, domain, resource, action, description)
VALUES
  ('finance:settings:read',   'finance', 'settings', 'read',   'Read Swedish organization finance settings'),
  ('finance:settings:manage', 'finance', 'settings', 'manage', 'Manage Swedish org settings: org number, BankGiro, VAT registration')
ON CONFLICT (code) DO NOTHING;
