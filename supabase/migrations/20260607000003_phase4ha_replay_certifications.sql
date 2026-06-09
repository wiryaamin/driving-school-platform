-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260607000003_phase4ha_replay_certifications.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     4H-A — Replay Certifications & Fiscal Year Integrity Certificates
--
-- Separates replay EXECUTION from replay CERTIFICATION:
--   Execution:    ledger_replay_runs (tracks what was computed)
--   Certification: replay_certifications (declares a run as audit-certified)
--   Certificate:  replay_integrity_certificates (fiscal-year-level audit cert)
--
--   replay_certifications
--     One certification per period per certification event.
--     Immutable once status = 'certified'. Revocation creates a new record.
--     certification_hash: SHA-256 of (period_id|replay_hash|delta_count|ts).
--
--   replay_integrity_certificates
--     One certificate per fiscal year, per generation.
--     Aggregates all period certification hashes into a single SHA-256.
--     fully_immutable: no update or delete triggers.
--     all_periods_certified: GENERATED boolean.
--
-- SECURITY DEFINER functions:
--
--   certify_period_replay(p_org_id, p_period_id, p_actor_id)
--     → Finds the latest completed/divergent replay run.
--       Inserts a replay_certifications record.
--       Returns {certification_id, period_id, replay_hash, delta_count, status}.
--
--   generate_integrity_certificate(p_org_id, p_fiscal_year_id, p_actor_id)
--     → Aggregates per-period replay_hashes from the latest run per period.
--       Computes a certificate_hash = SHA-256 of all period_id|replay_hash pairs.
--       Inserts replay_integrity_certificates record.
--       Returns the certificate uuid.
--
-- Dependencies:
--   20260607000001_phase4ha_canonical_hash_foundation.sql — (none direct)
--   20260607000002_phase4ha_replay_delta_storage.sql — replay_validation_deltas
--   20260606000001_phase4h_replay_core.sql — ledger_replay_runs
--   20260603000001_phase4e_reconciliation_core.sql — fiscal_years (year_start, year_end)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Section 1: replay_certification_status enum ───────────────────────────────

CREATE TYPE public.replay_certification_status AS ENUM (
  'pending',   -- Certification queued or in progress
  'certified', -- Successfully certified; replay_hash locked to this period
  'revoked'    -- Certification revoked by authorized actor (creates new record)
);

-- ── Section 2: replay_certifications ─────────────────────────────────────────
-- Immutable certification events for period replay runs.
-- Multiple certifications per period are allowed (history is preserved).
-- To "revoke" a certification, create a new record with status='revoked'.
-- The latest certified record per period is authoritative.

CREATE TABLE public.replay_certifications (
  id                   uuid                               NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      uuid                               NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id            uuid                               NOT NULL REFERENCES public.financial_periods(id) ON DELETE RESTRICT,
  replay_run_id        uuid                               NOT NULL REFERENCES public.ledger_replay_runs(id) ON DELETE RESTRICT,
  replay_hash          text                               NOT NULL,
  certification_hash   text                               NOT NULL CHECK (length(certification_hash) = 64),
  status               public.replay_certification_status NOT NULL DEFAULT 'certified',
  delta_count          int                                NOT NULL DEFAULT 0 CHECK (delta_count >= 0),
  certified_at         timestamptz                        NOT NULL DEFAULT now(),
  certified_by         uuid                               REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at           timestamptz,
  revocation_reason    text
);

COMMENT ON TABLE public.replay_certifications IS
  'Immutable certification events for period replay runs. '
  'certification_hash: SHA-256(period_id|replay_hash|delta_count|certified_at). '
  'Multiple certifications per period allowed; latest ''certified'' row is authoritative. '
  'Revocation creates new record with status=''revoked''. Replay execution and certification are separated.';
COMMENT ON COLUMN public.replay_certifications.delta_count IS
  'Number of replay_validation_deltas for the certified run. 0 = fully clean certification.';

CREATE OR REPLACE FUNCTION public.prevent_replay_certification_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'REPLAY_CERTIFICATION_IMMUTABLE: certification records are permanent audit evidence.'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER replay_certifications_immutability
  BEFORE UPDATE OR DELETE ON public.replay_certifications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_replay_certification_mutation();

-- ── Section 3: replay_integrity_certificates ─────────────────────────────────
-- Fiscal-year-level integrity certificates.
-- Aggregates replay hashes from all periods in a fiscal year.
-- all_periods_certified: GENERATED boolean (period_count = certified_period_count AND > 0).
-- Fully immutable — audit-certifiable single point of reference per fiscal year close.

