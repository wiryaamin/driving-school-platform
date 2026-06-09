-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260605000004_phase4g_deferred_revenue.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4G — Time-Based Deferred Revenue Release Schedules
--
-- Extends Phase 4D event-driven revenue recognition with a parallel
-- time-based (periodic) release mechanism for non-lesson deferred revenue.
-- Both engines write to the same journal (post_journal_entry), but:
--   Phase 4D: event-driven (DR 2970 / CR 3041 per lesson completion)
--   Phase 4G: time-based  (DR 2970 / CR revenue per calendar month)
--
-- Tables:
--   periodic_deferred_schedules — header per time-based deferral schedule
--   periodic_deferred_lines     — predetermined period release lines (immutable once posted)
--
-- SECURITY DEFINER functions:
--   create_periodic_deferred_schedule(...)  — creates schedule + predetermined lines
--   post_periodic_deferred_release(...)     — posts one period's release
--   validate_deferred_release_integrity(...)— checks released = actual journal movements
--
-- View:
--   v_periodic_deferred_status — schedule progress with remaining balance
--
-- Accounting pattern:
--   At subscription billing:   DR 1510 / CR 2970 (deferred revenue, via existing invoice flow)
--   Monthly release:            DR 2970 Förutbetalda intäkter / CR revenue_account
--   Integrity check:            SUM(is_posted release lines) ≈ debit movement on 2970
--
-- Deferred release balance invariant:
--   SUM(released_amount) = SUM(release_amount WHERE is_posted)
--   total_amount - released_amount = remaining balance on deferral_account
--
-- Voucher series 'P' (Periodisering).
--
-- Dependencies:
--   20260605000003_phase4g_accrual_schedules.sql — accrual RLS pattern
--   20260602000002_phase4d_posting_engine.sql    — post_journal_entry()
--   20260602000001_phase4d_ledger_core.sql       — journal_entries, account_balances
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Periodic Deferred Revenue Schedules ───────────────────────────

CREATE TABLE public.periodic_deferred_schedules (
  id                   uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid          NOT NULL REFERENCES public.organizations(id)    ON DELETE RESTRICT,
  financial_period_id  uuid                   REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  source_type          text          NOT NULL, -- e.g. 'invoice', 'student_package', 'subscription'
  source_id            uuid          NOT NULL,
  description          text          NOT NULL,
  total_amount         numeric(14,2) NOT NULL CHECK (total_amount > 0),
  released_amount      numeric(14,2) NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
  release_months       int           NOT NULL CHECK (release_months > 0),
  months_released      int           NOT NULL DEFAULT 0 CHECK (months_released >= 0),
  start_date           date          NOT NULL,
  deferral_account     text          NOT NULL DEFAULT '2970',
  recognition_account  text          NOT NULL DEFAULT '3041',
  is_fully_released    boolean       NOT NULL DEFAULT false,
  notes                text,
  metadata             jsonb         NOT NULL DEFAULT '{}',
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  created_by           uuid                   REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           uuid                   REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT pds_released_lte_total  CHECK (released_amount <= total_amount + 0.02),
  CONSTRAINT pds_months_lte_release  CHECK (months_released <= release_months)
);

COMMENT ON TABLE public.periodic_deferred_schedules IS
  'Time-based deferred revenue release schedule headers. '
  'Parallel to Phase 4D event-driven recognition — this handles calendar-based releases. '
  'deferral_account: balance-sheet account holding deferred amount (default 2970). '
  'recognition_account: P&L account to credit on each release (default 3041).';
COMMENT ON COLUMN public.periodic_deferred_schedules.source_type IS
  'Type of source record creating the deferral (invoice, student_package, subscription).';

CREATE TRIGGER set_periodic_deferred_schedules_updated_at
  BEFORE UPDATE ON public.periodic_deferred_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Section 2: Periodic Deferred Release Lines ───────────────────────────────
-- Predetermined release entries. One row per calendar month.
-- Immutable once is_posted = true.

