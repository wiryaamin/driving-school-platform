-- Temporary: creates a genuinely dead-lettered test event to verify
-- requeue_dead_letter_events() (20260728000024) actually recovers it.

INSERT INTO public.event_outbox
  (id, organization_id, event_type, channel, payload, status, retry_count, max_retries, dead_lettered_at, last_error)
VALUES
  ('dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb', 'd4279c49-c619-4c66-8c4b-db5e5c80af99', 'test.dead_letter_recovery', 'internal', '{}'::jsonb, 'dead_letter', 3, 3, now(), 'simulated failure');
