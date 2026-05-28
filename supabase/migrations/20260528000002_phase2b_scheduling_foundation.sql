-- =============================================================================
-- MIGRATION: 20260528000002_phase2b_scheduling_foundation.sql
-- Platform:  Trafikskolan SaaS — Swedish Driving School ERP
-- Phase:     2B — Scheduling + Calendar Engine Foundation
-- Description:
--   Operational scheduling engine: lesson types, instructor availability rules,
--   instructor time-off, recurring schedule exceptions, lesson slots, lesson
--   bookings, booking attendance, and booking notes.
--   Includes DB-level conflict prevention (btree_gist EXCLUDE constraints),
--   timezone-correct slot modelling, event outbox emission, booking counter
--   triggers, full RLS, performance indexes, and permissions seed.
--
-- Dependencies:
--   20260527000001_enterprise_foundation.sql  — organizations, org_locations,
--     RBAC, audit_logs, set_updated_at(), audit_trigger_fn(), permissions seed
--   20260527000002_phase1b2_hardening.sql — event_outbox, insert_outbox_event(),
--     soft_delete(), platform_admins
--   20260528000001_phase2a_domain_foundation.sql — students, instructors,
--     vehicles, organization_locations
-- =============================================================================

-- =============================================================================
-- SECTION 1: EXTENSIONS
-- btree_gist enables EXCLUDE constraints that combine equality checks on
-- scalar types (uuid =) with range overlap checks (tstzrange &&).
-- Required for all three conflict-prevention EXCLUDE constraints in this
-- migration (instructor slots, vehicle slots, student bookings).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =============================================================================
-- SECTION 2: DOMAIN ENUMS
-- =============================================================================

-- Educational purpose of a lesson slot. Drives instructor certification
-- requirements, vehicle requirements, and per-type capacity defaults.
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

-- Lifecycle of a concrete bookable lesson window.
-- open → full (counter trigger) → in_progress → completed
-- open|full|in_progress → cancelled (admin action)
-- open → blocked (ad-hoc override without formal time-off request)
CREATE TYPE public.lesson_slot_status AS ENUM (
  'open',        -- Slots available for booking (current_bookings < max_bookings)
  'full',        -- All capacity consumed; no new bookings accepted
  'in_progress', -- Lesson currently ongoing
  'completed',   -- Lesson finished; attendance may be recorded
  'cancelled',   -- Slot removed from schedule; active bookings must be rescheduled
  'blocked'      -- Manually locked (e.g. unexpected absence, equipment fault)
);

-- Lifecycle of a student booking. Drives notifications and finance integration.
-- draft → reserved → confirmed → completed
--      → cancelled (any stage before completed)
--      → no_show   (after lesson time, student absent)
--      → rescheduled (replaced by a new booking; rescheduled_from_id set on new)
CREATE TYPE public.booking_status AS ENUM (
  'draft',       -- Booking in progress; not yet visible to student
  'reserved',    -- Slot held; pending student or payment confirmation
  'confirmed',   -- Confirmed by both school and student
  'completed',   -- Lesson took place; attendance record created
  'cancelled',   -- Cancelled before the lesson
  'no_show',     -- Student did not attend without prior cancellation
  'rescheduled'  -- Superseded by a new booking (rescheduled_from_id on the replacement)
);

-- Reason category for an instructor absence.
CREATE TYPE public.time_off_type AS ENUM (
  'vacation',       -- Semester / annual leave (semester)
  'sickness',       -- Sjukdom (sick leave)
  'training',       -- Internal training, conference, or certification renewal
  'public_holiday', -- Swedish röd dag (national public holiday)
  'emergency',      -- Unplanned emergency absence
  'other'
);

-- Approval workflow for instructor time-off requests.
CREATE TYPE public.time_off_status AS ENUM (
  'pending',   -- Submitted; awaiting manager approval
  'approved',  -- Approved; blocks all scheduling in the covered window
  'rejected',  -- Rejected by manager; instructor remains schedulable
  'cancelled'  -- Withdrawn by the instructor before approval
);

-- Provenance of a lesson slot — manual vs. auto-generated vs. calendar import.
CREATE TYPE public.slot_generation_source AS ENUM (
  'manual',    -- Created directly by a staff member
  'recurring', -- Auto-generated from an instructor_availability_rule
  'imported'   -- Imported from an external calendar (future Google / Outlook sync)
);

-- =============================================================================
-- SECTION 3: LESSON TYPES
-- Configurable per-organisation lesson type catalog.
-- lesson_types drives:
--   • Vehicle requirements (requires_vehicle)
--   • Instructor certification requirements (required_certifications)
--   • Slot duration defaults for the slot generator
--   • Max students per slot (1 = individual; > 1 = group / theory class)
--   • UI colour coding and ordering for the calendar view
--   • Phase 3: pricing_sek is the catalogue price hook (locked into bookings
--     at booking creation time to survive later price changes)
-- =============================================================================

