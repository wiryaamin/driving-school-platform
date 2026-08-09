-- ════════════════════════════════════════════════════════════════════════════
-- Fix: outbox_claim_next() could never reclaim events stuck in 'processing'
--
-- The function already accepts p_lock_ttl and its WHERE clause already
-- contained a `(locked_at IS NULL OR locked_at < now() - p_lock_ttl)` check,
-- but that check was unreachable: the preceding `status IN ('pending',
-- 'failed')` predicate excludes 'processing' rows entirely, so a row that
-- gets claimed (status flips to 'processing') and then never completes —
-- worker crash, timeout, or an abandoned manual claim — is claimed
-- permanently. It is never retried, never dead-lettered, and never drains.
--
-- Confirmed in production: a one-off resilience test on 2026-07-28
-- (20260728000018_backoff_hardening_test_setup.sql) called
-- outbox_claim_next('internal', 'hardening-backoff-test-worker', 50,
-- '5 minutes') against the live 'internal' channel and, as its own comment
-- acknowledged, swept up genuinely pending production events (slot.created,
-- Waitlist.Promoted, Communication.Requested, ...) alongside its synthetic
-- test row. The cleanup migration (20260728000021) only deleted the
-- synthetic row by id; the real rows it claimed were left locked at
-- status='processing' and, per the bug above, could never be reclaimed —
-- found still stuck there 4+ days later while investigating an unrelated
-- event-processing-pipeline outage.
--
-- Fix: allow a 'processing' row back into the claimable set once its lock
-- has exceeded p_lock_ttl, same threshold already used for the pending/
-- failed path. No behavior change for rows that are pending/failed or for
-- 'processing' rows still within their TTL.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.outbox_claim_next(
  p_channel    public.event_channel,
  p_worker_id  text,
  p_batch_size integer  DEFAULT 10,
  p_lock_ttl   interval DEFAULT '5 minutes'
)
RETURNS SETOF public.event_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.event_outbox
  SET
    status    = 'processing',
    locked_at = now(),
    locked_by = p_worker_id
  WHERE id IN (
    SELECT id
    FROM   public.event_outbox
    WHERE  channel        = p_channel
      AND  (
             status IN ('pending', 'failed')
             OR (status = 'processing' AND locked_at < now() - p_lock_ttl)
           )
      AND  scheduled_at   <= now()
      AND  (next_retry_at IS NULL OR next_retry_at <= now())
      AND  retry_count    <= max_retries
    ORDER  BY scheduled_at ASC
    LIMIT  p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.outbox_claim_next IS
  'Claims up to p_batch_size pending/failed events for a channel, respecting '
  'both scheduled_at (initial delay) and next_retry_at (exponential backoff '
  'set by outbox_fail on prior failures). Also reclaims events stuck in '
  'processing whose lock has exceeded p_lock_ttl (crashed/abandoned worker '
  'claims), so no event can be claimed permanently. FOR UPDATE SKIP LOCKED '
  'for concurrency-safe claiming across multiple worker instances.';
