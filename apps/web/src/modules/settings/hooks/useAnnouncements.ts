import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnnouncementSeverity = 'info' | 'warning' | 'critical';

export interface Announcement {
  id:           string;
  title:        string;
  body:         string;
  severity:     AnnouncementSeverity;
  published_at: string;
  expires_at:   string | null;
}

// announcements is platform-wide content read directly via PostgREST — RLS
// (announcements_select_live) is what actually restricts this to currently
// published, non-expired rows; not present in @platform/types' hand-maintained
// Database stub yet, same escape hatch as useDemoRequests.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function announcementsTable() { return (supabase as any).from('announcements'); }

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await announcementsTable()
        .select('id, title, body, severity, published_at, expires_at')
        .order('published_at', { ascending: false });

      if (error) throw new Error((error as { message: string }).message);
      return (data ?? []) as Announcement[];
    },
    staleTime: 60_000,
  });
}
