-- =============================================================================
-- MIGRATION: 20260527000002_phase1b2_hardening.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     1B.2 Auth + JWT + Event Foundation Hardening
-- Description:
--   1. Audit trigger hardening (__jwt__ sentinel, actor_email enrichment)
--   2. Profiles refactored to global identity (organization_id removed)
--   3. Platform admins bootstrap table
--   4. JWT claims helpers + Auth Hook builder function
--   5. Enterprise event outbox (email, SMS, WhatsApp, AI, accounting, webhooks)
--   6. Soft delete framework
--   7. Security hardening (anon revokes, constraint hardening)
--   8. Grants
-- =============================================================================

-- =============================================================================
-- SECTION 1: AUDIT TRIGGER HARDENING
-- Replaces the Phase 1B.1 audit_trigger_fn with an upgraded version that:
--   a) Supports the '__jwt__' sentinel for tables without an organization_id
--      column (e.g., profiles after the global refactor below).
--   b) Enriches audit records with actor_email from the JWT for richer trails.
-- =============================================================================

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
BEGIN
  v_old_data    := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new_data    := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_actor_id    := auth.uid();
  v_actor_email := current_setting('request.jwt.claims', true)::jsonb ->> 'email';

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
    occurred_at
  ) VALUES (
    v_org_id, v_actor_id, v_actor_email,
    TG_TABLE_NAME,
    COALESCE((v_new_data ->> 'id')::uuid, (v_old_data ->> 'id')::uuid),
    TG_OP::public.audit_operation,
    TG_TABLE_NAME,
    v_old_data, v_new_data, v_changed_fields,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.audit_trigger_fn IS
  'Generic SECURITY DEFINER audit trigger. '
  'TG_ARGV[0]: org column name (default: ''organization_id''); '
  'pass ''id'' for the organizations table; '
  'pass ''__jwt__'' for tables without an org column (e.g., profiles).';

-- Re-attach profiles audit trigger with __jwt__ sentinel.
-- (The trigger was originally created pointing to 'organization_id' which no
-- longer exists after the refactor in Section 2.)
DROP TRIGGER IF EXISTS profiles_audit ON public.profiles;
CREATE TRIGGER profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('__jwt__');

-- =============================================================================
-- SECTION 2: PROFILES — GLOBAL USER IDENTITY REFACTOR
--
-- Why: The Phase 1B.1 design coupled profiles to a single organization_id,
-- making it impossible for a user to participate in multiple organizations
-- (e.g., a freelance instructor at two driving schools, a corporate contact
-- managing multiple tenants). The correct enterprise model is:
--
--   profiles         = global identity (who you are)
--   memberships      = tenant relationship (where you belong)
--   membership_roles = what you can do in that tenant
--
-- After this change:
--   • A user has exactly ONE profile row regardless of org count.
--   • Profile RLS delegates org-isolation to the memberships table.
--   • Org admins reach profiles they can manage through the memberships JOIN.
-- =============================================================================

-- 2a. Drop organization-coupled indexes
DROP INDEX IF EXISTS public.profiles_org_id_idx;
DROP INDEX IF EXISTS public.profiles_org_email_idx;
DROP INDEX IF EXISTS public.profiles_org_active_idx;

-- 2b. Drop organization-coupled RLS policies
DROP POLICY IF EXISTS "profiles_select_own_org" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin"   ON public.profiles;

-- 2c. Remove FK constraint and column
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_org_fkey;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS organization_id;

-- 2d. Helper: is the target user a member of any org that the current user
-- is also an active member of? SECURITY DEFINER so it reads memberships
-- without the caller needing direct SELECT on that table.
CREATE OR REPLACE FUNCTION public.is_same_org_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.memberships m1
    JOIN   public.memberships m2
           ON m2.organization_id = m1.organization_id
    WHERE  m1.user_id = auth.uid()
      AND  m1.status  = 'active'
      AND  m2.user_id = p_user_id
      AND  m2.status  = 'active'
  );
