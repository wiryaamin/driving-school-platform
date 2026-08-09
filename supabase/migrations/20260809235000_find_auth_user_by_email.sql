-- Trial provisioning's "create the administrator account" step
-- (_shared/trial-provisioning.ts) unconditionally called
-- auth.admin.generateLink({ type: 'invite', ... }) for the applicant's
-- email. Supabase Auth enforces one auth.users row per email across the
-- ENTIRE project (not per-org), so this fails outright whenever that email
-- already has an account anywhere on the platform — e.g. someone who
-- already administers a different trafikskola, or a prior trial attempt
-- that was rejected/cancelled before the org existed (which never removes
-- the auth user, since there is nothing yet to cascade-delete). Confirmed
-- live 2026-08-09: a real approval attempt failed twice with a generic
-- "Kunde inte skapa administratörskonto" and rolled back both provisioning
-- attempts, blocking pilot activation entirely.
--
-- This function lets the Edge Function check for an existing user first
-- and reuse it (new membership on the new org) instead of treating a
-- pre-existing account as a hard failure. SECURITY DEFINER because
-- auth.users is not otherwise reachable from the public schema's normal
-- privileges; restricted to service_role since only trusted Edge Function
-- code (never a tenant-scoped request) should be able to resolve emails to
-- user ids platform-wide.
CREATE OR REPLACE FUNCTION public.find_auth_user_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_auth_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_auth_user_by_email(text) TO service_role;
