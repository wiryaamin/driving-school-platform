-- Temporary: verifies whether outbox_claim_next() respects next_retry_at
-- (exponential backoff) before fixing it. Inserts a 'failed' event whose
-- next_retry_at is 1 hour in the future, then immediately calls
-- outbox_claim_next() for the same channel — if the row gets claimed
-- (status flips to 'processing') despite next_retry_at being far in the
-- future, the backoff is proven to be ignored.

INSERT INTO public.event_outbox
  (id, organization_id, event_type, channel, payload, status, retry_count, max_retries, scheduled_at, next_retry_at)
VALUES
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'd4279c49-c619-4c66-8c4b-db5e5c80af99', 'test.backoff_check', 'internal', '{}'::jsonb, 'failed', 1, 3, '2026-07-28T00:00:00Z', now() + interval '1 hour');

-- Claim from the 'internal' channel — this test event will be mixed in with
-- any genuinely pending/failed events already in that channel, but we only
-- care about what happens to our specific test row.
SELECT * FROM public.outbox_claim_next('internal', 'hardening-backoff-test-worker', 50, '5 minutes');
