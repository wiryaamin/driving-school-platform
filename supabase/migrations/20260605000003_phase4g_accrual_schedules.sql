-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260605000003_phase4g_accrual_schedules.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4G — Prepaid Expenses & Accrued Liability Engine
--
-- Implements amendment-based accrual accounting infrastructure:
--   • 2 new enum types: accrual_type, accrual_status
--   • accrual_schedules  — header per prepaid/accrued-liability schedule
--   • accrual_release_lines — predetermined period release lines (immutable once posted)
--
--   SECURITY DEFINER functions:
--   create_accrual_schedule(...)   — creates header + predetermined release lines
--                                    + optional initial booking journal
--   post_accrual_release(...)      — posts one period's release via post_journal_entry()
--   cancel_accrual_schedule(...)   — cancels remaining unposted lines
--
--   View:
--   v_accrual_schedule_status     — schedule status with released/remaining
--
-- Accounting patterns supported:
--
--   Prepaid expense (e.g. annual insurance paid up-front):
--     Initial: DR 1710 Förutbetalda kostnader / CR 1930 Bank
--     Monthly: DR expense_account / CR 1710 Förutbetalda kostnader
--     → release_debit_account  = expense (e.g. '6310')
--       release_credit_account = '1710'
--
--   Accrued liability (e.g. monthly consultant not yet invoiced):
--     Initial: DR expense_account / CR 2900 Upplupna kostnader
--     Release: DR 2900 Upplupna kostnader / CR expense_account (reversal)
--     → release_debit_account  = '2900'
--       release_credit_account = expense_account
--
-- Accrual balance invariant:
--   SUM(released_amount) = SUM(release_amount WHERE is_posted)
--   total_amount - released_amount = remaining balance on balance-sheet account
--
-- Voucher series 'P' (Periodisering) for all accrual release journal entries.
--
-- Dependencies:
--   20260605000001_phase4g_fixed_assets.sql — permissions, BAS accounts
--   20260602000002_phase4d_posting_engine.sql — post_journal_entry()
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Enum Types ────────────────────────────────────────────────────

CREATE TYPE public.accrual_type AS ENUM (
  'prepaid_expense',   -- Asset → expense over time (DR 1710 initially; monthly expense release)
  'accrued_liability', -- Expense accrual → cleared when invoice arrives (DR expense / CR 2900)
  'accrued_revenue',   -- Revenue earned but not yet invoiced (DR 1790 / CR revenue)
  'deferred_cost'      -- Capitalised cost released over a period (DR asset / CR cash)
);

CREATE TYPE public.accrual_status AS ENUM (
  'active',         -- Schedule is running; release lines pending
  'fully_released', -- All release lines posted; total_amount fully released
  'cancelled',      -- Remaining unposted lines cancelled; no further releases
  'amended'         -- A correction schedule supersedes this one
);

-- ── Section 2: Accrual Schedules ─────────────────────────────────────────────
-- One header per accrual or prepaid expense. Tracks the balance-sheet impact
-- account and the target expense/revenue account for periodic releases.

CREATE TABLE public.accrual_schedules (
  id                     uuid                 NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id        uuid                 NOT NULL REFERENCES public.organizations(id)    ON DELETE RESTRICT,
  financial_period_id    uuid                          REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  accrual_type           public.accrual_type  NOT NULL,
  status                 public.accrual_status NOT NULL DEFAULT 'active',
  description            text                 NOT NULL,
  total_amount           numeric(14,2)        NOT NULL CHECK (total_amount > 0),
  released_amount        numeric(14,2)        NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
  release_months         int                  NOT NULL CHECK (release_months > 0),
  months_released        int                  NOT NULL DEFAULT 0 CHECK (months_released >= 0),
  start_date             date                 NOT NULL,
  release_debit_account  text                 NOT NULL,
  release_credit_account text                 NOT NULL,
  initial_entry_id       uuid                          REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  notes                  text,
  metadata               jsonb                NOT NULL DEFAULT '{}',
  created_at             timestamptz          NOT NULL DEFAULT now(),
  updated_at             timestamptz          NOT NULL DEFAULT now(),
  created_by             uuid                          REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by             uuid                          REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT as_released_lte_total     CHECK (released_amount <= total_amount + 0.02),
  CONSTRAINT as_months_lte_release     CHECK (months_released <= release_months)
);

COMMENT ON TABLE public.accrual_schedules IS
  'Prepaid expense and accrued liability schedule headers. '
  'release_debit_account / release_credit_account define each periodic journal entry. '
  'Prepaid: debit=expense, credit=1710. Accrued liability: debit=2900, credit=expense. '
  'total_amount - released_amount = remaining balance-sheet account balance.';
