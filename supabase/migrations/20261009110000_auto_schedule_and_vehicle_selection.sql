-- ─── Automatiskt arbetsschema + automatiskt fordonsval ───────────────────────
--
-- 1. generate_instructor_schedule(p_instructor_id, p_weeks)
--    Skapar bokningsbara pass för en lärare de kommande veckorna utifrån
--    lärarens veckovisa tillgänglighetsregler (arbetstider). Tunt skal runt den
--    befintliga motorn generate_slots_for_instructor(), men med kontroll att
--    läraren tillhör anroparens egen organisation. Befintliga pass hoppas över
--    av motorn, så funktionen kan köras flera gånger utan dubbletter.
--
-- 2. Automatiskt fordonsval vid bokning
--    När en körlektion bokas på ett pass som saknar fordon väljs ett ledigt,
--    körbart fordon vars behörigheter (teaching_categories) täcker elevens
--    behörighet. Lärarens primära/tilldelade fordon föredras om det är ledigt,
--    men ingen manuell koppling lärare↔fordon krävs. Dubbelbokning av fordon
--    stoppas av den befintliga constrainten lesson_slots_vehicle_no_overlap.
--    Fordonsvalet får aldrig stoppa en bokning: hittas inget fordon, eller går
--    tilldelningen inte igenom, bokas lektionen utan fordon som tidigare.

-- ── 1. generate_instructor_schedule ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_instructor_schedule(
  p_instructor_id uuid,
  p_weeks         integer DEFAULT 4
)
RETURNS TABLE (
  out_rules_processed integer,
  out_slots_created   integer,
  out_slots_skipped   integer,
  out_conflicts_found integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Stockholm')::date;
BEGIN
  IF NOT public.has_permission('scheduling:generation:run') THEN
    RAISE EXCEPTION 'Behörighet saknas för att skapa schema.' USING ERRCODE = '42501';
  END IF;

  IF p_weeks IS NULL OR p_weeks < 1 OR p_weeks > 12 THEN
    RAISE EXCEPTION 'Antal veckor måste vara mellan 1 och 12.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.instructors i
    WHERE i.id = p_instructor_id
      AND i.organization_id = public.auth_organization_id()
      AND i.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Läraren hittades inte.' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT g.rules_processed, g.slots_created, g.slots_skipped, g.conflicts_found
  FROM public.generate_slots_for_instructor(
         p_instructor_id,
         NULL,
         v_today,
         v_today + (p_weeks * 7) - 1
       ) AS g;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_instructor_schedule(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_instructor_schedule(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_instructor_schedule(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.generate_instructor_schedule(uuid, integer) IS
  'Skapar pass för en lärare (egen organisation) de kommande p_weeks veckorna '
  'utifrån lärarens tillgänglighetsregler. Idempotent: befintliga pass hoppas över.';

-- ── 2. Automatiskt fordonsval ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pick_vehicle_for_slot(
  p_slot_id          uuid,
  p_licence_category text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id
  FROM public.lesson_slots s
  JOIN public.vehicles v
    ON v.organization_id = s.organization_id
  WHERE s.id = p_slot_id
    AND v.deleted_at IS NULL
    AND v.operational_status::text NOT IN ('maintenance', 'inspection_due', 'inactive', 'decommissioned')
    AND (p_licence_category IS NULL OR p_licence_category = ANY (v.teaching_categories))
    AND NOT EXISTS (
      SELECT 1 FROM public.lesson_slots o
      WHERE o.vehicle_id = v.id
        AND o.id <> s.id
        AND o.status <> 'cancelled'
        AND o.deleted_at IS NULL
        AND tstzrange(o.starts_at, o.ends_at, '[)') && tstzrange(s.starts_at, s.ends_at, '[)')
    )
  ORDER BY
    EXISTS (
      SELECT 1 FROM public.instructor_vehicle_assignments a
      WHERE a.vehicle_id = v.id AND a.instructor_id = s.instructor_id
        AND a.unassigned_at IS NULL AND a.is_primary
    ) DESC,
    EXISTS (
      SELECT 1 FROM public.instructor_vehicle_assignments a
      WHERE a.vehicle_id = v.id AND a.instructor_id = s.instructor_id
        AND a.unassigned_at IS NULL
    ) DESC,
    v.registration_number
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.pick_vehicle_for_slot(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pick_vehicle_for_slot(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.pick_vehicle_for_slot(uuid, text) FROM authenticated;

-- Samma funktion som tidigare (20260806151332) + automatiskt fordonsval sist.
CREATE OR REPLACE FUNCTION public.lesson_booking_set_slot_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot      RECORD;
  v_category  public.lesson_category;
  v_licence   text;
  v_vehicle   uuid;
BEGIN
  SELECT starts_at, ends_at, instructor_id, vehicle_id,
         lesson_type_id, location_id, organization_id
  INTO   v_slot
  FROM   public.lesson_slots
  WHERE  id = NEW.slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson_bookings: slot_id % does not exist', NEW.slot_id;
  END IF;

  IF NEW.organization_id != v_slot.organization_id THEN
    RAISE EXCEPTION
      'lesson_bookings: organization_id % does not match slot organization_id %',
      NEW.organization_id, v_slot.organization_id;
  END IF;

  NEW.starts_at      := v_slot.starts_at;
  NEW.ends_at        := v_slot.ends_at;
  NEW.instructor_id  := v_slot.instructor_id;
  NEW.vehicle_id     := v_slot.vehicle_id;
  NEW.lesson_type_id := COALESCE(v_slot.lesson_type_id, NEW.lesson_type_id);
  NEW.location_id    := v_slot.location_id;

  -- Automatiskt fordonsval: bara körande lektioner, bara om passet saknar fordon.
  IF v_slot.vehicle_id IS NULL AND NEW.lesson_type_id IS NOT NULL THEN
    BEGIN
      SELECT lt.category INTO v_category
      FROM public.lesson_types lt
      WHERE lt.id = NEW.lesson_type_id;

      IF v_category IN ('driving', 'intensive', 'assessment') THEN
        SELECT NULLIF(btrim(st.target_licence_category), '') INTO v_licence
        FROM public.students st
        WHERE st.id = NEW.student_id;

        v_vehicle := public.pick_vehicle_for_slot(NEW.slot_id, COALESCE(v_licence, 'B'));

        IF v_vehicle IS NOT NULL THEN
          UPDATE public.lesson_slots
          SET    vehicle_id = v_vehicle
          WHERE  id = NEW.slot_id
            AND  vehicle_id IS NULL;
          IF FOUND THEN
            NEW.vehicle_id := v_vehicle;
          END IF;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Fordonsvalet är en bekvämlighet; bokningen ska alltid gå igenom.
      RAISE WARNING 'lesson_booking_set_slot_fields: automatiskt fordonsval hoppades över (%): %', SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.lesson_booking_set_slot_fields IS
  'BEFORE INSERT: copies starts_at/ends_at and resource IDs from the slot. '
  'lesson_type_id is copied from the slot only when the slot has one. '
  'For driving lessons on a slot without a vehicle, picks a free operational '
  'vehicle whose teaching_categories cover the student''s licence category '
  '(instructor''s assigned vehicle preferred) and assigns it to the slot; '
  'never blocks the booking if no vehicle can be assigned.';
