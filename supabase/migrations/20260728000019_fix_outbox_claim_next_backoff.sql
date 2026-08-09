-- ════════════════════════════════════════════════════════════════════════════
-- Fix: outbox_claim_next() ignored the exponential backoff it computes
--
-- outbox_fail() correctly computes next_retry_at = now() + 30s * 2^retry_count
-- on every failure, but outbox_claim_next()'s WHERE clause only ever checked
-- scheduled_at (set once, at event creation) — next_retry_at was never
-- referenced anywhere in the claim query. A failed event became immediately
-- reclaimable on the very next worker tick regardless of how far in the
-- future its computed backoff was.
--
-- Found via resilience hardening: inserted a 'failed' event with
-- next_retry_at one hour in the future and called outbox_claim_next()
-- immediately — the event was claimed anyway (status flipped to
-- 'processing'), proving the backoff was never enforced. Practical impact:
-- every transient failure gets hammer-retried every ~1 minute (the cron
-- tick interval) instead of backing off, and burns through max_retries
-- attempts far faster than the backoff schedule intends.
--
-- Fix: add the missing next_retry_at check. Existing pending events (whose
-- next_retry_at is NULL, since it's only ever set by outbox_fail) are
-- completely unaffected.
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
      AND  status         IN ('pending', 'failed')
      AND  scheduled_at   <= now()
      AND  (next_retry_at IS NULL OR next_retry_at <= now())
      AND  retry_count    <= max_retries
      AND  (locked_at IS NULL OR locked_at < now() - p_lock_ttl)
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
  'set by outbox_fail on prior failures). FOR UPDATE SKIP LOCKED for '
  'concurrency-safe claiming across multiple worker instances.';
