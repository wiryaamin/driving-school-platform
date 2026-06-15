-- =============================================================================
-- MIGRATION: 20260527000001_enterprise_foundation.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     1B.1 Enterprise Database Foundation
-- Description:
--   Core multi-tenant foundation: organizations, locations, profiles,
--   memberships, RBAC (roles/permissions), feature flags, audit & activity logs.
--   Includes RLS policies, indexes, helper functions, and seed data.
-- =============================================================================

-- =============================================================================
-- SECTION 1: EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4() fallback
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- trigram search on Swedish names
CREATE EXTENSION IF NOT EXISTS "unaccent";    -- accent-insensitive search (å ä ö)

-- =============================================================================
-- SECTION 2: CUSTOM ENUM TYPES
-- =============================================================================

CREATE TYPE public.organization_status AS ENUM (
  'active',
  'suspended',
  'terminated'
);

CREATE TYPE public.subscription_tier AS ENUM (
  'trial',
  'starter',
  'professional',
  'enterprise'
);

CREATE TYPE public.subscription_status AS ENUM (
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'suspended'
);

CREATE TYPE public.location_status AS ENUM (
  'active',
  'inactive',
  'archived'
);

CREATE TYPE public.membership_status AS ENUM (
  'active',
  'suspended',
  'removed'
);

CREATE TYPE public.audit_operation AS ENUM (
  'INSERT',
  'UPDATE',
  'DELETE',
  'RESTORE'
);

CREATE TYPE public.language_code AS ENUM (
  'sv',
  'en'
);

-- =============================================================================
-- SECTION 3: UTILITY FUNCTIONS
-- Must be created before tables so triggers can reference them.
-- =============================================================================

-- Automatically bumps updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- SECTION 4: AUTH HELPER FUNCTIONS
-- Read JWT custom claims injected by Supabase per request.
-- All are SECURITY DEFINER with fixed search_path to prevent search_path injection.
-- =============================================================================

-- Returns the organization_id from the current JWT claims
CREATE OR REPLACE FUNCTION public.auth_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id',
    ''
  )::uuid;
$$;

-- Returns the permissions array from the current JWT claims
CREATE OR REPLACE FUNCTION public.auth_user_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT jsonb_array_elements_text(
        (current_setting('request.jwt.claims', true)::jsonb -> 'permissions')
      )
    ),
    ARRAY[]::text[]
  );
$$;

-- Returns the role string from the current JWT claims
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  );
$$;