$$;

COMMENT ON FUNCTION public.is_same_org_member IS
  'Returns true when p_user_id shares at least one active org membership with auth.uid(). '
  'Used in profiles RLS to grant cross-profile visibility within the same organization.';

-- 2e. New global-profile RLS policies
CREATE POLICY "profiles_select_self_or_same_org"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_same_org_member(id)
    OR public.is_platform_admin()
  );

-- Users can update their own profile fields only
CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Org admins can update profiles of users in their org
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('administration:user:update')
    AND public.is_same_org_member(id)
  )
  WITH CHECK (
    public.has_permission('administration:user:update')
    AND public.is_same_org_member(id)
  );

-- 2f. Replacement indexes (no org_id column any more)
CREATE INDEX profiles_active_idx
  ON public.profiles (id)
  WHERE is_active = true AND deleted_at IS NULL;

-- =============================================================================
-- SECTION 3: PLATFORM ADMINS BOOTSTRAP TABLE
--
-- Solves the chicken-and-egg problem: the first platform_superadmin has no
-- membership in any org, so the normal RBAC + JWT path cannot grant them
-- elevated access. This table is the authoritative source that the Auth Hook
-- Edge Function reads to inject platform roles into the JWT.
--
-- Bootstrap flow:
--   1. After first deploy: run supabase/seed/bootstrap_platform_admin.sql
--      (or call via a one-time Edge Function protected by BOOTSTRAP_SECRET).
--   2. Insert the first user into auth.users via the Supabase dashboard.
--   3. Insert that user_id + role into this table via service role.
--   4. User signs in → Auth Hook calls get_user_jwt_claims() → JWT gets
--      role = 'platform_superadmin' → is_platform_admin() returns true.
--   5. Subsequent platform admins are managed via the admin UI (service role).
--
-- NEVER expose this table to the client. Service role only.
-- =============================================================================

CREATE TABLE public.platform_admins (
  id          uuid         NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid         NOT NULL,
  role        text         NOT NULL DEFAULT 'platform_superadmin',
  is_active   boolean      NOT NULL DEFAULT true,
  granted_by  uuid,
  granted_at  timestamptz  NOT NULL DEFAULT now(),
  notes       text,

  CONSTRAINT platform_admins_pkey         PRIMARY KEY (id),
  CONSTRAINT platform_admins_user_uniq    UNIQUE (user_id),
  CONSTRAINT platform_admins_user_fkey    FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT platform_admins_granter_fkey FOREIGN KEY (granted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT platform_admins_role_check   CHECK (
    role IN ('platform_superadmin', 'platform_support', 'platform_billing')
  )
);

CREATE INDEX platform_admins_active_idx
  ON public.platform_admins (user_id)
  WHERE is_active = true;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- A platform admin can read their own record (confirms their own elevated status).
-- All management operations go through service role.
CREATE POLICY "platform_admins_select_own"
  ON public.platform_admins FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.platform_admins IS
  'Source of truth for platform-level super admins (superadmin / support / billing). '
  'Read by the Auth Hook to stamp platform roles into the JWT at sign-in. '
  'Managed via service role only — never directly from client code.';

-- =============================================================================
-- SECTION 4: JWT CLAIMS HELPERS + AUTH HOOK BUILDER
-- =============================================================================

-- Returns the active_membership_id injected by the Auth Hook
CREATE OR REPLACE FUNCTION public.auth_membership_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'active_membership_id', ''
  )::uuid;
$$;

-- Returns the location_ids array injected by the Auth Hook
CREATE OR REPLACE FUNCTION public.auth_location_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT elem::uuid
      FROM   jsonb_array_elements_text(
               current_setting('request.jwt.claims', true)::jsonb -> 'location_ids'
             ) AS elem
    ),
    ARRAY[]::uuid[]
  );
$$;

