-- =============================================================================
-- payment_requests — allow 'nets' as a provider value
--
-- Nets Easy is being commissioned as a second online-payment provider
-- alongside Stripe and Swish, reusing the existing provider-agnostic
-- payment_requests table (student-portal already creates rows here for
-- Stripe checkout and Swish deeplinks) rather than introducing a
-- Nets-specific table.
-- =============================================================================

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'payment_requests'
    AND con.contype = 'c'
    AND (pg_get_constraintdef(con.oid) LIKE '%provider = ANY%'
         OR pg_get_constraintdef(con.oid) LIKE '%provider IN%');

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payment_requests DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_provider_check
  CHECK (provider IN ('stripe', 'swish', 'nets'));
