-- =============================================================================
-- MIGRATION: 20260528000001_phase2a_domain_foundation.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2A — Core Driving School Domain Foundation
-- Description:
--   Operational domain entities: students, instructors, vehicles, and all
--   supporting entities (emergency contacts, notes, tags, documents,
--   certifications, maintenance, inspections, instructor-vehicle assignments).
--   Includes full RLS, audit triggers, event outbox emission, performance
--   indexes, GDPR annotations, and soft delete framework extension.
--
-- Dependencies:
--   20260527000001_enterprise_foundation.sql  — organizations, org_locations,
--     RBAC, audit_logs, set_updated_at(), audit_trigger_fn(), permissions seed
--   20260527000002_phase1b2_hardening.sql — event_outbox, insert_outbox_event(),
--     soft_delete(), soft_restore(), platform_admins
-- =============================================================================

-- =============================================================================
-- SECTION 1: DOMAIN ENUMS
-- =============================================================================

-- Identity document type — shared between students and instructors
CREATE TYPE public.personal_identity_type AS ENUM (
  'personnummer',       -- Swedish personal identity number (YYYYMMDD-XXXX)
  'samordningsnummer',  -- Swedish coordination number for residents without personnummer
  'passport',           -- Passport document
  'national_id',        -- Other national identity card
  'none'                -- No identity document provided yet
);

CREATE TYPE public.student_status AS ENUM (
  'lead',       -- Prospect who has enquired but not yet enrolled
  'onboarding', -- Enrollment in progress (contract not yet signed)
  'active',     -- Actively attending lessons
  'paused',     -- Temporarily inactive (illness, military service, etc.)
  'completed',  -- Successfully received driving licence
  'withdrawn',  -- Dropped out without completing the programme
  'archived'    -- GDPR-compliant archive; PII fields anonymised per retention policy
);

-- Swedish driving licence permit lifecycle (category B path; other categories vary)
CREATE TYPE public.permit_stage AS ENUM (
  'not_started',
  'theory_study',           -- Self-study or theory course in progress
  'risk1_booked',           -- Riskutbildning 1 booked
  'risk1_completed',        -- Riskutbildning 1 completed
  'risk2_booked',           -- Riskutbildning 2 booked
  'risk2_completed',        -- Riskutbildning 2 completed
  'theory_exam_booked',     -- Kunskapsprov booked at Trafikverket
  'theory_passed',          -- Kunskapsprov passed
  'practical_exam_booked',  -- Körprov booked at Trafikverket
  'practical_passed',       -- Körprov passed; awaiting licence issuance
  'licence_issued'          -- Driving licence physically issued
);

CREATE TYPE public.instructor_employment_type AS ENUM (
  'employed',   -- Regular salaried employee
  'contractor', -- Self-employed contractor (F-skatt / egenanställd)
  'external',   -- Staff from a partner driving school
  'on_leave',   -- On approved leave (parental, sick, sabbatical)
  'inactive'    -- No longer active; record preserved for history
);

CREATE TYPE public.vehicle_ownership_type AS ENUM (
  'owned',
  'leased',
  'loaned'
);

CREATE TYPE public.vehicle_operational_status AS ENUM (
  'available',      -- Ready for lesson booking
  'in_use',         -- Currently in a lesson
  'maintenance',    -- Undergoing service or repair; not bookable
  'inspection_due', -- Awaiting mandatory besiktning; booking restricted
  'inactive',       -- Temporarily out of service
  'decommissioned'  -- Permanently retired; record preserved
);

CREATE TYPE public.transmission_type AS ENUM (
  'manual',
  'automatic',
  'semi_automatic'
);

CREATE TYPE public.maintenance_record_type AS ENUM (
  'routine_service', -- Scheduled oil change, filter, etc.
  'repair',          -- Unplanned repair
  'major_service',   -- Major periodic service (timing belt, gearbox, etc.)
  'recall',          -- Manufacturer recall work
  'tyre_change',     -- Seasonal tyre swap
  'other'
);