COMMENT ON COLUMN public.accrual_schedules.release_debit_account IS
  'BAS account debited on each periodic release (e.g. expense account or 2900).';
COMMENT ON COLUMN public.accrual_schedules.release_credit_account IS
  'BAS account credited on each periodic release (e.g. 1710 or expense account).';

CREATE TRIGGER set_accrual_schedules_updated_at
  BEFORE UPDATE ON public.accrual_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Section 3: Accrual Release Lines ─────────────────────────────────────────
-- Predetermined release entries within a schedule. One row per period.
-- Once is_posted = true the row is immutable.

CREATE TABLE public.accrual_release_lines (
  id                   uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid          NOT NULL REFERENCES public.organizations(id)       ON DELETE RESTRICT,
  accrual_schedule_id  uuid          NOT NULL REFERENCES public.accrual_schedules(id)   ON DELETE RESTRICT,
  period_number        int           NOT NULL CHECK (period_number >= 1),
  release_date         date          NOT NULL,
  release_amount       numeric(14,2) NOT NULL CHECK (release_amount > 0),
  is_posted            boolean       NOT NULL DEFAULT false,
  is_cancelled         boolean       NOT NULL DEFAULT false,
  posted_at            timestamptz,
  journal_entry_id     uuid                   REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  created_at           timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT arl_schedule_period_unique UNIQUE (accrual_schedule_id, period_number),
  CONSTRAINT arl_not_both_posted_cancelled
    CHECK (NOT (is_posted AND is_cancelled))
);

COMMENT ON TABLE public.accrual_release_lines IS
  'Predetermined period release lines within an accrual schedule. '
  'Once is_posted=true, row is immutable (trigger). '
  'is_cancelled=true marks lines that were not posted before schedule cancellation.';

CREATE OR REPLACE FUNCTION public.prevent_posted_accrual_release_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_posted THEN
    RAISE EXCEPTION
      'ACCRUAL_RELEASE_IMMUTABLE: posted accrual release lines cannot be modified or deleted. '
      'Use cancel_accrual_schedule() to stop future releases, or create an amendment schedule.'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_posted_accrual_release_mutation() IS
  'BEFORE UPDATE OR DELETE guard on accrual_release_lines. Blocks mutation of posted lines.';

CREATE TRIGGER accrual_release_lines_immutability
  BEFORE UPDATE OR DELETE ON public.accrual_release_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_accrual_release_mutation();

-- RLS
ALTER TABLE public.accrual_schedules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accrual_release_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accrual_schedules_org_read"
  ON public.accrual_schedules FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:accruals:read')
  );

CREATE POLICY "accrual_release_lines_org_read"
  ON public.accrual_release_lines FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:accruals:read')
  );

GRANT SELECT                 ON public.accrual_schedules     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.accrual_schedules     TO service_role;
GRANT SELECT                 ON public.accrual_release_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.accrual_release_lines TO service_role;

-- ── FUNCTION: create_accrual_schedule ────────────────────────────────────────
-- Creates an accrual schedule with all predetermined release lines.
-- Optionally posts the initial booking journal entry.
--
-- Release lines: one per month for release_months starting at start_date.
-- Per-period amount = ROUND(total_amount / release_months, 2).
-- Last period absorbs rounding so SUM(release_amount) = total_amount exactly.
--
-- Optional initial journal (if p_initial_debit and p_initial_credit provided):
--   DR p_initial_debit_account / CR p_initial_credit_account = total_amount
-- Voucher series 'P'.

