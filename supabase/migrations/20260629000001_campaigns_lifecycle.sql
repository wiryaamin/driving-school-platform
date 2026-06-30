-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260629000001_campaigns_lifecycle.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     Campaign Management — Lifecycle Automation
--
-- Adds:
--   process_campaign_lifecycle() — scheduled→active, active→expired transitions
--   campaign_package_links_audit — audit trigger coverage
--   campaign_coupon_codes_audit  — audit trigger coverage
--   campaign_coupons_update      — UPDATE RLS policy + grant for coupon codes
-- ════════════════════════════════════════════════════════════════════════════

-- ── Campaign lifecycle function ───────────────────────────────────────────────
-- Called by event-worker maintenance tick on every invocation.
-- Idempotent: concurrent calls are safe — UPDATE is atomic per row.
-- Returns total campaigns transitioned across both transitions.

CREATE OR REPLACE FUNCTION public.process_campaign_lifecycle()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scheduled_to_active integer := 0;
  v_active_to_expired   integer := 0;
BEGIN
  -- Transition scheduled → active (starts_at has arrived, not yet ended)
  WITH activated AS (
    UPDATE public.campaigns
    SET    status     = 'active',
           updated_at = now()
    WHERE  status    = 'scheduled'
      AND  starts_at IS NOT NULL
      AND  starts_at <= now()
      AND  (ends_at IS NULL OR ends_at > now())
    RETURNING id
  )
  SELECT COUNT(*) INTO v_scheduled_to_active FROM activated;

  -- Transition active → expired (ends_at has passed)
  WITH expired AS (
    UPDATE public.campaigns
    SET    status     = 'expired',
           updated_at = now()
    WHERE  status    = 'active'
      AND  ends_at  IS NOT NULL
      AND  ends_at   < now()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_active_to_expired FROM expired;

  RETURN v_scheduled_to_active + v_active_to_expired;
END;
$$;

-- ── Audit triggers ────────────────────────────────────────────────────────────

CREATE TRIGGER campaign_package_links_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.campaign_package_links
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER campaign_coupon_codes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.campaign_coupon_codes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ── Coupon codes UPDATE policy ────────────────────────────────────────────────

CREATE POLICY "campaign_coupons_update" ON public.campaign_coupon_codes
  FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:campaign:update')
  );

GRANT SELECT, INSERT, UPDATE ON public.campaign_coupon_codes TO authenticated, service_role;
