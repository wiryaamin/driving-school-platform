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
      organization_status: OrganizationStatusEnum;
      subscription_tier:   SubscriptionTierEnum;
      subscription_status: SubscriptionStatusEnum;
      location_status:     LocationStatusEnum;
      membership_status:   MembershipStatusEnum;
      audit_operation:     AuditOperationEnum;
      language_code:       LanguageCodeEnum;
      event_outbox_status: EventOutboxStatusEnum;
      event_channel:       EventChannelEnum;
    };
  };
}
