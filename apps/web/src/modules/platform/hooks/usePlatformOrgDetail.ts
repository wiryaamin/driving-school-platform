import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgCounts {
  org_id:           string;
  member_count:     number;
  student_count:    number;
  instructor_count: number;
}

export interface PlatformOrgDetail {
  id:                  string;
  slug:                string;
  name:                string;
  legal_name:          string;
  org_number:          string | null;
  status:              string;
  subscription_tier:   string;
  subscription_status: string;
  trial_ends_at:       string | null;
  max_users:           number;
  max_locations:       number;
  settings:            Record<string, unknown>;
  created_at:          string;
  updated_at:          string;
  internal_notes:            string | null;
  internal_notes_updated_at: string | null;
}

export interface PlatformOrgStats {
  student_count:    number;
  instructor_count: number;
  vehicle_count:    number;
  booking_count:    number;
  package_count:    number;
  member_count:     number;
}

export type MembershipStatus = 'active' | 'suspended';
export type InvitationStatus = 'pending' | 'accepted';

export interface PlatformOrgAdmin {
  user_id:            string;
  email:              string | null;
  first_name:         string | null;
  last_name:          string | null;
  role:               string;
  role_display:       string;
  membership_status:  MembershipStatus;
  invitation_status:  InvitationStatus;
  assigned_at:        string;
  last_sign_in_at:    string | null;
}

export interface PlatformOrgSecurityEvent {
  id:          string;
  event_type:  string;
  provider:    string;
  severity:    'info' | 'warning' | 'critical';
  user_id:     string | null;
  actor_email: string | null;
  ip_address:  string | null;
  occurred_at: string;
  metadata:    Record<string, unknown>;
}

export interface PlatformOrgCompliance {
  org_status: string;
  student_consent: {
    total_students: number;
    gdpr_consent_given_count: number;
    data_processing_consent_count: number;
    marketing_consent_count: number;
    email_opt_in_count: number;
    sms_opt_in_count: number;
  };
  regulatory_workflows: {
    total: number;
    overdue: number;
    confirmed: number;
  };
}

export interface PlatformOrgDeadLetter {
  id:               string;
  event_type:       string;
  channel:          string;
  retry_count:      number;
  last_error:       string | null;
  dead_lettered_at: string;
}

export interface PlatformOrgOperations {
  pending_count:        number;
  processing_count:     number;
  dead_letter_count:    number;
  failed_last_24h:      number;
  recent_dead_letters:  PlatformOrgDeadLetter[];
}

export interface PlatformOrgTimelineEvent {
  id:             string;
  event_type:     string;
  actor_id:       string | null;
  actor_email:    string | null;
  occurred_at:    string;
  changed_fields: string[] | null;
  new_values:     Record<string, unknown> | null;
  old_values:     Record<string, unknown> | null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePlatformOrgCounts() {
  return useQuery({
    queryKey: ['platform', 'org-counts'],
    queryFn: async (): Promise<OrgCounts[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: OrgCounts[] }>(
        'platform-admin/orgs/counts',
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 120_000,
    retry: 1,
  });
}

export function usePlatformOrgDetail(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'org', orgId, 'detail'],
    enabled:  !!orgId,
    queryFn: async (): Promise<PlatformOrgDetail> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformOrgDetail }>(
        `platform-admin/orgs/${orgId!}`,
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

export function usePlatformOrgStats(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'org', orgId, 'stats'],
    enabled:  !!orgId,
    queryFn: async (): Promise<PlatformOrgStats> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformOrgStats }>(
        `platform-admin/orgs/${orgId!}/stats`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      if (!data?.data) throw new Error('Statistik ej tillgänglig');
      return data.data;
    },
    staleTime: 120_000,
    retry: 1,
  });
}

export function usePlatformOrgAdmins(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'org', orgId, 'admins'],
    enabled:  !!orgId,
    queryFn: async (): Promise<PlatformOrgAdmin[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformOrgAdmin[] }>(
        `platform-admin/orgs/${orgId!}/admins`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 120_000,
    retry: 1,
  });
}

// Generalizes usePlatformOrgAdmins to every tenant user regardless of role
// (instructors, receptionists, etc., not just admin-tier) — same shape,
// same backing tables, role filter removed server-side. Powers the Users tab.
export function usePlatformOrgUsers(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'org', orgId, 'users'],
    enabled:  !!orgId,
    queryFn: async (): Promise<PlatformOrgAdmin[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformOrgAdmin[] }>(
        `platform-admin/orgs/${orgId!}/users`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 120_000,
    retry: 1,
  });
}

export function usePlatformOrgTimeline(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'org', orgId, 'timeline'],
    enabled:  !!orgId,
    queryFn: async (): Promise<PlatformOrgTimelineEvent[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformOrgTimelineEvent[] }>(
        `platform-admin/orgs/${orgId!}/timeline`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 120_000,
    retry: 1,
  });
}

export function usePlatformOrgSecurity(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'org', orgId, 'security'],
    enabled:  !!orgId,
    queryFn: async (): Promise<PlatformOrgSecurityEvent[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformOrgSecurityEvent[] }>(
        `platform-admin/orgs/${orgId!}/security`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 60_000,
    retry: 1,
  });
}

export function usePlatformOrgCompliance(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'org', orgId, 'compliance'],
    enabled:  !!orgId,
    queryFn: async (): Promise<PlatformOrgCompliance> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformOrgCompliance }>(
        `platform-admin/orgs/${orgId!}/compliance`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      if (!data?.data) throw new Error('Efterlevnadsdata ej tillgänglig');
      return data.data;
    },
    staleTime: 120_000,
    retry: 1,
  });
}

export function usePlatformOrgOperations(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'org', orgId, 'operations'],
    enabled:  !!orgId,
    queryFn: async (): Promise<PlatformOrgOperations> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformOrgOperations }>(
        `platform-admin/orgs/${orgId!}/operations`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      if (!data?.data) throw new Error('Driftdata ej tillgänglig');
      return data.data;
    },
    staleTime: 30_000,
    retry: 1,
  });
}
