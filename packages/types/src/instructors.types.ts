import type { UUID, Timestamp, DateString } from './common.types.js';
import type { PersonalIdentityType } from './students.types.js';

export type { PersonalIdentityType };

export type InstructorEmploymentType =
  | 'employed'
  | 'contractor'
  | 'external'
  | 'on_leave'
  | 'inactive';

export interface Instructor {
  id: UUID;
  organization_id: UUID;

  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  date_of_birth: DateString | null;

  identity_type: PersonalIdentityType;
  personnummer_encrypted: string | null;
  personnummer_hash: string | null;
  personnummer_last4: string | null;

  employment_type: InstructorEmploymentType;
  employment_started_at: DateString | null;
  employment_ended_at: DateString | null;
  employee_number: string | null;

  teaching_categories: string[];
  adi_number: string | null;
  adi_valid_until: DateString | null;

  primary_location_id: UUID | null;
  languages_spoken: string[];
  max_lessons_per_day: number | null;

  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  bio: string | null;
  emergency_contact_first_name: string | null;
  emergency_contact_last_name: string | null;
  emergency_contact_email: string | null;
  emergency_contact_phone: string | null;
  sort_order: number;
  show_in_booking: boolean;
  show_in_ecommerce: boolean;
  show_on_website: boolean;

  user_id: UUID | null;

  created_by: UUID | null;
  updated_by: UUID | null;
  deleted_at: Timestamp | null;
  deleted_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Service-layer input: callers supply the domain data; service injects audit fields from context.
export interface CreateInstructorInput {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  date_of_birth?: string | null;
  identity_type?: PersonalIdentityType;
  personnummer_encrypted?: string | null;
  personnummer_hash?: string | null;
  personnummer_last4?: string | null;
  employment_type?: InstructorEmploymentType;
  employment_started_at?: string | null;
  employment_ended_at?: string | null;
  employee_number?: string | null;
  teaching_categories?: string[];
  adi_number?: string | null;
  adi_valid_until?: string | null;
  primary_location_id?: string | null;
  languages_spoken?: string[];
  max_lessons_per_day?: number | null;

  personnummer?: string;
  address_line1?: string | null;
  postal_code?: string | null;
  city?: string | null;
  bio?: string | null;
  emergency_contact_first_name?: string | null;
  emergency_contact_last_name?: string | null;
  emergency_contact_email?: string | null;
  emergency_contact_phone?: string | null;
  sort_order?: number;
  show_in_booking?: boolean;
  show_in_ecommerce?: boolean;
  show_on_website?: boolean;
}

export type UpdateInstructorInput = Partial<CreateInstructorInput>;

// Repository-layer insert: extends CreateInstructorInput with audit fields injected by the service.
// organization_id is NOT here — BaseRepository injects it from TenantContext.
export interface InstructorInsert extends CreateInstructorInput {
  created_by?: string | null;
  updated_by?: string | null;
}

export type InstructorUpdate = Partial<InstructorInsert>;

export interface InstructorListQueryInput {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  search?: string;
  employment_type?: InstructorEmploymentType;
  teaching_category?: string;
  location_id?: string;
}

// ─── Instructor Certifications ────────────────────────────────────────────────

export type CertificationStatus = 'active' | 'expiring_soon' | 'expired' | 'suspended' | 'revoked';

export interface InstructorCertification {
  id: UUID;
  organization_id: UUID;
  instructor_id: UUID;
  certification_type: string;
  issuing_authority: string | null;
  certificate_number: string | null;
  status: CertificationStatus;
  issued_at: DateString;
  expires_at: DateString | null;
  renewal_reminded_at: Timestamp | null;
  renewal_completed_at: Timestamp | null;
  notes: string | null;
  storage_path: string | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CreateInstructorCertificationInput {
  certification_type: string;
  issuing_authority?: string | null;
  certificate_number?: string | null;
  issued_at: string;
  expires_at?: string | null;
  notes?: string | null;
}

// ─── Instructor Availability Rules ───────────────────────────────────────────

export interface InstructorAvailabilityRule {
  id: UUID;
  organization_id: UUID;
  instructor_id: UUID;
  location_id: UUID | null;
  day_of_week: number;        // 0=Sunday … 6=Saturday
  start_time: string;         // 'HH:MM:SS'
  end_time: string;
  timezone: string;
  effective_from: DateString;
  effective_until: DateString | null;
  slot_duration_minutes: number;
  slot_buffer_minutes: number;
  max_lessons_override: number | null;
  is_active: boolean;
  notes: string | null;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CreateAvailabilityRuleInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone?: string;
  effective_from?: string;
  effective_until?: string | null;
  slot_duration_minutes?: number;
  /** Gap between consecutive generated slots, in minutes. slot_duration_minutes + slot_buffer_minutes = the spacing between slot starts. */
  slot_buffer_minutes?: number;
  notes?: string | null;
}

// ─── Instructor Time Off ──────────────────────────────────────────────────────

export type TimeOffType = 'vacation' | 'sickness' | 'training' | 'public_holiday' | 'emergency' | 'other';
export type TimeOffStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface InstructorTimeOff {
  id: UUID;
  organization_id: UUID;
  instructor_id: UUID;
  time_off_type: TimeOffType;
  status: TimeOffStatus;
  starts_at: Timestamp;
  ends_at: Timestamp;
  is_full_day: boolean;
  reason: string | null;
  approved_by: UUID | null;
  approved_at: Timestamp | null;
  rejection_reason: string | null;
  created_by: UUID | null;
  updated_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CreateTimeOffInput {
  time_off_type: TimeOffType;
  starts_at: string;
  ends_at: string;
  is_full_day?: boolean;
  reason?: string | null;
}

// ─── Instructor Vehicle Assignments ───────────────────────────────────────────

export interface InstructorVehicleAssignment {
  id: UUID;
  organization_id: UUID;
  instructor_id: UUID;
  vehicle_id: UUID;
  is_primary: boolean;
  assigned_at: Timestamp;
  unassigned_at: Timestamp | null;  // null = currently active
  notes: string | null;
  assigned_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CreateVehicleAssignmentInput {
  vehicle_id: string;
  is_primary?: boolean;
  notes?: string | null;
}
