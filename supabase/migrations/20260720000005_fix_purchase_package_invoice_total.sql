-- =============================================================================
-- MIGRATION: 20260720000005_fix_purchase_package_invoice_total.sql
-- Description:
--   Sprint 4I operational validation (Pilot Validation Tenant, receptionist
--   login, real package purchase through the UI) found that every package
--   purchase invoice is created with a subtotal 10x too high — a "10
--   Körlektioner Standard" package priced at 4 500 kr generated a draft
--   invoice with subtotal_amount 45 000 and total_amount 56 250 (should be
--   4 500 / 5 625).
--
--   Root cause: public.purchase_package() (defined in
--   20260530000001_phase4a_commercial_core.sql, replaced in
--   20260531000001_phase4b_refunds_allocations.sql) computed:
--
--     v_line_total := v_offering.quantity * v_offering.price;
--
--   This treats package_offerings.price as a PER-LESSON unit price and
--   multiplies it by quantity. But price is the total price for the whole
--   package/bundle — every frontend surface (PackageDetailPage,
--   PackageListPage, PackageCatalogPage, the sell-package dialog) already
--   treats it that way, e.g. "Per lektion ex. moms" is computed as
--   offering.price / offering.quantity, and "Totalt inkl. moms" as
--   offering.price * (1 + vat_rate) with no quantity multiplication
--   anywhere. The RPC was the sole outlier, and it writes the actual
--   invoice and invoice_line_items rows, so the error was not just
--   cosmetic — it overbilled every package sale by a factor of `quantity`.
--
--   Fix: v_line_total is now v_offering.price directly (the total package
--   price), matching invoice_line_items.unit_price to the same value with
--   quantity 1, consistent with how the row is already interpreted
--   everywhere else (one line item representing one package).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purchase_package(
  p_org_id      uuid,
  p_student_id  uuid,
  p_offering_id uuid,
  p_actor_id    uuid
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
  -- Period lock guard (Phase 4B addition)
  PERFORM assert_period_not_locked(p_org_id, now()::date);

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
  -- package_offerings.price is the TOTAL price for the whole package, not a
  -- per-lesson unit price — do not multiply by quantity.
  v_line_total   := v_offering.price;
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
    v_offering.price,
    v_offering.vat_rate,
    v_vat_amount,
    v_line_total
  );

  -- 7. Create credit_ledger grant for primary category
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