CREATE TABLE public.periodic_deferred_lines (
  id                    uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id       uuid          NOT NULL REFERENCES public.organizations(id)             ON DELETE RESTRICT,
  schedule_id           uuid          NOT NULL REFERENCES public.periodic_deferred_schedules(id) ON DELETE RESTRICT,
  period_number         int           NOT NULL CHECK (period_number >= 1),
  release_date          date          NOT NULL,
  release_amount        numeric(14,2) NOT NULL CHECK (release_amount > 0),
  is_posted             boolean       NOT NULL DEFAULT false,
  posted_at             timestamptz,
  journal_entry_id      uuid                   REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  created_at            timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT pdl_schedule_period_unique UNIQUE (schedule_id, period_number)
);

COMMENT ON TABLE public.periodic_deferred_lines IS
  'Predetermined period release lines for time-based deferred revenue. '
  'Once is_posted=true, row is immutable (trigger). '
  'journal_entry_id references the posted DR deferral_account / CR recognition_account entry.';

CREATE OR REPLACE FUNCTION public.prevent_posted_deferred_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_posted THEN
    RAISE EXCEPTION
      'DEFERRED_LINE_IMMUTABLE: posted deferred revenue release lines cannot be modified. '
      'Create a reversal journal entry to correct a posted release.'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER periodic_deferred_lines_immutability
  BEFORE UPDATE OR DELETE ON public.periodic_deferred_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_deferred_line_mutation();

-- RLS
ALTER TABLE public.periodic_deferred_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periodic_deferred_lines      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pds_org_read"
  ON public.periodic_deferred_schedules FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:accruals:read')
  );

CREATE POLICY "pdl_org_read"
  ON public.periodic_deferred_lines FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:accruals:read')
  );

GRANT SELECT                 ON public.periodic_deferred_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.periodic_deferred_schedules TO service_role;
GRANT SELECT                 ON public.periodic_deferred_lines      TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.periodic_deferred_lines      TO service_role;

-- ── FUNCTION: create_periodic_deferred_schedule ──────────────────────────────
-- Creates a time-based deferred revenue release schedule with all
-- predetermined release lines. Per-period amount = ROUND(total / months, 2).
-- Last period absorbs rounding so SUM(release_amount) = total_amount exactly.

