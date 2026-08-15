-- SECURITY REMEDIATION WAVE 2C-C2-R2 — SQL-LEVEL RBAC ENFORCEMENT
--
-- Wave 2C-C2 (20260815230000) added tenant/organization and actor
-- validation to 12 CRITICAL financial mutation SECURITY DEFINER
-- functions. The Wave 2C-C2-R1 read-only analysis found that none of
-- them enforce the caller's business permission at the SQL layer —
-- that check exists only in the Edge Function (ctx.permissions.includes()),
-- which every one of the 5 real production callers reaches via a
-- forwarded-JWT ANON_KEY client (authenticated role), never
-- service_role. That means a direct PostgREST RPC call from any
-- authenticated user, for their own organization, currently bypasses
-- the intended permission gate entirely.
--
-- This migration closes that gap by adding an SQL-level
-- public.has_permission(<exact permission the real Edge Function
-- route already requires>) check to each of the 12 functions,
-- bypassed by public.is_trusted_service_context() exactly like the
-- existing org/actor checks. It does NOT change grants (still
-- authenticated + service_role, no anon/PUBLIC — set in
-- 20260815230000), does NOT change tenant validation, does NOT change
-- actor validation, does NOT change business logic, and does NOT
-- touch the already-applied 20260815230000 migration.
--
-- Permission mapping (confirmed against real Edge Function source in
-- Wave 2C-C2-R1):
--   create_order                      -> orders:order:create        (orders/index.ts handleCreate)
--   post_retained_earnings_entry      -> finance:year_end:manage     (financial-close/index.ts retained-earnings route)
--   post_year_end_profit_transfer     -> finance:payroll:post        (payroll/index.ts year-end/profit-transfer route)
--   post_impairment_adjustment        -> finance:assets:depreciate   (fixed-assets/index.ts handleImpair)
--   post_opening_balance_entry        -> finance:payroll:manage      (payroll/index.ts opening-balances route)
--   create_fiscal_year                -> finance:year_end:manage     (financial-close/index.ts POST fiscal-years)
--   assign_period_to_fiscal_year      -> finance:year_end:manage     (financial-close/index.ts assign-period route)
--   create_accrual_schedule           -> finance:accruals:manage     (accruals/index.ts handleCreateAccrual)
--   cancel_accrual_schedule           -> finance:accruals:manage     (accruals/index.ts handleCancelAccrual)
--   create_periodic_deferred_schedule -> finance:accruals:manage     (accruals/index.ts handleCreateDeferred)
--   register_fixed_asset              -> finance:assets:manage       (fixed-assets/index.ts handleRegister)
--   rollover_opening_balances         -> finance:year_end:manage     (financial-close/index.ts rollover route)