CREATE OR REPLACE FUNCTION public.create_accrual_schedule(
  p_org_id                uuid,
  p_period_id             uuid,
  p_accrual_type          public.accrual_type,
  p_description           text,
  p_total_amount          numeric(14,2),
  p_start_date            date,
  p_release_months        int,
  p_release_debit_account  text,
  p_release_credit_account text,
  p_initial_debit_account  text    DEFAULT NULL,
  p_initial_credit_account text    DEFAULT NULL,
  p_notes                  text    DEFAULT NULL,
  p_actor_id               uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule_id    uuid;
  v_per_period     numeric(14,2);
  v_remainder      numeric(14,2);
  v_release_date   date;
  v_entry_id       uuid;
  v_lines          jsonb;
  i                int;
BEGIN
  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'ACCRUAL_INVALID_AMOUNT: total_amount must be positive'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_release_months <= 0 THEN
    RAISE EXCEPTION 'ACCRUAL_INVALID_MONTHS: release_months must be positive'
      USING ERRCODE = 'P0001';
  END IF;

  -- Post optional initial booking journal first
  IF p_initial_debit_account IS NOT NULL AND p_initial_credit_account IS NOT NULL
     AND p_period_id IS NOT NULL THEN
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_code',  p_initial_debit_account,
        'debit_amount',  p_total_amount,
        'credit_amount', 0,
        'description',   p_description
      ),
      jsonb_build_object(
        'account_code',  p_initial_credit_account,
        'debit_amount',  0,
        'credit_amount', p_total_amount,
        'description',   p_description
      )
    );

    v_entry_id := public.post_journal_entry(
      p_org_id,
      p_period_id,
      'standard'::public.journal_entry_type,
      p_start_date,
      'Periodisering: ' || p_description,
      v_lines,
      'Accrual.Created',
      'accrual_schedule',
      NULL,
      'P',
      NULL, NULL,
      p_actor_id
    );
  END IF;

  -- Insert schedule header
  INSERT INTO public.accrual_schedules
    (organization_id, financial_period_id, accrual_type, description, total_amount,
     release_months, start_date, release_debit_account, release_credit_account,
     initial_entry_id, notes, created_by)
  VALUES
    (p_org_id, p_period_id, p_accrual_type, p_description, p_total_amount,
     p_release_months, p_start_date, p_release_debit_account, p_release_credit_account,
     v_entry_id, p_notes, p_actor_id)
  RETURNING id INTO v_schedule_id;

  -- Update initial_entry source_entity_id now that we have schedule id
  -- (post_journal_entry doesn't accept NULL source_entity_id for lookup, so update directly)
  IF v_entry_id IS NOT NULL THEN
    UPDATE public.journal_entries
    SET source_entity_id = v_schedule_id
    WHERE id = v_entry_id;
  END IF;

  -- Generate predetermined release lines
  v_per_period  := ROUND(p_total_amount / p_release_months, 2);
  v_remainder   := p_total_amount - (v_per_period * p_release_months);
  v_release_date := date_trunc('month', p_start_date)::date;

  FOR i IN 1..p_release_months LOOP
    INSERT INTO public.accrual_release_lines
      (organization_id, accrual_schedule_id, period_number, release_date, release_amount)
    VALUES
      (p_org_id, v_schedule_id, i, v_release_date,
       CASE WHEN i = p_release_months
            THEN v_per_period + v_remainder   -- absorb rounding on last period
            ELSE v_per_period
       END);

    v_release_date := (v_release_date + interval '1 month')::date;
  END LOOP;

  RETURN v_schedule_id;
END;
$$;

COMMENT ON FUNCTION public.create_accrual_schedule(uuid,uuid,public.accrual_type,text,numeric,date,int,text,text,text,text,text,uuid) IS
  'Creates an accrual schedule with all predetermined period release lines. '
  'Last-period rounding absorbed so SUM(release_amount) = total_amount exactly. '
  'Optionally posts initial booking journal (DR initial_debit / CR initial_credit). '
  'Voucher series ''P'' (Periodisering).';

GRANT EXECUTE ON FUNCTION public.create_accrual_schedule(uuid,uuid,public.accrual_type,text,numeric,date,int,text,text,text,text,text,uuid) TO service_role;

-- ── FUNCTION: post_accrual_release ────────────────────────────────────────────
-- Posts the next pending release line from an accrual schedule.
-- Returns the journal entry id.

CREATE OR REPLACE FUNCTION public.post_accrual_release(
  p_schedule_id    uuid,
  p_period_id      uuid,
  p_actor_id       uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule  public.accrual_schedules%ROWTYPE;
  v_line      public.accrual_release_lines%ROWTYPE;
  v_entry_id  uuid;
  v_lines     jsonb;
BEGIN
  SELECT * INTO v_schedule FROM public.accrual_schedules WHERE id = p_schedule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCRUAL_SCHEDULE_NOT_FOUND: % does not exist', p_schedule_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_schedule.status NOT IN ('active') THEN
    RAISE EXCEPTION
      'ACCRUAL_NOT_ACTIVE: schedule status is %, cannot post releases',
      v_schedule.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Next unposted, uncancelled release line
  SELECT * INTO v_line
  FROM   public.accrual_release_lines
  WHERE  accrual_schedule_id = p_schedule_id
    AND  is_posted   = false
    AND  is_cancelled = false
  ORDER  BY period_number ASC
  LIMIT  1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'NO_ACCRUAL_RELEASE_DUE: no pending release lines for schedule %', p_schedule_id
      USING ERRCODE = 'P0001';
  END IF;

  -- DR release_debit_account / CR release_credit_account
  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code',  v_schedule.release_debit_account,
      'debit_amount',  v_line.release_amount,
      'credit_amount', 0,
      'description',
        v_schedule.description || ' — period ' || v_line.period_number || '/' || v_schedule.release_months
    ),
    jsonb_build_object(
      'account_code',  v_schedule.release_credit_account,
      'debit_amount',  0,
      'credit_amount', v_line.release_amount,
      'description',
        v_schedule.description || ' — period ' || v_line.period_number || '/' || v_schedule.release_months
    )
  );

  v_entry_id := public.post_journal_entry(
    v_schedule.organization_id,
    p_period_id,
    'standard'::public.journal_entry_type,
    v_line.release_date,
    'Periodisering: ' || v_schedule.description
      || ' (' || v_line.period_number || '/' || v_schedule.release_months || ')',
    v_lines,
    'Accrual.Released',
    'accrual_schedule',
    p_schedule_id,
    'P',
    NULL, NULL,
    p_actor_id
  );

  -- Mark line posted
  UPDATE public.accrual_release_lines
  SET is_posted = true, posted_at = now(), journal_entry_id = v_entry_id
  WHERE id = v_line.id;

  -- Update schedule header totals
  UPDATE public.accrual_schedules
  SET released_amount = released_amount + v_line.release_amount,
      months_released = months_released + 1,
      status = CASE
        WHEN (months_released + 1) >= release_months THEN 'fully_released'::public.accrual_status
        ELSE status
      END,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = p_schedule_id;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION public.post_accrual_release(uuid, uuid, uuid) IS
  'Posts the next pending release line for an accrual schedule. '
  'Journal: DR release_debit_account / CR release_credit_account = release_amount. '
  'Transitions schedule to fully_released when all lines are posted.';

