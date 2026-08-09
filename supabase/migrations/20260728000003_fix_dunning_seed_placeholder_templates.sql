-- ════════════════════════════════════════════════════════════════════════════
-- Fix: seed_swedish_dunning_schedule() stores non-template strings in
-- message_template
--
-- dunning_schedule_stages.subject_template/message_template are free-text,
-- {{mustache}}-style content authored by an admin via DunningPage.tsx's
-- "Lägg till steg" dialog (placeholders shown there: {{invoice_number}},
-- {{amount}}, {{due_date}}, {{student_name}}, {{school_name}}) — this is the
-- actual reminder copy a customer receives, per event-worker's
-- handleInvoiceReminderSent, which as of this same deployment now reads these
-- fields back and sends them verbatim (rendered through applyTemplateVars)
-- instead of the generic 'invoice_overdue' notification template whenever a
-- stage has customized its copy.
--
-- seed_swedish_dunning_schedule() (20260722000003) was fixed for a column
-- schema mismatch but never updated for this semantic: it stores literal
-- strings 'invoice_reminder_sv' / 'invoice_final_reminder_sv' /
-- 'invoice_legal_warning_sv' in message_template — leftover key-style values
-- from before the free-text redesign, not real message copy. Until now this
-- was harmless dead data (nothing read it). With the override wired up, every
-- org using the default seeded schedule without ever customizing a stage via
-- the UI would start sending that literal placeholder string as the email
-- body instead of a real reminder — a regression this migration prevents by
-- restoring the correct "not customized" state (NULL), so those orgs keep
-- getting the existing generic template exactly as before, and the override
-- only ever fires for a stage an admin has genuinely authored.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Backfill: clear the placeholder-style values on any org already seeded ──

UPDATE dunning_schedule_stages
SET message_template = NULL
WHERE message_template IN ('invoice_reminder_sv', 'invoice_final_reminder_sv', 'invoice_legal_warning_sv');

-- ── 2. Fix the seed function so future seeds don't reintroduce this ───────────

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
  -- message_template left NULL: uses the platform's generic 'invoice_overdue'
  -- notification template until an admin authors custom copy for this stage.
  INSERT INTO dunning_schedule_stages
    (schedule_id, stage_number, days_overdue, action_type, late_fee_amount)
  VALUES
    (v_schedule_id, 1, 14, 'email', 60.00);

  -- Stage 2: Betalningspåminnelse (28 days, both email+letter, 60 SEK)
  INSERT INTO dunning_schedule_stages
    (schedule_id, stage_number, days_overdue, action_type, late_fee_amount)
  VALUES
    (v_schedule_id, 2, 28, 'both', 60.00);

  -- Stage 3: Inkassovarning (45 days, legal action notification)
  INSERT INTO dunning_schedule_stages
    (schedule_id, stage_number, days_overdue, action_type, late_fee_amount, is_final_stage)
  VALUES
    (v_schedule_id, 3, 45, 'legal', 0.00, true);

  RETURN v_schedule_id;
END;
$function$