CREATE TYPE public.maintenance_status AS ENUM (
  'scheduled',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TYPE public.student_document_category AS ENUM (
  'identity_document',   -- Passport or national ID copy
  'medical_clearance',   -- Läkarintyg for special licence categories
  'theory_result',       -- Kunskapsprov result printout
  'risk_education',      -- Riskutbildning certificate
  'practical_result',    -- Körprov result
  'licence_copy',        -- Copy of issued driving licence
  'enrollment_contract', -- Signed enrollment agreement
  'other'
);

CREATE TYPE public.document_status AS ENUM (
  'pending_review',
  'approved',
  'rejected',
  'expired'
);

CREATE TYPE public.certification_status AS ENUM (
  'active',
  'expiring_soon', -- Within 60 days of expiry
  'expired',
  'suspended',
  'revoked'
);

-- =============================================================================
-- SECTION 2: STUDENTS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 STUDENTS
-- Core student entity. One row per student per organisation.
--
-- GDPR classification (GDPR Article 9 / 10 adjacent):
--   personnummer_encrypted — high-risk PII. Stored AES-256-GCM encrypted by the
--     application layer. The server never sees or stores plaintext.
--   personnummer_hash — HMAC-SHA256 for server-side equality lookups.
--   personnummer_last4 — Last 4 digits for UI partial display (e.g. ****-1234).
--
--   On GDPR erasure (Article 17): set status = 'archived', NULL-out all three
--   personnummer_* columns plus name, email, phone, address fields. The row
--   itself (with ID, dates, and permit milestones) may be retained for
--   operational reporting subject to the organisation's retention policy.
--
-- Student portal access: students who create a portal account are linked via
-- user_id → auth.users. Their JWT carries role = 'student'. RLS self-access
-- policies grant them read access to their own record and non-internal notes.
-- ---------------------------------------------------------------------------
CREATE TABLE public.students (
  id                           uuid                            NOT NULL DEFAULT gen_random_uuid(),
  organization_id              uuid                            NOT NULL,

  -- ── Personal identity ────────────────────────────────────────────────────
  first_name                   text                            NOT NULL,
  last_name                    text                            NOT NULL,
  date_of_birth                date,

  identity_type                public.personal_identity_type   NOT NULL DEFAULT 'none',
  personnummer_encrypted        text,    -- GDPR: AES-256-GCM encrypted; plaintext never stored
  personnummer_hash             text,    -- GDPR: HMAC-SHA256 for equality lookups
  personnummer_last4            text,    -- GDPR: last 4 digits for display only

  -- ── Contact details ──────────────────────────────────────────────────────
  email                        text,
  phone                        text,
  address_line1                text,
  address_line2                text,
  postal_code                  text,
  city                         text,

  -- ── Communication preferences ─────────────────────────────────────────────
  preferred_language           public.language_code            NOT NULL DEFAULT 'sv',
  communication_opt_in_email   boolean                         NOT NULL DEFAULT true,
  communication_opt_in_sms     boolean                         NOT NULL DEFAULT true,

  -- ── GDPR consent tracking ─────────────────────────────────────────────────
  gdpr_consent_given_at        timestamptz,
  gdpr_consent_version         text,
  data_processing_consent      boolean                         NOT NULL DEFAULT false,
  marketing_consent            boolean                         NOT NULL DEFAULT false,
  -- Set by an admin to retain data beyond the default retention window.
  gdpr_retention_override_at   timestamptz,

  -- ── Enrollment lifecycle ──────────────────────────────────────────────────
  status                       public.student_status           NOT NULL DEFAULT 'lead',
  status_changed_at            timestamptz,
  enrolled_at                  timestamptz,
  enrollment_location_id       uuid,
  -- Primary instructor assignment. FK added after instructors table is created.
  assigned_instructor_id       uuid,

  -- ── Driving permit lifecycle ──────────────────────────────────────────────
  target_licence_category      text                            NOT NULL DEFAULT 'B',
  permit_stage                 public.permit_stage             NOT NULL DEFAULT 'not_started',
  permit_stage_updated_at      timestamptz,
  risk1_completed_at           timestamptz,
  risk2_completed_at           timestamptz,
  theory_passed_at             timestamptz,
  practical_passed_at          timestamptz,
  licence_issued_at            timestamptz,
  licence_number               text,

  -- ── Student portal linkage ────────────────────────────────────────────────
  user_id                      uuid,

  -- ── Audit ────────────────────────────────────────────────────────────────
  created_by                   uuid,
  updated_by                   uuid,

  -- ── Soft delete ──────────────────────────────────────────────────────────
  deleted_at                   timestamptz,
  deleted_by                   uuid,

  -- ── Timestamps ────────────────────────────────────────────────────────────
  created_at                   timestamptz                     NOT NULL DEFAULT now(),
  updated_at                   timestamptz                     NOT NULL DEFAULT now(),

  CONSTRAINT students_pkey                    PRIMARY KEY (id),
  CONSTRAINT students_org_fkey                FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT students_location_fkey           FOREIGN KEY (enrollment_location_id)
    REFERENCES public.organization_locations(id) ON DELETE SET NULL,
  CONSTRAINT students_created_by_fkey         FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT students_updated_by_fkey         FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT students_deleted_by_fkey         FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT students_user_id_fkey            FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Two students in the same org cannot share a personnummer hash (NULL excluded).
  CONSTRAINT students_org_personnummer_uniq   UNIQUE (organization_id, personnummer_hash),
  -- A portal auth account maps to at most one student record globally.
  CONSTRAINT students_user_id_uniq            UNIQUE (user_id)
);

COMMENT ON TABLE  public.students IS
  'Core student entity. One row per student per organisation. '
  'personnummer_* columns are GDPR-sensitive: encrypted, hashed, and annotated accordingly.';
COMMENT ON COLUMN public.students.personnummer_encrypted IS
  'AES-256-GCM encrypted personnummer. Application layer encrypts before INSERT; never store plaintext. GDPR Art.5.';
COMMENT ON COLUMN public.students.personnummer_hash IS
  'HMAC-SHA256 of the raw personnummer. Enables O(1) equality lookup without plaintext exposure. GDPR Art.5.';
COMMENT ON COLUMN public.students.personnummer_last4 IS
  'Last 4 digits of the personnummer for UI partial display (e.g. ****-1234). GDPR Art.5.';
COMMENT ON COLUMN public.students.gdpr_retention_override_at IS
  'Admin-set retention override date. NULL = apply the platform default retention window.';
COMMENT ON COLUMN public.students.target_licence_category IS
  'Swedish driving licence category being trained for: B, A, A2, A1, C, CE, D, DE, BE, etc.';

CREATE TRIGGER students_set_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER students_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 2.2 STUDENT EMERGENCY CONTACTS
-- Separate child table to keep the students row clean.
-- Supports multiple contacts; is_primary marks the preferred one.
-- GDPR: these are third-party personal data — subject to the same erasure
-- obligations as the parent student record.
-- ---------------------------------------------------------------------------
CREATE TABLE public.student_emergency_contacts (
  id               uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid         NOT NULL,
  student_id       uuid         NOT NULL,
  full_name        text         NOT NULL,
  relationship     text         NOT NULL, -- 'parent', 'guardian', 'spouse', 'sibling', 'other'
  phone            text         NOT NULL,
  email            text,
  is_primary       boolean      NOT NULL DEFAULT false,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT student_emergency_contacts_pkey         PRIMARY KEY (id),
  CONSTRAINT student_emergency_contacts_org_fkey     FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT student_emergency_contacts_student_fkey FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.student_emergency_contacts IS
  'Emergency contacts for a student. GDPR: third-party PII — erase on student GDPR erasure request.';

CREATE TRIGGER student_emergency_contacts_set_updated_at
  BEFORE UPDATE ON public.student_emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2.3 STUDENT NOTES
-- Free-form operational notes on a student.
-- is_internal = true  → staff-only; never visible in the student portal.
-- is_internal = false → shared note; visible in the student portal.
-- ---------------------------------------------------------------------------
CREATE TABLE public.student_notes (
  id               uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid         NOT NULL,
  student_id       uuid         NOT NULL,
  author_id        uuid         NOT NULL,
  body             text         NOT NULL,
  is_internal      boolean      NOT NULL DEFAULT true,
  is_pinned        boolean      NOT NULL DEFAULT false,
  deleted_at       timestamptz,
  deleted_by       uuid,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT student_notes_pkey         PRIMARY KEY (id),
  CONSTRAINT student_notes_org_fkey     FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT student_notes_student_fkey FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT student_notes_author_fkey  FOREIGN KEY (author_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT student_notes_deleter_fkey FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE  public.student_notes          IS 'Operational notes on a student. is_internal=true notes are staff-only; never surfaced in the student portal.';
COMMENT ON COLUMN public.student_notes.is_internal IS
  'true = staff-only. false = shared with student (visible in student portal).';

CREATE TRIGGER student_notes_set_updated_at
  BEFORE UPDATE ON public.student_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER student_notes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.student_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 2.4 STUDENT TAGS + ASSIGNMENTS
-- Tenant-defined labels for operational classification.
-- Examples: "Väntelista", "Prioritet", "B96-paket", "Intensivkurs".
-- ---------------------------------------------------------------------------
CREATE TABLE public.student_tags (
  id               uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid         NOT NULL,
  name             text         NOT NULL,
  color            text,        -- hex color for UI chip, e.g. '#4F46E5'
  description      text,
  created_by       uuid,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT student_tags_pkey          PRIMARY KEY (id),
  CONSTRAINT student_tags_org_fkey      FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT student_tags_creator_fkey  FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT student_tags_org_name_uniq UNIQUE (organization_id, name)
);

COMMENT ON TABLE  public.student_tags        IS 'Tenant-defined classification labels for students. Name is unique per organisation.';
COMMENT ON COLUMN public.student_tags.color  IS 'Optional hex color (e.g. #4F46E5) for rendering the tag chip in the UI.';

CREATE TRIGGER student_tags_set_updated_at
  BEFORE UPDATE ON public.student_tags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.student_tag_assignments (
  student_id   uuid         NOT NULL,
  tag_id       uuid         NOT NULL,
  assigned_by  uuid,
  assigned_at  timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT student_tag_assignments_pkey          PRIMARY KEY (student_id, tag_id),
  CONSTRAINT student_tag_assignments_student_fkey  FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT student_tag_assignments_tag_fkey      FOREIGN KEY (tag_id)
    REFERENCES public.student_tags(id) ON DELETE CASCADE,
  CONSTRAINT student_tag_assignments_assigner_fkey FOREIGN KEY (assigned_by)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- 2.5 STUDENT DOCUMENTS
-- Metadata for documents stored in Supabase Storage.
-- The binary object lives in Storage; all metadata and review state lives here.
-- ---------------------------------------------------------------------------
CREATE TABLE public.student_documents (
  id               uuid                             NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid                             NOT NULL,
  student_id       uuid                             NOT NULL,
  category         public.student_document_category NOT NULL,
  status           public.document_status           NOT NULL DEFAULT 'pending_review',
  file_name        text                             NOT NULL,
  storage_path     text                             NOT NULL, -- Supabase Storage object path
  storage_bucket   text                             NOT NULL DEFAULT 'student-documents',
  mime_type        text,
  file_size_bytes  bigint,
  description      text,
  expires_at       timestamptz, -- for time-limited docs (e.g. medical clearance)
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  rejection_reason text,
  uploaded_by      uuid         NOT NULL,
  deleted_at       timestamptz,
  deleted_by       uuid,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT student_documents_pkey          PRIMARY KEY (id),
  CONSTRAINT student_documents_org_fkey      FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT student_documents_student_fkey  FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT student_documents_reviewer_fkey FOREIGN KEY (reviewed_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT student_documents_uploader_fkey FOREIGN KEY (uploaded_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT student_documents_deleter_fkey  FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE  public.student_documents              IS 'Document metadata for student-related files in Supabase Storage.';
COMMENT ON COLUMN public.student_documents.storage_path IS 'Supabase Storage object key. Binary in Storage; metadata here.';
COMMENT ON COLUMN public.student_documents.expires_at   IS 'Document expiry for time-limited certificates (medical clearances, risk education certs, etc.).';

CREATE TRIGGER student_documents_set_updated_at
  BEFORE UPDATE ON public.student_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER student_documents_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.student_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =============================================================================
-- SECTION 3: INSTRUCTORS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 INSTRUCTORS
-- Internal instructor profiles. Separate from auth.users / public.profiles.
-- Instructors who access the admin app are linked via user_id → auth.users.
--
-- GDPR: personnummer_encrypted, personnummer_hash, personnummer_last4 are
-- high-risk PII. For active employees, Swedish Bokföringslagen requires a
-- minimum 7-year retention on payroll-related records — always consult legal
-- before executing an erasure request on an instructor record.
-- ---------------------------------------------------------------------------
CREATE TABLE public.instructors (
  id                      uuid                              NOT NULL DEFAULT gen_random_uuid(),
  organization_id         uuid                              NOT NULL,

  -- ── Personal identity ────────────────────────────────────────────────────
  first_name              text                              NOT NULL,
  last_name               text                              NOT NULL,
  email                   text                              NOT NULL,
  phone                   text,
  date_of_birth           date,

  identity_type           public.personal_identity_type     NOT NULL DEFAULT 'personnummer',
  personnummer_encrypted  text,    -- GDPR: AES-256-GCM encrypted; plaintext never stored
  personnummer_hash       text,    -- GDPR: HMAC-SHA256 for equality lookups
  personnummer_last4      text,    -- GDPR: last 4 digits for display only

  -- ── Employment ────────────────────────────────────────────────────────────
  employment_type         public.instructor_employment_type NOT NULL DEFAULT 'employed',
  employment_started_at   date,
  employment_ended_at     date,
  employee_number         text,   -- internal HR / payroll reference

  -- ── Teaching authorisation ────────────────────────────────────────────────
  -- Swedish driving licence categories this instructor may teach.
  -- Examples: '{B}', '{B,BE,A}', '{C,CE,D}'
  teaching_categories     text[]                            NOT NULL DEFAULT '{B}',

  -- ── ADI certification (Trafikverket) ──────────────────────────────────────
  adi_number              text,   -- Approved Driving Instructor registration number
  adi_valid_until         date,   -- Drives expiry monitoring; NULL = not registered

  -- ── Location assignment ───────────────────────────────────────────────────
  -- Primary branch. Multi-location scope managed via membership_roles.location_id.
  primary_location_id     uuid,

  -- ── Language competency ───────────────────────────────────────────────────
  -- Languages in which the instructor can conduct lessons.
  languages_spoken        text[]                            NOT NULL DEFAULT '{sv}',

  -- ── Scheduling preparation (Phase 2B) ────────────────────────────────────
  -- Operational cap on daily lesson count. NULL = no cap.
  max_lessons_per_day     integer,

  -- ── Portal account linkage ────────────────────────────────────────────────
  user_id                 uuid,

  -- ── Audit ────────────────────────────────────────────────────────────────
  created_by              uuid,
  updated_by              uuid,

  -- ── Soft delete ──────────────────────────────────────────────────────────
  deleted_at              timestamptz,
  deleted_by              uuid,

  -- ── Timestamps ────────────────────────────────────────────────────────────
  created_at              timestamptz                       NOT NULL DEFAULT now(),
  updated_at              timestamptz                       NOT NULL DEFAULT now(),

  CONSTRAINT instructors_pkey                     PRIMARY KEY (id),
  CONSTRAINT instructors_org_fkey                 FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT instructors_location_fkey            FOREIGN KEY (primary_location_id)
    REFERENCES public.organization_locations(id) ON DELETE SET NULL,
  CONSTRAINT instructors_created_by_fkey          FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT instructors_updated_by_fkey          FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT instructors_deleted_by_fkey          FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT instructors_user_id_fkey             FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT instructors_org_personnummer_uniq    UNIQUE (organization_id, personnummer_hash),
  CONSTRAINT instructors_user_id_uniq             UNIQUE (user_id),
  CONSTRAINT instructors_max_lessons_positive     CHECK (max_lessons_per_day IS NULL OR max_lessons_per_day > 0)
);

COMMENT ON TABLE  public.instructors IS
  'Driving instructor profiles. user_id links to auth.users when instructor has an admin portal account. '
  'personnummer_* columns are GDPR-sensitive; Bokföringslagen retention rules apply for payroll data.';
COMMENT ON COLUMN public.instructors.teaching_categories IS
  'Array of Swedish driving licence categories the instructor may teach (B, BE, A, A2, C, CE, D, DE, etc.).';
COMMENT ON COLUMN public.instructors.adi_number IS
  'Trafikverket ADI (Approved Driving Instructor) registration number. Required for category B instruction.';
COMMENT ON COLUMN public.instructors.max_lessons_per_day IS
  'Daily lesson cap enforced by the scheduling engine (Phase 2B). NULL = no cap configured.';

-- Add FK: students.assigned_instructor_id → instructors(id)
-- (instructors table did not exist at students table creation time)
ALTER TABLE public.students
  ADD CONSTRAINT students_instructor_fkey
  FOREIGN KEY (assigned_instructor_id)
  REFERENCES public.instructors(id)
  ON DELETE SET NULL;

CREATE TRIGGER instructors_set_updated_at
  BEFORE UPDATE ON public.instructors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER instructors_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.instructors
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 3.2 INSTRUCTOR CERTIFICATIONS
-- Tracks all professional certifications per instructor.
-- Covers ADI re-certification, first aid, risk education teacher, etc.
-- Expiry dates drive the compliance monitoring dashboard.
-- ---------------------------------------------------------------------------
CREATE TABLE public.instructor_certifications (
  id                   uuid                        NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid                        NOT NULL,
  instructor_id        uuid                        NOT NULL,
  certification_type   text                        NOT NULL, -- 'ADI', 'first_aid', 'risk_education_teacher', etc.
  issuing_authority    text,                                 -- 'Trafikverket', 'SOS Alarm', 'Röda Korset', etc.
  certificate_number   text,
  status               public.certification_status NOT NULL DEFAULT 'active',
  issued_at            date                        NOT NULL,
  expires_at           date,   -- NULL = non-expiring certificate
  renewal_reminded_at  timestamptz,
  renewal_completed_at timestamptz,
  notes                text,
  storage_path         text,   -- scanned certificate in Supabase Storage
  created_by           uuid,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT instructor_certifications_pkey             PRIMARY KEY (id),
  CONSTRAINT instructor_certifications_org_fkey          FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT instructor_certifications_instructor_fkey   FOREIGN KEY (instructor_id)
    REFERENCES public.instructors(id) ON DELETE CASCADE,
  CONSTRAINT instructor_certifications_creator_fkey      FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE  public.instructor_certifications          IS 'Professional certifications per instructor. Expiry dates drive compliance monitoring.';
COMMENT ON COLUMN public.instructor_certifications.expires_at IS
  'NULL = non-expiring. Non-null drives the expiry alert dashboard.';
COMMENT ON COLUMN public.instructor_certifications.storage_path IS
  'Supabase Storage path for the scanned certificate document.';

CREATE TRIGGER instructor_certifications_set_updated_at
  BEFORE UPDATE ON public.instructor_certifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER instructor_certifications_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.instructor_certifications
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =============================================================================
-- SECTION 4: VEHICLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 VEHICLES
-- Each physical vehicle in the fleet. Tracks compliance (insurance, road-tax
-- registration, besiktning), booking eligibility, and maintenance lifecycle.
-- operational_status gates lesson booking in the scheduling engine (Phase 2B).
-- ---------------------------------------------------------------------------
CREATE TABLE public.vehicles (
  id                       uuid                              NOT NULL DEFAULT gen_random_uuid(),
  organization_id          uuid                              NOT NULL,

  -- ── Identification ─────────────────────────────────────────────────────────
  registration_number      text                              NOT NULL, -- Swedish reg plate, e.g. 'ABC123'
  vin                      text,                                       -- Vehicle Identification Number (17 chars)
  make                     text                              NOT NULL, -- e.g. 'Volvo'
  model                    text                              NOT NULL, -- e.g. 'V60'
  model_year               integer                           NOT NULL,
  color                    text,

  -- ── Technical specification ───────────────────────────────────────────────
  transmission             public.transmission_type          NOT NULL DEFAULT 'manual',
  has_dual_controls        boolean                           NOT NULL DEFAULT true,
  fuel_type                text                              NOT NULL DEFAULT 'gasoline',
  engine_cc                integer,
  seats                    integer                           NOT NULL DEFAULT 5,

  -- ── Teaching authorisation ────────────────────────────────────────────────
  -- Driving licence categories for which this vehicle may be used in lessons.
  teaching_categories      text[]                            NOT NULL DEFAULT '{B}',

  -- ── Ownership and location ────────────────────────────────────────────────
  ownership_type           public.vehicle_ownership_type     NOT NULL DEFAULT 'owned',
  primary_location_id      uuid,

  -- ── Operational status ────────────────────────────────────────────────────
  operational_status       public.vehicle_operational_status NOT NULL DEFAULT 'available',
  status_changed_at        timestamptz,
  status_change_reason     text,

  -- ── Compliance dates ─────────────────────────────────────────────────────
  registration_expires_at  date                              NOT NULL,
  insurance_expires_at     date                              NOT NULL,
  -- Swedish mandatory periodic roadworthiness test (besiktning)
  next_inspection_due_at   date,
  last_inspected_at        date,

  -- ── Odometer ─────────────────────────────────────────────────────────────
  odometer_km              integer,
  odometer_updated_at      timestamptz,

  -- ── Audit ────────────────────────────────────────────────────────────────
  created_by               uuid,
  updated_by               uuid,

  -- ── Soft delete ──────────────────────────────────────────────────────────
  deleted_at               timestamptz,
  deleted_by               uuid,

  -- ── Timestamps ────────────────────────────────────────────────────────────
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT vehicles_pkey                   PRIMARY KEY (id),
  CONSTRAINT vehicles_org_fkey               FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT vehicles_location_fkey          FOREIGN KEY (primary_location_id)
    REFERENCES public.organization_locations(id) ON DELETE SET NULL,
  CONSTRAINT vehicles_created_by_fkey        FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT vehicles_updated_by_fkey        FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT vehicles_deleted_by_fkey        FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT vehicles_org_reg_uniq           UNIQUE (organization_id, registration_number),
  CONSTRAINT vehicles_model_year_range       CHECK (model_year >= 1980 AND model_year <= 2100),
  CONSTRAINT vehicles_fuel_type_check        CHECK (
    fuel_type IN ('gasoline','diesel','electric','hybrid','plugin_hybrid','ethanol','gas')
  ),
  CONSTRAINT vehicles_seats_positive         CHECK (seats > 0),
  CONSTRAINT vehicles_odometer_non_negative  CHECK (odometer_km IS NULL OR odometer_km >= 0)
);

COMMENT ON TABLE  public.vehicles IS
  'Fleet vehicles used for driving lessons. operational_status gates booking eligibility. '
  'compliance dates (insurance, registration, besiktning) drive the monitoring dashboard.';
COMMENT ON COLUMN public.vehicles.has_dual_controls   IS 'true = lesson vehicle with instructor pedals. false = exam or specialised vehicle.';
COMMENT ON COLUMN public.vehicles.teaching_categories IS 'Licence categories (B, BE, A, C, D, etc.) this vehicle is authorised for.';
COMMENT ON COLUMN public.vehicles.next_inspection_due_at IS
  'Swedish mandatory besiktning due date. Overdue vehicles should be set to operational_status = ''inspection_due''.';

CREATE TRIGGER vehicles_set_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER vehicles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 4.2 INSTRUCTOR VEHICLE ASSIGNMENTS
-- Links instructors to fleet vehicles. Supports assignment history:
-- unassigned_at IS NULL = currently assigned.
-- An instructor may hold multiple concurrent assignments (different vehicle
-- types); is_primary marks the scheduling engine's preferred default.
-- ---------------------------------------------------------------------------
CREATE TABLE public.instructor_vehicle_assignments (
  id               uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid         NOT NULL,
  instructor_id    uuid         NOT NULL,
  vehicle_id       uuid         NOT NULL,
  is_primary       boolean      NOT NULL DEFAULT false,
  assigned_at      timestamptz  NOT NULL DEFAULT now(),
  unassigned_at    timestamptz,  -- NULL = currently active
  notes            text,
  assigned_by      uuid,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT instructor_vehicle_assignments_pkey             PRIMARY KEY (id),
  CONSTRAINT instructor_vehicle_assignments_org_fkey         FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT instructor_vehicle_assignments_instructor_fkey  FOREIGN KEY (instructor_id)
    REFERENCES public.instructors(id) ON DELETE CASCADE,
  CONSTRAINT instructor_vehicle_assignments_vehicle_fkey     FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles(id) ON DELETE CASCADE,
  CONSTRAINT instructor_vehicle_assignments_assigner_fkey    FOREIGN KEY (assigned_by)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE  public.instructor_vehicle_assignments IS
  'Instructor-to-vehicle assignments. History preserved via unassigned_at timestamp. '
  'is_primary marks the preferred vehicle for the scheduling engine (Phase 2B).';
COMMENT ON COLUMN public.instructor_vehicle_assignments.unassigned_at IS
  'NULL = currently active assignment. Set to now() to end the assignment without deleting history.';

CREATE TRIGGER instructor_vehicle_assignments_set_updated_at
  BEFORE UPDATE ON public.instructor_vehicle_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4.3 VEHICLE MAINTENANCE
-- Scheduled and historical maintenance records.
-- Vehicles with status = 'in_progress' are excluded from booking by the
-- scheduling engine (via vehicle.operational_status = 'maintenance').
-- ---------------------------------------------------------------------------
CREATE TABLE public.vehicle_maintenance (
  id                   uuid                           NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid                           NOT NULL,
  vehicle_id           uuid                           NOT NULL,
  record_type          public.maintenance_record_type NOT NULL,
  status               public.maintenance_status      NOT NULL DEFAULT 'scheduled',
  title                text                           NOT NULL,
  description          text,
  scheduled_at         timestamptz                    NOT NULL,
  started_at           timestamptz,
  completed_at         timestamptz,
  odometer_at_service  integer,
  service_provider     text,   -- garage or dealer name
  cost_sek             numeric(10,2),
  invoice_reference    text,
  next_service_due_at  timestamptz,
  next_service_km      integer,
  created_by           uuid,
  updated_by           uuid,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT vehicle_maintenance_pkey               PRIMARY KEY (id),
  CONSTRAINT vehicle_maintenance_org_fkey           FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT vehicle_maintenance_vehicle_fkey       FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles(id) ON DELETE CASCADE,
  CONSTRAINT vehicle_maintenance_creator_fkey       FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT vehicle_maintenance_updater_fkey       FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT vehicle_maintenance_cost_non_negative  CHECK (cost_sek IS NULL OR cost_sek >= 0),
  CONSTRAINT vehicle_maintenance_odometer_positive  CHECK (odometer_at_service IS NULL OR odometer_at_service >= 0)
);

COMMENT ON TABLE  public.vehicle_maintenance IS
  'Maintenance records per vehicle. Active (in_progress) records should set the vehicle '
  'operational_status = ''maintenance'' to prevent lesson booking.';
COMMENT ON COLUMN public.vehicle_maintenance.cost_sek IS
  'Maintenance cost in SEK. Consumed by the Finance module (Phase 3) for operational expense reporting.';

CREATE TRIGGER vehicle_maintenance_set_updated_at
  BEFORE UPDATE ON public.vehicle_maintenance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER vehicle_maintenance_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_maintenance
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 4.4 VEHICLE INSPECTIONS
-- Records of mandatory besiktning (Swedish roadworthiness tests) and any
-- insurance or internal inspections. next_due_at drives compliance monitoring.
-- ---------------------------------------------------------------------------
CREATE TABLE public.vehicle_inspections (
  id                 uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id    uuid         NOT NULL,
  vehicle_id         uuid         NOT NULL,
  inspection_type    text         NOT NULL DEFAULT 'besiktning',
  scheduled_at       timestamptz,
  inspected_at       timestamptz  NOT NULL,
  next_due_at        timestamptz  NOT NULL,
  result             text         NOT NULL,
  remarks            text,
  station_name       text,        -- e.g. 'Bilprovningen', 'Opus', 'Dekra'
  certificate_number text,
  created_by         uuid,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT vehicle_inspections_pkey         PRIMARY KEY (id),
  CONSTRAINT vehicle_inspections_org_fkey     FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT vehicle_inspections_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles(id) ON DELETE CASCADE,
  CONSTRAINT vehicle_inspections_creator_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT vehicle_inspections_type_check   CHECK (
    inspection_type IN ('besiktning', 'internal', 'insurance', 'other')
  ),
  CONSTRAINT vehicle_inspections_result_check CHECK (
    result IN ('passed', 'failed', 'passed_with_remarks', 'deferred')
  )
);

COMMENT ON TABLE  public.vehicle_inspections IS
  'Vehicle inspection records. next_due_at drives the compliance monitoring dashboard. '
  'Failed results should trigger operational_status = ''inspection_due'' on the vehicle.';
COMMENT ON COLUMN public.vehicle_inspections.station_name IS
  'Swedish inspection station name (Bilprovningen, Opus, Dekra, CARSPECT, etc.).';

CREATE TRIGGER vehicle_inspections_set_updated_at
  BEFORE UPDATE ON public.vehicle_inspections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER vehicle_inspections_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_inspections
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =============================================================================
-- SECTION 5: ROW LEVEL SECURITY
-- Pattern:
--   SELECT policies: separate policies for staff (org + permission check),
--     self-access (student/instructor portal), and platform admins.
--     Multiple permissive SELECT policies are ORed by PostgreSQL.
--   INSERT/UPDATE/DELETE: org + permission check. Platform admins use
--     the service role which bypasses RLS entirely.
-- =============================================================================

ALTER TABLE public.students                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_emergency_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_notes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_tags                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_tag_assignments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_documents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructors                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_certifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_vehicle_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_maintenance             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_inspections             ENABLE ROW LEVEL SECURITY;

-- ── Students ──────────────────────────────────────────────────────────────────

CREATE POLICY "students_select_staff"
  ON public.students FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:read')
  );

-- Student portal: student can read their own record
CREATE POLICY "students_select_self"
  ON public.students FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "students_select_platform"
  ON public.students FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "students_insert"
  ON public.students FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:create')
  );

CREATE POLICY "students_update"
  ON public.students FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  );

CREATE POLICY "students_delete"
  ON public.students FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:delete')
  );

-- ── Student emergency contacts ────────────────────────────────────────────────

CREATE POLICY "student_emergency_contacts_select"
  ON public.student_emergency_contacts FOR SELECT
  USING (
    (
      organization_id = public.auth_organization_id()
      AND public.has_permission('students:student:read')
    )
    OR public.is_platform_admin()
  );

CREATE POLICY "student_emergency_contacts_insert"
  ON public.student_emergency_contacts FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  );

CREATE POLICY "student_emergency_contacts_update"
  ON public.student_emergency_contacts FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  );

CREATE POLICY "student_emergency_contacts_delete"
  ON public.student_emergency_contacts FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  );

-- ── Student notes ─────────────────────────────────────────────────────────────

-- Staff: see all notes in their org
CREATE POLICY "student_notes_select_staff"
  ON public.student_notes FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:read')
  );

-- Student portal: only non-internal notes about themselves
CREATE POLICY "student_notes_select_self"
  ON public.student_notes FOR SELECT
  USING (
    is_internal = false
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "student_notes_select_platform"
  ON public.student_notes FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "student_notes_insert"
  ON public.student_notes FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  );

CREATE POLICY "student_notes_update"
  ON public.student_notes FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND deleted_at IS NULL
    AND (
      public.has_permission('students:student:update')
      OR author_id = auth.uid()  -- note authors can always edit their own notes
    )
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('students:student:update')
      OR author_id = auth.uid()
    )
  );

