-- =============================================================================
-- MIGRATION: 20260617120000_phase_f_vehicle_management.sql
-- Phase F — Vehicle Management
--   F1: Fleet availability — vehicle_id already exists on lesson_slots (Phase 2B)
--   F2: Maintenance tracking — service record history + next_service_date column
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add next_service_date to vehicles
--    Stores the upcoming scheduled service date, kept in sync by trigger.
-- ---------------------------------------------------------------------------

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS next_service_date date;

COMMENT ON COLUMN public.vehicles.next_service_date IS
  'Date of the next scheduled maintenance service. Updated automatically when a service record is inserted.';

-- ---------------------------------------------------------------------------
-- 2. vehicle_service_records
--    Append-only history of every service performed on a vehicle.
--    Soft-deleted to preserve audit trail.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vehicle_service_records (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL REFERENCES public.organizations(id)  ON DELETE RESTRICT,
  vehicle_id      uuid          NOT NULL REFERENCES public.vehicles(id)        ON DELETE CASCADE,

  -- What was done
  service_type    text          NOT NULL,
  -- Allowed values: annual_service, oil_change, tires, brakes, repair,
  --                 inspection_prep, cleaning, other

  service_date    date          NOT NULL,
  mileage_km      integer,                 -- odometer reading at service
  cost_sek        numeric(10,2),
  performed_by    text,                    -- workshop / technician name
  notes           text,

  -- When the next service is expected
  next_service_date date,

  -- Soft delete
  deleted_at      timestamptz,

  -- Audit
  created_by      uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT vehicle_service_records_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_service_records_service_type_check CHECK (
    service_type IN (
      'annual_service','oil_change','tires','brakes','repair',
      'inspection_prep','cleaning','other'
    )
  ),
  CONSTRAINT vehicle_service_records_date_not_future CHECK (
    service_date <= CURRENT_DATE + INTERVAL '1 day'
  ),
  CONSTRAINT vehicle_service_records_mileage_positive CHECK (
    mileage_km IS NULL OR mileage_km >= 0
  ),
  CONSTRAINT vehicle_service_records_cost_non_negative CHECK (
    cost_sek IS NULL OR cost_sek >= 0
  )
);

COMMENT ON TABLE public.vehicle_service_records IS
  'Maintenance service history per vehicle. next_service_date on the latest record drives the service status badge.';

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS vehicle_service_records_vehicle_idx
  ON public.vehicle_service_records (vehicle_id, service_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicle_service_records_org_due_idx
  ON public.vehicle_service_records (organization_id, next_service_date)
  WHERE deleted_at IS NULL AND next_service_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Trigger: keep vehicles.next_service_date in sync
--    After each insert/update/delete on vehicle_service_records, recompute
--    the latest next_service_date for that vehicle.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_vehicle_next_service_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vehicle_id uuid;
  v_next       date;
BEGIN
  v_vehicle_id := COALESCE(NEW.vehicle_id, OLD.vehicle_id);

  SELECT next_service_date
    INTO v_next
    FROM public.vehicle_service_records
   WHERE vehicle_id = v_vehicle_id
     AND deleted_at IS NULL
     AND next_service_date IS NOT NULL
   ORDER BY service_date DESC
   LIMIT 1;

  UPDATE public.vehicles
     SET next_service_date = v_next
   WHERE id = v_vehicle_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS vehicle_service_records_sync_next ON public.vehicle_service_records;
CREATE TRIGGER vehicle_service_records_sync_next
  AFTER INSERT OR UPDATE OR DELETE
  ON public.vehicle_service_records
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_vehicle_next_service_date();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.vehicle_service_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehicle_service_records_tenant_select"
  ON public.vehicle_service_records FOR SELECT
  USING (
    organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    AND deleted_at IS NULL
  );

CREATE POLICY "vehicle_service_records_tenant_insert"
  ON public.vehicle_service_records FOR INSERT
  WITH CHECK (
    organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
  );

CREATE POLICY "vehicle_service_records_tenant_update"
  ON public.vehicle_service_records FOR UPDATE
  USING (
    organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
  );
