-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260602000004_phase4d_revenue_recognition.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4D — Deferred Revenue and Recognition Engine
--
-- Implements the accrual-basis deferred revenue lifecycle for pre-paid packages:
--
--   deferred_revenue_schedules  — per-package deferred revenue state tracker
--   revenue_recognition_events  — individual recognition events (per lesson)
--
--   post_deferred_revenue_entry(p_invoice_id, p_actor_id)
--     → Updated version of post_invoice_journal_entry that also creates/updates
--       the deferred_revenue_schedule for package invoices.
--       Idempotent: returns existing schedule_id if already created.
--
--   recognize_lesson_revenue(p_booking_id, p_actor_id)
--     → Recognizes earned revenue when a lesson is completed (credit consumed).
--       Finds the deferred revenue schedule via booking → credit_ledger → package.
--       Posts: DR 2970 Förutbetalda intäkter / CR 3041 Körlektioner.
--       Creates a revenue_recognition_event record.
--       Idempotent: skips if this booking has already been recognized.
--
--   bulk_recognize_revenue(p_org_id, p_as_of_date, p_actor_id)
--     → Batch recognition: processes all unrecognized consumed credits up to p_as_of_date.
--       Returns count of entries recognized.
--
-- Swedish accounting treatment:
--   At invoice issuance:  DR 1510 / CR 2970 (deferred) + CR 2610 (VAT)
--   At lesson completion: DR 2970 / CR 3041 (earned revenue)
--   Net result at completion: DR 1510 / CR 3041 / CR 2610 (same as immediate recognition)
--
-- Dependencies:
--   20260602000001_phase4d_ledger_core.sql
--   20260602000002_phase4d_posting_engine.sql
--   20260530000001_phase4a_commercial_core.sql  — student_packages, credit_ledger
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Tables ─────────────────────────────────────────────────────────

-- deferred_revenue_schedules
-- One record per package invoice. Tracks total deferred amount,
-- recognized portion, and remaining unearned balance.

CREATE TABLE public.deferred_revenue_schedules (
  id                      uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id         uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id              uuid          NOT NULL UNIQUE REFERENCES public.invoices(id) ON DELETE RESTRICT,
  student_package_id      uuid          NOT NULL REFERENCES public.student_packages(id) ON DELETE RESTRICT,
  total_lessons           int           NOT NULL CHECK (total_lessons > 0),
  recognized_lessons      int           NOT NULL DEFAULT 0 CHECK (recognized_lessons >= 0),
  total_deferred_net      numeric(12,2) NOT NULL CHECK (total_deferred_net >= 0),
  recognized_amount_net   numeric(12,2) NOT NULL DEFAULT 0 CHECK (recognized_amount_net >= 0),
  per_lesson_amount_net   numeric(12,2) NOT NULL CHECK (per_lesson_amount_net > 0),
  deferral_account        text          NOT NULL DEFAULT '2970',
  recognition_account     text          NOT NULL DEFAULT '3041',
  initial_journal_id      uuid          REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  is_fully_recognized     boolean       NOT NULL DEFAULT false,
  notes                   text,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  created_by              uuid          REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT drs_recognized_lessons_check CHECK (recognized_lessons     <= total_lessons),
  CONSTRAINT drs_recognized_amount_check  CHECK (recognized_amount_net  <= total_deferred_net + 0.01)
);

COMMENT ON TABLE public.deferred_revenue_schedules IS
  'Per-package deferred revenue tracker. '
  'Captures how much pre-paid revenue remains unearned vs recognized. '
  'updated by recognize_lesson_revenue() per lesson completion.';
COMMENT ON COLUMN public.deferred_revenue_schedules.per_lesson_amount_net IS
  'Net revenue per lesson = total_deferred_net / total_lessons. Set at creation.';
COMMENT ON COLUMN public.deferred_revenue_schedules.deferral_account IS
  'BAS account for unearned revenue (default: 2970 Förutbetalda intäkter).';
COMMENT ON COLUMN public.deferred_revenue_schedules.recognition_account IS
  'BAS account for earned revenue (default: 3041 Körlektioner).';

CREATE TRIGGER set_deferred_revenue_schedules_updated_at
  BEFORE UPDATE ON public.deferred_revenue_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- revenue_recognition_events
-- One record per lesson recognition event. Provides full audit trail
-- of when each portion of deferred revenue was earned.

CREATE TABLE public.revenue_recognition_events (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  schedule_id         uuid          NOT NULL REFERENCES public.deferred_revenue_schedules(id) ON DELETE RESTRICT,
  booking_id          uuid          REFERENCES public.lesson_bookings(id) ON DELETE RESTRICT,
  recognition_date    date          NOT NULL,
  lessons_recognized  int           NOT NULL DEFAULT 1 CHECK (lessons_recognized > 0),
  amount_net          numeric(12,2) NOT NULL CHECK (amount_net > 0),
  journal_entry_id    uuid          REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  notes               text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  created_by          uuid          REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.revenue_recognition_events IS
  'Audit log of individual deferred revenue recognition events. '
  'One row per lesson completion that triggers revenue recognition. '
  'Links booking → schedule → journal entry for full traceability.';

-- ── Section 2: RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.deferred_revenue_schedules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_recognition_events  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drs_org_read"
  ON public.deferred_revenue_schedules FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:revenue:manage')
  );

