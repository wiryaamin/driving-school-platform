-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260531000002_phase4b_discounts_promotions.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4B.2 — Discounts, Promotions, and Coupon Engine
--
-- Implements:
--   discount_definitions  — org-scoped discount programs (percentage/fixed)
--   coupon_codes          — redeemable codes with per-org uniqueness
--   discount_applications — append-only discount application audit log
--
-- New SECURITY DEFINER functions:
--   apply_discount  — apply a discount definition to a draft invoice
--   redeem_coupon   — validate + apply a coupon code to a draft invoice
--
-- Design:
--   • Discounts are applied as invoice_line_items with line_type='discount'
--     (negative unit_price). This leverages Phase 4A's existing line_type enum.
--   • issue_invoice() re-computes totals from all line items — discount lines
--     are automatically included in the final invoice totals.
--   • Discounts can only be applied to DRAFT invoices.
--   • Per-student coupon limits are enforced by SELECT FOR UPDATE + count check.
--   • discount_applications is append-only (immutable audit trail).
--
-- Dependencies:
--   20260531000001_phase4b_refunds_allocations.sql — assert_period_not_locked
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: New enum types ────────────────────────────────────────────────

CREATE TYPE public.discount_type AS ENUM (
  'percentage',  -- discount_value is 0.0–1.0 (e.g., 0.15 = 15%)
  'fixed'        -- discount_value is absolute amount in invoice currency
);

CREATE TYPE public.discount_scope AS ENUM (
  'offering',   -- applies to a specific package offering
  'catalog',    -- applies to all offerings from a catalog entry
  'category',   -- applies to all offerings of a lesson_category
  'all'         -- applies to any invoice
);

-- ── Section 2: New tables ────────────────────────────────────────────────────

-- 2.1 discount_definitions
-- Org-scoped discount programs. Soft-deactivated (is_active=false), never deleted.
-- requires_coupon=true means a coupon_code is required to apply this discount;
-- requires_coupon=false means the discount can be applied directly by staff.

CREATE TABLE public.discount_definitions (
  id                    uuid                   NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid                   NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                  text                   NOT NULL,
  description           text,
  discount_type         public.discount_type   NOT NULL,
  discount_scope        public.discount_scope  NOT NULL DEFAULT 'all',
  scope_reference_id    uuid,
  scope_category        public.lesson_category,
  discount_value        numeric(10,4)          NOT NULL CHECK (discount_value > 0),
  max_discount_amount   numeric(12,2)          CHECK (max_discount_amount IS NULL OR max_discount_amount > 0),
  currency              text                   NOT NULL DEFAULT 'SEK',
  valid_from            date,
  valid_to              date,
  is_active             boolean                NOT NULL DEFAULT true,
  requires_coupon       boolean                NOT NULL DEFAULT false,
  metadata              jsonb                  NOT NULL DEFAULT '{}',
  created_at            timestamptz            NOT NULL DEFAULT now(),
  updated_at            timestamptz            NOT NULL DEFAULT now(),
  created_by            uuid                   REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by            uuid                   REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT discount_percentage_range CHECK (
    discount_type <> 'percentage'
    OR (discount_value > 0 AND discount_value <= 1)
  ),
  CONSTRAINT discount_valid_dates CHECK (
    valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from
  ),
  CONSTRAINT discount_scope_reference CHECK (
    (discount_scope IN ('offering', 'catalog') AND scope_reference_id IS NOT NULL)
    OR (discount_scope = 'category'            AND scope_category IS NOT NULL)
    OR (discount_scope = 'all')
  )
);

COMMENT ON TABLE  public.discount_definitions IS
  'Org-scoped discount programs. Discounts with requires_coupon=false can be applied '
  'directly by staff. Those with requires_coupon=true require a valid coupon_code.';
COMMENT ON COLUMN public.discount_definitions.discount_value IS
  'For percentage: 0 < value <= 1 (0.15 = 15% off). '
  'For fixed: absolute amount in currency.';
COMMENT ON COLUMN public.discount_definitions.max_discount_amount IS
  'Cap for percentage discounts. NULL = no cap.';

CREATE TRIGGER set_discount_definitions_updated_at
  BEFORE UPDATE ON public.discount_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.2 coupon_codes
-- Redeemable codes that unlock a specific discount_definition.
-- redemption_limit_total: NULL = unlimited total redemptions.
-- redemption_limit_per_student: NULL = unlimited per student.
-- redemptions_count is a denormalized counter updated atomically by redeem_coupon().