CREATE OR REPLACE FUNCTION public.create_periodic_deferred_schedule(
  p_org_id             uuid,
  p_period_id          uuid,
  p_source_type        text,
  p_source_id          uuid,
  p_description        text,
  p_total_amount       numeric(14,2),
  p_start_date         date,
  p_release_months     int,
  p_deferral_account   text    DEFAULT '2970',
  p_recognition_account text   DEFAULT '3041',
  p_notes              text    DEFAULT NULL,
  p_actor_id           uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule_id  uuid;
  v_per_period   numeric(14,2);
  v_remainder    numeric(14,2);
  v_release_date date;
  i              int;
BEGIN
  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'DEFERRED_INVALID_AMOUNT: total_amount must be positive'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_release_months <= 0 THEN
    RAISE EXCEPTION 'DEFERRED_INVALID_MONTHS: release_months must be positive'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.periodic_deferred_schedules
    (organization_id, financial_period_id, source_type, source_id, description, total_amount,
     release_months, start_date, deferral_account, recognition_account, notes, created_by)
  VALUES
    (p_org_id, p_period_id, p_source_type, p_source_id, p_description, p_total_amount,
     p_release_months, p_start_date, p_deferral_account, p_recognition_account, p_notes, p_actor_id)
  RETURNING id INTO v_schedule_id;

  v_per_period   := ROUND(p_total_amount / p_release_months, 2);
  v_remainder    := p_total_amount - (v_per_period * p_release_months);
  v_release_date := date_trunc('month', p_start_date)::date;

  FOR i IN 1..p_release_months LOOP
    INSERT INTO public.periodic_deferred_lines
      (organization_id, schedule_id, period_number, release_date, release_amount)
    VALUES
      (p_org_id, v_schedule_id, i, v_release_date,
       CASE WHEN i = p_release_months
            THEN v_per_period + v_remainder
            ELSE v_per_period
       END);
    v_release_date := (v_release_date + interval '1 month')::date;
  END LOOP;

  RETURN v_schedule_id;
END;
$$;

COMMENT ON FUNCTION public.create_periodic_deferred_schedule(uuid,uuid,text,uuid,text,numeric,date,int,text,text,text,uuid) IS
  'Creates a time-based deferred revenue schedule with all predetermined release lines. '
  'Last-period rounding absorbed so SUM(release_amount) = total_amount. '
  'Does not post any journal entry (the initial deferral is booked by the invoice flow).';

GRANT EXECUTE ON FUNCTION public.create_periodic_deferred_schedule(uuid,uuid,text,uuid,text,numeric,date,int,text,text,text,uuid) TO service_role;

-- ── FUNCTION: post_periodic_deferred_release ─────────────────────────────────
-- Posts the next pending release line for a periodic deferred revenue schedule.
-- Journal: DR deferral_account / CR recognition_account.

CREATE OR REPLACE FUNCTION public.post_periodic_deferred_release(
  p_schedule_id uuid,
  p_period_id   uuid,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule  public.periodic_deferred_schedules%ROWTYPE;
  v_line      public.periodic_deferred_lines%ROWTYPE;
  v_entry_id  uuid;
  v_lines     jsonb;
BEGIN
  SELECT * INTO v_schedule FROM public.periodic_deferred_schedules WHERE id = p_schedule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEFERRED_SCHEDULE_NOT_FOUND: % does not exist', p_schedule_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_schedule.is_fully_released THEN
    RAISE EXCEPTION 'DEFERRED_FULLY_RELEASED: schedule % is already fully released', p_schedule_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_line
  FROM   public.periodic_deferred_lines
  WHERE  schedule_id = p_schedule_id
    AND  is_posted   = false
  ORDER  BY period_number ASC
  LIMIT  1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'NO_DEFERRED_RELEASE_DUE: no unposted release lines for schedule %', p_schedule_id
      USING ERRCODE = 'P0001';
  END IF;

  -- DR deferral_account / CR recognition_account
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_schedule.deferral_account,
      'debit_amount',  v_line.release_amount,
      'credit_amount', 0,
      'description',
        'Intäktsavräkning: ' || v_schedule.description
        || ' (' || v_line.period_number || '/' || v_schedule.release_months || ')'
    ),
    jsonb_build_object(
      'account_code',  v_schedule.recognition_account,
      'debit_amount',  0,
      'credit_amount', v_line.release_amount,
      'description',
        'Intäktsavräkning: ' || v_schedule.description
        || ' (' || v_line.period_number || '/' || v_schedule.release_months || ')'
    )
  );

  v_entry_id := public.post_journal_entry(
    v_schedule.organization_id,
    p_period_id,
    'standard'::public.journal_entry_type,
    v_line.release_date,
    'Intäktsavräkning: ' || v_schedule.description
      || ' period ' || v_line.period_number || '/' || v_schedule.release_months,
    v_lines,
    'DeferredRevenue.Released',
    'periodic_deferred_schedule',
    p_schedule_id,
    'P',
    NULL, NULL,
    p_actor_id
  );

  UPDATE public.periodic_deferred_lines
  SET is_posted = true, posted_at = now(), journal_entry_id = v_entry_id
  WHERE id = v_line.id;

  UPDATE public.periodic_deferred_schedules
  SET released_amount    = released_amount + v_line.release_amount,
      months_released    = months_released + 1,
      is_fully_released  = ((months_released + 1) >= release_months),
      updated_by         = p_actor_id,
      updated_at         = now()
  WHERE id = p_schedule_id;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_periodic_deferred_release(uuid, uuid, uuid) IS
  'Posts the next pending release line for a periodic deferred revenue schedule. '
  'Journal: DR deferral_account / CR recognition_account. '
  'Marks schedule is_fully_released when all lines posted.';

