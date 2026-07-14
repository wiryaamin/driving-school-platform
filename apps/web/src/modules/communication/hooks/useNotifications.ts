import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationStatus  = 'pending' | 'sent' | 'delivered' | 'failed' | 'cancelled';
export type NotificationChannel = 'email' | 'sms' | 'push' | 'internal';
export type RecipientType       = 'student' | 'instructor' | 'admin' | 'profile';

export interface Notification {
  id:               string;
  organization_id:  string;
  recipient_id:     string;
  recipient_type:   RecipientType;
  channel:          NotificationChannel;
  template_key:     string;
  locale:           string;
  subject:          string | null;
  body:             string | null;
  metadata:         Record<string, unknown>;
  idempotency_key:  string | null;
  scheduled_for:    string | null;
  status:           NotificationStatus;
  status_changed_at: string | null;
  reference_type:   string | null;
  reference_id:     string | null;
  sent_at:          string | null;
  failed_at:        string | null;
  failure_reason:   string | null;
  created_at:       string;
}

export interface NotificationPreference {
  id:                string;
  organization_id:   string;
  profile_id:        string;
  channel:           NotificationChannel;
  notification_type: string;
  enabled:           boolean;
  updated_at:        string;
}

export interface ListNotificationsParams {
  recipient_id?:  string | undefined;
  channel?:       NotificationChannel | undefined;
  status?:        NotificationStatus | undefined;
  template_key?:  string | undefined;
  from?:          string | undefined;
  to?:            string | undefined;
  page?:          number | undefined;
  per_page?:      number | undefined;
}

export interface NotificationListResponse {
  data:  Notification[];
  meta:  { page: number; per_page: number; total: number; total_pages: number };
}

export interface CreateNotificationInput {
  recipient_id:    string;
  recipient_type:  RecipientType;
  channel:         NotificationChannel;
  template_key:    string;
  locale?:         string;
  subject?:        string;
  body?:           string;
  scheduled_for?:  string;
  reference_type?: string;
  reference_id?:   string;
  metadata?:       Record<string, unknown>;
  idempotency_key?: string;
}

export interface UpsertPreferenceInput {
  profile_id:        string;
  channel:           NotificationChannel;
  notification_type: string;
  enabled:           boolean;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const notificationKeys = {
  all:         ['notifications-admin'] as const,
  list:        (p: ListNotificationsParams) => [...notificationKeys.all, 'list', p] as const,
  detail:      (id: string)                 => [...notificationKeys.all, 'detail', id] as const,
  preferences: (profileId: string)          => [...notificationKeys.all, 'prefs', profileId] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useNotificationList(params: ListNotificationsParams = {}) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn:  async (): Promise<NotificationListResponse> => {
      const qs = new URLSearchParams();
      if (params.recipient_id) qs.set('recipient_id', params.recipient_id);
      if (params.channel)      qs.set('channel',      params.channel);
      if (params.status)       qs.set('status',       params.status);
      if (params.template_key) qs.set('template_key', params.template_key);
      if (params.from)         qs.set('from',         params.from);
      if (params.to)           qs.set('to',           params.to);
      if (params.page)         qs.set('page',         String(params.page));
      if (params.per_page)     qs.set('per_page',     String(params.per_page));
      const path = qs.toString() ? `notifications?${qs.toString()}` : 'notifications';
      const { data, error } = await supabase.functions.invoke<NotificationListResponse>(
        path, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [], meta: { page: 1, per_page: 25, total: 0, total_pages: 0 } };
    },
    staleTime: 15_000,
  });
}

export function useNotificationDetail(id: string | null) {
  return useQuery({
    queryKey: notificationKeys.detail(id ?? ''),
    queryFn:  async (): Promise<Notification> => {
      const { data, error } = await supabase.functions.invoke<Notification>(
        `notifications/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('Notification not found');
      return data;
    },
    enabled:   Boolean(id),
    staleTime: 30_000,
  });
}

export function useNotificationPreferences(profileId: string | null) {
  return useQuery({
    queryKey: notificationKeys.preferences(profileId ?? ''),
    queryFn:  async (): Promise<NotificationPreference[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: NotificationPreference[] }>(
        `notifications/preferences/${profileId}`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(profileId),
    staleTime: 30_000,
  });
}

export function useCreateNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateNotificationInput): Promise<Notification> => {
      const { data, error } = await supabase.functions.invoke<Notification>(
        'notifications', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? ({} as Notification);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useCancelNotification(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<Notification> => {
      const { data, error } = await supabase.functions.invoke<Notification>(
        `notifications/${id}/cancel`, { method: 'PATCH' },
      );
      if (error) throw error;
      return data ?? ({} as Notification);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useUpsertPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertPreferenceInput): Promise<NotificationPreference> => {
      const { data, error } = await supabase.functions.invoke<NotificationPreference>(
        'notifications/preferences', { method: 'PUT', body: input },
      );
      if (error) throw error;
      return data ?? ({} as NotificationPreference);
    },
    onSuccess: (_data, vars) => void qc.invalidateQueries({ queryKey: notificationKeys.preferences(vars.profile_id) }),
  });
}