CREATE TABLE public.lesson_types (
  id                        uuid                   NOT NULL DEFAULT gen_random_uuid(),
  organization_id           uuid                   NOT NULL,

  name                      text                   NOT NULL,
  -- Machine-readable identifier, unique per org.
  -- Never change a code in production; create a new type instead.
  code                      text                   NOT NULL,
  category                  public.lesson_category NOT NULL,

  -- Duration constraints (slot generator uses these)
  default_duration_minutes  integer                NOT NULL DEFAULT 60,
  min_duration_minutes      integer                NOT NULL DEFAULT 30,
  max_duration_minutes      integer                NOT NULL DEFAULT 120,

  -- Resource requirements
  requires_vehicle          boolean                NOT NULL DEFAULT true,
  requires_instructor       boolean                NOT NULL DEFAULT true,
  -- Instructor must hold at least one active cert whose certification_type
  -- matches any element of this array. Empty array = no cert required.
  required_certifications   text[]                 NOT NULL DEFAULT '{}',

  -- Capacity: 1 = individual lesson; > 1 = group / theory class
  max_students_per_slot     integer                NOT NULL DEFAULT 1,

  -- Calendar UI
  color_hex                 text                   NOT NULL DEFAULT '#3B82F6',
  display_order             integer                NOT NULL DEFAULT 0,
  is_active                 boolean                NOT NULL DEFAULT true,

  -- Phase 3 finance hook: catalogue price at time of booking
  pricing_sek               numeric(10,2),

  -- Audit
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
  -- Code is the stable machine identifier; must be unique within an org
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
COMMENT ON COLUMN public.lesson_types.required_certifications IS
  'Instructor must hold at least one active certification whose certification_type '
  'matches any element. Empty array = no certification requirement.';
COMMENT ON COLUMN public.lesson_types.pricing_sek IS
  'Catalogue price in SEK. Copied to lesson_bookings.price_sek at booking time '
  'to preserve the agreed price independently of future catalogue changes.';

CREATE TRIGGER lesson_types_set_updated_at
  BEFORE UPDATE ON public.lesson_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER lesson_types_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.lesson_types
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =============================================================================
-- SECTION 4: INSTRUCTOR AVAILABILITY
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 INSTRUCTOR AVAILABILITY RULES
-- Defines a recurring weekly teaching window for an instructor.
-- AVAILABILITY ≠ BOOKING. These rules describe POSSIBLE teaching time, not
-- committed or booked time. A background slot-generator process reads these
-- rules to materialise concrete lesson_slots for future dates.
--
-- DST / timezone handling:
--   start_time and end_time are stored as wall-clock TIME (not timestamptz).
--   timezone is an IANA string (e.g. 'Europe/Stockholm').
--   The slot generator converts each occurrence to UTC using:
--     starts_at := (date::text || ' ' || start_time::text)::timestamp
--                  AT TIME ZONE timezone
--   This correctly handles DST transitions:
--     09:00 local = 07:00 UTC in summer (CEST, UTC+2)
--     09:00 local = 08:00 UTC in winter (CET,  UTC+1)
--
-- Split shifts:
--   An instructor with a lunch break between 12:00 and 13:00 on Mondays
--   is modelled with TWO rules for Monday:
--     Rule A: start_time=09:00, end_time=12:00
--     Rule B: start_time=13:00, end_time=17:00
-- ---------------------------------------------------------------------------
CREATE TABLE public.instructor_availability_rules (
  id                     uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id        uuid         NOT NULL,
  instructor_id          uuid         NOT NULL,
  -- NULL = instructor is available at any org location for this window
  location_id            uuid,

  -- ISO day-of-week: 0 = Sunday, 1 = Monday, … 6 = Saturday
  day_of_week            smallint     NOT NULL,
  -- Local wall-clock times in the IANA timezone below
  start_time             time         NOT NULL,
  end_time               time         NOT NULL,  -- exclusive end (window ends at end_time)
  -- IANA timezone for DST-correct slot generation (default: Sweden)
  timezone               text         NOT NULL DEFAULT 'Europe/Stockholm',

  -- Date range during which this rule is active
  effective_from         date         NOT NULL DEFAULT CURRENT_DATE,
  effective_until        date,                  -- NULL = no end date (indefinite)

  -- Slot generation parameters used by the background generator
  slot_duration_minutes  integer      NOT NULL DEFAULT 60,
  slot_buffer_minutes    integer      NOT NULL DEFAULT 0,   -- gap between consecutive slots
  -- Overrides instructors.max_lessons_per_day for this specific rule window
  max_lessons_override   integer,

  is_active              boolean      NOT NULL DEFAULT true,
  notes                  text,

  -- Audit
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
  'Recurring weekly teaching windows per instructor. '
  'start_time / end_time are local wall-clock; timezone is IANA for DST-correct '
  'slot generation. Availability ≠ booking — defines possible teaching windows only. '
  'Split shifts (e.g. lunch break) require two rules for the same day.';
COMMENT ON COLUMN public.instructor_availability_rules.day_of_week IS
  'ISO day-of-week integer: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, '
  '4=Thursday, 5=Friday, 6=Saturday.';
COMMENT ON COLUMN public.instructor_availability_rules.slot_buffer_minutes IS
  'Minutes between consecutive slots for preparation or travel time. '
  '0 = back-to-back slots allowed.';
COMMENT ON COLUMN public.instructor_availability_rules.timezone IS
  'IANA timezone string (e.g. ''Europe/Stockholm''). '
  'Slot generator: starts_at = (date || '' '' || start_time)::timestamp AT TIME ZONE timezone.';

CREATE TRIGGER instructor_availability_rules_set_updated_at
  BEFORE UPDATE ON public.instructor_availability_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER instructor_availability_rules_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.instructor_availability_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 4.2 INSTRUCTOR TIME OFF
-- Absence records that block scheduling eligibility.
-- An 'approved' entry prevents the slot generator from materialising slots
-- for the covered window. For already-created slots, the application layer
-- must surface the conflict and prompt staff to cancel/reschedule.
--
-- Conflict prevention (DB level):
--   EXCLUDE constraint prevents two 'approved' time-off entries from
--   overlapping for the same instructor. Pending/rejected/cancelled entries
--   may freely overlap (only one can be approved).
-- ---------------------------------------------------------------------------
CREATE TABLE public.instructor_time_off (
  id                uuid                   NOT NULL DEFAULT gen_random_uuid(),
  organization_id   uuid                   NOT NULL,
  instructor_id     uuid                   NOT NULL,

  time_off_type     public.time_off_type   NOT NULL,
  status            public.time_off_status NOT NULL DEFAULT 'pending',

  -- All times stored as UTC timestamptz; convert for display using the
  -- instructor's availability rule timezone or org default
  starts_at         timestamptz            NOT NULL,
  ends_at           timestamptz            NOT NULL,
  -- true = UI should render this as a full calendar-day block
  is_full_day       boolean                NOT NULL DEFAULT false,

  reason            text,

  -- Approval workflow fields
  approved_by       uuid,
  approved_at       timestamptz,
  rejection_reason  text,

  -- Audit
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
  -- Approval requires both approved_by and approved_at to be set
  CONSTRAINT instructor_time_off_approval_consistency   CHECK (
    status != 'approved'
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);

COMMENT ON TABLE  public.instructor_time_off IS
  'Instructor absence entries. status = ''approved'' blocks the covered window '
  'for all scheduling. EXCLUDE constraint prevents overlapping approved entries '
  'for the same instructor.';
COMMENT ON COLUMN public.instructor_time_off.is_full_day IS
  'Display hint for calendar UI: render as full-day block regardless of '
  'starts_at / ends_at hours.';

-- Prevent two 'approved' time-off periods from overlapping for the same instructor.
-- Pending/rejected/cancelled entries may overlap (manager decides which to approve).
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

-- ---------------------------------------------------------------------------
-- 4.3 RECURRING SCHEDULE EXCEPTIONS
-- Overrides specific date-occurrences of a recurring availability rule.
-- The slot generator reads these BEFORE materialising slots for a given date:
--   exception_type = 'cancelled' → skip this date entirely.
--   exception_type = 'modified'  → use new_start_time / new_end_time instead.
--
-- Design contract:
--   • Use instructor_time_off for full-day or multi-day absences.
--   • Use this table for partial-day or rule-specific one-off overrides
--     (e.g. "next Monday the instructor starts at 10:00 instead of 09:00").
--   • UNIQUE on (availability_rule_id, exception_date): only one exception
--     per rule occurrence.
-- ---------------------------------------------------------------------------
CREATE TABLE public.recurring_schedule_exceptions (
  id                    uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id       uuid         NOT NULL,
  availability_rule_id  uuid         NOT NULL,
  instructor_id         uuid         NOT NULL,

  exception_date        date         NOT NULL,   -- The specific date being overridden
  exception_type        text         NOT NULL,   -- 'cancelled' | 'modified'

  -- Only populated for exception_type = 'modified'
  new_start_time        time,
  new_end_time          time,
  new_location_id       uuid,

  reason                text,

  -- Audit
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
  -- One exception per (rule, date): a single occurrence can only be overridden once
  CONSTRAINT recurring_schedule_exceptions_rule_date_uniq UNIQUE (availability_rule_id, exception_date),
  CONSTRAINT recurring_schedule_exceptions_type_check     CHECK (
    exception_type IN ('cancelled', 'modified')
  ),
  -- Modified exceptions must fully specify the new time window
  CONSTRAINT recurring_schedule_exceptions_modified_times CHECK (
    exception_type != 'modified'
    OR (
      new_start_time IS NOT NULL
      AND new_end_time IS NOT NULL
      AND new_start_time < new_end_time
    )
  )
);

COMMENT ON TABLE  public.recurring_schedule_exceptions IS
  'Date-level overrides for recurring availability rules. '
  'The slot generator checks this table before materialising each occurrence. '
  'Use instructor_time_off for full-day / multi-day absences.';

CREATE TRIGGER recurring_schedule_exceptions_set_updated_at
  BEFORE UPDATE ON public.recurring_schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER recurring_schedule_exceptions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.recurring_schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =============================================================================
-- SECTION 5: LESSON SLOTS
-- A lesson_slot is a concrete bookable time window. It is the primary unit
-- the scheduling engine exposes to students and staff.
--
-- PROVENANCE:
--   generation_source = 'manual'    → created directly by a staff member
--   generation_source = 'recurring' → materialised from availability_rule_id
--   generation_source = 'imported'  → future Google / Outlook calendar sync
--
-- CAPACITY:
--   current_bookings is maintained atomically by the counter trigger in
--   Section 11. When current_bookings reaches max_bookings the status
--   automatically transitions open → full (and back when a booking is
--   cancelled). The CHECK constraint prevents current_bookings > max_bookings.
--
-- DST / TIMEZONE:
--   starts_at / ends_at are always stored as UTC timestamptz.
--   timezone (IANA string) is preserved as a display hint for calendar UIs
--   that need to render the local time (e.g. '09:00 CET').
--
-- CONFLICT PREVENTION (DB level):
--   EXCLUDE instructor_id + tstzrange: an instructor cannot have two
--   non-cancelled slots that overlap in time. btree_gist enables combining
--   uuid equality with range overlap in a single EXCLUDE constraint.
--   EXCLUDE vehicle_id + tstzrange: a vehicle cannot be in two slots at once.
--   Both constraints fire on INSERT and UPDATE, making double-booking
--   impossible regardless of concurrent application requests.
-- =============================================================================

CREATE TABLE public.lesson_slots (
  id                     uuid                          NOT NULL DEFAULT gen_random_uuid(),
  organization_id        uuid                          NOT NULL,

  -- Resource assignment
  instructor_id          uuid                          NOT NULL,
  vehicle_id             uuid,                                   -- NULL = no vehicle (theory, simulator)
  location_id            uuid,
  lesson_type_id         uuid                          NOT NULL,

  -- Temporal window — always UTC timestamptz
  starts_at              timestamptz                   NOT NULL,
  ends_at                timestamptz                   NOT NULL,
  -- IANA timezone preserved for calendar display (not for computation)
  timezone               text                          NOT NULL DEFAULT 'Europe/Stockholm',

  -- Status lifecycle
  status                 public.lesson_slot_status     NOT NULL DEFAULT 'open',
  status_changed_at      timestamptz,

  -- Capacity
  max_bookings           integer                       NOT NULL DEFAULT 1,
  -- Maintained by update_slot_booking_count() trigger (Section 11)
  current_bookings       integer                       NOT NULL DEFAULT 0,

  -- Provenance
  generation_source      public.slot_generation_source NOT NULL DEFAULT 'manual',
  availability_rule_id   uuid,             -- source rule for 'recurring' slots
  exception_id           uuid,             -- recurring_schedule_exception that shaped this slot

  notes                  text,

  -- Audit
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
  'Concrete bookable time windows. Instructor double-booking prevented by '
  'EXCLUDE constraint (btree_gist). Vehicle double-booking similarly prevented. '
  'current_bookings maintained by counter trigger. status auto-transitions '
  'open ↔ full when counter reaches max_bookings.';
COMMENT ON COLUMN public.lesson_slots.timezone IS
  'IANA timezone for calendar display only (e.g. ''Europe/Stockholm''). '
  'starts_at / ends_at are always UTC — never use timezone for time arithmetic.';
COMMENT ON COLUMN public.lesson_slots.current_bookings IS
  'Maintained by the update_slot_booking_count() AFTER trigger on lesson_bookings. '
  'Do not update directly; it will be overwritten on the next booking operation.';

-- EXCLUDE: one instructor cannot have two non-cancelled slots overlapping in time.
-- btree_gist makes uuid equality work inside a GiST index alongside range overlap.
ALTER TABLE public.lesson_slots
  ADD CONSTRAINT lesson_slots_instructor_no_overlap
  EXCLUDE USING gist (
    instructor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status NOT IN ('cancelled'));

-- EXCLUDE: one vehicle cannot appear in two non-cancelled slots at the same time.
-- Scoped to vehicle_id IS NOT NULL — theory slots without a vehicle don't conflict.
ALTER TABLE public.lesson_slots
  ADD CONSTRAINT lesson_slots_vehicle_no_overlap
  EXCLUDE USING gist (
    vehicle_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (vehicle_id IS NOT NULL AND status NOT IN ('cancelled'));

CREATE TRIGGER lesson_slots_set_updated_at
  BEFORE UPDATE ON public.lesson_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER lesson_slots_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.lesson_slots
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =============================================================================
-- SECTION 6: LESSON BOOKINGS + ATTENDANCE + NOTES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 6.1 LESSON BOOKINGS
-- A lesson_booking represents a student's confirmed allocation to a lesson slot.
-- For single-capacity slots (max_bookings = 1) one booking per slot is normal.
-- For group/theory slots (max_bookings > 1) multiple students book the same slot.
--
-- DENORMALISED FIELDS:
--   instructor_id, vehicle_id, lesson_type_id, location_id, starts_at, ends_at
--   are copied from the referenced slot by the BEFORE INSERT trigger
--   lesson_booking_set_slot_fields() (Section 11). This:
--     a) Enables the student overlap EXCLUDE constraint (needs starts_at/ends_at
--        at row creation time before the constraint fires).
--     b) Preserves a point-in-time snapshot of the slot at booking time.
--     c) Avoids a JOIN for every calendar query.
--   Application code only needs to supply: slot_id, student_id,
--   organization_id, and optional fields (status, booked_by, price_sek, …).
--
-- RESCHEDULING LINEAGE:
--   To reschedule: create a new booking with rescheduled_from_id = old_id,
--   then set old_booking.status = 'rescheduled'.
--   To find the replacement of booking X:
--     SELECT * FROM lesson_bookings WHERE rescheduled_from_id = X.id
--
-- CONFLICT PREVENTION (DB level):
--   EXCLUDE student_id + tstzrange: a student cannot have two active bookings
--   that overlap in time. Cancelled / no_show / rescheduled bookings are
--   excluded from the constraint (their time is freed for rebooking).
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
  starts_at             timestamptz           NOT NULL,  -- for EXCLUDE + calendar queries
  ends_at               timestamptz           NOT NULL,  -- for EXCLUDE + calendar queries

  -- Status lifecycle
  status                public.booking_status NOT NULL DEFAULT 'draft',
  status_changed_at     timestamptz,

  -- Cancellation tracking
  cancelled_at          timestamptz,
  cancelled_by          uuid,
  cancellation_reason   text,
  -- Structured category for reporting analytics
  -- Values: 'student_request' | 'school_cancelled' | 'weather' |
  --         'vehicle_fault' | 'instructor_sick' | 'other'
  cancellation_category text,

  -- Rescheduling lineage: set on the NEW booking when rescheduling an old one.
  -- Find replacement: SELECT * FROM lesson_bookings WHERE rescheduled_from_id = this.id
  rescheduled_from_id   uuid,

  -- No-show tracking
  no_show_marked_at     timestamptz,
  no_show_marked_by     uuid,

  -- Phase 3 finance hooks (populated now; consumed by invoice engine later)
  package_item_id       uuid,            -- future: lesson_package_items FK
  payment_status        text             NOT NULL DEFAULT 'unpaid',
  -- Price locked at booking time from lesson_types.pricing_sek
  price_sek             numeric(10,2),

  -- Who initiated the booking (may differ from the student for staff bookings)
  booked_by             uuid,

  -- Audit
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
  CONSTRAINT lesson_bookings_creator_fkey           FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lesson_bookings_updater_fkey           FOREIGN KEY (updated_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  -- A student can only book the same slot once
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
  'Student allocations to lesson slots. starts_at / ends_at are denormalised from '
  'the slot at INSERT time by lesson_booking_set_slot_fields() trigger. '
  'Student overlap prevented by EXCLUDE constraint (btree_gist). '
  'Slot capacity managed by update_slot_booking_count() counter trigger.';
COMMENT ON COLUMN public.lesson_bookings.rescheduled_from_id IS
  'Set on the NEW booking when a previous booking is rescheduled. '
  'The old booking''s status is then set to ''rescheduled''. '
  'To find what replaced booking X: SELECT * FROM lesson_bookings WHERE rescheduled_from_id = X.id';
COMMENT ON COLUMN public.lesson_bookings.price_sek IS
  'Price locked at booking time from lesson_types.pricing_sek. '
  'Preserved independently of catalogue changes. Phase 3 invoice engine reads this.';
COMMENT ON COLUMN public.lesson_bookings.cancellation_category IS
  'Structured cancellation reason for analytics: student_request, school_cancelled, '
  'weather, vehicle_fault, instructor_sick, other.';

-- EXCLUDE: a student cannot have two active bookings overlapping in time.
-- Cancelled / no_show / rescheduled bookings are excluded (freeing the time slot).
ALTER TABLE public.lesson_bookings
  ADD CONSTRAINT lesson_bookings_student_no_overlap
  EXCLUDE USING gist (
    student_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show', 'rescheduled'));

CREATE TRIGGER lesson_bookings_set_updated_at
  BEFORE UPDATE ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER lesson_bookings_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 6.2 BOOKING ATTENDANCE
-- Post-lesson attendance record. One row per booking (enforced by UNIQUE).
-- Created (or updated) by the instructor after the lesson ends.
-- The booking status must be 'completed' or 'no_show' before attendance
-- is meaningful; enforcement is at the application layer.
-- performance_rating feeds the AI analytics pipeline (future Phase).
-- ---------------------------------------------------------------------------
CREATE TABLE public.booking_attendance (
  id                  uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid         NOT NULL,
  booking_id          uuid         NOT NULL,
  student_id          uuid         NOT NULL,

  attended            boolean      NOT NULL,
  late_minutes        integer,               -- minutes after starts_at if attended

  instructor_notes    text,
  -- 1 (needs significant work) to 5 (excellent progress)
  performance_rating  smallint,

  recorded_by         uuid,
  recorded_at         timestamptz  NOT NULL DEFAULT now(),
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT booking_attendance_pkey          PRIMARY KEY (id),
  CONSTRAINT booking_attendance_booking_uniq  UNIQUE (booking_id),
  CONSTRAINT booking_attendance_org_fkey      FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT booking_attendance_booking_fkey  FOREIGN KEY (booking_id)
    REFERENCES public.lesson_bookings(id) ON DELETE CASCADE,
  CONSTRAINT booking_attendance_student_fkey  FOREIGN KEY (student_id)
    REFERENCES public.students(id) ON DELETE RESTRICT,
  CONSTRAINT booking_attendance_recorder_fkey FOREIGN KEY (recorded_by)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_attendance_late_nn       CHECK (late_minutes IS NULL OR late_minutes >= 0),
  CONSTRAINT booking_attendance_rating_range  CHECK (
    performance_rating IS NULL OR performance_rating BETWEEN 1 AND 5
  )
);

COMMENT ON TABLE  public.booking_attendance IS
  'Post-lesson attendance records. UNIQUE on booking_id: one record per lesson. '
  'performance_rating (1–5) feeds future AI student-progression analytics.';
COMMENT ON COLUMN public.booking_attendance.performance_rating IS
  'Instructor-assessed lesson performance: 1 = needs significant work, '
  '5 = excellent progress. Aggregated by AI analytics pipeline.';

CREATE TRIGGER booking_attendance_set_updated_at
  BEFORE UPDATE ON public.booking_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER booking_attendance_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.booking_attendance
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ---------------------------------------------------------------------------
-- 6.3 BOOKING NOTES
-- Operational notes attached to a booking. Mirrors the student_notes pattern
-- from Phase 2A.
-- is_internal = true  → staff-only; never visible in the student portal.
-- is_internal = false → shared; visible to the student in their portal.
-- ---------------------------------------------------------------------------
CREATE TABLE public.booking_notes (
  id               uuid         NOT NULL DEFAULT gen_random_uuid(),
  organization_id  uuid         NOT NULL,
  booking_id       uuid         NOT NULL,
  author_id        uuid,

  content          text         NOT NULL,
  is_internal      boolean      NOT NULL DEFAULT true,

  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT booking_notes_pkey         PRIMARY KEY (id),
  CONSTRAINT booking_notes_org_fkey     FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT booking_notes_booking_fkey FOREIGN KEY (booking_id)
    REFERENCES public.lesson_bookings(id) ON DELETE CASCADE,
  CONSTRAINT booking_notes_author_fkey  FOREIGN KEY (author_id)
    REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.booking_notes IS
  'Operational notes on a booking. is_internal = true hides from student portal. '
  'Mirrors student_notes pattern from Phase 2A.';

CREATE TRIGGER booking_notes_set_updated_at
  BEFORE UPDATE ON public.booking_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER booking_notes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.booking_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- =============================================================================
-- SECTION 7: CONFLICT DETECTION HELPER FUNCTIONS
-- Pre-flight availability checks for application-layer use.
-- The DB-level EXCLUDE constraints are the authoritative conflict guard;
-- these helpers enable "is this time available?" queries without catching
-- exceptions, making booking-UI availability grids efficient to render.
-- =============================================================================

-- Returns true if the instructor is free in the given window:
--   • No approved time-off overlaps the window.
--   • No non-cancelled slot overlaps the window.
-- p_exclude_slot_id: pass when updating an existing slot so it is not
--   self-excluded from the check.
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
        AND  s.starts_at     < p_ends_at
        AND  s.ends_at       > p_starts_at
        AND  (p_exclude_slot_id IS NULL OR s.id != p_exclude_slot_id)
    );
$$;

COMMENT ON FUNCTION public.check_instructor_availability IS
  'Returns true when the instructor has no approved time-off and no non-cancelled '
  'slots overlapping the given window. Mirrors the DB EXCLUDE constraint logic '
  'for pre-flight UI checks. p_exclude_slot_id: exclude an existing slot from the check.';

-- Returns true if the vehicle has no non-cancelled slots in the window.
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
    WHERE  s.vehicle_id = p_vehicle_id
      AND  s.status     NOT IN ('cancelled')
      AND  s.starts_at  < p_ends_at
      AND  s.ends_at    > p_starts_at
      AND  (p_exclude_slot_id IS NULL OR s.id != p_exclude_slot_id)
  );
$$;

COMMENT ON FUNCTION public.check_vehicle_availability IS
  'Returns true when the vehicle has no non-cancelled slots overlapping the given '
  'window. Mirrors the lesson_slots vehicle EXCLUDE constraint for pre-flight checks.';

-- Returns true if the student has no active overlapping bookings.
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
    WHERE  b.student_id = p_student_id
      AND  b.status     NOT IN ('cancelled', 'no_show', 'rescheduled')
      AND  b.starts_at  < p_ends_at
      AND  b.ends_at    > p_starts_at
      AND  (p_exclude_booking_id IS NULL OR b.id != p_exclude_booking_id)
  );
$$;

COMMENT ON FUNCTION public.check_student_booking_availability IS
  'Returns true when the student has no active overlapping bookings. '
  'Mirrors the lesson_bookings student EXCLUDE constraint for pre-flight checks.';

GRANT EXECUTE ON FUNCTION public.check_instructor_availability      TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_vehicle_availability         TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_student_booking_availability TO authenticated;

-- =============================================================================
-- SECTION 8: ROW LEVEL SECURITY
-- All 8 tables follow the established three-tier SELECT pattern from Phase 2A:
--   Tier 1 — Staff with org membership + permission check
--   Tier 2 — Self-access (student portal / instructor portal)
--   Tier 3 — Platform admin bypass
-- Write policies (INSERT / UPDATE / DELETE) require org + permission.
-- =============================================================================

ALTER TABLE public.lesson_types                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_time_off           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_slots                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_bookings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_attendance            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_notes                 ENABLE ROW LEVEL SECURITY;

-- ── Lesson Types ─────────────────────────────────────────────────────────────

CREATE POLICY "lesson_types_select"
  ON public.lesson_types FOR SELECT
  USING (
    -- Staff see all (active and inactive)
    (organization_id = public.auth_organization_id()
     AND public.has_permission('scheduling:slot:read'))
    -- Students / instructors in portal see active types only (booking UI)
    OR (organization_id = public.auth_organization_id() AND is_active = true)
    OR public.is_platform_admin()
  );

CREATE POLICY "lesson_types_insert"
  ON public.lesson_types FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:create')
  );

CREATE POLICY "lesson_types_update"
  ON public.lesson_types FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:update')
  );

