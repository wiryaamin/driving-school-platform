-- SECURITY REMEDIATION WAVE 2C-C1 — PLATFORM-ADMIN AUTHORIZATION HARDENING
--
-- Restricts get_platform_org_stats(uuid) and
-- get_platform_subscription_detail(uuid) to service_role only. Both take
-- an organization id directly with zero authorization check in the
-- function body, and were still fully anon/authenticated-exposed at the
-- time of this migration — get_platform_subscription_detail in particular
-- returns an organization's legal name, Swedish org number, and
-- subscription tier/status for any org id supplied, with no verification
-- of any kind.
--
-- Pre-implementation caller verification (Wave 2C-C authorization
-- analysis): both functions are called exclusively from
-- supabase/functions/platform-admin/index.ts, each via its own
-- createServiceClient() call immediately preceding the RPC
-- (handleOrgStats at line ~449, handleSubscriptionDetail at line ~1177).
-- That whole Edge Function gates every route behind
-- `if (!ctx.isPlatformAdmin)` before any handler runs. No other caller —
-- authenticated, anonymous, tenant-facing, or scheduled — exists anywhere
-- in the repository (confirmed via full-repo search, not just
-- supabase/functions). Unlike register_regulatory_endpoint in the prior
-- corrective migration, restricting these two to service_role only will
-- not break their real caller, because that caller already uses
-- service_role.
--
-- No function body, signature, or business logic is changed — this is a
-- grant-only migration. Both functions have exactly one signature each
-- (confirmed live, no overloads): get_platform_org_stats(uuid) and
-- get_platform_subscription_detail(uuid).
--
-- WAVE 2A LESSON reapplied: REVOKE explicitly includes PUBLIC, anon, and
-- authenticated together — grants are re-verified live after applying.

REVOKE EXECUTE ON FUNCTION public.get_platform_org_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_org_stats(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_platform_subscription_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_subscription_detail(uuid) TO service_role;
