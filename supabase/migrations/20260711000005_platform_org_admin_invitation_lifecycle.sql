-- =============================================================================
-- Organization Administration — Phase 4: Administrator Invitation Lifecycle
--
-- Extends get_platform_org_timeline (20260702000012_platform_org_detail_rpcs.sql)
-- to surface Administrator Invited / Invitation Resent / Invitation Accepted /
-- Invitation Cancelled, using entirely existing infrastructure:
--   - Invited / Resent / Cancelled are read from event_outbox — already the
--     project's invitation mechanism (Provisioning Architecture, Section 7),
--     already carries organization_id/target_id/payload/created_at.
--   - Accepted is synthesized from auth.users.last_sign_in_at, exactly the
--     same derivation get_platform_org_admins already uses for
--     invitation_status — auth.users carries no audit trigger (Supabase's
--     managed schema), so first login is not itself an audited row anywhere
--     in this system; this is the correct existing signal to read instead.
-- No new tables. No new columns.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_platform_org_timeline(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(t.evt ORDER BY t.occurred_at DESC), '[]'::jsonb)
  FROM (
    SELECT combined.evt, combined.occurred_at
    FROM (

      -- ── 1. Organization-level lifecycle (unchanged from the original) ────
      SELECT
        jsonb_build_object(
          'id',             al.id,
          'event_type',
            CASE
              WHEN al.operation = 'INSERT'
                THEN 'org_created'
              WHEN al.operation = 'UPDATE'
                AND 'status' = ANY(al.changed_fields)
                AND (al.new_values->>'status') = 'suspended'
                THEN 'org_suspended'
              WHEN al.operation = 'UPDATE'
                AND 'status' = ANY(al.changed_fields)
                AND (al.new_values->>'status') = 'active'
                THEN 'org_reactivated'
              WHEN al.operation = 'UPDATE'
                AND 'status' = ANY(al.changed_fields)
                AND (al.new_values->>'status') = 'terminated'
                THEN 'org_terminated'
              WHEN al.operation = 'UPDATE'
                AND 'subscription_status' = ANY(al.changed_fields)
                AND (al.new_values->>'subscription_status') = 'trialing'
                THEN 'trial_started'
              WHEN al.operation = 'UPDATE'
                AND 'subscription_status' = ANY(al.changed_fields)
                AND (al.new_values->>'subscription_status') = 'active'
                THEN 'trial_ended'
              WHEN al.operation = 'UPDATE'
                AND 'trial_ends_at' = ANY(al.changed_fields)
                AND NOT ('subscription_status' = ANY(al.changed_fields))
                THEN 'trial_extended'
              WHEN al.operation = 'UPDATE'
                AND 'subscription_tier' = ANY(al.changed_fields)
                THEN 'tier_changed'
              ELSE 'org_updated'
            END,
          'actor_id',       al.actor_id,
          'actor_email',    al.actor_email,
          'occurred_at',    al.occurred_at,
          'changed_fields', al.changed_fields,
          'new_values',     al.new_values,
          'old_values',     al.old_values
        ) AS evt,
        al.occurred_at
      FROM public.audit_logs al
      WHERE al.organization_id = p_org_id
      AND   al.entity_type     = 'organizations'

      UNION ALL

      -- ── 2. Administrator invitation lifecycle: Invited / Resent / Cancelled ─
      -- tenant.provisioned is included so the very first administrator
      -- (created during Provisioning, Architecture Section 7 step 7,
      -- "Invitation") shows up too, not only ones added later via Invite
      -- Administrator.
      SELECT
        jsonb_build_object(
          'id',             eo.id,
          'event_type',
            CASE
              WHEN eo.event_type IN ('tenant.provisioned', 'org.admin_invited')
                THEN 'admin_invited'
              WHEN eo.event_type = 'org.admin_invitation_resent'
                THEN 'admin_invitation_resent'
              WHEN eo.event_type = 'org.admin_invitation_cancelled'
                THEN 'admin_invitation_cancelled'
            END,
          'actor_id',       eo.created_by,
          'actor_email',    NULL,
          'occurred_at',    eo.created_at,
          'changed_fields', NULL,
          'new_values',     jsonb_build_object(
            'admin_email', eo.payload->>'admin_email',
            'role',        eo.payload->>'role'
          ),
          'old_values',     NULL
        ) AS evt,
        eo.created_at AS occurred_at
      FROM public.event_outbox eo
      WHERE eo.organization_id = p_org_id
      AND   eo.event_type IN (
        'tenant.provisioned', 'org.admin_invited',
        'org.admin_invitation_resent', 'org.admin_invitation_cancelled'
      )

      UNION ALL

      -- ── 3. Administrator invitation accepted — synthesized, not stored ────
      SELECT
        jsonb_build_object(
          'id',             m.id,
          'event_type',     'admin_invitation_accepted',
          'actor_id',       m.user_id,
          'actor_email',    p.email,
          'occurred_at',    au.last_sign_in_at,
          'changed_fields', NULL,
          'new_values',     NULL,
          'old_values',     NULL
        ) AS evt,
        au.last_sign_in_at AS occurred_at
      FROM public.memberships      m
      JOIN public.membership_roles mr ON mr.membership_id = m.id AND mr.is_active = true
      JOIN public.roles            r  ON r.id = mr.role_id AND r.name IN ('org_owner', 'org_admin', 'org_manager')
      JOIN public.profiles         p  ON p.id = m.user_id
      LEFT JOIN auth.users         au ON au.id = m.user_id
      WHERE m.organization_id = p_org_id
      AND   au.last_sign_in_at IS NOT NULL

    ) combined
    ORDER BY combined.occurred_at DESC
    LIMIT 50
  ) t;
$$;

-- Signature unchanged (get_platform_org_timeline(uuid) RETURNS jsonb) — CREATE
-- OR REPLACE preserves the existing REVOKE/GRANT from the original migration.