GRANT EXECUTE ON FUNCTION public.post_accrual_release(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: cancel_accrual_schedule ────────────────────────────────────────
-- Cancels all remaining unposted release lines and transitions the schedule
-- to 'cancelled'. Amendment-based: does not reverse already-posted entries.

CREATE OR REPLACE FUNCTION public.cancel_accrual_schedule(
  p_schedule_id uuid,
  p_reason      text DEFAULT NULL,
  p_actor_id    uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule public.accrual_schedules%ROWTYPE;
BEGIN
  SELECT * INTO v_schedule FROM public.accrual_schedules WHERE id = p_schedule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCRUAL_SCHEDULE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_schedule.status NOT IN ('active') THEN
    RAISE EXCEPTION
      'ACCRUAL_CANCEL_INVALID: schedule status is %, only active schedules can be cancelled',
      v_schedule.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Mark remaining unposted lines as cancelled
  UPDATE public.accrual_release_lines
  SET is_cancelled = true
  WHERE accrual_schedule_id = p_schedule_id
    AND is_posted   = false
    AND is_cancelled = false;

  UPDATE public.accrual_schedules
  SET status     = 'cancelled',
      notes      = COALESCE(notes, '') || CASE WHEN p_reason IS NOT NULL
                     THEN E'\nCancelled: ' || p_reason ELSE '' END,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = p_schedule_id;
END;
$$;

COMMENT ON FUNCTION public.cancel_accrual_schedule(uuid, text, uuid) IS
  'Cancels all remaining unposted release lines and sets schedule status to ''cancelled''. '
  'Does NOT reverse already-posted journal entries (amendment-based correction pattern). '
  'To correct posted entries, create a new reversal journal manually.';

GRANT EXECUTE ON FUNCTION public.cancel_accrual_schedule(uuid, text, uuid) TO service_role;

-- ── View ───────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_accrual_schedule_status
WITH (security_invoker = true)
AS
SELECT
  s.id,
  s.organization_id,
  s.accrual_type,
  s.status,
  s.description,
  s.total_amount,
  s.released_amount,
  (s.total_amount - s.released_amount)           AS remaining_amount,
  s.release_months,
  s.months_released,
  (s.release_months - s.months_released)          AS months_remaining,
  s.start_date,
  s.release_debit_account,
  s.release_credit_account,
  MIN(arl.release_date) FILTER (WHERE NOT arl.is_posted AND NOT arl.is_cancelled)
                                                   AS next_release_date,
  COUNT(arl.id) FILTER (WHERE NOT arl.is_posted AND NOT arl.is_cancelled)
                                                   AS pending_lines,
  s.notes,
  s.created_at
FROM  public.accrual_schedules s
LEFT  JOIN public.accrual_release_lines arl ON arl.accrual_schedule_id = s.id
GROUP BY s.id;

COMMENT ON VIEW public.v_accrual_schedule_status IS
  'Accrual schedule status with remaining balance and next release date. '
  'security_invoker = true.';

GRANT SELECT ON public.v_accrual_schedule_status TO authenticated, service_role;
