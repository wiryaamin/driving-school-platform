-- =============================================================================
-- Surface internal_notes / internal_notes_updated_at (added in
-- 20260729000001) on the existing get_platform_org_detail RPC, rather than a
-- second endpoint. CREATE OR REPLACE preserves the function's existing
-- REVOKE/GRANT.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_platform_org_detail(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',                  o.id,
    'slug',                o.slug,
    'name',                o.name,
    'legal_name',          o.legal_name,
    'org_number',          o.org_number,
    'status',              o.status,
    'subscription_tier',   o.subscription_tier,
    'subscription_status', o.subscription_status,
    'trial_ends_at',       o.trial_ends_at,
    'max_users',           o.max_users,
    'max_locations',       o.max_locations,
    'settings',            o.settings,
    'created_at',          o.created_at,
    'updated_at',          o.updated_at,
    'internal_notes',            o.internal_notes,
    'internal_notes_updated_at', o.internal_notes_updated_at
  )
  FROM public.organizations o
  WHERE o.id = p_org_id
  AND   o.deleted_at IS NULL;
$$;
