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

export const notificationBellKeys = {
  all:       ['notifications-bell'] as const,
  recent:    (limit: number) => [...notificationBellKeys.all, 'recent', limit] as const,
  failedDot: () => [...notificationBellKeys.all, 'failed-dot'] as const,
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetchNotifications(qs: string): Promise<NotificationListResponse> {
  const fn = qs ? `notifications?${qs}` : 'notifications';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const { data, error } = await supabase.functions.invoke<NotificationListResponse>(fn, {
      method: 'GET',
      signal: controller.signal,
    });
    if (error) {
      if (error.name === 'FunctionsFetchError') {
        const ctx = (error as unknown as { context?: unknown }).context;
        if (
          (ctx instanceof DOMException || ctx instanceof Error) &&
          ctx.name === 'AbortError'
        ) {
          throw new DOMException('Notification fetch timed out after 10 s', 'AbortError');
        }
      }
      throw error;
    }
    if (!data) throw new Error('Inget svar från servern');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useRecentActivity(limit = 8, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: notificationBellKeys.recent(limit),
    queryFn:  () => apiFetchNotifications(
      `per_page=${limit}&sort_by=created_at&sort_dir=desc`
    ),
    enabled:   options?.enabled ?? true,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}

export function useNotificationDot(options?: { enabled?: boolean }): boolean {
  const { data } = useQuery({
    queryKey: notificationBellKeys.failedDot(),
    queryFn:  async () => {
      try {
        const result = await apiFetchNotifications('status=failed&per_page=1');
        return (result.meta.total ?? 0) > 0;
      } catch {
        return false;
      }
    },
    enabled:   options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? false;
}
