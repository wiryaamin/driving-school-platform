import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformSubscription {
  org_id:              string;
  org_name:            string;
  org_slug:            string;
  org_status:          string;
  subscription_tier:   string;
  subscription_status: string;
  trial_ends_at:       string | null;
  max_users:           number;
  max_locations:       number;
  created_at:          string;
  student_count:       number;
  instructor_count:    number;
  member_count:        number;
}

export interface PlatformSubscriptionDetail extends PlatformSubscription {
  legal_name:     string;
  org_number:     string | null;
  settings:       Record<string, unknown>;
  metadata:       Record<string, unknown>;
  updated_at:     string;
  vehicle_count:  number;
  booking_count:  number;
  package_count:  number;
}

export interface SubscriptionHistoryEvent {
  id:             string;
  event_type:     string;
  actor_id:       string | null;
  actor_email:    string | null;
  occurred_at:    string;
  old_tier:       string | null;
  new_tier:       string | null;
  old_status:     string | null;
  new_status:     string | null;
  old_trial_ends: string | null;
  new_trial_ends: string | null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePlatformSubscriptions() {
  return useQuery({
    queryKey: ['platform', 'subscriptions'],
    queryFn: async (): Promise<PlatformSubscription[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformSubscription[] }>(
        'platform-admin/subscriptions',
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 120_000,
    retry: 1,
  });
}

export function usePlatformSubscriptionDetail(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'subscriptions', orgId, 'detail'],
    enabled:  !!orgId,
    queryFn: async (): Promise<PlatformSubscriptionDetail> => {
      const { data, error } = await supabase.functions.invoke<{ data: PlatformSubscriptionDetail }>(
        `platform-admin/subscriptions/${orgId!}`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      if (!data?.data) throw new Error('Prenumeration hittades inte');
      return data.data;
    },
    staleTime: 60_000,
    retry: 1,
  });
}

export function usePlatformSubscriptionHistory(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'subscriptions', orgId, 'history'],
    enabled:  !!orgId,
    queryFn: async (): Promise<SubscriptionHistoryEvent[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: SubscriptionHistoryEvent[] }>(
        `platform-admin/subscriptions/${orgId!}/history`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 120_000,
    retry: 1,
  });
}