CREATE POLICY "student_notes_delete"
  ON public.student_notes FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('students:student:delete')
      OR author_id = auth.uid()
    )
  );

-- ── Student tags ──────────────────────────────────────────────────────────────

CREATE POLICY "student_tags_select"
  ON public.student_tags FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    OR public.is_platform_admin()
  );

CREATE POLICY "student_tags_insert"
  ON public.student_tags FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  );

CREATE POLICY "student_tags_update"
  ON public.student_tags FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  );

CREATE POLICY "student_tags_delete"
  ON public.student_tags FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('students:student:update')
  );

-- ── Student tag assignments ───────────────────────────────────────────────────
-- No organization_id column; org isolation enforced via join to students.

CREATE POLICY "student_tag_assignments_select"
  ON public.student_tag_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id
        AND (
          (s.organization_id = public.auth_organization_id()
           AND public.has_permission('students:student:read'))
          OR s.user_id = auth.uid()
          OR public.is_platform_admin()
        )
    )
  );

CREATE POLICY "student_tag_assignments_insert"
  ON public.student_tag_assignments FOR INSERT
  WITH CHECK (
    public.has_permission('students:student:update')
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id
        AND s.organization_id = public.auth_organization_id()
    )
  );

CREATE POLICY "student_tag_assignments_delete"
  ON public.student_tag_assignments FOR DELETE
  USING (
    public.has_permission('students:student:update')
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id
        AND s.organization_id = public.auth_organization_id()
    )
  );

