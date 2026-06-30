import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformDashboardStats {
  total_orgs:           number;
  active_orgs:          number;
  trialing_orgs:        number;
  suspended_orgs:       number;
  past_due_orgs:        number;
  expired_trials:       number;
  active_subscriptions: number;
  platform_admin_count: number;
  tier_trial:           number;
  tier_starter:         number;
  tier_professional:    number;
  tier_enterprise:      number;
  trials_expiring_7d:   number;
}

export interface PlatformAdmin {
  id:         string;
  user_id:    string;
  role:       string;
  is_active:  boolean;
  granted_at: string;
  notes:      string | null;
  email:      string | null;
  first_name: string | null;
  last_name:  string | null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePlatformDashboardStats() {
  return useQuery({
    queryKey: ['platform', 'dashboard-stats'],
    queryFn: async (): Promise<PlatformDashboardStats> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformDashboardStats }>(
        'platform-admin/dashboard',
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      if (!data?.data) throw new Error('No dashboard data returned');
      return data.data;
    },
    staleTime: 60_000,
    retry: 1,
  });
}

export function usePlatformAdmins() {
  return useQuery({
    queryKey: ['platform', 'admins'],
    queryFn: async (): Promise<PlatformAdmin[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformAdmin[] }>(
        'platform-admin/admins',
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 120_000,
    retry: 1,
  });
}
