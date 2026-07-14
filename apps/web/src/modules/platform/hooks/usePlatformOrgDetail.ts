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
