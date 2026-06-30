-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260701000006_b1_fix_package_billing_quantity.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Sprint:    B-1 — Package Billing Arithmetic Remediation (Model A)
--
-- ROOT CAUSE (B-1):
--   create_order() (20260630000003) stores the package order_items line with:
--
--     quantity  = COALESCE(p_package_quantity, 1)   — entitlement count (e.g. 30)
--     unit_price = p_base_price                     — total package price (e.g. 10,000)
--     total_price = p_base_price                    — correct total (e.g. 10,000)
--
--   issue_invoice() computes:
--     line_total = quantity × unit_price = 30 × 10,000 = 300,000
--     vat_amount = 300,000 × 0.25 = 75,000
--     invoice total = 375,000 SEK
--
--   Correct invoice total for a 10,000 SEK package at 25% VAT = 12,500 SEK.
--   Overcharge factor = package_quantity (30×).
--
--   Root cause: p_package_quantity is the lesson entitlement count, not a
--   billing multiplier. base_price is the TOTAL package price (confirmed by
--   order header arithmetic: v_total_incl_vat = p_base_price × 1.25 with no
--   package_quantity factor). The package is a single billable unit.
--
-- REMEDIATION (Model A):
--   Set quantity = 1 on the package order_items line.
--   unit_price = p_base_price (total package price, unchanged).
--   total_price = p_base_price (unchanged).
--
--   Post-fix arithmetic:
--     line_total = 1 × 10,000 = 10,000  ✓
--     vat_amount = 10,000 × 0.25 = 2,500  ✓
--     invoice total = 12,500 SEK  ✓
--     quantity × unit_price = total_price invariant restored.
--
-- WHAT IS UNCHANGED:
--   - orders.package_quantity         — preserved; entitlement snapshot on order header
--   - student_package_assignments.*   — unmodified; remaining_lessons/package_quantity
--                                       are set by convert_enrollment_to_student(), not
--                                       by order_items.quantity
--   - create_invoice_from_order()     — unmodified; copies quantity/unit_price verbatim;
--                                       now receives (1, base_price) instead of (30, base_price)
--   - issue_invoice()                 — unmodified; computes line_total = quantity × unit_price;
--                                       now produces correct amounts automatically
--   - void_invoice()                  — unmodified
--   - update_order_status()           — unmodified
--   - emit_order_event()              — unmodified
--   - All RLS policies                — unmodified
--   - All reporting views             — unmodified (read from orders header, not order_items)
--   - All accounting/VAT/SIE4 chains  — unmodified; receive corrected amounts via invoices
--   - Discount line item semantics    — unchanged (quantity=1 was already correct)
--   - Function signature              — unchanged (identical parameter list and return type)
--   - SECURITY DEFINER / search_path  — unchanged
--   - REVOKE / GRANT set              — unchanged
--
-- SOLE CHANGE:
--   order_items package INSERT:
--     BEFORE: quantity = COALESCE(p_package_quantity, 1)
--     AFTER:  quantity = 1
--
-- HISTORICAL DATA:
--   No production data exists (pre-production project).
--   Defective test invoices created through create_invoice_from_order() must be
--   voided after this migration is applied. void_invoice() (20260701000005) resets
--   orders.status to 'draft', enabling re-invoicing through the corrected path.
--
-- DEPLOYMENT ORDER:
--   Requires 20260701000005_fix_void_reinvoice_lifecycle.sql to be applied first
--   (already applied). No other dependencies beyond the original order_management
--   migration (20260630000003).
-- ════════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION public.create_order(
  p_organization_id     uuid,
  p_student_id          uuid    DEFAULT NULL,
  p_enrollment_id       uuid    DEFAULT NULL,
  p_package_offering_id uuid    DEFAULT NULL,
  p_package_name        text    DEFAULT NULL,
  p_package_code        text    DEFAULT NULL,
  p_lesson_category     text    DEFAULT NULL,
  p_package_quantity    int     DEFAULT NULL,
  p_campaign_id         uuid    DEFAULT NULL,
  p_campaign_name       text    DEFAULT NULL,
  p_coupon_id           uuid    DEFAULT NULL,
  p_coupon_code         text    DEFAULT NULL,
  p_base_price          numeric DEFAULT 0,
  p_campaign_discount   numeric DEFAULT 0,
  p_coupon_discount     numeric DEFAULT 0,
  p_vat_rate            numeric DEFAULT 0.25,
  p_currency            text    DEFAULT 'SEK',
  p_internal_notes      text    DEFAULT NULL,
  p_actor_id            uuid    DEFAULT NULL,
  p_actor_email         text    DEFAULT NULL,
  p_metadata            jsonb   DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal            numeric(12,2);
  v_vat_amount          numeric(12,2);
  v_total               numeric(12,2);
  v_total_incl_vat      numeric(12,2);
  v_order_id            uuid;
  v_order_number        bigint;
  v_sort                int := 0;
BEGIN
  -- Calculate pricing
  v_subtotal       := GREATEST(0, p_base_price - p_campaign_discount - p_coupon_discount);
  v_vat_amount     := ROUND(v_subtotal * p_vat_rate, 2);
  v_total          := v_subtotal;
  v_total_incl_vat := v_subtotal + v_vat_amount;

  -- Insert order (order_number assigned by trigger)
  INSERT INTO public.orders (
    organization_id,
    student_id,
    enrollment_id,
    status,
    package_offering_id,
    package_name,
    package_code,
    lesson_category,
    package_quantity,
    campaign_id,
    campaign_name,
    coupon_id,
    coupon_code,
    base_price,
    campaign_discount,
    coupon_discount,
    subtotal,
    vat_rate,
    vat_amount,
    total_amount,
    total_amount_incl_vat,
    currency,
    internal_notes,
    metadata,
    created_by,
    updated_by
  ) VALUES (
    p_organization_id,
    p_student_id,
    p_enrollment_id,
    'draft',
    p_package_offering_id,
    p_package_name,
    p_package_code,
    p_lesson_category,
    p_package_quantity,
    p_campaign_id,
    p_campaign_name,
    p_coupon_id,
    p_coupon_code,
    p_base_price,
    p_campaign_discount,
    p_coupon_discount,
    v_subtotal,
    p_vat_rate,
    v_vat_amount,
    v_total,
    v_total_incl_vat,
    p_currency,
    p_internal_notes,
    p_metadata,
    p_actor_id,
    p_actor_id
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  -- Package line item
  -- B-1 FIX: quantity = 1 (was COALESCE(p_package_quantity, 1)).
  -- base_price is the total package price, not a per-lesson rate.
  -- The lesson entitlement count is preserved on orders.package_quantity and
  -- materialised in student_package_assignments — it is not a billing multiplier.
  -- Invariant restored: quantity(1) × unit_price(base_price) = total_price(base_price).
  IF p_package_name IS NOT NULL THEN
    INSERT INTO public.order_items (
      organization_id, order_id, item_type, description,
      quantity, unit_price, total_price,
      package_offering_id, sort_order
    ) VALUES (
      p_organization_id, v_order_id, 'package',
      COALESCE(p_package_name, 'Paket'),
      1, p_base_price, p_base_price,
      p_package_offering_id, 0
    );
    v_sort := v_sort + 1;
  END IF;

  -- Campaign discount line item
  IF p_campaign_discount > 0 THEN
    INSERT INTO public.order_items (
      organization_id, order_id, item_type, description,
      quantity, unit_price, total_price,
      campaign_id, sort_order
    ) VALUES (
      p_organization_id, v_order_id, 'campaign_discount',
      'Kampanjrabatt' || CASE WHEN p_campaign_name IS NOT NULL
        THEN ': ' || p_campaign_name ELSE '' END,
      1, -p_campaign_discount, -p_campaign_discount,
      p_campaign_id, v_sort
    );
    v_sort := v_sort + 1;
  END IF;

  -- Coupon discount line item
  IF p_coupon_discount > 0 THEN
    INSERT INTO public.order_items (
      organization_id, order_id, item_type, description,
      quantity, unit_price, total_price,
      coupon_id, sort_order
    ) VALUES (
      p_organization_id, v_order_id, 'coupon_discount',
      'Kupongkod' || CASE WHEN p_coupon_code IS NOT NULL
        THEN ': ' || p_coupon_code ELSE '' END,
      1, -p_coupon_discount, -p_coupon_discount,
      p_coupon_id, v_sort
    );
  END IF;

  -- Emit initial audit event
  PERFORM public.emit_order_event(
    p_organization_id, v_order_id, 'order_created',
    p_actor_id, p_actor_email,
    jsonb_build_object(
      'status',                'draft',
      'package_name',          p_package_name,
      'total_amount_incl_vat', v_total_incl_vat,
      'currency',              p_currency
    )
  );

  RETURN jsonb_build_object(
    'order_id',              v_order_id,
    'order_number',          v_order_number,
    'status',                'draft',
    'total_amount_incl_vat', v_total_incl_vat,
    'currency',              p_currency
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.create_order(uuid,uuid,uuid,uuid,text,text,text,int,uuid,text,uuid,text,numeric,numeric,numeric,numeric,text,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(uuid,uuid,uuid,uuid,text,text,text,int,uuid,text,uuid,text,numeric,numeric,numeric,numeric,text,text,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(uuid,uuid,uuid,uuid,text,text,text,int,uuid,text,uuid,text,numeric,numeric,numeric,numeric,text,text,uuid,text,jsonb) TO service_role;
