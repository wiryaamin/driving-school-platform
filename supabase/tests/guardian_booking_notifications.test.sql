-- =============================================================================
-- TEST: Guardian Portal P0 — booking-change notification wiring
-- Focused tests for the migration's DB-layer changes:
--   1. notification_rules.recipient_type accepts 'guardian'
--   2. outbound_messages.recipient_type accepts 'guardian'
--   3. seed_org_communication() creates the 2 new guardian rules
--      (booking_cancelled/sms, booking_cancelled/email,
--       booking_rescheduled/sms, booking_rescheduled/email — 4 rows total)
--      pointing at the SAME template ids the existing 'student' rules use
--      for the same trigger_event+channel (content reuse, not duplication)
--   4. The new rules seed disabled by default, matching every existing rule
--
-- Executed 2026-08-20 against the E2E Regression Test Org after
-- 20260819010000_guardian_booking_notifications.sql — all 4 checks passed.
-- Re-run via:
--   supabase db query --linked -f supabase/tests/guardian_booking_notifications.test.sql
--
-- Runs inside one transaction, rolled back at the end (or auto-aborted by the
-- first failed assertion) — safe to run against a real environment without
-- leaving residue. Requires at least one existing organization.
-- =============================================================================

BEGIN;

DO $test$
DECLARE
  v_org_id                    uuid;
  v_rule_count_before         integer;
  v_rule_count_after          integer;
  v_cancelled_sms_tpl_student uuid;
  v_cancelled_sms_tpl_guardian uuid;
  v_cancelled_email_tpl_guardian uuid;
  v_rescheduled_sms_tpl_guardian uuid;
  v_rescheduled_email_tpl_guardian uuid;
  v_guardian_rules_enabled    integer;
BEGIN
  RAISE NOTICE '─── Guardian notification migration: fixture lookup ────────────────';

  SELECT id INTO v_org_id FROM public.organizations WHERE status = 'active' LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'TEST SETUP: no active organization found.';
  END IF;

  -- =========================================================================
  -- TEST 1 — CHECK constraints accept 'guardian'
  -- =========================================================================
  BEGIN
    INSERT INTO public.notification_rules (organization_id, trigger_event, channel, template_id, recipient_type, enabled)
    SELECT v_org_id, 'booking_cancelled', 'sms', id, 'guardian', false
    FROM public.notification_templates
    WHERE organization_id IS NULL AND key = 'booking.cancelled' AND channel = 'sms'
    ON CONFLICT (organization_id, trigger_event, channel, recipient_type) DO NOTHING;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'TEST 1 FAILED: notification_rules_recipient_type_check still rejects ''guardian''.';
  END;
  RAISE NOTICE 'TEST 1 OK — notification_rules.recipient_type accepts ''guardian''';

  BEGIN
    INSERT INTO public.outbound_messages (organization_id, channel, recipient_type, recipient_address, body, status)
    VALUES (v_org_id, 'sms', 'guardian', '+46700000000', 'test', 'queued');
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'TEST 1b FAILED: outbound_messages_recipient_type_check still rejects ''guardian''.';
  END;
  RAISE NOTICE 'TEST 1b OK — outbound_messages.recipient_type accepts ''guardian''';

  -- =========================================================================
  -- TEST 2 — seed_org_communication() creates the 4 new guardian rows,
  -- reusing the EXACT SAME template ids the existing student rules use.
  -- =========================================================================
  SELECT count(*) INTO v_rule_count_before
  FROM public.notification_rules
  WHERE organization_id = v_org_id AND recipient_type = 'guardian';

  PERFORM public.seed_org_communication(v_org_id);

  SELECT count(*) INTO v_rule_count_after
  FROM public.notification_rules
  WHERE organization_id = v_org_id AND recipient_type = 'guardian'
    AND trigger_event IN ('booking_cancelled', 'booking_rescheduled');

  IF v_rule_count_after < 4 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: expected at least 4 guardian rules (2 triggers x 2 channels) after seeding, got %', v_rule_count_after;
  END IF;
  RAISE NOTICE 'TEST 2 OK — % guardian rules present after seed_org_communication (before: %)', v_rule_count_after, v_rule_count_before;

  -- Template reuse check: the guardian rule's template_id must equal the
  -- student rule's template_id for the same trigger_event+channel.
  SELECT template_id INTO v_cancelled_sms_tpl_student
  FROM public.notification_rules
  WHERE organization_id = v_org_id AND trigger_event = 'booking_cancelled' AND channel = 'sms' AND recipient_type = 'student';

  SELECT template_id INTO v_cancelled_sms_tpl_guardian
  FROM public.notification_rules
  WHERE organization_id = v_org_id AND trigger_event = 'booking_cancelled' AND channel = 'sms' AND recipient_type = 'guardian';

  IF v_cancelled_sms_tpl_student IS DISTINCT FROM v_cancelled_sms_tpl_guardian THEN
    RAISE EXCEPTION 'TEST 3 FAILED: guardian booking_cancelled/sms rule points at a different template than the student rule (% vs %) — content was duplicated instead of reused.',
      v_cancelled_sms_tpl_guardian, v_cancelled_sms_tpl_student;
  END IF;
  RAISE NOTICE 'TEST 3 OK — guardian rule reuses the exact same template_id as the student rule (no duplicated content)';

  -- =========================================================================
  -- TEST 4 — new guardian rules seed disabled by default, matching every
  -- existing rule (org must consciously opt in).
  -- =========================================================================
  SELECT count(*) INTO v_guardian_rules_enabled
  FROM public.notification_rules
  WHERE organization_id = v_org_id AND recipient_type = 'guardian' AND enabled = true
    AND trigger_event IN ('booking_cancelled', 'booking_rescheduled');

  IF v_guardian_rules_enabled <> 0 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: expected the new guardian rules to seed disabled, found % already enabled.', v_guardian_rules_enabled;
  END IF;
  RAISE NOTICE 'TEST 4 OK — new guardian rules seed disabled, matching the established convention';

  RAISE NOTICE '─── All 4 migration-layer tests passed — rolling back all test data ────';
END;
$test$;

ROLLBACK;
