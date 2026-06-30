-- ════════════════════════════════════════════════════════════════════════════
-- Communication Worker — pg_cron Maintenance Tick
--
-- Schedules communication-worker to run every 2 minutes to:
--   • Process scheduled outbound_messages (scheduled_at <= now())
--   • Retry failed messages where retry_after <= now()
--
-- Prerequisites (run ONCE in SQL Editor before pushing this migration):
--
--   SELECT vault.create_secret('your-worker-secret-here', 'WORKER_SECRET');
--
-- The WORKER_SECRET must match the value set via:
--   supabase secrets set WORKER_SECRET=<value> --project-ref ulgsndzfksphquqakelq
--
-- Extensions required (both pre-enabled in hosted Supabase):
--   pg_cron   — scheduled jobs
--   pg_net    — async HTTP from SQL
-- ════════════════════════════════════════════════════════════════════════════

-- ── Wrapper function ──────────────────────────────────────────────────────────
-- Reads WORKER_SECRET from Supabase Vault so the secret is never stored in
-- plain text in migrations or pg_cron job definitions.
-- If the secret is not in vault, logs a warning and skips silently.

CREATE OR REPLACE FUNCTION public.invoke_communication_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  -- Read secret from vault (requires vault extension + secret stored by admin)
  SELECT decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'WORKER_SECRET'
   LIMIT 1;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING '[comm-cron] WORKER_SECRET not found in vault — tick skipped. Run: SELECT vault.create_secret(''<your-secret>'', ''WORKER_SECRET'');';
    RETURN;
  END IF;

  -- Fire-and-forget: pg_net posts async; result available in net._http_response
  PERFORM net.http_post(
    url     := 'https://ulgsndzfksphquqakelq.supabase.co/functions/v1/communication-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_communication_worker() IS
  'Called by pg_cron every 2 minutes to trigger the communication-worker maintenance tick (retry queue + scheduled messages).';

-- Only service_role should call this directly; pg_cron runs as db owner
REVOKE ALL ON FUNCTION public.invoke_communication_worker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_communication_worker() TO service_role;

-- ── Schedule ──────────────────────────────────────────────────────────────────
-- Requires pg_cron extension. Enable in Dashboard → Database → Extensions → pg_cron.
-- After enabling, run in SQL Editor:
--
--   DO $$
--   BEGIN
--     IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'communication-worker-tick') THEN
--       PERFORM cron.unschedule('communication-worker-tick');
--     END IF;
--   END $$;
--
--   SELECT cron.schedule(
--     'communication-worker-tick',
--     '*/2 * * * *',
--     'SELECT public.invoke_communication_worker();'
--   );
--
-- Also store WORKER_SECRET in Supabase Vault (SQL Editor):
--   SELECT vault.create_secret('your-worker-secret', 'WORKER_SECRET');
