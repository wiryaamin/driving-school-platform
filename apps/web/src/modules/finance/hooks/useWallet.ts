import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreditLedgerEntry {
  id:               string;
  organization_id:  string;
  student_id:       string;
  lesson_category:  string;
  entry_type:       string;
  quantity:         number;
  currency:         string;
  reference_type:   string | null;
  description:      string | null;
  actor_id:         string | null;
  expires_at:       string | null;
  metadata:         Record<string, unknown> | null;
  created_at:       string;
}

export interface WalletLedgerMeta {
  page:     number;
  per_page: number;
  total:    number;
}

export interface WalletLedgerResponse {
  data: CreditLedgerEntry[];
  meta: WalletLedgerMeta;
}

export interface LedgerParams {
  student_id:       string;
  page?:            number | undefined;
  per_page?:        number | undefined;
  lesson_category?: string | undefined;
  entry_type?:      string | undefined;
  from?:            string | undefined;
  to?:              string | undefined;
}

export interface GrantCreditsInput {
  student_id:       string;
  lesson_category:  string;
  quantity:         number;
  description?:     string | undefined;
  expires_at?:      string | undefined;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const walletKeys = {
  all:    ['wallet-admin'] as const,
  ledger: (p: LedgerParams) => [...walletKeys.all, 'ledger', p] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useWalletLedger(params: LedgerParams) {
  return useQuery({
    queryKey: walletKeys.ledger(params),
    queryFn:  async (): Promise<WalletLedgerResponse> => {
      const sp = new URLSearchParams();
      sp.set('student_id', params.student_id);
      if (params.page            !== undefined) sp.set('page',             String(params.page));
      if (params.per_page        !== undefined) sp.set('per_page',         String(params.per_page));
      if (params.lesson_category !== undefined && params.lesson_category !== '') sp.set('lesson_category', params.lesson_category);
      if (params.entry_type      !== undefined && params.entry_type      !== '') sp.set('entry_type',      params.entry_type);
      if (params.from            !== undefined && params.from            !== '') sp.set('from',             params.from);
      if (params.to              !== undefined && params.to              !== '') sp.set('to',               params.to);

      const { data, error } = await supabase.functions.invoke<WalletLedgerResponse>(
        `wallet/ledger?${sp.toString()}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [], meta: { page: 1, per_page: 50, total: 0 } };
    },
    enabled:   Boolean(params.student_id),
    staleTime: 30_000,
  });
}

export function useGrantCredits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GrantCreditsInput): Promise<CreditLedgerEntry> => {
      const { data, error } = await supabase.functions.invoke<CreditLedgerEntry>(
        'wallet/grant', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data!;
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: walletKeys.ledger({ student_id: variables.student_id }) });
      void qc.invalidateQueries({ queryKey: ['finance', 'wallet', variables.student_id] });
    },
  });
}
