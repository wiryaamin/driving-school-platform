-- =============================================================================
-- Fix: Add membership-based fallback SELECT policy for lesson_types
--
-- Problem: All existing SELECT policies use auth_organization_id() which reads
-- organization_id from the JWT custom claim. If the auth hook is not deployed
-- or the user's session was issued without it, the JWT lacks this claim,
-- causing all queries to return 0 rows (policy: NULL = UUID is always false).
--
-- Fix: Add a 4th SELECT policy that resolves the user's org from the
-- memberships table using only auth.uid() — which Supabase always populates
-- for any authenticated session, regardless of custom JWT claims.
-- =============================================================================

CREATE POLICY lesson_types_select_member
  ON public.lesson_types
  FOR SELECT
  USING (
    is_active = true
    AND organization_id IN (
      SELECT m.organization_id
      FROM   public.memberships m
      WHERE  m.user_id    = auth.uid()
        AND  m.removed_at IS NULL
    )
  );
