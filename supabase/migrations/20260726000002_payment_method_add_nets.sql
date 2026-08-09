-- =============================================================================
-- payment_method enum — add 'nets'
--
-- record_payment(p_method public.payment_method, ...) rejects any value not
-- in this enum. Nets Easy commissioning added provider='nets' to
-- payment_requests (see 20260726000001) but this enum was missed — every
-- nets-webhook settlement call has been failing silently (caught by the
-- webhook's resilience fallback, which marks payment_requests 'completed'
-- and alerts an admin, but never actually creates the payments row or
-- updates the invoice). Confirmed via a real test payment: Nets charged
-- 868.75 SEK successfully, payment_requests.status went to 'completed', but
-- invoices.status stayed 'issued' and no payments row was created.
-- =============================================================================

ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'nets';
