-- =============================================================================
-- MIGRATION: 20260720000006_sync_purchase_package_to_assignments.sql
-- Description:
--   Sprint 4I operational validation (Pilot Validation Tenant, receptionist
--   login) found that a package purchased through the "Sälj paket" button
--   on the student's Konto page never appears in that same page's own
--   "Paket & krediter" panel — it permanently shows "Inga paket
--   tilldelade" no matter how many packages are sold.
--
--   Root cause: two disconnected package-tracking systems exist side by
--   side. purchase_package() (Phase 4A/4B, May) writes only to
--   student_packages. The "Paket & krediter" panel (StudentPackagePanel,
--   via usePackageConsumption's useStudentPackages) reads exclusively from
--   student_package_assignments — a newer table introduced by the
--   enrollment/commercial-lifecycle work (June/July) that
--   purchase_package() was never updated to populate. Because the two
--   tables never intersect, every credit-consumption feature built on top
--   of student_package_assignments (Registrera kredit / Återför kredit,
--   the event timeline, expiry sweeps) is unreachable for any package sold
--   through this button — the assignment row it depends on never exists.
--
--   This is an additive fix, not a data-model unification: it makes
--   purchase_package() also insert the corresponding
--   student_package_assignments row (enrollment_id, campaign_id, coupon_id
--   left NULL — this is a direct manual sale, not an enrollment/campaign
--   flow) so the two tables agree from this point forward. It does not
--   touch the enrollment/order commercial-lifecycle tables or backfill
--   historical student_packages rows purchased before this fix.
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

  -- 4b. Mirror this purchase into student_package_assignments so the
  -- consumption/reversal UI and event timeline (which read exclusively
  -- from this table) can see it. Manual direct sale: no enrollment,
  -- campaign, or coupon linkage.
  INSERT INTO student_package_assignments (
    organization_id, student_id, enrollment_id, package_offering_id,
    package_name, package_code, lesson_category, package_quantity,
    campaign_id, campaign_name, coupon_id, coupon_code,
    base_price, vat_rate, campaign_discount, coupon_discount,
    final_price, final_price_incl_vat, currency,
    lessons_used, status, expires_at,
    assigned_at, assigned_by
  ) VALUES (
    p_org_id, p_student_id, NULL, p_offering_id,
    v_offering.name, v_offering.package_code, v_offering.lesson_category, v_offering.quantity,
    NULL, NULL, NULL, NULL,
    v_line_total, v_offering.vat_rate, 0, 0,
    v_line_total, v_total_amount, v_offering.currency,
    0, 'active', v_expires_at,
    now(), p_actor_id
  );

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