-- ── Student documents ─────────────────────────────────────────────────────────

CREATE POLICY "student_documents_select_staff"
  ON public.student_documents FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('documents:document:read')
  );

-- Student portal: own documents only (not soft-deleted)
CREATE POLICY "student_documents_select_self"
  ON public.student_documents FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "student_documents_select_platform"
  ON public.student_documents FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "student_documents_insert"
  ON public.student_documents FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('documents:document:create')
  );

CREATE POLICY "student_documents_update"
  ON public.student_documents FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('documents:document:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('documents:document:update')
  );

CREATE POLICY "student_documents_delete"
  ON public.student_documents FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('documents:document:delete')
  );

-- ── Instructors ───────────────────────────────────────────────────────────────

CREATE POLICY "instructors_select_staff"
  ON public.instructors FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('instructors:instructor:read')
  );

-- Instructor portal: can read their own record
CREATE POLICY "instructors_select_self"
  ON public.instructors FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "instructors_select_platform"
  ON public.instructors FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "instructors_insert"
  ON public.instructors FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('instructors:instructor:create')
  );

CREATE POLICY "instructors_update"
  ON public.instructors FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('instructors:instructor:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('instructors:instructor:update')
  );

CREATE POLICY "instructors_delete"
  ON public.instructors FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('instructors:instructor:delete')
  );

