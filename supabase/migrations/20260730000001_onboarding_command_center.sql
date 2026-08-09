-- =============================================================================
-- Onboarding Command Center — raw data for one organization's onboarding
-- journey, and the platform's historical average time-to-go-live.
--
-- Pure read composition over tables that already exist: organizations,
-- demo_requests, memberships/membership_roles/profiles, auth.users,
-- organization_locations, vehicles, instructors, slot_templates,
-- lesson_types. Stage labeling and business-language translation happen in
-- the platform-admin Edge Function, not here — this only assembles the raw
-- facts. Setup-completeness itself is NOT recomputed here; it continues to
-- come from the existing computeOnboardingProgress() (tenant-onboarding-
-- progress.ts), reused as-is.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_onboarding_journey_facts(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'organization', (
      SELECT jsonb_build_object(
        'id', o.id, 'name', o.name, 'status', o.status, 'created_at', o.created_at,
        'subscription_tier', o.subscription_tier, 'subscription_status', o.subscription_status
      )
      FROM public.organizations o WHERE o.id = p_org_id
    ),
    'demo_request', (
      SELECT jsonb_build_object(
        'id', dr.id, 'school_name', dr.school_name, 'contact_name', dr.name,
        'email', dr.email, 'phone', dr.phone,
        'created_at', dr.created_at, 'contacted_at', dr.contacted_at, 'converted_at', dr.converted_at
      )
      FROM public.demo_requests dr WHERE dr.converted_organization_id = p_org_id
      LIMIT 1
    ),
    'admin_user', (
      SELECT jsonb_build_object(
        'user_id', p.id, 'email', p.email, 'first_name', p.first_name, 'last_name', p.last_name,
        'invited_at', au.invited_at, 'confirmed_at', au.confirmed_at,
        'last_sign_in_at', au.last_sign_in_at, 'banned_until', au.banned_until
      )
      FROM public.memberships m
      JOIN public.membership_roles mr ON mr.membership_id = m.id AND mr.is_active = true
      JOIN public.roles r ON r.id = mr.role_id AND r.name = 'org_owner'
      JOIN public.profiles p ON p.id = m.user_id
      LEFT JOIN auth.users au ON au.id = m.user_id
      WHERE m.organization_id = p_org_id
      ORDER BY m.joined_at ASC
      LIMIT 1
    ),
    'first_location_at',  (SELECT MIN(created_at) FROM public.organization_locations WHERE organization_id = p_org_id AND deleted_at IS NULL),
    'first_vehicle_at',   (SELECT MIN(created_at) FROM public.vehicles WHERE organization_id = p_org_id),
    'first_instructor_at',(SELECT MIN(created_at) FROM public.instructors WHERE organization_id = p_org_id),
    'first_booking_config_at', (
      SELECT MIN(t) FROM (
        SELECT MIN(created_at) AS t FROM public.slot_templates WHERE organization_id = p_org_id AND is_active = true
        UNION ALL
        SELECT MIN(created_at) FROM public.lesson_types WHERE organization_id = p_org_id AND is_active = true
      ) x
    ),
    'first_staff_invited_at', (
      SELECT MIN(m2.joined_at)
      FROM public.memberships m2
      WHERE m2.organization_id = p_org_id
      AND m2.id NOT IN (
        SELECT m3.id FROM public.memberships m3
        JOIN public.membership_roles mr3 ON mr3.membership_id = m3.id AND mr3.is_active = true
        JOIN public.roles r3 ON r3.id = mr3.role_id AND r3.name = 'org_owner'
        WHERE m3.organization_id = p_org_id
        ORDER BY m3.joined_at ASC LIMIT 1
      )
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_onboarding_journey_facts(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_onboarding_journey_facts(uuid) TO service_role;

-- ─── Platform-wide historical average time-to-go-live ──────────────────────
-- Real historical data, not a guessed constant — "not enough data yet" is
-- returned honestly (as null) when fewer than 3 organizations have gone live.

CREATE OR REPLACE FUNCTION public.get_average_go_live_duration_days()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN COUNT(*) >= 3
    THEN AVG(EXTRACT(EPOCH FROM (go_live_at - created_at)) / 86400.0)
    ELSE NULL
  END
  FROM public.organizations
  WHERE go_live_at IS NOT NULL AND deleted_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_average_go_live_duration_days() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_average_go_live_duration_days() TO service_role;