CREATE TABLE public.replay_integrity_certificates (
  id                     uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id        uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  fiscal_year_id         uuid          NOT NULL REFERENCES public.fiscal_years(id) ON DELETE RESTRICT,
  certificate_hash       text          NOT NULL CHECK (length(certificate_hash) = 64),
  period_count           int           NOT NULL DEFAULT 0 CHECK (period_count >= 0),
  certified_period_count int           NOT NULL DEFAULT 0 CHECK (certified_period_count >= 0),
  all_periods_certified  boolean GENERATED ALWAYS AS (
    period_count > 0 AND period_count = certified_period_count
  ) STORED,
  period_hashes          jsonb         NOT NULL DEFAULT '{}',
  generated_at           timestamptz   NOT NULL DEFAULT now(),
  generated_by           uuid          REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.replay_integrity_certificates IS
  'Fiscal-year-level integrity certificates. Aggregates per-period replay hashes. '
  'certificate_hash: SHA-256 of all (period_id|replay_hash) pairs sorted by period_start. '
  'all_periods_certified: GENERATED — true when every period has a certified replay run. '
  'Fully immutable: no updates or deletes permitted.';

CREATE OR REPLACE FUNCTION public.prevent_replay_integrity_certificate_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'REPLAY_INTEGRITY_CERTIFICATE_IMMUTABLE: integrity certificates are permanent audit records.'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER replay_integrity_certificates_immutability
  BEFORE UPDATE OR DELETE ON public.replay_integrity_certificates
  FOR EACH ROW EXECUTE FUNCTION public.prevent_replay_integrity_certificate_mutation();

-- ── Section 4: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.replay_certifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replay_integrity_certificates  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rc_org_read"
  ON public.replay_certifications FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

CREATE POLICY "ric_org_read"
  ON public.replay_integrity_certificates FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('finance:integrity:read')
  );

-- ── Section 5: Grants ─────────────────────────────────────────────────────────

GRANT SELECT         ON public.replay_certifications         TO authenticated;
GRANT SELECT, INSERT ON public.replay_certifications         TO service_role;

GRANT SELECT         ON public.replay_integrity_certificates TO authenticated;
GRANT SELECT, INSERT ON public.replay_integrity_certificates TO service_role;

-- ── FUNCTION: certify_period_replay ──────────────────────────────────────────
-- Finds the latest completed/divergent replay run for a period and certifies it.
-- Creates an immutable replay_certifications record.
-- certification_hash = SHA-256(period_id|replay_hash|delta_count|certified_at).

