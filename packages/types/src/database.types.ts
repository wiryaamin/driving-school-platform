/**
 * Supabase database types — generated from Phase 1B.2 migration.
 * Regenerate after schema changes:
 *   pnpm supabase gen types typescript --local > packages/types/src/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ─── Enum Types ──────────────────────────────────────────────────────────────

export type OrganizationStatusEnum  = 'active' | 'suspended' | 'terminated';
export type SubscriptionTierEnum    = 'trial' | 'starter' | 'professional' | 'enterprise';
export type SubscriptionStatusEnum  = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';
export type LocationStatusEnum      = 'active' | 'inactive' | 'archived';
export type MembershipStatusEnum    = 'active' | 'suspended' | 'removed';
export type AuditOperationEnum      = 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE';
export type LanguageCodeEnum        = 'sv' | 'en';
export type EventOutboxStatusEnum   = 'pending' | 'processing' | 'delivered' | 'failed' | 'dead_letter' | 'cancelled';
export type EventChannelEnum        = 'email' | 'sms' | 'whatsapp' | 'push' | 'webhook' | 'ai_job' | 'accounting' | 'internal';

// Phase 2A domain enums
export type StudentStatusEnum           = 'lead' | 'onboarding' | 'active' | 'paused' | 'completed' | 'withdrawn' | 'archived';
export type PermitStageEnum             = 'not_started' | 'theory_study' | 'risk1_booked' | 'risk1_completed' | 'risk2_booked' | 'risk2_completed' | 'theory_exam_booked' | 'theory_passed' | 'practical_exam_booked' | 'practical_passed' | 'licence_issued';
export type PersonalIdentityTypeEnum    = 'personnummer' | 'samordningsnummer' | 'passport' | 'national_id' | 'none';
export type InstructorEmploymentTypeEnum = 'employed' | 'contractor' | 'external' | 'on_leave' | 'inactive';

// Phase 2B scheduling enums
export type LessonCategoryEnum       = 'driving' | 'theory' | 'risk1' | 'risk2' | 'simulator' | 'assessment' | 'intensive' | 'group_theory' | 'other';
export type LessonSlotStatusEnum     = 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled' | 'blocked';
export type BookingStatusEnum        = 'draft' | 'reserved' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
export type TimeOffTypeEnum          = 'vacation' | 'sickness' | 'training' | 'public_holiday' | 'emergency' | 'other';
export type TimeOffStatusEnum        = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type SlotGenerationSourceEnum = 'manual' | 'recurring' | 'imported';

// Phase 3D notification + automation enums
export type NotificationStatusEnum  = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type ReminderStatusEnum      = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'skipped';
export type WaitlistStatusEnum      = 'waiting' | 'promoted' | 'expired' | 'cancelled';
export type AutomationRuleTypeEnum  = 'reservation_expiry' | 'reminder_24h' | 'reminder_2h' | 'reminder_1h' | 'auto_confirm' | 'waitlist_promotion';

// Phase 4A commercial enums
export type PackageTypeEnum           = 'driving' | 'theory' | 'risk1' | 'risk2' | 'intensive' | 'mixed' | 'custom';
export type PackageStatusEnum         = 'draft' | 'active' | 'archived' | 'discontinued';
export type CreditEntryTypeEnum       = 'grant' | 'bonus' | 'consume' | 'expire' | 'adjust' | 'reverse';
export type InvoiceStatusEnum         = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'void' | 'overdue';
export type InvoiceLineTypeEnum       = 'package' | 'lesson' | 'fee' | 'discount' | 'tax' | 'other';
export type PaymentMethodEnum         = 'manual' | 'card' | 'bank_transfer' | 'swish' | 'stripe' | 'invoice_credit' | 'other';
export type PaymentStatusEnum         = 'pending' | 'confirmed' | 'failed' | 'refunded' | 'partially_refunded' | 'void';
export type FinancialPeriodStatusEnum = 'open' | 'closed' | 'locked';

// ─── Database Interface ───────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {

      organizations: {
        Row: {
          id:                  string;
          slug:                string;
          name:                string;
          legal_name:          string;
          org_number:          string | null;
          vat_number:          string | null;
          status:              OrganizationStatusEnum;
          subscription_tier:   SubscriptionTierEnum;
          subscription_status: SubscriptionStatusEnum;
          trial_ends_at:       string | null;
          max_locations:       number;
          max_users:           number;
          settings:            Json;
          metadata:            Json;
          created_at:          string;
          updated_at:          string;
          created_by:          string | null;
          updated_by:          string | null;
          deleted_at:          string | null;
          deleted_by:          string | null;
        };
        Insert: {
          id?:                  string;
          slug:                 string;
          name:                 string;
          legal_name:           string;
          org_number?:          string | null;
          vat_number?:          string | null;
          status?:              OrganizationStatusEnum;
          subscription_tier?:   SubscriptionTierEnum;
          subscription_status?: SubscriptionStatusEnum;
          trial_ends_at?:       string | null;
          max_locations?:       number;
          max_users?:           number;
          settings?:            Json;
          metadata?:            Json;
          created_at?:          string;
          updated_at?:          string;
          created_by?:          string | null;
          updated_by?:          string | null;
          deleted_at?:          string | null;
          deleted_by?:          string | null;
        };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
      };

      organization_locations: {
        Row: {
          id:               string;
          organization_id:  string;
          name:             string;
          address_line1:    string;
          address_line2:    string | null;
          postal_code:      string;
          city:             string;
          county:           string | null;
          country:          string;
          phone:            string | null;
          email:            string | null;
          is_primary:       boolean;
          status:           LocationStatusEnum;
          settings:         Json;
          metadata:         Json;
          created_at:       string;
          updated_at:       string;
          created_by:       string | null;
          updated_by:       string | null;
          deleted_at:       string | null;
          deleted_by:       string | null;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          name:             string;
          address_line1:    string;
          address_line2?:   string | null;
          postal_code:      string;
          city:             string;
          county?:          string | null;
          country?:         string;
          phone?:           string | null;
          email?:           string | null;
          is_primary?:      boolean;
          status?:          LocationStatusEnum;
          settings?:        Json;
          metadata?:        Json;
          created_at?:      string;
          updated_at?:      string;
          created_by?:      string | null;
          updated_by?:      string | null;
          deleted_at?:      string | null;
          deleted_by?:      string | null;
        };
        Update: Partial<Database['public']['Tables']['organization_locations']['Insert']>;
      };

      // Phase 1B.2: organization_id removed. Profiles are now global user
      // identity. Tenant relationships live exclusively in memberships.
      profiles: {
        Row: {
          id:                   string;
          first_name:           string;
          last_name:            string;
          email:                string;
          phone:                string | null;
          avatar_url:           string | null;
          language_preference:  LanguageCodeEnum;
          is_active:            boolean;
          last_seen_at:         string | null;
          invited_by:           string | null;
          invited_at:           string | null;
          onboarded_at:         string | null;
          settings:             Json;
          metadata:             Json;
          created_at:           string;
          updated_at:           string;
          deleted_at:           string | null;
          deleted_by:           string | null;
        };
        Insert: {
          id:                    string;
          first_name:            string;
          last_name:             string;
          email:                 string;
          phone?:                string | null;
          avatar_url?:           string | null;
          language_preference?:  LanguageCodeEnum;
          is_active?:            boolean;
          last_seen_at?:         string | null;
          invited_by?:           string | null;
          invited_at?:           string | null;
          onboarded_at?:         string | null;
          settings?:             Json;
          metadata?:             Json;
          created_at?:           string;
          updated_at?:           string;
          deleted_at?:           string | null;
          deleted_by?:           string | null;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };

      memberships: {
        Row: {
          id:               string;
          user_id:          string;
          organization_id:  string;
          status:           MembershipStatusEnum;
          joined_at:        string;
          suspended_at:     string | null;
          suspended_by:     string | null;
          removed_at:       string | null;
          removed_by:       string | null;
          metadata:         Json;
          created_at:       string;
          updated_at:       string;
        };
        Insert: {
          id?:              string;
          user_id:          string;
          organization_id:  string;
          status?:          MembershipStatusEnum;
          joined_at?:       string;
          suspended_at?:    string | null;
          suspended_by?:    string | null;
          removed_at?:      string | null;
          removed_by?:      string | null;
          metadata?:        Json;
          created_at?:      string;
          updated_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>;
      };

      roles: {
        Row: {
          id:               string;
          organization_id:  string | null;
          name:             string;
          display_name:     string;
          description:      string | null;
          is_system_role:   boolean;
          is_custom:        boolean;
          sort_order:       number;
          metadata:         Json;
          created_at:       string;
          updated_at:       string;
        };
        Insert: {
          id?:              string;
          organization_id?: string | null;
          name:             string;
          display_name:     string;
          description?:     string | null;
          is_system_role?:  boolean;
          is_custom?:       boolean;
          sort_order?:      number;
          metadata?:        Json;
          created_at?:      string;
          updated_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['roles']['Insert']>;
      };

      permissions: {
        Row: {
          id:           string;
          code:         string;
          domain:       string;
          resource:     string;
          action:       string;
          description:  string | null;
          is_active:    boolean;
          created_at:   string;
        };
        Insert: {
          id?:           string;
          code:          string;
          domain:        string;
          resource:      string;
          action:        string;
          description?:  string | null;
          is_active?:    boolean;
          created_at?:   string;
        };
        Update: Partial<Database['public']['Tables']['permissions']['Insert']>;
      };

      role_permissions: {
        Row: {
          id:             string;
          role_id:        string;
          permission_id:  string;
          granted_by:     string | null;
          granted_at:     string;
        };
        Insert: {
          id?:             string;
          role_id:         string;
          permission_id:   string;
          granted_by?:     string | null;
          granted_at?:     string;
        };
        Update: Partial<Database['public']['Tables']['role_permissions']['Insert']>;
      };

      membership_roles: {
        Row: {
          id:               string;
          membership_id:    string;
          organization_id:  string;
          role_id:          string;
          location_id:      string | null;
          assigned_by:      string | null;
          assigned_at:      string;
          expires_at:       string | null;
          is_active:        boolean;
          metadata:         Json;
        };
        Insert: {
          id?:              string;
          membership_id:    string;
          organization_id?: string;   // auto-populated by trigger
          role_id:          string;
          location_id?:     string | null;
          assigned_by?:     string | null;
          assigned_at?:     string;
          expires_at?:      string | null;
          is_active?:       boolean;
          metadata?:        Json;
        };
        Update: Partial<Database['public']['Tables']['membership_roles']['Insert']>;
      };

      feature_flags: {
        Row: {
          id:                   string;
          organization_id:      string | null;
          flag_key:             string;
          is_enabled:           boolean;
          rollout_percentage:   number;
          config:               Json;
          description:          string | null;
          enabled_at:           string | null;
          disabled_at:          string | null;
          created_at:           string;
          updated_at:           string;
        };
        Insert: {
          id?:                   string;
          organization_id?:      string | null;
          flag_key:              string;
          is_enabled?:           boolean;
          rollout_percentage?:   number;
          config?:               Json;
          description?:          string | null;
          enabled_at?:           string | null;
          disabled_at?:          string | null;
          created_at?:           string;
          updated_at?:           string;
        };
        Update: Partial<Database['public']['Tables']['feature_flags']['Insert']>;
      };

      audit_logs: {
        Row: {
          id:               string;
          organization_id:  string;
          actor_id:         string | null;
          actor_email:      string | null;
          entity_type:      string;
          entity_id:        string;
          operation:        AuditOperationEnum;
          table_name:       string;
          old_values:       Json | null;
          new_values:       Json | null;
          changed_fields:   string[] | null;
          ip_address:       string | null;
          user_agent:       string | null;
          request_id:       string | null;
          correlation_id:   string | null;
          causation_id:     string | null;
          session_id:       string | null;
          occurred_at:      string;
        };
        Insert: never;   // insert only via insert_audit_log() or audit_trigger_fn()
        Update: never;   // immutable
      };

      activity_logs: {
        Row: {
          id:               string;
          organization_id:  string;
          user_id:          string | null;
          user_email:       string | null;
          action:           string;
          description:      string | null;
          entity_type:      string | null;
          entity_id:        string | null;
          metadata:         Json;
          ip_address:       string | null;
          user_agent:       string | null;
          session_id:       string | null;
          occurred_at:      string;
        };
        Insert: never;   // insert only via insert_activity_log()
        Update: never;   // append-only
      };

      // Phase 1B.2: Bootstrap table for platform-level super admins.
      // Managed exclusively via service role. Never directly from client code.
      platform_admins: {
        Row: {
          id:          string;
          user_id:     string;
          role:        'platform_superadmin' | 'platform_support' | 'platform_billing';
          is_active:   boolean;
          granted_by:  string | null;
          granted_at:  string;
          notes:       string | null;
        };
        Insert: {
          id?:         string;
          user_id:     string;
          role?:       'platform_superadmin' | 'platform_support' | 'platform_billing';
          is_active?:  boolean;
          granted_by?: string | null;
          granted_at?: string;
          notes?:      string | null;
        };
        Update: Partial<Database['public']['Tables']['platform_admins']['Insert']>;
      };

      // Phase 2A: Students
      students: {
        Row: {
          id:                           string;
          organization_id:              string;
          first_name:                   string;
          last_name:                    string;
          date_of_birth:                string | null;
          identity_type:                PersonalIdentityTypeEnum;
          personnummer_encrypted:        string | null;
          personnummer_hash:             string | null;
          personnummer_last4:            string | null;
          email:                        string | null;
          phone:                        string | null;
          address_line1:                string | null;
          address_line2:                string | null;
          postal_code:                  string | null;
          city:                         string | null;
          preferred_language:           LanguageCodeEnum;
          communication_opt_in_email:   boolean;
          communication_opt_in_sms:     boolean;
          gdpr_consent_given_at:        string | null;
          gdpr_consent_version:         string | null;
          data_processing_consent:      boolean;
          marketing_consent:            boolean;
          gdpr_retention_override_at:   string | null;
          status:                       StudentStatusEnum;
          status_changed_at:            string | null;
          enrolled_at:                  string | null;
          enrollment_location_id:       string | null;
          assigned_instructor_id:       string | null;
          target_licence_category:      string;
          permit_stage:                 PermitStageEnum;
          permit_stage_updated_at:      string | null;
          risk1_completed_at:           string | null;
          risk2_completed_at:           string | null;
          theory_passed_at:             string | null;
          practical_passed_at:          string | null;
          licence_issued_at:            string | null;
          licence_number:               string | null;
          user_id:                      string | null;
          created_by:                   string | null;
          updated_by:                   string | null;
          deleted_at:                   string | null;
          deleted_by:                   string | null;
          created_at:                   string;
          updated_at:                   string;
        };
        Insert: {
          id?:                           string;
          organization_id:               string;
          first_name:                    string;
          last_name:                     string;
          date_of_birth?:                string | null;
          identity_type?:                PersonalIdentityTypeEnum;
          personnummer_encrypted?:        string | null;
          personnummer_hash?:             string | null;
          personnummer_last4?:            string | null;
          email?:                        string | null;
          phone?:                        string | null;
          address_line1?:                string | null;
          address_line2?:                string | null;
          postal_code?:                  string | null;
          city?:                         string | null;
          preferred_language?:           LanguageCodeEnum;
          communication_opt_in_email?:   boolean;
          communication_opt_in_sms?:     boolean;
          gdpr_consent_given_at?:        string | null;
          gdpr_consent_version?:         string | null;
          data_processing_consent?:      boolean;
          marketing_consent?:            boolean;
          gdpr_retention_override_at?:   string | null;
          status?:                       StudentStatusEnum;
          status_changed_at?:            string | null;
          enrolled_at?:                  string | null;
          enrollment_location_id?:       string | null;
          assigned_instructor_id?:       string | null;
          target_licence_category?:      string;
          permit_stage?:                 PermitStageEnum;
          permit_stage_updated_at?:      string | null;
          risk1_completed_at?:           string | null;
          risk2_completed_at?:           string | null;
          theory_passed_at?:             string | null;
          practical_passed_at?:          string | null;
          licence_issued_at?:            string | null;
          licence_number?:               string | null;
          user_id?:                      string | null;
          created_by?:                   string | null;
          updated_by?:                   string | null;
          deleted_at?:                   string | null;
          deleted_by?:                   string | null;
          created_at?:                   string;
          updated_at?:                   string;
        };
        Update: Partial<Database['public']['Tables']['students']['Insert']>;
      };

      // Phase 2A: Instructors
      instructors: {
        Row: {
          id:                     string;
          organization_id:        string;
          first_name:             string;
          last_name:              string;
          email:                  string;
          phone:                  string | null;
          date_of_birth:          string | null;
          identity_type:          PersonalIdentityTypeEnum;
          personnummer_encrypted:  string | null;
          personnummer_hash:       string | null;
          personnummer_last4:      string | null;
          employment_type:        InstructorEmploymentTypeEnum;
          employment_started_at:  string | null;
          employment_ended_at:    string | null;
          employee_number:        string | null;
          teaching_categories:    string[];
          adi_number:             string | null;
          adi_valid_until:        string | null;
          primary_location_id:    string | null;
          languages_spoken:       string[];
          max_lessons_per_day:    number | null;
          user_id:                string | null;
          created_by:             string | null;
          updated_by:             string | null;
          deleted_at:             string | null;
          deleted_by:             string | null;
          created_at:             string;
          updated_at:             string;
        };
        Insert: {
          id?:                     string;
          organization_id:         string;
          first_name:              string;
          last_name:               string;
          email:                   string;
          phone?:                  string | null;
          date_of_birth?:          string | null;
          identity_type?:          PersonalIdentityTypeEnum;
          personnummer_encrypted?:  string | null;
          personnummer_hash?:       string | null;
          personnummer_last4?:      string | null;
          employment_type?:        InstructorEmploymentTypeEnum;
          employment_started_at?:  string | null;
          employment_ended_at?:    string | null;
          employee_number?:        string | null;
          teaching_categories?:    string[];
          adi_number?:             string | null;
          adi_valid_until?:        string | null;
          primary_location_id?:    string | null;
          languages_spoken?:       string[];
          max_lessons_per_day?:    number | null;
          user_id?:                string | null;
          created_by?:             string | null;
          updated_by?:             string | null;
          deleted_at?:             string | null;
          deleted_by?:             string | null;
          created_at?:             string;
          updated_at?:             string;
        };
        Update: Partial<Database['public']['Tables']['instructors']['Insert']>;
      };

      // Phase 2B: Lesson types (per-org lesson catalog)
      lesson_types: {
        Row: {
          id:                       string;
          organization_id:          string;
          name:                     string;
          code:                     string;
          category:                 LessonCategoryEnum;
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
          created_by:               string | null;
          updated_by:               string | null;
          created_at:               string;
          updated_at:               string;
        };
        Insert: {
          id?:                       string;
          organization_id:           string;
          name:                      string;
          code:                      string;
          category:                  LessonCategoryEnum;
          default_duration_minutes?: number;
          min_duration_minutes?:     number;
          max_duration_minutes?:     number;
          requires_vehicle?:         boolean;
          requires_instructor?:      boolean;
          required_certifications?:  string[];
          max_students_per_slot?:    number;
          color_hex?:                string;
          display_order?:            number;
          is_active?:                boolean;
          pricing_sek?:              number | null;
          created_by?:               string | null;
          updated_by?:               string | null;
          created_at?:               string;
          updated_at?:               string;
        };
        Update: Partial<Database['public']['Tables']['lesson_types']['Insert']>;
      };

      // Phase 2B: Lesson slots (concrete bookable time windows)
      lesson_slots: {
        Row: {
          id:                   string;
          organization_id:      string;
          instructor_id:        string;
          vehicle_id:           string | null;
          location_id:          string | null;
          lesson_type_id:       string;
          starts_at:            string;
          ends_at:              string;
          timezone:             string;
          status:               LessonSlotStatusEnum;
          status_changed_at:    string | null;
          max_bookings:         number;
          current_bookings:     number;
          generation_source:    SlotGenerationSourceEnum;
          availability_rule_id: string | null;
          exception_id:         string | null;
          notes:                string | null;
          deleted_at:           string | null;
          deleted_by:           string | null;
          created_by:           string | null;
          updated_by:           string | null;
          created_at:           string;
          updated_at:           string;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          instructor_id:         string;
          vehicle_id?:           string | null;
          location_id?:          string | null;
          lesson_type_id:        string;
          starts_at:             string;
          ends_at:               string;
          timezone?:             string;
          status?:               LessonSlotStatusEnum;
          status_changed_at?:    string | null;
          max_bookings?:         number;
          current_bookings?:     number;
          generation_source?:    SlotGenerationSourceEnum;
          availability_rule_id?: string | null;
          exception_id?:         string | null;
          notes?:                string | null;
          deleted_at?:           string | null;
          deleted_by?:           string | null;
          created_by?:           string | null;
          updated_by?:           string | null;
          created_at?:           string;
          updated_at?:           string;
        };
        Update: Partial<Database['public']['Tables']['lesson_slots']['Insert']>;
      };

      // Phase 2B: Lesson bookings (student allocations to slots)
      // starts_at/ends_at/instructor_id/vehicle_id/lesson_type_id/location_id
      // are denormalised from the slot by BEFORE INSERT trigger lesson_booking_set_slot_fields().
      lesson_bookings: {
        Row: {
          id:                   string;
          organization_id:      string;
          slot_id:              string;
          student_id:           string;
          instructor_id:        string;
          vehicle_id:           string | null;
          lesson_type_id:       string;
          location_id:          string | null;
          starts_at:            string;
          ends_at:              string;
          status:               BookingStatusEnum;
          status_changed_at:    string | null;
          cancelled_at:         string | null;
          cancelled_by:         string | null;
          cancellation_reason:  string | null;
          cancellation_category: string | null;
          rescheduled_from_id:  string | null;
          no_show_marked_at:    string | null;
          no_show_marked_by:    string | null;
          package_item_id:      string | null;
          payment_status:       string;
          price_sek:            number | null;
          booked_by:            string | null;
          deleted_at:           string | null;
          deleted_by:           string | null;
          created_by:           string | null;
          updated_by:           string | null;
          created_at:           string;
          updated_at:           string;
        };
        Insert: {
          id?:                    string;
          organization_id:        string;
          slot_id:                string;
          student_id:             string;
          // Denormalized fields: set by BEFORE INSERT trigger from the slot.
          // Pass them if you need to override; otherwise leave blank.
          instructor_id?:         string;
          vehicle_id?:            string | null;
          lesson_type_id?:        string;
          location_id?:           string | null;
          starts_at?:             string;
          ends_at?:               string;
          status?:                BookingStatusEnum;
          status_changed_at?:     string | null;
          cancelled_at?:          string | null;
          cancelled_by?:          string | null;
          cancellation_reason?:   string | null;
          cancellation_category?: string | null;
          rescheduled_from_id?:   string | null;
          no_show_marked_at?:     string | null;
          no_show_marked_by?:     string | null;
          package_item_id?:       string | null;
          payment_status?:        string;
          price_sek?:             number | null;
          booked_by?:             string | null;
          deleted_at?:            string | null;
          deleted_by?:            string | null;
          created_by?:            string | null;
          updated_by?:            string | null;
          created_at?:            string;
          updated_at?:            string;
        };
        Update: Partial<Database['public']['Tables']['lesson_bookings']['Insert']>;
      };

      // Phase 3D: Notification templates (organization_id NULL = system-wide)
      notification_templates: {
        Row: {
          id:              string;
          organization_id: string | null;
          key:             string;
          locale:          string;
          channel:         string;
          subject:         string | null;
          body_html:       string | null;
          body_text:       string;
          variables:       string[];
          is_active:       boolean;
          created_at:      string;
          updated_at:      string;
        };
        Insert: {
          id?:              string;
          organization_id?: string | null;
          key:              string;
          locale?:          string;
          channel:          string;
          subject?:         string | null;
          body_html?:       string | null;
          body_text:        string;
          variables?:       string[];
          is_active?:       boolean;
          created_at?:      string;
          updated_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['notification_templates']['Insert']>;
      };

      // Phase 3D: Notification audit log with idempotency + retry tracking
      notifications: {
        Row: {
          id:                string;
          organization_id:   string;
          recipient_id:      string;
          recipient_type:    string;
          channel:           string;
          template_key:      string;
          locale:            string;
          subject:           string | null;
          body:              string | null;
          metadata:          Json;
          status:            NotificationStatusEnum;
          status_changed_at: string | null;
          sent_at:           string | null;
          failed_at:         string | null;
          failure_reason:    string | null;
          retry_count:       number;
          max_retries:       number;
          idempotency_key:   string | null;
          scheduled_for:     string | null;
          reference_type:    string | null;
          reference_id:      string | null;
          created_at:        string;
          updated_at:        string;
        };
        Insert: {
          id?:                string;
          organization_id:    string;
          recipient_id:       string;
          recipient_type:     string;
          channel:            string;
          template_key:       string;
          locale?:            string;
          subject?:           string | null;
          body?:              string | null;
          metadata?:          Json;
          status?:            NotificationStatusEnum;
          status_changed_at?: string | null;
          sent_at?:           string | null;
          failed_at?:         string | null;
          failure_reason?:    string | null;
          retry_count?:       number;
          max_retries?:       number;
          idempotency_key?:   string | null;
          scheduled_for?:     string | null;
          reference_type?:    string | null;
          reference_id?:      string | null;
          created_at?:        string;
          updated_at?:        string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
      };

      // Phase 3D: Per-profile channel + type notification preferences
      notification_preferences: {
        Row: {
          id:                string;
          organization_id:   string;
          profile_id:        string;
          channel:           string;
          notification_type: string;
          enabled:           boolean;
          created_at:        string;
          updated_at:        string;
        };
        Insert: {
          id?:                string;
          organization_id:    string;
          profile_id:         string;
          channel:            string;
          notification_type:  string;
          enabled?:           boolean;
          created_at?:        string;
          updated_at?:        string;
        };
        Update: Partial<Database['public']['Tables']['notification_preferences']['Insert']>;
      };

      // Phase 3D: Scheduled lesson reminders with atomic claim pattern
      lesson_reminders: {
        Row: {
          id:               string;
          organization_id:  string;
          booking_id:       string;
          recipient_id:     string;
          recipient_type:   string;
          reminder_type:    string;
          offset_minutes:   number;
          scheduled_for:    string;
          status:           ReminderStatusEnum;
          notification_id:  string | null;
          idempotency_key:  string;
          created_at:       string;
          updated_at:       string;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          booking_id:        string;
          recipient_id:      string;
          recipient_type?:   string;
          reminder_type:     string;
          offset_minutes:    number;
          scheduled_for:     string;
          status?:           ReminderStatusEnum;
          notification_id?:  string | null;
          idempotency_key:   string;
          created_at?:       string;
          updated_at?:       string;
        };
        Update: Partial<Database['public']['Tables']['lesson_reminders']['Insert']>;
      };

      // Phase 3D: Slot waitlist with priority ordering
      waitlist_entries: {
        Row: {
          id:                   string;
          organization_id:      string;
          slot_id:              string;
          student_id:           string;
          priority:             number;
          status:               WaitlistStatusEnum;
          status_changed_at:    string | null;
          expires_at:           string | null;
          promoted_booking_id:  string | null;
          notified_at:          string | null;
          reservation_deadline: string | null;
          notes:                string | null;
          created_at:           string;
          updated_at:           string;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          slot_id:               string;
          student_id:            string;
          priority?:             number;
          status?:               WaitlistStatusEnum;
          status_changed_at?:    string | null;
          expires_at?:           string | null;
          promoted_booking_id?:  string | null;
          notified_at?:          string | null;
          reservation_deadline?: string | null;
          notes?:                string | null;
          created_at?:           string;
          updated_at?:           string;
        };
        Update: Partial<Database['public']['Tables']['waitlist_entries']['Insert']>;
      };

      // Phase 3D: Per-org configurable automation rules
      automation_rules: {
        Row: {
          id:              string;
          organization_id: string;
          rule_type:       AutomationRuleTypeEnum;
          enabled:         boolean;
          config:          Json;
          created_at:      string;
          updated_at:      string;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          rule_type:        AutomationRuleTypeEnum;
          enabled?:         boolean;
          config?:          Json;
          created_at?:      string;
          updated_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['automation_rules']['Insert']>;
      };

      // Phase 4A: Commercial foundation tables.

      package_catalog: {
        Row: {
          id:               string;
          organization_id:  string | null;
          name:             string;
          description:      string | null;
          package_type:     PackageTypeEnum;
          lesson_category:  LessonCategoryEnum;
          default_quantity: number;
          default_price:    number;
          currency:         string;
          vat_rate:         number;
          validity_days:    number | null;
          is_active:        boolean;
          sort_order:       number;
          metadata:         Json;
          created_at:       string;
          updated_at:       string;
          created_by:       string | null;
          updated_by:       string | null;
        };
        Insert: {
          id?:               string;
          organization_id?:  string | null;
          name:              string;
          description?:      string | null;
          package_type?:     PackageTypeEnum;
          lesson_category:   LessonCategoryEnum;
          default_quantity:  number;
          default_price:     number;
          currency?:         string;
          vat_rate?:         number;
          validity_days?:    number | null;
          is_active?:        boolean;
          sort_order?:       number;
          metadata?:         Json;
          created_at?:       string;
          updated_at?:       string;
          created_by?:       string | null;
          updated_by?:       string | null;
        };
        Update: Partial<Database['public']['Tables']['package_catalog']['Insert']>;
      };

      package_offerings: {
        Row: {
          id:               string;
          organization_id:  string;
          catalog_id:       string | null;
          name:             string;
          description:      string | null;
          package_type:     PackageTypeEnum;
          lesson_category:  LessonCategoryEnum;
          quantity:         number;
          bundle_credits:   Json;
          price:            number;
          currency:         string;
          vat_rate:         number;
          validity_days:    number | null;
          status:           PackageStatusEnum;
          sort_order:       number;
          metadata:         Json;
          created_at:       string;
          updated_at:       string;
          archived_at:      string | null;
          created_by:       string | null;
          updated_by:       string | null;
          archived_by:      string | null;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          catalog_id?:       string | null;
          name:              string;
          description?:      string | null;
          package_type?:     PackageTypeEnum;
          lesson_category:   LessonCategoryEnum;
          quantity:          number;
          bundle_credits?:   Json;
          price:             number;
          currency?:         string;
          vat_rate?:         number;
          validity_days?:    number | null;
          status?:           PackageStatusEnum;
          sort_order?:       number;
          metadata?:         Json;
          created_at?:       string;
          updated_at?:       string;
          archived_at?:      string | null;
          created_by?:       string | null;
          updated_by?:       string | null;
          archived_by?:      string | null;
        };
        Update: Partial<Database['public']['Tables']['package_offerings']['Insert']>;
      };

      student_packages: {
        Row: {
          id:                string;
          organization_id:   string;
          student_id:        string;
          offering_id:       string;
          status:            PackageStatusEnum;
          quantity_granted:  number;
          quantity_consumed: number;
          quantity_expired:  number;
          price_paid:        number;
          currency:          string;
          vat_rate:          number;
          purchased_at:      string;
          activated_at:      string | null;
          expires_at:        string | null;
          archived_at:       string | null;
          archived_by:       string | null;
          notes:             string | null;
          metadata:          Json;
          created_at:        string;
          updated_at:        string;
          created_by:        string | null;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          student_id:        string;
          offering_id:       string;
          status?:           PackageStatusEnum;
          quantity_granted:  number;
          quantity_consumed?: number;
          quantity_expired?:  number;
          price_paid:        number;
          currency?:         string;
          vat_rate:          number;
          purchased_at?:     string;
          activated_at?:     string | null;
          expires_at?:       string | null;
          archived_at?:      string | null;
          archived_by?:      string | null;
          notes?:            string | null;
          metadata?:         Json;
          created_at?:       string;
          updated_at?:       string;
          created_by?:       string | null;
        };
        Update: Partial<Database['public']['Tables']['student_packages']['Insert']>;
      };

      credit_ledger: {
        Row: {
          id:                 string;
          organization_id:    string;
          student_id:         string;
          lesson_category:    LessonCategoryEnum;
          entry_type:         CreditEntryTypeEnum;
          quantity:           number;
          currency:           string;
          student_package_id: string | null;
          booking_id:         string | null;
          grant_entry_id:     string | null;
          reference_type:     string | null;
          reference_id:       string | null;
          description:        string | null;
          actor_id:           string | null;
          expires_at:         string | null;
          metadata:           Json;
          created_at:         string;
        };
        Insert: {
          id?:                string;
          organization_id:    string;
          student_id:         string;
          lesson_category:    LessonCategoryEnum;
          entry_type:         CreditEntryTypeEnum;
          quantity:           number;
          currency?:          string;
          student_package_id?: string | null;
          booking_id?:        string | null;
          grant_entry_id?:    string | null;
          reference_type?:    string | null;
          reference_id?:      string | null;
          description?:       string | null;
          actor_id?:          string | null;
          expires_at?:        string | null;
          metadata?:          Json;
          created_at?:        string;
        };
        Update: Partial<Database['public']['Tables']['credit_ledger']['Insert']>;
      };

      credit_balance_cache: {
        Row: {
          id:               string;
          organization_id:  string;
          student_id:       string;
          lesson_category:  LessonCategoryEnum;
          balance:          number;
          last_ledger_id:   string | null;
          updated_at:       string;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          student_id:       string;
          lesson_category:  LessonCategoryEnum;
          balance?:         number;
          last_ledger_id?:  string | null;
          updated_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['credit_balance_cache']['Insert']>;
      };

      invoices: {
        Row: {
          id:                  string;
          organization_id:     string;
          student_id:          string;
          student_package_id:  string | null;
          invoice_number:      string | null;
          status:              InvoiceStatusEnum;
          currency:            string;
          subtotal_amount:     number;
          vat_amount:          number;
          total_amount:        number;
          paid_amount:         number;
          outstanding_amount:  number;
          due_date:            string | null;
          issued_at:           string | null;
          issued_by:           string | null;
          paid_at:             string | null;
          void_at:             string | null;
          void_by:             string | null;
          void_reason:         string | null;
          notes:               string | null;
          metadata:            Json;
          created_at:          string;
          updated_at:          string;
          created_by:          string | null;
          updated_by:          string | null;
        };
        Insert: {
          id?:                 string;
          organization_id:     string;
          student_id:          string;
          student_package_id?: string | null;
          invoice_number?:     string | null;
          status?:             InvoiceStatusEnum;
          currency?:           string;
          subtotal_amount?:    number;
          vat_amount?:         number;
          total_amount?:       number;
          paid_amount?:        number;
          outstanding_amount?: number;
          due_date?:           string | null;
          issued_at?:          string | null;
          issued_by?:          string | null;
          paid_at?:            string | null;
          void_at?:            string | null;
          void_by?:            string | null;
          void_reason?:        string | null;
          notes?:              string | null;
          metadata?:           Json;
          created_at?:         string;
          updated_at?:         string;
          created_by?:         string | null;
          updated_by?:         string | null;
        };
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>;
      };

      invoice_line_items: {
        Row: {
          id:                 string;
          organization_id:    string;
          invoice_id:         string;
          student_package_id: string | null;
          line_type:          InvoiceLineTypeEnum;
          description:        string;
          quantity:           number;
          unit_price:         number;
          vat_rate:           number;
          vat_amount:         number;
          line_total:         number;
          sort_order:         number;
          metadata:           Json;
          created_at:         string;
          updated_at:         string;
        };
        Insert: {
          id?:                string;
          organization_id:    string;
          invoice_id:         string;
          student_package_id?: string | null;
          line_type?:         InvoiceLineTypeEnum;
          description:        string;
          quantity?:          number;
          unit_price:         number;
          vat_rate?:          number;
          vat_amount?:        number;
          line_total?:        number;
          sort_order?:        number;
          metadata?:          Json;
          created_at?:        string;
          updated_at?:        string;
        };
        Update: Partial<Database['public']['Tables']['invoice_line_items']['Insert']>;
      };

      invoice_number_sequences: {
        Row: {
          id:               string;
          organization_id:  string;
          year:             number;
          last_number:      number;
          prefix:           string;
          created_at:       string;
          updated_at:       string;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          year:             number;
          last_number?:     number;
          prefix?:          string;
          created_at?:      string;
          updated_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['invoice_number_sequences']['Insert']>;
      };

      payments: {
        Row: {
          id:                  string;
          organization_id:     string;
          invoice_id:          string;
          student_id:          string;
          payment_method:      PaymentMethodEnum;
          status:              PaymentStatusEnum;
          amount:              number;
          currency:            string;
          provider_reference:  string | null;
          provider_metadata:   Json;
          paid_at:             string | null;
          confirmed_at:        string | null;
          confirmed_by:        string | null;
          void_at:             string | null;
          void_by:             string | null;
          void_reason:         string | null;
          refund_amount:       number | null;
          refunded_at:         string | null;
          refunded_by:         string | null;
          notes:               string | null;
          metadata:            Json;
          created_at:          string;
          updated_at:          string;
          created_by:          string | null;
        };
        Insert: {
          id?:                 string;
          organization_id:     string;
          invoice_id:          string;
          student_id:          string;
          payment_method:      PaymentMethodEnum;
          status?:             PaymentStatusEnum;
          amount:              number;
          currency?:           string;
          provider_reference?: string | null;
          provider_metadata?:  Json;
          paid_at?:            string | null;
          confirmed_at?:       string | null;
          confirmed_by?:       string | null;
          void_at?:            string | null;
          void_by?:            string | null;
          void_reason?:        string | null;
          refund_amount?:      number | null;
          refunded_at?:        string | null;
          refunded_by?:        string | null;
          notes?:              string | null;
          metadata?:           Json;
          created_at?:         string;
          updated_at?:         string;
          created_by?:         string | null;
        };
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
      };

      financial_periods: {
        Row: {
          id:               string;
          organization_id:  string;
          name:             string;
          period_start:     string;
          period_end:       string;
          status:           FinancialPeriodStatusEnum;
          closed_at:        string | null;
          closed_by:        string | null;
          locked_at:        string | null;
          locked_by:        string | null;
          notes:            string | null;
          metadata:         Json;
          created_at:       string;
          updated_at:       string;
          created_by:       string | null;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          name:             string;
          period_start:     string;
          period_end:       string;
          status?:          FinancialPeriodStatusEnum;
          closed_at?:       string | null;
          closed_by?:       string | null;
          locked_at?:       string | null;
          locked_by?:       string | null;
          notes?:           string | null;
          metadata?:        Json;
          created_at?:      string;
          updated_at?:      string;
          created_by?:      string | null;
        };
        Update: Partial<Database['public']['Tables']['financial_periods']['Insert']>;
      };

      // Phase 1B.2: Transactional outbox for async event delivery.
      event_outbox: {
        Row: {
          id:               string;
          organization_id:  string | null;
          event_type:       string;
          event_version:    string;
          channel:          EventChannelEnum;
          correlation_id:   string | null;
          causation_id:     string | null;
          session_id:       string | null;
          payload:          Json;
          metadata:         Json;
          status:           EventOutboxStatusEnum;
          target_id:        string | null;
          scheduled_at:     string;
          locked_at:        string | null;
          locked_by:        string | null;
          retry_count:      number;
          max_retries:      number;
          next_retry_at:    string | null;
          last_error:       string | null;
          processed_at:     string | null;
          delivered_at:     string | null;
          dead_lettered_at: string | null;
          cancelled_at:     string | null;
          created_by:       string | null;
          created_at:       string;
        };
        Insert: {
          id?:               string;
          organization_id?:  string | null;
          event_type:        string;
          event_version?:    string;
          channel:           EventChannelEnum;
          correlation_id?:   string | null;
          causation_id?:     string | null;
          session_id?:       string | null;
          payload?:          Json;
          metadata?:         Json;
          status?:           EventOutboxStatusEnum;
          target_id?:        string | null;
          scheduled_at?:     string;
          locked_at?:        string | null;
          locked_by?:        string | null;
          retry_count?:      number;
          max_retries?:      number;
          next_retry_at?:    string | null;
          last_error?:       string | null;
          processed_at?:     string | null;
          delivered_at?:     string | null;
          dead_lettered_at?: string | null;
          cancelled_at?:     string | null;
          created_by?:       string | null;
          created_at?:       string;
        };
        Update: Partial<Database['public']['Tables']['event_outbox']['Insert']>;
      };
    };

    Views: {
      user_effective_permissions: {
        Row: {
          user_id:          string;
          organization_id:  string;
          permission_code:  string;
          location_id:      string | null;
          expires_at:       string | null;
        };
      };
    };

    Functions: {
      // ── JWT claim readers (callable by authenticated clients) ───────────────
      auth_organization_id: {
        Args: Record<never, never>;
        Returns: string;
      };
      auth_user_permissions: {
        Args: Record<never, never>;
        Returns: string[];
      };
      auth_user_role: {
        Args: Record<never, never>;
        Returns: string;
      };
      auth_membership_id: {
        Args: Record<never, never>;
        Returns: string;
      };
      auth_location_ids: {
        Args: Record<never, never>;
        Returns: string[];
      };
      auth_subscription_tier: {
        Args: Record<never, never>;
        Returns: string;
      };
      auth_impersonator_id: {
        Args: Record<never, never>;
        Returns: string;
      };
      // ── Permission / role predicates (used in RLS & application code) ───────
      has_permission: {
        Args: { required_permission: string };
        Returns: boolean;
      };
      has_any_permission: {
        Args: { required_permissions: string[] };
        Returns: boolean;
      };
      is_platform_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      is_org_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      is_impersonating: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      is_same_org_member: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      // ── Auth Hook builder (service role only) ───────────────────────────────
      get_user_jwt_claims: {
        Args: { p_user_id: string; p_target_org_id?: string };
        Returns: Json;
      };
      // ── Log writers (service role only) ─────────────────────────────────────
      insert_audit_log: {
        Args: {
          p_organization_id:  string;
          p_actor_id:         string | null;
          p_actor_email:      string | null;
          p_entity_type:      string;
          p_entity_id:        string;
          p_operation:        AuditOperationEnum;
          p_table_name:       string;
          p_old_values?:      Json | null;
          p_new_values?:      Json | null;
          p_changed_fields?:  string[] | null;
          p_ip_address?:      string | null;
          p_user_agent?:      string | null;
          p_request_id?:      string | null;
          p_correlation_id?:  string | null;
          p_causation_id?:    string | null;
          p_session_id?:      string | null;
        };
        Returns: string;
      };
      insert_activity_log: {
        Args: {
          p_organization_id:  string;
          p_user_id:          string | null;
          p_user_email:       string | null;
          p_action:           string;
          p_description?:     string | null;
          p_entity_type?:     string | null;
          p_entity_id?:       string | null;
          p_metadata?:        Json;
          p_ip_address?:      string | null;
          p_user_agent?:      string | null;
          p_session_id?:      string | null;
        };
        Returns: string;
      };
      // ── Outbox workers (service role only) ──────────────────────────────────
      insert_outbox_event: {
        Args: {
          p_event_type:       string;
          p_channel:          EventChannelEnum;
          p_payload:          Json;
          p_organization_id?: string;
          p_target_id?:       string;
          p_correlation_id?:  string;
          p_causation_id?:    string;
          p_scheduled_at?:    string;
          p_max_retries?:     number;
          p_metadata?:        Json;
          p_event_version?:   string;
        };
        Returns: string;
      };
      outbox_claim_next: {
        Args: {
          p_channel:     EventChannelEnum;
          p_worker_id:   string;
          p_batch_size?: number;
          p_lock_ttl?:   string;
        };
        Returns: Database['public']['Tables']['event_outbox']['Row'][];
      };
      outbox_complete: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      outbox_fail: {
        Args: { p_event_id: string; p_error: string };
        Returns: undefined;
      };
      // ── Scheduling availability pre-flight helpers ───────────────────────────
      check_instructor_availability: {
        Args: {
          p_instructor_id:   string;
          p_starts_at:       string;
          p_ends_at:         string;
          p_exclude_slot_id?: string;
        };
        Returns: boolean;
      };
      check_vehicle_availability: {
        Args: {
          p_vehicle_id:      string;
          p_starts_at:       string;
          p_ends_at:         string;
          p_exclude_slot_id?: string;
        };
        Returns: boolean;
      };
      check_student_booking_availability: {
        Args: {
          p_student_id:          string;
          p_starts_at:           string;
          p_ends_at:             string;
          p_exclude_booking_id?: string;
        };
        Returns: boolean;
      };
      // ── Phase 3D: Automation + notification DB helpers ──────────────────────
      schedule_lesson_reminders: {
        Args: { p_booking_id: string };
        Returns: number;
      };
      cancel_lesson_reminders: {
        Args: { p_booking_id: string };
        Returns: number;
      };
      drain_due_reminders: {
        Args: { p_limit?: number };
        Returns: Database['public']['Tables']['lesson_reminders']['Row'][];
      };
      promote_waitlist_next: {
        Args: { p_slot_id: string };
        Returns: string | null;
      };
      expire_stale_reservations: {
        Args: { p_timeout_minutes?: number };
        Returns: number;
      };
      // ── Phase 4A: Commercial SECURITY DEFINER functions ─────────────────────
      purchase_package: {
        Args: {
          p_org_id:      string;
          p_student_id:  string;
          p_offering_id: string;
          p_actor_id:    string;
        };
        Returns: string;  // student_package_id
      };
      consume_credit: {
        Args: {
          p_org_id:     string;
          p_student_id: string;
          p_booking_id: string;
          p_category:   LessonCategoryEnum;
          p_quantity?:  number;
        };
        Returns: string;  // credit_ledger entry id
      };
      issue_invoice: {
        Args: { p_invoice_id: string; p_actor_id: string };
        Returns: string;  // invoice_number
      };
      void_invoice: {
        Args: { p_invoice_id: string; p_actor_id: string; p_reason?: string };
        Returns: string;  // void_at timestamp
      };
      record_payment: {
        Args: {
          p_invoice_id: string;
          p_amount:     number;
          p_method:     PaymentMethodEnum;
          p_reference?: string;
          p_actor_id?:  string;
        };
        Returns: string;  // payment_id
      };
      expire_stale_credits: {
        Args: { p_limit?: number };
        Returns: number;
      };
      // ── Soft delete helpers (service role only) ──────────────────────────────
      soft_delete: {
        Args: { p_table_name: string; p_record_id: string };
        Returns: undefined;
      };
      soft_restore: {
        Args: { p_table_name: string; p_record_id: string; p_org_id?: string };
        Returns: undefined;
      };
    };

    Enums: {
      organization_status:   OrganizationStatusEnum;
      subscription_tier:     SubscriptionTierEnum;
      subscription_status:   SubscriptionStatusEnum;
      location_status:       LocationStatusEnum;
      membership_status:     MembershipStatusEnum;
      audit_operation:       AuditOperationEnum;
      language_code:         LanguageCodeEnum;
      event_outbox_status:   EventOutboxStatusEnum;
      event_channel:         EventChannelEnum;
      student_status:             StudentStatusEnum;
      permit_stage:               PermitStageEnum;
      personal_identity_type:     PersonalIdentityTypeEnum;
      instructor_employment_type: InstructorEmploymentTypeEnum;
      lesson_category:            LessonCategoryEnum;
      lesson_slot_status:         LessonSlotStatusEnum;
      booking_status:             BookingStatusEnum;
      time_off_type:              TimeOffTypeEnum;
      time_off_status:            TimeOffStatusEnum;
      slot_generation_source:     SlotGenerationSourceEnum;
      notification_status:        NotificationStatusEnum;
      reminder_status:            ReminderStatusEnum;
      waitlist_status:            WaitlistStatusEnum;
      automation_rule_type:       AutomationRuleTypeEnum;
      package_type:               PackageTypeEnum;
      package_status:             PackageStatusEnum;
      credit_entry_type:          CreditEntryTypeEnum;
      invoice_status:             InvoiceStatusEnum;
      invoice_line_type:          InvoiceLineTypeEnum;
      payment_method:             PaymentMethodEnum;
      payment_status:             PaymentStatusEnum;
      financial_period_status:    FinancialPeriodStatusEnum;
    };
  };
}