-- Returns true if the current user holds a specific permission
CREATE OR REPLACE FUNCTION public.has_permission(required_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT required_permission = ANY(public.auth_user_permissions());
$$;

-- Returns true if the current user holds ANY of the given permissions
CREATE OR REPLACE FUNCTION public.has_any_permission(required_permissions text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT required_permissions && public.auth_user_permissions();
$$;

-- Returns true for platform-level administrators (bypasses tenant isolation in RLS)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_role() = ANY(
    ARRAY['platform_superadmin', 'platform_support', 'platform_billing']
  );
$$;

-- Returns true for organization-level owners and admins
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_role() = ANY(ARRAY['org_owner', 'org_admin']);
$$;

-- =============================================================================
-- SECTION 5: WRITE HELPER FUNCTIONS (SECURITY DEFINER)
-- Bypass RLS for trusted server-side writes. Called only from Edge Functions
-- using the service role key — never exposed to client code.
-- =============================================================================

-- Inserts an audit log entry. SECURITY DEFINER bypasses the no-INSERT RLS policy.
-- Audit logs are immutable: once inserted, no UPDATE or DELETE is permitted.
CREATE OR REPLACE FUNCTION public.insert_audit_log(
  p_organization_id  uuid,
  p_actor_id         uuid,
  p_actor_email      text,
  p_entity_type      text,
  p_entity_id        uuid,
  p_operation        public.audit_operation,
  p_table_name       text,
  p_old_values       jsonb    DEFAULT NULL,
  p_new_values       jsonb    DEFAULT NULL,
  p_changed_fields   text[]   DEFAULT NULL,
  p_ip_address       inet     DEFAULT NULL,
  p_user_agent       text     DEFAULT NULL,
  p_request_id       uuid     DEFAULT NULL,
  p_correlation_id   uuid     DEFAULT NULL,
  p_causation_id     uuid     DEFAULT NULL,
  p_session_id       uuid     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_logs (
    organization_id, actor_id, actor_email,
    entity_type, entity_id, operation, table_name,
    old_values, new_values, changed_fields,
    ip_address, user_agent,
    request_id, correlation_id, causation_id, session_id
  ) VALUES (
    p_organization_id, p_actor_id, p_actor_email,
    p_entity_type, p_entity_id, p_operation, p_table_name,
    p_old_values, p_new_values, p_changed_fields,
    p_ip_address, p_user_agent,
    p_request_id, p_correlation_id, p_causation_id, p_session_id
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Inserts an activity log entry. Called from Edge Functions via service role.
CREATE OR REPLACE FUNCTION public.insert_activity_log(
  p_organization_id  uuid,
  p_user_id          uuid,
  p_user_email       text,
  p_action           text,
  p_description      text     DEFAULT NULL,
  p_entity_type      text     DEFAULT NULL,
  p_entity_id        uuid     DEFAULT NULL,
  p_metadata         jsonb    DEFAULT '{}',
  p_ip_address       inet     DEFAULT NULL,
  p_user_agent       text     DEFAULT NULL,
  p_session_id       uuid     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.activity_logs (
    organization_id, user_id, user_email,
    action, description, entity_type, entity_id,
    metadata, ip_address, user_agent, session_id
  ) VALUES (
    p_organization_id, p_user_id, p_user_email,
    p_action, p_description, p_entity_type, p_entity_id,
    p_metadata, p_ip_address, p_user_agent, p_session_id
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Generic audit trigger function. Attach to any auditable table.
-- Pass the organization column name as TG_ARGV[0] (default: 'organization_id').
-- For the organizations table itself, pass 'id'.
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_col        text    := COALESCE(TG_ARGV[0], 'organization_id');
  v_org_id         uuid;
  v_old_data       jsonb;
  v_new_data       jsonb;
  v_changed_fields text[];
BEGIN
  v_old_data := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new_data := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;

  v_org_id := CASE
    WHEN TG_OP = 'DELETE' THEN (v_old_data ->> v_org_col)::uuid
    ELSE                       (v_new_data ->> v_org_col)::uuid
  END;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key)
    INTO v_changed_fields
    FROM jsonb_each(v_new_data) AS n(key, val)
    JOIN jsonb_each(v_old_data) AS o(key, val) USING (key)
    WHERE n.val IS DISTINCT FROM o.val
      AND n.key NOT IN ('updated_at');  -- suppress noise
  END IF;

  INSERT INTO public.audit_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    operation,
    table_name,
    old_values,
    new_values,
    changed_fields,
    occurred_at
  ) VALUES (
    v_org_id,
    auth.uid(),
    TG_TABLE_NAME,
    COALESCE((v_new_data ->> 'id')::uuid, (v_old_data ->> 'id')::uuid),
    TG_OP::public.audit_operation,
    TG_TABLE_NAME,
    v_old_data,
    v_new_data,
    v_changed_fields,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.audit_trigger_fn IS
  'Generic SECURITY DEFINER trigger. Attach via: EXECUTE FUNCTION public.audit_trigger_fn(). '
  'Pass org column as first arg, e.g. audit_trigger_fn(''id'') for the organizations table.';

-- Denormalizes organization_id onto membership_roles from its parent membership.
-- Fires BEFORE INSERT to guarantee consistency without requiring the caller to supply it.
CREATE OR REPLACE FUNCTION public.membership_roles_set_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT organization_id
  INTO NEW.organization_id
  FROM public.memberships
  WHERE id = NEW.membership_id;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'membership_roles: could not resolve organization_id for membership %', NEW.membership_id;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- SECTION 6: TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 6.1 ORGANIZATIONS
-- Top-level tenant entity. One per driving school company.
-- All other tenant data pivots on organization_id.
-- ---------------------------------------------------------------------------
CREATE TABLE public.organizations (
  id                   uuid                        NOT NULL DEFAULT gen_random_uuid(),
  slug                 text                        NOT NULL,
  name                 text                        NOT NULL,
  legal_name           text                        NOT NULL,
  org_number           text,
  vat_number           text,
  status               public.organization_status  NOT NULL DEFAULT 'active',
  subscription_tier    public.subscription_tier    NOT NULL DEFAULT 'trial',
  subscription_status  public.subscription_status  NOT NULL DEFAULT 'trialing',
  trial_ends_at        timestamptz,
  max_locations        integer                     NOT NULL DEFAULT 1,
  max_users            integer                     NOT NULL DEFAULT 5,
  settings             jsonb                       NOT NULL DEFAULT '{}',
  metadata             jsonb                       NOT NULL DEFAULT '{}',
  created_at           timestamptz                 NOT NULL DEFAULT now(),
  updated_at           timestamptz                 NOT NULL DEFAULT now(),
  created_by           uuid                        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           uuid                        REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at           timestamptz,
  deleted_by           uuid                        REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT organizations_pkey             PRIMARY KEY (id),
  CONSTRAINT organizations_slug_key         UNIQUE (slug),
  CONSTRAINT organizations_slug_format      CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$'),
  CONSTRAINT organizations_max_locations_gt0 CHECK (max_locations > 0),
  CONSTRAINT organizations_max_users_gt0    CHECK (max_users > 0)
);

COMMENT ON TABLE  public.organizations                   IS 'Top-level tenant entity. Each driving school company = one organization.';
COMMENT ON COLUMN public.organizations.slug              IS 'URL-safe unique identifier. Used in subdomains and public-facing URLs.';
COMMENT ON COLUMN public.organizations.org_number        IS 'Swedish organisationsnummer. Format: XXXXXX-XXXX.';
COMMENT ON COLUMN public.organizations.vat_number        IS 'Swedish momsregistreringsnummer. Format: SE + 10 digits.';
COMMENT ON COLUMN public.organizations.settings          IS 'Tenant config: timezone, currency, locale, branding, email sender, etc.';
COMMENT ON COLUMN public.organizations.metadata          IS 'Platform metadata: billing IDs, migration flags, integration refs, etc.';

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Platform system sentinel: required by compliance_events FK for platform-level events.
-- Never used as a tenant; exists only so SECURITY DEFINER functions can log system events.
INSERT INTO public.organizations (id, slug, name, legal_name)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'platform-system',
  'Platform System',
  'Platform System'
) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER organizations_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('id');

-- ---------------------------------------------------------------------------
-- 6.2 ORGANIZATION_LOCATIONS
-- Physical branches / offices of a driving school.
-- An org can have one or many locations; one must be marked is_primary.
-- ---------------------------------------------------------------------------
CREATE TABLE public.organization_locations (
  id               uuid                    NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid                    NOT NULL,
  name             text                    NOT NULL,
  address_line1    text                    NOT NULL,
  address_line2    text,
  postal_code      text                    NOT NULL,
  city             text                    NOT NULL,
  county           text,
  country          text                    NOT NULL DEFAULT 'SE',
  phone            text,
  email            text,
  is_primary       boolean                 NOT NULL DEFAULT false,
  status           public.location_status  NOT NULL DEFAULT 'active',
  settings         jsonb                   NOT NULL DEFAULT '{}',
  metadata         jsonb                   NOT NULL DEFAULT '{}',
  created_at       timestamptz             NOT NULL DEFAULT now(),
  updated_at       timestamptz             NOT NULL DEFAULT now(),
  created_by       uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by       uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at       timestamptz,
  deleted_by       uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT organization_locations_pkey       PRIMARY KEY (id),
  CONSTRAINT organization_locations_org_fkey   FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT organization_locations_postal_fmt CHECK (postal_code ~ '^\d{3}\s?\d{2}$'),
  CONSTRAINT organization_locations_country_2  CHECK (char_length(country) = 2)
);

-- Enforce exactly one primary location per organization at any time
CREATE UNIQUE INDEX organization_locations_one_primary
  ON public.organization_locations (organization_id)
  WHERE is_primary = true AND deleted_at IS NULL;

COMMENT ON TABLE  public.organization_locations            IS 'Physical branches of an organization. Enables multi-location driving schools.';
COMMENT ON COLUMN public.organization_locations.is_primary IS 'Marks the main/primary branch. Enforced unique per org via partial index.';
COMMENT ON COLUMN public.organization_locations.county     IS 'Swedish county (län). Free-text; not constrained to a lookup table.';

CREATE TRIGGER organization_locations_set_updated_at
  BEFORE UPDATE ON public.organization_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER organization_locations_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_locations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 6.3 PROFILES
-- Public user profile. id = auth.users(id) (one-to-one, enforced by FK).
-- Tenant-scoped: every profile belongs to exactly one organization.
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id                   uuid                  NOT NULL,
  organization_id      uuid                  NOT NULL,
  first_name           text                  NOT NULL,
  last_name            text                  NOT NULL,
  email                text                  NOT NULL,
  phone                text,
  avatar_url           text,
  language_preference  public.language_code  NOT NULL DEFAULT 'sv',
  is_active            boolean               NOT NULL DEFAULT true,
  last_seen_at         timestamptz,
  invited_by           uuid                  REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at           timestamptz,
  onboarded_at         timestamptz,
  settings             jsonb                 NOT NULL DEFAULT '{}',
  metadata             jsonb                 NOT NULL DEFAULT '{}',
  created_at           timestamptz           NOT NULL DEFAULT now(),
  updated_at           timestamptz           NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  deleted_by           uuid                  REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT profiles_pkey           PRIMARY KEY (id),
  CONSTRAINT profiles_auth_user_fkey FOREIGN KEY (id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_org_fkey       FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT profiles_email_format   CHECK (
    email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'
  )
);

COMMENT ON TABLE  public.profiles                       IS 'User profile data. id mirrors auth.users(id). Tenant-scoped.';
COMMENT ON COLUMN public.profiles.id                   IS 'Same UUID as auth.users(id). One-to-one enforced by FK.';
COMMENT ON COLUMN public.profiles.language_preference  IS 'Admin users default to sv. Student-facing app may use en.';

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 6.4 MEMBERSHIPS
-- User ↔ Organization association. Supports future multi-org users
-- (e.g., an instructor who works at two driving schools).
-- ---------------------------------------------------------------------------
CREATE TABLE public.memberships (
  id               uuid                      NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid                      NOT NULL,
  organization_id  uuid                      NOT NULL,
  status           public.membership_status  NOT NULL DEFAULT 'active',
  joined_at        timestamptz               NOT NULL DEFAULT now(),
  suspended_at     timestamptz,
  suspended_by     uuid                      REFERENCES auth.users(id) ON DELETE SET NULL,
  removed_at       timestamptz,
  removed_by       uuid                      REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata         jsonb                     NOT NULL DEFAULT '{}',
  created_at       timestamptz               NOT NULL DEFAULT now(),
  updated_at       timestamptz               NOT NULL DEFAULT now(),

  CONSTRAINT memberships_pkey             PRIMARY KEY (id),
  CONSTRAINT memberships_user_fkey        FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT memberships_org_fkey         FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT memberships_user_org_uniq    UNIQUE (user_id, organization_id),
  CONSTRAINT memberships_suspended_check  CHECK (suspended_at IS NULL OR status = 'suspended'),
  CONSTRAINT memberships_removed_check    CHECK (removed_at   IS NULL OR status = 'removed')
);

COMMENT ON TABLE public.memberships IS
  'Joins users to organizations. One row per user-org pair. '
  'Supports multi-org membership (e.g., instructor at two schools).';

CREATE TRIGGER memberships_set_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER memberships_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 6.5 ROLES
-- RBAC roles. System roles (is_system_role=true, organization_id=NULL) are
-- platform-wide defaults available to all tenants.
-- Organizations may create custom roles (is_custom=true, organization_id=<id>).
-- ---------------------------------------------------------------------------
CREATE TABLE public.roles (
  id               uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid,
  name             text         NOT NULL,
  display_name     text         NOT NULL,
  description      text,
  is_system_role   boolean      NOT NULL DEFAULT false,
  is_custom        boolean      NOT NULL DEFAULT false,
  sort_order       integer      NOT NULL DEFAULT 0,
  metadata         jsonb        NOT NULL DEFAULT '{}',
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT roles_pkey                     PRIMARY KEY (id),
  CONSTRAINT roles_org_fkey                 FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT roles_system_not_custom_check  CHECK (NOT (is_system_role = true AND is_custom = true)),
  CONSTRAINT roles_custom_needs_org_check   CHECK (NOT (is_custom = true AND organization_id IS NULL))
);

-- System roles have NULL org_id; NULLS NOT DISTINCT enforces unique name even for NULLs
CREATE UNIQUE INDEX roles_name_org_uniq
  ON public.roles (name, organization_id)
  NULLS NOT DISTINCT;

COMMENT ON TABLE  public.roles                 IS 'RBAC roles. System roles are platform defaults (organization_id=NULL). Custom roles are tenant-created.';
COMMENT ON COLUMN public.roles.display_name    IS 'Localized display name shown in the UI. Swedish for admin roles.';
COMMENT ON COLUMN public.roles.is_system_role  IS 'Platform-managed role. Cannot be modified or deleted by tenants.';
COMMENT ON COLUMN public.roles.is_custom       IS 'Tenant-created custom role. Must have organization_id.';

CREATE TRIGGER roles_set_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6.6 PERMISSIONS
-- Atomic permission codes in the format domain:resource:action.
-- Managed by the platform; tenants cannot create permissions.
-- ---------------------------------------------------------------------------
CREATE TABLE public.permissions (
  id           uuid         NOT NULL DEFAULT gen_random_uuid(),
  code         text         NOT NULL,
  domain       text         NOT NULL,
  resource     text         NOT NULL,
  action       text         NOT NULL,
  description  text,
  is_active    boolean      NOT NULL DEFAULT true,
  created_at   timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT permissions_pkey         PRIMARY KEY (id),
  CONSTRAINT permissions_code_key     UNIQUE (code),
  CONSTRAINT permissions_code_format  CHECK (code ~ '^[a-z_]+:[a-z_]+:[a-z_]+$'),
  CONSTRAINT permissions_action_check CHECK (
    action IN (
      'create', 'read', 'update', 'delete',
      'export', 'import',
      'approve', 'void',
      'assign', 'advance', 'archive',
      'run',
      'manage',
      'configure',
      'send'
    )
  )
);

COMMENT ON TABLE  public.permissions       IS 'Atomic RBAC permissions. Platform-managed. Format: domain:resource:action.';
COMMENT ON COLUMN public.permissions.code  IS 'Unique permission code. Example: students:student:create.';

-- ---------------------------------------------------------------------------
-- 6.7 ROLE_PERMISSIONS
-- Many-to-many: grants permissions to roles.
-- ---------------------------------------------------------------------------
CREATE TABLE public.role_permissions (
  id             uuid         NOT NULL DEFAULT gen_random_uuid(),
  role_id        uuid         NOT NULL,
  permission_id  uuid         NOT NULL,
  granted_by     uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at     timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT role_permissions_pkey       PRIMARY KEY (id),
  CONSTRAINT role_permissions_role_fkey  FOREIGN KEY (role_id)
    REFERENCES public.roles(id) ON DELETE CASCADE,
  CONSTRAINT role_permissions_perm_fkey  FOREIGN KEY (permission_id)
    REFERENCES public.permissions(id) ON DELETE CASCADE,
  CONSTRAINT role_permissions_uniq       UNIQUE (role_id, permission_id)
);

COMMENT ON TABLE public.role_permissions IS 'Grants permissions to roles. Many-to-many junction.';

-- ---------------------------------------------------------------------------
-- 6.8 MEMBERSHIP_ROLES
-- Assigns roles to a user-org membership, optionally scoped to a location.
-- location_id IS NULL   = org-wide scope.
-- location_id IS NOT NULL = role restricted to that specific branch.
-- organization_id is denormalized from memberships for RLS/audit performance.
-- ---------------------------------------------------------------------------
CREATE TABLE public.membership_roles (
  id               uuid         NOT NULL DEFAULT gen_random_uuid(),
  membership_id    uuid         NOT NULL,
  organization_id  uuid         NOT NULL,
  role_id          uuid         NOT NULL,
  location_id      uuid,
  assigned_by      uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at      timestamptz  NOT NULL DEFAULT now(),
  expires_at       timestamptz,
  is_active        boolean      NOT NULL DEFAULT true,
  metadata         jsonb        NOT NULL DEFAULT '{}',

  CONSTRAINT membership_roles_pkey            PRIMARY KEY (id),
  CONSTRAINT membership_roles_membership_fkey FOREIGN KEY (membership_id)
    REFERENCES public.memberships(id) ON DELETE CASCADE,
  CONSTRAINT membership_roles_org_fkey        FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT membership_roles_role_fkey       FOREIGN KEY (role_id)
    REFERENCES public.roles(id) ON DELETE RESTRICT,
  CONSTRAINT membership_roles_location_fkey   FOREIGN KEY (location_id)
    REFERENCES public.organization_locations(id) ON DELETE SET NULL
);

-- No duplicate org-wide assignment for the same role
CREATE UNIQUE INDEX membership_roles_org_scope_uniq
  ON public.membership_roles (membership_id, role_id)
  WHERE location_id IS NULL;

-- No duplicate location-scoped assignment for the same role+location
CREATE UNIQUE INDEX membership_roles_loc_scope_uniq
  ON public.membership_roles (membership_id, role_id, location_id)
  WHERE location_id IS NOT NULL;

COMMENT ON TABLE  public.membership_roles                IS 'Assigns RBAC roles to user memberships. Optionally scoped to a single location.';
COMMENT ON COLUMN public.membership_roles.organization_id IS 'Denormalized from memberships for RLS and audit performance. Set by trigger.';
COMMENT ON COLUMN public.membership_roles.location_id    IS 'NULL = org-wide. Non-null = role restricted to this location.';
COMMENT ON COLUMN public.membership_roles.expires_at     IS 'Temporal role grant (acting manager, temp access). NULL = permanent.';

-- Auto-populate organization_id from the parent membership
CREATE TRIGGER membership_roles_set_org_id
  BEFORE INSERT ON public.membership_roles
  FOR EACH ROW EXECUTE FUNCTION public.membership_roles_set_org_id();

CREATE TRIGGER membership_roles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.membership_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 6.9 FEATURE_FLAGS
-- Per-organization feature gating for module enablement and subscription plans.
-- Global flags (organization_id IS NULL) apply platform-wide.
-- ---------------------------------------------------------------------------
CREATE TABLE public.feature_flags (
  id                  uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid,
  flag_key            text         NOT NULL,
  is_enabled          boolean      NOT NULL DEFAULT false,
  rollout_percentage  integer      NOT NULL DEFAULT 100,
  config              jsonb        NOT NULL DEFAULT '{}',
  description         text,
  enabled_at          timestamptz,
  disabled_at         timestamptz,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT feature_flags_pkey         PRIMARY KEY (id),
  CONSTRAINT feature_flags_org_fkey     FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT feature_flags_rollout_range CHECK (rollout_percentage BETWEEN 0 AND 100),
  CONSTRAINT feature_flags_key_format   CHECK (flag_key ~ '^[a-z][a-z0-9_]*$')
);

-- One flag_key per org (NULL org = global; NULLS NOT DISTINCT treats NULLs as equal)
CREATE UNIQUE INDEX feature_flags_org_flag_uniq
  ON public.feature_flags (organization_id, flag_key)
  NULLS NOT DISTINCT;

COMMENT ON TABLE  public.feature_flags                      IS 'Feature flags for module gating, subscription tiers, and gradual rollouts.';
COMMENT ON COLUMN public.feature_flags.flag_key             IS 'Snake-case flag key. Convention: module_<name> or feature_<name>.';
COMMENT ON COLUMN public.feature_flags.organization_id      IS 'NULL = global flag visible to all orgs.';
COMMENT ON COLUMN public.feature_flags.rollout_percentage   IS 'For gradual rollouts: 0–100. 100 means all eligible orgs see this as enabled.';

CREATE TRIGGER feature_flags_set_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6.10 AUDIT_LOGS
-- Immutable ledger of every state-changing operation.
-- Accounting-grade: no UPDATE or DELETE policies exist on this table.
-- organization_id has no FK so records survive org deletion (archival safety).
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id               uuid                    NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid                    NOT NULL,
  actor_id         uuid,
  actor_email      text,
  entity_type      text                    NOT NULL,
  entity_id        uuid                    NOT NULL,
  operation        public.audit_operation  NOT NULL,
  table_name       text                    NOT NULL,
  old_values       jsonb,
  new_values       jsonb,
  changed_fields   text[],
  ip_address       inet,
  user_agent       text,
  request_id       uuid,
  correlation_id   uuid,
  causation_id     uuid,
  session_id       uuid,
  occurred_at      timestamptz             NOT NULL DEFAULT now(),

  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
  -- Intentionally no FK on organization_id: audit records must outlive organizations.
);

COMMENT ON TABLE  public.audit_logs                  IS 'Immutable audit trail. Never UPDATE or DELETE. Accounting-grade traceability.';
COMMENT ON COLUMN public.audit_logs.organization_id  IS 'Denormalized (no FK) for archival safety — survives org deletion.';
COMMENT ON COLUMN public.audit_logs.actor_id         IS 'NULL for system/automated actions (batch jobs, migrations).';
COMMENT ON COLUMN public.audit_logs.old_values       IS 'Full row snapshot before change. NULL for INSERT.';
COMMENT ON COLUMN public.audit_logs.new_values       IS 'Full row snapshot after change. NULL for DELETE.';
COMMENT ON COLUMN public.audit_logs.changed_fields   IS 'Column names that changed. Only set for UPDATE.';
COMMENT ON COLUMN public.audit_logs.correlation_id   IS 'Links all DB operations from the same business request.';
COMMENT ON COLUMN public.audit_logs.causation_id     IS 'The event/request that caused this change (parent event ID).';

-- ---------------------------------------------------------------------------
-- 6.11 ACTIVITY_LOGS
-- Business-level activity stream. Higher-level than audit_logs.
-- Tracks user actions in domain terms ("student enrolled", "invoice paid").
-- Used for user-facing history, notifications, and operational reporting.
-- ---------------------------------------------------------------------------
CREATE TABLE public.activity_logs (
  id               uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid         NOT NULL,
  user_id          uuid,
  user_email       text,
  action           text         NOT NULL,
  description      text,
  entity_type      text,
  entity_id        uuid,
  metadata         jsonb        NOT NULL DEFAULT '{}',
  ip_address       inet,
  user_agent       text,
  session_id       uuid,
  occurred_at      timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT activity_logs_pkey          PRIMARY KEY (id),
  CONSTRAINT activity_logs_action_format CHECK (action ~ '^[a-z_]+\.[a-z_]+$')
);

COMMENT ON TABLE  public.activity_logs          IS 'Business-level activity stream. Used for user-facing history and dashboards.';
COMMENT ON COLUMN public.activity_logs.action   IS 'Domain.verb format. Examples: user.login, student.enrolled, invoice.paid.';

-- =============================================================================
-- SECTION 7: INDEXES
-- Covering the critical query patterns: tenant isolation, RBAC lookups,
-- entity lookups, time-range queries, and soft-delete filtering.
-- =============================================================================

-- organizations
CREATE INDEX organizations_status_tier_idx     ON public.organizations (status, subscription_tier);
CREATE INDEX organizations_deleted_at_idx      ON public.organizations (deleted_at) WHERE deleted_at IS NOT NULL;

-- organization_locations
CREATE INDEX org_locations_org_id_idx          ON public.organization_locations (organization_id);
CREATE INDEX org_locations_org_status_idx      ON public.organization_locations (organization_id, status)
  WHERE deleted_at IS NULL;

-- profiles
CREATE INDEX profiles_org_id_idx               ON public.profiles (organization_id);
CREATE INDEX profiles_email_idx                ON public.profiles (email);
CREATE INDEX profiles_org_email_idx            ON public.profiles (organization_id, email);
CREATE INDEX profiles_org_active_idx           ON public.profiles (organization_id)
  WHERE is_active = true AND deleted_at IS NULL;

-- memberships
CREATE INDEX memberships_user_id_idx           ON public.memberships (user_id);
CREATE INDEX memberships_org_id_idx            ON public.memberships (organization_id);
CREATE INDEX memberships_org_status_idx        ON public.memberships (organization_id, status);

-- roles
CREATE INDEX roles_org_id_idx                  ON public.roles (organization_id);
CREATE INDEX roles_system_idx                  ON public.roles (id) WHERE is_system_role = true;

-- permissions
CREATE INDEX permissions_domain_idx            ON public.permissions (domain);
CREATE INDEX permissions_active_idx            ON public.permissions (domain, action) WHERE is_active = true;

-- role_permissions
CREATE INDEX role_permissions_role_id_idx      ON public.role_permissions (role_id);
CREATE INDEX role_permissions_perm_id_idx      ON public.role_permissions (permission_id);

-- membership_roles  (hot path for RBAC JWT enrichment)
CREATE INDEX membership_roles_membership_idx   ON public.membership_roles (membership_id);
CREATE INDEX membership_roles_org_id_idx       ON public.membership_roles (organization_id);
CREATE INDEX membership_roles_role_id_idx      ON public.membership_roles (role_id);
CREATE INDEX membership_roles_active_idx       ON public.membership_roles (membership_id, is_active)
  WHERE is_active = true;
CREATE INDEX membership_roles_location_idx     ON public.membership_roles (location_id)
  WHERE location_id IS NOT NULL;

-- feature_flags
CREATE INDEX feature_flags_org_id_idx          ON public.feature_flags (organization_id);
CREATE INDEX feature_flags_global_idx          ON public.feature_flags (flag_key) WHERE organization_id IS NULL;
CREATE INDEX feature_flags_enabled_idx         ON public.feature_flags (organization_id, flag_key)
  WHERE is_enabled = true;

-- audit_logs  (high-volume; descending time for pagination)
CREATE INDEX audit_logs_org_id_idx             ON public.audit_logs (organization_id);
CREATE INDEX audit_logs_entity_idx             ON public.audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_actor_id_idx           ON public.audit_logs (actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX audit_logs_occurred_at_idx        ON public.audit_logs (occurred_at DESC);
CREATE INDEX audit_logs_org_time_idx           ON public.audit_logs (organization_id, occurred_at DESC);
CREATE INDEX audit_logs_org_entity_idx         ON public.audit_logs (organization_id, entity_type, entity_id);
CREATE INDEX audit_logs_correlation_idx        ON public.audit_logs (correlation_id) WHERE correlation_id IS NOT NULL;

-- activity_logs
CREATE INDEX activity_logs_org_id_idx          ON public.activity_logs (organization_id);
CREATE INDEX activity_logs_user_id_idx         ON public.activity_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX activity_logs_action_idx          ON public.activity_logs (action);
CREATE INDEX activity_logs_occurred_at_idx     ON public.activity_logs (occurred_at DESC);
CREATE INDEX activity_logs_org_time_idx        ON public.activity_logs (organization_id, occurred_at DESC);
CREATE INDEX activity_logs_entity_idx          ON public.activity_logs (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- =============================================================================
-- SECTION 8: ROW LEVEL SECURITY
-- Tenant isolation enforced at the database layer.
-- Every policy checks organization_id from the JWT claim before touching data.
-- =============================================================================

ALTER TABLE public.organizations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_roles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs          ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS: organizations
-- Tenants see only their own org. Platform admins see all.
-- Org INSERT/UPDATE performed via service role in onboarding flows.
-- ---------------------------------------------------------------------------
CREATE POLICY "organizations_select_own"
  ON public.organizations FOR SELECT
  USING (
    id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "organizations_insert_platform"
  ON public.organizations FOR INSERT
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "organizations_update_own_admin"
  ON public.organizations FOR UPDATE
  USING (
    id = public.auth_organization_id()
    AND public.has_permission('administration:organization:update')
  )
  WITH CHECK (
    id = public.auth_organization_id()
    AND public.has_permission('administration:organization:update')
  );

CREATE POLICY "organizations_update_platform"
  ON public.organizations FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- RLS: organization_locations
-- ---------------------------------------------------------------------------
CREATE POLICY "org_locations_select_own"
  ON public.organization_locations FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "org_locations_insert_admin"
  ON public.organization_locations FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:location:create')
  );

CREATE POLICY "org_locations_update_admin"
  ON public.organization_locations FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:location:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:location:update')
  );

CREATE POLICY "org_locations_delete_admin"
  ON public.organization_locations FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:location:delete')
  );

-- ---------------------------------------------------------------------------
-- RLS: profiles
-- Users can read all profiles in their org. Users can update only their own
-- profile (or org admins can update any profile in their org).
-- INSERT/DELETE via service role only (invite and offboarding flows).
-- ---------------------------------------------------------------------------
CREATE POLICY "profiles_select_own_org"
  ON public.profiles FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR id = auth.uid()
    OR public.is_platform_admin()
  );

CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND organization_id = public.auth_organization_id()
  );

CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:user:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:user:update')
  );