-- ============================================================================
-- 1. create_order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_order(p_organization_id uuid, p_student_id uuid DEFAULT NULL::uuid, p_enrollment_id uuid DEFAULT NULL::uuid, p_package_offering_id uuid DEFAULT NULL::uuid, p_package_name text DEFAULT NULL::text, p_package_code text DEFAULT NULL::text, p_lesson_category text DEFAULT NULL::text, p_package_quantity integer DEFAULT NULL::integer, p_campaign_id uuid DEFAULT NULL::uuid, p_campaign_name text DEFAULT NULL::text, p_coupon_id uuid DEFAULT NULL::uuid, p_coupon_code text DEFAULT NULL::text, p_base_price numeric DEFAULT 0, p_campaign_discount numeric DEFAULT 0, p_coupon_discount numeric DEFAULT 0, p_vat_rate numeric DEFAULT 0.25, p_currency text DEFAULT 'SEK'::text, p_internal_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid, p_actor_email text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_subtotal            numeric(12,2);
  v_vat_amount          numeric(12,2);
  v_total               numeric(12,2);
  v_total_incl_vat      numeric(12,2);
  v_order_id            uuid;
  v_order_number        bigint;
  v_sort                int := 0;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_organization_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ORDER_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('orders:order:create') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

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
$function$;

-- ============================================================================
-- 2. post_retained_earnings_entry
-- ============================================================================
CREATE OR REPLACE FUNCTION public.post_retained_earnings_entry(p_fiscal_year_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fy              fiscal_years%ROWTYPE;
  v_year_end_period financial_periods%ROWTYPE;
  v_lines           jsonb := '[]'::jsonb;
  v_line_num        int := 1;
  v_total_debit     numeric(12,2) := 0;
  v_total_credit    numeric(12,2) := 0;
  v_net             numeric(12,2);
  v_entry_id        uuid;
  v_ab              RECORD;
BEGIN
  SELECT * INTO v_fy FROM fiscal_years WHERE id = p_fiscal_year_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % not found', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_fy.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % not found', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'RETAINED_EARNINGS_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('finance:year_end:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

  IF v_fy.retained_earnings_entry_id IS NOT NULL THEN
    RETURN v_fy.retained_earnings_entry_id;  -- Idempotent
  END IF;

  SELECT * INTO v_year_end_period
  FROM financial_periods
  WHERE fiscal_year_id = p_fiscal_year_id AND is_year_end_period = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NO_YEAR_END_PERIOD: no year-end period assigned to fiscal year %',
      p_fiscal_year_id USING ERRCODE = 'P0001';
  END IF;
  IF v_year_end_period.status = 'locked' THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: year-end period % is already locked. '
      'Retained earnings must be posted before hard-closing the year-end period.',
      v_year_end_period.id USING ERRCODE = 'P0001';
  END IF;

  -- Build closing lines: sweep all income statement accounts (3xxx – 8xxx)
  FOR v_ab IN
    SELECT account_code, closing_balance
    FROM account_balances
    WHERE financial_period_id = v_year_end_period.id
      AND account_code >= '3' AND account_code < '9'
      AND ABS(closing_balance) >= 0.01
    ORDER BY account_code
  LOOP
    IF v_ab.closing_balance < 0 THEN
      v_lines := v_lines || jsonb_build_object(
        'account_code',  v_ab.account_code,
        'debit_amount',  ABS(v_ab.closing_balance),
        'credit_amount', 0,
        'description',   'Årets stängning — ' || v_ab.account_code
      );
      v_total_debit := v_total_debit + ABS(v_ab.closing_balance);
    ELSE
      v_lines := v_lines || jsonb_build_object(
        'account_code',  v_ab.account_code,
        'debit_amount',  0,
        'credit_amount', v_ab.closing_balance,
        'description',   'Årets stängning — ' || v_ab.account_code
      );
      v_total_credit := v_total_credit + v_ab.closing_balance;
    END IF;
  END LOOP;

  v_net := v_total_debit - v_total_credit;

  IF ABS(v_net) >= 0.01 THEN
    IF v_net > 0 THEN
      v_lines := v_lines || jsonb_build_object(
        'account_code',  '2091',
        'debit_amount',  0,
        'credit_amount', v_net,
        'description',   'Balanserat resultat — vinst'
      );
    ELSE
      v_lines := v_lines || jsonb_build_object(
        'account_code',  '2091',
        'debit_amount',  ABS(v_net),
        'credit_amount', 0,
        'description',   'Balanserat resultat — förlust'
      );
    END IF;
  END IF;

  IF jsonb_array_length(v_lines) < 2 THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NO_INCOME_ACCOUNTS: no income statement accounts with balances found '
      'in year-end period % for fiscal year %', v_year_end_period.id, p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;

  v_entry_id := public.post_journal_entry(
    p_org_id             => v_fy.organization_id,
    p_period_id          => v_year_end_period.id,
    p_entry_type         => 'closing',
    p_entry_date         => v_year_end_period.period_end,
    p_description        => format('Årets bokslutspost — räkenskapsår %s', v_fy.year_number),
    p_lines              => v_lines,
    p_source_event_type  => 'FiscalYear.Close',
    p_source_entity_type => 'fiscal_year',
    p_source_entity_id   => p_fiscal_year_id,
    p_voucher_series     => 'A',
    p_actor_id           => p_actor_id
  );

  UPDATE fiscal_years
  SET retained_earnings_entry_id = v_entry_id,
      updated_at                 = now()
  WHERE id = p_fiscal_year_id;

  RETURN v_entry_id;
END;
$function$;

-- ============================================================================
-- 3. post_year_end_profit_transfer
-- ============================================================================
CREATE OR REPLACE FUNCTION public.post_year_end_profit_transfer(p_org_id uuid, p_new_period_id uuid, p_prior_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance_2099  numeric(12,2) := 0;
  v_entry_id      uuid;
  v_lines         jsonb;
  v_new_period    financial_periods%ROWTYPE;
  v_prior_period  financial_periods%ROWTYPE;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'PROFIT_TRANSFER_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('finance:payroll:post') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_new_period FROM financial_periods WHERE id = p_new_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: new period % not found', p_new_period_id USING ERRCODE = 'P0001';
  END IF;
  -- New check: neither period was ever verified against p_org_id before
  -- this migration — both are confirmed to belong to the caller's org.
  IF v_new_period.organization_id IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: new period % not found', p_new_period_id USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_prior_period FROM financial_periods WHERE id = p_prior_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: prior period % not found', p_prior_period_id USING ERRCODE = 'P0001';
  END IF;
  IF v_prior_period.organization_id IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: prior period % not found', p_prior_period_id USING ERRCODE = 'P0001';
  END IF;

  -- Read 2099 closing balance from the prior period
  SELECT closing_balance INTO v_balance_2099
  FROM   account_balances
  WHERE  organization_id     = p_org_id
    AND  financial_period_id = p_prior_period_id
    AND  account_code        = '2099';

  IF v_balance_2099 IS NULL OR v_balance_2099 = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_entry_id
  FROM   journal_entries
  WHERE  organization_id    = p_org_id
    AND  source_entity_type = 'period'
    AND  source_entity_id   = p_new_period_id
    AND  source_event_type  = 'YearEnd.ProfitTransfer'
    AND  status             = 'posted'
  LIMIT 1;

  IF FOUND THEN RETURN v_entry_id; END IF;

  DECLARE
    v_amount numeric(12,2) := ABS(v_balance_2099);
    v_dr_acct text;
    v_cr_acct text;
  BEGIN
    IF v_balance_2099 < 0 THEN
      v_dr_acct := '2099';
      v_cr_acct := '2091';
    ELSE
      v_dr_acct := '2091';
      v_cr_acct := '2099';
    END IF;

    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_dr_acct, 'debit_amount', v_amount, 'credit_amount', 0,
                         'description', 'Årets resultat omföring ' || to_char(v_new_period.period_start, 'YYYY')),
      jsonb_build_object('account_code', v_cr_acct, 'debit_amount', 0, 'credit_amount', v_amount,
                         'description', 'Balanserade vinstmedel ' || to_char(v_new_period.period_start, 'YYYY'))
    );

    v_entry_id := public.post_journal_entry(
      p_org_id             := p_org_id,
      p_period_id          := p_new_period_id,
      p_entry_type         := 'closing',
      p_entry_date         := v_new_period.period_start,
      p_description        := 'Årets resultat omföres till balanserade vinstmedel ' || to_char(v_new_period.period_start, 'YYYY'),
      p_lines              := v_lines,
      p_source_event_type  := 'YearEnd.ProfitTransfer',
      p_source_entity_type := 'period',
      p_source_entity_id   := p_new_period_id,
      p_voucher_series     := 'O',
      p_actor_id           := p_actor_id
    );
  END;

  RETURN v_entry_id;
END;
$function$;

-- ============================================================================
-- 4. post_impairment_adjustment
-- ============================================================================
CREATE OR REPLACE FUNCTION public.post_impairment_adjustment(p_asset_id uuid, p_period_id uuid, p_impairment_date date, p_impairment_amount numeric, p_reason text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset    public.fixed_assets%ROWTYPE;
  v_class    public.fixed_asset_classes%ROWTYPE;
  v_lines    jsonb;
  v_entry_id uuid;
  v_impairment_acct text;
BEGIN
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_asset.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'IMPAIRMENT_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('finance:assets:depreciate') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

  IF v_asset.status NOT IN ('active', 'impaired') THEN
    RAISE EXCEPTION
      'ASSET_NOT_IMPAIRMENT_ELIGIBLE: status is %, must be active or impaired',
      v_asset.status
      USING ERRCODE = 'P0001';
  END IF;

  IF p_impairment_amount <= 0 THEN
    RAISE EXCEPTION 'IMPAIRMENT_INVALID_AMOUNT: impairment amount must be positive'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_impairment_amount > (v_asset.net_book_value - v_asset.residual_value) THEN
    RAISE EXCEPTION
      'IMPAIRMENT_EXCEEDS_DEPRECIABLE_NBV: amount (%) exceeds depreciable NBV (%)',
      p_impairment_amount, (v_asset.net_book_value - v_asset.residual_value)
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_class FROM public.fixed_asset_classes WHERE id = v_asset.asset_class_id;

  v_impairment_acct := resolve_org_bas_account(v_asset.organization_id, 'FixedAsset.ImpairmentExpense');

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_impairment_acct,
      'debit_amount',  p_impairment_amount,
      'credit_amount', 0,
      'description',
        'Nedskrivning: ' || v_asset.asset_name
        || COALESCE(' — ' || p_reason, '')
    ),
    jsonb_build_object(
      'account_code',  v_class.accumulated_depr_account,
      'debit_amount',  0,
      'credit_amount', p_impairment_amount,
      'description',   v_asset.asset_name || ' nedskrivning'
    )
  );

  v_entry_id := public.post_journal_entry(
    v_asset.organization_id,
    p_period_id,
    'standard'::public.journal_entry_type,
    p_impairment_date,
    'Nedskrivning anläggningstillgång: ' || v_asset.asset_name,
    v_lines,
    'FixedAsset.Impaired',
    'fixed_asset',
    p_asset_id,
    'D',
    NULL, NULL,
    p_actor_id
  );

  UPDATE public.fixed_assets
  SET accumulated_depreciation  = accumulated_depreciation + p_impairment_amount,
      net_book_value             = net_book_value - p_impairment_amount,
      status                     = 'impaired',
      updated_by                 = p_actor_id,
      updated_at                 = now()
  WHERE id = p_asset_id;

  PERFORM public.generate_depreciation_schedule(p_asset_id, p_actor_id);

  RETURN v_entry_id;