-- ── Instructor certifications ─────────────────────────────────────────────────

CREATE POLICY "instructor_certifications_select"
  ON public.instructor_certifications FOR SELECT
  USING (
    (
      organization_id = public.auth_organization_id()
      AND public.has_permission('instructors:instructor:read')
    )
    OR EXISTS (
      SELECT 1 FROM public.instructors i
      WHERE i.id = instructor_id AND i.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

CREATE POLICY "instructor_certifications_insert"
  ON public.instructor_certifications FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('instructors:instructor:update')
  );

CREATE POLICY "instructor_certifications_update"
  ON public.instructor_certifications FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('instructors:instructor:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('instructors:instructor:update')
  );

CREATE POLICY "instructor_certifications_delete"
  ON public.instructor_certifications FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('instructors:instructor:delete')
  );

-- ── Instructor-vehicle assignments ────────────────────────────────────────────

CREATE POLICY "instructor_vehicle_assignments_select"
  ON public.instructor_vehicle_assignments FOR SELECT
  USING (
    (
      organization_id = public.auth_organization_id()
      AND public.has_any_permission(ARRAY['vehicles:vehicle:read','instructors:instructor:read'])
    )
    OR public.is_platform_admin()
  );

CREATE POLICY "instructor_vehicle_assignments_insert"
  ON public.instructor_vehicle_assignments FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  );

