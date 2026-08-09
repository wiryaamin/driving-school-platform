-- =============================================================================
-- Mandatory 10-step onboarding workflow — two small, additive persisted
-- signals for the two steps ("Approve Onboarding", "Verify Payment") that
-- have no existing field to derive completion from. Same pattern as
-- organizations.internal_notes (20260729000001): plain nullable columns,
-- no new tables, no new write logic beyond a direct field update — reusing
-- the exact existing direct-table-update pattern (demoRequests()/orgs()
-- helpers already used by every other mutation in these two hook files).
-- =============================================================================

ALTER TABLE public.demo_requests
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_verified_by uuid REFERENCES auth.users(id);

-- Surface both new fields on the existing read paths — CREATE OR REPLACE
-- preserves each function's existing REVOKE/GRANT.

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
        'subscription_tier', o.subscription_tier, 'subscription_status', o.subscription_status,
        'payment_verified_at', o.payment_verified_at
      )
      FROM public.organizations o WHERE o.id = p_org_id
    ),
    'demo_request', (
      SELECT jsonb_build_object(
        'id', dr.id, 'school_name', dr.school_name, 'contact_name', dr.name,
        'email', dr.email, 'phone', dr.phone,
        'created_at', dr.created_at, 'contacted_at', dr.contacted_at,
        'approved_at', dr.approved_at, 'converted_at', dr.converted_at
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
