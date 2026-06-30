-- Phase G: Recurring slot templates
-- G2 — admin-defined weekly recurring slot patterns

CREATE TABLE IF NOT EXISTS public.slot_templates (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  instructor_id   uuid        REFERENCES public.instructors(id) ON DELETE SET NULL,
  vehicle_id      uuid        REFERENCES public.vehicles(id) ON DELETE SET NULL,
  location_id     uuid        REFERENCES public.organization_locations(id) ON DELETE SET NULL,
  lesson_type_id  uuid        REFERENCES public.lesson_types(id) ON DELETE SET NULL,
  day_of_week     smallint    NOT NULL, -- 1=Monday … 7=Sunday (ISO week day)
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

CREATE POLICY slot_templates_tenant_select ON public.slot_templates
  FOR SELECT USING (
    organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
  );

CREATE POLICY slot_templates_tenant_insert ON public.slot_templates
  FOR INSERT WITH CHECK (
    organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
  );

CREATE POLICY slot_templates_tenant_update ON public.slot_templates
  FOR UPDATE USING (
    organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
  );

-- ─── generate_slots_from_templates ───────────────────────────────────────────
-- Materialises active templates into concrete lesson_slots for one ISO week.
-- p_week_start must be a Monday. Org is derived from the caller's JWT claim.
-- Returns the number of newly inserted slots.

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
  -- Derive org from caller's JWT so the caller cannot target another org.
  v_org_id := (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Missing organization_id in JWT';
  END IF;

  -- Validate that p_week_start is a Monday (DOW = 1 in ISO).
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
    -- day_of_week 1=Mon … 7=Sun → offset from week_start
    v_slot_date := p_week_start + (v_template.day_of_week - 1)::integer;

    -- Build Europe/Stockholm-aware timestamptz
    v_starts_at := (v_slot_date::text || ' ' || v_template.start_time::text)::timestamp
                     AT TIME ZONE 'Europe/Stockholm';
    v_ends_at   := (v_slot_date::text || ' ' || v_template.end_time::text)::timestamp
                     AT TIME ZONE 'Europe/Stockholm';

    -- Skip if a slot already exists with the same instructor + time window
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
        organization_id,
        instructor_id,
        vehicle_id,
        location_id,
        lesson_type_id,
        starts_at,
        ends_at,
        max_bookings,
        status
      ) VALUES (
        v_org_id,
        v_template.instructor_id,
        v_template.vehicle_id,
        v_template.location_id,
        v_template.lesson_type_id,
        v_starts_at,
        v_ends_at,
        v_template.max_bookings,
        'open'
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;
