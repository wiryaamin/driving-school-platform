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

// Phase 4B commercial enums
export type RefundStatusEnum            = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type RefundTypeEnum              = 'full' | 'partial' | 'credit_only' | 'payment_only';
export type RefundReasonCodeEnum        = 'duplicate_payment' | 'student_cancellation' | 'administrative_error' | 'service_failure' | 'goodwill' | 'fraud_prevention' | 'partial_adjustment';
export type DiscountTypeEnum            = 'percentage' | 'fixed';
export type DiscountScopeEnum           = 'offering' | 'catalog' | 'category' | 'all';
export type DunningActionTypeEnum       = 'email' | 'sms' | 'both' | 'legal';
export type AccountingExportFormatEnum  = 'sie4' | 'fortnox_csv' | 'visma_csv';

// Phase 4C Swedish finance enums
export type VatPeriodFrequencyEnum = 'monthly' | 'quarterly' | 'annually';
export type VatPeriodStatusEnum    = 'open' | 'locked' | 'filed' | 'amended';
export type FortnoxSyncStatusEnum  = 'pending' | 'synced' | 'failed' | 'skipped' | 'stale';

// Phase 4D double-entry ledger enums
export type JournalEntryTypeEnum   = 'standard' | 'reversal' | 'correction' | 'opening_balance' | 'closing' | 'manual';
export type JournalEntryStatusEnum = 'draft' | 'posted';

// Phase 4E reconciliation + financial close enums
export type BankStatementStatusEnum      = 'imported' | 'reconciling' | 'reconciled' | 'confirmed';
export type BankLineStatusEnum           = 'unmatched' | 'matched' | 'confirmed' | 'exception' | 'ignored';
export type ReconciliationTypeEnum       = 'bank' | 'accounts_receivable' | 'vat' | 'deferred_revenue' | 'ledger_integrity';
export type ReconciliationRunStatusEnum  = 'pending' | 'in_progress' | 'needs_review' | 'completed' | 'confirmed';
export type ReconciliationItemStatusEnum = 'matched' | 'exception' | 'manual_override' | 'ignored';

// Phase 4F payroll & regulatory accounting enums
export type PayrollRunStatusEnum       = 'draft' | 'ready' | 'posted' | 'reversed' | 'corrected';
export type PayrollRunTypeEnum         = 'regular' | 'supplementary' | 'correction';
export type TaxRemittanceStatusEnum    = 'pending' | 'clearing_posted' | 'payment_posted' | 'completed' | 'cancelled';
export type AgiExportStatusEnum        = 'draft' | 'finalized' | 'submitted' | 'amended';
export type RegulatoryExportTypeEnum   = 'agi' | 'vat_declaration' | 'payroll_register' | 'trial_balance' | 'general_ledger';
export type RegulatoryExportStatusEnum = 'generated' | 'submitted' | 'archived';

// Phase 4G fixed assets + accrual enums
export type FixedAssetStatusEnum   = 'draft' | 'active' | 'impaired' | 'fully_depreciated' | 'disposed';
export type DepreciationMethodEnum = 'straight_line' | 'declining_balance' | 'none';
export type AssetDisposalTypeEnum  = 'sale' | 'write_off' | 'transfer' | 'trade_in';
export type AccrualTypeEnum        = 'prepaid_expense' | 'accrued_liability' | 'accrued_revenue' | 'deferred_cost';
export type AccrualStatusEnum      = 'active' | 'fully_released' | 'cancelled' | 'amended';

// Phase 4H replayable ledger governance enums
export type LedgerReplayStatusEnum     = 'running' | 'completed' | 'failed' | 'divergent';
export type LedgerReplayTypeEnum       = 'period' | 'fiscal_year' | 'full';
export type ScheduleGenerationTypeEnum = 'depreciation' | 'accrual' | 'deferred';
export type SubledgerTypeEnum          = 'fixed_assets' | 'payroll' | 'vat' | 'accounts_receivable' | 'bank' | 'deferred_revenue' | 'accruals';
export type SubledgerCloseStatusEnum   = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type FiscalDependencyTypeEnum   = 'sequential' | 'fiscal_year' | 'subledger' | 'manual';
export type ReplayDivergenceTypeEnum   = 'balance_mismatch' | 'missing_account' | 'orphan_transaction' | 'duplicate_posting';
export type ReplayValidationTypeEnum   = 'full_integrity' | 'balance_check' | 'dependency_check' | 'subledger_check';
export type ReplayValidationStatusEnum = 'clean' | 'divergences_found' | 'errors';
export type ReplayHashTypeEnum         = 'period_replay' | 'canonical_export' | 'balance_snapshot' | 'schedule_lineage';

// Phase 4H-A accounting architecture stabilization enums
export type AccountingLayerTypeEnum       = 'source_of_truth' | 'projection' | 'archive' | 'governance' | 'reporting';
export type ReplayDeltaTypeEnum           = 'balance_mismatch' | 'missing_from_cache' | 'missing_from_ledger' | 'orphan_transaction';
export type ReplayCertificationStatusEnum = 'pending' | 'certified' | 'revoked';
export type ReplayJobTypeEnum             = 'period_replay' | 'fiscal_year_replay' | 'full_replay' | 'certification' | 'export';
export type ReplayJobStatusEnum           = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type CanonicalExportTypeEnum       = 'canonical_replay' | 'canonical_accounting' | 'sie4' | 'agi';

// Phase 5A Swedish compliance + regulatory reporting enums
export type ComplianceEventTypeEnum         = 'agi_export_generated' | 'agi_export_finalized' | 'agi_submission_generated' | 'agi_submission_certified' | 'agi_correction_created' | 'vat_declaration_generated' | 'vat_declaration_certified' | 'vat_correction_created' | 'saft_export_generated' | 'saft_export_submitted' | 'filing_certified' | 'compliance_hash_generated' | 'retention_policy_enforced' | 'retention_violation_detected' | 'evidence_package_assembled' | 'replay_certificate_generated' | 'certificate_signed' | 'authority_receipt_registered' | 'submission_envelope_sealed' | 'transport_manifest_sealed' | 'delivery_created' | 'delivery_attempt_registered' | 'delivery_finalized' | 'trust_anchor_registered' | 'certificate_chain_registered' | 'signed_receipt_registered' | 'transport_authenticity_verified' | 'timestamp_authority_registered' | 'temporal_evidence_issued' | 'temporal_snapshot_created' | 'temporal_replay_certificate_generated' | 'temporal_chain_validated' | 'serializer_profile_registered' | 'replay_range_window_created' | 'temporal_security_validated' | 'chronology_archive_prepared' | 'replay_test_executed' | 'serializer_drift_detected' | 'replay_benchmark_completed' | 'restore_validation_completed' | 'tenant_isolation_validated' | 'replay_health_check_completed' | 'phase6a_validation_executed' | 'replay_ci_pipeline_executed' | 'shadow_rebuild_validated' | 'restore_simulation_completed' | 'archive_lifecycle_executed' | 'operational_metrics_collected' | 'replay_anomaly_detected' | 'phase6b_validation_executed';
export type RegulatoryCertificationTypeEnum = 'regulatory_seal' | 'replay_verified' | 'authority_submitted' | 'lineage_anchored';

// Phase 5C cryptographic trust enums
export type EidasLevelTypeEnum = 'AdES' | 'AdES_QC' | 'QES';

// Phase 5D transport trust enums
export type DeliveryStatusEnum         = 'pending' | 'in_progress' | 'delivered' | 'failed' | 'rejected' | 'superseded';
export type DeliveryAttemptOutcomeEnum = 'success' | 'failure' | 'timeout' | 'rejected' | 'pending';

// Phase 5E PKI trust infrastructure enums
export type CertificateRevocationStateEnum = 'active' | 'revoked' | 'suspended' | 'expired';

// Phase 5F temporal evidence enums
export type TimestampAuthorityStatusEnum = 'active' | 'revoked' | 'suspended' | 'expired';

// Phase 6A platform stabilization enums
export type ReplayTestStatusEnum          = 'running' | 'completed' | 'failed';
export type SerializerDriftTypeEnum       = 'hash_mismatch' | 'version_mismatch' | 'strategy_mismatch' | 'none';
export type ReplayAccessViolationTypeEnum = 'cross_tenant_replay' | 'unauthorized_chronology' | 'escalated_access';
export type ReplayAlertTypeEnum           = 'chronology_corruption' | 'replay_drift' | 'serializer_incompatibility' | 'replay_certificate_mismatch' | 'snapshot_divergence' | 'replay_chain_discontinuity' | 'tenant_isolation_failure';
export type ReplayAlertSeverityEnum       = 'info' | 'warning' | 'critical';
export type ReplayHealthStatusEnum        = 'healthy' | 'degraded' | 'critical';

// Phase 6B DevOps, Replay CI/CD & Production Operations enums
export type ReplayCiStatusEnum            = 'running' | 'passed' | 'failed';
export type ShadowRebuildStatusEnum       = 'running' | 'completed' | 'divergent' | 'failed';
export type RestoreSimulationStatusEnum   = 'running' | 'completed' | 'failed' | 'divergent';
export type ArchiveLifecycleStatusEnum    = 'pending' | 'archiving' | 'archived' | 'verified' | 'failed';
export type ReplayAnomalyTypeEnum         = 'chronology_discontinuity' | 'hash_divergence' | 'serializer_incompatibility' | 'reconstruction_anomaly' | 'archive_inconsistency' | 'cross_tenant_leakage' | 'certificate_mismatch';