-- ---------------------------------------------------------------------------
-- RLS: memberships
-- ---------------------------------------------------------------------------
CREATE POLICY "memberships_select_own_org"
  ON public.memberships FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR user_id = auth.uid()
    OR public.is_platform_admin()
  );

CREATE POLICY "memberships_insert_admin"
  ON public.memberships FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:user:create')
  );

CREATE POLICY "memberships_update_admin"
  ON public.memberships FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:user:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:user:update')
  );

-- ---------------------------------------------------------------------------
-- RLS: roles
-- System roles (is_system_role=true) are visible to all authenticated users.
-- Org-custom roles are visible only to their owning organization.
-- Only org admins may create/modify/delete custom roles.
-- System roles are immutable from tenant scope.
-- ---------------------------------------------------------------------------
CREATE POLICY "roles_select_system_and_own"
  ON public.roles FOR SELECT
  USING (
    is_system_role = true
    OR organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "roles_insert_admin"
  ON public.roles FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:role:create')
    AND is_custom = true
  );

CREATE POLICY "roles_update_admin"
  ON public.roles FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:role:update')
    AND is_system_role = false
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:role:update')
    AND is_system_role = false
  );

CREATE POLICY "roles_delete_admin"
  ON public.roles FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:role:delete')
    AND is_custom = true
  );

