-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260807121500_backfill_enrollment_package_grants.sql
--
-- Direct follow-on to 20260807120000_credit_ledger_consumption_sync.sql.
-- Verifying that fix live surfaced a mirror-image gap: student_package_assignments
-- rows created by the enrollment/checkout conversion flow (supabase/functions/
-- enrollments/index.ts, handleConvert + handleAssignPackage) never wrote a
-- 'grant' entry to credit_ledger — only purchase_package() (the manual "Sälj
-- paket" sale) did. Both handlers now write the grant going forward
-- (grantPackageAssignmentCredit helper added same day).
--
-- This backfills the grant for every already-existing enrollment-sourced
-- assignment, so their credit_balance_cache reads their real granted quantity
-- instead of zero/missing. enrollment_id IS NOT NULL reliably identifies
-- enrollment-sourced assignments: purchase_package() always sets it NULL
-- (see 20260720000006_sync_purchase_package_to_assignments.sql — "Manual
-- direct sale: no enrollment... linkage"), both enrollment code paths always
-- set it to the real enrollment id.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_asgn  RECORD;
  v_count int := 0;
BEGIN
  FOR v_asgn IN
    SELECT spa.id, spa.organization_id, spa.student_id, spa.lesson_category,
           spa.package_quantity, spa.package_name, spa.currency
    FROM   public.student_package_assignments spa
    WHERE  spa.enrollment_id IS NOT NULL
      AND  NOT EXISTS (
        SELECT 1 FROM public.credit_ledger cl
        WHERE cl.reference_type = 'student_package_assignment'
          AND cl.reference_id   = spa.id
          AND cl.entry_type     = 'grant'
      )
  LOOP
    INSERT INTO public.credit_ledger (
      organization_id, student_id, lesson_category,
      entry_type, quantity, currency,
      reference_type, reference_id,
      description
    ) VALUES (
      v_asgn.organization_id, v_asgn.student_id, v_asgn.lesson_category::public.lesson_category,
      'grant', v_asgn.package_quantity, COALESCE(v_asgn.currency, 'SEK'),
      'student_package_assignment', v_asgn.id,
      'Backfill: enrollment package grant not previously reflected in the ledger — ' || v_asgn.package_name
    );
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'credit_ledger enrollment-grant backfill: % assignment(s) corrected', v_count;
END $$;
