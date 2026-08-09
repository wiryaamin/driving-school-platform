import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnnouncementSeverity = 'info' | 'warning' | 'critical';

export interface Announcement {
  id:           string;
  title:        string;
  body:         string;
  severity:     AnnouncementSeverity;
  is_active:    boolean;
  published_at: string;
  expires_at:   string | null;
  created_by:   string | null;
  created_at:   string;
  updated_at:   string;
}

export interface CreateAnnouncementInput {
  title:       string;
  body:        string;
  severity:    AnnouncementSeverity;
  expires_at?: string | null;
}

export interface UpdateAnnouncementInput {
  id:          string;
  title?:      string;
  body?:       string;
  severity?:   AnnouncementSeverity;
  is_active?:  boolean;
  expires_at?: string | null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePlatformAnnouncements() {
  return useQuery({
    queryKey: ['platform', 'announcements'],
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: Announcement[] }>(
        'platform-admin/announcements',
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAnnouncementInput): Promise<Announcement> => {
      const { data, error } = await supabase.functions.invoke<{ data: Announcement }>(
        'platform-admin/announcements',
        { method: 'POST', body: input },
      );
      if (error) throw new Error(error.message);
      if (!data?.data) throw new Error('No announcement returned');
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform', 'announcements'] }),
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateAnnouncementInput): Promise<Announcement> => {
      const { data, error } = await supabase.functions.invoke<{ data: Announcement }>(
        `platform-admin/announcements/${id}`,
        { method: 'PATCH', body: patch },
      );
      if (error) throw new Error(error.message);
      if (!data?.data) throw new Error('No announcement returned');
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform', 'announcements'] }),
  });
}