CREATE TABLE public.coupon_codes (
  id                         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id            uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  discount_id                uuid        NOT NULL REFERENCES public.discount_definitions(id) ON DELETE RESTRICT,
  code                       text        NOT NULL,
  description                text,
  redemption_limit_total     int         CHECK (redemption_limit_total IS NULL OR redemption_limit_total > 0),
  redemption_limit_per_student int       CHECK (redemption_limit_per_student IS NULL OR redemption_limit_per_student > 0),
  redemptions_count          int         NOT NULL DEFAULT 0 CHECK (redemptions_count >= 0),
  valid_from                 date,
  valid_to                   date,
  is_active                  boolean     NOT NULL DEFAULT true,
  metadata                   jsonb       NOT NULL DEFAULT '{}',
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT coupon_codes_org_code_unique UNIQUE (organization_id, code),
  CONSTRAINT coupon_valid_dates CHECK (
    valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from
  )
);

COMMENT ON TABLE  public.coupon_codes IS
  'Redeemable coupon codes linked to a discount_definition. '
  'redemptions_count is updated atomically by redeem_coupon() via SELECT FOR UPDATE.';

CREATE TRIGGER set_coupon_codes_updated_at
  BEFORE UPDATE ON public.coupon_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2.3 discount_applications
-- Append-only audit log of applied discounts.
-- Each record links a discount (and optional coupon) to the invoice line item created.
-- Never modified after creation — immutable audit trail.

CREATE TABLE public.discount_applications (
  id                   uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id           uuid          NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  invoice_line_item_id uuid          NOT NULL REFERENCES public.invoice_line_items(id) ON DELETE RESTRICT,
  discount_id          uuid          NOT NULL REFERENCES public.discount_definitions(id) ON DELETE RESTRICT,
  coupon_id            uuid          REFERENCES public.coupon_codes(id) ON DELETE RESTRICT,
  student_id           uuid          NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  original_subtotal    numeric(12,2) NOT NULL CHECK (original_subtotal >= 0),
  discount_amount      numeric(12,2) NOT NULL CHECK (discount_amount > 0),
  applied_at           timestamptz   NOT NULL DEFAULT now(),
  applied_by           uuid          REFERENCES auth.users(id) ON DELETE SET NULL

  -- NO updated_at: append-only. Immutable audit trail.
);

COMMENT ON TABLE  public.discount_applications IS
  'Append-only log of applied discounts. '
  'Each row corresponds to a discount invoice_line_item created on a draft invoice. '
  'Never modify a discount_application — corrections require voiding and reissuing the invoice.';
COMMENT ON COLUMN public.discount_applications.original_subtotal IS
  'Invoice subtotal (sum of non-discount line totals) at the moment the discount was applied.';
COMMENT ON COLUMN public.discount_applications.discount_amount IS
  'Absolute amount discounted (always positive). The line_item has negative unit_price.';

-- ── Section 3: Audit triggers ────────────────────────────────────────────────

CREATE TRIGGER discount_definitions_audit
  AFTER INSERT OR UPDATE ON public.discount_definitions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER coupon_codes_audit
  AFTER INSERT OR UPDATE ON public.coupon_codes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER discount_applications_audit
  AFTER INSERT ON public.discount_applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ── Section 4: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.discount_definitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_codes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_applications ENABLE ROW LEVEL SECURITY;

-- discount_definitions
CREATE POLICY "discount_definitions_select"
  ON public.discount_definitions FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:discount:read')
  );

CREATE POLICY "discount_definitions_insert"
  ON public.discount_definitions FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:discount:create')
  );

CREATE POLICY "discount_definitions_update"
  ON public.discount_definitions FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:discount:create')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:discount:create')
  );

-- coupon_codes
CREATE POLICY "coupon_codes_select"
  ON public.coupon_codes FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:coupon:read')
  );

CREATE POLICY "coupon_codes_insert"
  ON public.coupon_codes FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:coupon:create')
  );

CREATE POLICY "coupon_codes_update"
  ON public.coupon_codes FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:coupon:create')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:coupon:create')
  );

-- discount_applications: read with discount:read; no direct INSERT (only via RPC)
CREATE POLICY "discount_applications_select"
  ON public.discount_applications FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:discount:read')
  );