CREATE POLICY "lesson_types_delete"
  ON public.lesson_types FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:delete')
  );

-- ── Instructor Availability Rules ─────────────────────────────────────────────

CREATE POLICY "instructor_availability_rules_select_staff"
  ON public.instructor_availability_rules FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:read')
  );

CREATE POLICY "instructor_availability_rules_select_self"
  ON public.instructor_availability_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructors i
      WHERE i.id = instructor_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "instructor_availability_rules_select_platform"
  ON public.instructor_availability_rules FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "instructor_availability_rules_insert"
  ON public.instructor_availability_rules FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

CREATE POLICY "instructor_availability_rules_update"
  ON public.instructor_availability_rules FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

CREATE POLICY "instructor_availability_rules_delete"
  ON public.instructor_availability_rules FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

-- ── Instructor Time Off ───────────────────────────────────────────────────────

CREATE POLICY "instructor_time_off_select_staff"
  ON public.instructor_time_off FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:read')
  );

CREATE POLICY "instructor_time_off_select_self"
  ON public.instructor_time_off FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructors i
      WHERE i.id = instructor_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "instructor_time_off_select_platform"
  ON public.instructor_time_off FOR SELECT
  USING (public.is_platform_admin());

-- Staff or the instructor themselves can submit a time-off request
CREATE POLICY "instructor_time_off_insert"
  ON public.instructor_time_off FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('scheduling:availability:update')
      OR EXISTS (
        SELECT 1 FROM public.instructors i
        WHERE i.id = instructor_id AND i.user_id = auth.uid()
      )
    )
  );

