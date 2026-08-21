-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260816010000_personnel_record_common_fields.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
--
-- Extends the personnel data model so non-instructor staff (Trafikskolechef,
-- Utbildningsledare, Receptionist, Ekonomipersonal, Administrativ personal,
-- etc.) get a real personnel record — not just an email-invitation row — the
-- same way public.instructors already is one for teaching staff. Person /
-- employment data is added here; system access (RBAC roles, memberships
-- themselves) and account/invitation mechanics are entirely unchanged.
--
-- SPLIT ACROSS TWO TABLES, deliberately, matching their existing cardinality:
--   • public.profiles    — one row per PERSON (per auth.users id), globally.
--     Gets person-level fields: personnummer (identity) and home address.
--     A person's personnummer/address don't change depending on which
--     school they work for.
--   • public.memberships — one row per PERSON-PER-ORGANIZATION
--     ("Supports multi-org membership", per its own table comment). Gets
--     employment-level fields: Befattning, employment type/dates, workplace.
--     A person CAN legitimately hold a different Befattning at each school
--     they belong to — putting employment fields on profiles would silently
--     conflate two different jobs into one record.
--
--     (profiles.organization_id was removed by
--     20260527000002_phase1b2_hardening.sql specifically to make profiles
--     multi-org-safe — putting org-scoped data back onto profiles here
--     would undo that.)
--
-- Design mirrors the existing, audited instructors-table pattern exactly:
--   - identity_type / personnummer_encrypted / personnummer_hash /
--     personnummer_last4 — same columns, same public.personal_identity_type
--     enum, same AES-256-GCM + HMAC-SHA256 handling via
--     _shared/bankid-crypto.ts (encryptPersonalNumber/hashPersonalNumber).
--     Optional for every role; never used as a login credential.
--   - employment_type reuses the existing public.instructor_employment_type
--     enum (its values — employed/contractor/external/on_leave/inactive —
--     are generic employment concepts, not instructor-specific; reusing it
--     avoids a duplicate near-identical enum type).
--   - work_location_id mirrors instructors.primary_location_id exactly
--     (same FK target, same ON DELETE SET NULL).
--   - address_line1/postal_code/city mirror the equivalent, already-optional
--     instructors columns.
--
-- job_title (Befattning/professional role) is intentionally a plain text
-- column, not a DB-level enum — the presented options are curated in the
-- application layer (see AddPersonnelDialog.tsx), keeping this migration
-- free of a rigid constraint that would need its own future migration every
-- time a school's terminology for a role differs slightly.
--
-- All columns are nullable — zero impact on existing rows or queries, no RLS
-- policy change required (existing policies on both tables are row-level,
-- not column-level).
-- ════════════════════════════════════════════════════════════════════════════

-- ── profiles: person-level identity + home address ─────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN identity_type          public.personal_identity_type NOT NULL DEFAULT 'none',
  ADD COLUMN personnummer_encrypted text,
  ADD COLUMN personnummer_hash      text,
  ADD COLUMN personnummer_last4     text,
  ADD COLUMN address_line1          text,
  ADD COLUMN postal_code            text,
  ADD COLUMN city                   text;

-- Global, not org-scoped: profiles is one row per real person (1:1 with
-- auth.users), so a duplicate personnummer_hash across two different
-- profile rows would mean two different login accounts claiming the same
-- Swedish personal number — worth preventing outright.
CREATE UNIQUE INDEX profiles_personnummer_uniq
  ON public.profiles (personnummer_hash)
  WHERE personnummer_hash IS NOT NULL;

COMMENT ON COLUMN public.profiles.personnummer_encrypted IS 'GDPR: AES-256-GCM encrypted; plaintext never stored. Optional for every role — never used as a login identifier.';
COMMENT ON COLUMN public.profiles.personnummer_hash      IS 'GDPR: HMAC-SHA256 for equality lookups / duplicate detection only.';
COMMENT ON COLUMN public.profiles.personnummer_last4     IS 'GDPR: last 4 digits for display only — never expose the full personnummer in personnel lists.';

-- ── memberships: per-org employment / professional-role data ───────────────
ALTER TABLE public.memberships
  ADD COLUMN job_title             text,
  ADD COLUMN employment_type       public.instructor_employment_type,
  ADD COLUMN employment_number     text,
  ADD COLUMN employment_started_at date,
  ADD COLUMN employment_ended_at   date,
  ADD COLUMN work_location_id      uuid;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_work_location_fkey FOREIGN KEY (work_location_id)
    REFERENCES public.organization_locations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.memberships.job_title           IS 'Befattning / professional role at THIS organization (e.g. Trafikskolechef, Utbildningsledare, Receptionist) — distinct from the RBAC access role in membership_roles, and distinct per org-membership since the same person can hold a different Befattning at each school they belong to. Free text; curated by the application UI.';
COMMENT ON COLUMN public.memberships.employment_ended_at IS 'NULL = "Tills vidare" (ongoing employment), matching instructors.employment_ended_at semantics exactly. Never populate with a fabricated future date.';

-- ── get_org_staff_invitations: surface the new common personnel fields ─────
-- Superseding the definition in 20260805232529_pending_activation_rpcs.sql —
-- adds job_title/employment_type/employment_ended_at/work_location_id (from
-- memberships) and personnummer_last4 (from profiles) so the Personal
-- workspace list can show Befattning and employment status without a second
-- round-trip. All new fields are additive; existing consumers of this RPC
-- that ignore unknown jsonb keys are unaffected.
CREATE OR REPLACE FUNCTION public.get_org_staff_invitations(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH staff AS (
    SELECT
      p.id                  AS user_id,
      p.email,
      p.first_name,
      p.last_name,
      p.is_active,
      r.name                AS role,
      r.display_name        AS role_display,
      m.status               AS membership_status,
      CASE WHEN m.status = 'pending' THEN 'pending' ELSE 'accepted' END AS invitation_status,
      au.invited_at,
      au.last_sign_in_at,
      m.joined_at,
      m.job_title,
      m.employment_type,
      m.employment_number,
      m.employment_started_at,
      m.employment_ended_at,
      m.work_location_id,
      loc.name               AS work_location_name,
      p.personnummer_last4
    FROM public.memberships       m
    JOIN public.membership_roles  mr  ON mr.membership_id = m.id
    JOIN public.roles             r   ON r.id  = mr.role_id
    JOIN public.profiles          p   ON p.id  = m.user_id
    LEFT JOIN auth.users              au  ON au.id = m.user_id
    LEFT JOIN public.organization_locations loc ON loc.id = m.work_location_id
    WHERE m.organization_id = p_org_id
    AND   mr.is_active = true
    AND   m.status     IN ('active', 'suspended', 'pending')
    AND   p.deleted_at IS NULL
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id',               user_id,
        'email',                 email,
        'first_name',            first_name,
        'last_name',             last_name,
        'is_active',             is_active,
        'role',                  role,
        'role_display',          role_display,
        'membership_status',     membership_status,
        'invitation_status',     invitation_status,
        'invited_at',            invited_at,
        'last_sign_in_at',       last_sign_in_at,
        'joined_at',             joined_at,
        'job_title',             job_title,
        'employment_type',       employment_type,
        'employment_number',     employment_number,
        'employment_started_at', employment_started_at,
        'employment_ended_at',   employment_ended_at,
        'work_location_id',      work_location_id,
        'work_location_name',    work_location_name,
        'personnummer_last4',    personnummer_last4
      )
      ORDER BY joined_at ASC
    ),
    '[]'::jsonb
  )
  FROM staff;
$$;