-- ---------------------------------------------------------------------------
-- RLS: permissions
-- Read-only for all authenticated users.
-- Mutations via service role only (platform-managed catalog).
-- ---------------------------------------------------------------------------
CREATE POLICY "permissions_select_authenticated"
  ON public.permissions FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ---------------------------------------------------------------------------
-- RLS: role_permissions
-- ---------------------------------------------------------------------------
CREATE POLICY "role_permissions_select"
  ON public.role_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND (r.is_system_role = true OR r.organization_id = public.auth_organization_id())
    )
    OR public.is_platform_admin()
  );

CREATE POLICY "role_permissions_insert_admin"
  ON public.role_permissions FOR INSERT
  WITH CHECK (
    public.has_permission('administration:role:update')
    AND EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND r.organization_id = public.auth_organization_id()
        AND r.is_custom = true
    )
  );

CREATE POLICY "role_permissions_delete_admin"
  ON public.role_permissions FOR DELETE
  USING (
    public.has_permission('administration:role:update')
    AND EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_id
        AND r.organization_id = public.auth_organization_id()
        AND r.is_custom = true
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: membership_roles
-- organization_id is denormalized, enabling direct tenant-isolation check.
-- ---------------------------------------------------------------------------
CREATE POLICY "membership_roles_select_own_org"
  ON public.membership_roles FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = membership_id AND m.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

CREATE POLICY "membership_roles_insert_admin"
  ON public.membership_roles FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:user:update')
  );