CREATE POLICY "instructor_vehicle_assignments_update"
  ON public.instructor_vehicle_assignments FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  );

CREATE POLICY "instructor_vehicle_assignments_delete"
  ON public.instructor_vehicle_assignments FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  );

-- ── Vehicles ──────────────────────────────────────────────────────────────────

CREATE POLICY "vehicles_select"
  ON public.vehicles FOR SELECT
  USING (
    (
      organization_id = public.auth_organization_id()
      AND public.has_permission('vehicles:vehicle:read')
    )
    OR public.is_platform_admin()
  );

CREATE POLICY "vehicles_insert"
  ON public.vehicles FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:create')
  );

CREATE POLICY "vehicles_update"
  ON public.vehicles FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  );

CREATE POLICY "vehicles_delete"
  ON public.vehicles FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:delete')
  );

-- ── Vehicle maintenance ───────────────────────────────────────────────────────

CREATE POLICY "vehicle_maintenance_select"
  ON public.vehicle_maintenance FOR SELECT
  USING (
    (
      organization_id = public.auth_organization_id()
      AND public.has_permission('vehicles:vehicle:read')
    )
    OR public.is_platform_admin()
  );

CREATE POLICY "vehicle_maintenance_insert"
  ON public.vehicle_maintenance FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  );

CREATE POLICY "vehicle_maintenance_update"
  ON public.vehicle_maintenance FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  );

-- ── Vehicle inspections ───────────────────────────────────────────────────────

CREATE POLICY "vehicle_inspections_select"
  ON public.vehicle_inspections FOR SELECT
  USING (
    (
      organization_id = public.auth_organization_id()
      AND public.has_permission('vehicles:vehicle:read')
    )
    OR public.is_platform_admin()
  );

CREATE POLICY "vehicle_inspections_insert"
  ON public.vehicle_inspections FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  );

