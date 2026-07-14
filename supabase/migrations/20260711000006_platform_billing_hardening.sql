-- =============================================================================
-- Platform Billing Hardening Sprint
--
-- Backend enforcement for the existing organizations.max_users and
-- organizations.max_locations configuration. Both limits were previously
-- stored and displayed but never enforced anywhere (confirmed via the
-- Platform Billing Capability Audit — Stage 1).
--
-- Enforcement is placed at the DB layer (BEFORE INSERT triggers) rather
-- than in application code because these are the two independent existing
-- code paths that create the rows being limited, and neither should
-- duplicate the same limit-check:
--   - memberships:            inserted by supabase/functions/platform-admin
--                              (handleProvision, handleInviteAdmin)
--   - organization_locations: inserted directly by the frontend
--                              (apps/web .../hooks/useLocations.ts, RLS-gated,
--                              no Edge Function in front of it)
-- A single DB trigger per table is therefore the only enforcement point
-- that covers every insert path without introducing duplicate validation
-- logic in two different runtimes. This mirrors the project's existing
-- "DB constraint as authoritative guard" pattern (see the EXCLUDE
-- constraint on lesson_slots from Phase 3C).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- max_users enforcement on memberships
-- A seat is held by any membership row that is not 'removed' (active and
-- suspended members both still occupy a licensed seat).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_max_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_users     integer;
  v_current_count integer;
BEGIN
  SELECT max_users INTO v_max_users
  FROM public.organizations
  WHERE id = NEW.organization_id;

  IF v_max_users IS NULL THEN
    RETURN NEW; -- organization not found; FK constraint will reject this insert anyway
  END IF;

  SELECT count(*) INTO v_current_count
  FROM public.memberships
  WHERE organization_id = NEW.organization_id
    AND status <> 'removed';

  IF v_current_count >= v_max_users THEN
    RAISE EXCEPTION
      'SEAT_LIMIT_EXCEEDED: organization % has reached its max_users limit of %',
      NEW.organization_id, v_max_users
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER memberships_enforce_max_users
  BEFORE INSERT ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_users();

COMMENT ON FUNCTION public.enforce_max_users() IS
  'Rejects a new membership once organizations.max_users (non-removed count) is reached. Platform Billing Hardening Sprint.';

-- ---------------------------------------------------------------------------
-- max_locations enforcement on organization_locations
-- A slot is held by any location row that has not been soft-deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_max_locations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_locations integer;
  v_current_count integer;
BEGIN
  SELECT max_locations INTO v_max_locations
  FROM public.organizations
  WHERE id = NEW.organization_id;

  IF v_max_locations IS NULL THEN
    RETURN NEW; -- organization not found; FK constraint will reject this insert anyway
  END IF;

  SELECT count(*) INTO v_current_count
  FROM public.organization_locations
  WHERE organization_id = NEW.organization_id
    AND deleted_at IS NULL;

  IF v_current_count >= v_max_locations THEN
    RAISE EXCEPTION
      'LOCATION_LIMIT_EXCEEDED: organization % has reached its max_locations limit of %',
      NEW.organization_id, v_max_locations
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_locations_enforce_max_locations
  BEFORE INSERT ON public.organization_locations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_locations();

COMMENT ON FUNCTION public.enforce_max_locations() IS
  'Rejects a new location once organizations.max_locations (non-deleted count) is reached. Platform Billing Hardening Sprint.';
