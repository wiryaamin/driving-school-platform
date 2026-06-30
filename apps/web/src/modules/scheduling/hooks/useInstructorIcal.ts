import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IcalTokenResponse {
  token:    string;
  feed_url: string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const icalKeys = {
  all:   ['instructor-ical'] as const,
  token: () => [...icalKeys.all, 'token'] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useInstructorIcalToken() {
  return useQuery({
    queryKey: icalKeys.token(),
    queryFn:  async (): Promise<IcalTokenResponse> => {
      const { data, error } = await supabase.functions.invoke<{ data: IcalTokenResponse }>(
        'instructor-ical/token', { method: 'GET' },
      );
      if (error) throw error;
      if (!data?.data) throw new Error('Inget svar från servern');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useRefreshIcalToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<IcalTokenResponse> => {
      const { data, error } = await supabase.functions.invoke<{ data: IcalTokenResponse }>(
        'instructor-ical/token', { method: 'GET' },
      );
      if (error) throw error;
      if (!data?.data) throw new Error('Inget svar från servern');
      return data.data;
    },
    onSuccess: (fresh) => {
      qc.setQueryData(icalKeys.token(), fresh);
    },
  });
}
