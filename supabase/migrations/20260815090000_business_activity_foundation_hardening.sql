-- Business Activity Foundation Hardening (ADR-010).
--
-- activity_logs is confirmed (platform-wide logging architecture audit,
-- 2026-08-14/15) as the correct foundation for a future canonical business
-- activity stream (Student/Instructor/Guardian Activity, domain history
-- views) — EXTEND, not replace. This migration adds the two structural gaps
-- identified before any portal-facing read is safe: actor type and
-- visibility. It does NOT add new writers, new UI, or new domains — the two
-- existing writers (Guardian Portal, Vehicle Registry) are the only ones
-- touched, and only to populate the new optional fields correctly.
--
-- audit_logs, identity_security_events, and event_outbox are unmodified —
-- this migration touches activity_logs and its own insert function only.

-- ── Actor type ──────────────────────────────────────────────────────────────
--
-- user_id alone cannot distinguish who performed an action — Guardian
-- Portal's existing writer intentionally passes NULL user_id (guardians
-- aren't resolvable the same way staff are), so actor identity has always
-- had to be inferred from entity_type/metadata by convention. Nullable, no
-- default: historical rows and any caller that doesn't specify one get
-- NULL/unknown rather than a guessed value — never invented retroactively.

CREATE TYPE public.activity_actor_type AS ENUM (
  'student', 'instructor', 'guardian', 'staff', 'system', 'integration'
);

-- ── Visibility ───────────────────────────────────────────────────────────────
--
-- Determines which non-admin portal category (if any) may additionally see
-- an activity row, beyond admin/staff, who can always see everything. NOT
-- NULL with a DEFAULT of the most restrictive value ('admin_only') — every
-- existing row, and every future row from a caller that doesn't specify a
-- value, stays admin-only until a writer deliberately classifies it
-- otherwise. This is a deliberate V1 simplification: one row currently
-- names at most one additional visible audience. A future need to show the
-- same event to more than one portal category at once (e.g. a booking
-- cancellation both the student and their guardian should see) is an open
-- design question for the Student/Guardian Activity implementation phase,
-- not resolved here.

CREATE TYPE public.activity_visibility AS ENUM (
  'admin_only', 'instructor', 'student', 'guardian', 'system'
);

ALTER TABLE public.activity_logs
  ADD COLUMN actor_type     public.activity_actor_type,
  ADD COLUMN visibility     public.activity_visibility NOT NULL DEFAULT 'admin_only',
  ADD COLUMN correlation_id uuid;

COMMENT ON COLUMN public.activity_logs.actor_type IS
  'Who performed the action: student/instructor/guardian/staff/system/integration. '
  'Nullable — NULL means unknown/not yet classified, never guessed. user_id alone '
  'is not sufficient to determine this (see Guardian Portal writer, which passes '
  'a NULL user_id by design).';
COMMENT ON COLUMN public.activity_logs.visibility IS
  'Which additional portal category (beyond admin/staff, who always see everything) '
  'may see this row. Defaults to admin_only — a row is never automatically exposed '
  'to Student/Instructor/Guardian views until a writer explicitly classifies it.';
COMMENT ON COLUMN public.activity_logs.correlation_id IS
  'Same request-scoped correlation identifier already carried by audit_logs, '
  'identity_security_events, and event_outbox (ADR-001/P-022) — populated when the '
  'writing Edge Function has one available via EdgeRequestContext. Nullable: not '
  'every historical or future write necessarily has one.';

CREATE INDEX activity_logs_visibility_idx  ON public.activity_logs (visibility);
CREATE INDEX activity_logs_actor_type_idx  ON public.activity_logs (actor_type) WHERE actor_type IS NOT NULL;

-- ── insert_activity_log(): extend, never break existing callers ────────────
--
-- New parameters appended at the end, all optional with safe defaults.
-- Both existing callers (Guardian Portal, Vehicle Registry) invoke this via
-- named-argument .rpc() calls, so this is a fully additive, non-breaking
-- signature change — no existing call site requires modification to keep
-- working, though both are updated in this same change to actually populate
-- the new fields (see supabase/functions/guardian-portal/index.ts and
-- supabase/functions/_shared/vehicle-registry-service.ts).

CREATE OR REPLACE FUNCTION public.insert_activity_log(
  p_organization_id  uuid,
  p_user_id          uuid,
  p_user_email       text,
  p_action           text,
  p_description      text                        DEFAULT NULL,
  p_entity_type      text                        DEFAULT NULL,
  p_entity_id        uuid                        DEFAULT NULL,
  p_metadata         jsonb                       DEFAULT '{}',
  p_ip_address       inet                        DEFAULT NULL,
  p_user_agent       text                        DEFAULT NULL,
  p_session_id       uuid                        DEFAULT NULL,
  p_actor_type       public.activity_actor_type  DEFAULT NULL,
  p_visibility       public.activity_visibility  DEFAULT 'admin_only',
  p_correlation_id   uuid                        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.activity_logs (
    organization_id, user_id, user_email,
    action, description, entity_type, entity_id,
    metadata, ip_address, user_agent, session_id,
    actor_type, visibility, correlation_id
  ) VALUES (
    p_organization_id, p_user_id, p_user_email,
    p_action, p_description, p_entity_type, p_entity_id,
    p_metadata, p_ip_address, p_user_agent, p_session_id,
    p_actor_type, p_visibility, p_correlation_id
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── Close an unrestricted-EXECUTE gap found during this review ─────────────
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default unless
-- explicitly revoked, and this one was never revoked — meaning ANY client,
-- including an unauthenticated anon-key request, could call
-- insert_activity_log() directly and write an arbitrary row (any
-- organization_id, any actor_type, any visibility) to any tenant's activity
-- log, entirely bypassing RLS (this is a SECURITY DEFINER function) and the
-- Edge Functions that are supposed to be the only path in. Both existing
-- writers already call it exclusively via createServiceClient() (confirmed:
-- guardian-portal/index.ts, _shared/vehicle-registry-service.ts), so
-- restricting execution to service_role only breaks nothing.
--
-- Note: insert_audit_log() has the identical unrevoked-PUBLIC-grant gap and
-- is NOT touched here — that table is explicitly out of scope for this
-- migration (see the strict do-not list this migration was written under).
-- Flagged as a follow-up item, not fixed in this change.

REVOKE EXECUTE ON FUNCTION public.insert_activity_log(
  uuid, uuid, text, text, text, text, uuid, jsonb, inet, text, uuid,
  public.activity_actor_type, public.activity_visibility, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.insert_activity_log(
  uuid, uuid, text, text, text, text, uuid, jsonb, inet, text, uuid,
  public.activity_actor_type, public.activity_visibility, uuid
) TO service_role;
