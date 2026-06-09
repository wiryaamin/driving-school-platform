-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260602000003_phase4d_reversal_and_corrections.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4D — Reversal and Correction Engine
--
-- Implements the accounting reversal and correction workflow:
--
--   reverse_journal_entry(p_entry_id, p_reversal_date, p_reason, p_actor_id)
--     → Creates a mirror entry with all debits↔credits swapped.
--       entry_type = 'reversal', reversal_of_entry_id = original.
--       Original entry is NOT modified (immutable by design).
--       Validates: original must be posted and not already reversed.
--       Validates: reversal date period must not be locked.
--
--   correct_journal_entry(p_entry_id, p_new_lines, p_reason, p_correction_date, p_actor_id)
--     → Reverses the original entry, then posts a corrected entry.
--       Correction entry: entry_type = 'correction',
--                         correction_of_entry_id = original entry.
--       Returns the correction entry id.
--
-- Views:
--   v_journal_entries
--     → Augments journal_entries with computed effective_status:
--       'reversed' if a reversal entry exists, otherwise the stored status.
--       Also includes reversal_entry_id and correction_entry_id derived fields.
--
--   v_journal_entry_lines
--     → Flattened join of journal_entries + journal_lines.
--       Used by the SIE4 generation and reporting services.
--
-- Dependencies:
--   20260602000001_phase4d_ledger_core.sql
--   20260602000002_phase4d_posting_engine.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. reverse_journal_entry ──────────────────────────────────────────────────
-- Creates a reversal entry for a posted journal entry.
-- All debit lines become credit lines and vice versa.
-- The original entry is NOT touched (immutable).
-- Checks that the entry hasn't already been reversed.

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(
  p_entry_id      uuid,
  p_reversal_date date   DEFAULT CURRENT_DATE,
  p_reason        text   DEFAULT 'Manual reversal',
  p_actor_id      uuid   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original     journal_entries%ROWTYPE;
  v_reversal_id  uuid;
  v_period_id    uuid;
  v_line_arr     jsonb := '[]'::jsonb;
  v_line         record;
BEGIN
  -- 1. Fetch original entry
  SELECT * INTO v_original
  FROM   journal_entries
  WHERE  id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND: journal entry % not found', p_entry_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_original.status <> 'posted' THEN
    RAISE EXCEPTION 'JOURNAL_NOT_POSTED: entry % has status %; only posted entries can be reversed',
      p_entry_id, v_original.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Check not already reversed
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE  reversal_of_entry_id = p_entry_id
      AND  status = 'posted'
  ) THEN
    RAISE EXCEPTION 'JOURNAL_ALREADY_REVERSED: entry % has already been reversed',
      p_entry_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Build reversal lines: swap debit↔credit for every original line
  FOR v_line IN
    SELECT account_code, debit_amount, credit_amount, vat_rate_code, vat_amount, description
    FROM   journal_lines
    WHERE  entry_id = p_entry_id
    ORDER  BY line_number
  LOOP
    v_line_arr := v_line_arr || jsonb_build_object(
      'account_code',  v_line.account_code,
      'debit_amount',  v_line.credit_amount,
      'credit_amount', v_line.debit_amount,
      'description',   'Reversal: ' || v_line.description,
      'vat_rate_code', v_line.vat_rate_code,
      'vat_amount',    v_line.vat_amount
    );
  END LOOP;

  -- 4. Resolve period for reversal date
  v_period_id := find_period_for_date(v_original.organization_id, p_reversal_date);

  -- 5. Post reversal entry
  v_reversal_id := post_journal_entry(
    p_org_id               := v_original.organization_id,
    p_period_id            := v_period_id,
    p_entry_type           := 'reversal',
    p_entry_date           := p_reversal_date,
    p_description          := 'Reversal of voucher ' || v_original.voucher_series || v_original.voucher_number::text
                              || ': ' || p_reason,
    p_lines                := v_line_arr,
    p_source_event_type    := 'Journal.Reversed',
    p_source_entity_type   := 'journal_entry',
    p_source_entity_id     := p_entry_id,
    p_voucher_series       := 'M',
    p_reversal_of_entry_id := p_entry_id,
    p_actor_id             := p_actor_id
  );

  RETURN v_reversal_id;
END;
$$;

COMMENT ON FUNCTION public.reverse_journal_entry(uuid, date, text, uuid) IS
  'Creates a reversal journal entry: all debits↔credits swapped, '
  'posted to series M (manual corrections), reversal_of_entry_id = p_entry_id. '
  'Original entry is immutable and remains ''posted'' — '
  'effective reversal status is derived via v_journal_entries view. '
  'Validates that the entry is posted and has not already been reversed.';

GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(uuid, date, text, uuid)
  TO authenticated, service_role;

-- ── 2. correct_journal_entry ──────────────────────────────────────────────────
-- Reverses an erroneous entry and posts a corrected replacement.
-- Calls reverse_journal_entry() first, then posts the correction.
-- Returns the correction entry id.

