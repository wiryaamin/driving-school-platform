-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260606000002_phase4h_schedule_lineage.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H — Schedule Lineage Tracking
--
-- Implements immutable schedule ancestry tracking:
--   schedule_generations       — version records for each schedule generation event
--   schedule_generation_links  — parent→child ancestry between superseded generations
--
-- SECURITY DEFINER function:
--   supersede_schedule_generation(p_schedule_type, p_source_id, p_reason, p_actor_id)
--     → Marks the current generation as superseded (non-current), creates a new
--       generation record, inserts an ancestry link between the two.
--       Returns the new generation's uuid.
--       NEVER deletes schedules — supersede-only rule enforced at DB level.
--
-- Schedule lineage rules:
--   • No schedule generation record is ever deleted (immutable once created)
--   • The current generation is tracked by is_current = true (only one per source)
--   • Supersession creates new generation + link; old generation has superseded_at set
--   • schedule_generation_links records are immutable
--   • Full ancestry is reconstructable by following parent_generation_id chain
--
-- Dependencies:
--   20260605000001_phase4g_fixed_assets.sql      — fixed_assets table
--   20260605000003_phase4g_accrual_schedules.sql — accrual_schedules table
--   20260605000004_phase4g_deferred_revenue.sql  — periodic_deferred_schedules table
--   20260606000001_phase4h_replay_core.sql       — permissions
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ─────────────────────────────────────────────────────

CREATE TYPE public.schedule_generation_type AS ENUM (
  'depreciation', -- Fixed asset depreciation schedule (from generate_depreciation_schedule)
  'accrual',      -- Accrual release schedule (accrual_schedules)
  'deferred'      -- Deferred revenue release schedule (periodic_deferred_schedules)
);

-- ── Section 2: schedule_generations ──────────────────────────────────────────
-- Version records for each time a schedule is generated or regenerated.
-- One row per (schedule_type, source_id, generation_number) combination.
-- Only one generation per source can have is_current = true at any time.
-- When a schedule is regenerated, the old generation is superseded (not deleted).

CREATE TABLE public.schedule_generations (
  id                  uuid                           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid                           NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  schedule_type       public.schedule_generation_type NOT NULL,
  source_id           uuid                           NOT NULL, -- asset_id, accrual_schedule_id, or periodic_deferred_schedule_id
  generation_number   int                            NOT NULL CHECK (generation_number >= 1),
  lines_count         int                            NOT NULL DEFAULT 0 CHECK (lines_count >= 0),
  total_amount        numeric(14,2)                  NOT NULL DEFAULT 0,
  is_current          boolean                        NOT NULL DEFAULT true,
  superseded_at       timestamptz,
  superseded_by       uuid                                    REFERENCES public.schedule_generations(id) ON DELETE RESTRICT,
  reason              text,
  metadata            jsonb                          NOT NULL DEFAULT '{}',
  created_at          timestamptz                    NOT NULL DEFAULT now(),
  created_by          uuid                                    REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT sg_source_gen_unique UNIQUE (schedule_type, source_id, generation_number),
  CONSTRAINT sg_supersede_consistency CHECK (
    (superseded_at IS NULL AND superseded_by IS NULL) OR
    (superseded_at IS NOT NULL AND superseded_by IS NOT NULL)
  ),
  CONSTRAINT sg_current_or_superseded CHECK (
    NOT (is_current = true AND superseded_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.schedule_generations IS
  'Version records for every schedule generation event. '
  'Never deleted — supersede only. is_current tracks the active generation. '
  'When regenerated, old generation gets superseded_at set and is_current = false. '
  'Full history is preserved for audit reproducibility and replay determinism.';
COMMENT ON COLUMN public.schedule_generations.source_id IS
  'FK to fixed_assets.id (depreciation), accrual_schedules.id (accrual), '
  'or periodic_deferred_schedules.id (deferred). No FK constraint — cross-type reference.';
COMMENT ON COLUMN public.schedule_generations.generation_number IS
  'Sequential version counter starting at 1. Increments on each supersession.';

-- Prevent deletion (supersede-only rule)
CREATE OR REPLACE FUNCTION public.prevent_schedule_generation_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'SCHEDULE_GENERATION_IMMUTABLE: schedule generation records cannot be deleted. '
    'Use supersede_schedule_generation() to create a new version.'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER schedule_generations_no_delete
  BEFORE DELETE ON public.schedule_generations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_schedule_generation_delete();

-- ── Section 3: schedule_generation_links ─────────────────────────────────────
-- Immutable ancestry links between schedule generations.
-- Created by supersede_schedule_generation() each time a schedule is regenerated.
-- Enables full ancestry chain reconstruction.

CREATE TABLE public.schedule_generation_links (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_generation_id  uuid        NOT NULL REFERENCES public.schedule_generations(id) ON DELETE RESTRICT,
  child_generation_id   uuid        NOT NULL REFERENCES public.schedule_generations(id) ON DELETE RESTRICT,
  link_reason           text,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sgl_unique_link UNIQUE (parent_generation_id, child_generation_id),
  CONSTRAINT sgl_no_self_link CHECK (parent_generation_id <> child_generation_id)
);

COMMENT ON TABLE public.schedule_generation_links IS
  'Immutable parent→child ancestry links between schedule generations. '
  'Created atomically by supersede_schedule_generation(). Never modified or deleted. '
  'Full ancestry chain: follow parent_generation_id recursively from any generation.';

CREATE OR REPLACE FUNCTION public.prevent_schedule_generation_link_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'SCHEDULE_GENERATION_LINK_IMMUTABLE: lineage links are permanent audit records.'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER schedule_generation_links_immutability
  BEFORE UPDATE OR DELETE ON public.schedule_generation_links
  FOR EACH ROW EXECUTE FUNCTION public.prevent_schedule_generation_link_mutation();

-- ── Section 4: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.schedule_generations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_generation_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sg_org_read"
  ON public.schedule_generations FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:replay:read')
  );

CREATE POLICY "sgl_read"
  ON public.schedule_generation_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.schedule_generations sg
      WHERE sg.id = schedule_generation_links.parent_generation_id
        AND sg.organization_id = public.auth_organization_id()
        AND public.has_permission('finance:replay:read')
    )
  );

