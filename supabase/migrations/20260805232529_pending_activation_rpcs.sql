-- ---------------------------------------------------------------------------
-- Account Registration / Email Verification / Activation Workflow redesign,
-- continued from 20260805232514_add_pending_membership_status.sql.
--
-- Adds the two RPCs the new pending→active lifecycle needs, and updates the
-- three existing invitation-listing RPCs that filtered memberships to
-- status IN ('active','suspended') — a freshly created 'pending' membership
-- would otherwise be invisible on the Users / org-admin management screens,
-- and their invitation_status derivation (last_sign_in_at IS NULL) already
-- had a latent gap this redesign specifically targets: consuming an invite
-- link (verifyOtp/setSession) sets auth.users.last_sign_in_at immediately,
-- before any password is set, so someone who opened the link and abandoned
-- it was already indistinguishable from someone who fully activated.
-- membership.status is the correct signal — it only becomes 'active' via
-- activate_membership(), which only runs after a successful password
-- submission.
-- ---------------------------------------------------------------------------

-- ── activate_membership() ───────────────────────────────────────────────────
-- Called by the frontend (SetNewPasswordForm, shared by both the invite-
-- acceptance and password-recovery pages) immediately after a password is
-- successfully set. Flips the caller's own pending membership to active.
-- Idempotent no-op (returns false) when there is no pending membership —
-- this lets it be called unconditionally after every password submission,
-- including an ordinary password reset by an already-active member, without
-- needing the caller to know which case it is.
CREATE OR REPLACE FUNCTION public.activate_membership()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_id uuid;
BEGIN
  SELECT id INTO v_membership_id
  FROM public.memberships
  WHERE user_id = auth.uid() AND status = 'pending'
  ORDER BY joined_at DESC
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.memberships SET status = 'active' WHERE id = v_membership_id;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.activate_membership() IS
  'Flips the calling user''s own pending membership to active. Called after '
  'a successful password submission on invite-acceptance/password-recovery. '
  'No-op (returns false) if the caller has no pending membership.';

REVOKE ALL ON FUNCTION public.activate_membership() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_membership() TO authenticated;

-- ── get_pending_invite_organization() ───────────────────────────────────────
-- The invite-acceptance page needs to show which organization invited the
-- user before any password has been set — i.e. while the JWT still carries
-- the deliberately empty claims a pending membership produces (no
-- organization_id, by design, so nothing RLS-gated is reachable yet). This
-- returns only the organization's own name/id for the caller's own pending
-- invite — never anything else — so that narrow display need doesn't
-- require granting broader org access before activation completes.
CREATE OR REPLACE FUNCTION public.get_pending_invite_organization()
RETURNS TABLE(organization_id uuid, organization_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name
  FROM public.memberships m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid() AND m.status = 'pending'
  ORDER BY m.joined_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_pending_invite_organization() IS
  'Organization name/id for the calling user''s own pending (not yet '
  'activated) membership, for the invite-acceptance page greeting. Returns '
  'no rows once the membership has been activated or if there is none.';

REVOKE ALL ON FUNCTION public.get_pending_invite_organization() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_invite_organization() TO authenticated;

-- ── get_platform_org_admins: include pending, derive status from it ────────
CREATE OR REPLACE FUNCTION public.get_platform_org_admins(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH admins AS (
    SELECT
      p.id              AS user_id,
      p.email,
      p.first_name,
      p.last_name,
      r.name            AS role,
      r.display_name    AS role_display,
      m.status          AS membership_status,
      CASE WHEN m.status = 'pending' THEN 'pending' ELSE 'accepted' END AS invitation_status,
      mr.assigned_at,
      au.last_sign_in_at
    FROM public.memberships       m
    JOIN public.membership_roles  mr ON mr.membership_id = m.id
    JOIN public.roles              r  ON r.id  = mr.role_id
    JOIN public.profiles           p  ON p.id  = m.user_id
    LEFT JOIN auth.users           au ON au.id = m.user_id
    WHERE m.organization_id = p_org_id
    AND   r.name IN ('org_owner','org_admin','org_manager')
    AND   mr.is_active = true
    AND   m.status     IN ('active', 'suspended', 'pending')
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id',            user_id,
        'email',               email,
        'first_name',          first_name,
        'last_name',           last_name,
        'role',                role,
        'role_display',        role_display,
        'membership_status',   membership_status,
        'invitation_status',   invitation_status,
        'assigned_at',         assigned_at,
        'last_sign_in_at',     last_sign_in_at
      )
      ORDER BY assigned_at ASC
    ),
    '[]'::jsonb
  )
  FROM admins;
$$;

-- ── get_platform_org_users: include pending, derive status from it ─────────
CREATE OR REPLACE FUNCTION public.get_platform_org_users(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH users AS (
    SELECT
      p.id              AS user_id,
      p.email,
      p.first_name,
      p.last_name,
      r.name            AS role,
      r.display_name    AS role_display,
      m.status          AS membership_status,
      CASE WHEN m.status = 'pending' THEN 'pending' ELSE 'accepted' END AS invitation_status,
      mr.assigned_at,
      au.last_sign_in_at
    FROM public.memberships       m
    JOIN public.membership_roles  mr ON mr.membership_id = m.id
    JOIN public.roles              r  ON r.id  = mr.role_id
    JOIN public.profiles           p  ON p.id  = m.user_id
    LEFT JOIN auth.users           au ON au.id = m.user_id
    WHERE m.organization_id = p_org_id
    AND   mr.is_active = true
    AND   m.status     IN ('active', 'suspended', 'pending')
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id',            user_id,
        'email',               email,
        'first_name',          first_name,
        'last_name',           last_name,
        'role',                role,
        'role_display',        role_display,
        'membership_status',   membership_status,
        'invitation_status',   invitation_status,
        'assigned_at',         assigned_at,
        'last_sign_in_at',     last_sign_in_at
      )
      ORDER BY assigned_at ASC
    ),
    '[]'::jsonb
  )
  FROM users;
$$;

-- ── get_org_staff_invitations: include pending, derive status from it ──────
CREATE OR REPLACE FUNCTION public.get_org_staff_invitations(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH staff AS (
    SELECT
      p.id              AS user_id,
      p.email,
      p.first_name,
      p.last_name,
      p.is_active,
      r.name            AS role,
      r.display_name    AS role_display,
      m.status          AS membership_status,
      CASE WHEN m.status = 'pending' THEN 'pending' ELSE 'accepted' END AS invitation_status,
      au.invited_at,
      au.last_sign_in_at,
      m.joined_at
    FROM public.memberships       m
    JOIN public.membership_roles  mr ON mr.membership_id = m.id
    JOIN public.roles              r  ON r.id  = mr.role_id
    JOIN public.profiles           p  ON p.id  = m.user_id
    LEFT JOIN auth.users           au ON au.id = m.user_id
    WHERE m.organization_id = p_org_id
    AND   mr.is_active = true
    AND   m.status     IN ('active', 'suspended', 'pending')
    AND   p.deleted_at IS NULL
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id',            user_id,
        'email',               email,
        'first_name',          first_name,
        'last_name',           last_name,
        'is_active',           is_active,
        'role',                role,
        'role_display',        role_display,
        'membership_status',   membership_status,
        'invitation_status',   invitation_status,
        'invited_at',          invited_at,
        'last_sign_in_at',     last_sign_in_at,
        'joined_at',           joined_at
      )
      ORDER BY joined_at ASC
    ),
    '[]'::jsonb
  )
  FROM staff;
$$;