// Phase 5A.1 deterministic compliance replay hardening enums
export type ReplayAssertionTypeEnum           = 'hash_match' | 'determinism_check' | 'replay_valid';
export type ReplayAssertionStatusEnum         = 'passed' | 'failed' | 'inconclusive';
export type CanonicalizationProfileTypeEnum   = 'json' | 'xml' | 'decimal' | 'composite';
export type AgiSubmissionStatusEnum         = 'draft' | 'pending' | 'submitted' | 'accepted' | 'rejected' | 'corrected';
export type AgiCorrectionReasonEnum         = 'employee_addition' | 'employee_deletion' | 'amount_correction' | 'period_correction' | 'other';
export type VatDeclarationStatusEnum        = 'draft' | 'pending' | 'submitted' | 'accepted' | 'rejected' | 'corrected';
export type VatCorrectionTypeEnum           = 'supplementary' | 'amendment' | 'cancellation';
export type FilingEntityTypeEnum            = 'agi_submission' | 'vat_declaration' | 'saf_t_export' | 'regulatory_audit_export';
export type FilingCertificationStatusEnum   = 'pending' | 'certified' | 'revoked';
export type SaftExportStatusEnum            = 'generating' | 'ready' | 'submitted' | 'archived';
export type SaftExportScopeEnum             = 'full' | 'gl' | 'ar' | 'ap' | 'fixed_assets';
export type RetentionPolicyTypeEnum         = 'accounting_records' | 'invoices' | 'bank_statements' | 'payroll_records' | 'tax_declarations' | 'vat_records' | 'employee_records' | 'contracts';
export type RetentionEnforcementOutcomeEnum = 'compliant' | 'violation' | 'warning' | 'pending_review';

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
          lesson_type_id:       string | null;
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
          lesson_type_id?:       string | null;
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
          lesson_type_id:       string | null;
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
          lesson_type_id?:        string | null;
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
          id:                  string;
          organization_id:     string;
          name:                string;
          period_start:        string;
          period_end:          string;
          status:              FinancialPeriodStatusEnum;
          closed_at:           string | null;
          closed_by:           string | null;
          locked_at:           string | null;
          locked_by:           string | null;
          notes:               string | null;
          metadata:            Json;
          created_at:          string;
          updated_at:          string;
          created_by:          string | null;
          // Phase 4E columns
          amendment_count:     number;
          close_validated_at:  string | null;
          close_validated_by:  string | null;
          fiscal_year_id:      string | null;
          is_year_end_period:  boolean;
        };
        Insert: {
          id?:                  string;
          organization_id:      string;
          name:                 string;
          period_start:         string;
          period_end:           string;
          status?:              FinancialPeriodStatusEnum;
          closed_at?:           string | null;
          closed_by?:           string | null;
          locked_at?:           string | null;
          locked_by?:           string | null;
          notes?:               string | null;
          metadata?:            Json;
          created_at?:          string;
          updated_at?:          string;
          created_by?:          string | null;
          // Phase 4E columns
          amendment_count?:     number;
          close_validated_at?:  string | null;
          close_validated_by?:  string | null;
          fiscal_year_id?:      string | null;
          is_year_end_period?:  boolean;
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

      // ── Phase 4B.1: Refunds + Payment Allocations ────────────────────────────

      refunds: {
        Row: {
          id:               string;
          organization_id:  string;
          invoice_id:       string;
          payment_id:       string | null;
          student_id:       string;
          refund_type:      RefundTypeEnum;
          refund_status:    RefundStatusEnum;
          reason_code:      RefundReasonCodeEnum;
          refund_amount:    number;
          credit_quantity:  number;
          credit_category:  string | null;
          credit_ledger_id: string | null;
          notes:            string | null;
          processed_at:     string | null;
          processed_by:     string | null;
          failed_reason:    string | null;
          metadata:         Json;
          created_at:       string;
          created_by:       string | null;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          invoice_id:       string;
          payment_id?:      string | null;
          student_id:       string;
          refund_type:      RefundTypeEnum;
          refund_status?:   RefundStatusEnum;
          reason_code:      RefundReasonCodeEnum;
          refund_amount?:   number;
          credit_quantity?: number;
          credit_category?: string | null;
          credit_ledger_id?: string | null;
          notes?:           string | null;
          processed_at?:    string | null;
          processed_by?:    string | null;
          failed_reason?:   string | null;
          metadata?:        Json;
          created_at?:      string;
          created_by?:      string | null;
        };
        Update: Partial<Database['public']['Tables']['refunds']['Insert']>;
      };

      payment_allocations: {
        Row: {
          id:               string;
          organization_id:  string;
          payment_id:       string;
          invoice_id:       string;
          allocated_amount: number;
          notes:            string | null;
          created_at:       string;
          created_by:       string | null;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          payment_id:       string;
          invoice_id:       string;
          allocated_amount: number;
          notes?:           string | null;
          created_at?:      string;
          created_by?:      string | null;
        };
        Update: Partial<Database['public']['Tables']['payment_allocations']['Insert']>;
      };

      // ── Phase 4B.2: Discounts + Coupons ─────────────────────────────────────

      discount_definitions: {
        Row: {
          id:                  string;
          organization_id:     string;
          name:                string;
          description:         string | null;
          discount_type:       DiscountTypeEnum;
          discount_scope:      DiscountScopeEnum;
          scope_reference_id:  string | null;
          scope_category:      string | null;
          discount_value:      number;
          max_discount_amount: number | null;
          currency:            string;
          valid_from:          string | null;
          valid_to:            string | null;
          is_active:           boolean;
          requires_coupon:     boolean;
          metadata:            Json;
          created_at:          string;
          updated_at:          string;
          created_by:          string | null;
          updated_by:          string | null;
        };
        Insert: {
          id?:                  string;
          organization_id:      string;
          name:                 string;
          description?:         string | null;
          discount_type:        DiscountTypeEnum;
          discount_scope?:      DiscountScopeEnum;
          scope_reference_id?:  string | null;
          scope_category?:      string | null;
          discount_value:       number;
          max_discount_amount?: number | null;
          currency?:            string;
          valid_from?:          string | null;
          valid_to?:            string | null;
          is_active?:           boolean;
          requires_coupon?:     boolean;
          metadata?:            Json;
          created_at?:          string;
          updated_at?:          string;
          created_by?:          string | null;
          updated_by?:          string | null;
        };
        Update: Partial<Database['public']['Tables']['discount_definitions']['Insert']>;
      };

      coupon_codes: {
        Row: {
          id:                           string;
          organization_id:              string;
          discount_id:                  string;
          code:                         string;
          description:                  string | null;
          redemption_limit_total:       number | null;
          redemption_limit_per_student: number | null;
          redemptions_count:            number;
          valid_from:                   string | null;
          valid_to:                     string | null;
          is_active:                    boolean;
          metadata:                     Json;
          created_at:                   string;
          updated_at:                   string;
          created_by:                   string | null;
        };
        Insert: {
          id?:                            string;
          organization_id:                string;
          discount_id:                    string;
          code:                           string;
          description?:                   string | null;
          redemption_limit_total?:        number | null;
          redemption_limit_per_student?:  number | null;
          redemptions_count?:             number;
          valid_from?:                    string | null;
          valid_to?:                      string | null;
          is_active?:                     boolean;
          metadata?:                      Json;
          created_at?:                    string;
          updated_at?:                    string;
          created_by?:                    string | null;
        };
        Update: Partial<Database['public']['Tables']['coupon_codes']['Insert']>;
      };

      discount_applications: {
        Row: {
          id:                   string;
          organization_id:      string;
          invoice_id:           string;
          invoice_line_item_id: string;
          discount_id:          string;
          coupon_id:            string | null;
          student_id:           string;
          original_subtotal:    number;
          discount_amount:      number;
          applied_at:           string;
          applied_by:           string | null;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          invoice_id:            string;
          invoice_line_item_id:  string;
          discount_id:           string;
          coupon_id?:            string | null;
          student_id:            string;
          original_subtotal:     number;
          discount_amount:       number;
          applied_at?:           string;
          applied_by?:           string | null;
        };
        Update: Partial<Database['public']['Tables']['discount_applications']['Insert']>;
      };

      // ── Phase 4B.3: Dunning ──────────────────────────────────────────────────

      dunning_schedules: {
        Row: {
          id:               string;
          organization_id:  string;
          name:             string;
          description:      string | null;
          is_default:       boolean;
          is_active:        boolean;
          metadata:         Json;
          created_at:       string;
          updated_at:       string;
          created_by:       string | null;
          updated_by:       string | null;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          name:             string;
          description?:     string | null;
          is_default?:      boolean;
          is_active?:       boolean;
          metadata?:        Json;
          created_at?:      string;
          updated_at?:      string;
          created_by?:      string | null;
          updated_by?:      string | null;
        };
        Update: Partial<Database['public']['Tables']['dunning_schedules']['Insert']>;
      };

      dunning_schedule_stages: {
        Row: {
          id:               string;
          schedule_id:      string;
          stage_number:     number;
          days_overdue:     number;
          action_type:      DunningActionTypeEnum;
          subject_template: string | null;
          message_template: string | null;
          late_fee_amount:  number;
          suspend_access:   boolean;
          is_final_stage:   boolean;
          metadata:         Json;
          created_at:       string;
          updated_at:       string;
        };
        Insert: {
          id?:               string;
          schedule_id:       string;
          stage_number:      number;
          days_overdue:      number;
          action_type:       DunningActionTypeEnum;
          subject_template?: string | null;
          message_template?: string | null;
          late_fee_amount?:  number;
          suspend_access?:   boolean;
          is_final_stage?:   boolean;
          metadata?:         Json;
          created_at?:       string;
          updated_at?:       string;
        };
        Update: Partial<Database['public']['Tables']['dunning_schedule_stages']['Insert']>;
      };

      invoice_dunning_state: {
        Row: {
          id:                   string;
          organization_id:      string;
          invoice_id:           string;
          schedule_id:          string | null;
          current_stage_number: number;
          current_stage_id:     string | null;
          next_action_at:       string | null;
          last_actioned_at:     string | null;
          is_resolved:          boolean;
          is_escalated_legal:   boolean;
          notes:                string | null;
          created_at:           string;
          updated_at:           string;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          invoice_id:            string;
          schedule_id?:          string | null;
          current_stage_number?: number;
          current_stage_id?:     string | null;
          next_action_at?:       string | null;
          last_actioned_at?:     string | null;
          is_resolved?:          boolean;
          is_escalated_legal?:   boolean;
          notes?:                string | null;
          created_at?:           string;
          updated_at?:           string;
        };
        Update: Partial<Database['public']['Tables']['invoice_dunning_state']['Insert']>;
      };

      invoice_reminder_log: {
        Row: {
          id:               string;
          organization_id:  string;
          invoice_id:       string;
          student_id:       string;
          stage_id:         string | null;
          stage_number:     number | null;
          action_type:      DunningActionTypeEnum;
          sent_at:          string;
          sent_by:          string | null;
          is_automated:     boolean;
          notes:            string | null;
          created_at:       string;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          invoice_id:       string;
          student_id:       string;
          stage_id?:        string | null;
          stage_number?:    number | null;
          action_type:      DunningActionTypeEnum;
          sent_at?:         string;
          sent_by?:         string | null;
          is_automated?:    boolean;
          notes?:           string | null;
          created_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['invoice_reminder_log']['Insert']>;
      };

      // ── Phase 4B.4: Accounting exports ──────────────────────────────────────

      accounting_chart_of_accounts: {
        Row: {
          id:                      string;
          organization_id:         string;
          event_type:              string;
          account_debit:           string;
          account_credit:          string;
          description:             string | null;
          is_active:               boolean;
          metadata:                Json;
          created_at:              string;
          updated_at:              string;
          created_by:              string | null;
          // Phase 4C BAS columns
          bas_account_debit_id:    string | null;
          bas_account_credit_id:   string | null;
          vat_rate_code:           string | null;
        };
        Insert: {
          id?:                      string;
          organization_id:          string;
          event_type:               string;
          account_debit:            string;
          account_credit:           string;
          description?:             string | null;
          is_active?:               boolean;
          metadata?:                Json;
          created_at?:              string;
          updated_at?:              string;
          created_by?:              string | null;
          bas_account_debit_id?:    string | null;
          bas_account_credit_id?:   string | null;
          vat_rate_code?:           string | null;
        };
        Update: Partial<Database['public']['Tables']['accounting_chart_of_accounts']['Insert']>;
      };

      // ── Phase 4C: Swedish Finance Tables ────────────────────────────────────

      bas_account_catalog: {
        Row: {
          id:              string;
          account_code:    string;
          account_name:    string;
          account_name_en: string | null;
          account_type:    string;
          normal_balance:  string;
          vat_code:        string | null;
          parent_code:     string | null;
          is_active:       boolean;
          sort_order:      number;
          created_at:      string;
        };
        Insert: {
          id?:              string;
          account_code:     string;
          account_name:     string;
          account_name_en?: string | null;
          account_type:     string;
          normal_balance:   string;
          vat_code?:        string | null;
          parent_code?:     string | null;
          is_active?:       boolean;
          sort_order?:      number;
          created_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['bas_account_catalog']['Insert']>;
      };

      vat_rates: {
        Row: {
          id:             string;
          rate_code:      string;
          rate_percent:   number;
          description:    string;
          description_en: string | null;
          is_standard:    boolean;
          effective_from: string;
          effective_to:   string | null;
          created_at:     string;
        };
        Insert: {
          id?:             string;
          rate_code:       string;
          rate_percent:    number;
          description:     string;
          description_en?: string | null;
          is_standard?:    boolean;
          effective_from:  string;
          effective_to?:   string | null;
          created_at?:     string;
        };
        Update: Partial<Database['public']['Tables']['vat_rates']['Insert']>;
      };

      platform_bas_event_mappings: {
        Row: {
          id:             string;
          event_type:     string;
          account_debit:  string;
          account_credit: string;
          vat_rate_code:  string | null;
          description:    string | null;
          is_active:      boolean;
          created_at:     string;
        };
        Insert: {
          id?:             string;
          event_type:      string;
          account_debit:   string;
          account_credit:  string;
          vat_rate_code?:  string | null;
          description?:    string | null;
          is_active?:      boolean;
          created_at?:     string;
        };
        Update: Partial<Database['public']['Tables']['platform_bas_event_mappings']['Insert']>;
      };

      vat_periods: {
        Row: {
          id:               string;
          organization_id:  string;
          period_start:     string;
          period_end:       string;
          frequency:        VatPeriodFrequencyEnum;
          status:           VatPeriodStatusEnum;
          filing_reference: string | null;
          filed_at:         string | null;
          filed_by:         string | null;
          locked_at:        string | null;
          locked_by:        string | null;
          total_output_vat: number;
          total_input_vat:  number;
          net_vat_payable:  number;
          notes:            string | null;
          metadata:         Json;
          created_at:       string;
          updated_at:       string;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          period_start:      string;
          period_end:        string;
          frequency?:        VatPeriodFrequencyEnum;
          status?:           VatPeriodStatusEnum;
          filing_reference?: string | null;
          filed_at?:         string | null;
          filed_by?:         string | null;
          locked_at?:        string | null;
          locked_by?:        string | null;
          total_output_vat?: number;
          total_input_vat?:  number;
          net_vat_payable?:  number;
          notes?:            string | null;
          metadata?:         Json;
          created_at?:       string;
          updated_at?:       string;
        };
        Update: Partial<Database['public']['Tables']['vat_periods']['Insert']>;
      };

      vat_report_entries: {
        Row: {
          id:               string;
          organization_id:  string;
          vat_period_id:    string;
          invoice_id:       string | null;
          transaction_date: string;
          vat_rate_code:    string | null;
          net_amount:       number;
          vat_amount:       number;
          gross_amount:     number;
          bas_account:      string;
          vat_account:      string | null;
          description:      string | null;
          source_type:      string;
          source_id:        string;
          created_at:       string;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          vat_period_id:     string;
          invoice_id?:       string | null;
          transaction_date:  string;
          vat_rate_code?:    string | null;
          net_amount:        number;
          vat_amount:        number;
          gross_amount:      number;
          bas_account:       string;
          vat_account?:      string | null;
          description?:      string | null;
          source_type:       string;
          source_id:         string;
          created_at?:       string;
        };
        Update: Partial<Database['public']['Tables']['vat_report_entries']['Insert']>;
      };

      organization_swedish_settings: {
        Row: {
          id:                      string;
          organization_id:         string;
          org_number:              string | null;
          vat_reg_number:          string | null;
          f_tax_registered:        boolean;
          bankgiro_number:         string | null;
          plusgiro_number:         string | null;
          invoice_payment_days:    number;
          reminder_fee_amount:     number;
          late_interest_rate:      number;
          sie4_company_name:       string | null;
          sie4_fiscal_year_start:  string | null;
          invoice_footer_text:     string | null;
          invoice_header_logo_url: string | null;
          is_active:               boolean;
          created_at:              string;
          updated_at:              string;
        };
        Insert: {
          id?:                      string;
          organization_id:          string;
          org_number?:              string | null;
          vat_reg_number?:          string | null;
          f_tax_registered?:        boolean;
          bankgiro_number?:         string | null;
          plusgiro_number?:         string | null;
          invoice_payment_days?:    number;
          reminder_fee_amount?:     number;
          late_interest_rate?:      number;
          sie4_company_name?:       string | null;
          sie4_fiscal_year_start?:  string | null;
          invoice_footer_text?:     string | null;
          invoice_header_logo_url?: string | null;
          is_active?:               boolean;
          created_at?:              string;
          updated_at?:              string;
        };
        Update: Partial<Database['public']['Tables']['organization_swedish_settings']['Insert']>;
      };

      invoice_ocr_references: {
        Row: {
          id:               string;
          organization_id:  string;
          invoice_id:       string;
          ocr_reference:    string;
          payment_ref_full: string;
          created_at:       string;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          invoice_id:       string;
          ocr_reference:    string;
          payment_ref_full: string;
          created_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['invoice_ocr_references']['Insert']>;
      };

      sie4_exports: {
        Row: {
          id:                string;
          organization_id:   string;
          export_run_id:     string;
          content_text:      string;
          content_hash:      string;
          voucher_count:     number;
          transaction_count: number;
          from_date:         string;
          to_date:           string;
          fiscal_year_start: string | null;
          generated_at:      string;
          generated_by:      string | null;
        };
        Insert: {
          id?:                string;
          organization_id:    string;
          export_run_id:      string;
          content_text:       string;
          content_hash:       string;
          voucher_count?:     number;
          transaction_count?: number;
          from_date:          string;
          to_date:            string;
          fiscal_year_start?: string | null;
          generated_at?:      string;
          generated_by?:      string | null;
        };
        Update: Partial<Database['public']['Tables']['sie4_exports']['Insert']>;
      };

      fortnox_customer_sync: {
        Row: {
          id:                       string;
          organization_id:          string;
          student_id:               string;
          fortnox_customer_number:  string | null;
          sync_status:              FortnoxSyncStatusEnum;
          last_synced_at:           string | null;
          last_sync_attempt_at:     string | null;
          sync_error:               string | null;
          retry_count:              number;
          local_hash:               string | null;
          fortnox_data:             Json;
          created_at:               string;
          updated_at:               string;
        };
        Insert: {
          id?:                       string;
          organization_id:           string;
          student_id:                string;
          fortnox_customer_number?:  string | null;
          sync_status?:              FortnoxSyncStatusEnum;
          last_synced_at?:           string | null;
          last_sync_attempt_at?:     string | null;
          sync_error?:               string | null;
          retry_count?:              number;
          local_hash?:               string | null;
          fortnox_data?:             Json;
          created_at?:               string;
          updated_at?:               string;
        };
        Update: Partial<Database['public']['Tables']['fortnox_customer_sync']['Insert']>;
      };

      fortnox_invoice_sync: {
        Row: {
          id:                       string;
          organization_id:          string;
          invoice_id:               string;
          fortnox_invoice_number:   string | null;
          fortnox_document_number:  string | null;
          sync_status:              FortnoxSyncStatusEnum;
          last_synced_at:           string | null;
          last_sync_attempt_at:     string | null;
          sync_error:               string | null;
          retry_count:              number;
          local_hash:               string | null;
          fortnox_data:             Json;
          created_at:               string;
          updated_at:               string;
        };
        Insert: {
          id?:                       string;
          organization_id:           string;
          invoice_id:                string;
          fortnox_invoice_number?:   string | null;
          fortnox_document_number?:  string | null;
          sync_status?:              FortnoxSyncStatusEnum;
          last_synced_at?:           string | null;
          last_sync_attempt_at?:     string | null;
          sync_error?:               string | null;
          retry_count?:              number;
          local_hash?:               string | null;
          fortnox_data?:             Json;
          created_at?:               string;
          updated_at?:               string;
        };
        Update: Partial<Database['public']['Tables']['fortnox_invoice_sync']['Insert']>;
      };

      fortnox_payment_sync: {
        Row: {
          id:                   string;
          organization_id:      string;
          payment_id:           string;
          fortnox_voucher_id:   string | null;
          fortnox_payment_ref:  string | null;
          sync_status:          FortnoxSyncStatusEnum;
          last_synced_at:       string | null;
          last_sync_attempt_at: string | null;
          sync_error:           string | null;
          retry_count:          number;
          local_hash:           string | null;
          fortnox_data:         Json;
          created_at:           string;
          updated_at:           string;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          payment_id:            string;
          fortnox_voucher_id?:   string | null;
          fortnox_payment_ref?:  string | null;
          sync_status?:          FortnoxSyncStatusEnum;
          last_synced_at?:       string | null;
          last_sync_attempt_at?: string | null;
          sync_error?:           string | null;
          retry_count?:          number;
          local_hash?:           string | null;
          fortnox_data?:         Json;
          created_at?:           string;
          updated_at?:           string;
        };
        Update: Partial<Database['public']['Tables']['fortnox_payment_sync']['Insert']>;
      };

      fortnox_export_lineage: {
        Row: {
          id:               string;
          organization_id:  string;
          export_run_id:    string;
          fortnox_batch_id: string | null;
          sync_status:      FortnoxSyncStatusEnum;
          entries_total:    number;
          entries_synced:   number;
          entries_failed:   number;
          exported_at:      string | null;
          exported_by:      string | null;
          sync_error:       string | null;
          fortnox_data:     Json;
          created_at:       string;
          updated_at:       string;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          export_run_id:     string;
          fortnox_batch_id?: string | null;
          sync_status?:      FortnoxSyncStatusEnum;
          entries_total?:    number;
          entries_synced?:   number;
          entries_failed?:   number;
          exported_at?:      string | null;
          exported_by?:      string | null;
          sync_error?:       string | null;
          fortnox_data?:     Json;
          created_at?:       string;
          updated_at?:       string;
        };
        Update: Partial<Database['public']['Tables']['fortnox_export_lineage']['Insert']>;
      };

      accounting_export_runs: {
        Row: {
          id:               string;
          organization_id:  string;
          format:           AccountingExportFormatEnum;
          from_date:        string;
          to_date:          string;
          status:           string;
          item_count:       number;
          file_reference:   string | null;
          error_message:    string | null;
          started_at:       string;
          completed_at:     string | null;
          created_by:       string | null;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          format:           AccountingExportFormatEnum;
          from_date:        string;
          to_date:          string;
          status?:          string;
          item_count?:      number;
          file_reference?:  string | null;
          error_message?:   string | null;
          started_at?:      string;
          completed_at?:    string | null;
          created_by?:      string | null;
        };
        Update: Partial<Database['public']['Tables']['accounting_export_runs']['Insert']>;
      };

      accounting_export_queue: {
        Row: {
          id:               string;
          organization_id:  string;
          event_type:       string;
          event_data:       Json;
          amount:           number | null;
          currency:         string;
          transaction_date: string;
          account_debit:    string | null;
          account_credit:   string | null;
          exported_at:      string | null;
          export_run_id:    string | null;
          created_at:       string;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          event_type:        string;
          event_data?:       Json;
          amount?:           number | null;
          currency?:         string;
          transaction_date?: string;
          account_debit?:    string | null;
          account_credit?:   string | null;
          exported_at?:      string | null;
          export_run_id?:    string | null;
          created_at?:       string;
        };
        Update: Partial<Database['public']['Tables']['accounting_export_queue']['Insert']>;
      };

      // ── Phase 4B.7: Accounting export entries (immutable snapshot) ───────────

      accounting_export_entries: {
        Row: {
          id:                   string;
          organization_id:      string;
          export_run_id:        string;
          sequence_number:      number;
          transaction_date:     string;
          account_debit:        string;
          account_credit:       string;
          debit_amount:         number;
          credit_amount:        number;
          description:          string;
          source_event_type:    string;
          source_queue_item_id: string | null;
          metadata:             Json;
          created_at:           string;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          export_run_id:         string;
          sequence_number:       number;
          transaction_date:      string;
          account_debit:         string;
          account_credit:        string;
          debit_amount:          number;
          credit_amount:         number;
          description?:          string;
          source_event_type:     string;
          source_queue_item_id?: string | null;
          metadata?:             Json;
          created_at?:           string;
        };
        Update: Partial<Database['public']['Tables']['accounting_export_entries']['Insert']>;
      };

      // ── Phase 4D: Double-entry ledger tables ─────────────────────────────────

      ledger_voucher_sequences: {
        Row: {
          id:              string;
          organization_id: string;
          fiscal_year:     number;
          voucher_series:  string;
          last_number:     number;
          created_at:      string;
          updated_at:      string;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          fiscal_year:      number;
          voucher_series:   string;
          last_number?:     number;
          created_at?:      string;
          updated_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['ledger_voucher_sequences']['Insert']>;
      };

      journal_entries: {
        Row: {
          id:                      string;
          organization_id:         string;
          financial_period_id:     string | null;
          entry_type:              JournalEntryTypeEnum;
          status:                  JournalEntryStatusEnum;
          voucher_series:          string;
          voucher_number:          number | null;
          entry_date:              string;
          description:             string;
          source_event_type:       string | null;
          source_entity_type:      string | null;
          source_entity_id:        string | null;
          reversal_of_entry_id:    string | null;
          correction_of_entry_id:  string | null;
          total_debit:             number;
          total_credit:            number;
          posted_at:               string | null;
          posted_by:               string | null;
          notes:                   string | null;
          metadata:                Json;
          created_at:              string;
          created_by:              string | null;
        };
        Insert: {
          id?:                      string;
          organization_id:          string;
          financial_period_id?:     string | null;
          entry_type?:              JournalEntryTypeEnum;
          status?:                  JournalEntryStatusEnum;
          voucher_series?:          string;
          voucher_number?:          number | null;
          entry_date:               string;
          description?:             string;
          source_event_type?:       string | null;
          source_entity_type?:      string | null;
          source_entity_id?:        string | null;
          reversal_of_entry_id?:    string | null;
          correction_of_entry_id?:  string | null;
          total_debit?:             number;
          total_credit?:            number;
          posted_at?:               string | null;
          posted_by?:               string | null;
          notes?:                   string | null;
          metadata?:                Json;
          created_by?:              string | null;
        };
        Update: never; // Immutable
      };

      journal_lines: {
        Row: {
          id:               string;
          organization_id:  string;
          entry_id:         string;
          line_number:      number;
          account_code:     string;
          debit_amount:     number;
          credit_amount:    number;
          vat_rate_code:    string | null;
          vat_amount:       number | null;
          description:      string;
          metadata:         Json;
          created_at:       string;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          entry_id:         string;
          line_number:      number;
          account_code:     string;
          debit_amount?:    number;
          credit_amount?:   number;
          vat_rate_code?:   string | null;
          vat_amount?:      number | null;
          description?:     string;
          metadata?:        Json;
        };
        Update: never; // Immutable
      };

      account_balances: {
        Row: {
          id:                  string;
          organization_id:     string;
          financial_period_id: string;
          account_code:        string;
          opening_balance:     number;
          debit_movement:      number;
          credit_movement:     number;
          closing_balance:     number;
          transaction_count:   number;
          last_entry_id:       string | null;
          updated_at:          string;
        };
        Insert: {
          id?:                  string;
          organization_id:      string;
          financial_period_id:  string;
          account_code:         string;
          opening_balance?:     number;
          debit_movement?:      number;
          credit_movement?:     number;
          closing_balance?:     number;
          transaction_count?:   number;
          last_entry_id?:       string | null;
        };
        Update: Partial<Database['public']['Tables']['account_balances']['Insert']>;
      };

      deferred_revenue_schedules: {
        Row: {
          id:                    string;
          organization_id:       string;
          invoice_id:            string;
          student_package_id:    string;
          total_lessons:         number;
          recognized_lessons:    number;
          total_deferred_net:    number;
          recognized_amount_net: number;
          per_lesson_amount_net: number;
          deferral_account:      string;
          recognition_account:   string;
          initial_journal_id:    string | null;
          is_fully_recognized:   boolean;
          notes:                 string | null;
          created_at:            string;
          updated_at:            string;
          created_by:            string | null;
        };
        Insert: {
          id?:                    string;
          organization_id:        string;
          invoice_id:             string;
          student_package_id:     string;
          total_lessons:          number;
          recognized_lessons?:    number;
          total_deferred_net:     number;
          recognized_amount_net?: number;
          per_lesson_amount_net:  number;
          deferral_account?:      string;
          recognition_account?:   string;
          initial_journal_id?:    string | null;
          is_fully_recognized?:   boolean;
          notes?:                 string | null;
          created_by?:            string | null;
        };
        Update: Partial<Database['public']['Tables']['deferred_revenue_schedules']['Insert']>;
      };

      revenue_recognition_events: {
        Row: {
          id:                 string;
          organization_id:    string;
          schedule_id:        string;
          booking_id:         string | null;
          recognition_date:   string;
          lessons_recognized: number;
          amount_net:         number;
          journal_entry_id:   string | null;
          notes:              string | null;
          created_at:         string;
          created_by:         string | null;
        };
        Insert: {
          id?:                 string;
          organization_id:     string;
          schedule_id:         string;
          booking_id?:         string | null;
          recognition_date:    string;
          lessons_recognized?: number;
          amount_net:          number;
          journal_entry_id?:   string | null;
          notes?:              string | null;
          created_by?:         string | null;
        };
        Update: never; // Append-only
      };

      ledger_sie4_exports: {
        Row: {
          id:                  string;
          organization_id:     string;
          financial_period_id: string;
          from_date:           string;
          to_date:             string;
          content_text:        string;
          content_hash:        string;
          entry_count:         number;
          account_count:       number;
          generated_at:        string;
          generated_by:        string | null;
          metadata:            Json;
        };
        Insert: {
          id?:                  string;
          organization_id:      string;
          financial_period_id:  string;
          from_date:            string;
          to_date:              string;
          content_text:         string;
          content_hash:         string;
          entry_count?:         number;
          account_count?:       number;
          generated_at?:        string;
          generated_by?:        string | null;
          metadata?:            Json;
        };
        Update: never; // Immutable
      };

      // ── Phase 4E: Reconciliation & Financial Close ───────────────────────────

      bank_statement_imports: {
        Row: {
          id:                  string;
          organization_id:     string;
          bank_account_number: string;
          bank_name:           string | null;
          statement_date:      string;
          period_start:        string;
          period_end:          string;
          opening_balance:     number;
          closing_balance:     number;
          currency:            string;
          total_lines:         number;
          status:              BankStatementStatusEnum;
          file_reference:      string | null;
          imported_by:         string | null;
          imported_at:         string;
          confirmed_at:        string | null;
          confirmed_by:        string | null;
          notes:               string | null;
          metadata:            Json;
          created_at:          string;
          updated_at:          string;
        };
        Insert: {
          id?:                  string;
          organization_id:      string;
          bank_account_number:  string;
          bank_name?:           string | null;
          statement_date:       string;
          period_start:         string;
          period_end:           string;
          opening_balance?:     number;
          closing_balance?:     number;
          currency?:            string;
          total_lines?:         number;
          status?:              BankStatementStatusEnum;
          file_reference?:      string | null;
          imported_by?:         string | null;
          imported_at?:         string;
          confirmed_at?:        string | null;
          confirmed_by?:        string | null;
          notes?:               string | null;
          metadata?:            Json;
          created_at?:          string;
          updated_at?:          string;
        };
        Update: Partial<Database['public']['Tables']['bank_statement_imports']['Insert']>;
      };

      bank_statement_lines: {
        Row: {
          id:                  string;
          organization_id:     string;
          import_id:           string;
          line_number:         number;
          transaction_date:    string;
          value_date:          string | null;
          amount:              number;
          balance_after:       number | null;
          reference:           string | null;
          description:         string;
          counterpart_name:    string | null;
          counterpart_account: string | null;
          status:              BankLineStatusEnum;
          payment_id:          string | null;
          matched_at:          string | null;
          matched_by:          string | null;
          match_method:        'automatic' | 'manual' | null;
          match_notes:         string | null;
          metadata:            Json;
          created_at:          string;
          updated_at:          string;
        };
        Insert: {
          id?:                  string;
          organization_id:      string;
          import_id:            string;
          line_number:          number;
          transaction_date:     string;
          value_date?:          string | null;
          amount:               number;
          balance_after?:       number | null;
          reference?:           string | null;
          description?:         string;
          counterpart_name?:    string | null;
          counterpart_account?: string | null;
          status?:              BankLineStatusEnum;
          payment_id?:          string | null;
          matched_at?:          string | null;
          matched_by?:          string | null;
          match_method?:        'automatic' | 'manual' | null;
          match_notes?:         string | null;
          metadata?:            Json;
          created_at?:          string;
          updated_at?:          string;
        };
        Update: Partial<Database['public']['Tables']['bank_statement_lines']['Insert']>;
      };

      reconciliation_runs: {
        Row: {
          id:                       string;
          organization_id:          string;
          financial_period_id:      string | null;
          reconciliation_type:      ReconciliationTypeEnum;
          status:                   ReconciliationRunStatusEnum;
          bank_statement_import_id: string | null;
          total_items:              number;
          matched_items:            number;
          unmatched_items:          number;
          exception_items:          number;
          result_summary:           Json;
          is_reconciled:            boolean;
          variance_amount:          number | null;
          started_at:               string;
          completed_at:             string | null;
          actor_id:                 string | null;
          notes:                    string | null;
          metadata:                 Json;
          created_at:               string;
          updated_at:               string;
        };
        Insert: {
          id?:                       string;
          organization_id:           string;
          financial_period_id?:      string | null;
          reconciliation_type:       ReconciliationTypeEnum;
          status?:                   ReconciliationRunStatusEnum;
          bank_statement_import_id?: string | null;
          total_items?:              number;
          matched_items?:            number;
          unmatched_items?:          number;
          exception_items?:          number;
          result_summary?:           Json;
          is_reconciled?:            boolean;
          variance_amount?:          number | null;
          started_at?:               string;
          completed_at?:             string | null;
          actor_id?:                 string | null;
          notes?:                    string | null;
          metadata?:                 Json;
          created_at?:               string;
          updated_at?:               string;
        };
        Update: Partial<Database['public']['Tables']['reconciliation_runs']['Insert']>;
      };

      reconciliation_items: {
        Row: {
          id:                   string;
          organization_id:      string;
          run_id:               string;
          ledger_entity_type:   string;
          ledger_entity_id:     string;
          external_entity_type: string | null;
          external_entity_id:   string | null;
          external_reference:   string | null;
          ledger_amount:        number;
          external_amount:      number | null;
          variance:             number | null;
          status:               ReconciliationItemStatusEnum;
          match_method:         'automatic' | 'manual' | null;
          matched_at:           string;
          matched_by:           string | null;
          notes:                string | null;
          metadata:             Json;
          created_at:           string;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          run_id:                string;
          ledger_entity_type:    string;
          ledger_entity_id:      string;
          external_entity_type?: string | null;
          external_entity_id?:   string | null;
          external_reference?:   string | null;
          ledger_amount:         number;
          external_amount?:      number | null;
          variance?:             number | null;
          status?:               ReconciliationItemStatusEnum;
          match_method?:         'automatic' | 'manual' | null;
          matched_at?:           string;
          matched_by?:           string | null;
          notes?:                string | null;
          metadata?:             Json;
          created_at?:           string;
        };
        Update: Partial<Database['public']['Tables']['reconciliation_items']['Insert']>;
      };

      fiscal_years: {
        Row: {
          id:                          string;
          organization_id:             string;
          year_number:                 number;
          year_start:                  string;
          year_end:                    string;
          status:                      'open' | 'closing' | 'closed';
          retained_earnings_entry_id:  string | null;
          closed_at:                   string | null;
          closed_by:                   string | null;
          notes:                       string | null;
          metadata:                    Json;
          created_at:                  string;
          updated_at:                  string;
          created_by:                  string | null;
        };
        Insert: {
          id?:                           string;
          organization_id:               string;
          year_number:                   number;
          year_start:                    string;
          year_end:                      string;
          status?:                       'open' | 'closing' | 'closed';
          retained_earnings_entry_id?:   string | null;
          closed_at?:                    string | null;
          closed_by?:                    string | null;
          notes?:                        string | null;
          metadata?:                     Json;
          created_at?:                   string;
          updated_at?:                   string;
          created_by?:                   string | null;
        };
        Update: Partial<Database['public']['Tables']['fiscal_years']['Insert']>;
      };

      period_audit_snapshots: {
        Row: {
          id:                   string;
          organization_id:      string;
          financial_period_id:  string;
          snapshot_type:        'soft_close' | 'hard_close' | 'year_end' | 'manual';
          snapshot_data:        Json;
          trial_balance_debit:  number;
          trial_balance_credit: number;
          is_balanced:          boolean;
          account_count:        number;
          content_hash:         string;
          captured_at:          string;
          captured_by:          string | null;
          notes:                string | null;
          metadata:             Json;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          financial_period_id:   string;
          snapshot_type:         'soft_close' | 'hard_close' | 'year_end' | 'manual';
          snapshot_data:         Json;
          trial_balance_debit?:  number;
          trial_balance_credit?: number;
          is_balanced?:          boolean;
          account_count?:        number;
          content_hash:          string;
          captured_at?:          string;
          captured_by?:          string | null;
          notes?:                string | null;
          metadata?:             Json;
        };
        Update: never; // Immutable — prevented by trigger
      };

      ledger_consistency_checks: {
        Row: {
          id:                   string;
          organization_id:      string;
          financial_period_id:  string | null;
          check_type:           'pre_close' | 'post_close' | 'periodic' | 'manual';
          passed:               boolean;
          total_checks:         number;
          passed_checks:        number;
          failed_checks:        number;
          results:              Json;
          run_duration_ms:      number | null;
          actor_id:             string | null;
          created_at:           string;
        };
        Insert: never; // Written only by run_ledger_consistency_check()
        Update: never; // Append-only
      };

      // ── Phase 4F: Payroll & Regulatory Accounting ────────────────────────────

      payroll_bas_rules: {
        Row: {
          id:               string;
          organization_id:  string | null;
          event_type:       string;
          debit_account:    string | null;
          credit_account:   string | null;
          description:      string | null;
          is_active:        boolean;
          sort_order:       number;
          created_at:       string;
        };
        Insert: {
          id?:              string;
          organization_id?: string | null;
          event_type:       string;
          debit_account?:   string | null;
          credit_account?:  string | null;
          description?:     string | null;
          is_active?:       boolean;
          sort_order?:      number;
          created_at?:      string;
        };
        Update: Partial<Database['public']['Tables']['payroll_bas_rules']['Insert']>;
      };

      payroll_runs: {
        Row: {
          id:                      string;
          organization_id:         string;
          financial_period_id:     string | null;
          run_type:                PayrollRunTypeEnum;
          pay_period_start:        string;
          pay_period_end:          string;
          pay_date:                string;
          status:                  PayrollRunStatusEnum;
          total_gross:             number;
          total_withheld_tax:      number;
          total_employer_contrib:  number;
          total_net_pay:           number;
          entry_count:             number;
          journal_entry_id:        string | null;
          salary_payment_entry_id: string | null;
          correction_of_run_id:    string | null;
          notes:                   string | null;
          metadata:                Json;
          created_at:              string;
          updated_at:              string;
          created_by:              string | null;
        };
        Insert: {
          id?:                      string;
          organization_id:          string;
          financial_period_id?:     string | null;
          run_type?:                PayrollRunTypeEnum;
          pay_period_start:         string;
          pay_period_end:           string;
          pay_date:                 string;
          status?:                  PayrollRunStatusEnum;
          total_gross?:             number;
          total_withheld_tax?:      number;
          total_employer_contrib?:  number;
          total_net_pay?:           number;
          entry_count?:             number;
          journal_entry_id?:        string | null;
          salary_payment_entry_id?: string | null;
          correction_of_run_id?:    string | null;
          notes?:                   string | null;
          metadata?:                Json;
          created_at?:              string;
          updated_at?:              string;
          created_by?:              string | null;
        };
        Update: Partial<Database['public']['Tables']['payroll_runs']['Insert']>;
      };

      payroll_entries: {
        Row: {
          id:                     string;
          organization_id:        string;
          payroll_run_id:         string;
          employee_id:            string;
          instructor_id:          string | null;
          gross_salary:           number;
          withheld_tax:           number;
          employer_contrib_rate:  number;
          employer_contrib_amount: number;
          pension_amount:         number;
          benefits_amount:        number;
          net_pay:                number;
          notes:                  string | null;
          metadata:               Json;
          created_at:             string;
          updated_at:             string;
        };
        Insert: {
          id?:                      string;
          organization_id:          string;
          payroll_run_id:           string;
          employee_id:              string;
          instructor_id?:           string | null;
          gross_salary:             number;
          withheld_tax?:            number;
          employer_contrib_rate?:   number;
          employer_contrib_amount?: number;
          pension_amount?:          number;
          benefits_amount?:         number;
          net_pay?:                 number;
          notes?:                   string | null;
          metadata?:                Json;
          created_at?:              string;
          updated_at?:              string;
        };
        Update: Partial<Database['public']['Tables']['payroll_entries']['Insert']>;
      };

      tax_remittances: {
        Row: {
          id:                        string;
          organization_id:           string;
          financial_period_id:       string | null;
          payroll_run_id:            string | null;
          declaration_period_start:  string | null;
          declaration_period_end:    string | null;
          due_date:                  string | null;
          withheld_tax_amount:       number;
          employer_contrib_amount:   number;
          total_amount:              number;
          status:                    TaxRemittanceStatusEnum;
          clearing_entry_id:         string | null;
          payment_entry_id:          string | null;
          payment_date:              string | null;
          payment_reference:         string | null;
          skatteverket_reference:    string | null;
          notes:                     string | null;
          metadata:                  Json;
          created_at:                string;
          updated_at:                string;
          created_by:                string | null;
        };
        Insert: {
          id?:                        string;
          organization_id:            string;
          financial_period_id?:       string | null;
          payroll_run_id?:            string | null;
          declaration_period_start?:  string | null;
          declaration_period_end?:    string | null;
          due_date?:                  string | null;
          withheld_tax_amount:        number;
          employer_contrib_amount:    number;
          total_amount:               number;
          status?:                    TaxRemittanceStatusEnum;
          clearing_entry_id?:         string | null;
          payment_entry_id?:          string | null;
          payment_date?:              string | null;
          payment_reference?:         string | null;
          skatteverket_reference?:    string | null;
          notes?:                     string | null;
          metadata?:                  Json;
          created_at?:                string;
          updated_at?:                string;
          created_by?:                string | null;
        };
        Update: Partial<Database['public']['Tables']['tax_remittances']['Insert']>;
      };

      vat_clearing_runs: {
        Row: {
          id:                    string;
          organization_id:       string;
          vat_period_id:         string | null;
          financial_period_id:   string | null;
          run_date:              string;
          output_vat_25:         number;
          output_vat_12:         number;
          output_vat_6:          number;
          total_output_vat:      number;
          total_input_vat:       number;
          net_vat_payable:       number;
          status:                TaxRemittanceStatusEnum;
          clearing_entry_id:     string | null;
          payment_entry_id:      string | null;
          payment_date:          string | null;
          payment_reference:     string | null;
          notes:                 string | null;
          metadata:              Json;
          created_at:            string;
          updated_at:            string;
          created_by:            string | null;
        };
        Insert: {
          id?:                    string;
          organization_id:        string;
          vat_period_id?:         string | null;
          financial_period_id?:   string | null;
          run_date:               string;
          output_vat_25?:         number;
          output_vat_12?:         number;
          output_vat_6?:          number;
          total_output_vat:       number;
          total_input_vat:        number;
          net_vat_payable:        number;
          status?:                TaxRemittanceStatusEnum;
          clearing_entry_id?:     string | null;
          payment_entry_id?:      string | null;
          payment_date?:          string | null;
          payment_reference?:     string | null;
          notes?:                 string | null;
          metadata?:              Json;
          created_at?:            string;
          updated_at?:            string;
          created_by?:            string | null;
        };
        Update: Partial<Database['public']['Tables']['vat_clearing_runs']['Insert']>;
      };

      agi_exports: {
        Row: {
          id:                     string;
          organization_id:        string;
          financial_period_id:    string | null;
          payroll_run_id:         string | null;
          declaration_month:      string;
          total_gross:            number;
          total_withheld_tax:     number;
          total_employer_contrib: number;
          total_benefits:         number;
          employee_count:         number;
          status:                 AgiExportStatusEnum;
          content_hash:           string | null;
          submitted_at:           string | null;
          submitted_by:           string | null;
          skatteverket_receipt:   string | null;
          notes:                  string | null;
          metadata:               Json;
          created_at:             string;
          created_by:             string | null;
        };
        Insert: {
          id?:                     string;
          organization_id:         string;
          financial_period_id?:    string | null;
          payroll_run_id?:         string | null;
          declaration_month:       string;
          total_gross?:            number;
          total_withheld_tax?:     number;
          total_employer_contrib?: number;
          total_benefits?:         number;
          employee_count?:         number;
          status?:                 AgiExportStatusEnum;
          content_hash?:           string | null;
          submitted_at?:           string | null;
          submitted_by?:           string | null;
          skatteverket_receipt?:   string | null;
          notes?:                  string | null;
          metadata?:               Json;
          created_at?:             string;
          created_by?:             string | null;
        };
        Update: Partial<Database['public']['Tables']['agi_exports']['Insert']>;
      };

      agi_export_lines: {
        Row: {
          id:               string;
          organization_id:  string;
          agi_export_id:    string;
          payroll_entry_id: string;
          employee_id:      string;
          gross_salary:     number;
          withheld_tax:     number;
          employer_contrib: number;
          benefits_amount:  number;
          pension_amount:   number;
          created_at:       string;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          agi_export_id:    string;
          payroll_entry_id: string;
          employee_id:      string;
          gross_salary:     number;
          withheld_tax?:    number;
          employer_contrib?: number;
          benefits_amount?: number;
          pension_amount?:  number;
          created_at?:      string;
        };
        Update: never; // Immutable once parent export is finalized
      };

      regulatory_audit_exports: {
        Row: {
          id:                   string;
          organization_id:      string;
          financial_period_id:  string | null;
          export_type:          RegulatoryExportTypeEnum;
          export_date:          string;
          period_start:         string;
          period_end:           string;
          content_hash:         string | null;
          row_count:            number;
          status:               RegulatoryExportStatusEnum;
          submitted_at:         string | null;
          notes:                string | null;
          metadata:             Json;
          created_at:           string;
          created_by:           string | null;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          financial_period_id?:  string | null;
          export_type:           RegulatoryExportTypeEnum;
          export_date?:          string;
          period_start:          string;
          period_end:            string;
          content_hash?:         string | null;
          row_count?:            number;
          status?:               RegulatoryExportStatusEnum;
          submitted_at?:         string | null;
          notes?:                string | null;
          metadata?:             Json;
          created_at?:           string;
          created_by?:           string | null;
        };
        Update: never; // Fully immutable
      };

      // ── Phase 4G: Fixed Assets, Accruals & Advanced Accounting ───────────────

      fixed_asset_classes: {
        Row: {
          id:                        string;
          class_code:                string;
          class_name:                string;
          class_name_en:             string | null;
          asset_account:             string;
          accumulated_depr_account:  string;
          depreciation_exp_account:  string;
          disposal_gain_account:     string;
          disposal_loss_account:     string;
          default_method:            DepreciationMethodEnum;
          default_useful_life_months: number;
          is_active:                 boolean;
          created_at:                string;
        };
        Insert: {
          id?:                        string;
          class_code:                 string;
          class_name:                 string;
          class_name_en?:             string | null;
          asset_account:              string;
          accumulated_depr_account:   string;
          depreciation_exp_account:   string;
          disposal_gain_account:      string;
          disposal_loss_account:      string;
          default_method?:            DepreciationMethodEnum;
          default_useful_life_months?: number;
          is_active?:                 boolean;
          created_at?:                string;
        };
        Update: Partial<Database['public']['Tables']['fixed_asset_classes']['Insert']>;
      };

      fixed_assets: {
        Row: {
          id:                      string;
          organization_id:         string;
          asset_class_id:          string;
          financial_period_id:     string | null;
          asset_code:              string;
          asset_name:              string;
          description:             string | null;
          acquisition_date:        string;
          acquisition_cost:        number;
          residual_value:          number;
          useful_life_months:      number;
          depreciation_method:     DepreciationMethodEnum;
          status:                  FixedAssetStatusEnum;
          net_book_value:          number;
          accumulated_depreciation: number;
          periods_posted:          number;
          acquisition_entry_id:    string | null;
          last_depreciation_date:  string | null;
          fully_depreciated_at:    string | null;
          disposal_id:             string | null;
          notes:                   string | null;
          metadata:                Json;
          created_at:              string;
          updated_at:              string;
          created_by:              string | null;
          updated_by:              string | null;
        };
        Insert: {
          id?:                       string;
          organization_id:           string;
          asset_class_id:            string;
          financial_period_id?:      string | null;
          asset_code:                string;
          asset_name:                string;
          description?:              string | null;
          acquisition_date:          string;
          acquisition_cost:          number;
          residual_value?:           number;
          useful_life_months:        number;
          depreciation_method?:      DepreciationMethodEnum;
          status?:                   FixedAssetStatusEnum;
          net_book_value:            number;
          accumulated_depreciation?: number;
          periods_posted?:           number;
          acquisition_entry_id?:     string | null;
          last_depreciation_date?:   string | null;
          fully_depreciated_at?:     string | null;
          disposal_id?:              string | null;
          notes?:                    string | null;
          metadata?:                 Json;
          created_at?:               string;
          updated_at?:               string;
          created_by?:               string | null;
          updated_by?:               string | null;
        };
        Update: Partial<Database['public']['Tables']['fixed_assets']['Insert']>;
      };

      asset_disposals: {
        Row: {
          id:                          string;
          organization_id:             string;
          asset_id:                    string;
          disposal_type:               AssetDisposalTypeEnum;
          disposal_date:               string;
          net_book_value_at_disposal:  number;
          proceeds:                    number;
          gain_loss:                   number;
          journal_entry_id:            string | null;
          notes:                       string | null;
          metadata:                    Json;
          created_at:                  string;
          created_by:                  string | null;
        };
        Insert: {
          id?:                          string;
          organization_id:              string;
          asset_id:                     string;
          disposal_type:                AssetDisposalTypeEnum;
          disposal_date:                string;
          net_book_value_at_disposal:   number;
          proceeds?:                    number;
          gain_loss:                    number;
          journal_entry_id?:            string | null;
          notes?:                       string | null;
          metadata?:                    Json;
          created_at?:                  string;
          created_by?:                  string | null;
        };
        Update: never; // Fully immutable
      };

      depreciation_schedules: {
        Row: {
          id:                   string;
          organization_id:      string;
          asset_id:             string;
          period_number:        number;
          schedule_date:        string;
          depreciation_amount:  number;
          opening_nbv:          number;
          closing_nbv:          number;
          is_posted:            boolean;
          posted_at:            string | null;
          journal_entry_id:     string | null;
          created_at:           string;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          asset_id:              string;
          period_number:         number;
          schedule_date:         string;
          depreciation_amount:   number;
          opening_nbv:           number;
          closing_nbv:           number;
          is_posted?:            boolean;
          posted_at?:            string | null;
          journal_entry_id?:     string | null;
          created_at?:           string;
        };
        Update: Partial<Database['public']['Tables']['depreciation_schedules']['Insert']>;
      };

      accrual_schedules: {
        Row: {
          id:                      string;
          organization_id:         string;
          financial_period_id:     string | null;
          accrual_type:            AccrualTypeEnum;
          status:                  AccrualStatusEnum;
          description:             string;
          total_amount:            number;
          released_amount:         number;
          release_months:          number;
          months_released:         number;
          start_date:              string;
          release_debit_account:   string;
          release_credit_account:  string;
          initial_entry_id:        string | null;
          notes:                   string | null;
          metadata:                Json;
          created_at:              string;
          updated_at:              string;
          created_by:              string | null;
          updated_by:              string | null;
        };
        Insert: {
          id?:                       string;
          organization_id:           string;
          financial_period_id?:      string | null;
          accrual_type:              AccrualTypeEnum;
          status?:                   AccrualStatusEnum;
          description:               string;
          total_amount:              number;
          released_amount?:          number;
          release_months:            number;
          months_released?:          number;
          start_date:                string;
          release_debit_account:     string;
          release_credit_account:    string;
          initial_entry_id?:         string | null;
          notes?:                    string | null;
          metadata?:                 Json;
          created_at?:               string;
          updated_at?:               string;
          created_by?:               string | null;
          updated_by?:               string | null;
        };
        Update: Partial<Database['public']['Tables']['accrual_schedules']['Insert']>;
      };

      accrual_release_lines: {
        Row: {
          id:                   string;
          organization_id:      string;
          accrual_schedule_id:  string;
          period_number:        number;
          release_date:         string;
          release_amount:       number;
          is_posted:            boolean;
          is_cancelled:         boolean;
          posted_at:            string | null;
          journal_entry_id:     string | null;
          created_at:           string;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          accrual_schedule_id:   string;
          period_number:         number;
          release_date:          string;
          release_amount:        number;
          is_posted?:            boolean;
          is_cancelled?:         boolean;
          posted_at?:            string | null;
          journal_entry_id?:     string | null;
          created_at?:           string;
        };
        Update: Partial<Database['public']['Tables']['accrual_release_lines']['Insert']>;
      };

      periodic_deferred_schedules: {
        Row: {
          id:                   string;
          organization_id:      string;
          financial_period_id:  string | null;
          source_type:          string;
          source_id:            string;
          description:          string;
          total_amount:         number;
          released_amount:      number;
          release_months:       number;
          months_released:      number;
          start_date:           string;
          deferral_account:     string;
          recognition_account:  string;
          is_fully_released:    boolean;
          notes:                string | null;
          metadata:             Json;
          created_at:           string;
          updated_at:           string;
          created_by:           string | null;
          updated_by:           string | null;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          financial_period_id?:  string | null;
          source_type:           string;
          source_id:             string;
          description:           string;
          total_amount:          number;
          released_amount?:      number;
          release_months:        number;
          months_released?:      number;
          start_date:            string;
          deferral_account?:     string;
          recognition_account?:  string;
          is_fully_released?:    boolean;
          notes?:                string | null;
          metadata?:             Json;
          created_at?:           string;
          updated_at?:           string;
          created_by?:           string | null;
          updated_by?:           string | null;
        };
        Update: Partial<Database['public']['Tables']['periodic_deferred_schedules']['Insert']>;
      };

      periodic_deferred_lines: {
        Row: {
          id:               string;
          organization_id:  string;
          schedule_id:      string;
          period_number:    number;
          release_date:     string;
          release_amount:   number;
          is_posted:        boolean;
          posted_at:        string | null;
          journal_entry_id: string | null;
          created_at:       string;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          schedule_id:       string;
          period_number:     number;
          release_date:      string;
          release_amount:    number;
          is_posted?:        boolean;
          posted_at?:        string | null;
          journal_entry_id?: string | null;
          created_at?:       string;
        };
        Update: Partial<Database['public']['Tables']['periodic_deferred_lines']['Insert']>;
      };

      close_dependency_validations: {
        Row: {
          id:               string;
          organization_id:  string;
          period_id:        string;
          status:           'ok' | 'blocking_periods';
          blocking_count:   number;
          blocking_periods: Json;
          validated_at:     string;
          validated_by:     string | null;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          period_id:         string;
          status:            'ok' | 'blocking_periods';
          blocking_count?:   number;
          blocking_periods?: Json;
          validated_at?:     string;
          validated_by?:     string | null;
        };
        Update: never; // Append-only log
      };

      accounting_replay_runs: {
        Row: {
          id:                string;
          organization_id:   string;
          period_id:         string;
          status:            'valid' | 'discrepancies_found';
          accounts_checked:  number;
          discrepancy_count: number;
          discrepancies:     Json;
          run_duration_ms:   number | null;
          run_at:            string;
          run_by:            string | null;
        };
        Insert: {
          id?:                string;
          organization_id:    string;
          period_id:          string;
          status:             'valid' | 'discrepancies_found';
          accounts_checked?:  number;
          discrepancy_count?: number;
          discrepancies?:     Json;
          run_duration_ms?:   number | null;
          run_at?:            string;
          run_by?:            string | null;
        };
        Update: never; // Append-only log
      };

      canonical_accounting_exports: {
        Row: {
          id:                   string;
          organization_id:      string;
          period_id:            string;
          content_hash:         string;
          journal_entry_count:  number;
          journal_line_count:   number;
          total_debit:          number;
          total_credit:         number;
          notes:                string | null;
          metadata:             Json;
          created_at:           string;
          created_by:           string | null;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          period_id:             string;
          content_hash:          string;
          journal_entry_count?:  number;
          journal_line_count?:   number;
          total_debit?:          number;
          total_credit?:         number;
          notes?:                string | null;
          metadata?:             Json;
          created_at?:           string;
          created_by?:           string | null;
        };
        Update: never; // Fully immutable
      };

      // ── Phase 4H: Replayable Ledger Governance ───────────────────────────

      ledger_replay_runs: {
        Row: {
          id:                        string;
          organization_id:           string;
          period_id:                 string | null;
          fiscal_year_id:            string | null;
          replay_type:               LedgerReplayTypeEnum;
          status:                    LedgerReplayStatusEnum;
          started_at:                string;
          completed_at:              string | null;
          journal_entries_processed: number;
          journal_lines_processed:   number;
          accounts_reconstructed:    number;
          divergence_count:          number;
          replay_hash:               string | null;
          error_detail:              string | null;
          actor_id:                  string | null;
          created_at:                string;
        };
        Insert: {
          id?:                        string;
          organization_id:            string;
          period_id?:                 string | null;
          fiscal_year_id?:            string | null;
          replay_type?:               LedgerReplayTypeEnum;
          status?:                    LedgerReplayStatusEnum;
          started_at?:                string;
          completed_at?:              string | null;
          journal_entries_processed?: number;
          journal_lines_processed?:   number;
          accounts_reconstructed?:    number;
          divergence_count?:          number;
          replay_hash?:               string | null;
          error_detail?:              string | null;
          actor_id?:                  string | null;
          created_at?:                string;
        };
        Update: Partial<Database['public']['Tables']['ledger_replay_runs']['Insert']>;
      };

      replay_snapshots: {
        Row: {
          id:                    string;
          organization_id:       string;
          period_id:             string;
          replay_run_id:         string;
          account_code:          string;
          reconstructed_debit:   number;
          reconstructed_credit:  number;
          reconstructed_balance: number;
          cached_debit:          number | null;
          cached_credit:         number | null;
          cached_balance:        number | null;
          divergence_amount:     number;  // GENERATED
          has_divergence:        boolean; // GENERATED
          created_at:            string;
        };
        Insert: {
          id?:                    string;
          organization_id:        string;
          period_id:              string;
          replay_run_id:          string;
          account_code:           string;
          reconstructed_debit?:   number;
          reconstructed_credit?:  number;
          reconstructed_balance:  number;
          cached_debit?:          number | null;
          cached_credit?:         number | null;
          cached_balance?:        number | null;
          created_at?:            string;
        };
        Update: never; // Immutable
      };

      schedule_generations: {
        Row: {
          id:                string;
          organization_id:   string;
          schedule_type:     ScheduleGenerationTypeEnum;
          source_id:         string;
          generation_number: number;
          lines_count:       number;
          total_amount:      number;
          is_current:        boolean;
          superseded_at:     string | null;
          superseded_by:     string | null;
          reason:            string | null;
          metadata:          Json;
          created_at:        string;
          created_by:        string | null;
        };
        Insert: {
          id?:                string;
          organization_id:    string;
          schedule_type:      ScheduleGenerationTypeEnum;
          source_id:          string;
          generation_number:  number;
          lines_count?:       number;
          total_amount?:      number;
          is_current?:        boolean;
          superseded_at?:     string | null;
          superseded_by?:     string | null;
          reason?:            string | null;
          metadata?:          Json;
          created_at?:        string;
          created_by?:        string | null;
        };
        Update: Partial<Database['public']['Tables']['schedule_generations']['Insert']>;
      };

      schedule_generation_links: {
        Row: {
          id:                   string;
          parent_generation_id: string;
          child_generation_id:  string;
          link_reason:          string | null;
          created_at:           string;
        };
        Insert: {
          id?:                   string;
          parent_generation_id:  string;
          child_generation_id:   string;
          link_reason?:          string | null;
          created_at?:           string;
        };
        Update: never; // Immutable
      };

      fiscal_dependency_graph: {
        Row: {
          id:                  string;
          organization_id:     string;
          dependent_period_id: string;
          required_period_id:  string;
          dependency_type:     FiscalDependencyTypeEnum;
          is_active:           boolean;
          notes:               string | null;
          created_at:          string;
          created_by:          string | null;
        };
        Insert: {
          id?:                  string;
          organization_id:      string;
          dependent_period_id:  string;
          required_period_id:   string;
          dependency_type?:     FiscalDependencyTypeEnum;
          is_active?:           boolean;
          notes?:               string | null;
          created_at?:          string;
          created_by?:          string | null;
        };
        Update: Partial<Database['public']['Tables']['fiscal_dependency_graph']['Insert']>;
      };

      replay_divergence_events: {
        Row: {
          id:                string;
          organization_id:   string;
          period_id:         string;
          replay_run_id:     string;
          divergence_type:   ReplayDivergenceTypeEnum;
          account_code:      string | null;
          expected_balance:  number | null;
          actual_balance:    number | null;
          divergence_amount: number | null; // GENERATED
          detail:            string | null;
          detected_at:       string;
          resolved_at:       string | null;
          resolved_by:       string | null;
          resolution_notes:  string | null;
        };
        Insert: {
          id?:                string;
          organization_id:    string;
          period_id:          string;
          replay_run_id:      string;
          divergence_type:    ReplayDivergenceTypeEnum;
          account_code?:      string | null;
          expected_balance?:  number | null;
          actual_balance?:    number | null;
          detail?:            string | null;
          detected_at?:       string;
          resolved_at?:       string | null;
          resolved_by?:       string | null;
          resolution_notes?:  string | null;
        };
        Update: Partial<Database['public']['Tables']['replay_divergence_events']['Insert']>;
      };

      subledger_close_jobs: {
        Row: {
          id:               string;
          organization_id:  string;
          period_id:        string;
          subledger_type:   SubledgerTypeEnum;
          status:           SubledgerCloseStatusEnum;
          items_found:      number;
          items_ready:      number;
          items_blocking:   number;
          check_detail:     Json;
          error_detail:     string | null;
          started_at:       string | null;
          completed_at:     string | null;
          created_at:       string;
          updated_at:       string;
          created_by:       string | null;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          period_id:         string;
          subledger_type:    SubledgerTypeEnum;
          status?:           SubledgerCloseStatusEnum;
          items_found?:      number;
          items_ready?:      number;
          items_blocking?:   number;
          check_detail?:     Json;
          error_detail?:     string | null;
          started_at?:       string | null;
          completed_at?:     string | null;
          created_at?:       string;
          updated_at?:       string;
          created_by?:       string | null;
        };
        Update: Partial<Database['public']['Tables']['subledger_close_jobs']['Insert']>;
      };

      replay_validation_reports: {
        Row: {
          id:               string;
          organization_id:  string;
          period_id:        string;
          replay_run_id:    string | null;
          validation_type:  ReplayValidationTypeEnum;
          status:           ReplayValidationStatusEnum;
          checks_run:       number;
          checks_passed:    number;
          checks_failed:    number;
          report_data:      Json;
          content_hash:     string;
          notes:            string | null;
          created_at:       string;
          created_by:       string | null;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          period_id:         string;
          replay_run_id?:    string | null;
          validation_type?:  ReplayValidationTypeEnum;
          status:            ReplayValidationStatusEnum;
          checks_run?:       number;
          checks_passed?:    number;
          checks_failed?:    number;
          report_data?:      Json;
          content_hash:      string;
          notes?:            string | null;
          created_at?:       string;
          created_by?:       string | null;
        };
        Update: never; // Immutable
      };

      canonical_replay_exports: {
        Row: {
          id:               string;
          organization_id:  string;
          period_id:        string;
          replay_run_id:    string;
          export_content:   Json;
          content_hash:     string;
          account_count:    number;
          total_debit:      number;
          total_credit:     number;
          notes:            string | null;
          metadata:         Json;
          created_at:       string;
          created_by:       string | null;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          period_id:         string;
          replay_run_id:     string;
          export_content?:   Json;
          content_hash:      string;
          account_count?:    number;
          total_debit?:      number;
          total_credit?:     number;
          notes?:            string | null;
          metadata?:         Json;
          created_at?:       string;
          created_by?:       string | null;
        };
        Update: never; // Immutable
      };

      replay_hash_registry: {
        Row: {
          id:               string;
          organization_id:  string;
          period_id:        string;
          replay_run_id:    string | null;
          hash_value:       string;
          hash_type:        ReplayHashTypeEnum;
          created_at:       string;
          updated_at:       string;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          period_id:         string;
          replay_run_id?:    string | null;
          hash_value:        string;
          hash_type:         ReplayHashTypeEnum;
          created_at?:       string;
          updated_at?:       string;
        };
        Update: Partial<Database['public']['Tables']['replay_hash_registry']['Insert']>;
      };

      // ── Phase 4H-A: Accounting Architecture Stabilization ────────────────

      accounting_layer_registry: {
        Row: {
          id:                 string;
          layer_name:         string;
          layer_type:         AccountingLayerTypeEnum;
          table_names:        string[];
          description:        string;
          is_mutable:         boolean;
          is_source_of_truth: boolean;
          is_derived:         boolean;
          sort_order:         number;
          created_at:         string;
        };
        Insert: {
          id?:                 string;
          layer_name:          string;
          layer_type:          AccountingLayerTypeEnum;
          table_names?:        string[];
          description:         string;
          is_mutable?:         boolean;
          is_source_of_truth?: boolean;
          is_derived?:         boolean;
          sort_order?:         number;
          created_at?:         string;
        };
        Update: Partial<Database['public']['Tables']['accounting_layer_registry']['Insert']>;
      };

      replay_validation_deltas: {
        Row: {
          id:               string;
          organization_id:  string;
          period_id:        string;
          replay_run_id:    string;
          account_code:     string;
          delta_type:       ReplayDeltaTypeEnum;
          ledger_debit:     number | null;
          ledger_credit:    number | null;
          ledger_balance:   number | null;
          cache_debit:      number | null;
          cache_credit:     number | null;
          cache_balance:    number | null;
          delta_amount:     number;   // GENERATED
          created_at:       string;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          period_id:         string;
          replay_run_id:     string;
          account_code:      string;
          delta_type:        ReplayDeltaTypeEnum;
          ledger_debit?:     number | null;
          ledger_credit?:    number | null;
          ledger_balance?:   number | null;
          cache_debit?:      number | null;
          cache_credit?:     number | null;
          cache_balance?:    number | null;
          created_at?:       string;
        };
        Update: never; // Immutable
      };

      replay_certifications: {
        Row: {
          id:                   string;
          organization_id:      string;
          period_id:            string;
          replay_run_id:        string;
          replay_hash:          string;
          certification_hash:   string;
          status:               ReplayCertificationStatusEnum;
          delta_count:          number;
          certified_at:         string;
          certified_by:         string | null;
          revoked_at:           string | null;
          revocation_reason:    string | null;
        };
        Insert: {
          id?:                   string;
          organization_id:       string;
          period_id:             string;
          replay_run_id:         string;
          replay_hash:           string;
          certification_hash:    string;
          status?:               ReplayCertificationStatusEnum;
          delta_count?:          number;
          certified_at?:         string;
          certified_by?:         string | null;
          revoked_at?:           string | null;
          revocation_reason?:    string | null;
        };
        Update: never; // Immutable
      };

      replay_integrity_certificates: {
        Row: {
          id:                     string;
          organization_id:        string;
          fiscal_year_id:         string;
          certificate_hash:       string;
          period_count:           number;
          certified_period_count: number;
          all_periods_certified:  boolean; // GENERATED
          period_hashes:          Json;
          generated_at:           string;
          generated_by:           string | null;
        };
        Insert: {
          id?:                     string;
          organization_id:         string;
          fiscal_year_id:          string;
          certificate_hash:        string;
          period_count?:           number;
          certified_period_count?: number;
          period_hashes?:          Json;
          generated_at?:           string;
          generated_by?:           string | null;
        };
        Update: never; // Fully immutable
      };

      replay_execution_jobs: {
        Row: {
          id:               string;
          organization_id:  string;
          period_id:        string | null;
          fiscal_year_id:   string | null;
          job_type:         ReplayJobTypeEnum;
          status:           ReplayJobStatusEnum;
          priority:         number;
          replay_run_id:    string | null;
          requested_by:     string | null;
          queued_at:        string;
          started_at:       string | null;
          completed_at:     string | null;
          error_detail:     string | null;
          result_data:      Json;
          created_at:       string;
          updated_at:       string;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          period_id?:        string | null;
          fiscal_year_id?:   string | null;
          job_type:          ReplayJobTypeEnum;
          status?:           ReplayJobStatusEnum;
          priority?:         number;
          replay_run_id?:    string | null;
          requested_by?:     string | null;
          queued_at?:        string;
          started_at?:       string | null;
          completed_at?:     string | null;
          error_detail?:     string | null;
          result_data?:      Json;
          created_at?:       string;
          updated_at?:       string;
        };
        Update: Partial<Database['public']['Tables']['replay_execution_jobs']['Insert']>;
      };

      canonical_export_hashes: {
        Row: {
          id:               string;
          organization_id:  string;
          period_id:        string | null;
          fiscal_year_id:   string | null;
          export_type:      CanonicalExportTypeEnum;
          export_id:        string;
          hash_value:       string;
          algorithm:        string;
          generated_at:     string;
          generated_by:     string | null;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          period_id?:        string | null;
          fiscal_year_id?:   string | null;
          export_type:       CanonicalExportTypeEnum;
          export_id:         string;
          hash_value:        string;
          algorithm?:        string;
          generated_at?:     string;
          generated_by?:     string | null;
        };
        Update: never; // Immutable
      };

      // ── Phase 5A: Swedish compliance + regulatory reporting ─────────────────

      compliance_events: {
        Row: {
          id:              string;
          organization_id: string;
          event_type:      ComplianceEventTypeEnum;
          entity_type:     string;
          entity_id:       string;
          actor_id:        string | null;
          metadata:        Json;
          occurred_at:     string;
        };
        Insert: {
          id?:             string;
          organization_id: string;
          event_type:      ComplianceEventTypeEnum;
          entity_type:     string;
          entity_id:       string;
          actor_id?:       string | null;
          metadata?:       Json;
          occurred_at?:    string;
        };
        Update: never; // Immutable
      };

      agi_submissions: {
        Row: {
          id:                       string;
          organization_id:          string;
          agi_export_id:            string;
          declaration_period_start: string;
          declaration_period_end:   string;
          submission_status:        AgiSubmissionStatusEnum;
          submission_reference:     string | null;
          submission_hash:          string;
          skatteverket_receipt:     string | null;
          accepted_at:              string | null;
          rejected_at:              string | null;
          rejection_reason:         string | null;
          correction_of_id:         string | null;
          submitted_at:             string | null;
          submitted_by:             string | null;
          certified_at:             string | null;
          certified_by:             string | null;
          certification_hash:       string | null;
          notes:                    string | null;
          metadata:                 Json;
          created_at:               string;
          created_by:               string | null;
        };
        Insert: {
          id?:                       string;
          organization_id:           string;
          agi_export_id:             string;
          declaration_period_start:  string;
          declaration_period_end:    string;
          submission_status?:        AgiSubmissionStatusEnum;
          submission_reference?:     string | null;
          submission_hash:           string;
          skatteverket_receipt?:     string | null;
          accepted_at?:              string | null;
          rejected_at?:              string | null;
          rejection_reason?:         string | null;
          correction_of_id?:         string | null;
          submitted_at?:             string | null;
          submitted_by?:             string | null;
          certified_at?:             string | null;
          certified_by?:             string | null;
          certification_hash?:       string | null;
          notes?:                    string | null;
          metadata?:                 Json;
          created_at?:               string;
          created_by?:               string | null;
        };
        Update: Partial<Database['public']['Tables']['agi_submissions']['Insert']>;
      };

      agi_submission_lines: {
        Row: {
          id:                 string;
          organization_id:    string;
          submission_id:      string;
          agi_export_line_id: string | null;
          employee_id:        string;
          gross_salary:       number;
          withheld_tax:       number;
          employer_contrib:   number;
          benefits_amount:    number;
          pension_amount:     number;
          is_corrected:       boolean;
          correction_note:    string | null;
          created_at:         string;
        };
        Insert: {
          id?:                 string;
          organization_id:     string;
          submission_id:       string;
          agi_export_line_id?: string | null;
          employee_id:         string;
          gross_salary?:       number;
          withheld_tax?:       number;
          employer_contrib?:   number;
          benefits_amount?:    number;
          pension_amount?:     number;
          is_corrected?:       boolean;
          correction_note?:    string | null;
          created_at?:         string;
        };
        Update: never; // Immutable
      };

      agi_corrections: {
        Row: {
          id:                       string;
          organization_id:          string;
          original_submission_id:   string;
          correction_submission_id: string | null;
          correction_reason:        AgiCorrectionReasonEnum;
          correction_description:   string;
          correction_hash:          string;
          created_at:               string;
          created_by:               string | null;
        };
        Insert: {
          id?:                       string;
          organization_id:           string;
          original_submission_id:    string;
          correction_submission_id?: string | null;
          correction_reason:         AgiCorrectionReasonEnum;
          correction_description:    string;
          correction_hash:           string;
          created_at?:               string;
          created_by?:               string | null;
        };
        Update: never; // Immutable
      };

      vat_declarations: {
        Row: {
          id:                     string;
          organization_id:        string;
          vat_period_id:          string;
          declaration_status:     VatDeclarationStatusEnum;
          declaration_reference:  string | null;
          box_05_taxable_turnover: number;
          box_10_output_vat_25:   number;
          box_11_output_vat_12:   number;
          box_12_output_vat_6:    number;
          box_30_input_vat:       number;
          box_49_net_vat:         number; // generated
          declaration_hash:       string;
          skatteverket_receipt:   string | null;
          correction_of_id:       string | null;
          submitted_at:           string | null;
          submitted_by:           string | null;
          certified_at:           string | null;
          certified_by:           string | null;
          certification_hash:     string | null;
          notes:                  string | null;
          metadata:               Json;
          created_at:             string;
          created_by:             string | null;
        };
        Insert: {
          id?:                      string;
          organization_id:          string;
          vat_period_id:            string;
          declaration_status?:      VatDeclarationStatusEnum;
          declaration_reference?:   string | null;
          box_05_taxable_turnover?: number;
          box_10_output_vat_25?:    number;
          box_11_output_vat_12?:    number;
          box_12_output_vat_6?:     number;
          box_30_input_vat?:        number;
          declaration_hash:         string;
          skatteverket_receipt?:    string | null;
          correction_of_id?:        string | null;
          submitted_at?:            string | null;
          submitted_by?:            string | null;
          certified_at?:            string | null;
          certified_by?:            string | null;
          certification_hash?:      string | null;
          notes?:                   string | null;
          metadata?:                Json;
          created_at?:              string;
          created_by?:              string | null;
        };
        Update: Partial<Database['public']['Tables']['vat_declarations']['Insert']>;
      };

      vat_declaration_lines: {
        Row: {
          id:              string;
          organization_id: string;
          declaration_id:  string;
          box_code:        string;
          box_name:        string;
          base_amount:     number;
          vat_amount:      number;
          vat_rate_code:   string | null;
          sort_order:      number;
          created_at:      string;
        };
        Insert: {
          id?:              string;
          organization_id:  string;
          declaration_id:   string;
          box_code:         string;
          box_name:         string;
          base_amount?:     number;
          vat_amount?:      number;
          vat_rate_code?:   string | null;
          sort_order?:      number;
          created_at?:      string;
        };
        Update: never; // Immutable
      };

      vat_corrections: {
        Row: {
          id:                         string;
          organization_id:            string;
          original_declaration_id:    string;
          correction_declaration_id:  string | null;
          correction_type:            VatCorrectionTypeEnum;
          correction_description:     string;
          correction_hash:            string;
          created_at:                 string;
          created_by:                 string | null;
        };
        Insert: {
          id?:                          string;
          organization_id:              string;
          original_declaration_id:      string;
          correction_declaration_id?:   string | null;
          correction_type:              VatCorrectionTypeEnum;
          correction_description:       string;
          correction_hash:              string;
          created_at?:                  string;
          created_by?:                  string | null;
        };
        Update: never; // Immutable
      };

      filing_certifications: {
        Row: {
          id:                    string;
          organization_id:       string;
          entity_type:           FilingEntityTypeEnum;
          entity_id:             string;
          replay_run_id:         string | null;
          replay_hash:           string | null;
          filing_hash:           string;
          certification_hash:    string;
          certification_status:  FilingCertificationStatusEnum;
          certified_at:          string | null;
          certified_by:          string | null;
          revoked_at:            string | null;
          revocation_reason:     string | null;
          metadata:              Json;
          created_at:            string;
          created_by:            string | null;
        };
        Insert: {
          id?:                    string;
          organization_id:        string;
          entity_type:            FilingEntityTypeEnum;
          entity_id:              string;
          replay_run_id?:         string | null;
          replay_hash?:           string | null;
          filing_hash:            string;
          certification_hash:     string;
          certification_status?:  FilingCertificationStatusEnum;
          certified_at?:          string | null;
          certified_by?:          string | null;
          revoked_at?:            string | null;
          revocation_reason?:     string | null;
          metadata?:              Json;
          created_at?:            string;
          created_by?:            string | null;
        };
        Update: Partial<Database['public']['Tables']['filing_certifications']['Insert']>;
      };

      compliance_replay_links: {
        Row: {
          id:                      string;
          organization_id:         string;
          filing_type:             FilingEntityTypeEnum;
          filing_id:               string;
          replay_certification_id: string | null;
          replay_run_id:           string | null;
          link_hash:               string;
          created_at:              string;
          created_by:              string | null;
        };
        Insert: {
          id?:                      string;
          organization_id:          string;
          filing_type:              FilingEntityTypeEnum;
          filing_id:                string;
          replay_certification_id?: string | null;
          replay_run_id?:           string | null;
          link_hash:                string;
          created_at?:              string;
          created_by?:              string | null;
        };
        Update: never; // Immutable
      };

      saf_t_exports: {
        Row: {
          id:                     string;
          organization_id:        string;
          fiscal_year_id:         string | null;
          period_start:           string;
          period_end:             string;
          export_scope:           SaftExportScopeEnum;
          export_status:          SaftExportStatusEnum;
          saft_version:           string;
          journal_entry_count:    number;
          transaction_count:      number;
          account_count:          number;
          content_hash:           string | null;
          export_file_reference:  string | null;
          submitted_at:           string | null;
          submitted_by:           string | null;
          skatteverket_reference: string | null;
          notes:                  string | null;
          metadata:               Json;
          created_at:             string;
          created_by:             string | null;
        };
        Insert: {
          id?:                      string;
          organization_id:          string;
          fiscal_year_id?:          string | null;
          period_start:             string;
          period_end:               string;
          export_scope?:            SaftExportScopeEnum;
          export_status?:           SaftExportStatusEnum;
          saft_version?:            string;
          journal_entry_count?:     number;
          transaction_count?:       number;
          account_count?:           number;
          content_hash?:            string | null;
          export_file_reference?:   string | null;
          submitted_at?:            string | null;
          submitted_by?:            string | null;
          skatteverket_reference?:  string | null;
          notes?:                   string | null;
          metadata?:                Json;
          created_at?:              string;
          created_by?:              string | null;
        };
        Update: Partial<Database['public']['Tables']['saf_t_exports']['Insert']>;
      };

      retention_policies: {
        Row: {
          id:                string;
          organization_id:   string;
          policy_type:       RetentionPolicyTypeEnum;
          retention_years:   number;
          legal_basis:       string;
          applies_to_table:  string;
          applies_to_column: string | null;
          is_active:         boolean;
          effective_from:    string;
          effective_to:      string | null;
          notes:             string | null;
          created_at:        string;
          created_by:        string | null;
          updated_at:        string;
        };
        Insert: {
          id?:                string;
          organization_id:    string;
          policy_type:        RetentionPolicyTypeEnum;
          retention_years:    number;
          legal_basis:        string;
          applies_to_table:   string;
          applies_to_column?: string | null;
          is_active?:         boolean;
          effective_from?:    string;
          effective_to?:      string | null;
          notes?:             string | null;
          created_at?:        string;
          created_by?:        string | null;
          updated_at?:        string;
        };
        Update: Partial<Database['public']['Tables']['retention_policies']['Insert']>;
      };

      retention_enforcement_log: {
        Row: {
          id:                    string;
          organization_id:       string;
          policy_id:             string;
          policy_type:           RetentionPolicyTypeEnum;
          check_date:            string;
          reference_date:        string;
          earliest_allowed_date: string;
          outcome:               RetentionEnforcementOutcomeEnum;
          violation_details:     string | null;
          records_checked:       number;
          records_at_risk:       number;
          enforced_by:           string | null;
          metadata:              Json;
          created_at:            string;
        };
        Insert: {
          id?:                    string;
          organization_id:        string;
          policy_id:              string;
          policy_type:            RetentionPolicyTypeEnum;
          check_date?:            string;
          reference_date:         string;
          earliest_allowed_date:  string;
          outcome:                RetentionEnforcementOutcomeEnum;
          violation_details?:     string | null;
          records_checked?:       number;
          records_at_risk?:       number;
          enforced_by?:           string | null;
          metadata?:              Json;
          created_at?:            string;
        };
        Update: never; // Immutable
      };

      regulatory_export_hashes: {
        Row: {
          id:                 string;
          organization_id:    string;
          export_type:        string;
          export_id:          string;
          period_start:       string | null;
          period_end:         string | null;
          hash_value:         string;
          hash_algorithm:     string;
          hash_input_summary: string | null;
          generated_at:       string;
          generated_by:       string | null;
        };
        Insert: {
          id?:                  string;
          organization_id:      string;
          export_type:          string;
          export_id:            string;
          period_start?:        string | null;
          period_end?:          string | null;
          hash_value:           string;
          hash_algorithm?:      string;
          hash_input_summary?:  string | null;
          generated_at?:        string;
          generated_by?:        string | null;
        };
        Update: never; // Immutable
      };

      // Phase 5A.1 deterministic compliance replay hardening tables

      canonicalization_profiles: {
        Row: {
          id:            string;
          profile_name:  string;
          profile_type:  CanonicalizationProfileTypeEnum;
          description:   string | null;
          configuration: Json;
          is_active:     boolean;
          created_at:    string;
          updated_at:    string;
        };
        Insert: {
          id?:            string;
          profile_name:   string;
          profile_type:   CanonicalizationProfileTypeEnum;
          description?:   string | null;
          configuration?: Json;
          is_active?:     boolean;
          created_at?:    string;
          updated_at?:    string;
        };
        Update: Partial<{
          profile_name:  string;
          profile_type:  CanonicalizationProfileTypeEnum;
          description:   string | null;
          configuration: Json;
          is_active:     boolean;
        }>;
      };

      replay_assertions: {
        Row: {
          id:                  string;
          organization_id:     string;
          entity_type:         string;
          entity_id:           string;
          assertion_type:      ReplayAssertionTypeEnum;
          assertion_status:    ReplayAssertionStatusEnum;
          stored_hash:         string | null;
          recomputed_hash:     string | null;
          hash_matched:        boolean;
          assertion_metadata:  Json;
          asserted_at:         string;
          asserted_by:         string | null;
        };
        Insert: {
          id?:                  string;
          organization_id:      string;
          entity_type:          string;
          entity_id:            string;
          assertion_type?:      ReplayAssertionTypeEnum;
          assertion_status:     ReplayAssertionStatusEnum;
          stored_hash?:         string | null;
          recomputed_hash?:     string | null;
          hash_matched?:        boolean;
          assertion_metadata?:  Json;
          asserted_at?:         string;
          asserted_by?:         string | null;
        };
        Update: never; // Immutable
      };

      deterministic_export_registry: {
        Row: {
          id:               string;
          organization_id:  string;
          export_type:      string;
          export_id:        string;
          canonical_payload: Json;
          replay_safe_hash:  string;
          profile_name:      string;
          registered_at:     string;
          registered_by:     string | null;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          export_type:       string;
          export_id:         string;
          canonical_payload: Json;
          replay_safe_hash:  string;
          profile_name?:     string;
          registered_at?:    string;
          registered_by?:    string | null;
        };
        Update: never; // Immutable
      };

      certification_snapshots: {
        Row: {
          id:               string;
          organization_id:  string;
          entity_type:      string;
          entity_id:        string;
          snapshot_hash:    string;
          entity_state:     Json;
          certification_id: string | null;
          created_at:       string;
          created_by:       string | null;
        };
        Insert: {
          id?:               string;
          organization_id:   string;
          entity_type:       string;
          entity_id:         string;
          snapshot_hash:     string;
          entity_state:      Json;
          certification_id?: string | null;
          created_at?:       string;
          created_by?:       string | null;
        };
        Update: never; // Immutable
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
      // ── Phase 4D: Double-entry ledger SECURITY DEFINER functions ────────────
      find_period_for_date: {
        Args: { p_org_id: string; p_date: string };
        Returns: string | null;
      };
      post_journal_entry: {
        Args: {
          p_org_id:               string;
          p_period_id?:           string | null;
          p_entry_type?:          JournalEntryTypeEnum;
          p_entry_date:           string;
          p_description:          string;
          p_lines:                Json;
          p_source_event_type?:   string | null;
          p_source_entity_type?:  string | null;
          p_source_entity_id?:    string | null;
          p_voucher_series?:      string;
          p_reversal_of_entry_id?:   string | null;
          p_correction_of_entry_id?: string | null;
          p_actor_id?:            string | null;
        };
        Returns: string;
      };
      post_invoice_journal_entry: {
        Args: { p_invoice_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      post_payment_journal_entry: {
        Args: { p_payment_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      post_void_journal_entry: {
        Args: { p_invoice_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      reverse_journal_entry: {
        Args: {
          p_entry_id:       string;
          p_reversal_date?: string;
          p_reason?:        string;
          p_actor_id?:      string | null;
        };
        Returns: string;
      };
      correct_journal_entry: {
        Args: {
          p_entry_id:         string;
          p_new_lines:        Json;
          p_reason?:          string;
          p_correction_date?: string;
          p_actor_id?:        string | null;
        };
        Returns: string;
      };
      post_deferred_revenue_entry: {
        Args: { p_invoice_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      recognize_lesson_revenue: {
        Args: { p_booking_id: string; p_actor_id?: string | null };
        Returns: string | null;
      };
      bulk_recognize_revenue: {
        Args: { p_org_id: string; p_as_of_date?: string; p_actor_id?: string | null };
        Returns: number;
      };
      generate_sie4_from_ledger: {
        Args: { p_org_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      // ── Phase 4E: Bank reconciliation SECURITY DEFINER functions ───────────
      import_bank_statement: {
        Args: {
          p_org_id:           string;
          p_account_number:   string;
          p_bank_name?:       string | null;
          p_statement_date:   string;
          p_period_start:     string;
          p_period_end:       string;
          p_opening_balance?: number;
          p_closing_balance?: number;
          p_currency?:        string;
          p_lines:            Json;
          p_actor_id?:        string | null;
        };
        Returns: string; // import_id
      };
      auto_match_bank_lines: {
        Args: { p_import_id: string; p_actor_id?: string | null };
        Returns: number; // count of matched lines
      };
      manual_match_bank_line: {
        Args: { p_line_id: string; p_payment_id: string; p_notes?: string | null; p_actor_id?: string | null };
        Returns: undefined;
      };
      unmatch_bank_line: {
        Args: { p_line_id: string; p_actor_id?: string | null };
        Returns: undefined;
      };
      confirm_bank_reconciliation: {
        Args: { p_import_id: string; p_period_id: string; p_notes?: string | null; p_actor_id?: string | null };
        Returns: string; // reconciliation_run_id
      };
      reconcile_accounts_receivable: {
        Args: { p_period_id: string; p_actor_id?: string | null };
        Returns: string; // reconciliation_run_id
      };
      reconcile_vat_period: {
        Args: { p_period_id: string; p_vat_period_id: string; p_actor_id?: string | null };
        Returns: string; // reconciliation_run_id
      };
      reconcile_deferred_revenue: {
        Args: { p_period_id: string; p_actor_id?: string | null };
        Returns: string; // reconciliation_run_id
      };
      // ── Phase 4E: Period close SECURITY DEFINER functions ──────────────────
      validate_period_for_close: {
        Args: { p_period_id: string; p_actor_id?: string | null };
        Returns: Json;
      };
      capture_period_audit_snapshot: {
        Args: { p_period_id: string; p_snapshot_type: string; p_notes?: string | null; p_actor_id?: string | null };
        Returns: string; // snapshot_id
      };
      soft_close_period: {
        Args: { p_period_id: string; p_notes?: string | null; p_actor_id?: string | null };
        Returns: undefined;
      };
      reopen_soft_closed_period: {
        Args: { p_period_id: string; p_reason: string; p_actor_id?: string | null };
        Returns: undefined;
      };
      hard_close_period: {
        Args: { p_period_id: string; p_notes?: string | null; p_actor_id?: string | null };
        Returns: undefined;
      };
      post_amendment_journal: {
        Args: { p_period_id: string; p_lines: Json; p_reason: string; p_actor_id?: string | null };
        Returns: string; // journal_entry_id
      };
      // ── Phase 4E: Fiscal year SECURITY DEFINER functions ───────────────────
      create_fiscal_year: {
        Args: {
          p_org_id:       string;
          p_year_number:  number;
          p_year_start:   string;
          p_year_end:     string;
          p_notes?:       string | null;
          p_actor_id?:    string | null;
        };
        Returns: string; // fiscal_year_id
      };
      assign_period_to_fiscal_year: {
        Args: { p_period_id: string; p_fiscal_year_id: string; p_is_year_end?: boolean; p_actor_id?: string | null };
        Returns: undefined;
      };
      validate_fiscal_year_for_close: {
        Args: { p_fiscal_year_id: string; p_actor_id?: string | null };
        Returns: Json;
      };
      post_retained_earnings_entry: {
        Args: { p_fiscal_year_id: string; p_actor_id?: string | null };
        Returns: string; // journal_entry_id
      };
      close_fiscal_year: {
        Args: { p_fiscal_year_id: string; p_actor_id?: string | null };
        Returns: undefined;
      };
      rollover_opening_balances: {
        Args: { p_fiscal_year_id: string; p_target_period_id: string; p_actor_id?: string | null };
        Returns: number; // count of accounts rolled over
      };
      // ── Phase 4E: Audit & consistency SECURITY DEFINER functions ───────────
      verify_period_audit_snapshot: {
        Args: { p_snapshot_id: string };
        Returns: Json;
      };
      run_ledger_consistency_check: {
        Args: { p_period_id: string; p_check_type: string; p_actor_id?: string | null };
        Returns: string; // check_id
      };
      generate_reconciliation_report: {
        Args: { p_period_id: string; p_actor_id?: string | null };
        Returns: Json;
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
      // ── Phase 4F: Payroll journal SECURITY DEFINER functions ────────────────
      create_payroll_run: {
        Args: {
          p_org_id:                string;
          p_financial_period_id?:  string | null;
          p_pay_period_start:      string;
          p_pay_period_end:        string;
          p_pay_date:              string;
          p_run_type?:             PayrollRunTypeEnum;
          p_correction_of_run_id?: string | null;
          p_notes?:                string | null;
          p_actor_id?:             string | null;
        };
        Returns: string;
      };
      add_payroll_entry: {
        Args: {
          p_run_id:                string;
          p_employee_id:           string;
          p_gross_salary:          number;
          p_withheld_tax?:         number;
          p_employer_contrib_rate?: number;
          p_pension_amount?:       number;
          p_benefits_amount?:      number;
          p_instructor_id?:        string | null;
          p_notes?:                string | null;
          p_actor_id?:             string | null;
        };
        Returns: string;
      };
      post_payroll_journal: {
        Args: { p_run_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      post_salary_payment: {
        Args: {
          p_run_id:        string;
          p_payment_date:  string;
          p_bank_account?: string;
          p_actor_id?:     string | null;
        };
        Returns: string;
      };
      reverse_payroll_run: {
        Args: { p_run_id: string; p_reason: string; p_actor_id?: string | null };
        Returns: string;
      };
      update_payroll_run_totals: {
        Args: { p_run_id: string };
        Returns: undefined;
      };
      // ── Phase 4F: Tax & VAT clearing SECURITY DEFINER functions ────────────
      create_tax_remittance: {
        Args: {
          p_org_id:                    string;
          p_financial_period_id?:      string | null;
          p_payroll_run_id?:           string | null;
          p_declaration_period_start?: string | null;
          p_declaration_period_end?:   string | null;
          p_due_date?:                 string | null;
          p_withheld_tax_amount:       number;
          p_employer_contrib_amount:   number;
          p_notes?:                    string | null;
          p_actor_id?:                 string | null;
        };
        Returns: string;
      };
      post_tax_clearing_journal: {
        Args: { p_remittance_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      post_tax_payment_journal: {
        Args: {
          p_remittance_id: string;
          p_payment_date:  string;
          p_reference?:    string | null;
          p_actor_id?:     string | null;
        };
        Returns: string;
      };
      complete_tax_remittance: {
        Args: { p_remittance_id: string; p_actor_id?: string | null };
        Returns: undefined;
      };
      create_vat_clearing_run: {
        Args: {
          p_org_id:              string;
          p_financial_period_id: string;
          p_vat_period_id?:      string | null;
          p_run_date?:           string | null;
          p_notes?:              string | null;
          p_actor_id?:           string | null;
        };
        Returns: string;
      };
      post_vat_clearing_journal: {
        Args: { p_run_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      post_vat_payment_journal: {
        Args: {
          p_run_id:        string;
          p_payment_date:  string;
          p_actor_id?:     string | null;
        };
        Returns: string;
      };
      // ── Phase 4F: Opening balance SECURITY DEFINER functions ────────────────
      post_opening_balance_entry: {
        Args: {
          p_org_id:     string;
          p_period_id:  string;
          p_balances:   Json;
          p_notes?:     string | null;
          p_actor_id?:  string | null;
        };
        Returns: string;
      };
      validate_opening_balances: {
        Args: { p_org_id: string; p_period_id: string };
        Returns: Json;
      };
      post_year_end_profit_transfer: {
        Args: {
          p_org_id:          string;
          p_new_period_id:   string;
          p_prior_period_id: string;
          p_actor_id?:       string | null;
        };
        Returns: string | null;
      };
      // ── Phase 4F: Regulatory export SECURITY DEFINER functions ─────────────
      generate_agi_export: {
        Args: {
          p_org_id:          string;
          p_payroll_run_id:  string;
          p_notes?:          string | null;
          p_actor_id?:       string | null;
        };
        Returns: string;
      };
      lock_agi_export: {
        Args: {
          p_agi_export_id: string;
          p_receipt?:      string | null;
          p_actor_id?:     string | null;
        };
        Returns: undefined;
      };
      verify_agi_export_integrity: {
        Args: { p_agi_export_id: string };
        Returns: Json;
      };
      generate_regulatory_audit_export: {
        Args: {
          p_org_id:      string;
          p_period_id:   string;
          p_export_type: RegulatoryExportTypeEnum;
          p_notes?:      string | null;
          p_actor_id?:   string | null;
        };
        Returns: string;
      };
      // ── Phase 4G: Fixed Assets SECURITY DEFINER functions ─────────────────
      register_fixed_asset: {
        Args: {
          p_org_id:              string;
          p_period_id:           string;
          p_asset_class_id:      string;
          p_asset_code:          string;
          p_asset_name:          string;
          p_acquisition_date:    string;
          p_acquisition_cost:    number;
          p_residual_value?:     number;
          p_useful_life_months?: number;
          p_depreciation_method?: DepreciationMethodEnum;
          p_credit_account?:     string;
          p_description?:        string | null;
          p_notes?:              string | null;
          p_actor_id?:           string | null;
        };
        Returns: string;
      };
      generate_depreciation_schedule: {
        Args: { p_asset_id: string; p_actor_id?: string | null };
        Returns: number;
      };
      post_depreciation_period: {
        Args: { p_asset_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      post_asset_disposal: {
        Args: {
          p_asset_id:      string;
          p_period_id:     string;
          p_disposal_type: AssetDisposalTypeEnum;
          p_disposal_date: string;
          p_proceeds?:     number;
          p_notes?:        string | null;
          p_actor_id?:     string | null;
        };
        Returns: string;
      };
      post_impairment_adjustment: {
        Args: {
          p_asset_id:          string;
          p_period_id:         string;
          p_impairment_date:   string;
          p_impairment_amount: number;
          p_reason?:           string | null;
          p_actor_id?:         string | null;
        };
        Returns: string;
      };
      // ── Phase 4G: Accrual SECURITY DEFINER functions ───────────────────────
      create_accrual_schedule: {
        Args: {
          p_org_id:                string;
          p_period_id?:            string | null;
          p_accrual_type:          AccrualTypeEnum;
          p_description:           string;
          p_total_amount:          number;
          p_start_date:            string;
          p_release_months:        number;
          p_release_debit_account: string;
          p_release_credit_account: string;
          p_initial_debit_account?: string | null;
          p_initial_credit_account?: string | null;
          p_notes?:                string | null;
          p_actor_id?:             string | null;
        };
        Returns: string;
      };
      post_accrual_release: {
        Args: { p_schedule_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      cancel_accrual_schedule: {
        Args: { p_schedule_id: string; p_reason: string; p_actor_id?: string | null };
        Returns: undefined;
      };
      // ── Phase 4G: Deferred Revenue SECURITY DEFINER functions ─────────────
      create_periodic_deferred_schedule: {
        Args: {
          p_org_id:               string;
          p_period_id?:           string | null;
          p_source_type:          string;
          p_source_id:            string;
          p_description:          string;
          p_total_amount:         number;
          p_start_date:           string;
          p_release_months:       number;
          p_deferral_account?:    string;
          p_recognition_account?: string;
          p_notes?:               string | null;
          p_actor_id?:            string | null;
        };
        Returns: string;
      };
      post_periodic_deferred_release: {
        Args: { p_schedule_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      validate_deferred_release_integrity: {
        Args: { p_org_id: string; p_period_id: string };
        Returns: Json;
      };
      // ── Phase 4G: Fiscal Integrity SECURITY DEFINER functions ─────────────
      validate_chronological_close_dependencies: {
        Args: { p_org_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: Json;
      };
      run_accounting_replay_validation: {
        Args: { p_org_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: Json;
      };
      generate_canonical_accounting_export: {
        Args: {
          p_org_id:    string;
          p_period_id: string;
          p_notes?:    string | null;
          p_actor_id?: string | null;
        };
        Returns: string;
      };
      run_multi_year_fiscal_integrity_check: {
        Args: { p_org_id: string; p_fiscal_year_id: string; p_actor_id?: string | null };
        Returns: Json;
      };

      // ── Phase 4H: Replayable Ledger Governance ───────────────────────────────

      replay_period_state: {
        Args: { p_org_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: Json;
      };
      validate_balance_reconstruction: {
        Args: { p_org_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: Json;
      };
      supersede_schedule_generation: {
        Args: {
          p_org_id:        string;
          p_schedule_type: ScheduleGenerationTypeEnum;
          p_source_id:     string;
          p_lines_count:   number;
          p_total_amount:  number;
          p_reason?:       string | null;
          p_actor_id?:     string | null;
        };
        Returns: string;
      };
      validate_close_dependencies: {
        Args: { p_org_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: Json;
      };
      reopen_period_safe: {
        Args: { p_org_id: string; p_period_id: string; p_reason: string; p_actor_id?: string | null };
        Returns: Json;
      };
      orchestrate_subledger_close: {
        Args: { p_org_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: Json;
      };
      replay_fiscal_year: {
        Args: { p_org_id: string; p_fiscal_year_id: string; p_actor_id?: string | null };
        Returns: Json;
      };
      validate_replay_integrity: {
        Args: { p_org_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: Json;
      };
      generate_replay_snapshot: {
        Args: { p_org_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      generate_canonical_replay_export: {
        Args: { p_org_id: string; p_period_id: string; p_notes?: string | null; p_actor_id?: string | null };
        Returns: string;
      };

      // ── Phase 4H-A: Accounting Architecture Stabilization ────────────────

      certify_period_replay: {
        Args: { p_org_id: string; p_period_id: string; p_actor_id?: string | null };
        Returns: Json;
      };
      generate_integrity_certificate: {
        Args: { p_org_id: string; p_fiscal_year_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      enqueue_replay_job: {
        Args: {
          p_org_id:          string;
          p_period_id?:      string | null;
          p_fiscal_year_id?: string | null;
          p_job_type?:       ReplayJobTypeEnum;
          p_priority?:       number;
          p_actor_id?:       string | null;
        };
        Returns: string;
      };
      dequeue_replay_job: {
        Args: { p_org_id: string };
        Returns: Json;
      };
      complete_replay_job: {
        Args: { p_job_id: string; p_result?: Json | null; p_error?: string | null };
        Returns: undefined;
      };

      // ── Phase 5A: Swedish compliance + regulatory reporting ──────────────────
      generate_agi_submission: {
        Args: { p_org_id: string; p_agi_export_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      certify_agi_submission: {
        Args: { p_submission_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      generate_vat_declaration: {
        Args: { p_org_id: string; p_vat_period_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      certify_vat_declaration: {
        Args: { p_declaration_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      generate_saf_t_export: {
        Args: { p_org_id: string; p_period_start: string; p_period_end: string; p_scope?: SaftExportScopeEnum; p_actor_id?: string | null };
        Returns: string;
      };
      validate_filing_replay: {
        Args: { p_org_id: string; p_filing_type: FilingEntityTypeEnum; p_filing_id: string };
        Returns: Json;
      };
      create_vat_correction: {
        Args: { p_org_id: string; p_original_declaration_id: string; p_correction_type: VatCorrectionTypeEnum; p_description: string; p_actor_id?: string | null };
        Returns: Json;
      };
      create_agi_correction: {
        Args: { p_org_id: string; p_original_submission_id: string; p_correction_reason: AgiCorrectionReasonEnum; p_description: string; p_actor_id?: string | null };
        Returns: Json;
      };
      enforce_retention_policy: {
        Args: { p_org_id: string; p_policy_type: RetentionPolicyTypeEnum; p_reference_date?: string; p_actor_id?: string | null };
        Returns: Json;
      };
      generate_compliance_hash: {
        Args: { p_entity_type: string; p_entity_id: string; p_content: Json };
        Returns: string;
      };
      // Phase 5A.1 deterministic replay hardening functions
      canonical_jsonb: {
        Args: { p_input: Json };
        Returns: Json;
      };
      normalize_decimal: {
        Args: { p_value: number; p_scale?: number };
        Returns: string;
      };
      generate_replay_safe_hash: {
        Args: { p_entity_type: string; p_entity_id: string; p_content: Json };
        Returns: string;
      };
      canonicalize_export_payload: {
        Args: { p_payload: Json };
        Returns: Json;
      };
      canonical_xml_hash: {
        Args: { p_entity_type: string; p_org_id: string; p_period_start: string; p_period_end: string; p_content: Json };
        Returns: string;
      };
      assert_replay_determinism: {
        Args: { p_org_id: string; p_entity_type: string; p_entity_id: string };
        Returns: Json;
      };
      create_certification_snapshot: {
        Args: { p_org_id: string; p_entity_type: string; p_entity_id: string; p_actor_id?: string | null };
        Returns: string;
      };
      validate_certification_replay: {
        Args: { p_snapshot_id: string };
        Returns: Json;
      };
      // Phase 5A.2 canonical payload builder RPCs
      build_agi_canonical_payload: {
        Args: { p_total_gross: number; p_total_withheld_tax: number; p_total_employer_contrib: number };
        Returns: Json;
      };
      build_vat_canonical_payload: {
        Args: { p_box05_taxable_turnover: number; p_box10_output_vat_25: number; p_box11_output_vat_12: number; p_box12_output_vat_6: number; p_box30_input_vat: number };
        Returns: Json;
      };
      build_saft_canonical_payload: {
        Args: { p_org_id: string; p_period_start: string; p_period_end: string; p_export_scope: string; p_journal_entry_count: number; p_transaction_count: number; p_account_count: number };
        Returns: Json;
      };
      build_sie4_canonical_payload: {
        Args: { p_org_id: string; p_fiscal_year_id: string; p_period_start: string; p_period_end: string; p_entry_count: number; p_account_count: number };
        Returns: Json;
      };
      build_invoice_canonical_payload: {
        Args: { p_org_id: string; p_invoice_number: string; p_student_id: string; p_total_amount: number; p_tax_amount: number; p_invoice_date: string };
        Returns: Json;
      };
      build_canonical_payload: {
        Args: { p_entity_type: string; p_entity_id: string; p_org_id: string };
        Returns: Json;
      };
      canonical_decimal: {
        Args: { p_value: number; p_scale?: number };
        Returns: string;
      };
      canonical_date: {
        Args: { p_value: string };
        Returns: string;
      };
      canonical_uuid: {
        Args: { p_value: string };
        Returns: string;
      };
      canonical_text: {
        Args: { p_value: string };
        Returns: string;
      };
      canonical_monetary_json: {
        Args: { p_amount: number; p_currency?: string };
        Returns: Json;
      };
      canonical_entity_serializer: {
        Args: { p_entity_type: string; p_fields: Json };
        Returns: Json;
      };
      canonical_sort_key: {
        Args: { p_obj: Json; p_keys: string[] };
        Returns: string;
      };
      canonical_collection: {
        Args: { p_array: Json; p_sort_key?: string };
        Returns: Json;
      };
      run_canonical_validation_suite: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      // Phase 5B: Filing Certification & Regulatory Sealing
      certify_regulatory_filing: {
        Args: {
          p_org_id: string;
          p_entity_type: FilingEntityTypeEnum;
          p_entity_id: string;
          p_certification_type?: RegulatoryCertificationTypeEnum;
          p_reason?: string;
          p_actor_id?: string;
        };
        Returns: Json;
      };
      generate_filing_certificate: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_actor_id?: string };
        Returns: Json;
      };
      verify_filing_certificate: {
        Args: { p_certification_id: string };
        Returns: Json;
      };
      build_regulatory_evidence_package: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_actor_id?: string };
        Returns: Json;
      };
      generate_export_chain_hash: {
        Args: { p_hashes: string[] };
        Returns: string;
      };
      build_certification_manifest: {
        Args: {
          p_entity_type: string;
          p_entity_id: string;
          p_canonical_hash: string;
          p_certificate_hash: string;
          p_lineage_chain_hash: string;
          p_certification_ids: Json;
          p_snapshot_ids: Json;
          p_assertion_ids: Json;
          p_serializer_version: string;
          p_replay_profile: string;
        };
        Returns: Json;
      };
      verify_export_lineage: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string };
        Returns: Json;
      };
      generate_replay_certificate: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_actor_id?: string };
        Returns: Json;
      };
      run_phase5b_validation_suite: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      // Phase 5C: Cryptographic Trust & Authority Submission
      generate_signature_payload: {
        Args: { p_certification_id: string };
        Returns: Json;
      };
      sign_regulatory_certificate: {
        Args: { p_org_id: string; p_cert_id: string; p_signing_key_id: string; p_actor_id?: string };
        Returns: Json;
      };
      verify_certificate_signature: {
        Args: { p_signature_id: string };
        Returns: Json;
      };
      register_authority_receipt: {
        Args: {
          p_org_id: string;
          p_entity_type: FilingEntityTypeEnum;
          p_entity_id: string;
          p_envelope_id: string;
          p_authority_name: string;
          p_authority_reference: string;
          p_submission_hash: string;
          p_receipt_payload: Json;
          p_acknowledgment_ref?: string;
          p_actor_id?: string;
        };
        Returns: Json;
      };
      verify_authority_receipt: {
        Args: { p_receipt_id: string };
        Returns: Json;
      };
      build_submission_envelope: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_actor_id?: string };
        Returns: Json;
      };
      generate_trust_chain_hash: {
        Args: { p_hashes: string[] };
        Returns: string;
      };
      verify_submission_integrity: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string };
        Returns: Json;
      };
      run_phase5c_validation_suite: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      // Phase 5D: Transport Trust & Regulatory Delivery
      register_regulatory_endpoint: {
        Args: {
          p_endpoint_key:       string;
          p_authority_name:     string;
          p_protocol:           string;
          p_endpoint_version?:  string;
          p_eidas_compatible?:  boolean;
          p_trust_material?:    string;
          p_authority_metadata?: Json;
          p_transport_metadata?: Json;
          p_actor_id?:          string;
        };
        Returns: Json;
      };
      verify_endpoint_trust: {
        Args: { p_endpoint_id: string };
        Returns: Json;
      };
      build_transport_manifest: {
        Args: {
          p_org_id:      string;
          p_entity_type: FilingEntityTypeEnum;
          p_entity_id:   string;
          p_endpoint_id: string;
          p_actor_id?:   string;
        };
        Returns: Json;
      };
      generate_delivery_chain_hash: {
        Args: { p_hashes: string[] };
        Returns: string;
      };
      create_submission_delivery: {
        Args: {
          p_org_id:                string;
          p_entity_type:           FilingEntityTypeEnum;
          p_entity_id:             string;
          p_transport_manifest_id: string;
          p_prior_delivery_id?:    string;
          p_actor_id?:             string;
        };
        Returns: Json;
      };
      register_delivery_attempt: {
        Args: {
          p_org_id:                   string;
          p_delivery_id:              string;
          p_outcome:                  DeliveryAttemptOutcomeEnum;
          p_transport_response?:      Json;
          p_authority_acknowledgment?: string;
          p_acknowledged_at?:         string;
          p_actor_id?:                string;
        };
        Returns: Json;
      };
      verify_delivery_integrity: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string };
        Returns: Json;
      };
      finalize_regulatory_delivery: {
        Args: { p_org_id: string; p_delivery_id: string; p_actor_id?: string };
        Returns: Json;
      };
      run_phase5d_validation_suite: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      // Phase 5E PKI trust infrastructure RPCs
      register_trust_anchor: {
        Args: {
          p_anchor_id: string; p_common_name: string; p_organization: string;
          p_jurisdiction?: string; p_public_key_material: string;
          p_validity_not_before: string; p_validity_not_after: string;
          p_eidas_compatible?: boolean; p_trust_material?: string;
          p_parent_lineage_hash?: string; p_actor_id?: string;
        };
        Returns: Json;
      };
      register_certificate_chain: {
        Args: {
          p_chain_id: string; p_trust_anchor_id: string;
          p_endpoint_id?: string; p_subject_cn: string; p_subject_org: string;
          p_issuer_cn: string; p_issuer_org: string;
          p_cert_material: string; p_issuer_material: string;
          p_issuer_lineage?: Json; p_validity_not_before: string;
          p_validity_not_after: string; p_algorithm?: string; p_actor_id?: string;
        };
        Returns: Json;
      };
      validate_certificate_chain: {
        Args: { p_chain_id: string };
        Returns: Json;
      };
      verify_revocation_status: {
        Args: { p_chain_id: string };
        Returns: Json;
      };
      register_signed_authority_receipt: {
        Args: {
          p_org_id: string; p_authority_receipt_id: string;
          p_detached_signature: string; p_certificate_chain_id?: string;
          p_signature_algorithm?: string; p_authority_certificate_ref?: string;
          p_actor_id?: string;
        };
        Returns: Json;
      };
      verify_authority_signature: {
        Args: { p_signed_receipt_id: string };
        Returns: Json;
      };
      verify_transport_authenticity: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string };
        Returns: Json;
      };
      generate_nonrepudiation_hash: {
        Args: { p_entity_id: string; p_payload_hash: string; p_signature_value: string };
        Returns: string;
      };
      run_phase5e_validation_suite: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      // Phase 5F temporal evidence RPCs
      generate_temporal_chain_hash: {
        Args: { p_hashes: string[] };
        Returns: string;
      };
      register_timestamp_authority: {
        Args: {
          p_authority_id: string; p_common_name: string; p_organization: string;
          p_jurisdiction?: string; p_public_key_material: string;
          p_validity_not_before: string; p_validity_not_after: string;
          p_trust_anchor_id?: string; p_parent_lineage_hash?: string;
          p_eidas_compatible?: boolean; p_actor_id?: string;
        };
        Returns: Json;
      };
      issue_timestamp_evidence: {
        Args: {
          p_org_id: string; p_entity_type: FilingEntityTypeEnum;
          p_entity_id: string; p_authority_id: string;
          p_timestamp_value: string; p_payload_hash: string;
          p_timestamp_signature: string; p_actor_id?: string;
        };
        Returns: Json;
      };
      verify_timestamp_signature: {
        Args: { p_evidence_id: string };
        Returns: Json;
      };
      verify_temporal_nonrepudiation: {
        Args: { p_evidence_id: string };
        Returns: Json;
      };
      validate_certificate_at_timestamp: {
        Args: { p_chain_id: string; p_at_timestamp: string };
        Returns: Json;
      };
      validate_revocation_at_timestamp: {
        Args: { p_chain_id: string; p_at_timestamp: string };
        Returns: Json;
      };
      reconstruct_historical_trust_state: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_at_timestamp: string };
        Returns: Json;
      };
      verify_temporal_chain_integrity: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string };
        Returns: Json;
      };
      create_temporal_snapshot: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_at_timestamp: string; p_actor_id?: string };
        Returns: Json;
      };
      generate_temporal_replay_certificate: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_at_timestamp: string; p_actor_id?: string };
        Returns: Json;
      };
      run_phase5f_validation_suite: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      // Phase 5F-Audit: Serializer Registry
      register_serializer_profile: {
        Args: { p_serializer_key: string; p_serializer_version: string; p_canonicalization_strategy: string; p_introduced_phase: string; p_replay_compatible?: boolean; p_deterministic?: boolean; p_chronology_compatible?: boolean; p_evidence_compatible?: boolean; p_trust_reconstruction_compatible?: boolean; p_replay_notes?: string; p_actor_id?: string };
        Returns: Json;
      };
      validate_serializer_compatibility: {
        Args: { p_serializer_key: string; p_check_chronology?: boolean; p_check_evidence?: boolean; p_check_trust?: boolean };
        Returns: Json;
      };
      reconstruct_serializer_version: {
        Args: { p_serializer_key: string; p_serializer_version: string; p_canonicalization_strategy: string };
        Returns: Json;
      };
      verify_serializer_replay_compatibility: {
        Args: { p_serializer_key: string };
        Returns: Json;
      };
      // Phase 5F-Audit: Security Context
      assert_temporal_security_context: {
        Args: { p_org_id: string; p_actor_id?: string };
        Returns: Json;
      };
      // Phase 5F-Audit: Scalability
      create_replay_range_window: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_window_start: string; p_window_end: string; p_actor_id?: string };
        Returns: Json;
      };
      prepare_chronology_archive_batch: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_start_seq: number; p_end_seq: number; p_actor_id?: string };
        Returns: Json;
      };
      // Phase 5F-Audit: Validation Suite
      run_phase5f_audit_validation_suite: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      // Phase 6A: Replay Test Harness
      run_replay_test: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_test_type?: string; p_actor_id?: string };
        Returns: Json;
      };
      run_full_replay_reconstruction: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_at_timestamp: string; p_actor_id?: string };
        Returns: Json;
      };
      validate_replay_determinism: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_at_timestamp: string; p_iterations?: number; p_actor_id?: string };
        Returns: Json;
      };
      compare_replay_runs: {
        Args: { p_run_id_1: string; p_run_id_2: string };
        Returns: Json;
      };
      generate_replay_reproducibility_report: {
        Args: { p_org_id: string; p_run_id_1: string; p_run_id_2: string; p_actor_id?: string };
        Returns: Json;
      };
      // Phase 6A: Serializer Drift Detection
      detect_serializer_drift: {
        Args: { p_serializer_key: string };
        Returns: Json;
      };
      verify_schema_hash_integrity: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      compare_serializer_versions: {
        Args: { p_serializer_key: string; p_from_version: string; p_to_version: string };
        Returns: Json;
      };
      validate_replay_schema_evolution: {
        Args: { p_serializer_key: string; p_from_version: string; p_to_version: string; p_backward_compatible?: boolean; p_breaking_change?: boolean; p_actor_id?: string };
        Returns: Json;
      };
      generate_serializer_drift_report: {
        Args: { p_org_id: string; p_serializer_key: string; p_actor_id?: string };
        Returns: Json;
      };
      // Phase 6A: Replay Benchmarking
      benchmark_replay_engine: {
        Args: { p_org_id: string; p_scale_factor?: number; p_actor_id?: string };
        Returns: Json;
      };
      benchmark_temporal_snapshots: {
        Args: { p_org_id: string; p_scale_factor?: number; p_actor_id?: string };
        Returns: Json;
      };
      benchmark_replay_certificates: {
        Args: { p_org_id: string; p_scale_factor?: number; p_actor_id?: string };
        Returns: Json;
      };
      benchmark_serializer_validation: {
        Args: { p_org_id: string; p_scale_factor?: number; p_actor_id?: string };
        Returns: Json;
      };
      generate_replay_performance_report: {
        Args: { p_org_id: string; p_benchmark_type?: string; p_actor_id?: string };
        Returns: Json;
      };
      // Phase 6A: Backup/Restore Validation
      validate_replay_after_restore: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_pre_restore_hash: string; p_actor_id?: string };
        Returns: Json;
      };
      validate_temporal_chain_after_restore: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_actor_id?: string };
        Returns: Json;
      };
      compare_pre_post_restore_hashes: {
        Args: { p_pre_hash: string; p_post_hash: string };
        Returns: Json;
      };
      validate_restore_reproducibility: {
        Args: { p_org_id: string; p_pre_backup_hash: string; p_post_restore_hash: string; p_actor_id?: string };
        Returns: Json;
      };
      generate_restore_integrity_report: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_actor_id?: string };
        Returns: Json;
      };
      // Phase 6A: Tenant Isolation Validation
      validate_tenant_replay_isolation: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_actor_id?: string };
        Returns: Json;
      };
      simulate_cross_tenant_access: {
        Args: { p_requesting_org_id: string; p_target_org_id: string; p_entity_id?: string; p_actor_id?: string };
        Returns: Json;
      };
      validate_security_definer_boundaries: {
        Args: { p_org_id: string; p_actor_id?: string };
        Returns: Json;
      };
      validate_replay_access_controls: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_actor_id?: string };
        Returns: Json;
      };
      generate_tenant_isolation_report: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_actor_id?: string };
        Returns: Json;
      };
      // Phase 6A: Operational Resilience
      run_replay_health_check: {
        Args: { p_org_id: string; p_actor_id?: string };
        Returns: Json;
      };
      validate_chronology_integrity: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_actor_id?: string };
        Returns: Json;
      };
      detect_replay_chain_corruption: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_actor_id?: string };
        Returns: Json;
      };
      validate_temporal_snapshot_integrity: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_at_timestamp: string; p_actor_id?: string };
        Returns: Json;
      };
      detect_replay_hash_divergence: {
        Args: { p_org_id: string; p_entity_type: FilingEntityTypeEnum; p_entity_id: string; p_baseline_hash: string; p_actor_id?: string };
        Returns: Json;
      };
      // Phase 6A: Global Validation Suite
      run_phase6a_validation_suite: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      // Phase 6B DevOps, Replay CI/CD & Production Operations
      run_replay_ci_pipeline: {
        Args: { p_org_id: string; p_actor_id: string };
        Returns: Json;
      };
      validate_migration_reproducibility: {
        Args: { p_org_id: string; p_migration_ver: string; p_pre_hash: string; p_post_hash: string; p_actor_id: string };
        Returns: Json;
      };
      verify_post_deploy_replay_integrity: {
        Args: { p_org_id: string; p_deploy_ver: string; p_actor_id: string };
        Returns: Json;
      };
      execute_replay_smoke_tests: {
        Args: { p_org_id: string; p_run_id: string; p_actor_id: string };
        Returns: Json;
      };
      generate_deployment_integrity_report: {
        Args: { p_org_id: string; p_deploy_ver: string; p_actor_id: string };
        Returns: Json;
      };
      run_shadow_rebuild_validation: {
        Args: { p_org_id: string; p_rebuild_ver: string; p_actor_id: string };
        Returns: Json;
      };
      compare_primary_vs_shadow_replay: {
        Args: { p_primary_hash: string; p_shadow_hash: string };
        Returns: Json;
      };
      validate_shadow_replay_equivalence: {
        Args: { p_org_id: string; p_primary_hash: string; p_shadow_hash: string; p_actor_id: string };
        Returns: Json;
      };
      detect_rebuild_divergence: {
        Args: { p_org_id: string; p_run_id: string; p_primary_hash: string; p_shadow_hash: string; p_actor_id: string };
        Returns: Json;
      };
      generate_shadow_rebuild_report: {
        Args: { p_org_id: string; p_rebuild_ver: string; p_actor_id: string };
        Returns: Json;
      };
      simulate_cold_restore_validation: {
        Args: { p_org_id: string; p_sim_ver: string; p_actor_id: string };
        Returns: Json;
      };
      validate_restore_replay_equivalence: {
        Args: { p_org_id: string; p_pre_hash: string; p_post_hash: string; p_actor_id: string };
        Returns: Json;
      };
      compare_restore_hashes: {
        Args: { p_pre_hash: string; p_post_hash: string };
        Returns: Json;
      };
      benchmark_restore_reconstruction: {
        Args: { p_org_id: string; p_run_id: string; p_elements: number; p_elapsed_ms: number; p_actor_id: string };
        Returns: Json;
      };
      generate_restore_simulation_report: {
        Args: { p_org_id: string; p_sim_ver: string; p_actor_id: string };
        Returns: Json;
      };
      create_replay_archive_batch: {
        Args: { p_org_id: string; p_entity_type: string; p_elements_count: number; p_chain_before: string; p_actor_id: string };
        Returns: Json;
      };
      validate_archive_replay_integrity: {
        Args: { p_org_id: string; p_batch_id: string; p_actor_id: string };
        Returns: Json;
      };
      verify_archive_hash_continuity: {
        Args: { p_chain_before: string; p_chain_after: string; p_entity_type: string; p_elements_count: number };
        Returns: Json;
      };
      reconstruct_replay_from_archive: {
        Args: { p_org_id: string; p_batch_id: string; p_actor_id: string };
        Returns: Json;
      };
      generate_archive_integrity_report: {
        Args: { p_org_id: string; p_actor_id: string };
        Returns: Json;
      };
      collect_replay_operational_metrics: {
        Args: { p_org_id: string; p_actor_id: string };
        Returns: Json;
      };
      calculate_chronology_growth_rate: {
        Args: { p_org_id: string; p_actor_id: string };
        Returns: Json;
      };
      detect_replay_integrity_anomalies: {
        Args: { p_org_id: string; p_actor_id: string };
        Returns: Json;
      };
      validate_operational_replay_health: {
        Args: { p_org_id: string; p_actor_id: string };
        Returns: Json;
      };
      generate_operability_report: {
        Args: { p_org_id: string; p_actor_id: string };
        Returns: Json;
      };
      detect_replay_anomalies: {
        Args: { p_org_id: string; p_entity_type: string; p_entity_id: string | null; p_actor_id: string };
        Returns: Json;
      };
      detect_chronology_discontinuities: {
        Args: { p_org_id: string; p_entity_type: string; p_entity_id: string | null; p_actor_id: string };
        Returns: Json;
      };
      validate_replay_chain_integrity: {
        Args: { p_org_id: string; p_entity_type: string; p_entity_id: string | null; p_actor_id: string };
        Returns: Json;
      };
      detect_serializer_divergence: {
        Args: { p_org_id: string; p_serializer_key: string; p_expected_hash: string; p_actor_id: string };
        Returns: Json;
      };
      generate_replay_anomaly_report: {
        Args: { p_org_id: string; p_entity_type: string; p_entity_id: string | null; p_actor_id: string };
        Returns: Json;
      };
      run_phase6b_validation_suite: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
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
      // Phase 4B enums
      refund_status:              RefundStatusEnum;
      refund_type:                RefundTypeEnum;
      refund_reason_code:         RefundReasonCodeEnum;
      discount_type:              DiscountTypeEnum;
      discount_scope:             DiscountScopeEnum;
      dunning_action_type:        DunningActionTypeEnum;
      accounting_export_format:   AccountingExportFormatEnum;
      // Phase 4C Swedish finance enums
      vat_period_frequency:       VatPeriodFrequencyEnum;
      vat_period_status:          VatPeriodStatusEnum;
      fortnox_sync_status:        FortnoxSyncStatusEnum;
      // Phase 4D double-entry ledger enums
      journal_entry_type:         JournalEntryTypeEnum;
      journal_entry_status:       JournalEntryStatusEnum;
      // Phase 4E reconciliation + financial close enums
      bank_statement_status:      BankStatementStatusEnum;
      bank_line_status:           BankLineStatusEnum;
      reconciliation_type:        ReconciliationTypeEnum;
      reconciliation_run_status:  ReconciliationRunStatusEnum;
      reconciliation_item_status: ReconciliationItemStatusEnum;
      // Phase 4F payroll & regulatory accounting enums
      payroll_run_status:         PayrollRunStatusEnum;
      payroll_run_type:           PayrollRunTypeEnum;
      tax_remittance_status:      TaxRemittanceStatusEnum;
      agi_export_status:          AgiExportStatusEnum;
      // Phase 4G fixed assets + accrual enums
      fixed_asset_status:    FixedAssetStatusEnum;
      depreciation_method:   DepreciationMethodEnum;
      asset_disposal_type:   AssetDisposalTypeEnum;
      accrual_type:          AccrualTypeEnum;
      accrual_status:        AccrualStatusEnum;
      // Phase 4H replayable ledger governance enums
      ledger_replay_status:       LedgerReplayStatusEnum;
      ledger_replay_type:         LedgerReplayTypeEnum;
      schedule_generation_type:   ScheduleGenerationTypeEnum;
      subledger_type:             SubledgerTypeEnum;
      subledger_close_status:     SubledgerCloseStatusEnum;
      fiscal_dependency_type:     FiscalDependencyTypeEnum;
      replay_divergence_type:     ReplayDivergenceTypeEnum;
      replay_validation_type:     ReplayValidationTypeEnum;
      replay_validation_status:   ReplayValidationStatusEnum;
      replay_hash_type:           ReplayHashTypeEnum;
      // Phase 4H-A accounting architecture stabilization enums
      accounting_layer_type:        AccountingLayerTypeEnum;
      replay_delta_type:            ReplayDeltaTypeEnum;
      replay_certification_status:  ReplayCertificationStatusEnum;
      replay_job_type:              ReplayJobTypeEnum;
      replay_job_status:            ReplayJobStatusEnum;
      canonical_export_type:        CanonicalExportTypeEnum;
      // Phase 5A Swedish compliance + regulatory reporting enums
      compliance_event_type:            ComplianceEventTypeEnum;
      agi_submission_status:            AgiSubmissionStatusEnum;
      agi_correction_reason:            AgiCorrectionReasonEnum;
      vat_declaration_status:           VatDeclarationStatusEnum;
      vat_correction_type:              VatCorrectionTypeEnum;
      filing_entity_type:               FilingEntityTypeEnum;
      filing_certification_status:      FilingCertificationStatusEnum;
      saft_export_status:               SaftExportStatusEnum;
      saft_export_scope:                SaftExportScopeEnum;
      retention_policy_type:            RetentionPolicyTypeEnum;
      retention_enforcement_outcome:    RetentionEnforcementOutcomeEnum;
      // Phase 5A.1 deterministic compliance replay hardening enums
      replay_assertion_type:            ReplayAssertionTypeEnum;
      replay_assertion_status:          ReplayAssertionStatusEnum;
      canonicalization_profile_type:    CanonicalizationProfileTypeEnum;
      // Phase 5B filing certification & regulatory sealing enums
      regulatory_certification_type:    RegulatoryCertificationTypeEnum;
      // Phase 5C cryptographic trust enums
      eidas_level_type:                 EidasLevelTypeEnum;
      // Phase 5D transport trust enums
      delivery_status:                  DeliveryStatusEnum;
      delivery_attempt_outcome:         DeliveryAttemptOutcomeEnum;
      // Phase 5E PKI trust infrastructure enums
      certificate_revocation_state:     CertificateRevocationStateEnum;
      // Phase 5F temporal evidence enums
      timestamp_authority_status:       TimestampAuthorityStatusEnum;
      // Phase 6A platform stabilization enums
      replay_test_status:               ReplayTestStatusEnum;
      serializer_drift_type:            SerializerDriftTypeEnum;
      replay_access_violation_type:     ReplayAccessViolationTypeEnum;
      replay_alert_type:                ReplayAlertTypeEnum;
      replay_alert_severity:            ReplayAlertSeverityEnum;
      replay_health_status:             ReplayHealthStatusEnum;
      // Phase 6B DevOps, Replay CI/CD & Production Operations enums
      replay_ci_status:                 ReplayCiStatusEnum;
      shadow_rebuild_status:            ShadowRebuildStatusEnum;
      restore_simulation_status:        RestoreSimulationStatusEnum;
      archive_lifecycle_status:         ArchiveLifecycleStatusEnum;
      replay_anomaly_type:              ReplayAnomalyTypeEnum;
    };
  };
}
