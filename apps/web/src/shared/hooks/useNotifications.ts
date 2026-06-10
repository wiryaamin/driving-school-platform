import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  organization_id: string;
  recipient_id: string;
  recipient_type: string;
  channel: string;
  template_key: string;
  subject: string | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

interface NotificationListResponse {
  data: Notification[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const notificationKeys = {
  all:       ['notifications'] as const,
  recent:    (limit: number) => [...notificationKeys.all, 'recent', limit] as const,
  failedDot: () => [...notificationKeys.all, 'failed-dot'] as const,
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetchNotifications(qs: string): Promise<NotificationListResponse> {
  const fn = qs ? `notifications?${qs}` : 'notifications';
  const { data, error } = await supabase.functions.invoke<NotificationListResponse>(fn, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useRecentActivity(limit = 8) {
  return useQuery({
    queryKey: notificationKeys.recent(limit),
    queryFn:  () => apiFetchNotifications(
      `per_page=${limit}&sort_by=created_at&sort_dir=desc`
    ),
    staleTime: 2 * 60 * 1000,
  });
}

export function useNotificationDot(): boolean {
  const { data } = useQuery({
    queryKey: notificationKeys.failedDot(),
    queryFn:  async () => {
      try {
        const result = await apiFetchNotifications('status=failed&per_page=1');
        return (result.meta.total ?? 0) > 0;
      } catch {
        return false;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
  return data ?? false;
}
