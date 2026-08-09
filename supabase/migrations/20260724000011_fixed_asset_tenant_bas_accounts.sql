-- =============================================================================
-- Fixed Assets — Last Two Isolated Literals
--
-- Fixed assets already have their own tenant-configuration mechanism
-- (fixed_asset_classes.asset_account / accumulated_depr_account /
-- disposal_gain_account / disposal_loss_account — per-class, not touched
-- here). Only two literals in post_asset_disposal / post_impairment_adjustment
-- bypass that: disposal cash proceeds ('1930') and impairment expense
-- ('7890'). Grepped against every other finance migration — isolated, no
-- cross-subsystem dependent, same safety class as Payment.Cash.*/payroll.
-- =============================================================================

INSERT INTO public.platform_bas_event_mappings
  (event_type, account_debit, account_credit, vat_rate_code, description)
VALUES
  ('FixedAsset.ImpairmentExpense', '7890', '7890', NULL, 'Nedskrivningar av anläggningstillgångar')
ON CONFLICT (event_type) DO NOTHING;

-- ─── post_asset_disposal ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_asset_disposal(
  p_asset_id      uuid,
  p_period_id     uuid,
  p_disposal_type public.asset_disposal_type,
  p_disposal_date date,
  p_proceeds      numeric(14,2) DEFAULT 0,
  p_notes         text          DEFAULT NULL,
  p_actor_id      uuid          DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset       public.fixed_assets%ROWTYPE;
  v_class       public.fixed_asset_classes%ROWTYPE;
  v_gain_loss   numeric(14,2);
  v_lines       jsonb;
  v_entry_id    uuid;
  v_disposal_id uuid;
  v_bank_acct   text;
BEGIN
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_asset.status = 'disposed' THEN
    RAISE EXCEPTION 'ASSET_ALREADY_DISPOSED: asset % is already disposed', p_asset_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_asset.status = 'draft' THEN
    RAISE EXCEPTION 'ASSET_DRAFT: cannot dispose a draft asset'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_proceeds < 0 THEN
    RAISE EXCEPTION 'DISPOSAL_NEGATIVE_PROCEEDS: proceeds must be >= 0'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_class FROM public.fixed_asset_classes WHERE id = v_asset.asset_class_id;

  v_gain_loss := p_proceeds - v_asset.net_book_value;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_class.accumulated_depr_account,
      'debit_amount',  v_asset.accumulated_depreciation,
      'credit_amount', 0,
      'description',   'Avyttring ackumulerade avskrivningar: ' || v_asset.asset_name
    ),
    jsonb_build_object(
      'account_code',  v_class.asset_account,
      'debit_amount',  0,
      'credit_amount', v_asset.acquisition_cost,
      'description',   'Avyttring anskaffningsvärde: ' || v_asset.asset_name
    )
  );

  IF p_proceeds > 0 THEN
    v_bank_acct := resolve_org_bas_account(v_asset.organization_id, 'Treasury.BankAccount');
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code',  v_bank_acct,
        'debit_amount',  p_proceeds,
        'credit_amount', 0,
        'description',   'Avyttring likvid: ' || v_asset.asset_name
      )
    );
  END IF;

  IF v_gain_loss > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code',  v_class.disposal_gain_account,
        'debit_amount',  0,
        'credit_amount', v_gain_loss,
        'description',   'Realisationsvinst: ' || v_asset.asset_name
      )
    );
  ELSIF v_gain_loss < 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code',  v_class.disposal_loss_account,
        'debit_amount',  ABS(v_gain_loss),
        'credit_amount', 0,
        'description',   'Realisationsförlust: ' || v_asset.asset_name
      )
    );
  END IF;

  v_entry_id := public.post_journal_entry(
    v_asset.organization_id,
    p_period_id,
    'standard'::public.journal_entry_type,
    p_disposal_date,
    'Avyttring anläggningstillgång: ' || v_asset.asset_name,
    v_lines,
    'FixedAsset.Disposed',
    'fixed_asset',
    p_asset_id,
    'D',
    NULL, NULL,
    p_actor_id
  );

  INSERT INTO public.asset_disposals
    (organization_id, asset_id, disposal_type, disposal_date,
     net_book_value_at_disposal, proceeds, gain_loss, journal_entry_id, notes, created_by)
  VALUES
    (v_asset.organization_id, p_asset_id, p_disposal_type, p_disposal_date,
     v_asset.net_book_value, p_proceeds, v_gain_loss, v_entry_id, p_notes, p_actor_id)
  RETURNING id INTO v_disposal_id;

  UPDATE public.fixed_assets
  SET status          = 'disposed',
      disposal_id     = v_disposal_id,
      net_book_value  = 0,
      updated_by      = p_actor_id,
      updated_at      = now()
  WHERE id = p_asset_id;

  RETURN v_disposal_id;
END;
$$;

COMMENT ON FUNCTION public.post_asset_disposal(uuid, uuid, public.asset_disposal_type, date, numeric, text, uuid) IS
  'Records fixed asset disposal and posts the disposal journal entry. '
  'Journal: DR acc_depr / (DR Treasury.BankAccount if proceeds, tenant-resolved) / '
  '(DR loss or CR gain, per asset class) / CR asset_cost. '
  'Creates immutable asset_disposals record. Sets asset.status = ''disposed''.';

GRANT EXECUTE ON FUNCTION public.post_asset_disposal(uuid, uuid, public.asset_disposal_type, date, numeric, text, uuid) TO service_role;

-- ─── post_impairment_adjustment ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_impairment_adjustment(
  p_asset_id          uuid,
  p_period_id         uuid,
  p_impairment_date   date,
  p_impairment_amount numeric(14,2),
  p_reason            text DEFAULT NULL,
  p_actor_id          uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Regenerate unposted schedule from new (lower) NBV
  PERFORM public.generate_depreciation_schedule(p_asset_id, p_actor_id);

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_impairment_adjustment(uuid, uuid, date, numeric, text, uuid) IS
  'Posts an impairment write-down for an active or impaired asset. Reduces net_book_value. '
  'Journal: DR FixedAsset.ImpairmentExpense (tenant-resolved) / CR accumulated_depr_account '
  '(per asset class).';

GRANT EXECUTE ON FUNCTION public.post_impairment_adjustment(uuid, uuid, date, numeric, text, uuid) TO service_role;