-- Staff can approve/reject; instructors can cancel their own pending requests
CREATE POLICY "instructor_time_off_update"
  ON public.instructor_time_off FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('scheduling:availability:update')
      OR EXISTS (
        SELECT 1 FROM public.instructors i
        WHERE i.id = instructor_id AND i.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('scheduling:availability:update')
      OR EXISTS (
        SELECT 1 FROM public.instructors i
        WHERE i.id = instructor_id AND i.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "instructor_time_off_delete"
  ON public.instructor_time_off FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

-- ── Recurring Schedule Exceptions ────────────────────────────────────────────

CREATE POLICY "recurring_schedule_exceptions_select_staff"
  ON public.recurring_schedule_exceptions FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:read')
  );

CREATE POLICY "recurring_schedule_exceptions_select_self"
  ON public.recurring_schedule_exceptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructors i
      WHERE i.id = instructor_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "recurring_schedule_exceptions_select_platform"
  ON public.recurring_schedule_exceptions FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "recurring_schedule_exceptions_insert"
  ON public.recurring_schedule_exceptions FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

CREATE POLICY "recurring_schedule_exceptions_update"
  ON public.recurring_schedule_exceptions FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

CREATE POLICY "recurring_schedule_exceptions_delete"
  ON public.recurring_schedule_exceptions FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:availability:update')
  );

