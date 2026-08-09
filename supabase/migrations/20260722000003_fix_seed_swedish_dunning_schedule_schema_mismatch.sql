-- Fix: seed_swedish_dunning_schedule() was written against a column set that no
-- longer matches the live dunning_schedule_stages table (days_after_due →
-- days_overdue, reminder_fee_amount → late_fee_amount, email_template →
-- message_template, and a nonexistent is_active column). Every invocation has
-- failed since the stages table was redesigned — discovered via real end-to-end
-- testing of the /swedish-settings/seed-dunning endpoint. Stage 3 (legal warning)
-- is also marked is_final_stage, matching its already-stated intent in the
-- original comment ("Stage 3: Inkassovarning... legal action notification").

CREATE OR REPLACE FUNCTION public.seed_swedish_dunning_schedule(p_org_id uuid, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_schedule_id  uuid;
  v_exists       boolean;
BEGIN
  -- Only seed if no default schedule exists
  SELECT EXISTS(
    SELECT 1 FROM dunning_schedules
    WHERE organization_id = p_org_id AND is_default = true
  ) INTO v_exists;

  IF v_exists THEN
    SELECT id INTO v_schedule_id
    FROM dunning_schedules
    WHERE organization_id = p_org_id AND is_default = true
    LIMIT 1;
    RETURN v_schedule_id;
  END IF;

  INSERT INTO dunning_schedules (
    organization_id,
    name,
    description,
    is_default,
    is_active,
    created_by
  )
  VALUES (
    p_org_id,
    'Svensk standardpåminnelse',
    '3-stegs påminnelseprocess enligt Inkassolagen: påminnelse, krav, inkasso',
    true,
    true,
    p_actor_id
  )
  RETURNING id INTO v_schedule_id;

  -- Stage 1: Påminnelse (14 days, email, 60 SEK fee — minimum by law)
  INSERT INTO dunning_schedule_stages
    (schedule_id, stage_number, days_overdue, action_type, late_fee_amount, message_template)
  VALUES
    (v_schedule_id, 1, 14, 'email', 60.00, 'invoice_reminder_sv');

  -- Stage 2: Betalningspåminnelse (28 days, both email+letter, 60 SEK)
  INSERT INTO dunning_schedule_stages
    (schedule_id, stage_number, days_overdue, action_type, late_fee_amount, message_template)
  VALUES
    (v_schedule_id, 2, 28, 'both', 60.00, 'invoice_final_reminder_sv');

  -- Stage 3: Inkassovarning (45 days, legal action notification)
  INSERT INTO dunning_schedule_stages
    (schedule_id, stage_number, days_overdue, action_type, late_fee_amount, message_template, is_final_stage)
  VALUES
    (v_schedule_id, 3, 45, 'legal', 0.00, 'invoice_legal_warning_sv', true);

  RETURN v_schedule_id;
END;
$function$
