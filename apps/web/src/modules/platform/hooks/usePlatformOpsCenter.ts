import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformAdminDetail {
  id:               string;
  user_id:          string;
  role:             string;
  is_active:        boolean;
  granted_at:       string;
  notes:            string | null;
  email:            string | null;
  first_name:       string | null;
  last_name:        string | null;
  last_sign_in_at:  string | null;
  mfa_enabled:      boolean;
}

export interface AuditLogRow {
  id:              string;
  organization_id: string | null;
  org_name:        string | null;
  actor_id:        string | null;
  actor_email:     string | null;
  entity_type:     string;
  entity_id:       string | null;
  operation:       string;
  table_name:      string | null;
  changed_fields:  string[] | null;
  occurred_at:     string;
  severity:        'critical' | 'high' | 'medium' | 'low';
}

export interface AuditLogPage {
  total: number;
  rows:  AuditLogRow[];
}

export interface SecurityEvent {
  id:              string;
  organization_id: string | null;
  org_name:        string | null;
  actor_id:        string | null;
  actor_email:     string | null;
  entity_type:     string;
  entity_id:       string | null;
  operation:       string;
  changed_fields:  string[] | null;
  new_values:      Record<string, unknown> | null;
  occurred_at:     string;
  severity:        'critical' | 'high' | 'medium' | 'low';
}

export interface OrgHealthContact {
  user_id:         string;
  email:           string | null;
  first_name:      string | null;
  last_name:       string | null;
  role:            string;
  role_display:    string | null;
  last_sign_in_at: string | null;
}

export interface OrgHealthEvent {
  id:           string;
  entity_type:  string;
  operation:    string;
  actor_email:  string | null;
  occurred_at:  string;
}

export interface OrgHealth {
  org_id:              string;
  org_name:            string;
  org_slug:            string;
  legal_name:          string | null;
  org_number:          string | null;
  org_status:          string;
  subscription_tier:   string;
  subscription_status: string;
  trial_ends_at:       string | null;
  max_users:           number;
  max_locations:       number;
  created_at:          string;
  member_count:        number;
  student_count:       number;
  instructor_count:    number;
  vehicle_count:       number;
  booking_count:       number;
  last_login_at:       string | null;
  last_activity_at:    string | null;
  primary_contact:     OrgHealthContact | null;
  recent_events:       OrgHealthEvent[];
}

export interface AuditFilters {
  orgId?:        string | null;
  actorEmail?:   string;
  entityType?:   string;
  operation?:    string;
  dateFrom?:     string;
  dateTo?:       string;
  limit:         number;
  offset:        number;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePlatformAdminsDetail() {
  return useQuery({
    queryKey: ['platform', 'platform-admins', 'detail'],
    queryFn:  async (): Promise<PlatformAdminDetail[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformAdminDetail[] }>(
        'platform-admin/platform-admins',
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 120_000,
    retry: 1,
  });
}

export function usePlatformAuditLog(filters: AuditFilters) {
  return useQuery({
    queryKey: ['platform', 'audit', 'log', filters],
    queryFn:  async (): Promise<AuditLogPage> => {
      const params = new URLSearchParams();
      if (filters.orgId)      params.set('org_id',      filters.orgId);
      if (filters.actorEmail) params.set('actor_email', filters.actorEmail);
      if (filters.entityType) params.set('entity_type', filters.entityType);
      if (filters.operation)  params.set('operation',   filters.operation);
      if (filters.dateFrom)   params.set('date_from',   filters.dateFrom);
      if (filters.dateTo)     params.set('date_to',     filters.dateTo);
      params.set('limit',  String(filters.limit));
      params.set('offset', String(filters.offset));

      const qs = params.toString();
      const { data, error } = await supabase.functions.invoke<{ data: AuditLogPage }>(
        `platform-admin/audit${qs ? `?${qs}` : ''}`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? { total: 0, rows: [] };
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function usePlatformSecurityEvents(limit = 100) {
  return useQuery({
    queryKey: ['platform', 'audit', 'security', limit],
    queryFn:  async (): Promise<SecurityEvent[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: SecurityEvent[] }>(
        `platform-admin/audit/security?limit=${limit}`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 60_000,
    retry: 1,
  });
}

export function usePlatformOrgHealth(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'support', 'health', orgId],
    enabled:  !!orgId,
    queryFn:  async (): Promise<OrgHealth> => {
      const { data, error } = await supabase.functions.invoke<{ data: OrgHealth }>(
        `platform-admin/support/orgs/${orgId!}/health`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      if (!data?.data) throw new Error('Organisation hittades inte');
      return data.data;
    },
    staleTime: 60_000,
    retry: 1,
  });
}
