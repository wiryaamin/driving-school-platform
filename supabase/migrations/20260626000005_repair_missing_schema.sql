-- =============================================================================
-- REPAIR: 20260620000001_repair_missing_schema.sql
-- Migrations 20260617120000 and 20260617130000 were marked applied in
-- schema_migrations but their SQL never ran on the hosted DB.
-- This migration re-runs all missing DDL with IF NOT EXISTS guards.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. vehicles.next_service_date  (from 20260617120000)
-- ---------------------------------------------------------------------------

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS next_service_date date;

COMMENT ON COLUMN public.vehicles.next_service_date IS
  'Date of the next scheduled maintenance service. Updated automatically when a service record is inserted.';

-- ---------------------------------------------------------------------------
-- 2. vehicle_service_records  (from 20260617120000)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vehicle_service_records (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL REFERENCES public.organizations(id)  ON DELETE RESTRICT,
  vehicle_id      uuid          NOT NULL REFERENCES public.vehicles(id)        ON DELETE CASCADE,

  service_type    text          NOT NULL,
  service_date    date          NOT NULL,
  mileage_km      integer,
  cost_sek        numeric(10,2),
  performed_by    text,
  notes           text,
  next_service_date date,
  deleted_at      timestamptz,
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

CREATE INDEX IF NOT EXISTS vehicle_service_records_vehicle_idx
  ON public.vehicle_service_records (vehicle_id, service_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicle_service_records_org_due_idx
  ON public.vehicle_service_records (organization_id, next_service_date)
  WHERE deleted_at IS NULL AND next_service_date IS NOT NULL;

-- Trigger to keep vehicles.next_service_date in sync
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

ALTER TABLE public.vehicle_service_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicle_service_records'
      AND policyname = 'vehicle_service_records_tenant_select'
  ) THEN
    CREATE POLICY "vehicle_service_records_tenant_select"
      ON public.vehicle_service_records FOR SELECT
      USING (
        organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
        AND deleted_at IS NULL
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicle_service_records'
      AND policyname = 'vehicle_service_records_tenant_insert'
  ) THEN
    CREATE POLICY "vehicle_service_records_tenant_insert"
      ON public.vehicle_service_records FOR INSERT
      WITH CHECK (
        organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicle_service_records'
      AND policyname = 'vehicle_service_records_tenant_update'
  ) THEN
    CREATE POLICY "vehicle_service_records_tenant_update"
      ON public.vehicle_service_records FOR UPDATE
      USING (
        organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. slot_templates  (from 20260617130000)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.slot_templates (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  instructor_id   uuid        REFERENCES public.instructors(id) ON DELETE SET NULL,
  vehicle_id      uuid        REFERENCES public.vehicles(id) ON DELETE SET NULL,
  location_id     uuid        REFERENCES public.organization_locations(id) ON DELETE SET NULL,
  lesson_type_id  uuid        REFERENCES public.lesson_types(id) ON DELETE SET NULL,
  day_of_week     smallint    NOT NULL,
  start_time      time        NOT NULL,
  end_time        time        NOT NULL,
  max_bookings    smallint    NOT NULL DEFAULT 1,
  is_active       boolean     NOT NULL DEFAULT true,
  notes           text,
  deleted_at      timestamptz,
  created_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT slot_templates_pkey             PRIMARY KEY (id),
  CONSTRAINT slot_templates_name_length      CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 200),
  CONSTRAINT slot_templates_day_of_week      CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT slot_templates_time_order       CHECK (end_time > start_time),
  CONSTRAINT slot_templates_max_bookings_min CHECK (max_bookings >= 1)
);

CREATE INDEX IF NOT EXISTS idx_slot_templates_org
  ON public.slot_templates (organization_id, day_of_week, start_time)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_slot_templates_instructor
  ON public.slot_templates (instructor_id)
  WHERE deleted_at IS NULL AND instructor_id IS NOT NULL;

ALTER TABLE public.slot_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'slot_templates'
      AND policyname = 'slot_templates_tenant_select'
  ) THEN
    CREATE POLICY slot_templates_tenant_select ON public.slot_templates
      FOR SELECT USING (
        organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'slot_templates'
      AND policyname = 'slot_templates_tenant_insert'
  ) THEN
    CREATE POLICY slot_templates_tenant_insert ON public.slot_templates
      FOR INSERT WITH CHECK (
        organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'slot_templates'
      AND policyname = 'slot_templates_tenant_update'
  ) THEN
    CREATE POLICY slot_templates_tenant_update ON public.slot_templates
      FOR UPDATE USING (
        organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_slots_from_templates(
  p_week_start date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id     uuid;
  v_template   RECORD;
  v_slot_date  date;
  v_starts_at  timestamptz;
  v_ends_at    timestamptz;
  v_inserted   integer := 0;
BEGIN
  v_org_id := (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Missing organization_id in JWT';
  END IF;

  IF EXTRACT(isodow FROM p_week_start) <> 1 THEN
    RAISE EXCEPTION 'p_week_start must be a Monday (got %)', p_week_start;
  END IF;

  FOR v_template IN
    SELECT *
      FROM public.slot_templates
     WHERE organization_id = v_org_id
       AND is_active        = true
       AND deleted_at       IS NULL
  LOOP
    v_slot_date := p_week_start + (v_template.day_of_week - 1)::integer;

    v_starts_at := (v_slot_date::text || ' ' || v_template.start_time::text)::timestamp
                     AT TIME ZONE 'Europe/Stockholm';
    v_ends_at   := (v_slot_date::text || ' ' || v_template.end_time::text)::timestamp
                     AT TIME ZONE 'Europe/Stockholm';

    IF NOT EXISTS (
      SELECT 1
        FROM public.lesson_slots
       WHERE organization_id = v_org_id
         AND starts_at       = v_starts_at
         AND ends_at         = v_ends_at
         AND (
               v_template.instructor_id IS NULL
               OR instructor_id = v_template.instructor_id
             )
         AND deleted_at IS NULL
    ) THEN
      INSERT INTO public.lesson_slots (
        organization_id, instructor_id, vehicle_id, location_id,
        lesson_type_id, starts_at, ends_at, max_bookings, status
      ) VALUES (
        v_org_id, v_template.instructor_id, v_template.vehicle_id,
        v_template.location_id, v_template.lesson_type_id,
        v_starts_at, v_ends_at, v_template.max_bookings, 'open'
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;
