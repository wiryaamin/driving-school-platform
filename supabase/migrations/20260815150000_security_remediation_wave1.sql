-- Security Remediation Wave 1 — highest-risk confirmed vulnerabilities from
-- the platform-wide SECURITY DEFINER authorization audit (2026-08-15).
--
-- Scope: the 9 functions explicitly named for this wave, matching the same
-- proven pattern already applied twice (logging functions, then a further
-- 8 sibling get_platform_* functions): REVOKE EXECUTE FROM PUBLIC, anon,
-- authenticated; GRANT TO service_role — except soft_delete, whose real
-- callers use the `authenticated` role directly and therefore need an
-- internal tenant-ownership check instead of (not in addition to) a full
-- grant lockout. No RLS, schema, or business logic changed beyond the one
-- authorization check soft_delete needed. No other functions touched.

-- ── 1. get_user_jwt_claims(uuid,uuid) ───────────────────────────────────────
-- Live-confirmed: an ordinary authenticated user could supply an arbitrary
-- p_user_id and receive that user's role/permissions/is_platform_admin flag
-- — a full impersonation-reconnaissance oracle. Both real callers
-- (auth-hook, switch-tenant) use createServiceClient() exclusively; neither
-- forwards the target user's own JWT (auth-hook runs before one exists —
-- it's computing what the JWT *should* contain — and switch-tenant looks up
-- a *different* org for the same already-validated user via service role).
-- An auth.uid()-based internal check would therefore reject the legitimate
-- callers, not just attackers — grant restriction is the correct and
-- sufficient fix, not merely the easy one.

