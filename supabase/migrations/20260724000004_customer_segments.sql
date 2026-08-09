-- =============================================================================
-- Customer Segments
--
-- Settings → Kunder → Segment shipped querying a customer_segments table that
-- never existed. "Dynamiska segment baserade på kriterier" implies rule-based
-- matching, not a flat reference list — rules are stored as a JSONB array
-- ({ field, operator, value }[]) and evaluated client-side against the
-- students table (already RLS-readable by the caller) rather than via
-- generated dynamic SQL, to avoid any SQL-injection surface from
-- interpreting free-form rule data as query fragments.
-- =============================================================================

CREATE TABLE public.customer_segments (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  name            text        NOT NULL,
  match_mode      text        NOT NULL DEFAULT 'and',
  rules           jsonb       NOT NULL DEFAULT '[]',
  display_order   integer     NOT NULL DEFAULT 0,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT customer_segments_pkey     PRIMARY KEY (id),
  CONSTRAINT customer_segments_org_fkey FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT customer_segments_org_name_uniq UNIQUE (organization_id, name),
  CONSTRAINT customer_segments_match_mode_check CHECK (match_mode IN ('and', 'or')),
  CONSTRAINT customer_segments_rules_is_array CHECK (jsonb_typeof(rules) = 'array')
);

COMMENT ON TABLE public.customer_segments IS
  'Tenant-owned dynamic customer segments. rules is a JSONB array of {field, operator, value} matched client-side against students — no server-side dynamic SQL generation from rule data.';

CREATE INDEX customer_segments_org_id_idx ON public.customer_segments (organization_id);

CREATE TRIGGER customer_segments_set_updated_at
  BEFORE UPDATE ON public.customer_segments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER customer_segments_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.customer_segments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_segments_select"
  ON public.customer_segments FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:read')
  );

CREATE POLICY "customer_segments_select_platform"
  ON public.customer_segments FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "customer_segments_insert"
  ON public.customer_segments FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:create')
  );

CREATE POLICY "customer_segments_update"
  ON public.customer_segments FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  );

CREATE POLICY "customer_segments_delete"
  ON public.customer_segments FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:delete')
  );
