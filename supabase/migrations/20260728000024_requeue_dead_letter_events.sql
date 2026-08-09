-- ════════════════════════════════════════════════════════════════════════════
-- Manual recovery for dead-lettered event_outbox rows
--
-- Found via resilience/observability audit: event_outbox_health already
-- surfaces dead_letter_count per org/event_type (visible on QueueMonitorPage
-- and the Dashboard), but nothing anywhere in the codebase can actually
-- requeue a dead-lettered event — a business event (Student.Archived,
-- Invoice.Issued, Waitlist.Promoted, etc.) that exhausts its retries is
-- visible as "stuck" but has no recovery path short of direct production
-- database SQL access. Mirrors the existing bulk_retry_messages() pattern
-- (20260619000004) for outbound_messages — same shape, applied to
-- event_outbox instead, so dead-lettered business events get the same
-- self-service recovery outbound messages already have.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.requeue_dead_letter_events(
  p_org_id     UUID,
  p_event_type TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.event_outbox
  SET
    status           = 'pending',
    retry_count      = 0,
    next_retry_at    = NULL,
    dead_lettered_at = NULL,
    last_error       = NULL,
    locked_at        = NULL,
    locked_by        = NULL,
    scheduled_at      = now()
  WHERE
    organization_id = p_org_id
    AND status      = 'dead_letter'
    AND (p_event_type IS NULL OR event_type = p_event_type);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.requeue_dead_letter_events(UUID, TEXT) IS
  'Resets dead-lettered event_outbox rows back to pending with a fresh retry '
  'budget, for manual recovery of permanently-failed business events. Pass '
  'p_event_type to limit to one event type. Mirrors bulk_retry_messages() '
  'for outbound_messages.';

GRANT EXECUTE ON FUNCTION public.requeue_dead_letter_events(UUID, TEXT) TO service_role;