GRANT EXECUTE ON FUNCTION public.post_periodic_deferred_release(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: validate_deferred_release_integrity ────────────────────────────
-- Validates that released amounts on periodic_deferred_schedules match the
-- actual debit movements on deferral_account in journal_lines for the period.
-- Returns a JSONB integrity report.

CREATE OR REPLACE FUNCTION public.validate_deferred_release_integrity(
  p_org_id    uuid,
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule_released  numeric(14,2) := 0;
  v_journal_debits     numeric(14,2) := 0;
  v_diff               numeric(14,2);
  v_result             jsonb;
  v_accounts           text[];
  v_account            text;
BEGIN
  -- Sum released amounts from periodic_deferred_schedules for this org/period
  SELECT COALESCE(SUM(pdl.release_amount), 0)
  INTO   v_schedule_released
  FROM   public.periodic_deferred_lines pdl
  JOIN   public.periodic_deferred_schedules pds ON pds.id = pdl.schedule_id
  JOIN   public.journal_entries je              ON je.id  = pdl.journal_entry_id
  WHERE  pds.organization_id    = p_org_id
    AND  je.financial_period_id = p_period_id
    AND  pdl.is_posted          = true;

  -- Collect distinct deferral_accounts used by schedules
  SELECT ARRAY_AGG(DISTINCT deferral_account)
  INTO   v_accounts
  FROM   public.periodic_deferred_schedules
  WHERE  organization_id = p_org_id;

  -- Sum debit movements on deferral accounts from journal_lines in this period
  IF v_accounts IS NOT NULL AND array_length(v_accounts, 1) > 0 THEN
    SELECT COALESCE(SUM(jl.debit_amount), 0)
    INTO   v_journal_debits
    FROM   public.journal_lines jl
    JOIN   public.journal_entries je ON je.id = jl.entry_id
    WHERE  je.organization_id    = p_org_id
      AND  je.financial_period_id = p_period_id
      AND  je.status              = 'posted'
      AND  je.source_event_type   = 'DeferredRevenue.Released'
      AND  jl.account_code        = ANY(v_accounts)
      AND  jl.debit_amount        > 0;
  END IF;

  v_diff := ABS(v_schedule_released - v_journal_debits);

  v_result := jsonb_build_object(
    'status',             CASE WHEN v_diff < 0.02 THEN 'valid' ELSE 'discrepancy' END,
    'schedule_released',  v_schedule_released,
    'journal_debits',     v_journal_debits,
    'difference',         v_diff,
    'period_id',          p_period_id,
    'validated_at',       now()
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.validate_deferred_release_integrity(uuid, uuid) IS
  'Validates that periodic_deferred_lines posted amounts match actual journal_lines '
  'debit movements on deferral accounts for the period. '
  'Returns JSONB {status, schedule_released, journal_debits, difference}.';

GRANT EXECUTE ON FUNCTION public.validate_deferred_release_integrity(uuid, uuid) TO service_role;

-- ── View ───────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_periodic_deferred_status
WITH (security_invoker = true)
AS
SELECT
  pds.id,
  pds.organization_id,
  pds.source_type,
  pds.source_id,
  pds.description,
  pds.total_amount,
  pds.released_amount,
  (pds.total_amount - pds.released_amount)             AS remaining_amount,
  pds.release_months,
  pds.months_released,
  (pds.release_months - pds.months_released)            AS months_remaining,
  pds.start_date,
  pds.deferral_account,
  pds.recognition_account,
  pds.is_fully_released,
  MIN(pdl.release_date) FILTER (WHERE NOT pdl.is_posted) AS next_release_date,
  COUNT(pdl.id) FILTER (WHERE NOT pdl.is_posted)         AS pending_lines,
  pds.created_at
FROM  public.periodic_deferred_schedules pds
LEFT  JOIN public.periodic_deferred_lines pdl ON pdl.schedule_id = pds.id
GROUP BY pds.id;

COMMENT ON VIEW public.v_periodic_deferred_status IS
  'Periodic deferred revenue schedule progress. '
  'Shows released vs remaining amount and next release date. '
  'security_invoker = true.';

GRANT SELECT ON public.v_periodic_deferred_status TO authenticated, service_role;
