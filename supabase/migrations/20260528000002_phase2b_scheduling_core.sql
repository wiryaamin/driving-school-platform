-- =============================================================================
-- MIGRATION: 20260528000002_phase2b_scheduling_core.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2B — Scheduling Engine Core (Split 1 of 4)
-- Description:
--   Extension, enums, all 8 scheduling tables (with soft-delete columns on
--   lesson_slots, lesson_bookings, booking_attendance, booking_notes), all
--   EXCLUDE conflict-prevention constraints, conflict-detection helpers,
--   soft-delete whitelist extension, booking lifecycle state machine,
--   concurrency preparation hooks, operational triggers, permissions seed,
--   and anon REVOKE hardening.
--
-- Execution order (all 4 files must run in sequence):
--   1. 20260528000002_phase2b_scheduling_core.sql    ← this file
--   2. 20260528000003_phase2b_scheduling_rls.sql
--   3. 20260528000004_phase2b_scheduling_events.sql
--   4. 20260528000005_phase2b_scheduling_indexes.sql
--
-- Dependencies:
--   20260527000001_enterprise_foundation.sql  — organizations, org_locations,
--     RBAC, audit_logs, set_updated_at(), audit_trigger_fn(), permissions
--   20260527000002_phase1b2_hardening.sql — event_outbox, insert_outbox_event(),
--     soft_delete(), soft_restore(), platform_admins
--   20260528000001_phase2a_domain_foundation.sql — students, instructors,
--     vehicles, organization_locations
-- =============================================================================

-- =============================================================================
-- SECTION 1: EXTENSIONS
-- btree_gist enables EXCLUDE constraints combining uuid = equality with
-- tstzrange && range overlap. Required for all three conflict-prevention
-- EXCLUDE constraints below (instructor, vehicle, student).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =============================================================================
-- SECTION 2: DOMAIN ENUMS
-- =============================================================================

CREATE TYPE public.lesson_category AS ENUM (
  'driving',      -- Standard driving lesson (körlektion)
  'theory',       -- Theory review / discussion session
  'risk1',        -- Riskutbildning 1 (halkan + hazard awareness theory)
  'risk2',        -- Riskutbildning 2 (night driving / motorway)
  'simulator',    -- Driving simulator session
  'assessment',   -- Skills assessment / utvärdering
  'intensive',    -- Multi-hour concentrated session (heldagspaket etc.)
  'group_theory', -- Group theory class (multi-seat; future capacity > 1)
  'other'
);

-- open → full (counter trigger) → in_progress → completed
-- open|full|in_progress → cancelled (admin action)
-- open → blocked (ad-hoc override without a formal time-off request)
CREATE TYPE public.lesson_slot_status AS ENUM (
  'open',
  'full',
  'in_progress',
  'completed',
  'cancelled',
  'blocked'
);

-- draft → reserved → confirmed → completed
--      → cancelled (any stage before completed)
--      → no_show   (after lesson time, student absent)
--      → rescheduled (replaced by a new booking; rescheduled_from_id set on new)
CREATE TYPE public.booking_status AS ENUM (
  'draft',
  'reserved',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled'
);

CREATE TYPE public.time_off_type AS ENUM (
  'vacation',
  'sickness',
  'training',
  'public_holiday',
  'emergency',
  'other'
);

CREATE TYPE public.time_off_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

-- Provenance of a concrete lesson slot.
-- 'imported' is prepared for future Google / Outlook calendar sync.
CREATE TYPE public.slot_generation_source AS ENUM (
  'manual',
  'recurring',
  'imported'
);

-- =============================================================================
-- SECTION 3: LESSON TYPES
-- Per-org configurable catalog. Drives resource requirements, duration defaults,
-- slot capacity, calendar styling, and Phase 3 pricing.
-- =============================================================================

CREATE TABLE public.lesson_types (
  id                        uuid                   NOT NULL DEFAULT gen_random_uuid(),
  organization_id           uuid                   NOT NULL,

  name                      text                   NOT NULL,
  -- Stable machine identifier unique within the org (e.g. 'driving_b', 'risk1').
  -- Never rename in production — create a new type and deactivate the old one.
  code                      text                   NOT NULL,
  category                  public.lesson_category NOT NULL,

  default_duration_minutes  integer                NOT NULL DEFAULT 60,
  min_duration_minutes      integer                NOT NULL DEFAULT 30,
  max_duration_minutes      integer                NOT NULL DEFAULT 120,

  requires_vehicle          boolean                NOT NULL DEFAULT true,
  requires_instructor       boolean                NOT NULL DEFAULT true,
  -- Instructor must hold at least one active cert whose certification_type
  -- matches any element. Empty array = no certification required.
  required_certifications   text[]                 NOT NULL DEFAULT '{}',

  max_students_per_slot     integer                NOT NULL DEFAULT 1,

  color_hex                 text                   NOT NULL DEFAULT '#3B82F6',
  display_order             integer                NOT NULL DEFAULT 0,
  is_active                 boolean                NOT NULL DEFAULT true,

  -- Phase 3 finance hook: copied to lesson_bookings.price_sek at booking time
  pricing_sek               numeric(10,2),

  created_by                uuid,
  updated_by                uuid,
  created_at                timestamptz            NOT NULL DEFAULT now(),
  updated_at                timestamptz            NOT NULL DEFAULT now(),

  CONSTRAINT lesson_types_pkey               PRIMARY KEY (id),
  CONSTRAINT lesson_types_org_fkey           FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT lesson_types_creator_fkey       FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lesson_types_updater_fkey       FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lesson_types_org_code_uniq      UNIQUE (organization_id, code),
  CONSTRAINT lesson_types_default_dur_pos    CHECK (default_duration_minutes > 0),
  CONSTRAINT lesson_types_dur_min_lte_max    CHECK (min_duration_minutes <= max_duration_minutes),
  CONSTRAINT lesson_types_dur_default_range  CHECK (
    default_duration_minutes BETWEEN min_duration_minutes AND max_duration_minutes
  ),
  CONSTRAINT lesson_types_max_students_pos   CHECK (max_students_per_slot >= 1),
  CONSTRAINT lesson_types_color_hex_format   CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT lesson_types_pricing_nn         CHECK (pricing_sek IS NULL OR pricing_sek >= 0)
);

