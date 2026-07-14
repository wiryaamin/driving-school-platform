import type { UUID, Timestamp, DateString } from './common.types.js';

export type StudentStatus =
  | 'lead'
  | 'onboarding'
  | 'active'
  | 'paused'
  | 'completed'
  | 'withdrawn'
  | 'archived';

export type PermitStage =
  | 'not_started'
  | 'theory_study'
  | 'risk1_booked'
  | 'risk1_completed'
  | 'risk2_booked'
  | 'risk2_completed'
  | 'theory_exam_booked'
  | 'theory_passed'
  | 'practical_exam_booked'
  | 'practical_passed'
  | 'licence_issued';

export type PersonalIdentityType =
  | 'personnummer'
  | 'samordningsnummer'
  | 'passport'
  | 'national_id'
  | 'none';

export interface Student {
  id: UUID;
  organization_id: UUID;

  first_name: string;
  last_name: string;
  date_of_birth: DateString | null;

  identity_type: PersonalIdentityType;
  personnummer_encrypted: string | null;
  personnummer_hash: string | null;
  personnummer_last4: string | null;

  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;

  preferred_language: string;
  communication_opt_in_email: boolean;
  communication_opt_in_sms: boolean;

  gdpr_consent_given_at: Timestamp | null;
  gdpr_consent_version: string | null;
  data_processing_consent: boolean;
  marketing_consent: boolean;
  gdpr_retention_override_at: Timestamp | null;

  status: StudentStatus;
  status_changed_at: Timestamp | null;
  enrolled_at: Timestamp | null;
  enrollment_location_id: UUID | null;
  assigned_instructor_id: UUID | null;

  target_licence_category: string;
  permit_stage: PermitStage;
  permit_stage_updated_at: Timestamp | null;
  risk1_completed_at: Timestamp | null;
  risk2_completed_at: Timestamp | null;
  theory_passed_at: Timestamp | null;
  practical_passed_at: Timestamp | null;
  licence_issued_at: Timestamp | null;
  licence_number: string | null;

  notes: string | null;
  corporate_customer_id: UUID | null;

  user_id: UUID | null;

  created_by: UUID | null;
  updated_by: UUID | null;
  deleted_at: Timestamp | null;
  deleted_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// Service-layer input: callers supply the domain data; service injects audit fields from context.
export interface CreateStudentInput {
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  identity_type?: PersonalIdentityType;
  personnummer_encrypted?: string | null;
  personnummer_hash?: string | null;
  personnummer_last4?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  preferred_language?: string;
  communication_opt_in_email?: boolean;
  communication_opt_in_sms?: boolean;
  gdpr_consent_given_at?: string | null;
  gdpr_consent_version?: string | null;
  data_processing_consent?: boolean;
  marketing_consent?: boolean;
  status?: StudentStatus;
  enrolled_at?: string | null;
  enrollment_location_id?: string | null;
  assigned_instructor_id?: string | null;
  target_licence_category?: string;
  permit_stage?: PermitStage;
  notes?: string | null;
  corporate_customer_id?: string | null;
}

export type UpdateStudentInput = Partial<CreateStudentInput>;

// Repository-layer insert: extends CreateStudentInput with audit fields injected by the service.
// organization_id is NOT here — BaseRepository injects it from TenantContext.
export interface StudentInsert extends CreateStudentInput {
  created_by?: string | null;
  updated_by?: string | null;
}

export type StudentUpdate = Partial<StudentInsert>;

export interface StudentListQueryInput {
  page?: number | undefined;
  per_page?: number | undefined;
  sort_by?: string | undefined;
  sort_dir?: 'asc' | 'desc' | undefined;
  search?: string | undefined;
  status?: StudentStatus | undefined;
  instructor_id?: string | undefined;
  permit_stage?: PermitStage | undefined;
  licence_category?: string | undefined;
  not_licence_category?: string | undefined;
  corporate_customer_id?: string | undefined;
  age_from?: number | undefined;
  age_to?: number | undefined;
}