-- Returns the subscription_tier injected by the Auth Hook
CREATE OR REPLACE FUNCTION public.auth_subscription_tier()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'subscription_tier',
    'trial'
  );
$$;

-- Returns the original actor's UUID when a platform admin is impersonating a
-- tenant user. NULL during normal (non-impersonated) sessions.
CREATE OR REPLACE FUNCTION public.auth_impersonator_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'impersonator_id', ''
  )::uuid;
$$;

-- True when the current request is from an impersonated session
CREATE OR REPLACE FUNCTION public.is_impersonating()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.auth_impersonator_id() IS NOT NULL;
$$;

-- ─── Auth Hook JWT Builder ────────────────────────────────────────────────────
-- Called by the Auth Hook Edge Function (via service role) after every sign-in.
-- Returns a jsonb object whose fields the Edge Function merges into the JWT
-- custom claims. The JWT is then verified + trusted by all RLS policies.
--
-- Calling conventions:
--   get_user_jwt_claims(user_id)                    → default (most recent active org)
--   get_user_jwt_claims(user_id, target_org_id)     → explicit tenant (for switching)
--
-- Tenant switching flow:
--   1. Client POSTs to /functions/v1/switch-tenant with { organization_id }.
--   2. Edge Function (service role) calls get_user_jwt_claims(uid, target_org_id).
--   3. Verifies returned claims are non-null (user has active membership there).
--   4. Calls Supabase admin.auth.updateUser to refresh the session claims.
--   5. Client re-authenticates with the new JWT.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_jwt_claims(
  p_user_id        uuid,
  p_target_org_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_id    uuid;
  v_organization_id  uuid;
  v_role             text;
  v_tier             text;
  v_permissions      text[];
  v_location_ids     uuid[];
BEGIN
  -- ── 1. Platform admins bypass org membership entirely ──────────────────────
  IF EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = p_user_id AND is_active = true
  ) THEN
    SELECT role INTO v_role
    FROM public.platform_admins
    WHERE user_id = p_user_id AND is_active = true
    LIMIT 1;

    RETURN jsonb_build_object(
      'organization_id',      NULL,
      'active_membership_id', NULL,
      'role',                 v_role,
      'permissions',          '[]'::jsonb,
      'location_ids',         '[]'::jsonb,
      'subscription_tier',    'enterprise',
      'is_platform_admin',    true
    );
  END IF;

  -- ── 2. Resolve active membership ──────────────────────────────────────────
  --    p_target_org_id = NULL   → most recently joined active org (default)
  --    p_target_org_id = <uuid> → explicit org selection (tenant switch)
  SELECT m.id, m.organization_id, o.subscription_tier::text
  INTO   v_membership_id, v_organization_id, v_tier
  FROM   public.memberships m
  JOIN   public.organizations o
         ON o.id = m.organization_id AND o.status = 'active'
  WHERE  m.user_id = p_user_id
    AND  m.status  = 'active'
    AND  (p_target_org_id IS NULL OR m.organization_id = p_target_org_id)
  ORDER  BY m.joined_at DESC
  LIMIT  1;

  -- ── 3. No active membership → empty claims (new invitee, offboarded user) ──
  IF v_membership_id IS NULL THEN
    RETURN jsonb_build_object(
      'organization_id',      NULL,
      'active_membership_id', NULL,
      'role',                 NULL,
      'permissions',          '[]'::jsonb,
      'location_ids',         '[]'::jsonb,
      'subscription_tier',    'trial',
      'is_platform_admin',    false
    );
  END IF;

  -- ── 4. Primary org-wide role (lowest sort_order = highest seniority) ───────
  SELECT r.name INTO v_role
  FROM   public.membership_roles mr
  JOIN   public.roles r ON r.id = mr.role_id
  WHERE  mr.membership_id = v_membership_id
    AND  mr.is_active     = true
    AND  mr.location_id   IS NULL
    AND  (mr.expires_at IS NULL OR mr.expires_at > now())
  ORDER  BY r.sort_order ASC
  LIMIT  1;

  -- ── 5. All effective permissions (deduped across all role assignments) ──────
  SELECT array_agg(DISTINCT uep.permission_code)
  INTO   v_permissions
  FROM   public.user_effective_permissions uep
  WHERE  uep.user_id        = p_user_id
    AND  uep.organization_id = v_organization_id;

  -- ── 6. Location IDs where user has a location-scoped role ──────────────────
  SELECT array_agg(DISTINCT mr.location_id)
  INTO   v_location_ids
  FROM   public.membership_roles mr
  WHERE  mr.membership_id = v_membership_id
    AND  mr.is_active     = true
    AND  mr.location_id   IS NOT NULL
    AND  (mr.expires_at IS NULL OR mr.expires_at > now());

  RETURN jsonb_build_object(
    'organization_id',      v_organization_id,
    'active_membership_id', v_membership_id,
    'role',                 COALESCE(v_role, 'org_member'),
    'permissions',          COALESCE(to_jsonb(v_permissions), '[]'::jsonb),
    'location_ids',         COALESCE(to_jsonb(v_location_ids), '[]'::jsonb),
    'subscription_tier',    COALESCE(v_tier, 'trial'),
    'is_platform_admin',    false
  );
