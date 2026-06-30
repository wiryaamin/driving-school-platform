import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SIE4Export {
  id:                string;
  organization_id:   string;
  export_run_id:     string | null;
  content_hash:      string | null;
  voucher_count:     number | null;
  transaction_count: number | null;
  from_date:         string | null;
  to_date:           string | null;
  fiscal_year_start: string | null;
  generated_at:      string;
  generated_by:      string | null;
}

export interface SIE4ExportDetail extends SIE4Export {
  content_text: string | null;
}

export interface GenerateSIE4Input {
  export_run_id: string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const sie4Keys = {
  all:       ['sie4'] as const,
  list:      (limit?: number) => [...sie4Keys.all, 'list', limit ?? 10] as const,
  detail:    (id: string)     => [...sie4Keys.all, 'detail', id]         as const,
  byRun:     (runId: string)  => [...sie4Keys.all, 'by-run', runId]      as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSIE4List(limit = 25) {
  return useQuery({
    queryKey: sie4Keys.list(limit),
    queryFn: async (): Promise<SIE4Export[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: SIE4Export[] }>(
        `sie4?limit=${limit}`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useSIE4Detail(id: string | null) {
  return useQuery({
    queryKey: sie4Keys.detail(id ?? ''),
    queryFn: async (): Promise<SIE4ExportDetail> => {
      const { data, error } = await supabase.functions.invoke<SIE4ExportDetail>(
        `sie4/${id!}`, { method: 'GET' },
      );
      if (error) throw error;
      return data!;
    },
    enabled: Boolean(id),
    staleTime: 120_000,
  });
}

export function useSIE4ByRun(exportRunId: string | null) {
  return useQuery({
    queryKey: sie4Keys.byRun(exportRunId ?? ''),
    queryFn: async (): Promise<SIE4ExportDetail> => {
      const { data, error } = await supabase.functions.invoke<SIE4ExportDetail>(
        `sie4/by-run/${exportRunId!}`, { method: 'GET' },
      );
      if (error) throw error;
      return data!;
    },
    enabled: Boolean(exportRunId),
    staleTime: 120_000,
  });
}

export function useGenerateSIE4() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateSIE4Input): Promise<{ sie4_export_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ sie4_export_id: string }>(
        'sie4/generate', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? { sie4_export_id: '' };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: sie4Keys.all }),
  });
}
