-- =============================================================================
-- MIGRATION: 20260708000002_pr2_pkg1_correlation_context.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Epic:      Production Readiness PR-2 — Package 1: Correlation Context Propagation
-- Description:
--   Extends audit_trigger_fn() (last redefined in 20260527000002_phase1b2_hardening.sql)
--   to additionally capture correlation_id and request_id into the audit_logs
--   columns that have existed since the original schema but were never populated.
--
--   Source: PostgREST's `request.headers` GUC — the same class of mechanism
--   already used for `request.jwt.claims` in this function. Edge Functions
--   attach X-Correlation-ID / X-Request-ID as outgoing request headers via
--   _shared/supabase.ts's optional `correlation` parameter; PostgREST exposes
--   all incoming request headers via this GUC with zero additional configuration.
--
--   Fail-open by construction (PR-2 Observability Architecture v1.0, Principle P2):
--   current_setting(..., true) never raises when the GUC is absent (e.g. calls
--   made outside a PostgREST request context, or via createServiceClient()
--   without a correlation param); safe_uuid() never raises on a malformed or
--   missing header value. Both cases silently resolve to NULL — the write
--   proceeds unaffected either way.
--
--   No change to any existing audit_trigger_fn behaviour, column, or trigger
--   attachment. Purely additive: 2 new populated columns (already existed,
--   already NULL on every row today).
-- =============================================================================

-- ── 1. safe_uuid(): fail-open text-to-uuid cast ────────────────────────────────
-- Returns NULL instead of raising on invalid/empty input. Used exclusively by
-- audit_trigger_fn() below to guarantee a malformed or absent correlation
-- header can never abort the write it's attached to.

CREATE OR REPLACE FUNCTION public.safe_uuid(p_text text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN NULLIF(p_text, '')::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.safe_uuid(text) IS
  'Fail-open text-to-uuid cast. Returns NULL on empty/malformed input instead '
  'of raising. Used by audit_trigger_fn() to safely parse correlation/request '
  'IDs from request headers without risking the audited write.';

REVOKE ALL ON FUNCTION public.safe_uuid(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.safe_uuid(text) TO authenticated, service_role;

-- ── 2. audit_trigger_fn(): additive extension ──────────────────────────────────
-- Identical to the 20260527000002 definition, plus correlation_id/request_id
-- capture. Every existing DECLARE, branch, and INSERT column/value is unchanged.

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_col        text := COALESCE(TG_ARGV[0], 'organization_id');
  v_org_id         uuid;
  v_actor_id       uuid;
  v_actor_email    text;
  v_old_data       jsonb;
  v_new_data       jsonb;
  v_changed_fields text[];
  v_correlation_id uuid;
  v_request_id     uuid;
  v_headers        jsonb;
BEGIN
  v_old_data    := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new_data    := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_actor_id    := auth.uid();
  v_actor_email := current_setting('request.jwt.claims', true)::jsonb ->> 'email';

  -- Correlation context: read from PostgREST's request.headers GUC, exactly
  -- the same class of mechanism as request.jwt.claims above. Wrapped so a
  -- missing GUC or non-JSON value can never abort the audited write.
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
    v_correlation_id := public.safe_uuid(v_headers ->> 'x-correlation-id');
    v_request_id     := public.safe_uuid(v_headers ->> 'x-request-id');
  EXCEPTION
    WHEN OTHERS THEN
      v_correlation_id := NULL;
      v_request_id     := NULL;
  END;

  -- '__jwt__' sentinel: org_id comes from JWT context rather than from the row.
  -- Used for tables that have no organization_id column (e.g., profiles).
  -- For platform/service-role operations the JWT may be absent; org_id will be NULL.
  v_org_id := CASE
    WHEN v_org_col = '__jwt__' THEN public.auth_organization_id()
    WHEN TG_OP = 'DELETE'      THEN (v_old_data ->> v_org_col)::uuid
    ELSE                            (v_new_data ->> v_org_col)::uuid
  END;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key)
    INTO v_changed_fields
    FROM jsonb_each(v_new_data) AS n(key, val)
    JOIN jsonb_each(v_old_data) AS o(key, val) USING (key)
    WHERE n.val IS DISTINCT FROM o.val
      AND n.key NOT IN ('updated_at');
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_email,
    entity_type, entity_id,
    operation, table_name,
    old_values, new_values, changed_fields,
    correlation_id, request_id,
    occurred_at
  ) VALUES (
    v_org_id, v_actor_id, v_actor_email,
    TG_TABLE_NAME,
    COALESCE((v_new_data ->> 'id')::uuid, (v_old_data ->> 'id')::uuid),
    TG_OP::public.audit_operation,
    TG_TABLE_NAME,
    v_old_data, v_new_data, v_changed_fields,
    v_correlation_id, v_request_id,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.audit_trigger_fn IS
  'Generic SECURITY DEFINER audit trigger. '
  'TG_ARGV[0]: org column name (default: ''organization_id''); '
  'pass ''id'' for the organizations table; '
  'pass ''__jwt__'' for tables without an org column (e.g., profiles). '
  'Captures correlation_id/request_id from request.headers when present '
  '(PR-2 Package 1) — fails open to NULL, never blocks the audited write.';
