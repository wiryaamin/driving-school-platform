import type { UUID, Timestamp } from './common.types.js';
import type {
  LessonCategoryEnum,
  LessonSlotStatusEnum,
  BookingStatusEnum,
  SlotGenerationSourceEnum,
} from './database.types.js';

export type LessonCategory       = LessonCategoryEnum;
export type LessonSlotStatus     = LessonSlotStatusEnum;
export type BookingStatus        = BookingStatusEnum;
export type SlotGenerationSource = SlotGenerationSourceEnum;

export type CancellationCategory =
  | 'student_request'
  | 'school_cancelled'
  | 'weather'
  | 'vehicle_fault'
  | 'instructor_sick'
  | 'other';

// ─── Domain models ────────────────────────────────────────────────────────────

export interface LessonType {
  id:                       UUID;
  organization_id:          UUID;
  name:                     string;
  code:                     string;
  category:                 LessonCategory;
  default_duration_minutes: number;
  min_duration_minutes:     number;
  max_duration_minutes:     number;
  requires_vehicle:         boolean;
  requires_instructor:      boolean;
  required_certifications:  string[];
  max_students_per_slot:    number;
  color_hex:                string;
  display_order:            number;
  is_active:                boolean;
  pricing_sek:              number | null;
  created_by:               UUID | null;
  updated_by:               UUID | null;
  created_at:               Timestamp;
  updated_at:               Timestamp;
}

export interface LessonSlot {
  id:                   UUID;
  organization_id:      UUID;
  instructor_id:        UUID;
  vehicle_id:           UUID | null;
  location_id:          UUID | null;
  lesson_type_id:       UUID;
  starts_at:            Timestamp;
  ends_at:              Timestamp;
  timezone:             string;
  status:               LessonSlotStatus;
  status_changed_at:    Timestamp | null;
  max_bookings:         number;
  current_bookings:     number;
  generation_source:    SlotGenerationSource;
  availability_rule_id: UUID | null;
  exception_id:         UUID | null;
  notes:                string | null;
  deleted_at:           Timestamp | null;
  deleted_by:           UUID | null;
  created_by:           UUID | null;
  updated_by:           UUID | null;
  created_at:           Timestamp;
  updated_at:           Timestamp;
}

export interface LessonBooking {
  id:                    UUID;
  organization_id:       UUID;
  slot_id:               UUID;
  student_id:            UUID;
  instructor_id:         UUID;
  vehicle_id:            UUID | null;
  lesson_type_id:        UUID;
  location_id:           UUID | null;
  starts_at:             Timestamp;
  ends_at:               Timestamp;
  status:                BookingStatus;
  status_changed_at:     Timestamp | null;
  cancelled_at:          Timestamp | null;
  cancelled_by:          UUID | null;
  cancellation_reason:   string | null;
  cancellation_category: CancellationCategory | null;
  rescheduled_from_id:   UUID | null;
  no_show_marked_at:     Timestamp | null;
  no_show_marked_by:     UUID | null;
  package_item_id:       UUID | null;
  payment_status:        string;
  price_sek:             number | null;
  booked_by:             UUID | null;
  deleted_at:            Timestamp | null;
  deleted_by:            UUID | null;
  created_by:            UUID | null;
  updated_by:            UUID | null;
  created_at:            Timestamp;
  updated_at:            Timestamp;
}

// ─── Input types (caller-facing, no org_id or audit fields) ──────────────────

export interface CreateLessonSlotInput {
  instructor_id:    UUID;
  vehicle_id?:      UUID | null;
  location_id?:     UUID | null;
  lesson_type_id:   UUID;
  starts_at:        Timestamp;
  ends_at:          Timestamp;
  timezone?:        string;
  max_bookings?:    number;
  notes?:           string | null;
}

export interface UpdateLessonSlotInput {
  instructor_id?:   UUID;
  vehicle_id?:      UUID | null;
  location_id?:     UUID | null;
  lesson_type_id?:  UUID;
  starts_at?:       Timestamp;
  ends_at?:         Timestamp;
  timezone?:        string;
  max_bookings?:    number;
  notes?:           string | null;
}

export interface CreateBookingInput {
  slot_id:          UUID;
  student_id:       UUID;
  status?:          BookingStatus;
  price_sek?:       number | null;
}

export interface UpdateBookingInput {
  status?: BookingStatus;
}

export interface CancelBookingInput {
  cancellation_reason?:   string | null;
  cancellation_category?: CancellationCategory | null;
}

export interface RescheduleBookingInput {
  new_slot_id: UUID;
}

// ─── Insert/Update types (repository layer, no org_id) ───────────────────────

export interface LessonSlotInsert extends CreateLessonSlotInput {
  status?:          LessonSlotStatus;
  generation_source?: SlotGenerationSource;
  created_by?:      UUID | null;
  updated_by?:      UUID | null;
}

export type LessonSlotUpdate = Partial<LessonSlotInsert & {
  status_changed_at: Timestamp | null;
}>;

export interface LessonBookingInsert {
  slot_id:               UUID;
  student_id:            UUID;
  status?:               BookingStatus;
  rescheduled_from_id?:  UUID | null;
  booked_by?:            UUID | null;
  price_sek?:            number | null;
  payment_status?:       string;
  created_by?:           UUID | null;
  updated_by?:           UUID | null;
}

export interface LessonBookingUpdate {
  status?:               BookingStatus;
  status_changed_at?:    Timestamp | null;
  cancelled_at?:         Timestamp | null;
  cancelled_by?:         UUID | null;
  cancellation_reason?:  string | null;
  cancellation_category?: CancellationCategory | null;
  no_show_marked_at?:    Timestamp | null;
  no_show_marked_by?:    UUID | null;
  payment_status?:       string;
  price_sek?:            number | null;
  updated_by?:           UUID | null;
}

// ─── List query input types ───────────────────────────────────────────────────

export interface LessonSlotListQueryInput {
  page?:            number | undefined;
  per_page?:        number | undefined;
  sort_by?:         string | undefined;
  sort_dir?:        'asc' | 'desc' | undefined;
  instructor_id?:   UUID | undefined;
  vehicle_id?:      UUID | undefined;
  location_id?:     UUID | undefined;
  lesson_type_id?:  UUID | undefined;
  status?:          LessonSlotStatus | undefined;
  from?:            Timestamp | undefined;
  to?:              Timestamp | undefined;
}

export interface LessonBookingListQueryInput {
  page?:          number | undefined;
  per_page?:      number | undefined;
  sort_by?:       string | undefined;
  sort_dir?:      'asc' | 'desc' | undefined;
  student_id?:    UUID | undefined;
  instructor_id?: UUID | undefined;
  slot_id?:       UUID | undefined;
  status?:        BookingStatus | undefined;
  from?:          Timestamp | undefined;
  to?:            Timestamp | undefined;
}