-- ── Lesson Slots ─────────────────────────────────────────────────────────────

CREATE POLICY "lesson_slots_select_staff"
  ON public.lesson_slots FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:read')
  );

-- Students in the org can see non-cancelled slots (to browse availability)
CREATE POLICY "lesson_slots_select_student"
  ON public.lesson_slots FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND status IN ('open', 'full', 'in_progress', 'completed')
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.organization_id = public.auth_organization_id()
        AND s.user_id = auth.uid()
    )
  );

-- Instructors can see their own slots (all statuses)
CREATE POLICY "lesson_slots_select_self"
  ON public.lesson_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructors i
      WHERE i.id = instructor_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "lesson_slots_select_platform"
  ON public.lesson_slots FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "lesson_slots_insert"
  ON public.lesson_slots FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:create')
  );

CREATE POLICY "lesson_slots_update"
  ON public.lesson_slots FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:update')
  );

CREATE POLICY "lesson_slots_delete"
  ON public.lesson_slots FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:slot:delete')
  );

-- ── Lesson Bookings ───────────────────────────────────────────────────────────

CREATE POLICY "lesson_bookings_select_staff"
  ON public.lesson_bookings FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:read')
  );

-- Students see their own bookings
CREATE POLICY "lesson_bookings_select_student"
  ON public.lesson_bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.user_id = auth.uid()
    )
  );

-- Instructors see bookings in their slots
CREATE POLICY "lesson_bookings_select_instructor"
  ON public.lesson_bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instructors i
      WHERE i.id = instructor_id AND i.user_id = auth.uid()
    )
  );

