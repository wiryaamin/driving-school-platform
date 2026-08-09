-- Removes the temporary test event used to verify the outbox_claim_next()
-- backoff fix (20260728000018/19/20).

DELETE FROM public.event_outbox WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
