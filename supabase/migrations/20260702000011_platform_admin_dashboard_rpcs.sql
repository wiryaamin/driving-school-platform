-- Platform Admin Dashboard RPCs
-- SECURITY DEFINER functions for cross-tenant platform admin queries.
-- Called exclusively via the platform-admin Edge Function (service role client).
-- Excludes the system sentinel org (00000000-0000-0000-0000-000000000000).

-- ─── get_platform_dashboard_stats ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_platform_dashboard_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_orgs',           COUNT(*) FILTER (WHERE deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid),
    'active_orgs',          COUNT(*) FILTER (WHERE status = 'active' AND deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid),
    'trialing_orgs',        COUNT(*) FILTER (WHERE subscription_status = 'trialing' AND deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid),
    'suspended_orgs',       COUNT(*) FILTER (WHERE status = 'suspended' AND deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid),
    'past_due_orgs',        COUNT(*) FILTER (WHERE subscription_status = 'past_due' AND deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid),
    'expired_trials',       COUNT(*) FILTER (WHERE subscription_status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at < NOW() AND deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid),
    'active_subscriptions', COUNT(*) FILTER (WHERE subscription_status = 'active' AND deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid),
    'platform_admin_count', (SELECT COUNT(*)::int FROM public.platform_admins WHERE is_active = true),
    'tier_trial',           COUNT(*) FILTER (WHERE subscription_tier = 'trial' AND deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid),
    'tier_starter',         COUNT(*) FILTER (WHERE subscription_tier = 'starter' AND deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid),
    'tier_professional',    COUNT(*) FILTER (WHERE subscription_tier = 'professional' AND deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid),
    'tier_enterprise',      COUNT(*) FILTER (WHERE subscription_tier = 'enterprise' AND deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid),
    'trials_expiring_7d',   COUNT(*) FILTER (WHERE subscription_status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at > NOW() AND trial_ends_at <= NOW() + INTERVAL '7 days' AND deleted_at IS NULL AND id != '00000000-0000-0000-0000-000000000000'::uuid)
  )
  FROM public.organizations;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_dashboard_stats() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_dashboard_stats() TO service_role;

-- ─── get_platform_admins_list ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_platform_admins_list()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',         pa.id,
        'user_id',    pa.user_id,
        'role',       pa.role,
        'is_active',  pa.is_active,
        'granted_at', pa.granted_at,
        'notes',      pa.notes,
        'email',      p.email,
        'first_name', p.first_name,
        'last_name',  p.last_name
      )
      ORDER BY pa.granted_at ASC
    ),
    '[]'::jsonb
  )
  FROM public.platform_admins pa
  LEFT JOIN public.profiles p ON p.id = pa.user_id
  WHERE pa.is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_admins_list() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_platform_admins_list() TO service_role;