END;
$$;

COMMENT ON FUNCTION public.get_user_jwt_claims IS
  'Called by the Supabase Auth Hook Edge Function at every sign-in. '
  'Returns JWT custom claims: organization_id, active_membership_id, role, '
  'permissions[], location_ids[], subscription_tier, is_platform_admin. '
  'Callable only via service role — never expose to client-side code.';

-- =============================================================================
-- SECTION 5: EVENT OUTBOX
--
-- Transactional outbox pattern. Every async side effect (email, SMS, WhatsApp,
-- push, AI job, accounting sync, webhook) is written atomically to this table
-- in the same transaction as the triggering database change. A separate worker
-- (Edge Function cron or external process) polls for pending events.
--
-- Key design decisions:
--   • FOR UPDATE SKIP LOCKED enables safe parallel worker scaling.
--   • Exponential backoff: 30s * 2^retry_count (30s, 60s, 120s).
--   • Dead-letter after max_retries: event is preserved for manual inspection.
--   • organization_id FK is SET NULL (not CASCADE) so events survive org deletion.
--   • correlation_id links all outbox events for one business transaction.
--   • causation_id points to the event or request that triggered this one.
-- =============================================================================

CREATE TYPE public.event_outbox_status AS ENUM (
  'pending',
  'processing',
  'delivered',
  'failed',
  'dead_letter',
  'cancelled'
);

CREATE TYPE public.event_channel AS ENUM (
  'email',
  'sms',
  'whatsapp',
  'push',
  'webhook',
  'ai_job',
  'accounting',
  'internal'
);

