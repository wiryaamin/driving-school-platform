-- ---------------------------------------------------------------------------
-- vehicle_maintenance had no way to delete a record. The sibling table
-- vehicle_service_records already established the soft-delete convention
-- (deleted_at column, filtered at the query layer, governed by the existing
-- UPDATE RLS policy rather than a new DELETE policy). Mirror that here so
-- authorized users (vehicles:vehicle:update, same permission that already
-- gates editing/status changes on this table) can remove a maintenance
-- record without a hard delete or a new RLS policy.
-- ---------------------------------------------------------------------------

ALTER TABLE public.vehicle_maintenance
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.vehicle_maintenance.deleted_at IS
  'Soft-delete marker. NULL = active record. Set by users with vehicles:vehicle:update permission.';

-- Existing indexes already scope to organization_id/vehicle_id/status; add a
-- narrow index for the common "active records only" access pattern.
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_not_deleted
  ON public.vehicle_maintenance (organization_id, scheduled_at)
  WHERE deleted_at IS NULL;