CREATE OR REPLACE FUNCTION public.correct_journal_entry(
  p_entry_id        uuid,
  p_new_lines       jsonb,
  p_reason          text   DEFAULT 'Correction',
  p_correction_date date   DEFAULT CURRENT_DATE,
  p_actor_id        uuid   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original      journal_entries%ROWTYPE;
  v_period_id     uuid;
  v_correction_id uuid;
BEGIN
  -- 1. Fetch original entry for org context
  SELECT * INTO v_original FROM journal_entries WHERE id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND: journal entry % not found', p_entry_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Reverse the original (this validates it's posted and not already reversed)
  PERFORM reverse_journal_entry(p_entry_id, p_correction_date, p_reason || ' (reversal step)', p_actor_id);

  -- 3. Resolve period for correction
  v_period_id := find_period_for_date(v_original.organization_id, p_correction_date);

  -- 4. Post the corrected entry
  v_correction_id := post_journal_entry(
    p_org_id                 := v_original.organization_id,
    p_period_id              := v_period_id,
    p_entry_type             := 'correction',
    p_entry_date             := p_correction_date,
    p_description            := 'Correction of voucher ' || v_original.voucher_series || v_original.voucher_number::text
                                || ': ' || p_reason,
    p_lines                  := p_new_lines,
    p_source_event_type      := 'Journal.Corrected',
    p_source_entity_type     := 'journal_entry',
    p_source_entity_id       := p_entry_id,
    p_voucher_series         := 'M',
    p_correction_of_entry_id := p_entry_id,
    p_actor_id               := p_actor_id
  );

  RETURN v_correction_id;
END;
$$;

COMMENT ON FUNCTION public.correct_journal_entry(uuid, jsonb, text, date, uuid) IS
  'Corrects a posted entry: (1) reverses the original, (2) posts the corrected lines. '
  'Returns the correction entry_id. '
  'Correction uses series M; correction_of_entry_id links to the original.';

GRANT EXECUTE ON FUNCTION public.correct_journal_entry(uuid, jsonb, text, date, uuid)
  TO authenticated, service_role;

-- ── 3. v_journal_entries — effective status + reversal tracking ───────────────
-- Augments journal_entries with:
--   effective_status: 'reversed' if a reversal exists, else the stored status
--   reversal_entry_id: id of the reversal entry (if any)
--   correction_entry_id: id of the correction entry (if any)
-- Used by the API layer instead of querying journal_entries directly.

CREATE VIEW public.v_journal_entries
WITH (security_invoker = true)
AS
SELECT
  je.*,
  CASE
    WHEN rev.id IS NOT NULL THEN 'reversed'
    ELSE je.status::text
  END                    AS effective_status,
  rev.id                 AS reversal_entry_id,
  rev.entry_date         AS reversed_on,
  corr.id                AS correction_entry_id
FROM public.journal_entries je
LEFT JOIN public.journal_entries rev
  ON  rev.reversal_of_entry_id = je.id
  AND rev.status = 'posted'
LEFT JOIN public.journal_entries corr
  ON  corr.correction_of_entry_id = je.id
  AND corr.status = 'posted';

COMMENT ON VIEW public.v_journal_entries IS
  'Journal entries with computed effective_status (reversed/posted/draft), '
  'reversal_entry_id, and correction_entry_id. '
  'security_invoker: inherits caller''s RLS context from journal_entries.';

-- ── 4. v_journal_entry_lines — flattened join for SIE4 and reporting ─────────
-- Joins journal_entries + journal_lines with BAS account names.
-- Used by generate_sie4_from_ledger() and the TypeScript reporting layer.

CREATE VIEW public.v_journal_entry_lines
WITH (security_invoker = true)
AS
SELECT
  je.id                AS entry_id,
  je.organization_id,
  je.financial_period_id,
  je.entry_type,
  je.status,
  je.voucher_series,
  je.voucher_number,
  je.entry_date,
  je.description       AS entry_description,
  je.source_event_type,
  je.source_entity_type,
  je.source_entity_id,
  je.reversal_of_entry_id,
  je.total_debit,
  je.total_credit,
  je.posted_at,
  jl.id                AS line_id,
  jl.line_number,
  jl.account_code,
  COALESCE(bac.account_name, jl.account_code)  AS account_name,
  COALESCE(bac.normal_balance, 'debit')         AS normal_balance,
  jl.debit_amount,
  jl.credit_amount,
  -- SIE4 amount convention: positive for debit, negative for credit
  CASE
    WHEN jl.debit_amount  > 0 THEN  jl.debit_amount
    ELSE                           -jl.credit_amount
  END                  AS sie4_amount,
  jl.vat_rate_code,
  jl.vat_amount,
  jl.description       AS line_description
FROM public.journal_entries je
JOIN public.journal_lines   jl  ON jl.entry_id       = je.id
LEFT JOIN public.bas_account_catalog bac ON bac.account_code = jl.account_code;

COMMENT ON VIEW public.v_journal_entry_lines IS
  'Flattened journal_entries + journal_lines with BAS account names. '
  'sie4_amount follows SIE4 convention: positive = debit, negative = credit. '
  'security_invoker: inherits caller''s RLS from underlying tables.';