COMMENT ON TABLE  public.lesson_types IS
  'Per-org lesson type catalog. Drives resource requirements, duration defaults, '
  'slot capacity, and calendar styling. pricing_sek is Phase 3 finance hook.';
COMMENT ON COLUMN public.lesson_types.code IS
  'Stable machine identifier unique within the org (e.g. ''driving_b'', ''risk1''). '
  'Never rename in production — create a new type and deactivate the old one.';
COMMENT ON COLUMN public.lesson_types.pricing_sek IS
  'Catalogue price in SEK. Copied to lesson_bookings.price_sek at booking time '
  'to preserve the agreed price independently of future catalogue changes.';

CREATE TRIGGER lesson_types_set_updated_at
  BEFORE UPDATE ON public.lesson_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER lesson_types_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.lesson_types
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

REVOKE ALL ON TABLE public.lesson_types FROM anon;

-- =============================================================================
-- SECTION 4: INSTRUCTOR AVAILABILITY
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 INSTRUCTOR AVAILABILITY RULES
-- Recurring weekly teaching windows. AVAILABILITY ≠ BOOKING.
--
-- DST handling: start_time / end_time are wall-clock TIME + IANA timezone.
-- Slot generator converts: (date || ' ' || start_time)::timestamp AT TIME ZONE timezone
-- This correctly yields 07:00 UTC in summer (CEST) or 08:00 UTC in winter (CET)
-- for a 09:00 local window.
--
-- Split shifts: two rules for the same (instructor_id, day_of_week) model a
-- lunch break (e.g. 09:00–12:00 and 13:00–17:00).
-- ---------------------------------------------------------------------------
CREATE TABLE public.instructor_availability_rules (
  id                     uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id        uuid         NOT NULL,
  instructor_id          uuid         NOT NULL,
  location_id            uuid,         -- NULL = available at any org location

  day_of_week            smallint     NOT NULL, -- 0=Sunday … 6=Saturday
  start_time             time         NOT NULL, -- local wall-clock, inclusive
  end_time               time         NOT NULL, -- local wall-clock, exclusive
  -- IANA timezone string for DST-correct slot generation
  timezone               text         NOT NULL DEFAULT 'Europe/Stockholm',

  effective_from         date         NOT NULL DEFAULT CURRENT_DATE,
  effective_until        date,                  -- NULL = indefinite

  slot_duration_minutes  integer      NOT NULL DEFAULT 60,
  slot_buffer_minutes    integer      NOT NULL DEFAULT 0,
  max_lessons_override   integer,

  is_active              boolean      NOT NULL DEFAULT true,
  notes                  text,

  created_by             uuid,
  updated_by             uuid,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT instructor_availability_rules_pkey         PRIMARY KEY (id),
  CONSTRAINT instructor_availability_rules_org_fkey     FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT instructor_availability_rules_instr_fkey   FOREIGN KEY (instructor_id)
    REFERENCES public.instructors(id) ON DELETE CASCADE,
  CONSTRAINT instructor_availability_rules_loc_fkey     FOREIGN KEY (location_id)
    REFERENCES public.organization_locations(id) ON DELETE SET NULL,
  CONSTRAINT instructor_availability_rules_creator_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT instructor_availability_rules_updater_fkey FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT instructor_availability_rules_day_range    CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT instructor_availability_rules_time_order   CHECK (start_time < end_time),
  CONSTRAINT instructor_availability_rules_eff_order    CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),
  CONSTRAINT instructor_availability_rules_slot_pos     CHECK (slot_duration_minutes > 0),
  CONSTRAINT instructor_availability_rules_buffer_nn    CHECK (slot_buffer_minutes >= 0),
  CONSTRAINT instructor_availability_rules_max_pos      CHECK (
    max_lessons_override IS NULL OR max_lessons_override > 0
  )
);

COMMENT ON TABLE  public.instructor_availability_rules IS
  'Recurring weekly teaching windows. start_time / end_time are local wall-clock; '
  'timezone is IANA for DST-correct slot generation. '
  'Split shifts (lunch break) require two rules for the same day_of_week.';
COMMENT ON COLUMN public.instructor_availability_rules.timezone IS
  'IANA string (e.g. ''Europe/Stockholm''). '
  'Slot generator: (date || '' '' || start_time)::timestamp AT TIME ZONE timezone → UTC.';

CREATE TRIGGER instructor_availability_rules_set_updated_at
  BEFORE UPDATE ON public.instructor_availability_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER instructor_availability_rules_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.instructor_availability_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

REVOKE ALL ON TABLE public.instructor_availability_rules FROM anon;