-- ── Section 5: Table grants ──────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.discount_definitions  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.coupon_codes          TO authenticated, service_role;
GRANT SELECT                 ON public.discount_applications TO authenticated;
GRANT SELECT, INSERT         ON public.discount_applications TO service_role;

-- ── Section 6: SECURITY DEFINER Functions ────────────────────────────────────

-- ── 6.1 apply_discount ───────────────────────────────────────────────────────
-- Apply a discount_definition to a draft invoice.
-- Creates a discount invoice_line_item (negative amount) and a discount_application record.
-- The actual invoice totals are NOT updated here — issue_invoice() recomputes from line items.
-- Validates:
--   • invoice is draft
--   • period not locked
--   • discount is active and within valid dates
--   • discount scope matches invoice content
--   • discount does not bring subtotal negative

CREATE OR REPLACE FUNCTION public.apply_discount(
  p_org_id      uuid,
  p_invoice_id  uuid,
  p_discount_id uuid,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS uuid  -- discount_application_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice          invoices%ROWTYPE;
  v_discount         discount_definitions%ROWTYPE;
  v_current_subtotal numeric(12,2);
  v_discount_amount  numeric(12,2);
  v_line_item_id     uuid;
  v_application_id   uuid;
BEGIN
  -- 1. Lock and validate invoice
  SELECT * INTO v_invoice
  FROM   invoices
  WHERE  id              = p_invoice_id
    AND  organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'INVOICE_NOT_DRAFT: discounts can only be applied to draft invoices; invoice % has status %',
      p_invoice_id, v_invoice.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Period lock guard
  PERFORM assert_period_not_locked(p_org_id, now()::date);

  -- 2. Validate discount definition
  SELECT * INTO v_discount
  FROM   discount_definitions
  WHERE  id              = p_discount_id
    AND  organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISCOUNT_NOT_FOUND: discount % not found in org %',
      p_discount_id, p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_discount.is_active THEN
    RAISE EXCEPTION 'DISCOUNT_INACTIVE: discount % is not active', p_discount_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_discount.valid_from IS NOT NULL AND now()::date < v_discount.valid_from THEN
    RAISE EXCEPTION 'DISCOUNT_NOT_YET_VALID: discount % is valid from %',
      p_discount_id, v_discount.valid_from
      USING ERRCODE = 'P0001';
  END IF;

  IF v_discount.valid_to IS NOT NULL AND now()::date > v_discount.valid_to THEN
    RAISE EXCEPTION 'DISCOUNT_EXPIRED: discount % expired on %',
      p_discount_id, v_discount.valid_to
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate scope (offering/catalog scope requires matching line items)
  IF v_discount.discount_scope = 'offering' THEN
    IF NOT EXISTS (
      SELECT 1 FROM invoice_line_items ili
      JOIN   package_offerings po ON po.id = ili.student_package_id
      WHERE  ili.invoice_id = p_invoice_id
        AND  po.id          = v_discount.scope_reference_id
    ) THEN
      RAISE EXCEPTION 'DISCOUNT_SCOPE_MISMATCH: discount % requires offering % on invoice %',
        p_discount_id, v_discount.scope_reference_id, p_invoice_id
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF v_discount.discount_scope = 'catalog' THEN
    IF NOT EXISTS (
      SELECT 1 FROM invoice_line_items ili
      JOIN   package_offerings po ON po.id = ili.student_package_id
      WHERE  ili.invoice_id = p_invoice_id
        AND  po.catalog_id  = v_discount.scope_reference_id
    ) THEN
      RAISE EXCEPTION 'DISCOUNT_SCOPE_MISMATCH: discount % requires catalog % on invoice %',
        p_discount_id, v_discount.scope_reference_id, p_invoice_id
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF v_discount.discount_scope = 'category' THEN
    IF NOT EXISTS (
      SELECT 1 FROM invoice_line_items ili
      JOIN   package_offerings po ON po.id = ili.student_package_id
      WHERE  ili.invoice_id = p_invoice_id
        AND  po.lesson_category = v_discount.scope_category
    ) THEN
      RAISE EXCEPTION 'DISCOUNT_SCOPE_MISMATCH: discount % requires category % on invoice %',
        p_discount_id, v_discount.scope_category, p_invoice_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 4. Compute current subtotal (excluding existing discount lines)
  SELECT COALESCE(SUM(line_total), 0)
  INTO   v_current_subtotal
  FROM   invoice_line_items
  WHERE  invoice_id = p_invoice_id
    AND  line_type <> 'discount';

  -- 5. Calculate discount amount
  IF v_discount.discount_type = 'percentage' THEN
    v_discount_amount := v_current_subtotal * v_discount.discount_value;
    -- Apply cap if configured
    IF v_discount.max_discount_amount IS NOT NULL THEN
      v_discount_amount := LEAST(v_discount_amount, v_discount.max_discount_amount);
    END IF;
  ELSE
    -- fixed discount
    v_discount_amount := v_discount.discount_value;
  END IF;

  -- Round to 2 decimal places
  v_discount_amount := ROUND(v_discount_amount, 2);

  -- 6. Over-discount protection: discount cannot bring subtotal negative
  IF v_discount_amount > v_current_subtotal THEN
    v_discount_amount := v_current_subtotal;
  END IF;

  IF v_discount_amount <= 0 THEN
    RAISE EXCEPTION 'DISCOUNT_ZERO: computed discount amount is 0 for invoice % with discount %',
      p_invoice_id, p_discount_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Insert discount line item (negative unit_price; vat_rate=0 for discount lines)
  INSERT INTO invoice_line_items (
    organization_id, invoice_id,
    line_type, description,
    quantity, unit_price,
    vat_rate, vat_amount, line_total,
    sort_order
  ) VALUES (
    p_org_id, p_invoice_id,
    'discount',
    v_discount.name,
    1,
    -v_discount_amount,
    0, 0, -v_discount_amount,
    1000  -- sort to bottom of line items
  ) RETURNING id INTO v_line_item_id;

  -- 8. Insert discount_application record
  INSERT INTO discount_applications (
    organization_id, invoice_id, invoice_line_item_id,
    discount_id, coupon_id,
    student_id,
    original_subtotal, discount_amount,
    applied_by
  ) VALUES (
    p_org_id, p_invoice_id, v_line_item_id,
    p_discount_id, NULL,
    v_invoice.student_id,
    v_current_subtotal, v_discount_amount,
    p_actor_id
  ) RETURNING id INTO v_application_id;

  -- 9. Emit Discount.Applied
  PERFORM insert_outbox_event(
    'Discount.Applied',
    'internal',
    jsonb_build_object(
      'application_id',  v_application_id,
      'discount_id',     p_discount_id,
      'discount_name',   v_discount.name,
      'invoice_id',      p_invoice_id,
      'line_item_id',    v_line_item_id,
      'student_id',      v_invoice.student_id,
      'discount_amount', v_discount_amount,
      'original_subtotal', v_current_subtotal
    ),
    p_org_id,
    v_invoice.student_id::text
  );

  RETURN v_application_id;
END;
$$;

-- ── 6.2 redeem_coupon ────────────────────────────────────────────────────────
-- Validate and apply a coupon code to a draft invoice.
-- Validates:
--   • coupon exists, is active, within valid dates
--   • total redemption limit not exceeded
--   • per-student redemption limit not exceeded
--   • delegates discount application to apply_discount()

CREATE OR REPLACE FUNCTION public.redeem_coupon(
  p_org_id      uuid,
  p_invoice_id  uuid,
  p_coupon_code text,
  p_student_id  uuid,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS uuid  -- discount_application_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon          coupon_codes%ROWTYPE;
  v_student_count   int;
  v_application_id  uuid;
BEGIN
  -- Lock coupon row (serializes concurrent redemptions for the same code)
  SELECT * INTO v_coupon
  FROM   coupon_codes
  WHERE  code             = p_coupon_code
    AND  organization_id  = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COUPON_NOT_FOUND: coupon code "%" not found in org %',
      p_coupon_code, p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_coupon.is_active THEN
    RAISE EXCEPTION 'COUPON_INACTIVE: coupon "%" is not active', p_coupon_code
      USING ERRCODE = 'P0001';
  END IF;

  IF v_coupon.valid_from IS NOT NULL AND now()::date < v_coupon.valid_from THEN
    RAISE EXCEPTION 'COUPON_NOT_YET_VALID: coupon "%" is valid from %',
      p_coupon_code, v_coupon.valid_from
      USING ERRCODE = 'P0001';
  END IF;

  IF v_coupon.valid_to IS NOT NULL AND now()::date > v_coupon.valid_to THEN
    RAISE EXCEPTION 'COUPON_EXPIRED: coupon "%" expired on %',
      p_coupon_code, v_coupon.valid_to
      USING ERRCODE = 'P0001';
  END IF;

  -- Check total redemption limit
  IF v_coupon.redemption_limit_total IS NOT NULL
    AND v_coupon.redemptions_count >= v_coupon.redemption_limit_total
  THEN
    RAISE EXCEPTION 'COUPON_LIMIT_REACHED: coupon "%" has reached its total redemption limit of %',
      p_coupon_code, v_coupon.redemption_limit_total
      USING ERRCODE = 'P0001';
  END IF;

  -- Check per-student limit
  IF v_coupon.redemption_limit_per_student IS NOT NULL THEN
    SELECT COUNT(*)
    INTO   v_student_count
    FROM   discount_applications
    WHERE  coupon_id   = v_coupon.id
      AND  student_id  = p_student_id;

    IF v_student_count >= v_coupon.redemption_limit_per_student THEN
      RAISE EXCEPTION 'COUPON_STUDENT_LIMIT: coupon "%" already used % time(s) by this student (limit: %)',
        p_coupon_code, v_student_count, v_coupon.redemption_limit_per_student
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Apply the discount (handles all remaining validation + line item + event)
  v_application_id := apply_discount(p_org_id, p_invoice_id, v_coupon.discount_id, p_actor_id);

  -- Update the discount_application to link the coupon
  UPDATE discount_applications
  SET coupon_id = v_coupon.id
  WHERE id = v_application_id;

  -- Increment redemption counter (atomically, since we hold FOR UPDATE on coupon row)
  UPDATE coupon_codes
  SET
    redemptions_count = redemptions_count + 1,
    updated_at        = now()
  WHERE id = v_coupon.id;

  -- Emit Coupon.Redeemed (in addition to Discount.Applied from apply_discount)
  PERFORM insert_outbox_event(
    'Coupon.Redeemed',
    'internal',
    jsonb_build_object(
      'coupon_id',       v_coupon.id,
      'coupon_code',     p_coupon_code,
      'application_id',  v_application_id,
      'student_id',      p_student_id,
      'invoice_id',      p_invoice_id,
      'redemption_count', v_coupon.redemptions_count + 1
    ),
    p_org_id,
    p_student_id::text
  );

  RETURN v_application_id;
END;
$$;

-- ── Section 7: Function grants ───────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.apply_discount(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.redeem_coupon(uuid, uuid, text, uuid, uuid)
  TO authenticated, service_role;

-- ── Section 8: New permissions ───────────────────────────────────────────────

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'finance:discount:create', 'finance', 'discount', 'create', 'Create and manage discount programs'),
  (gen_random_uuid(), 'finance:discount:read',   'finance', 'discount', 'read',   'View discount definitions and applications'),
  (gen_random_uuid(), 'finance:discount:assign', 'finance', 'discount', 'assign', 'Apply discounts and redeem coupons on invoices'),
  (gen_random_uuid(), 'finance:coupon:create',   'finance', 'coupon',   'create', 'Create coupon codes for discount programs'),
  (gen_random_uuid(), 'finance:coupon:read',     'finance', 'coupon',   'read',   'View coupon codes and redemption history')
ON CONFLICT (code) DO NOTHING;

-- ── Section 9: Role-permission assignments ───────────────────────────────────

-- org_owner: full discount + coupon access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_owner'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:discount:create', 'finance:discount:read', 'finance:discount:assign',
    'finance:coupon:create', 'finance:coupon:read'
  ])
ON CONFLICT DO NOTHING;

-- org_admin: full discount + coupon access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_admin'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:discount:create', 'finance:discount:read', 'finance:discount:assign',
    'finance:coupon:create', 'finance:coupon:read'
  ])
ON CONFLICT DO NOTHING;

-- finance_admin: full discount + coupon access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'finance_admin'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:discount:create', 'finance:discount:read', 'finance:discount:assign',
    'finance:coupon:create', 'finance:coupon:read'
  ])
ON CONFLICT DO NOTHING;

-- org_manager: read + assign
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'org_manager'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:discount:read', 'finance:discount:assign',
    'finance:coupon:read'
  ])
ON CONFLICT DO NOTHING;

-- receptionist: assign only (can apply discounts/coupons at desk)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS  JOIN public.permissions p
WHERE  r.name = 'receptionist'
  AND  r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'finance:discount:read', 'finance:discount:assign',
    'finance:coupon:read'
  ])
ON CONFLICT DO NOTHING;
