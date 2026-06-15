-- Communication analytics views + bulk retry function.
-- Supports the queue monitor dashboard and analytics without overfetching raw rows.

-- ─── Daily stats view ─────────────────────────────────────────────────────────
-- Aggregates outbound_messages per org/channel/status/day for analytics queries.

CREATE OR REPLACE VIEW public.communication_daily_stats AS
SELECT
  organization_id,
  channel,
  status,
  DATE(created_at AT TIME ZONE 'UTC')::TEXT AS stat_date,
  COUNT(*)::INT                               AS message_count
FROM public.outbound_messages
WHERE deleted_at IS NULL
GROUP BY organization_id, channel, status, DATE(created_at AT TIME ZONE 'UTC');

COMMENT ON VIEW public.communication_daily_stats IS
  'Daily message counts per org/channel/status. Queried by the communications Edge Function analytics route.';

GRANT SELECT ON public.communication_daily_stats TO service_role;

-- ─── Queue health view ────────────────────────────────────────────────────────
-- Per-org/channel snapshot of pending, sending, retryable, and failed messages.

CREATE OR REPLACE VIEW public.communication_queue_health AS
SELECT
  organization_id,
  channel,
  COUNT(*) FILTER (WHERE status = 'queued')::INT                               AS queued_count,
  COUNT(*) FILTER (WHERE status = 'sending')::INT                              AS sending_count,
  COUNT(*) FILTER (WHERE status = 'failed' AND retry_count < max_retries)::INT AS retryable_count,
  COUNT(*) FILTER (WHERE status = 'failed')::INT                               AS failed_total,
  MIN(created_at) FILTER (WHERE status IN ('queued', 'sending'))               AS oldest_queued_at
FROM public.outbound_messages
WHERE deleted_at IS NULL
GROUP BY organization_id, channel;

COMMENT ON VIEW public.communication_queue_health IS
  'Real-time queue snapshot per org/channel for the queue monitor dashboard.';

GRANT SELECT ON public.communication_queue_health TO service_role;

-- ─── Bulk retry function ──────────────────────────────────────────────────────
-- Resets failed+retryable messages back to queued for re-processing.
-- SECURITY DEFINER bypasses RLS; org isolation is enforced via p_org_id parameter.

CREATE OR REPLACE FUNCTION public.bulk_retry_messages(
  p_org_id  UUID,
  p_channel TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.outbound_messages
  SET
    status        = 'queued',
    retry_after   = NULL,
    error_message = NULL
  WHERE
    organization_id = p_org_id
    AND status      = 'failed'
    AND retry_count  < max_retries
    AND deleted_at  IS NULL
    AND (p_channel IS NULL OR channel = p_channel);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.bulk_retry_messages(UUID, TEXT) IS
  'Reset failed+retryable messages to queued for re-processing. Pass p_channel to limit to one channel.';

REVOKE ALL ON FUNCTION public.bulk_retry_messages(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.bulk_retry_messages(UUID, TEXT) TO service_role;
