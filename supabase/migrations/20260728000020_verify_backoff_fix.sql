-- Verification: reset the hardening test event back to 'failed' with a
-- future next_retry_at, then call outbox_claim_next() again — with the fix
-- applied, it must NOT be reclaimed this time.

UPDATE public.event_outbox
SET status = 'failed', locked_at = NULL, locked_by = NULL, next_retry_at = now() + interval '1 hour'
WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

SELECT * FROM public.outbox_claim_next('internal', 'hardening-backoff-verify-worker', 50, '5 minutes');
