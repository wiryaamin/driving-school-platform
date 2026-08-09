-- Fix: seed_org_chart_of_accounts() never populated accounting_chart_of_accounts'
-- original `account_debit`/`account_credit` (text, NOT NULL) columns, which predate
-- the Phase 4C `bas_account_debit_id`/`bas_account_credit_id` FK columns added
-- alongside them on the same table. Every invocation of this function, for every
-- organization, has failed with a not-null constraint violation since Phase 4C —
-- discovered via real end-to-end testing of the /swedish-settings/seed-bas endpoint.
-- The BAS account codes are already available as v_mapping.account_debit/account_credit
-- (text, from platform_bas_event_mappings) in the same loop; this just also writes
-- them to the original columns instead of leaving them unset.

CREATE OR REPLACE FUNCTION public.seed_org_chart_of_accounts(
  p_org_id    uuid,
  p_actor_id  uuid
)
RETURNS int  -- rows inserted
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_debit_id  uuid;
  v_credit_id uuid;
  v_mapping   public.platform_bas_event_mappings%ROWTYPE;
BEGIN
  FOR v_mapping IN
    SELECT * FROM platform_bas_event_mappings WHERE is_active = true
  LOOP
    SELECT id INTO v_debit_id  FROM bas_account_catalog WHERE account_code = v_mapping.account_debit;
    SELECT id INTO v_credit_id FROM bas_account_catalog WHERE account_code = v_mapping.account_credit;

    INSERT INTO accounting_chart_of_accounts (
      organization_id,
      event_type,
      account_debit,
      account_credit,
      bas_account_debit_id,
      bas_account_credit_id,
      vat_rate_code,
      is_active,
      created_by
    )
    VALUES (
      p_org_id,
      v_mapping.event_type,
      v_mapping.account_debit,
      v_mapping.account_credit,
      v_debit_id,
      v_credit_id,
      v_mapping.vat_rate_code,
      true,
      p_actor_id
    )
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