CREATE POLICY "membership_roles_update_admin"
  ON public.membership_roles FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:user:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('administration:user:update')
  );

-- ---------------------------------------------------------------------------
-- RLS: feature_flags
-- Global flags (organization_id IS NULL) are readable by all authenticated users.
-- Mutations are platform-admin only.
-- ---------------------------------------------------------------------------
CREATE POLICY "feature_flags_select_own"
  ON public.feature_flags FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR organization_id IS NULL
    OR public.is_platform_admin()
  );

CREATE POLICY "feature_flags_insert_platform"
  ON public.feature_flags FOR INSERT
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "feature_flags_update_platform"
  ON public.feature_flags FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- RLS: audit_logs
-- Read: org admins with audit:read permission. No INSERT/UPDATE/DELETE policies
-- for authenticated users — writes happen only through audit_trigger_fn()
-- and insert_audit_log() which are SECURITY DEFINER.
-- ---------------------------------------------------------------------------
CREATE POLICY "audit_logs_select_own_org"
  ON public.audit_logs FOR SELECT
  USING (
    (
      organization_id = public.auth_organization_id()
      AND public.has_permission('administration:audit:read')
    )
    OR public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- RLS: activity_logs
-- All org members can read their org's activity. Writes via service role only.
-- ---------------------------------------------------------------------------
CREATE POLICY "activity_logs_select_own_org"
  ON public.activity_logs FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

-- =============================================================================
-- SECTION 9: VIEWS
-- =============================================================================

-- Effective permissions per user — used by the Phase 1B.2 Auth Hook to build
-- the JWT permissions[] claim at sign-in time.
CREATE OR REPLACE VIEW public.user_effective_permissions AS
SELECT
  m.user_id,
  m.organization_id,
  p.code           AS permission_code,
  mr.location_id,
  mr.expires_at
FROM public.memberships m
JOIN public.membership_roles mr
  ON mr.membership_id = m.id
  AND mr.is_active = true
  AND (mr.expires_at IS NULL OR mr.expires_at > now())
JOIN public.roles r
  ON r.id = mr.role_id
JOIN public.role_permissions rp
  ON rp.role_id = r.id
JOIN public.permissions p
  ON p.id = rp.permission_id
  AND p.is_active = true
WHERE m.status = 'active';

COMMENT ON VIEW public.user_effective_permissions IS
  'Denormalized view of every permission a user holds in each org. '
  'Used by the Auth Hook to populate JWT claims at sign-in.';

-- =============================================================================
-- SECTION 10: GRANT PERMISSIONS
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.auth_organization_id()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_permissions()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_permission(text[])      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin()                  TO authenticated;

-- insert_audit_log / insert_activity_log are called by Edge Functions using
-- the service role key. No explicit grant to authenticated — direct client
-- writes to these tables are intentionally blocked.

-- =============================================================================
-- SECTION 11: SEED DATA — SYSTEM ROLES
-- Swedish display_names for org roles (admin UI is Swedish-primary).
-- =============================================================================

INSERT INTO public.roles
  (id, organization_id, name, display_name, description, is_system_role, is_custom, sort_order)
VALUES
  -- Platform roles (English — internal platform ops)
  (gen_random_uuid(), NULL, 'platform_superadmin', 'Platform Super Admin',  'Full platform access. Internal use only.',                     true, false, 0),
  (gen_random_uuid(), NULL, 'platform_support',    'Platform Support',      'Read-access + limited write for support operations.',          true, false, 1),
  (gen_random_uuid(), NULL, 'platform_billing',    'Platform Billing',      'Subscription and billing management.',                         true, false, 2),

  -- Organization roles (Swedish display names for admin UI)
  (gen_random_uuid(), NULL, 'org_owner',           'Ägare',                 'Organisationsägare. Full åtkomst till all funktionalitet.',    true, false, 10),
  (gen_random_uuid(), NULL, 'org_admin',           'Administratör',         'Organisationsadministratör. Hanterar inställningar och personal.', true, false, 11),
  (gen_random_uuid(), NULL, 'org_manager',         'Verksamhetschef',       'Hanterar personal, elever och lokationer.',                    true, false, 12),
  (gen_random_uuid(), NULL, 'instructor_senior',   'Seniortrafiklärare',    'Senior trafiklärare med utökade rättigheter.',                 true, false, 20),
  (gen_random_uuid(), NULL, 'instructor',          'Trafiklärare',          'Standard trafiklärare. Egna lektioner och elever.',            true, false, 21),
  (gen_random_uuid(), NULL, 'receptionist',        'Receptionist',          'Front office – elever, bokningar och grundläggande admin.',    true, false, 30),
  (gen_random_uuid(), NULL, 'finance_admin',       'Ekonomiansvarig',       'Full tillgång till ekonomimodulen och fakturering.',           true, false, 40),
  (gen_random_uuid(), NULL, 'student_admin',       'Elevadministratör',     'Hanterar elever och utbildningsprocesser.',                    true, false, 50),
  (gen_random_uuid(), NULL, 'reporting_viewer',    'Rapportläsare',         'Läsbehörighet för rapporter och statistik.',                   true, false, 60),
  (gen_random_uuid(), NULL, 'corporate_contact',   'Företagskontakt',       'Kontaktperson för företagskunder. Begränsad åtkomst.',         true, false, 70),

  -- Student roles
  (gen_random_uuid(), NULL, 'student',             'Elev',                  'Aktiv elev i körskolan.',                                      true, false, 80),
  (gen_random_uuid(), NULL, 'student_guardian',    'Förmyndare/målsman',    'Förälder eller vårdnadshavare till en elev.',                  true, false, 81);

-- =============================================================================
-- SECTION 12: SEED DATA — PERMISSIONS CATALOG
-- =============================================================================

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  -- Students
  (gen_random_uuid(), 'students:student:create', 'students', 'student', 'create', 'Create new student records'),
  (gen_random_uuid(), 'students:student:read',   'students', 'student', 'read',   'View student profiles and details'),
  (gen_random_uuid(), 'students:student:update', 'students', 'student', 'update', 'Edit student information'),
  (gen_random_uuid(), 'students:student:delete', 'students', 'student', 'delete', 'Soft-delete student records'),
  (gen_random_uuid(), 'students:student:export', 'students', 'student', 'export', 'Export student data to CSV/Excel'),

  -- Instructors
  (gen_random_uuid(), 'instructors:instructor:create', 'instructors', 'instructor', 'create', 'Create instructor accounts'),
  (gen_random_uuid(), 'instructors:instructor:read',   'instructors', 'instructor', 'read',   'View instructor profiles'),
  (gen_random_uuid(), 'instructors:instructor:update', 'instructors', 'instructor', 'update', 'Edit instructor information'),
  (gen_random_uuid(), 'instructors:instructor:delete', 'instructors', 'instructor', 'delete', 'Deactivate instructor accounts'),

  -- Scheduling
  (gen_random_uuid(), 'scheduling:booking:create', 'scheduling', 'booking', 'create', 'Create lesson bookings'),
  (gen_random_uuid(), 'scheduling:booking:read',   'scheduling', 'booking', 'read',   'View lesson bookings'),
  (gen_random_uuid(), 'scheduling:booking:update', 'scheduling', 'booking', 'update', 'Modify existing bookings'),
  (gen_random_uuid(), 'scheduling:booking:delete', 'scheduling', 'booking', 'delete', 'Cancel or delete bookings'),
  (gen_random_uuid(), 'scheduling:slot:create',    'scheduling', 'slot',    'create', 'Create instructor availability slots'),
  (gen_random_uuid(), 'scheduling:slot:read',      'scheduling', 'slot',    'read',   'View availability slots'),
  (gen_random_uuid(), 'scheduling:slot:update',    'scheduling', 'slot',    'update', 'Edit availability slots'),
  (gen_random_uuid(), 'scheduling:slot:delete',    'scheduling', 'slot',    'delete', 'Delete availability slots'),

  -- Finance
  (gen_random_uuid(), 'finance:invoice:create', 'finance', 'invoice', 'create', 'Create invoices'),
  (gen_random_uuid(), 'finance:invoice:read',   'finance', 'invoice', 'read',   'View invoices'),
  (gen_random_uuid(), 'finance:invoice:update', 'finance', 'invoice', 'update', 'Edit draft invoices'),
  (gen_random_uuid(), 'finance:invoice:void',   'finance', 'invoice', 'void',   'Void or credit invoices'),
  (gen_random_uuid(), 'finance:invoice:export', 'finance', 'invoice', 'export', 'Export invoices for accounting systems'),
  (gen_random_uuid(), 'finance:payment:create', 'finance', 'payment', 'create', 'Record manual payments'),
  (gen_random_uuid(), 'finance:payment:read',   'finance', 'payment', 'read',   'View payment records'),
  (gen_random_uuid(), 'finance:payment:export', 'finance', 'payment', 'export', 'Export payment data'),
  (gen_random_uuid(), 'finance:report:read',    'finance', 'report',  'read',   'View financial reports'),
  (gen_random_uuid(), 'finance:report:export',  'finance', 'report',  'export', 'Export financial reports'),

  -- Documents
  (gen_random_uuid(), 'documents:document:create', 'documents', 'document', 'create', 'Upload or create documents'),
  (gen_random_uuid(), 'documents:document:read',   'documents', 'document', 'read',   'View documents'),
  (gen_random_uuid(), 'documents:document:update', 'documents', 'document', 'update', 'Edit document metadata'),
  (gen_random_uuid(), 'documents:document:delete', 'documents', 'document', 'delete', 'Delete documents'),
  (gen_random_uuid(), 'documents:document:export', 'documents', 'document', 'export', 'Download or export documents'),

  -- Communications
  (gen_random_uuid(), 'communications:message:create',   'communications', 'message',  'create', 'Send messages to students and staff'),
  (gen_random_uuid(), 'communications:message:read',     'communications', 'message',  'read',   'View message history'),
  (gen_random_uuid(), 'communications:message:delete',   'communications', 'message',  'delete', 'Delete messages'),
  (gen_random_uuid(), 'communications:template:create',  'communications', 'template', 'create', 'Create message templates'),
  (gen_random_uuid(), 'communications:template:read',    'communications', 'template', 'read',   'View message templates'),
  (gen_random_uuid(), 'communications:template:update',  'communications', 'template', 'update', 'Edit message templates'),
  (gen_random_uuid(), 'communications:template:delete',  'communications', 'template', 'delete', 'Delete message templates'),

  -- Reporting
  (gen_random_uuid(), 'reporting:report:read',   'reporting', 'report', 'read',   'View operational reports and dashboards'),
  (gen_random_uuid(), 'reporting:report:export', 'reporting', 'report', 'export', 'Export reports to CSV, Excel, or PDF'),

  -- Administration
  (gen_random_uuid(), 'administration:user:create',         'administration', 'user',         'create', 'Invite new users to the organization'),
  (gen_random_uuid(), 'administration:user:read',           'administration', 'user',         'read',   'View user accounts and profiles'),
  (gen_random_uuid(), 'administration:user:update',         'administration', 'user',         'update', 'Edit user accounts and role assignments'),
  (gen_random_uuid(), 'administration:user:delete',         'administration', 'user',         'delete', 'Deactivate or remove user accounts'),
  (gen_random_uuid(), 'administration:role:create',         'administration', 'role',         'create', 'Create custom roles'),
  (gen_random_uuid(), 'administration:role:read',           'administration', 'role',         'read',   'View roles and their permissions'),
  (gen_random_uuid(), 'administration:role:update',         'administration', 'role',         'update', 'Edit role permission assignments'),
  (gen_random_uuid(), 'administration:role:delete',         'administration', 'role',         'delete', 'Delete custom roles'),
  (gen_random_uuid(), 'administration:location:create',     'administration', 'location',     'create', 'Add new locations or branches'),
  (gen_random_uuid(), 'administration:location:read',       'administration', 'location',     'read',   'View location details'),
  (gen_random_uuid(), 'administration:location:update',     'administration', 'location',     'update', 'Edit location information'),
  (gen_random_uuid(), 'administration:location:delete',     'administration', 'location',     'delete', 'Archive or deactivate locations'),
  (gen_random_uuid(), 'administration:organization:read',   'administration', 'organization', 'read',   'View organization settings'),
  (gen_random_uuid(), 'administration:organization:update', 'administration', 'organization', 'update', 'Update organization settings and branding'),
  (gen_random_uuid(), 'administration:audit:read',          'administration', 'audit',        'read',   'View audit log entries'),
  (gen_random_uuid(), 'administration:settings:read',       'administration', 'settings',     'read',   'View system configuration'),
  (gen_random_uuid(), 'administration:settings:update',     'administration', 'settings',     'update', 'Modify system configuration'),

  -- Corporate
  (gen_random_uuid(), 'corporate:contract:create',  'corporate', 'contract', 'create',  'Create corporate training contracts'),
  (gen_random_uuid(), 'corporate:contract:read',    'corporate', 'contract', 'read',    'View corporate contracts'),
  (gen_random_uuid(), 'corporate:contract:update',  'corporate', 'contract', 'update',  'Edit corporate contracts'),
  (gen_random_uuid(), 'corporate:contract:approve', 'corporate', 'contract', 'approve', 'Approve corporate contracts');

-- =============================================================================
-- SECTION 13: SEED DATA — ROLE-PERMISSION ASSIGNMENTS
-- =============================================================================

-- org_owner: full access to all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'org_owner' AND r.is_system_role = true;

-- org_admin: all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'org_admin' AND r.is_system_role = true;

-- org_manager
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'org_manager' AND r.is_system_role = true
  AND p.code = ANY(ARRAY[
    'students:student:create','students:student:read','students:student:update','students:student:export',
    'instructors:instructor:create','instructors:instructor:read','instructors:instructor:update',
    'scheduling:booking:create','scheduling:booking:read','scheduling:booking:update','scheduling:booking:delete',
    'scheduling:slot:create','scheduling:slot:read','scheduling:slot:update','scheduling:slot:delete',
    'documents:document:create','documents:document:read','documents:document:update',
    'communications:message:create','communications:message:read',
    'communications:template:create','communications:template:read','communications:template:update',
    'reporting:report:read','reporting:report:export',
    'finance:invoice:read','finance:payment:read','finance:report:read',
    'administration:user:create','administration:user:read','administration:user:update',
    'administration:role:read',
    'administration:location:read','administration:location:update',
    'administration:organization:read',
    'administration:settings:read'
  ]);

-- instructor_senior
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'instructor_senior' AND r.is_system_role = true
  AND p.code = ANY(ARRAY[
    'students:student:read','students:student:update',
    'scheduling:booking:create','scheduling:booking:read','scheduling:booking:update','scheduling:booking:delete',
    'scheduling:slot:create','scheduling:slot:read','scheduling:slot:update','scheduling:slot:delete',
    'instructors:instructor:read',
    'documents:document:create','documents:document:read','documents:document:update',
    'communications:message:create','communications:message:read',
    'reporting:report:read'
  ]);

-- instructor
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'instructor' AND r.is_system_role = true
  AND p.code = ANY(ARRAY[
    'students:student:read',
    'scheduling:booking:read','scheduling:booking:update',
    'scheduling:slot:read','scheduling:slot:update',
    'documents:document:create','documents:document:read',
    'communications:message:read'
  ]);

-- receptionist
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'receptionist' AND r.is_system_role = true
  AND p.code = ANY(ARRAY[
    'students:student:create','students:student:read','students:student:update',
    'scheduling:booking:create','scheduling:booking:read','scheduling:booking:update',
    'scheduling:slot:read',
    'finance:invoice:read','finance:payment:create','finance:payment:read',
    'documents:document:create','documents:document:read',
    'communications:message:create','communications:message:read'
  ]);

-- finance_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'finance_admin' AND r.is_system_role = true
  AND p.code = ANY(ARRAY[
    'finance:invoice:create','finance:invoice:read','finance:invoice:update',
    'finance:invoice:void','finance:invoice:export',
    'finance:payment:create','finance:payment:read','finance:payment:export',
    'finance:report:read','finance:report:export',
    'reporting:report:read','reporting:report:export',
    'students:student:read',
    'scheduling:booking:read',
    'administration:audit:read'
  ]);

-- student_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'student_admin' AND r.is_system_role = true
  AND p.code = ANY(ARRAY[
    'students:student:create','students:student:read','students:student:update',
    'students:student:delete','students:student:export',
    'scheduling:booking:create','scheduling:booking:read',
    'documents:document:create','documents:document:read','documents:document:update',
    'communications:message:create','communications:message:read',
    'reporting:report:read'
  ]);

-- reporting_viewer
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'reporting_viewer' AND r.is_system_role = true
  AND p.code = ANY(ARRAY[
    'reporting:report:read','reporting:report:export',
    'finance:report:read','finance:invoice:read',
    'students:student:read',
    'scheduling:booking:read'
  ]);

-- corporate_contact
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'corporate_contact' AND r.is_system_role = true
  AND p.code = ANY(ARRAY[
    'corporate:contract:create','corporate:contract:read','corporate:contract:update',
    'reporting:report:read'
  ]);