CREATE POLICY "vehicle_inspections_update"
  ON public.vehicle_inspections FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('vehicles:vehicle:update')
  );

-- =============================================================================
-- SECTION 6: INDEXES
-- Grouped by domain and query pattern. Partial indexes on deleted_at IS NULL
-- keep index size minimal on tables with high write volume.
-- =============================================================================

-- ── Students ──────────────────────────────────────────────────────────────────

-- Primary list query: org + status filter
CREATE INDEX idx_students_org_status
  ON public.students (organization_id, status)
  WHERE deleted_at IS NULL;

-- Personnummer HMAC equality lookup within org
CREATE INDEX idx_students_org_pnum_hash
  ON public.students (organization_id, personnummer_hash)
  WHERE personnummer_hash IS NOT NULL;

-- Instructor's assigned students (used by instructor dashboard)
CREATE INDEX idx_students_assigned_instructor
  ON public.students (organization_id, assigned_instructor_id)
  WHERE deleted_at IS NULL AND assigned_instructor_id IS NOT NULL;

-- Permit stage funnel analytics
CREATE INDEX idx_students_org_permit_stage
  ON public.students (organization_id, permit_stage)
  WHERE deleted_at IS NULL;

-- Enrollment location filter
CREATE INDEX idx_students_org_location
  ON public.students (organization_id, enrollment_location_id)
  WHERE deleted_at IS NULL AND enrollment_location_id IS NOT NULL;

-- Student portal JWT verification
CREATE INDEX idx_students_user_id
  ON public.students (user_id)
  WHERE user_id IS NOT NULL;

-- Full-text name search (uses pg_trgm extension from Phase 1A)
CREATE INDEX idx_students_name_trgm
  ON public.students USING GIN (
    (first_name || ' ' || last_name) gin_trgm_ops
  )
  WHERE deleted_at IS NULL;

-- ── Student notes ─────────────────────────────────────────────────────────────