REVOKE EXECUTE ON FUNCTION public.get_user_jwt_claims(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_jwt_claims(uuid, uuid) TO service_role;

-- ── 2. soft_delete(text,uuid) ────────────────────────────────────────────────
-- Confirmed by code inspection: whitelists the table name but the UPDATE
-- itself has no tenant filter at all (`WHERE id = $2` only) — identical to
-- soft_restore()'s already-fixed flaw. Unlike soft_restore, this one has
-- real, live callers (students/instructors/bookings archive endpoints) that
-- call it via createSupabaseClient(req, false, ...) — i.e. the `authenticated`
-- role, not service_role — so it cannot simply be locked down to service_role
-- without breaking production archive functionality. Fix: keep `authenticated`
-- executable, revoke `anon` (no legitimate unauthenticated use exists), and
-- add the missing tenant-ownership check inside the function itself, so the
-- boundary holds regardless of whether the caller goes through an Edge
-- Function or calls the RPC directly.
--
-- 13 of the 15 whitelisted tables carry organization_id directly (verified
-- live against information_schema). The two exceptions: 'organizations'
-- itself (no separate org column — deleting an organization is reserved to
-- platform admins only, matching how every other org-lifecycle mutation on
-- this platform is gated) and 'profiles' (org membership resolved via
-- memberships, the same join pattern used throughout the rest of the schema).
-- Platform admins bypass the check throughout, matching every other
-- tenant-scoped authorization function on this platform (has_permission(),
-- get_platform_org_health(), etc.). No service-role bypass was added: no
-- current caller uses service_role for this function, and a caller with no
-- forwarded JWT would have no organization context to check against anyway
-- — if a genuine service-role-only caller is needed in future, that is a
-- deliberate future decision, not one to speculatively build in now.

CREATE OR REPLACE FUNCTION public.soft_delete(p_table_name text, p_record_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin   boolean := public.is_platform_admin();
  v_caller_org uuid    := public.auth_organization_id();
  v_row_org    uuid;
BEGIN
  IF p_table_name NOT IN (
    -- Phase 1B.2:
    'organizations',
    'organization_locations',
    'profiles',
    -- Phase 2A:
    'students',
    'student_notes',
    'student_documents',
    'instructors',
    'vehicles',
    -- Phase 2B:
    'lesson_slots',
    'lesson_bookings',
    'booking_attendance',
    'booking_notes',
    -- Phase 2F-A:
    'training_plan_templates',
    'student_training_plans',
    'lesson_waitlist_entries'
  ) THEN
    RAISE EXCEPTION
      'soft_delete: table ''%'' is not whitelisted. '
      'Add it to the whitelist in the current phase migration before calling soft_delete().',
      p_table_name
      USING ERRCODE = '42P01';
  END IF;

  IF NOT v_is_admin THEN
    IF p_table_name = 'organizations' THEN
      RAISE EXCEPTION
        'soft_delete: deleting an organization requires platform-admin authorization'
        USING ERRCODE = '42501';
    ELSIF p_table_name = 'profiles' THEN
      IF v_caller_org IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.memberships
        WHERE user_id = p_record_id AND organization_id = v_caller_org
      ) THEN
        RAISE EXCEPTION
          'soft_delete: record not found or outside caller''s organization'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      EXECUTE format('SELECT organization_id FROM public.%I WHERE id = $1', p_table_name)
        INTO v_row_org USING p_record_id;

      IF v_row_org IS NULL OR v_caller_org IS NULL OR v_row_org IS DISTINCT FROM v_caller_org THEN
        RAISE EXCEPTION
          'soft_delete: record not found or outside caller''s organization'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  EXECUTE format(
    'UPDATE public.%I '
    'SET deleted_at = now(), deleted_by = $1 '
    'WHERE id = $2 AND deleted_at IS NULL',
    p_table_name
  ) USING auth.uid(), p_record_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.soft_delete(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete(text, uuid) TO authenticated, service_role;

-- ── 3. post_journal_entry(...) ──────────────────────────────────────────────
-- Confirmed by code inspection: the core double-entry ledger primitive has
-- zero authorization of any kind, and — unlike every other function in this
-- wave — is never called by application code directly at all, only by
-- sibling post_*_journal_entry functions (owner-level calls, unaffected by
-- this grant change: the function owner always retains implicit EXECUTE on
-- its own functions regardless of REVOKE FROM PUBLIC/anon/authenticated).
-- Restricting to service_role fully closes the confirmed vulnerability (an
-- authenticated user of any org posting arbitrary balanced journal entries
-- into any other org's ledger via a raw RPC call, entirely bypassing every
-- edge-function permission check, since none of them call this directly).
--
-- Not fixed here, and explicitly out of Wave 1 scope: the sibling functions
-- (post_invoice_journal_entry, post_payment_journal_entry, etc.) that call
-- this internally also don't verify the target entity belongs to the
-- caller's org before doing so — that gap lives in functions not named in
-- this wave and requires touching them individually. Flagged as a remaining
-- risk in the wave report, not addressed by this migration.

REVOKE EXECUTE ON FUNCTION public.post_journal_entry(
  uuid, uuid, journal_entry_type, date, text, jsonb, text, text, uuid, text, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(
  uuid, uuid, journal_entry_type, date, text, jsonb, text, text, uuid, text, uuid, uuid, uuid
) TO service_role;

-- ── 4–5. claim_retry_messages / claim_scheduled_messages ───────────────────
-- Confirmed by code inspection: zero authorization; returns full
-- outbound_messages rows (recipient address, subject, body) across every
-- tenant and marks them 'sending', hijacking the real delivery worker's
-- queue. Sole caller is communication-worker/index.ts, using a client built
-- directly from SUPABASE_SERVICE_ROLE_KEY. No legitimate authenticated-user
-- use case exists for either function.

REVOKE EXECUTE ON FUNCTION public.claim_retry_messages(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_retry_messages(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_scheduled_messages(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_messages(integer) TO service_role;

-- ── 6–9. Platform-admin reads ───────────────────────────────────────────────
-- Live-confirmed during the audit: an ordinary org owner retrieved the real
-- platform-admin roster, platform-wide dashboard stats, and another
-- organization's private internal_notes by calling these directly, entirely
-- bypassing platform-admin/index.ts's own is_platform_admin gate (which
-- only protects the Edge Function route, not the underlying RPC). All four
-- are called exclusively via createServiceClient() in platform-admin/index.ts
-- — the identical pattern already fixed for 8 sibling get_platform_*
-- functions in migration 20260815120000.

REVOKE EXECUTE ON FUNCTION public.get_platform_admins_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_admins_list() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_platform_admins_detail() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_admins_detail() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_platform_dashboard_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_dashboard_stats() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_platform_org_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_org_detail(uuid) TO service_role;