-- ── Section 5: Grants ─────────────────────────────────────────────────────────

GRANT SELECT        ON public.schedule_generations      TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.schedule_generations      TO service_role;

GRANT SELECT        ON public.schedule_generation_links TO authenticated;
GRANT SELECT, INSERT ON public.schedule_generation_links TO service_role;

-- ── FUNCTION: supersede_schedule_generation ───────────────────────────────────
-- Creates a new schedule generation record superseding the current one.
-- Atomically:
--   1. Looks up the current generation for (schedule_type, source_id)
--   2. Marks it as superseded (is_current=false, superseded_at=now())
--   3. Creates new generation record (generation_number = old + 1, is_current=true)
--   4. Links old → new in schedule_generation_links
--   5. Returns new generation id
--
-- If no generation exists yet, creates generation_number=1 as a fresh record.
-- p_lines_count and p_total_amount describe the NEW schedule contents.

CREATE OR REPLACE FUNCTION public.supersede_schedule_generation(
  p_org_id         uuid,
  p_schedule_type  public.schedule_generation_type,
  p_source_id      uuid,
  p_lines_count    int   DEFAULT 0,
  p_total_amount   numeric(14,2) DEFAULT 0,
  p_reason         text  DEFAULT NULL,
  p_actor_id       uuid  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_gen_id    uuid;
  v_current_gen_num   int  := 0;
  v_new_gen_id        uuid;
  v_new_gen_num       int;
BEGIN
  -- Find the current generation if it exists
  SELECT id, generation_number
  INTO   v_current_gen_id, v_current_gen_num
  FROM   public.schedule_generations
  WHERE  schedule_type    = p_schedule_type
    AND  source_id        = p_source_id
    AND  organization_id  = p_org_id
    AND  is_current       = true
  FOR UPDATE;

  v_new_gen_num := v_current_gen_num + 1;

  -- If there's an existing current generation, supersede it
  IF v_current_gen_id IS NOT NULL THEN
    -- Create new generation first (need id for superseded_by)
    INSERT INTO public.schedule_generations(
      organization_id, schedule_type, source_id, generation_number,
      lines_count, total_amount, is_current, reason, created_by
    )
    VALUES (
      p_org_id, p_schedule_type, p_source_id, v_new_gen_num,
      p_lines_count, p_total_amount, true, p_reason, p_actor_id
    )
    RETURNING id INTO v_new_gen_id;

    -- Mark old as superseded
    UPDATE public.schedule_generations SET
      is_current    = false,
      superseded_at = now(),
      superseded_by = v_new_gen_id
    WHERE id = v_current_gen_id;

    -- Create ancestry link
    INSERT INTO public.schedule_generation_links(
      parent_generation_id, child_generation_id, link_reason
    )
    VALUES (v_current_gen_id, v_new_gen_id, p_reason);

  ELSE
    -- First generation for this source
    INSERT INTO public.schedule_generations(
      organization_id, schedule_type, source_id, generation_number,
      lines_count, total_amount, is_current, reason, created_by
    )
    VALUES (
      p_org_id, p_schedule_type, p_source_id, 1,
      p_lines_count, p_total_amount, true, p_reason, p_actor_id
    )
    RETURNING id INTO v_new_gen_id;
  END IF;

  RETURN v_new_gen_id;
END;
$$;

COMMENT ON FUNCTION public.supersede_schedule_generation(uuid, public.schedule_generation_type, uuid, int, numeric, text, uuid) IS
  'Creates a new schedule generation record, supersedes the previous one, and links them. '
  'Returns new generation id. If no prior generation exists, creates generation_number=1. '
  'NEVER deletes prior generations — full ancestry chain preserved for replay determinism.';

GRANT EXECUTE ON FUNCTION public.supersede_schedule_generation(uuid, public.schedule_generation_type, uuid, int, numeric, text, uuid) TO service_role;

-- ── View: v_schedule_lineage ──────────────────────────────────────────────────

CREATE VIEW public.v_schedule_lineage
WITH (security_invoker = true)
AS
SELECT
  sg.id,
  sg.organization_id,
  sg.schedule_type,
  sg.source_id,
  sg.generation_number,
  sg.lines_count,
  sg.total_amount,
  sg.is_current,
  sg.superseded_at,
  sg.reason,
  sg.created_at,
  -- Parent generation info
  parent.id                AS parent_generation_id,
  parent.generation_number AS parent_generation_number,
  parent.created_at        AS parent_created_at,
  -- Depth in ancestry chain (1 = root)
  (
    SELECT COUNT(*)
    FROM public.schedule_generation_links l2
    JOIN public.schedule_generations sg2 ON sg2.id = l2.parent_generation_id
    WHERE l2.child_generation_id = sg.id
  ) + 1                    AS ancestry_depth
FROM public.schedule_generations sg
LEFT JOIN public.schedule_generation_links sgl
  ON sgl.child_generation_id = sg.id
LEFT JOIN public.schedule_generations parent
  ON parent.id = sgl.parent_generation_id;

COMMENT ON VIEW public.v_schedule_lineage IS
  'Schedule generation ancestry view. Shows each generation with its parent and depth. '
  'security_invoker = true — filtered by caller permissions.';

GRANT SELECT ON public.v_schedule_lineage TO authenticated, service_role;