CREATE POLICY "lesson_bookings_select_platform"
  ON public.lesson_bookings FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "lesson_bookings_insert"
  ON public.lesson_bookings FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:create')
  );

CREATE POLICY "lesson_bookings_update"
  ON public.lesson_bookings FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:update')
  );

CREATE POLICY "lesson_bookings_delete"
  ON public.lesson_bookings FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:delete')
  );

-- ── Booking Attendance ────────────────────────────────────────────────────────

CREATE POLICY "booking_attendance_select_staff"
  ON public.booking_attendance FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:read')
  );

CREATE POLICY "booking_attendance_select_student"
  ON public.booking_attendance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "booking_attendance_select_instructor"
  ON public.booking_attendance FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.lesson_bookings lb
      JOIN   public.instructors i ON i.id = lb.instructor_id AND i.user_id = auth.uid()
      WHERE  lb.id = booking_id
    )
  );

CREATE POLICY "booking_attendance_select_platform"
  ON public.booking_attendance FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "booking_attendance_insert"
  ON public.booking_attendance FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:update')
  );

CREATE POLICY "booking_attendance_update"
  ON public.booking_attendance FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:update')
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:update')
  );

-- ── Booking Notes ─────────────────────────────────────────────────────────────

CREATE POLICY "booking_notes_select_staff"
  ON public.booking_notes FOR SELECT
  USING (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:read')
  );

-- Students see non-internal notes on their own bookings
CREATE POLICY "booking_notes_select_student"
  ON public.booking_notes FOR SELECT
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1
      FROM   public.lesson_bookings lb
      JOIN   public.students s ON s.id = lb.student_id AND s.user_id = auth.uid()
      WHERE  lb.id = booking_id
    )
  );

-- Instructors see all notes on their own bookings (including internal)
CREATE POLICY "booking_notes_select_instructor"
  ON public.booking_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.lesson_bookings lb
      JOIN   public.instructors i ON i.id = lb.instructor_id AND i.user_id = auth.uid()
      WHERE  lb.id = booking_id
    )
  );

CREATE POLICY "booking_notes_select_platform"
  ON public.booking_notes FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "booking_notes_insert"
  ON public.booking_notes FOR INSERT
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND public.has_permission('scheduling:booking:update')
  );

-- Staff with update permission or the note's author can edit
CREATE POLICY "booking_notes_update"
  ON public.booking_notes FOR UPDATE
  USING (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('scheduling:booking:update')
      OR author_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('scheduling:booking:update')
      OR author_id = auth.uid()
    )
  );

CREATE POLICY "booking_notes_delete"
  ON public.booking_notes FOR DELETE
  USING (
    organization_id = public.auth_organization_id()
    AND (
      public.has_permission('scheduling:booking:delete')
      OR author_id = auth.uid()
    )
  );

-- =============================================================================
-- SECTION 9: PERFORMANCE INDEXES
-- Design priorities:
--   1. Calendar views — instructor / student / vehicle / location schedule
--      queries (highest traffic; must be sub-10ms on 100k-slot datasets)
--   2. Conflict detection — overlap range scans for pre-flight checks
--   3. Booking management — status filters, upcoming lessons, no-shows
--   4. Availability engine — rule + time-off lookups for slot generation
--   5. Dashboard aggregations — daily ops, org-level summaries
--   6. Future integrations — calendar sync, payment processing, AI analytics
-- =============================================================================

-- ── Lesson Types ─────────────────────────────────────────────────────────────

-- Student booking UI: active types in category order
CREATE INDEX idx_lesson_types_org_active
  ON public.lesson_types (organization_id, category)
  WHERE is_active = true;

-- Admin UI: full list with display order
CREATE INDEX idx_lesson_types_org_order
  ON public.lesson_types (organization_id, display_order);

-- ── Instructor Availability Rules ─────────────────────────────────────────────

-- Slot generator primary lookup: active rules per instructor + day
CREATE INDEX idx_availability_rules_instructor_day
  ON public.instructor_availability_rules (instructor_id, day_of_week)
  WHERE is_active = true;

-- Effective date range filter during slot generation
CREATE INDEX idx_availability_rules_effective
  ON public.instructor_availability_rules (instructor_id, effective_from, effective_until)
  WHERE is_active = true;

-- Org-wide availability overview
CREATE INDEX idx_availability_rules_org
  ON public.instructor_availability_rules (organization_id, instructor_id)
  WHERE is_active = true;

-- ── Instructor Time Off ───────────────────────────────────────────────────────

-- Availability check hot path: approved time-off per instructor (overlap queries)
CREATE INDEX idx_time_off_instructor_approved
  ON public.instructor_time_off (instructor_id, starts_at, ends_at)
  WHERE status = 'approved';

-- Manager approval queue sorted by submission time
CREATE INDEX idx_time_off_org_pending
  ON public.instructor_time_off (organization_id, created_at DESC)
  WHERE status = 'pending';

-- Instructor portal: own time-off history
CREATE INDEX idx_time_off_instructor_all
  ON public.instructor_time_off (instructor_id, starts_at DESC);

-- ── Recurring Schedule Exceptions ────────────────────────────────────────────

-- Slot generator lookup: exceptions for a given rule on a specific date
CREATE INDEX idx_schedule_exceptions_rule_date
  ON public.recurring_schedule_exceptions (availability_rule_id, exception_date);

-- ── Lesson Slots ─────────────────────────────────────────────────────────────

-- Instructor calendar view (primary hot path)
CREATE INDEX idx_lesson_slots_instructor_time
  ON public.lesson_slots (instructor_id, starts_at, ends_at)
  WHERE status NOT IN ('cancelled');

-- Vehicle schedule (fleet management view)
CREATE INDEX idx_lesson_slots_vehicle_time
  ON public.lesson_slots (vehicle_id, starts_at)
  WHERE vehicle_id IS NOT NULL AND status NOT IN ('cancelled');

-- Location-based calendar (multi-branch organisations)
CREATE INDEX idx_lesson_slots_location_time
  ON public.lesson_slots (location_id, starts_at)
  WHERE location_id IS NOT NULL AND status NOT IN ('cancelled');

-- Student booking UI: open slots by org + type + time
CREATE INDEX idx_lesson_slots_open_type
  ON public.lesson_slots (organization_id, lesson_type_id, starts_at)
  WHERE status = 'open';

-- Daily operations dashboard: all active slots per org
CREATE INDEX idx_lesson_slots_org_date
  ON public.lesson_slots (organization_id, starts_at)
  WHERE status NOT IN ('cancelled');

-- Conflict detection btree range scans on instructor (backs pre-flight check)
CREATE INDEX idx_lesson_slots_instructor_range
  ON public.lesson_slots (instructor_id, starts_at, ends_at)
  WHERE status NOT IN ('cancelled');

-- Conflict detection range scans on vehicle
CREATE INDEX idx_lesson_slots_vehicle_range
  ON public.lesson_slots (vehicle_id, starts_at, ends_at)
  WHERE vehicle_id IS NOT NULL AND status NOT IN ('cancelled');

-- Slot provenance: find all slots generated from a given availability rule
CREATE INDEX idx_lesson_slots_availability_rule
  ON public.lesson_slots (availability_rule_id)
  WHERE availability_rule_id IS NOT NULL;

