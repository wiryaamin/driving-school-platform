-- Removes the temporary dead-letter-recovery test event
-- (20260728000025/verified via 20260728000024's requeue_dead_letter_events()).

DELETE FROM public.event_outbox WHERE id = 'dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb';