END;
$function$;

-- ============================================================================
-- 5. post_opening_balance_entry
-- ============================================================================
CREATE OR REPLACE FUNCTION public.post_opening_balance_entry(p_org_id uuid, p_period_id uuid, p_balances jsonb, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry_id   uuid;
  v_period     financial_periods%ROWTYPE;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'OPENING_BALANCE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('finance:payroll:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Validate period
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: %', p_period_id USING ERRCODE = 'P0001';
  END IF;
  IF v_period.organization_id != p_org_id THEN
    RAISE EXCEPTION 'PERIOD_ORG_MISMATCH: period % does not belong to org %', p_period_id, p_org_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Idempotency: return existing OB entry if already posted for this period
  SELECT id INTO v_entry_id
  FROM   journal_entries
  WHERE  organization_id    = p_org_id
    AND  source_entity_type = 'period'
    AND  source_entity_id   = p_period_id
    AND  entry_type         = 'opening_balance'
    AND  status             = 'posted'
  LIMIT 1;

  IF FOUND THEN
    RETURN v_entry_id;
  END IF;

  -- 3. Validate balances array
  IF p_balances IS NULL OR jsonb_array_length(p_balances) < 2 THEN
    RAISE EXCEPTION 'OB_INVALID_BALANCES: opening balance entry requires at least 2 lines'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Post as opening_balance type (post_journal_entry enforces balance + period lock check)
  v_entry_id := public.post_journal_entry(
    p_org_id             := p_org_id,
    p_period_id          := p_period_id,
    p_entry_type         := 'opening_balance',
    p_entry_date         := v_period.period_start,
    p_description        := COALESCE(p_notes, 'Ingående balans ' || to_char(v_period.period_start, 'YYYY-MM-DD')),
    p_lines              := p_balances,
    p_source_event_type  := 'Period.OpeningBalance',
    p_source_entity_type := 'period',
    p_source_entity_id   := p_period_id,
    p_voucher_series     := 'O',
    p_actor_id           := p_actor_id
  );

  RETURN v_entry_id;
END;
$function$;

-- ============================================================================
-- 6. create_fiscal_year
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_fiscal_year(p_org_id uuid, p_year_number integer, p_year_start date, p_year_end date, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fy_id uuid;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FISCAL_YEAR_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('finance:year_end:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

  IF p_year_end <= p_year_start THEN
    RAISE EXCEPTION 'FISCAL_YEAR_INVALID_DATES: year_end must be after year_start'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_year_number < 2020 OR p_year_number > 2099 THEN
    RAISE EXCEPTION 'FISCAL_YEAR_INVALID_NUMBER: year_number must be between 2020 and 2099'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO fiscal_years (organization_id, year_number, year_start, year_end, notes, created_by)
  VALUES (p_org_id, p_year_number, p_year_start, p_year_end, p_notes, p_actor_id)
  RETURNING id INTO v_fy_id;

  RETURN v_fy_id;
END;
$function$;

-- ============================================================================
-- 7. assign_period_to_fiscal_year
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assign_period_to_fiscal_year(p_period_id uuid, p_fiscal_year_id uuid, p_is_year_end boolean DEFAULT false, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period financial_periods%ROWTYPE;
  v_fy     fiscal_years%ROWTYPE;
BEGIN
  SELECT * INTO v_period FROM financial_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_fy FROM fiscal_years WHERE id = p_fiscal_year_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % not found', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_fy.organization_id <> v_period.organization_id THEN
    RAISE EXCEPTION 'FISCAL_YEAR_ORG_MISMATCH: fiscal year and period belong to different organizations'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_period.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: financial period % not found', p_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FISCAL_YEAR_ASSIGN_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('finance:year_end:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

  -- If marking as year-end, ensure no other period in this fiscal year is also year-end
  IF p_is_year_end THEN
    UPDATE financial_periods
    SET is_year_end_period = false, updated_at = now()
    WHERE fiscal_year_id = p_fiscal_year_id AND is_year_end_period = true AND id <> p_period_id;
  END IF;

  UPDATE financial_periods
  SET fiscal_year_id     = p_fiscal_year_id,
      is_year_end_period = p_is_year_end,
      updated_at         = now()
  WHERE id = p_period_id;
END;
$function$;

-- ============================================================================
-- 8. create_accrual_schedule
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_accrual_schedule(p_org_id uuid, p_period_id uuid, p_accrual_type accrual_type, p_description text, p_total_amount numeric, p_start_date date, p_release_months integer, p_release_debit_account text, p_release_credit_account text, p_initial_debit_account text DEFAULT NULL::text, p_initial_credit_account text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_schedule_id    uuid;
  v_per_period     numeric(14,2);
  v_remainder      numeric(14,2);
  v_release_date   date;
  v_entry_id       uuid;
  v_lines          jsonb;
  i                int;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ACCRUAL_CREATE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('finance:accruals:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'ACCRUAL_INVALID_AMOUNT: total_amount must be positive'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_release_months <= 0 THEN
    RAISE EXCEPTION 'ACCRUAL_INVALID_MONTHS: release_months must be positive'
      USING ERRCODE = 'P0001';
  END IF;

  -- Post optional initial booking journal first
  IF p_initial_debit_account IS NOT NULL AND p_initial_credit_account IS NOT NULL
     AND p_period_id IS NOT NULL THEN
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code',  p_initial_debit_account,
        'debit_amount',  p_total_amount,
        'credit_amount', 0,
        'description',   p_description
      ),
      jsonb_build_object(
        'account_code',  p_initial_credit_account,
        'debit_amount',  0,
        'credit_amount', p_total_amount,
        'description',   p_description
      )
    );

    v_entry_id := public.post_journal_entry(
      p_org_id,
      p_period_id,
      'standard'::public.journal_entry_type,
      p_start_date,
      'Periodisering: ' || p_description,
      v_lines,
      'Accrual.Created',
      'accrual_schedule',
      NULL,
      'P',
      NULL, NULL,
      p_actor_id
    );
  END IF;

  -- Insert schedule header
  INSERT INTO public.accrual_schedules
    (organization_id, financial_period_id, accrual_type, description, total_amount,
     release_months, start_date, release_debit_account, release_credit_account,
     initial_entry_id, notes, created_by)
  VALUES
    (p_org_id, p_period_id, p_accrual_type, p_description, p_total_amount,
     p_release_months, p_start_date, p_release_debit_account, p_release_credit_account,
     v_entry_id, p_notes, p_actor_id)
  RETURNING id INTO v_schedule_id;

  IF v_entry_id IS NOT NULL THEN
    UPDATE public.journal_entries
    SET source_entity_id = v_schedule_id
    WHERE id = v_entry_id;
  END IF;

  v_per_period  := ROUND(p_total_amount / p_release_months, 2);
  v_remainder   := p_total_amount - (v_per_period * p_release_months);
  v_release_date := date_trunc('month', p_start_date)::date;

  FOR i IN 1..p_release_months LOOP
    INSERT INTO public.accrual_release_lines
      (organization_id, accrual_schedule_id, period_number, release_date, release_amount)
    VALUES
      (p_org_id, v_schedule_id, i, v_release_date,
       CASE WHEN i = p_release_months
            THEN v_per_period + v_remainder
            ELSE v_per_period
       END);

    v_release_date := (v_release_date + interval '1 month')::date;
  END LOOP;

  RETURN v_schedule_id;
END;
$function$;

-- ============================================================================
-- 9. cancel_accrual_schedule
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_accrual_schedule(p_schedule_id uuid, p_reason text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_schedule public.accrual_schedules%ROWTYPE;
BEGIN
  SELECT * INTO v_schedule FROM public.accrual_schedules WHERE id = p_schedule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCRUAL_SCHEDULE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_schedule.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ACCRUAL_SCHEDULE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ACCRUAL_CANCEL_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('finance:accruals:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

  IF v_schedule.status NOT IN ('active') THEN
    RAISE EXCEPTION
      'ACCRUAL_CANCEL_INVALID: schedule status is %, only active schedules can be cancelled',
      v_schedule.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.accrual_release_lines
  SET is_cancelled = true
  WHERE accrual_schedule_id = p_schedule_id
    AND is_posted   = false
    AND is_cancelled = false;

  UPDATE public.accrual_schedules
  SET status     = 'cancelled',
      notes      = COALESCE(notes, '') || CASE WHEN p_reason IS NOT NULL
                     THEN E'\nCancelled: ' || p_reason ELSE '' END,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = p_schedule_id;
END;
$function$;

-- ============================================================================
-- 10. create_periodic_deferred_schedule
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_periodic_deferred_schedule(p_org_id uuid, p_period_id uuid, p_source_type text, p_source_id uuid, p_description text, p_total_amount numeric, p_start_date date, p_release_months integer, p_deferral_account text DEFAULT '2970'::text, p_recognition_account text DEFAULT '3041'::text, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_schedule_id  uuid;
  v_per_period   numeric(14,2);
  v_remainder    numeric(14,2);
  v_release_date date;
  i              int;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'DEFERRED_SCHEDULE_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('finance:accruals:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'DEFERRED_INVALID_AMOUNT: total_amount must be positive'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_release_months <= 0 THEN
    RAISE EXCEPTION 'DEFERRED_INVALID_MONTHS: release_months must be positive'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.periodic_deferred_schedules
    (organization_id, financial_period_id, source_type, source_id, description, total_amount,
     release_months, start_date, deferral_account, recognition_account, notes, created_by)
  VALUES
    (p_org_id, p_period_id, p_source_type, p_source_id, p_description, p_total_amount,
     p_release_months, p_start_date, p_deferral_account, p_recognition_account, p_notes, p_actor_id)
  RETURNING id INTO v_schedule_id;

  v_per_period   := ROUND(p_total_amount / p_release_months, 2);
  v_remainder    := p_total_amount - (v_per_period * p_release_months);
  v_release_date := date_trunc('month', p_start_date)::date;

  FOR i IN 1..p_release_months LOOP
    INSERT INTO public.periodic_deferred_lines
      (organization_id, schedule_id, period_number, release_date, release_amount)
    VALUES
      (p_org_id, v_schedule_id, i, v_release_date,
       CASE WHEN i = p_release_months
            THEN v_per_period + v_remainder
            ELSE v_per_period
       END);
    v_release_date := (v_release_date + interval '1 month')::date;
  END LOOP;

  RETURN v_schedule_id;
END;
$function$;

-- ============================================================================
-- 11. register_fixed_asset
-- ============================================================================
CREATE OR REPLACE FUNCTION public.register_fixed_asset(p_org_id uuid, p_period_id uuid, p_asset_class_id uuid, p_asset_code text, p_asset_name text, p_acquisition_date date, p_acquisition_cost numeric, p_residual_value numeric DEFAULT 0, p_useful_life_months integer DEFAULT 60, p_depreciation_method depreciation_method DEFAULT 'straight_line'::depreciation_method, p_credit_account text DEFAULT '2440'::text, p_description text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset_id  uuid;
  v_class     public.fixed_asset_classes%ROWTYPE;
  v_entry_id  uuid;
  v_lines     jsonb;
BEGIN
  IF NOT public.is_trusted_service_context()
     AND p_org_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'ORG_MISMATCH: organization % is not accessible to the caller', p_org_id
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FIXED_ASSET_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('finance:assets:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_class FROM public.fixed_asset_classes WHERE id = p_asset_class_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSET_CLASS_NOT_FOUND: class % does not exist', p_asset_class_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_acquisition_cost <= 0 THEN
    RAISE EXCEPTION 'ASSET_INVALID_COST: acquisition_cost must be positive'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_residual_value >= p_acquisition_cost THEN
    RAISE EXCEPTION 'ASSET_RESIDUAL_GEQ_COST: residual_value (%) must be less than acquisition_cost (%)',
      p_residual_value, p_acquisition_cost
      USING ERRCODE = 'P0001';
  END IF;

  -- Insert asset record directly as 'active'
  INSERT INTO public.fixed_assets
    (organization_id, asset_class_id, financial_period_id, asset_code, asset_name,
     description, acquisition_date, acquisition_cost, residual_value, useful_life_months,
     depreciation_method, status, net_book_value, accumulated_depreciation, periods_posted,
     notes, created_by)
  VALUES
    (p_org_id, p_asset_class_id, p_period_id, p_asset_code, p_asset_name,
     p_description, p_acquisition_date, p_acquisition_cost, p_residual_value, p_useful_life_months,
     p_depreciation_method, 'active', p_acquisition_cost, 0, 0,
     p_notes, p_actor_id)
  RETURNING id INTO v_asset_id;

  -- Post acquisition journal if period provided
  IF p_period_id IS NOT NULL THEN
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code',  v_class.asset_account,
        'debit_amount',  p_acquisition_cost,
        'credit_amount', 0,
        'description',   'Anskaffning: ' || p_asset_name
      ),
      jsonb_build_object(
        'account_code',  p_credit_account,
        'debit_amount',  0,
        'credit_amount', p_acquisition_cost,
        'description',   'Anskaffning: ' || p_asset_name
      )
    );

    v_entry_id := public.post_journal_entry(
      p_org_id,
      p_period_id,
      'standard'::public.journal_entry_type,
      p_acquisition_date,
      'Anskaffning anläggningstillgång: ' || p_asset_name,
      v_lines,
      'FixedAsset.Acquired',
      'fixed_asset',
      v_asset_id,
      'D',
      NULL, NULL,
      p_actor_id
    );

    UPDATE public.fixed_assets
    SET acquisition_entry_id = v_entry_id
    WHERE id = v_asset_id;
  END IF;

  RETURN v_asset_id;
END;
$function$;

-- ============================================================================
-- 12. rollover_opening_balances
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rollover_opening_balances(p_fiscal_year_id uuid, p_target_period_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fy               fiscal_years%ROWTYPE;
  v_year_end_period  financial_periods%ROWTYPE;
  v_target_period    financial_periods%ROWTYPE;
  v_count            int := 0;
  v_ab               RECORD;
BEGIN
  SELECT * INTO v_fy FROM fiscal_years WHERE id = p_fiscal_year_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % not found', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_trusted_service_context()
     AND v_fy.organization_id IS DISTINCT FROM public.auth_organization_id() THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: fiscal year % not found', p_fiscal_year_id
      USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT public.is_trusted_service_context()
     AND p_actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ROLLOVER_ACTOR_MISMATCH: p_actor_id must match the authenticated caller'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trusted_service_context()
     AND NOT public.has_permission('finance:year_end:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_year_end_period
  FROM financial_periods
  WHERE fiscal_year_id = p_fiscal_year_id AND is_year_end_period = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NO_YEAR_END_PERIOD: no year-end period found for fiscal year %',
      p_fiscal_year_id USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_target_period FROM financial_periods WHERE id = p_target_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: target period % not found', p_target_period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_target_period.organization_id <> v_fy.organization_id THEN
    RAISE EXCEPTION 'PERIOD_ORG_MISMATCH: target period belongs to a different organization'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_target_period.period_start < v_year_end_period.period_end THEN
    RAISE EXCEPTION 'ROLLOVER_DATE_CONFLICT: target period starts before year-end period ends; '
      'opening balance rollover must target a future period'
      USING ERRCODE = 'P0001';
  END IF;

  -- Roll over each account balance from year-end period to target period
  FOR v_ab IN
    SELECT account_code, closing_balance
    FROM account_balances
    WHERE financial_period_id = v_year_end_period.id
    ORDER BY account_code
  LOOP
    INSERT INTO account_balances (
      organization_id, financial_period_id, account_code,
      opening_balance, closing_balance, transaction_count
    ) VALUES (
      v_fy.organization_id,
      p_target_period_id,
      v_ab.account_code,
      v_ab.closing_balance,
      v_ab.closing_balance,
      0
    )
    ON CONFLICT (organization_id, financial_period_id, account_code) DO UPDATE
      SET opening_balance  = EXCLUDED.opening_balance,
          closing_balance  = EXCLUDED.opening_balance
                             + account_balances.debit_movement
                             - account_balances.credit_movement,
          updated_at       = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- No grant changes: CREATE OR REPLACE FUNCTION on an existing signature
-- preserves all existing grants. Grants remain exactly as set in
-- 20260815230000 (PUBLIC/anon: no; authenticated/service_role: yes).