-- ── Lesson Bookings ───────────────────────────────────────────────────────────

-- Student calendar view (portal primary query)
CREATE INDEX idx_lesson_bookings_student_time
  ON public.lesson_bookings (student_id, starts_at)
  WHERE status NOT IN ('cancelled', 'rescheduled');

-- Instructor's booking list
CREATE INDEX idx_lesson_bookings_instructor_time
  ON public.lesson_bookings (instructor_id, starts_at)
  WHERE status NOT IN ('cancelled', 'rescheduled');

-- Upcoming confirmed bookings (reminder / notification jobs)
CREATE INDEX idx_lesson_bookings_org_confirmed
  ON public.lesson_bookings (organization_id, starts_at)
  WHERE status = 'confirmed';

-- Slot capacity check: how many active bookings does this slot have?
CREATE INDEX idx_lesson_bookings_slot_active
  ON public.lesson_bookings (slot_id)
  WHERE status NOT IN ('cancelled', 'rescheduled', 'no_show');

-- No-show tracking dashboard
CREATE INDEX idx_lesson_bookings_no_show
  ON public.lesson_bookings (organization_id, no_show_marked_at DESC)
  WHERE status = 'no_show';

-- Rescheduling lineage traversal
CREATE INDEX idx_lesson_bookings_rescheduled_from
  ON public.lesson_bookings (rescheduled_from_id)
  WHERE rescheduled_from_id IS NOT NULL;

-- Phase 3: unpaid confirmed bookings for payment processing
CREATE INDEX idx_lesson_bookings_unpaid_confirmed
  ON public.lesson_bookings (organization_id, created_at)
  WHERE status = 'confirmed' AND payment_status = 'unpaid';

-- Conflict detection: student overlap range scans (backs pre-flight check)
CREATE INDEX idx_lesson_bookings_student_range
  ON public.lesson_bookings (student_id, starts_at, ends_at)
  WHERE status NOT IN ('cancelled', 'no_show', 'rescheduled');

-- ── Booking Attendance ────────────────────────────────────────────────────────

-- Lookup by booking (most frequent access pattern)
CREATE INDEX idx_booking_attendance_booking
  ON public.booking_attendance (booking_id);

-- AI analytics: performance-rated sessions per student over time
CREATE INDEX idx_booking_attendance_student_rating
  ON public.booking_attendance (student_id, recorded_at DESC)
  WHERE performance_rating IS NOT NULL;

-- Org-level attendance analytics and reporting
CREATE INDEX idx_booking_attendance_org_date
  ON public.booking_attendance (organization_id, recorded_at DESC);

-- ── Booking Notes ─────────────────────────────────────────────────────────────

-- All notes for a booking (most common read pattern)
CREATE INDEX idx_booking_notes_booking
  ON public.booking_notes (booking_id);

-- Student-visible notes only (portal query optimisation)
CREATE INDEX idx_booking_notes_booking_public
  ON public.booking_notes (booking_id)
  WHERE is_internal = false;

-- =============================================================================
-- SECTION 10: EVENT OUTBOX EMISSION TRIGGERS
-- Booking and slot lifecycle changes are emitted to the 'internal' channel.
-- Downstream workers consume these events to drive:
--   • Confirmation / reminder emails and SMS
--   • Cancellation notifications (student + staff)
--   • No-show follow-up and potential fee logic
--   • Completion workflow (prompts instructor to record attendance)
--   • Instructor unavailability alerts to managers
--   • Scheduling engine cache invalidation signals
--   • Future: Google / Outlook calendar sync
--   • Future: AI scheduling optimisation pipeline
--
-- event_type format must satisfy '^[a-z_]+\.[a-z_]+$'.
-- insert_outbox_event() signature (Phase 1B.2):
--   insert_outbox_event(p_event_type, p_channel, p_payload, p_organization_id, ...)
-- =============================================================================

-- ── Booking lifecycle events ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.emit_booking_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- booking.created on INSERT (any active initial status)
  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('cancelled', 'rescheduled') THEN
    PERFORM public.insert_outbox_event(
      'booking.created',
      'internal',
      jsonb_build_object(
        'booking_id',      NEW.id,
        'organization_id', NEW.organization_id,
        'student_id',      NEW.student_id,
        'instructor_id',   NEW.instructor_id,
        'slot_id',         NEW.slot_id,
        'lesson_type_id',  NEW.lesson_type_id,
        'starts_at',       NEW.starts_at,
        'status',          NEW.status,
        'booked_by',       NEW.booked_by
      ),
      NEW.organization_id
    );
    RETURN NEW;
  END IF;

  -- Status-change events on UPDATE
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN

    IF NEW.status = 'cancelled' THEN
      PERFORM public.insert_outbox_event(
        'booking.cancelled',
        'internal',
        jsonb_build_object(
          'booking_id',            NEW.id,
          'organization_id',       NEW.organization_id,
          'student_id',            NEW.student_id,
          'instructor_id',         NEW.instructor_id,
          'starts_at',             NEW.starts_at,
          'cancelled_by',          NEW.cancelled_by,
          'cancellation_reason',   NEW.cancellation_reason,
          'cancellation_category', NEW.cancellation_category
        ),
        NEW.organization_id
      );

    ELSIF NEW.status = 'completed' THEN
      PERFORM public.insert_outbox_event(
        'booking.completed',
        'internal',
        jsonb_build_object(
          'booking_id',      NEW.id,
          'organization_id', NEW.organization_id,
          'student_id',      NEW.student_id,
          'instructor_id',   NEW.instructor_id,
          'slot_id',         NEW.slot_id,
          'starts_at',       NEW.starts_at,
          'ends_at',         NEW.ends_at
        ),
        NEW.organization_id
      );

    ELSIF NEW.status = 'no_show' THEN
      PERFORM public.insert_outbox_event(
        'booking.no_show',
        'internal',
        jsonb_build_object(
          'booking_id',        NEW.id,
          'organization_id',   NEW.organization_id,
          'student_id',        NEW.student_id,
          'instructor_id',     NEW.instructor_id,
          'starts_at',         NEW.starts_at,
          'no_show_marked_by', NEW.no_show_marked_by,
          'no_show_marked_at', NEW.no_show_marked_at
        ),
        NEW.organization_id
      );

    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lesson_bookings_emit_events
  AFTER INSERT OR UPDATE OF status ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.emit_booking_status_changed();