CREATE POLICY "rre_org_read"
  ON public.revenue_recognition_events FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:revenue:manage')
  );

-- ── Section 3: Grants ─────────────────────────────────────────────────────────

GRANT SELECT                  ON public.deferred_revenue_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE  ON public.deferred_revenue_schedules TO service_role;

GRANT SELECT                  ON public.revenue_recognition_events TO authenticated;
GRANT SELECT, INSERT          ON public.revenue_recognition_events TO service_role;

-- ── Section 4: post_deferred_revenue_entry ────────────────────────────────────
-- Extended version of post_invoice_journal_entry that also manages the
-- deferred_revenue_schedule for package invoices.
-- For non-package invoices, behaves identically to post_invoice_journal_entry.
-- Returns the journal entry id (same as post_invoice_journal_entry).

CREATE OR REPLACE FUNCTION public.post_deferred_revenue_entry(
  p_invoice_id uuid,
  p_actor_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice     invoices%ROWTYPE;
  v_package     student_packages%ROWTYPE;
  v_entry_id    uuid;
  v_schedule_id uuid;
  v_per_lesson  numeric(12,2);
BEGIN
  -- 1. Fetch invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: invoice % not found', p_invoice_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Post the journal entry (idempotent)
  v_entry_id := post_invoice_journal_entry(p_invoice_id, p_actor_id);

  -- 3. If this is a package invoice, create/update the deferred revenue schedule
  IF v_invoice.student_package_id IS NOT NULL THEN

    -- Idempotency check for schedule
    SELECT id INTO v_schedule_id
    FROM   deferred_revenue_schedules
    WHERE  invoice_id = p_invoice_id;

    IF NOT FOUND THEN
      -- Fetch package details
      SELECT * INTO v_package
      FROM   student_packages
      WHERE  id = v_invoice.student_package_id;

      IF NOT FOUND THEN
        RETURN v_entry_id; -- Package no longer exists; skip schedule creation
      END IF;

      v_per_lesson := ROUND(
        v_invoice.subtotal_amount / GREATEST(v_package.quantity_granted, 1),
        2
      );

      INSERT INTO deferred_revenue_schedules (
        organization_id,
        invoice_id,
        student_package_id,
        total_lessons,
        recognized_lessons,
        total_deferred_net,
        recognized_amount_net,
        per_lesson_amount_net,
        deferral_account,
        recognition_account,
        initial_journal_id,
        created_by
      ) VALUES (
        v_invoice.organization_id,
        p_invoice_id,
        v_invoice.student_package_id,
        v_package.quantity_granted,
        0,
        v_invoice.subtotal_amount,
        0,
        v_per_lesson,
        '2970',
        '3041',
        v_entry_id,
        p_actor_id
      );
    END IF;

  END IF;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_deferred_revenue_entry(uuid, uuid) IS
  'Posts invoice journal entry + creates deferred_revenue_schedule for package invoices. '
  'For direct invoices (no package): identical to post_invoice_journal_entry(). '
  'Idempotent: returns existing entry_id and skips schedule creation if already done.';

GRANT EXECUTE ON FUNCTION public.post_deferred_revenue_entry(uuid, uuid)
  TO authenticated, service_role;

-- ── Section 5: recognize_lesson_revenue ──────────────────────────────────────
-- Recognizes earned revenue when a lesson booking is completed (credit consumed).
--
-- Posts: DR 2970 Förutbetalda intäkter / CR 3041 Körlektioner
--
-- Path: booking_id → credit_ledger (consume entry) → grant_entry_id → student_package_id
--                  → deferred_revenue_schedules
--
-- Idempotent: skips if this booking_id already has a recognition event.

CREATE OR REPLACE FUNCTION public.recognize_lesson_revenue(
  p_booking_id uuid,
  p_actor_id   uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id          uuid;
  v_package_id      uuid;
  v_schedule        deferred_revenue_schedules%ROWTYPE;
  v_entry_id        uuid;
  v_period_id       uuid;
  v_lines           jsonb;
  v_recog_date      date;
BEGIN
  -- 1. Idempotency: check if already recognized for this booking
  IF EXISTS (
    SELECT 1 FROM revenue_recognition_events WHERE booking_id = p_booking_id
  ) THEN
    SELECT journal_entry_id INTO v_entry_id
    FROM   revenue_recognition_events WHERE booking_id = p_booking_id LIMIT 1;
    RETURN v_entry_id;
  END IF;

  -- 2. Find student_package_id via credit_ledger chain
  --    consume_entry.booking_id → grant_entry.student_package_id
  SELECT
    g.organization_id,
    g.student_package_id
  INTO v_org_id, v_package_id
  FROM   credit_ledger consume_e
  JOIN   credit_ledger g ON g.id = consume_e.grant_entry_id
  WHERE  consume_e.booking_id  = p_booking_id
    AND  consume_e.entry_type  = 'consume'
    AND  g.student_package_id  IS NOT NULL
  LIMIT 1;

  IF v_package_id IS NULL THEN
    -- No package credit consumed; no deferred revenue to recognize
    RETURN NULL;
  END IF;

  -- 3. Find deferred revenue schedule
  SELECT * INTO v_schedule
  FROM   deferred_revenue_schedules
  WHERE  student_package_id = v_package_id
    AND  organization_id    = v_org_id;

  IF NOT FOUND THEN
    -- No deferred schedule exists for this package (may have been posted directly)
    RETURN NULL;
  END IF;

  IF v_schedule.is_fully_recognized THEN
    RETURN NULL;
  END IF;

  -- 4. Build recognition lines
  v_recog_date := CURRENT_DATE;

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_schedule.deferral_account,
      'debit_amount',  v_schedule.per_lesson_amount_net,
      'credit_amount', 0,
      'description',   'Intäktsavräkning: lektion ' || p_booking_id::text
    ),
    jsonb_build_object(
      'account_code',  v_schedule.recognition_account,
      'debit_amount',  0,
      'credit_amount', v_schedule.per_lesson_amount_net,
      'description',   'Körlektionsintäkt: lektion ' || p_booking_id::text
    )
  );

  -- 5. Resolve period
  v_period_id := find_period_for_date(v_org_id, v_recog_date);

  -- 6. Post recognition journal entry
  v_entry_id := post_journal_entry(
    p_org_id             := v_org_id,
    p_period_id          := v_period_id,
    p_entry_type         := 'standard',
    p_entry_date         := v_recog_date,
    p_description        := 'Revenue recognition: booking ' || p_booking_id::text,
    p_lines              := v_lines,
    p_source_event_type  := 'Revenue.Recognized',
    p_source_entity_type := 'booking',
    p_source_entity_id   := p_booking_id,
    p_actor_id           := p_actor_id
  );

  -- 7. Record recognition event
  INSERT INTO revenue_recognition_events (
    organization_id, schedule_id, booking_id,
    recognition_date, lessons_recognized, amount_net,
    journal_entry_id, created_by
  ) VALUES (
    v_org_id, v_schedule.id, p_booking_id,
    v_recog_date, 1, v_schedule.per_lesson_amount_net,
    v_entry_id, p_actor_id
  );

  -- 8. Update schedule
  UPDATE deferred_revenue_schedules
  SET
    recognized_lessons    = recognized_lessons    + 1,
    recognized_amount_net = recognized_amount_net + v_schedule.per_lesson_amount_net,
    is_fully_recognized   = (recognized_lessons + 1 >= total_lessons)
  WHERE id = v_schedule.id;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.recognize_lesson_revenue(uuid, uuid) IS
  'Recognizes deferred revenue when a lesson booking completes. '
  'DR 2970 Förutbetalda intäkter / CR 3041 Körlektioner. '
  'Links: booking → credit_ledger → student_package → deferred_revenue_schedule. '
  'Idempotent: returns existing entry_id if booking already recognized.';

