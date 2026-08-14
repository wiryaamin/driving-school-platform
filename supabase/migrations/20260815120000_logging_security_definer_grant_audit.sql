-- Security audit and hardening: EXECUTE grants on every SECURITY DEFINER
-- function that writes to or reads from audit_logs, activity_logs,
-- identity_security_events, or event_outbox.
--
-- Trigger: the previous activity_logs foundation hardening (migration
-- 20260815090000) fixed insert_activity_log()'s unrevoked-PUBLIC-EXECUTE
-- grant, and flagged insert_audit_log() as having the identical pattern.
-- That review is now complete. Two findings changed the shape of this fix:
--
--   1. insert_activity_log()'s previous fix was INCOMPLETE. CREATE OR
--      REPLACE FUNCTION with additional parameters creates a new overload
--      rather than replacing the existing one when the parameter signature
--      differs — the original 11-parameter version was left behind with its
--      original PUBLIC grant fully intact. Confirmed live: anon/authenticated
--      could still call it (PostgREST simply refused to disambiguate which
--      overload to use for a payload matching both — an accidental, fragile
--      protection, not a real one). Both real callers (Guardian Portal,
--      Vehicle Registry) were already updated to the 14-parameter form in
--      that same change, so the old 11-parameter overload has zero
--      legitimate callers and is dropped outright rather than re-patched.
--
--   2. The same unrevoked-PUBLIC-grant pattern was found on every other
--      SECURITY DEFINER function touching these four tables, not only
--      insert_audit_log() — including one (soft_restore) with no internal
--      tenant/authorization check on the mutation itself, and a family of
--      nine platform-wide "get_platform_*" read functions whose names
--      reference audit_logs/identity_security_events/event_outbox
--      directly. Confirmed live: insert_audit_log() was successfully
--      called as an ordinary authenticated user, inserting a real row into
--      audit_logs (left in place in the isolated E2E test org only, per
--      audit_logs' own "never UPDATE or DELETE" convention).
--
-- Every function fixed here was verified to have callers that exclusively
-- use createServiceClient() (service_role) — see the accompanying report
-- for the exact caller list per function. No RLS, schema, or semantics
-- changed. audit_logs/activity_logs/identity_security_events/event_outbox
-- data is untouched.

-- ── insert_activity_log(): drop the superseded, now-orphaned old overload ──

DROP FUNCTION IF EXISTS public.insert_activity_log(
  uuid, uuid, text, text, text, text, uuid, jsonb, inet, text, uuid
);

-- ── insert_audit_log(): confirmed live exploit, zero real callers today ────
-- (audit_trigger_fn() inserts into audit_logs directly, not via this
-- wrapper) — restricted for when a legitimate direct writer needs it.

REVOKE EXECUTE ON FUNCTION public.insert_audit_log(
  uuid, uuid, text, text, uuid, audit_operation, text, jsonb, jsonb, text[],
  inet, text, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.insert_audit_log(
  uuid, uuid, text, text, uuid, audit_operation, text, jsonb, jsonb, text[],
  inet, text, uuid, uuid, uuid, uuid
) TO service_role;

-- ── event_outbox writer + worker RPCs ───────────────────────────────────────
-- insert_outbox_event: legitimate callers are event-worker, staff-invite,
-- demo-requests, switch-tenant, platform-bootstrap — all service_role.
-- outbox_claim_next/complete/fail: internal to event-worker's claim/lock/
-- complete/fail cycle only. Unrestricted EXECUTE here isn't just a data
-- leak — an authenticated client could claim jobs out from under the real
-- worker, mark real events "complete" without them ever being processed
-- (silently dropping notifications/side effects), or force dead-lettering.

REVOKE EXECUTE ON FUNCTION public.insert_outbox_event(
  text, event_channel, jsonb, uuid, text, uuid, uuid,
  timestamp with time zone, integer, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_outbox_event(
  text, event_channel, jsonb, uuid, text, uuid, uuid,
  timestamp with time zone, integer, jsonb, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.outbox_claim_next(
  event_channel, text, integer, interval
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbox_claim_next(
  event_channel, text, integer, interval
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.outbox_complete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbox_complete(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.outbox_fail(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbox_fail(uuid, text) TO service_role;

-- requeue_dead_letter_events: takes p_org_id directly from the caller with
-- no ownership check inside the function body — only safe because the
-- caller (communications/index.ts) is expected to already have verified
-- the requesting staff member belongs to that org before calling it.
-- Unrestricted EXECUTE would let any authenticated user requeue (and
-- thereby re-trigger the side effects of) dead-lettered events for any
-- other tenant.

REVOKE EXECUTE ON FUNCTION public.requeue_dead_letter_events(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_dead_letter_events(uuid, text) TO service_role;

-- ── soft_restore(): most severe finding in this review ─────────────────────
-- Validates p_table_name against a whitelist, but the UPDATE itself has NO
-- organization/tenant filter at all (`WHERE id = $1` only) — with the
-- previous unrestricted grant, any authenticated (or anonymous) caller
-- could have restored any soft-deleted row, in any table on the whitelist,
-- in any tenant, by ID alone. No live caller was found: the only reference
-- in the repository is packages/api-core's BaseRepository.softRestore(),
-- which is unreachable from any Supabase Edge Function (Deno functions
-- cannot import workspace packages, per this repo's own established
-- constraint) and is not imported anywhere in apps/web either. Restricting
-- this carries no functional risk today.

REVOKE EXECUTE ON FUNCTION public.soft_restore(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_restore(text, uuid, uuid) TO service_role;

-- ── Platform-wide read functions referencing the four logging tables ───────
-- Each of these is called exclusively by platform-admin/index.ts and
-- communications/index.ts via createServiceClient(). Left unrestricted,
-- any authenticated user of any tenant — or an anonymous anon-key request —
-- could call these directly (bypassing platform-admin's own is_platform_admin
-- check entirely, since that check happens in the Edge Function, not in
-- these functions themselves) and read cross-tenant audit trails, identity
-- security events, subscription/billing history, and operational data for
-- every organization on the platform.
--
-- NOTE: this is only the subset of the platform-admin RPC family that
-- directly references audit_logs/identity_security_events/event_outbox —
-- in scope for this logging-focused review. A broader family of ~15
-- similarly-grant-unrestricted get_platform_* functions exists (org
-- details, subscription lists, worker runs, admin lists, compliance/
-- communications summaries) that do NOT reference these four tables —
-- those share the identical vulnerability class but are out of scope here
-- and are flagged as a separate, urgent follow-up in the accompanying
-- report, not fixed in this migration.

REVOKE EXECUTE ON FUNCTION public.get_platform_audit_log(
  uuid, text, text, text, timestamp with time zone, timestamp with time zone, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_audit_log(
  uuid, text, text, text, timestamp with time zone, timestamp with time zone, integer, integer
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_platform_security_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_security_events(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_security_events(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_org_security_events(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_timeline(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_org_timeline(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_platform_subscription_history(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_subscription_history(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_platform_operations_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_operations_summary() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_operations(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_org_operations(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_platform_recovery_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_recovery_queue() TO service_role;

-- ── audit_trigger_fn(): hygiene only, not a live exploit path ──────────────
-- PostgREST does not expose functions returning `trigger` in its schema
-- cache (confirmed live: a direct RPC call 404s, "no matches were found"),
-- so this was never reachable via the client-facing API despite the
-- unrevoked grant. Tightened anyway for consistency — trigger functions
-- should never be directly callable regardless of whether today's specific
-- API gateway happens to block it.

REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_trigger_fn() TO service_role;
