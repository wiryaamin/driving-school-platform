-- =============================================================================
-- MIGRATION: Flexible lesson duration (Scheduling — Admin-Friendly Booking)
--
-- Business rule change: the 45-minute figure seen in the product was never a
-- platform-level rule — it was just this org's own lesson_types.default_
-- duration_minutes value (lesson_types.default_duration_minutes has always
-- been a normal, per-organization, per-lesson-type editable column; there is
-- no hardcoded "45" anywhere in the scheduling engine). What genuinely never
-- existed anywhere in the architecture was a minimum-duration/granularity
-- rule at all — lesson_slots/lesson_bookings duration is derived purely from
-- (ends_at - starts_at), unconstrained.
--
-- New platform-wide rule, enforced at the database level (the strongest,
-- non-bypassable layer, consistent with every other scheduling constraint
-- already living here):
--   duration >= 40 minutes
--   duration % 5 = 0
-- No maximum is introduced — none was asked for and none already exists.
--
-- Verified against live production data before writing this migration
-- (SELECT COUNT(*) ... WHERE duration < 40 OR duration % 5 != 0): zero
-- violations on both lesson_slots and lesson_bookings, and on
-- lesson_types.default_duration_minutes/max_duration_minutes — safe to add
-- as a real CHECK constraint with no backfill needed.
--
-- Duration is rounded to the nearest minute before the rule is checked —
-- an exact-equality version of this constraint failed against live data:
-- several programmatically-generated slots (test/demo seed data) have
-- starts_at/ends_at a few milliseconds off a whole minute (e.g. "90 minutes
-- and 17ms"), which is not a real scheduling discrepancy. Rounding handles
-- that jitter symmetrically while still enforcing the real business rule for
-- every slot anyone actually schedules by clock time.
--
-- The one exception: 3 existing lesson_types rows have
-- min_duration_minutes = 30, an org's own already-configured lower bound.
-- Retroactively rewriting or CHECK-constraining that value to >= 40 would
-- silently override configuration those trafikskolor already set — exactly
-- what "changing the default must not retroactively change existing
-- [configuration]" rules out. min_duration_minutes only gets a %5=0 CHECK
-- (safe: 30 already complies); the real >=40 floor is enforced where
-- scheduling actually happens (lesson_slots/lesson_bookings), which no
-- existing configuration can loosen.
-- =============================================================================

-- ─── Duration floor + granularity, enforced where scheduling actually happens ──

ALTER TABLE public.lesson_slots
  ADD CONSTRAINT lesson_slots_duration_rule CHECK (
    ROUND(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60) >= 40
    AND ROUND(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60)::int % 5 = 0
  );

ALTER TABLE public.lesson_bookings
  ADD CONSTRAINT lesson_bookings_duration_rule CHECK (
    ROUND(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60) >= 40
    AND ROUND(EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60)::int % 5 = 0
  );

COMMENT ON CONSTRAINT lesson_slots_duration_rule ON public.lesson_slots IS
  'Platform rule: duration >= 40 minutes, 5-minute granularity. No maximum.';
COMMENT ON CONSTRAINT lesson_bookings_duration_rule ON public.lesson_bookings IS
  'Platform rule: duration >= 40 minutes, 5-minute granularity. No maximum. '
  'Kept in sync with the owning slot by the application (slots/index.ts '
  'handleUpdate) whenever slot timing changes on a slot with active bookings.';

-- ─── lesson_types: granularity everywhere, floor only where it cannot break existing config ──

ALTER TABLE public.lesson_types
  ADD CONSTRAINT lesson_types_default_dur_rule CHECK (
    default_duration_minutes >= 40 AND default_duration_minutes % 5 = 0
  ),
  ADD CONSTRAINT lesson_types_max_dur_rule CHECK (
    max_duration_minutes % 5 = 0
  ),
  ADD CONSTRAINT lesson_types_min_dur_granularity CHECK (
    min_duration_minutes % 5 = 0
  );

COMMENT ON CONSTRAINT lesson_types_default_dur_rule ON public.lesson_types IS
  'Platform rule: default duration >= 40 minutes, 5-minute granularity.';
COMMENT ON CONSTRAINT lesson_types_min_dur_granularity ON public.lesson_types IS
  'Granularity only, deliberately not >= 40 — 3 existing lesson types were '
  'already configured with min_duration_minutes = 30 and that pre-existing '
  'per-org configuration is not retroactively overridden. The real >= 40 '
  'floor is enforced on lesson_slots/lesson_bookings themselves, which no '
  'lesson_type configuration can loosen; the app additionally clamps the '
  'duration picker to max(this value, 40) so nothing new is ever offered '
  'below the platform floor.';

-- ─── New platform default: 40 minutes, not 60 (existing rows untouched) ──────

ALTER TABLE public.lesson_types
  ALTER COLUMN default_duration_minutes SET DEFAULT 40,
  ALTER COLUMN min_duration_minutes     SET DEFAULT 40;
