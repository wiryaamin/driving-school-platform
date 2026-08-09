-- =============================================================================
-- notification_rules — Tenant Configuration Wiring
--
-- BokningarSchemaPage's confirm_sms/confirm_email/reminder_sms/reminder_email
-- toggles saved to organizations.settings.bookings_schema, a JSONB blob
-- nothing ever read. The real, working mechanism controlling whether a
-- booking notification actually dispatches is notification_rules
-- (organization_id, trigger_event, channel, enabled) — read by
-- communication-worker's runNotify — but it had zero tenant Settings UI
-- anywhere, a raw-JWT RLS policy inconsistent with the rest of the schema,
-- and no auto-seeding on org creation (seed_org_communation() already
-- existed but was only invoked manually via an admin Edge Function route
-- and a one-time backfill DO-block — no ongoing trigger for new orgs).
--
-- This migration:
--   1. Fixes notification_rules RLS to match the rest of the schema
--      (auth_organization_id() with its NULLIF empty-claim guard, a
--      platform-admin bypass, and a real permission gate on writes —
--      previously ANY org member could write, now requires
--      notifications:preferences:manage).
--   2. Adds an AFTER INSERT trigger on organizations to auto-seed
--      notification_rules (+ channel_configs, both handled by the existing
--      seed_org_communication()) for every new org going forward — the
--      same pattern as organizations_seed_chart_of_accounts.
--   3. Backfills every existing real org (seed_org_communication is
--      idempotent — ON CONFLICT DO NOTHING — safe to re-run even for
--      orgs the one-time 20260622000003 backfill already covered).
--
-- BokningarSchemaPage itself is updated in the companion frontend change to
-- read/write these rows directly instead of the disconnected settings blob.
-- =============================================================================

-- ─── 1. Fix RLS: consistent org-scoping helper, platform-admin bypass, real permission gate ───

DROP POLICY IF EXISTS "org members read notification_rules" ON public.notification_rules;
DROP POLICY IF EXISTS "org admins write notification_rules" ON public.notification_rules;

CREATE POLICY "notification_rules_select"
  ON public.notification_rules FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "notification_rules_insert"
  ON public.notification_rules FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('notifications:preferences:manage')
  );

CREATE POLICY "notification_rules_update"
  ON public.notification_rules FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('notifications:preferences:manage')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('notifications:preferences:manage')
  );

-- No DELETE policy — matches convention elsewhere (disable via `enabled`,
-- don't remove the row; the unique constraint + seed function depend on
-- rows staying present for idempotent re-seeding).

GRANT SELECT, INSERT, UPDATE ON public.notification_rules TO authenticated, service_role;

-- ─── 2. Auto-seed on new org creation ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.seed_new_org_communication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_org_communication(NEW.id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.seed_new_org_communication() IS
  'Trigger wrapper: seeds a newly-created organization''s channel_configs and '
  'notification_rules from system templates. Idempotent, safe to re-run.';

DROP TRIGGER IF EXISTS organizations_seed_communication ON public.organizations;
CREATE TRIGGER organizations_seed_communication
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_new_org_communication();

-- ─── 3. Backfill existing orgs ───────────────────────────────────────────────

DO $$
DECLARE
  v_org record;
BEGIN
  FOR v_org IN
    SELECT id FROM public.organizations
    WHERE deleted_at IS NULL
      AND id != '00000000-0000-0000-0000-000000000000'
  LOOP
    PERFORM public.seed_org_communication(v_org.id);
  END LOOP;
END;
$$;
