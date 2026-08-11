-- ════════════════════════════════════════════════════════════════════════════
-- Fortnox pilot safety hardening: restrict queue_fortnox_sync() execution.
--
-- Audit finding (Fortnox Tenant-Owned Architecture Audit, 2026-08-11): this
-- SECURITY DEFINER function accepts an arbitrary p_org_id parameter and does
-- not itself verify it matches the caller's own JWT organization_id.
-- Postgres grants EXECUTE on newly-created functions to PUBLIC by default,
-- and no REVOKE was ever issued for this function — so any authenticated
-- tenant user could in principle call it directly via PostgREST/RPC with
-- another organization's id and mark that org's fortnox_*_sync rows
-- 'pending'. Practical impact was low (nothing consumes the queue yet), but
-- the intended model is:
--   Frontend -> fortnox Edge Function (orgId always taken from the caller's
--   own JWT) -> queue_fortnox_sync -> correct organization.
-- The Edge Function always calls this RPC using the service_role key, so
-- restricting execution to service_role only does not change any legitimate
-- behavior.
-- ════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.queue_fortnox_sync(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.queue_fortnox_sync(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.queue_fortnox_sync(uuid, text, uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.queue_fortnox_sync(uuid, text, uuid) TO service_role;