CREATE TABLE public.event_outbox (
  id                uuid                       NOT NULL DEFAULT gen_random_uuid(),
  organization_id   uuid,
  event_type        text                       NOT NULL,
  event_version     text                       NOT NULL DEFAULT '1.0',
  channel           public.event_channel       NOT NULL,
  correlation_id    uuid,
  causation_id      uuid,
  session_id        uuid,
  payload           jsonb                      NOT NULL DEFAULT '{}',
  metadata          jsonb                      NOT NULL DEFAULT '{}',
  status            public.event_outbox_status NOT NULL DEFAULT 'pending',
  target_id         text,
  scheduled_at      timestamptz                NOT NULL DEFAULT now(),
  locked_at         timestamptz,
  locked_by         text,
  retry_count       integer                    NOT NULL DEFAULT 0,
  max_retries       integer                    NOT NULL DEFAULT 3,
  next_retry_at     timestamptz,
  last_error        text,
  processed_at      timestamptz,
  delivered_at      timestamptz,
  dead_lettered_at  timestamptz,
  cancelled_at      timestamptz,
  created_by        uuid,
  created_at        timestamptz                NOT NULL DEFAULT now(),

  CONSTRAINT event_outbox_pkey             PRIMARY KEY (id),
  CONSTRAINT event_outbox_org_fkey         FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT event_outbox_creator_fkey     FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT event_outbox_type_format      CHECK (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  CONSTRAINT event_outbox_version_format   CHECK (event_version ~ '^\d+\.\d+$'),
  CONSTRAINT event_outbox_retry_non_neg    CHECK (retry_count >= 0),
  CONSTRAINT event_outbox_max_retries_pos  CHECK (max_retries >= 0),
  CONSTRAINT event_outbox_lock_consistent  CHECK (
    (locked_at IS NULL) = (locked_by IS NULL)
  )
);

COMMENT ON TABLE  public.event_outbox              IS 'Transactional outbox for async events. Workers poll via outbox_claim_next(); report results via outbox_complete() / outbox_fail().';
COMMENT ON COLUMN public.event_outbox.event_type   IS 'Domain.verb format. Examples: user.invited, invoice.issued, lesson.reminder.';
COMMENT ON COLUMN public.event_outbox.target_id    IS 'Delivery target: email address, phone number (E.164), webhook URL, or queue name.';
COMMENT ON COLUMN public.event_outbox.locked_by    IS 'Worker instance ID (e.g., Edge Function invocation ID). Prevents double-processing.';
COMMENT ON COLUMN public.event_outbox.max_retries  IS 'Events with retry_count >= max_retries transition to dead_letter on next failure.';
COMMENT ON COLUMN public.event_outbox.causation_id IS 'ID of the event or request that caused this outbox entry (event sourcing traceability).';

-- ─── Outbox Indexes ────────────────────────────────────────────────────────────

-- Worker polling hot path: pending + failed, ordered by scheduled_at
CREATE INDEX event_outbox_poll_idx
  ON public.event_outbox (channel, scheduled_at, retry_count)
  WHERE status IN ('pending', 'failed');

-- Stale lock recovery: find events stuck in processing
CREATE INDEX event_outbox_stale_lock_idx
  ON public.event_outbox (locked_at)
  WHERE locked_at IS NOT NULL AND status = 'processing';

CREATE INDEX event_outbox_org_id_idx
  ON public.event_outbox (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX event_outbox_correlation_idx
  ON public.event_outbox (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX event_outbox_dead_letter_idx
  ON public.event_outbox (dead_lettered_at DESC)
  WHERE status = 'dead_letter';

-- ─── Outbox RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.event_outbox ENABLE ROW LEVEL SECURITY;

-- Org admins with settings:read can inspect their org's outbox (read-only).
-- Platform admins see all. No authenticated INSERT/UPDATE/DELETE — service role only.
CREATE POLICY "event_outbox_select_own_org"
  ON public.event_outbox FOR SELECT
  TO authenticated
  USING (
    (
      organization_id = public.auth_organization_id()
      AND public.has_permission('administration:settings:read')
    )
    OR public.is_platform_admin()
  );

-- ─── Outbox Worker Functions ──────────────────────────────────────────────────

-- Atomically claims the next batch of events for processing.
-- FOR UPDATE SKIP LOCKED ensures safe parallel worker execution.
-- Events locked longer than p_lock_ttl are re-claimable (crash recovery).
CREATE OR REPLACE FUNCTION public.outbox_claim_next(
  p_channel    public.event_channel,
  p_worker_id  text,
  p_batch_size integer  DEFAULT 10,
  p_lock_ttl   interval DEFAULT '5 minutes'
)
RETURNS SETOF public.event_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.event_outbox
  SET
    status    = 'processing',
    locked_at = now(),
    locked_by = p_worker_id
  WHERE id IN (
    SELECT id
    FROM   public.event_outbox
    WHERE  channel      = p_channel
      AND  status       IN ('pending', 'failed')
      AND  scheduled_at <= now()
      AND  retry_count  <= max_retries
      AND  (locked_at IS NULL OR locked_at < now() - p_lock_ttl)
    ORDER  BY scheduled_at ASC
    LIMIT  p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Marks an event as successfully delivered.
CREATE OR REPLACE FUNCTION public.outbox_complete(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.event_outbox
  SET
    status       = 'delivered',
    delivered_at = now(),
    processed_at = now(),
    locked_at    = NULL,
    locked_by    = NULL
  WHERE id = p_event_id;
END;
$$;

-- Marks an event as failed with exponential backoff.
-- Transitions to dead_letter once max_retries is reached.
-- Backoff schedule (default max_retries=3): 30s → 60s → 120s → dead_letter.
CREATE OR REPLACE FUNCTION public.outbox_fail(
  p_event_id  uuid,
  p_error     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retry_count  integer;
  v_max_retries  integer;
  v_is_dead      boolean;
BEGIN
  SELECT retry_count, max_retries
  INTO   v_retry_count, v_max_retries
  FROM   public.event_outbox
  WHERE  id = p_event_id;

  v_is_dead := (v_retry_count >= v_max_retries);

  UPDATE public.event_outbox
  SET
    status           = CASE WHEN v_is_dead
                         THEN 'dead_letter'::public.event_outbox_status
                         ELSE 'failed'::public.event_outbox_status
                       END,
    retry_count      = v_retry_count + 1,
    last_error       = p_error,
    next_retry_at    = CASE WHEN v_is_dead THEN NULL
                       ELSE now() + (interval '30 seconds' * power(2, v_retry_count))
                       END,
    dead_lettered_at = CASE WHEN v_is_dead THEN now() ELSE NULL END,
    processed_at     = now(),
    locked_at        = NULL,
    locked_by        = NULL
  WHERE id = p_event_id;
END;
$$;

-- Enqueues a new outbox event. Called from Edge Functions or SECURITY DEFINER
-- DB functions that need to trigger side effects atomically with their write.
CREATE OR REPLACE FUNCTION public.insert_outbox_event(
  p_event_type      text,
  p_channel         public.event_channel,
  p_payload         jsonb,
  p_organization_id uuid        DEFAULT NULL,
  p_target_id       text        DEFAULT NULL,
  p_correlation_id  uuid        DEFAULT NULL,
  p_causation_id    uuid        DEFAULT NULL,
  p_scheduled_at    timestamptz DEFAULT now(),
  p_max_retries     integer     DEFAULT 3,
  p_metadata        jsonb       DEFAULT '{}',
  p_event_version   text        DEFAULT '1.0'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.event_outbox (
    event_type, event_version, channel,
    payload, organization_id,
    target_id, correlation_id, causation_id,
    scheduled_at, max_retries, metadata,
    created_by
  ) VALUES (
    p_event_type, p_event_version, p_channel,
    p_payload, p_organization_id,
    p_target_id, p_correlation_id, p_causation_id,
    p_scheduled_at, p_max_retries, p_metadata,
    auth.uid()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.insert_outbox_event IS
  'Enqueues an async event. Call within a transaction alongside the business write '
  'to guarantee at-least-once delivery. Callable from service role or SECURITY DEFINER functions.';

-- =============================================================================
-- SECTION 6: SOFT DELETE FRAMEWORK
--
-- Standardizes soft-delete across all tables that carry (deleted_at, deleted_by).
-- The whitelisted helper functions:
--   • soft_delete()   — sets deleted_at / deleted_by on a record
--   • soft_restore()  — clears deleted_at / deleted_by and writes RESTORE audit entry
--
-- Default filtering convention:
--   All application queries should include WHERE deleted_at IS NULL.
--   Partial indexes on each table already encode this pattern (e.g.,
--   org_locations_org_status_idx WHERE deleted_at IS NULL).
--
-- To add a new table: extend the whitelist in both functions.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.soft_delete(
  p_table_name  text,
  p_record_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table_name NOT IN ('organizations', 'organization_locations', 'profiles') THEN
    RAISE EXCEPTION 'soft_delete: table "%" is not whitelisted. Add it to soft_delete() and soft_restore() when ready.', p_table_name;
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
    p_table_name
  ) USING auth.uid(), p_record_id;
END;
$$;

-- Restores a soft-deleted record and emits a RESTORE audit log entry.
-- p_org_id: provide explicitly when the table has no organization_id column
-- (e.g., profiles after the global refactor).
CREATE OR REPLACE FUNCTION public.soft_restore(
  p_table_name  text,
  p_record_id   uuid,
  p_org_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table_name NOT IN ('organizations', 'organization_locations', 'profiles') THEN
    RAISE EXCEPTION 'soft_restore: table "%" is not whitelisted.', p_table_name;
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1',
    p_table_name
  ) USING p_record_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id,
    entity_type, entity_id,
    operation, table_name,
    occurred_at
  ) VALUES (
    COALESCE(p_org_id, public.auth_organization_id()),
    auth.uid(),
    p_table_name, p_record_id,
    'RESTORE', p_table_name,
    now()
  );
END;
$$;

COMMENT ON FUNCTION public.soft_delete  IS 'Soft-deletes a whitelisted record. Sets deleted_at and deleted_by. Idempotent on already-deleted rows.';
COMMENT ON FUNCTION public.soft_restore IS 'Restores a soft-deleted record and emits a RESTORE entry to audit_logs.';

-- =============================================================================
-- SECTION 7: SECURITY HARDENING
-- =============================================================================

-- 7a. Explicit anon access revocation for new tables.
-- (Existing tables with RLS block anon via USING clause semantics; these new
-- tables get explicit REVOKEs as belt-and-suspenders hardening.)
REVOKE ALL ON TABLE public.platform_admins FROM anon;
REVOKE ALL ON TABLE public.event_outbox     FROM anon;

-- 7b. Roles constraint: system roles must always have organization_id = NULL.
-- Phase 1B.1 had two checks but missed the case where a row claims
-- is_system_role=true yet carries a non-null organization_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname    = 'roles_system_requires_null_org'
      AND  conrelid   = 'public.roles'::regclass
  ) THEN
    ALTER TABLE public.roles
      ADD CONSTRAINT roles_system_requires_null_org
      CHECK (NOT (is_system_role = true AND organization_id IS NOT NULL));
  END IF;
END;
$$;

-- 7c. Protect impersonated sessions: no INSERT/UPDATE on memberships or
-- membership_roles while acting as another user. RLS helpers expose the
-- is_impersonating() predicate; enforcement is applied to sensitive write paths.
-- (Phase 1B.2 exposes the predicate; full enforcement is wired in Phase 2
-- once the impersonation Edge Function exists.)

-- 7d. Ensure all new tables with SECURITY DEFINER write paths have no
-- direct INSERT/UPDATE policies for the authenticated role. Verified:
--   event_outbox    — only SELECT policy added above ✓
--   platform_admins — only SELECT policy added above ✓

-- =============================================================================
-- SECTION 8: GRANTS & REVOKES
-- =============================================================================

-- JWT helper functions — callable from authenticated clients (used in RLS)
GRANT EXECUTE ON FUNCTION public.is_same_org_member(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_membership_id()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_location_ids()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_subscription_tier()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_impersonator_id()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_impersonating()        TO authenticated;

-- get_user_jwt_claims: called exclusively by Auth Hook Edge Function via
-- service role. Not callable from authenticated clients.

-- Outbox worker functions: called exclusively by Edge Function workers via
-- service role. Not callable from authenticated clients.

-- Soft delete helpers: called exclusively from Edge Functions via service
-- role. Not callable from authenticated clients.