-- ── Slot lifecycle events ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.emit_slot_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- slot.created when a new open slot becomes available
  IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
    PERFORM public.insert_outbox_event(
      'slot.created',
      'internal',
      jsonb_build_object(
        'slot_id',           NEW.id,
        'organization_id',   NEW.organization_id,
        'instructor_id',     NEW.instructor_id,
        'lesson_type_id',    NEW.lesson_type_id,
        'starts_at',         NEW.starts_at,
        'generation_source', NEW.generation_source
      ),
      NEW.organization_id
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'cancelled' THEN
      PERFORM public.insert_outbox_event(
        'slot.cancelled',
        'internal',
        jsonb_build_object(
          'slot_id',         NEW.id,
          'organization_id', NEW.organization_id,
          'instructor_id',   NEW.instructor_id,
          'starts_at',       NEW.starts_at,
          'cancelled_by',    NEW.updated_by
        ),
        NEW.organization_id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lesson_slots_emit_events
  AFTER INSERT OR UPDATE OF status ON public.lesson_slots
  FOR EACH ROW EXECUTE FUNCTION public.emit_slot_status_changed();

-- ── Instructor unavailability event ───────────────────────────────────────────

-- Emitted when a time-off request transitions to 'approved'.
-- Downstream: alert managers to existing slots in the blocked window;
-- trigger slot generator to skip the window for future dates.
CREATE OR REPLACE FUNCTION public.emit_instructor_unavailable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved' THEN
    PERFORM public.insert_outbox_event(
      'instructor.unavailable',
      'internal',
      jsonb_build_object(
        'time_off_id',     NEW.id,
        'organization_id', NEW.organization_id,
        'instructor_id',   NEW.instructor_id,
        'time_off_type',   NEW.time_off_type,
        'starts_at',       NEW.starts_at,
        'ends_at',         NEW.ends_at,
        'approved_by',     NEW.approved_by
      ),
      NEW.organization_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_instructor_time_off_unavailable
  AFTER UPDATE OF status ON public.instructor_time_off
  FOR EACH ROW EXECUTE FUNCTION public.emit_instructor_unavailable();

-- =============================================================================
-- SECTION 11: SLOT FIELD COPY TRIGGER + BOOKING COUNTER TRIGGER
-- Two triggers manage lesson_bookings lifecycle automatically:
--   A) lesson_booking_set_slot_fields — BEFORE INSERT
--      Copies starts_at/ends_at/instructor_id/vehicle_id/lesson_type_id/
--      location_id from the slot so callers only need to supply slot_id.
--      Runs before constraint evaluation, so the EXCLUDE constraint sees the
--      correct starts_at/ends_at values at row creation time.
--   B) update_slot_booking_count — AFTER INSERT/UPDATE(status)/DELETE
--      Recomputes lesson_slots.current_bookings from a COUNT of active bookings.
--      Using COUNT (not ±1 delta) avoids race conditions under concurrent load.
--      Also auto-transitions slot status between 'open' and 'full'.
-- =============================================================================

-- A) Copy denormalised fields from the slot before inserting a booking.
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

  -- Enforce tenant isolation between booking and slot
  IF NEW.organization_id != v_slot.organization_id THEN
    RAISE EXCEPTION 'lesson_bookings: organization_id % does not match slot org %',
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
  'BEFORE INSERT trigger: copies starts_at/ends_at and resource IDs from the '
  'referenced slot. Application code only needs slot_id + student_id + org_id. '
  'Runs before EXCLUDE constraint evaluation to ensure correct time ranges.';

CREATE TRIGGER lesson_bookings_set_slot_fields
  BEFORE INSERT ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.lesson_booking_set_slot_fields();

-- B) Recompute slot booking count and status after every booking change.
-- "Active" booking = status NOT IN ('cancelled', 'no_show', 'rescheduled').
-- Uses COUNT rather than ±1 delta to be idempotent under concurrent writes.
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

  -- Recount active bookings (AFTER trigger: current operation already reflected)
  SELECT COUNT(*)
  INTO   v_count
  FROM   public.lesson_bookings
  WHERE  slot_id = v_slot_id
    AND  status  NOT IN ('cancelled', 'no_show', 'rescheduled');

  UPDATE public.lesson_slots
  SET
    current_bookings = v_count,
    -- Auto-transition open ↔ full based on capacity
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
  'AFTER INSERT/UPDATE(status)/DELETE trigger on lesson_bookings. '
  'Recomputes current_bookings via COUNT to avoid ±1 race conditions. '
  'Auto-transitions slot status open ↔ full when capacity threshold is crossed.';

CREATE TRIGGER lesson_bookings_update_slot_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.lesson_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_slot_booking_count();

-- =============================================================================
-- SECTION 12: PERMISSIONS SEED — SCHEDULING DOMAIN
-- All scheduling permissions are new in Phase 2B (not seeded in prior phases).
--
-- Permission matrix:
--   org_owner, org_admin   → ALL scheduling permissions
--   org_manager            → all except slot:delete, booking:delete
--   instructor_senior      → slot:read/create/update, booking:read/update,
--                            availability:read/update (own rules)
--   instructor             → same as instructor_senior
--   receptionist           → booking:create/read/update/export, slot:read,
--                            availability:read
--   student                → no explicit permissions; access via RLS self-access
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
  (gen_random_uuid(), 'scheduling:booking:export',      'scheduling', 'booking',      'export', 'Export booking data to CSV'),
  (gen_random_uuid(), 'scheduling:availability:read',   'scheduling', 'availability', 'read',   'View instructor availability rules and time-off'),
  (gen_random_uuid(), 'scheduling:availability:update', 'scheduling', 'availability', 'update', 'Manage instructor availability rules and time-off');

-- org_owner and org_admin: all scheduling permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS JOIN public.permissions p
WHERE  r.name IN ('org_owner', 'org_admin') AND r.is_system_role = true
  AND  p.domain = 'scheduling';

-- org_manager: all except slot:delete and booking:delete
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS JOIN public.permissions p
WHERE  r.name = 'org_manager' AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'scheduling:slot:create',
    'scheduling:slot:read',
    'scheduling:slot:update',
    'scheduling:booking:create',
    'scheduling:booking:read',
    'scheduling:booking:update',
    'scheduling:booking:export',
    'scheduling:availability:read',
    'scheduling:availability:update'
  ]);

-- instructor and instructor_senior: manage their own slots and availability;
-- read and update bookings in their slots; RLS limits self-access further
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS JOIN public.permissions p
WHERE  r.name IN ('instructor', 'instructor_senior') AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'scheduling:slot:create',
    'scheduling:slot:read',
    'scheduling:slot:update',
    'scheduling:booking:read',
    'scheduling:booking:update',
    'scheduling:availability:read',
    'scheduling:availability:update'
  ]);

-- receptionist: manage bookings, read slots; no slot/availability management
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   public.roles r
CROSS JOIN public.permissions p
WHERE  r.name = 'receptionist' AND r.is_system_role = true
  AND  p.code = ANY(ARRAY[
    'scheduling:slot:read',
    'scheduling:booking:create',
    'scheduling:booking:read',
    'scheduling:booking:update',
    'scheduling:booking:export',
    'scheduling:availability:read'
  ]);

-- =============================================================================
-- SECTION 13: SECURITY HARDENING
-- Revoke anon access from all new tables as belt-and-suspenders hardening
-- (RLS USING clauses already block unauthenticated access via the PostgREST
-- anon role, but explicit REVOKE provides defence-in-depth).
-- =============================================================================

REVOKE ALL ON TABLE public.lesson_types                  FROM anon;
REVOKE ALL ON TABLE public.instructor_availability_rules FROM anon;
REVOKE ALL ON TABLE public.instructor_time_off           FROM anon;
REVOKE ALL ON TABLE public.recurring_schedule_exceptions FROM anon;
REVOKE ALL ON TABLE public.lesson_slots                  FROM anon;
REVOKE ALL ON TABLE public.lesson_bookings               FROM anon;
REVOKE ALL ON TABLE public.booking_attendance            FROM anon;
REVOKE ALL ON TABLE public.booking_notes                 FROM anon;