-- ---------------------------------------------------------------------------
-- 4.2 INSTRUCTOR TIME OFF
-- Absence records that block scheduling eligibility when approved.
-- EXCLUDE prevents two approved entries from overlapping for the same instructor.
-- ---------------------------------------------------------------------------
CREATE TABLE public.instructor_time_off (
  id                uuid                   NOT NULL DEFAULT gen_random_uuid(),
  organization_id   uuid                   NOT NULL,
  instructor_id     uuid                   NOT NULL,

  time_off_type     public.time_off_type   NOT NULL,
  status            public.time_off_status NOT NULL DEFAULT 'pending',

  starts_at         timestamptz            NOT NULL,
  ends_at           timestamptz            NOT NULL,
  is_full_day       boolean                NOT NULL DEFAULT false,

  reason            text,

  approved_by       uuid,
  approved_at       timestamptz,
  rejection_reason  text,

  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz            NOT NULL DEFAULT now(),
  updated_at        timestamptz            NOT NULL DEFAULT now(),

  CONSTRAINT instructor_time_off_pkey                   PRIMARY KEY (id),
  CONSTRAINT instructor_time_off_org_fkey               FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT instructor_time_off_instr_fkey             FOREIGN KEY (instructor_id)
    REFERENCES public.instructors(id) ON DELETE CASCADE,
  CONSTRAINT instructor_time_off_approver_fkey          FOREIGN KEY (approved_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT instructor_time_off_creator_fkey           FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT instructor_time_off_updater_fkey           FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT instructor_time_off_time_order             CHECK (starts_at < ends_at),
  CONSTRAINT instructor_time_off_approval_consistency   CHECK (
    status != 'approved'
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

COMMENT ON TABLE  public.instructor_time_off IS
  'Instructor absence entries. status = ''approved'' blocks the covered window '
  'for all scheduling. EXCLUDE prevents overlapping approved entries per instructor.';
COMMENT ON COLUMN public.instructor_time_off.is_full_day IS
  'Display hint for calendar UI: render as full-day block regardless of UTC times.';

-- Only approved time-off blocks the constraint. Pending/rejected/cancelled may overlap.
ALTER TABLE public.instructor_time_off
  ADD CONSTRAINT instructor_time_off_no_overlap
  EXCLUDE USING gist (
    instructor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status = 'approved');

CREATE TRIGGER instructor_time_off_set_updated_at
  BEFORE UPDATE ON public.instructor_time_off
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER instructor_time_off_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.instructor_time_off
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

REVOKE ALL ON TABLE public.instructor_time_off FROM anon;

-- ---------------------------------------------------------------------------
-- 4.3 RECURRING SCHEDULE EXCEPTIONS
-- Date-level overrides for recurring availability rules.
-- Slot generator reads BEFORE materialising each occurrence:
--   exception_type = 'cancelled' → skip this date.
--   exception_type = 'modified'  → use new_start_time / new_end_time.
-- ---------------------------------------------------------------------------
CREATE TABLE public.recurring_schedule_exceptions (
  id                    uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id       uuid         NOT NULL,
  availability_rule_id  uuid         NOT NULL,
  instructor_id         uuid         NOT NULL,

  exception_date        date         NOT NULL,
  exception_type        text         NOT NULL, -- 'cancelled' | 'modified'

  new_start_time        time,
  new_end_time          time,
  new_location_id       uuid,
  reason                text,

  created_by            uuid,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT recurring_schedule_exceptions_pkey           PRIMARY KEY (id),
  CONSTRAINT recurring_schedule_exceptions_org_fkey       FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT recurring_schedule_exceptions_rule_fkey      FOREIGN KEY (availability_rule_id)
    REFERENCES public.instructor_availability_rules(id) ON DELETE CASCADE,
  CONSTRAINT recurring_schedule_exceptions_instr_fkey     FOREIGN KEY (instructor_id)
    REFERENCES public.instructors(id) ON DELETE CASCADE,
  CONSTRAINT recurring_schedule_exceptions_loc_fkey       FOREIGN KEY (new_location_id)
    REFERENCES public.organization_locations(id) ON DELETE SET NULL,
  CONSTRAINT recurring_schedule_exceptions_creator_fkey   FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT recurring_schedule_exceptions_rule_date_uniq UNIQUE (availability_rule_id, exception_date),
  CONSTRAINT recurring_schedule_exceptions_type_check     CHECK (
    exception_type IN ('cancelled', 'modified')
  ),
  CONSTRAINT recurring_schedule_exceptions_modified_times CHECK (
    exception_type != 'modified'
    OR (
      new_start_time IS NOT NULL
      AND new_end_time IS NOT NULL
      AND new_start_time < new_end_time
    )
  )
);

COMMENT ON TABLE public.recurring_schedule_exceptions IS
  'Date-level overrides for recurring availability rules. '
  'Slot generator checks this table before materialising each occurrence. '
  'Use instructor_time_off for full-day / multi-day absences.';

CREATE TRIGGER recurring_schedule_exceptions_set_updated_at
  BEFORE UPDATE ON public.recurring_schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER recurring_schedule_exceptions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.recurring_schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

REVOKE ALL ON TABLE public.recurring_schedule_exceptions FROM anon;

-- =============================================================================
-- SECTION 5: LESSON SLOTS
-- Concrete bookable time windows. The primary scheduling unit.
--
-- Soft delete: deleted_at / deleted_by provide operational history retention
-- without physically removing slot records. Application must call
-- soft_delete('lesson_slots', id) rather than DELETE. Slot bookings must be
-- cancelled or rescheduled before a slot can be soft-deleted (application layer).
--
-- EXCLUDE constraints include AND deleted_at IS NULL so that soft-deleted
-- slots do not hold instructor or vehicle time beyond their operational life.
-- =============================================================================

CREATE TABLE public.lesson_slots (
  id                     uuid                          NOT NULL DEFAULT gen_random_uuid(),
  organization_id        uuid                          NOT NULL,

  instructor_id          uuid                          NOT NULL,
  vehicle_id             uuid,                                   -- NULL = no vehicle required
  location_id            uuid,
  lesson_type_id         uuid                          NOT NULL,

  -- Always stored UTC. timezone is a display hint only — never use for arithmetic.
  starts_at              timestamptz                   NOT NULL,
  ends_at                timestamptz                   NOT NULL,
  timezone               text                          NOT NULL DEFAULT 'Europe/Stockholm',

  status                 public.lesson_slot_status     NOT NULL DEFAULT 'open',
  status_changed_at      timestamptz,

  max_bookings           integer                       NOT NULL DEFAULT 1,
  -- Maintained by update_slot_booking_count() AFTER trigger (Section 11).
  -- Do not set directly; the trigger will overwrite on the next booking change.
  current_bookings       integer                       NOT NULL DEFAULT 0,

  generation_source      public.slot_generation_source NOT NULL DEFAULT 'manual',
  availability_rule_id   uuid,
  exception_id           uuid,
  notes                  text,

  -- Soft delete (enterprise operational history retention)
  deleted_at             timestamptz,
  deleted_by             uuid,

  created_by             uuid,
  updated_by             uuid,
  created_at             timestamptz                   NOT NULL DEFAULT now(),
  updated_at             timestamptz                   NOT NULL DEFAULT now(),

  CONSTRAINT lesson_slots_pkey             PRIMARY KEY (id),
  CONSTRAINT lesson_slots_org_fkey         FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT lesson_slots_instructor_fkey  FOREIGN KEY (instructor_id)
    REFERENCES public.instructors(id) ON DELETE RESTRICT,
  CONSTRAINT lesson_slots_vehicle_fkey     FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles(id) ON DELETE SET NULL,
  CONSTRAINT lesson_slots_location_fkey    FOREIGN KEY (location_id)
    REFERENCES public.organization_locations(id) ON DELETE SET NULL,
  CONSTRAINT lesson_slots_type_fkey        FOREIGN KEY (lesson_type_id)
    REFERENCES public.lesson_types(id) ON DELETE RESTRICT,
  CONSTRAINT lesson_slots_rule_fkey        FOREIGN KEY (availability_rule_id)
    REFERENCES public.instructor_availability_rules(id) ON DELETE SET NULL,
  CONSTRAINT lesson_slots_exception_fkey   FOREIGN KEY (exception_id)
    REFERENCES public.recurring_schedule_exceptions(id) ON DELETE SET NULL,
  CONSTRAINT lesson_slots_deleter_fkey     FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lesson_slots_creator_fkey     FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lesson_slots_updater_fkey     FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lesson_slots_time_order       CHECK (starts_at < ends_at),
  CONSTRAINT lesson_slots_max_bookings_pos CHECK (max_bookings >= 1),
  CONSTRAINT lesson_slots_bookings_nn      CHECK (current_bookings >= 0),
  CONSTRAINT lesson_slots_bookings_lte_max CHECK (current_bookings <= max_bookings)
);

COMMENT ON TABLE  public.lesson_slots IS
  'Concrete bookable time windows. Instructor and vehicle double-booking prevented '
  'by EXCLUDE constraints (btree_gist). current_bookings maintained by counter trigger. '
  'Soft-deleted slots (deleted_at IS NOT NULL) are excluded from EXCLUDE constraints '
  'and all normal queries.';
COMMENT ON COLUMN public.lesson_slots.timezone IS
  'IANA timezone for calendar display only (e.g. ''Europe/Stockholm''). '
  'starts_at / ends_at are UTC — never use timezone field for time arithmetic.';
COMMENT ON COLUMN public.lesson_slots.current_bookings IS
  'Maintained by update_slot_booking_count() AFTER trigger. Do not set directly.';

-- Instructor double-booking prevention.
-- Soft-deleted slots release the instructor time (deleted_at IS NULL condition).
ALTER TABLE public.lesson_slots
  ADD CONSTRAINT lesson_slots_instructor_no_overlap
  EXCLUDE USING gist (
    instructor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status NOT IN ('cancelled') AND deleted_at IS NULL);

-- Vehicle double-booking prevention.
-- Scoped to vehicle_id IS NOT NULL: theory slots without a vehicle don't conflict.
-- Soft-deleted slots release the vehicle (deleted_at IS NULL condition).
ALTER TABLE public.lesson_slots
  ADD CONSTRAINT lesson_slots_vehicle_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (vehicle_id IS NOT NULL AND status NOT IN ('cancelled') AND deleted_at IS NULL);

CREATE TRIGGER lesson_slots_set_updated_at
  BEFORE UPDATE ON public.lesson_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER lesson_slots_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.lesson_slots
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

REVOKE ALL ON TABLE public.lesson_slots FROM anon;

-- =============================================================================
-- SECTION 6: LESSON BOOKINGS + ATTENDANCE + NOTES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 6.1 LESSON BOOKINGS
-- Student allocations to lesson slots.
--
-- Denormalised fields (instructor_id, vehicle_id, lesson_type_id, location_id,
-- starts_at, ends_at) are copied from the slot by the BEFORE INSERT trigger
-- lesson_booking_set_slot_fields() in Section 11. Application code only needs
-- to supply slot_id, student_id, organization_id, and optional fields.
--
-- Rescheduling lineage: new booking sets rescheduled_from_id = old_booking.id.
-- Find replacement: SELECT * FROM lesson_bookings WHERE rescheduled_from_id = X.id
--
-- Soft delete: deleted_at / deleted_by preserve booking history beyond operational
-- lifecycle. Soft-deleted bookings are excluded from the student EXCLUDE constraint
-- and the slot booking counter, freeing time and capacity as if cancelled.
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_bookings (
  id                    uuid                  NOT NULL DEFAULT gen_random_uuid(),
  organization_id       uuid                  NOT NULL,

  slot_id               uuid                  NOT NULL,
  student_id            uuid                  NOT NULL,

  -- Denormalised from slot by BEFORE INSERT trigger — do not set manually
  instructor_id         uuid                  NOT NULL,
  vehicle_id            uuid,
  lesson_type_id        uuid                  NOT NULL,
  location_id           uuid,
  starts_at             timestamptz           NOT NULL,
  ends_at               timestamptz           NOT NULL,

  status                public.booking_status NOT NULL DEFAULT 'draft',
  status_changed_at     timestamptz,

  cancelled_at          timestamptz,
  cancelled_by          uuid,
  cancellation_reason   text,
  -- Structured category for analytics: student_request | school_cancelled |
  -- weather | vehicle_fault | instructor_sick | other
  cancellation_category text,

  -- Rescheduling lineage
  rescheduled_from_id   uuid,

  no_show_marked_at     timestamptz,
  no_show_marked_by     uuid,

  -- Phase 3 finance hooks
  package_item_id       uuid,
  payment_status        text             NOT NULL DEFAULT 'unpaid',
  price_sek             numeric(10,2),

  booked_by             uuid,

  -- Soft delete (operational history retention)
  deleted_at            timestamptz,
  deleted_by            uuid,

  created_by            uuid,
  updated_by            uuid,
  created_at            timestamptz       NOT NULL DEFAULT now(),
  updated_at            timestamptz       NOT NULL DEFAULT now(),

  CONSTRAINT lesson_bookings_pkey                   PRIMARY KEY (id),
  CONSTRAINT lesson_bookings_org_fkey               FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT lesson_bookings_slot_fkey              FOREIGN KEY (slot_id)
    REFERENCES public.lesson_slots(id) ON DELETE RESTRICT,
  CONSTRAINT lesson_bookings_student_fkey           FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE RESTRICT,
  CONSTRAINT lesson_bookings_instructor_fkey        FOREIGN KEY (instructor_id)
    REFERENCES public.instructors(id) ON DELETE RESTRICT,
  CONSTRAINT lesson_bookings_vehicle_fkey           FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles(id) ON DELETE SET NULL,
  CONSTRAINT lesson_bookings_type_fkey              FOREIGN KEY (lesson_type_id)
    REFERENCES public.lesson_types(id) ON DELETE RESTRICT,
  CONSTRAINT lesson_bookings_location_fkey          FOREIGN KEY (location_id)
    REFERENCES public.organization_locations(id) ON DELETE SET NULL,
  CONSTRAINT lesson_bookings_rescheduled_from_fkey  FOREIGN KEY (rescheduled_from_id)
    REFERENCES public.lesson_bookings(id) ON DELETE SET NULL,
  CONSTRAINT lesson_bookings_cancelled_by_fkey      FOREIGN KEY (cancelled_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lesson_bookings_no_show_by_fkey        FOREIGN KEY (no_show_marked_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lesson_bookings_booked_by_fkey         FOREIGN KEY (booked_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lesson_bookings_deleter_fkey           FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lesson_bookings_creator_fkey           FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lesson_bookings_updater_fkey           FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  -- A student can only have one booking per slot (even after cancellation).
  -- Rescheduling always targets a new slot — not a rebooking of the same slot.
  CONSTRAINT lesson_bookings_slot_student_uniq      UNIQUE (slot_id, student_id),
  CONSTRAINT lesson_bookings_time_order             CHECK (starts_at < ends_at),
  CONSTRAINT lesson_bookings_payment_status_check   CHECK (
    payment_status IN ('unpaid', 'paid', 'partial', 'refunded', 'waived')
  ),
  CONSTRAINT lesson_bookings_price_nn               CHECK (price_sek IS NULL OR price_sek >= 0),
  CONSTRAINT lesson_bookings_cancel_consistency     CHECK (
    (status = 'cancelled') = (cancelled_at IS NOT NULL)
  ),
  CONSTRAINT lesson_bookings_no_show_consistency    CHECK (
    (status = 'no_show') = (no_show_marked_at IS NOT NULL)
  )
);

COMMENT ON TABLE  public.lesson_bookings IS
  'Student allocations to lesson slots. starts_at / ends_at denormalised from slot '
  'by lesson_booking_set_slot_fields() trigger. Student overlap prevented by EXCLUDE '
  'constraint. Slot capacity managed by counter trigger. Soft-deleted bookings are '
  'excluded from the EXCLUDE constraint and counter (freeing time and capacity).';
COMMENT ON COLUMN public.lesson_bookings.rescheduled_from_id IS
  'Set on the NEW booking when rescheduling. Old booking status set to ''rescheduled''. '
  'Find replacement: SELECT * FROM lesson_bookings WHERE rescheduled_from_id = X.id';
COMMENT ON COLUMN public.lesson_bookings.cancellation_category IS
  'Structured reason for analytics: student_request, school_cancelled, weather, '
  'vehicle_fault, instructor_sick, other.';
COMMENT ON COLUMN public.lesson_bookings.price_sek IS
  'Price locked at booking time from lesson_types.pricing_sek. Phase 3 reads this.';

-- Student double-booking prevention.
-- Excluded statuses + soft-deleted rows free the student time window for rebooking.
ALTER TABLE public.lesson_bookings
  ADD CONSTRAINT lesson_bookings_student_no_overlap
  EXCLUDE USING gist (
    student_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled') AND deleted_at IS NULL);

CREATE TRIGGER lesson_bookings_set_updated_at
  BEFORE UPDATE ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER lesson_bookings_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

REVOKE ALL ON TABLE public.lesson_bookings FROM anon;

-- ---------------------------------------------------------------------------
-- 6.2 BOOKING ATTENDANCE
-- Post-lesson attendance record. One active (non-deleted) record per booking
-- enforced by partial unique index in the indexes migration.
-- performance_rating feeds the AI analytics pipeline (future Phase).
--
-- Soft delete: if an attendance record is entered in error, soft-delete it and
-- create a corrected one. Hard DELETE would permanently lose the audit trail.
-- ---------------------------------------------------------------------------
CREATE TABLE public.booking_attendance (
  id                  uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid         NOT NULL,
  booking_id          uuid         NOT NULL,
  student_id          uuid         NOT NULL,

  attended            boolean      NOT NULL,
  late_minutes        integer,

  instructor_notes    text,
  performance_rating  smallint,    -- 1–5; AI analytics hook

  recorded_by         uuid,
  recorded_at         timestamptz  NOT NULL DEFAULT now(),

  -- Soft delete
  deleted_at          timestamptz,
  deleted_by          uuid,

  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),

  -- NOTE: UNIQUE (booking_id) is enforced by a partial index
  -- (booking_attendance_active_uniq WHERE deleted_at IS NULL) in the indexes
  -- migration. This allows a corrected record after a soft-deleted error entry.
  CONSTRAINT booking_attendance_pkey          PRIMARY KEY (id),
  CONSTRAINT booking_attendance_org_fkey      FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT booking_attendance_booking_fkey  FOREIGN KEY (booking_id)
    REFERENCES public.lesson_bookings(id) ON DELETE CASCADE,
  CONSTRAINT booking_attendance_student_fkey  FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE RESTRICT,
  CONSTRAINT booking_attendance_recorder_fkey FOREIGN KEY (recorded_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_attendance_deleter_fkey  FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_attendance_late_nn       CHECK (late_minutes IS NULL OR late_minutes >= 0),
  CONSTRAINT booking_attendance_rating_range  CHECK (
    performance_rating IS NULL OR performance_rating BETWEEN 1 AND 5
  )
);

COMMENT ON TABLE  public.booking_attendance IS
  'Post-lesson attendance. One active record per booking (partial unique index in '
  'indexes migration). Soft-deleted records can be corrected without losing audit trail. '
  'performance_rating (1–5) feeds future AI student-progression analytics.';

CREATE TRIGGER booking_attendance_set_updated_at
  BEFORE UPDATE ON public.booking_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER booking_attendance_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.booking_attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

REVOKE ALL ON TABLE public.booking_attendance FROM anon;

-- ---------------------------------------------------------------------------
-- 6.3 BOOKING NOTES
-- Operational notes on a booking. Mirrors student_notes pattern from Phase 2A.
-- is_internal = true  → staff-only; never visible in the student portal.
-- is_internal = false → shared; student can read in their portal.
-- Soft delete preserves note history for audit and compliance.
-- ---------------------------------------------------------------------------
CREATE TABLE public.booking_notes (
  id               uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid         NOT NULL,
  booking_id       uuid         NOT NULL,
  author_id        uuid,

  content          text         NOT NULL,
  is_internal      boolean      NOT NULL DEFAULT true,

  -- Soft delete
  deleted_at       timestamptz,
  deleted_by       uuid,

  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT booking_notes_pkey         PRIMARY KEY (id),
  CONSTRAINT booking_notes_org_fkey     FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT booking_notes_booking_fkey FOREIGN KEY (booking_id)
    REFERENCES public.lesson_bookings(id) ON DELETE CASCADE,
  CONSTRAINT booking_notes_author_fkey  FOREIGN KEY (author_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_notes_deleter_fkey FOREIGN KEY (deleted_by)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.booking_notes IS
  'Operational notes on a booking. is_internal = true hides from student portal. '
  'Soft delete preserves note history — author attribution remains after deletion.';

CREATE TRIGGER booking_notes_set_updated_at
  BEFORE UPDATE ON public.booking_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER booking_notes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.booking_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

REVOKE ALL ON TABLE public.booking_notes FROM anon;

-- =============================================================================
-- SECTION 7: CONFLICT DETECTION HELPER FUNCTIONS
-- Pre-flight availability checks for application UI use.
-- The DB-level EXCLUDE constraints are the authoritative conflict guard;
-- these helpers enable efficient "is this slot available?" grid queries
-- without catching exceptions.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_instructor_availability(
  p_instructor_id    uuid,
  p_starts_at        timestamptz,
  p_ends_at          timestamptz,
  p_exclude_slot_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM   public.instructor_time_off t
      WHERE  t.instructor_id = p_instructor_id
        AND  t.status        = 'approved'
        AND  t.starts_at     < p_ends_at
        AND  t.ends_at       > p_starts_at
    )
    AND NOT EXISTS (
      SELECT 1
      FROM   public.lesson_slots s
      WHERE  s.instructor_id = p_instructor_id
        AND  s.status        NOT IN ('cancelled')
        AND  s.deleted_at    IS NULL
        AND  s.starts_at     < p_ends_at
        AND  s.ends_at       > p_starts_at
        AND  (p_exclude_slot_id IS NULL OR s.id != p_exclude_slot_id)
    );
$$;

COMMENT ON FUNCTION public.check_instructor_availability IS
  'Returns true when the instructor has no approved time-off and no active slots '
  'overlapping the window. Mirrors EXCLUDE constraint for pre-flight UI checks. '
  'p_exclude_slot_id: pass when updating an existing slot to avoid self-exclusion.';

CREATE OR REPLACE FUNCTION public.check_vehicle_availability(
  p_vehicle_id       uuid,
  p_starts_at        timestamptz,
  p_ends_at          timestamptz,
  p_exclude_slot_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM   public.lesson_slots s
    WHERE  s.vehicle_id  = p_vehicle_id
      AND  s.status      NOT IN ('cancelled')
      AND  s.deleted_at  IS NULL
      AND  s.starts_at   < p_ends_at
      AND  s.ends_at     > p_starts_at
      AND  (p_exclude_slot_id IS NULL OR s.id != p_exclude_slot_id)
  );
$$;

COMMENT ON FUNCTION public.check_vehicle_availability IS
  'Returns true when the vehicle has no active slots overlapping the window. '
  'Mirrors lesson_slots vehicle EXCLUDE constraint for pre-flight checks.';

CREATE OR REPLACE FUNCTION public.check_student_booking_availability(
  p_student_id         uuid,
  p_starts_at          timestamptz,
  p_ends_at            timestamptz,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM   public.lesson_bookings b
    WHERE  b.student_id  = p_student_id
      AND  b.status      NOT IN ('cancelled', 'no_show', 'rescheduled')
      AND  b.deleted_at  IS NULL
      AND  b.starts_at   < p_ends_at
      AND  b.ends_at     > p_starts_at
      AND  (p_exclude_booking_id IS NULL OR b.id != p_exclude_booking_id)
  );
$$;

COMMENT ON FUNCTION public.check_student_booking_availability IS
  'Returns true when the student has no active overlapping bookings. '
  'Mirrors lesson_bookings student EXCLUDE constraint for pre-flight checks.';

GRANT EXECUTE ON FUNCTION public.check_instructor_availability      TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_vehicle_availability         TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_student_booking_availability TO authenticated;

-- =============================================================================
-- SECTION 8: SOFT DELETE WHITELIST EXTENSION
-- Extends soft_delete() and soft_restore() from Phase 1B.2 (overwritten by
-- Phase 2A, now further extended here) to include Phase 2B scheduling tables.
--
-- Call: soft_delete('lesson_bookings', booking_id) — never raw DELETE.
-- This preserves audit trail, GDPR data history, and financial records.
--
-- NOTE: soft-deleting lesson_slots does NOT cascade to lesson_bookings.
-- Application must cancel or reschedule active bookings first.
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
    'vehicles',
    -- Phase 2B:
    'lesson_slots',
    'lesson_bookings',
    'booking_attendance',
    'booking_notes'
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
    'vehicles',
    -- Phase 2B:
    'lesson_slots',
    'lesson_bookings',
    'booking_attendance',
    'booking_notes'
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
-- SECTION 9: BOOKING LIFECYCLE STATE MACHINE
-- Defines the allowed booking_status transition matrix and provides a skeleton
-- guard function for future enforcement.
--
-- Current state: is_valid_booking_transition() is ACTIVE and can be called
-- by application logic or tested independently.
--
-- validate_booking_transition() trigger is SCAFFOLDED BUT INACTIVE (guard = false).
-- To activate: change the guard condition to TRUE and attach the trigger.
-- Do NOT activate until the application layer is ready to handle rejection errors.
-- =============================================================================

-- Allowed transition matrix for booking_status.
-- Returns false for all transitions from terminal states (completed, cancelled,
-- no_show, rescheduled) — these are permanent lifecycle endpoints.
CREATE OR REPLACE FUNCTION public.is_valid_booking_transition(
  p_old_status public.booking_status,
  p_new_status public.booking_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p_old_status
    WHEN 'draft'       THEN p_new_status IN ('reserved', 'confirmed', 'cancelled')
    WHEN 'reserved'    THEN p_new_status IN ('confirmed', 'cancelled')
    WHEN 'confirmed'   THEN p_new_status IN ('completed', 'cancelled', 'no_show', 'rescheduled')
    -- Terminal states: no further transitions permitted
    WHEN 'completed'   THEN false
    WHEN 'cancelled'   THEN false
    WHEN 'no_show'     THEN false
    WHEN 'rescheduled' THEN false
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.is_valid_booking_transition IS
  'Returns true when the booking_status transition old → new is allowed. '
  'Transition matrix: draft→reserved|confirmed|cancelled; reserved→confirmed|cancelled; '
  'confirmed→completed|cancelled|no_show|rescheduled; all terminal states→nothing. '
  'Called by validate_booking_transition() trigger (currently inactive).';

-- Skeleton guard trigger for future state-machine enforcement.
-- Currently inactive: the IF false guard prevents any rejection.
-- When activated this will block invalid status transitions at the DB level,
-- independent of application-layer validation.
CREATE OR REPLACE FUNCTION public.validate_booking_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- PHASE 2B: INACTIVE. Change false → true when ready to enforce transitions.
  -- Ensure all application code, Edge Functions, and admin tooling uses valid
  -- transitions before activating. See is_valid_booking_transition() for matrix.
  IF false AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT public.is_valid_booking_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION
        'booking_status: transition ''%'' → ''%'' is not permitted. '
        'See is_valid_booking_transition() for the allowed transition matrix.',
        OLD.status, NEW.status
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_booking_transition IS
  'State-machine guard for booking_status. Currently INACTIVE (guard = false). '
  'Activate by setting the guard to true and attaching as BEFORE UPDATE trigger. '
  'Blocks invalid transitions at DB level when active.';

-- Trigger is created but the function body is inactive. Attach it now so the
-- trigger exists and can be enabled without a schema change later.
CREATE TRIGGER lesson_bookings_validate_transition
  BEFORE UPDATE OF status ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_transition();

-- =============================================================================
-- SECTION 10: CONCURRENCY PREPARATION HOOKS
-- Architecture scaffolding for future capacity-safe transactional booking.
-- Phase 2B: skeleton only — not yet implemented.
-- =============================================================================

-- The EXCLUDE constraint on lesson_bookings is always the last authoritative
-- guard against double-booking, regardless of application-layer locking.
--
-- For high-concurrency environments a transactional booking procedure is needed:
--
--   Pattern A — SELECT FOR UPDATE (row-level serialisation):
--     BEGIN;
--       SELECT id, current_bookings, max_bookings, status
--       FROM public.lesson_slots WHERE id = p_slot_id FOR UPDATE;
--       -- Re-check capacity and student availability within the transaction
--       -- Insert booking (EXCLUDE fires as final guard)
--     COMMIT;
--
--   Pattern B — Advisory lock (app-level serialisation):
--     SELECT pg_advisory_xact_lock(hashtext('booking:' || p_slot_id::text));
--     -- Same checks + insert within the same transaction
--
-- Phase 3: implement as a stored procedure (LANGUAGE plpgsql) or Edge Function
-- transaction. The direct INSERT path (current Phase 2B default) is correct for
-- low-concurrency usage; the EXCLUDE constraint prevents actual double-booking
-- under any concurrency level — it just uses exceptions rather than pre-flight
-- serialisation.

-- Skeleton procedure — raises exception until implemented in Phase 3.
-- Purpose: reserve the function signature and document the intended API.
CREATE OR REPLACE FUNCTION public.allocate_booking_atomic(
  p_slot_id         uuid,
  p_student_id      uuid,
  p_organization_id uuid,
  p_booked_by       uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  -- Phase 3: implement SELECT FOR UPDATE + INSERT + EXCLUDE catch here.
  RAISE EXCEPTION
    'allocate_booking_atomic: not yet implemented (Phase 3). '
    'Use direct INSERT into lesson_bookings; EXCLUDE constraint is the active guard.'
    USING ERRCODE = 'XX000';
  RETURN v_booking_id;
END;
$$;

COMMENT ON FUNCTION public.allocate_booking_atomic IS
  'Phase 3 architecture hook: capacity-safe serialised booking allocation. '
  'NOT IMPLEMENTED. Placeholder for SELECT FOR UPDATE + INSERT procedure. '
  'Current approach: direct INSERT; EXCLUDE constraint prevents double-booking.';

-- =============================================================================
-- SECTION 11: OPERATIONAL TRIGGERS
-- A) lesson_booking_set_slot_fields — BEFORE INSERT on lesson_bookings
--    Copies starts_at/ends_at and resource IDs from the slot so callers
--    only need to supply slot_id + student_id + organization_id.
--    Runs before constraint evaluation, so the EXCLUDE sees correct times.
--
-- B) update_slot_booking_count — AFTER INSERT/UPDATE(status,deleted_at)/DELETE
--    Recomputes current_bookings via COUNT (not ±1 delta) to avoid race
--    conditions under concurrent writes. Also fires on deleted_at changes so
--    soft-deleted bookings correctly release slot capacity.
--    Auto-transitions slot status open ↔ full at capacity boundary.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.lesson_booking_set_slot_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot RECORD;
BEGIN
  SELECT starts_at, ends_at, instructor_id, vehicle_id,
         lesson_type_id, location_id, organization_id
  INTO   v_slot
  FROM   public.lesson_slots
  WHERE  id = NEW.slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson_bookings: slot_id % does not exist', NEW.slot_id;
  END IF;

  IF NEW.organization_id != v_slot.organization_id THEN
    RAISE EXCEPTION
      'lesson_bookings: organization_id % does not match slot organization_id %',
      NEW.organization_id, v_slot.organization_id;
  END IF;

  NEW.starts_at      := v_slot.starts_at;
  NEW.ends_at        := v_slot.ends_at;
  NEW.instructor_id  := v_slot.instructor_id;
  NEW.vehicle_id     := v_slot.vehicle_id;
  NEW.lesson_type_id := v_slot.lesson_type_id;
  NEW.location_id    := v_slot.location_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.lesson_booking_set_slot_fields IS
  'BEFORE INSERT: copies starts_at/ends_at and resource IDs from the slot. '
  'Application only needs slot_id + student_id + organization_id. '
  'Runs before EXCLUDE constraint evaluation to ensure correct time ranges.';

CREATE TRIGGER lesson_bookings_set_slot_fields
  BEFORE INSERT ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.lesson_booking_set_slot_fields();

-- Recompute slot booking count and auto-transition open ↔ full.
-- "Active" = status NOT IN terminal statuses AND not soft-deleted.
-- Uses COUNT (not ±1 delta) for idempotency under concurrent writes.
-- Also fires on UPDATE OF deleted_at so soft-delete releases slot capacity.
CREATE OR REPLACE FUNCTION public.update_slot_booking_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot_id uuid;
  v_count   integer;
BEGIN
  v_slot_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.slot_id ELSE NEW.slot_id END;

  SELECT COUNT(*)
  INTO   v_count
  FROM   public.lesson_bookings
  WHERE  slot_id    = v_slot_id
    AND  status     NOT IN ('cancelled', 'no_show', 'rescheduled')
    AND  deleted_at IS NULL;

  UPDATE public.lesson_slots
  SET
    current_bookings = v_count,
    status = CASE
      WHEN v_count >= max_bookings AND status = 'open'
        THEN 'full'::public.lesson_slot_status
      WHEN v_count <  max_bookings AND status = 'full'
        THEN 'open'::public.lesson_slot_status
      ELSE status
    END
  WHERE id = v_slot_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.update_slot_booking_count IS
  'AFTER INSERT/UPDATE(status,deleted_at)/DELETE on lesson_bookings. '
  'Recomputes current_bookings via COUNT (race-condition safe). '
  'Fires on deleted_at changes so soft-delete releases slot capacity. '
  'Auto-transitions slot status open ↔ full at capacity boundary.';

CREATE TRIGGER lesson_bookings_update_slot_count
  AFTER INSERT OR UPDATE OF status, deleted_at OR DELETE ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_slot_booking_count();

-- =============================================================================
-- SECTION 12: PERMISSIONS SEED — SCHEDULING DOMAIN
-- All 11 scheduling permissions are new in Phase 2B.
--
-- Permission matrix:
--   org_owner, org_admin   → ALL scheduling permissions
--   org_manager            → all except slot:delete, booking:delete
--   instructor_senior      → slot read/create/update; booking read/update;
--                            availability read/update (own rules via RLS)
--   instructor             → same as instructor_senior
--   receptionist           → booking CRUD + export; slot read; availability read
--   student                → no permissions; access via RLS self-access only
-- =============================================================================

INSERT INTO public.permissions (id, code, domain, resource, action, description) VALUES
  (gen_random_uuid(), 'scheduling:slot:create',         'scheduling', 'slot',         'create', 'Create lesson slots'),
  (gen_random_uuid(), 'scheduling:slot:read',           'scheduling', 'slot',         'read',   'View lesson slots and availability'),
  (gen_random_uuid(), 'scheduling:slot:update',         'scheduling', 'slot',         'update', 'Update slot details and status'),
  (gen_random_uuid(), 'scheduling:slot:delete',         'scheduling', 'slot',         'delete', 'Cancel or delete lesson slots'),
  (gen_random_uuid(), 'scheduling:booking:create',      'scheduling', 'booking',      'create', 'Create lesson bookings'),
  (gen_random_uuid(), 'scheduling:booking:read',        'scheduling', 'booking',      'read',   'View lesson bookings'),
  (gen_random_uuid(), 'scheduling:booking:update',      'scheduling', 'booking',      'update', 'Update booking status and attendance'),
  (gen_random_uuid(), 'scheduling:booking:delete',      'scheduling', 'booking',      'delete', 'Cancel or delete lesson bookings'),
  (gen_random_uuid(), 'scheduling:booking:export',      'scheduling', 'booking',      'export', 'Export booking data'),
  (gen_random_uuid(), 'scheduling:availability:read',   'scheduling', 'availability', 'read',   'View instructor availability and time-off'),
  (gen_random_uuid(), 'scheduling:availability:update', 'scheduling', 'availability', 'update', 'Manage instructor availability and time-off');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin') AND r.is_system_role = true
  AND  p.domain = 'scheduling';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS JOIN public.permissions p
WHERE  r.name = 'org_manager' AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'scheduling:slot:create', 'scheduling:slot:read', 'scheduling:slot:update',
    'scheduling:booking:create', 'scheduling:booking:read',
    'scheduling:booking:update', 'scheduling:booking:export',
    'scheduling:availability:read', 'scheduling:availability:update'
  ]);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS JOIN public.permissions p
WHERE  r.name IN ('instructor', 'instructor_senior') AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'scheduling:slot:create', 'scheduling:slot:read', 'scheduling:slot:update',
    'scheduling:booking:read', 'scheduling:booking:update',
    'scheduling:availability:read', 'scheduling:availability:update'
  ]);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS JOIN public.permissions p
WHERE  r.name = 'receptionist' AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'scheduling:slot:read',
    'scheduling:booking:create', 'scheduling:booking:read',
    'scheduling:booking:update', 'scheduling:booking:export',
    'scheduling:availability:read'
  ]);