GRANT EXECUTE ON FUNCTION public.recognize_lesson_revenue(uuid, uuid)
  TO authenticated, service_role;

-- ── Section 6: bulk_recognize_revenue ────────────────────────────────────────
-- Batch recognition: processes all credit_ledger 'consume' entries up to
-- p_as_of_date that don't yet have a recognition event.
-- Returns the count of entries recognized.

CREATE OR REPLACE FUNCTION public.bulk_recognize_revenue(
  p_org_id      uuid,
  p_as_of_date  date DEFAULT CURRENT_DATE,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking   record;
  v_count     int := 0;
  v_result    uuid;
BEGIN
  FOR v_booking IN
    SELECT DISTINCT cl.booking_id
    FROM   credit_ledger cl
    WHERE  cl.organization_id = p_org_id
      AND  cl.entry_type      = 'consume'
      AND  cl.booking_id      IS NOT NULL
      AND  cl.created_at::date <= p_as_of_date
      AND  NOT EXISTS (
        SELECT 1 FROM revenue_recognition_events rre
        WHERE  rre.booking_id = cl.booking_id
      )
    ORDER  BY cl.booking_id
    LIMIT  200
  LOOP
    v_result := recognize_lesson_revenue(v_booking.booking_id, p_actor_id);
    IF v_result IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.bulk_recognize_revenue(uuid, date, uuid) IS
  'Batch revenue recognition: processes up to 200 unrecognized consumed credits '
  'per call. Run periodically by the event-worker or as a period-end step. '
  'Returns count of recognition events created.';

GRANT EXECUTE ON FUNCTION public.bulk_recognize_revenue(uuid, date, uuid)
  TO authenticated, service_role;
