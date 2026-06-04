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