CREATE INDEX idx_student_notes_student
  ON public.student_notes (student_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_student_notes_author
  ON public.student_notes (author_id)
  WHERE deleted_at IS NULL;

-- ── Student documents ─────────────────────────────────────────────────────────

CREATE INDEX idx_student_documents_student_category
  ON public.student_documents (student_id, category)
  WHERE deleted_at IS NULL;

-- Admin review queue
CREATE INDEX idx_student_documents_pending_review
  ON public.student_documents (organization_id, created_at DESC)
  WHERE deleted_at IS NULL AND status = 'pending_review';

-- Document expiry monitoring
CREATE INDEX idx_student_documents_expiry
  ON public.student_documents (organization_id, expires_at)
  WHERE deleted_at IS NULL AND expires_at IS NOT NULL;

-- ── Student tag assignments ───────────────────────────────────────────────────

CREATE INDEX idx_student_tag_assignments_tag
  ON public.student_tag_assignments (tag_id);

-- ── Instructors ───────────────────────────────────────────────────────────────

-- Primary list query
CREATE INDEX idx_instructors_org_employment
  ON public.instructors (organization_id, employment_type)
  WHERE deleted_at IS NULL;

-- Location-based filter
CREATE INDEX idx_instructors_org_location
  ON public.instructors (organization_id, primary_location_id)
  WHERE deleted_at IS NULL;

-- Portal lookups
CREATE INDEX idx_instructors_user_id
  ON public.instructors (user_id)
  WHERE user_id IS NOT NULL;

-- ADI expiry monitoring dashboard
CREATE INDEX idx_instructors_adi_expiry
  ON public.instructors (organization_id, adi_valid_until)
  WHERE deleted_at IS NULL AND adi_valid_until IS NOT NULL;

-- Teaching category array containment (@>) queries from scheduling engine
CREATE INDEX idx_instructors_teaching_categories
  ON public.instructors USING GIN (teaching_categories);

-- Full-text name search
CREATE INDEX idx_instructors_name_trgm
  ON public.instructors USING GIN (
    (first_name || ' ' || last_name) gin_trgm_ops
  )
  WHERE deleted_at IS NULL;

-- ── Instructor certifications ─────────────────────────────────────────────────

CREATE INDEX idx_instructor_certifications_instructor
  ON public.instructor_certifications (instructor_id, certification_type);

-- Expiry monitoring (only active certs with an expiry date)
CREATE INDEX idx_instructor_certifications_expiry
  ON public.instructor_certifications (organization_id, expires_at)
  WHERE expires_at IS NOT NULL AND status = 'active';

-- ── Instructor-vehicle assignments ────────────────────────────────────────────

CREATE INDEX idx_iva_instructor_active
  ON public.instructor_vehicle_assignments (instructor_id)
  WHERE unassigned_at IS NULL;

CREATE INDEX idx_iva_vehicle_active
  ON public.instructor_vehicle_assignments (vehicle_id)
  WHERE unassigned_at IS NULL;

-- ── Vehicles ──────────────────────────────────────────────────────────────────

-- Available vehicles for booking
CREATE INDEX idx_vehicles_org_status
  ON public.vehicles (organization_id, operational_status)
  WHERE deleted_at IS NULL;

-- Location-based fleet view
CREATE INDEX idx_vehicles_org_location
  ON public.vehicles (organization_id, primary_location_id)
  WHERE deleted_at IS NULL;

-- Category filter for lesson booking (e.g. find all 'A' category vehicles)
CREATE INDEX idx_vehicles_teaching_categories
  ON public.vehicles USING GIN (teaching_categories);

-- Compliance monitoring: insurance
CREATE INDEX idx_vehicles_insurance_expiry
  ON public.vehicles (organization_id, insurance_expires_at)
  WHERE deleted_at IS NULL;

-- Compliance monitoring: road tax registration
CREATE INDEX idx_vehicles_registration_expiry
  ON public.vehicles (organization_id, registration_expires_at)
  WHERE deleted_at IS NULL;

-- Compliance monitoring: besiktning
CREATE INDEX idx_vehicles_inspection_due
  ON public.vehicles (organization_id, next_inspection_due_at)
  WHERE deleted_at IS NULL AND next_inspection_due_at IS NOT NULL;

-- ── Vehicle maintenance ───────────────────────────────────────────────────────

-- Scheduling engine: is this vehicle currently in maintenance?
CREATE INDEX idx_vehicle_maintenance_vehicle_status
  ON public.vehicle_maintenance (vehicle_id, status, scheduled_at);

-- Upcoming maintenance overview
CREATE INDEX idx_vehicle_maintenance_active
  ON public.vehicle_maintenance (organization_id, scheduled_at)
  WHERE status IN ('scheduled', 'in_progress');

-- ── Vehicle inspections ───────────────────────────────────────────────────────

CREATE INDEX idx_vehicle_inspections_vehicle
  ON public.vehicle_inspections (vehicle_id, inspected_at DESC);

CREATE INDEX idx_vehicle_inspections_due
  ON public.vehicle_inspections (organization_id, next_due_at);

-- =============================================================================
-- SECTION 7: EVENT OUTBOX EMISSION TRIGGERS
-- Domain events are written to the outbox atomically with their state changes.
-- Downstream workers consume the 'internal' channel to trigger:
--   - notification emails/SMS to students and staff
--   - scheduling engine cache invalidation (Phase 2B)
--   - AI analytics pipeline (future)
--   - audit activity feed enrichment
-- insert_outbox_event() is the established helper from Phase 1B.2.
-- event_type format must match '^[a-z_]+\.[a-z_]+$' (constraint on event_outbox).
-- =============================================================================

-- Student status change — triggers onboarding reminders, completion emails, etc.
CREATE OR REPLACE FUNCTION public.emit_student_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.insert_outbox_event(
      'student.status_changed',
      'internal',
      jsonb_build_object(
        'student_id',       NEW.id,
        'organization_id',  NEW.organization_id,
        'old_status',       OLD.status,
        'new_status',       NEW.status,
        'changed_by',       NEW.updated_by
      ),
      NEW.organization_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_students_status_changed
  AFTER UPDATE OF status ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.emit_student_status_changed();

-- Student permit stage change — congratulatory notifications, next-step reminders.
CREATE OR REPLACE FUNCTION public.emit_student_permit_stage_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.permit_stage IS DISTINCT FROM NEW.permit_stage THEN
    PERFORM public.insert_outbox_event(
      'student.permit_changed',
      'internal',
      jsonb_build_object(
        'student_id',        NEW.id,
        'organization_id',   NEW.organization_id,
        'old_stage',         OLD.permit_stage,
        'new_stage',         NEW.permit_stage,
        'licence_category',  NEW.target_licence_category
      ),
      NEW.organization_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_students_permit_stage_changed
  AFTER UPDATE OF permit_stage ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.emit_student_permit_stage_changed();

-- Instructor employment type change — HR notifications, schedule recalculation.
CREATE OR REPLACE FUNCTION public.emit_instructor_employment_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.employment_type IS DISTINCT FROM NEW.employment_type THEN
    PERFORM public.insert_outbox_event(
      'instructor.employment_changed',
      'internal',
      jsonb_build_object(
        'instructor_id',       NEW.id,
        'organization_id',     NEW.organization_id,
        'old_employment_type', OLD.employment_type,
        'new_employment_type', NEW.employment_type,
        'changed_by',          NEW.updated_by
      ),
      NEW.organization_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_instructors_employment_changed
  AFTER UPDATE OF employment_type ON public.instructors
  FOR EACH ROW EXECUTE FUNCTION public.emit_instructor_employment_changed();

-- Vehicle operational status change — scheduling engine signal, compliance alerts.
CREATE OR REPLACE FUNCTION public.emit_vehicle_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.operational_status IS DISTINCT FROM NEW.operational_status THEN
    PERFORM public.insert_outbox_event(
      'vehicle.status_changed',
      'internal',
      jsonb_build_object(
        'vehicle_id',          NEW.id,
        'organization_id',     NEW.organization_id,
        'registration_number', NEW.registration_number,
        'old_status',          OLD.operational_status,
        'new_status',          NEW.operational_status,
        'reason',              NEW.status_change_reason,
        'changed_by',          NEW.updated_by
      ),
      NEW.organization_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vehicles_status_changed
  AFTER UPDATE OF operational_status ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.emit_vehicle_status_changed();

-- =============================================================================
-- SECTION 8: SOFT DELETE FRAMEWORK EXTENSION
-- Extends the whitelists in soft_delete() and soft_restore() from Phase 1B.2
-- to include the new Phase 2A tables.
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
  IF p_table_name NOT IN (
    'organizations',
    'organization_locations',
    'profiles',
    -- Phase 2A:
    'students',
    'student_notes',
    'student_documents',
    'instructors',
    'vehicles'
  ) THEN
    RAISE EXCEPTION
      'soft_delete: table "%" is not whitelisted. Add it to soft_delete() and soft_restore() when ready.',
      p_table_name;
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
    p_table_name
  ) USING auth.uid(), p_record_id;
END;
$$;

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
  IF p_table_name NOT IN (
    'organizations',
    'organization_locations',
    'profiles',
    -- Phase 2A:
    'students',
    'student_notes',
    'student_documents',
    'instructors',
    'vehicles'
  ) THEN
    RAISE EXCEPTION
      'soft_restore: table "%" is not whitelisted.',
      p_table_name;
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

-- =============================================================================
-- SECTION 9: PERMISSIONS SEED — VEHICLES DOMAIN
-- Students and instructors permissions were seeded in Phase 1A.
-- Vehicle permissions are new in Phase 2A.
-- =============================================================================

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'vehicles:vehicle:create', 'vehicles', 'vehicle', 'create', 'Add new vehicles to the fleet'),
  (gen_random_uuid(), 'vehicles:vehicle:read',   'vehicles', 'vehicle', 'read',   'View vehicle records and operational status'),
  (gen_random_uuid(), 'vehicles:vehicle:update', 'vehicles', 'vehicle', 'update', 'Edit vehicle information, status, and assignments'),
  (gen_random_uuid(), 'vehicles:vehicle:delete', 'vehicles', 'vehicle', 'delete', 'Decommission or soft-delete vehicle records'),
  (gen_random_uuid(), 'vehicles:vehicle:export', 'vehicles', 'vehicle', 'export', 'Export fleet data to CSV');

-- org_owner and org_admin: all vehicle permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('org_owner', 'org_admin') AND r.is_system_role = true
  AND p.domain = 'vehicles';

-- org_manager: all except delete
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'org_manager' AND r.is_system_role = true
  AND p.code = ANY(ARRAY[
    'vehicles:vehicle:create', 'vehicles:vehicle:read',
    'vehicles:vehicle:update', 'vehicles:vehicle:export'
  ]);

-- instructors: read-only (know their assigned vehicle)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('instructor', 'instructor_senior') AND r.is_system_role = true
  AND p.code = 'vehicles:vehicle:read';

-- receptionist: read-only (booking awareness)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'receptionist' AND r.is_system_role = true
  AND p.code = 'vehicles:vehicle:read';

-- =============================================================================
-- SECTION 10: SECURITY HARDENING
-- Revoke anon access from all new tables as belt-and-suspenders hardening
-- (RLS USING clauses already block unauthenticated access).
-- =============================================================================

REVOKE ALL ON TABLE public.students                        FROM anon;
REVOKE ALL ON TABLE public.student_emergency_contacts      FROM anon;
REVOKE ALL ON TABLE public.student_notes                   FROM anon;
REVOKE ALL ON TABLE public.student_tags                    FROM anon;
REVOKE ALL ON TABLE public.student_tag_assignments         FROM anon;
REVOKE ALL ON TABLE public.student_documents               FROM anon;
REVOKE ALL ON TABLE public.instructors                     FROM anon;
REVOKE ALL ON TABLE public.instructor_certifications       FROM anon;
REVOKE ALL ON TABLE public.instructor_vehicle_assignments  FROM anon;
REVOKE ALL ON TABLE public.vehicles                        FROM anon;
REVOKE ALL ON TABLE public.vehicle_maintenance             FROM anon;
REVOKE ALL ON TABLE public.vehicle_inspections             FROM anon;
