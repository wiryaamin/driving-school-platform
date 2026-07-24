-- ════════════════════════════════════════════════════════════════════════════
-- Fix: claim_scheduled_messages() never claims immediate-send messages
--
-- outbound_messages.scheduled_at is documented as "null = send immediately"
-- (20260615153500_communication_engine.sql). But claim_scheduled_messages()
-- required scheduled_at IS NOT NULL, the exact opposite — so any message
-- inserted with status='queued' and no scheduled_at (the channel was
-- disabled/unconfigured at the moment communication-worker or the manual
-- /communications send endpoint tried to dispatch it) could never be
-- reclaimed by the maintenance tick once the channel was later enabled.
-- claim_retry_messages() only reclaims status='failed' rows, so it doesn't
-- cover this either. Confirmed reproduced live: a 'queued' email row from
-- 2026-06-19 with scheduled_at NULL, still unclaimed a month later.
--
-- Fix: claim rows that are either explicitly due (scheduled_at <= now())
-- or marked for immediate send (scheduled_at IS NULL), matching the
-- column's own documented semantics. No change to claim_retry_messages(),
-- daily-limit checks, or any dispatch/provider logic.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION claim_scheduled_messages(max_count int DEFAULT 50)
RETURNS SETOF outbound_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE outbound_messages
  SET status = 'sending'
  WHERE id IN (
    SELECT id FROM outbound_messages
    WHERE  status       = 'queued'
      AND  (scheduled_at IS NULL OR scheduled_at <= now())
      AND  deleted_at   IS NULL
    ORDER  BY scheduled_at NULLS FIRST
    LIMIT  max_count
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