CREATE OR REPLACE FUNCTION public.certify_period_replay(
  p_org_id    uuid,
  p_period_id uuid,
  p_actor_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_run   record;
  v_cert_ts      timestamptz := now();
  v_cert_hash    text;
  v_cert_id      uuid;
  v_delta_count  int := 0;
BEGIN
  -- Get latest completed/divergent replay run for this period
  SELECT *
  INTO   v_latest_run
  FROM   public.ledger_replay_runs
  WHERE  organization_id = p_org_id
    AND  period_id       = p_period_id
    AND  status IN ('completed', 'divergent')
  ORDER  BY created_at DESC
  LIMIT  1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'CERTIFICATION_FAILED: no completed replay run found for period %', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Count divergence deltas for this run
  SELECT COUNT(*) INTO v_delta_count
  FROM public.replay_validation_deltas
  WHERE replay_run_id = v_latest_run.id;

  -- Compute certification hash (includes timestamp for uniqueness)
  v_cert_hash := encode(
    sha256((
      p_period_id::text         || '|' ||
      COALESCE(v_latest_run.replay_hash, '') || '|' ||
      v_delta_count::text       || '|' ||
      v_cert_ts::text
    )::bytea),
    'hex'
  );

  INSERT INTO public.replay_certifications(
    organization_id, period_id, replay_run_id,
    replay_hash, certification_hash,
    status, delta_count, certified_at, certified_by
  )
  VALUES (
    p_org_id, p_period_id, v_latest_run.id,
    COALESCE(v_latest_run.replay_hash, ''),
    v_cert_hash,
    'certified', v_delta_count, v_cert_ts, p_actor_id
  )
  RETURNING id INTO v_cert_id;

  RETURN jsonb_build_object(
    'certification_id',   v_cert_id,
    'period_id',          p_period_id,
    'replay_run_id',      v_latest_run.id,
    'replay_hash',        v_latest_run.replay_hash,
    'certification_hash', v_cert_hash,
    'delta_count',        v_delta_count,
    'status',             'certified',
    'certified_at',       v_cert_ts
  );
END;
$$;

COMMENT ON FUNCTION public.certify_period_replay(uuid, uuid, uuid) IS
  'Certifies the latest completed replay run for a period. '
  'Creates immutable replay_certifications record. '
  'certification_hash: SHA-256(period_id|replay_hash|delta_count|ts). '
  'Returns {certification_id, replay_hash, certification_hash, delta_count}.';

GRANT EXECUTE ON FUNCTION public.certify_period_replay(uuid, uuid, uuid) TO service_role;

-- ── FUNCTION: generate_integrity_certificate ─────────────────────────────────
-- Generates a fiscal-year-level integrity certificate.
-- Collects the latest replay_hash per period in the fiscal year.
-- Computes certificate_hash = SHA-256 of all (period_id|replay_hash) sorted by period_start.
-- Inserts immutable replay_integrity_certificates record.
-- Returns the certificate uuid.

CREATE OR REPLACE FUNCTION public.generate_integrity_certificate(
  p_org_id         uuid,
  p_fiscal_year_id uuid,
  p_actor_id       uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy               record;
  v_period_hashes    jsonb  := '{}'::jsonb;
  v_cert_period_count int   := 0;
  v_total_period_count int  := 0;
  v_hash_input       text  := '';
  v_cert_hash        text;
  v_cert_id          uuid;
  v_rec              record;
BEGIN
  SELECT * INTO v_fy
  FROM public.fiscal_years
  WHERE id = p_fiscal_year_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_YEAR_NOT_FOUND: % does not exist for org %',
      p_fiscal_year_id, p_org_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Collect latest replay hash per period in this fiscal year
  FOR v_rec IN
    SELECT
      fp.id          AS period_id,
      fp.period_start,
      fp.period_end,
      lrr.replay_hash,
      lrr.status     AS run_status,
      rc.id IS NOT NULL AS is_certified
    FROM   public.financial_periods fp
    LEFT   JOIN LATERAL (
      SELECT * FROM public.ledger_replay_runs
      WHERE  period_id       = fp.id
        AND  status IN ('completed', 'divergent')
      ORDER  BY created_at DESC
      LIMIT  1
    ) lrr ON true
    LEFT   JOIN LATERAL (
      SELECT * FROM public.replay_certifications
      WHERE  period_id = fp.id
        AND  status    = 'certified'
      ORDER  BY certified_at DESC
      LIMIT  1
    ) rc ON true
    WHERE  fp.organization_id = p_org_id
      AND  fp.period_start   >= v_fy.year_start
      AND  fp.period_end     <= v_fy.year_end
    ORDER  BY fp.period_start ASC
  LOOP
    v_total_period_count := v_total_period_count + 1;

    IF v_rec.is_certified THEN
      v_cert_period_count := v_cert_period_count + 1;
    END IF;

    v_period_hashes := v_period_hashes || jsonb_build_object(
      v_rec.period_id::text,
      jsonb_build_object(
        'period_start', v_rec.period_start,
        'period_end',   v_rec.period_end,
        'replay_hash',  COALESCE(v_rec.replay_hash, 'NO_REPLAY'),
        'run_status',   v_rec.run_status,
        'is_certified', v_rec.is_certified
      )
    );

    -- Build deterministic hash input (sorted by period_start ASC)
    v_hash_input := v_hash_input ||
      v_rec.period_id::text || '|' ||
      COALESCE(v_rec.replay_hash, 'NO_REPLAY') || E'\n';
  END LOOP;

  -- Certificate hash over all periods (order guaranteed by FOR loop ORDER BY)
  v_cert_hash := encode(sha256(v_hash_input::bytea), 'hex');

  INSERT INTO public.replay_integrity_certificates(
    organization_id, fiscal_year_id,
    certificate_hash, period_count, certified_period_count,
    period_hashes, generated_by
  )
  VALUES (
    p_org_id, p_fiscal_year_id,
    v_cert_hash, v_total_period_count, v_cert_period_count,
    v_period_hashes, p_actor_id
  )
  RETURNING id INTO v_cert_id;

  RETURN v_cert_id;
END;
$$;

COMMENT ON FUNCTION public.generate_integrity_certificate(uuid, uuid, uuid) IS
  'Generates a fiscal-year-level replay integrity certificate. '
  'Aggregates period replay hashes from all periods in the fiscal year. '
  'certificate_hash: SHA-256 of (period_id|replay_hash) pairs sorted by period_start. '
  'Returns replay_integrity_certificates.id.';

GRANT EXECUTE ON FUNCTION public.generate_integrity_certificate(uuid, uuid, uuid) TO service_role;
