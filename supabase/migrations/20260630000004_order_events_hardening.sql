-- ── Order Events Hardening ────────────────────────────────────────────────────
-- Closes C-1 (cross-tenant event injection) and M-3 (order ownership validation)
-- found in the Sprint 1 security audit.
--
-- Changes:
--   1. emit_order_event now rejects calls where the JWT org does not match
--      p_organization_id, preventing cross-tenant timeline pollution.
--   2. emit_order_event validates that p_order_id belongs to p_organization_id
--      before inserting.
--   3. Service-role callers (event-worker, background jobs) bypass the JWT
--      check but are still constrained by the order-membership check.

CREATE OR REPLACE FUNCTION public.emit_order_event(
  p_organization_id uuid,
  p_order_id        uuid,
  p_event_type      text,
  p_actor_id        uuid  DEFAULT NULL,
  p_actor_email     text  DEFAULT NULL,
  p_metadata        jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id   uuid;
  v_caller_org uuid;
BEGIN
  -- Tenant isolation: if the caller has a JWT org, it must match the target org.
  -- Service-role callers have no JWT org (NULL) and bypass this check.
  v_caller_org := public.auth_organization_id();
  IF v_caller_org IS NOT NULL AND v_caller_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'emit_order_event: organization mismatch — cross-tenant injection rejected'
      USING ERRCODE = 'P0001';
  END IF;

  -- Order membership: the order must exist and belong to the stated organization.
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id              = p_order_id
      AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'emit_order_event: order not found in organization'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.order_events (
    organization_id, order_id, event_type,
    actor_id, actor_email, metadata
  ) VALUES (
    p_organization_id, p_order_id, p_event_type,
    p_actor_id, p_actor_email, COALESCE(p_metadata, '{}')
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- Grants unchanged — authenticated needed by the Edge Function (user JWT client).
REVOKE ALL    ON FUNCTION public.emit_order_event(uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_order_event(uuid,uuid,text,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emit_order_event(uuid,uuid,text,uuid,text,jsonb) TO service_role;
