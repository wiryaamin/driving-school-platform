import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type JournalEntryType =
  | 'invoice_posted' | 'payment_posted' | 'void_posted'
  | 'deferred_revenue' | 'lesson_recognized'
  | 'depreciation' | 'payroll' | 'manual'
  | 'reversal' | 'correction';

export type JournalEntryStatus = 'posted' | 'reversed';

export interface JournalEntry {
  id:                   string;
  organization_id:      string;
  financial_period_id:  string;
  entry_type:           JournalEntryType;
  status:               JournalEntryStatus;
  voucher_series:       string | null;
  voucher_number:       number | null;
  entry_date:           string;
  description:          string | null;
  reference:            string | null;
  source_id:            string | null;
  reversed_by:          string | null;
  reversal_of:          string | null;
  created_at:           string;
  created_by:           string | null;
}

export interface JournalLine {
  id:            string;
  entry_id:      string;
  line_number:   number;
  account_code:  string;
  account_name:  string | null;
  debit_amount:  number;
  credit_amount: number;
  description:   string | null;
}

export interface JournalEntryWithLines extends JournalEntry {
  lines: JournalLine[];
}

export interface AccountBalance {
  id:                  string;
  financial_period_id: string;
  account_code:        string;
  account_name:        string | null;
  account_type:        string | null;
  debit_movement:      number;
  credit_movement:     number;
  net_balance:         number;
}

export interface TrialBalanceRow {
  account_code:   string;
  account_name:   string | null;
  account_type:   string | null;
  debit_movement: number;
  credit_movement: number;
  net_balance:    number;
}

export interface TrialBalanceResult {
  rows:          TrialBalanceRow[];
  total_debit:   number;
  total_credit:  number;
  is_balanced:   boolean;
}

export interface LedgerSIE4Export {
  id:                   string;
  organization_id:      string;
  financial_period_id:  string;
  from_date:            string;
  to_date:              string;
  content_hash:         string;
  entry_count:          number;
  account_count:        number;
  generated_at:         string;
  generated_by:         string | null;
}

export interface ListJournalEntriesParams {
  period_id:   string;
  entry_type?: string | undefined;
  status?:     string | undefined;
  page?:       number | undefined;
  per_page?:   number | undefined;
}

export interface JournalEntryListResponse {
  data:     JournalEntry[];
  total:    number;
  page:     number;
  per_page: number;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const ledgerKeys = {
  all:      ['ledger'] as const,
  entries:  (params: Partial<ListJournalEntriesParams>) =>
              [...ledgerKeys.all, 'entries', params] as const,
  entry:    (id: string) => [...ledgerKeys.all, 'entry', id]     as const,
  balance:  (periodId: string) => [...ledgerKeys.all, 'balance', periodId]  as const,
  trial:    (periodId: string) => [...ledgerKeys.all, 'trial',   periodId]  as const,
  sie4:     ()                 => [...ledgerKeys.all, 'sie4']               as const,
  sie4Item: (id: string)       => [...ledgerKeys.all, 'sie4', id]           as const,
};

function invalidateLedger(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ledgerKeys.all });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useJournalEntries(params: ListJournalEntriesParams | null) {
  return useQuery({
    queryKey: ledgerKeys.entries(params ?? {}),
    queryFn:  async (): Promise<JournalEntryListResponse> => {
      if (!params?.period_id) return { data: [], total: 0, page: 1, per_page: 50 };
      const qs = new URLSearchParams({ period_id: params.period_id });
      if (params.entry_type) qs.set('entry_type', params.entry_type);
      if (params.status)     qs.set('status',     params.status);
      if (params.page)       qs.set('page',        String(params.page));
      if (params.per_page)   qs.set('per_page',    String(params.per_page));
      const { data, error } = await supabase.functions.invoke<JournalEntryListResponse>(
        `ledger/journal-entries?${qs.toString()}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [], total: 0, page: 1, per_page: 50 };
    },
    enabled:   Boolean(params?.period_id),
    staleTime: 15_000,
  });
}

export function useJournalEntry(id: string | null) {
  return useQuery({
    queryKey: ledgerKeys.entry(id ?? ''),
    queryFn:  async (): Promise<JournalEntryWithLines> => {
      const { data, error } = await supabase.functions.invoke<JournalEntryWithLines>(
        `ledger/journal-entries/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('Journal entry not found');
      return data;
    },
    enabled:   Boolean(id),
    staleTime: 30_000,
  });
}

export function useTrialBalance(periodId: string | null) {
  return useQuery({
    queryKey: ledgerKeys.trial(periodId ?? ''),
    queryFn:  async (): Promise<TrialBalanceResult> => {
      const { data, error } = await supabase.functions.invoke<TrialBalanceResult>(
        `ledger/trial-balance?period_id=${periodId}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { rows: [], total_debit: 0, total_credit: 0, is_balanced: true };
    },
    enabled:   Boolean(periodId),
    staleTime: 20_000,
  });
}

export function useAccountBalances(periodId: string | null) {
  return useQuery({
    queryKey: ledgerKeys.balance(periodId ?? ''),
    queryFn:  async (): Promise<AccountBalance[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: AccountBalance[] }>(
        `ledger/account-balances?period_id=${periodId}`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(periodId),
    staleTime: 20_000,
  });
}

export function useLedgerSIE4Exports() {
  return useQuery({
    queryKey: ledgerKeys.sie4(),
    queryFn:  async (): Promise<LedgerSIE4Export[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: LedgerSIE4Export[] }>(
        'ledger/sie4', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useReverseJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entryId,
      reversalDate,
      reason,
    }: {
      entryId:       string;
      reversalDate?: string | undefined;
      reason?:       string | undefined;
    }): Promise<{ reversal_entry_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ reversal_entry_id: string }>(
        `ledger/journal-entries/${entryId}/reverse`,
        { method: 'POST', body: { reversal_date: reversalDate ?? null, reason: reason ?? null } },
      );
      if (error) throw error;
      return data ?? { reversal_entry_id: '' };
    },
    onSuccess: () => invalidateLedger(qc),
  });
}

export function useGenerateLedgerSIE4() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string): Promise<{ ledger_sie4_export_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ ledger_sie4_export_id: string }>(
        'ledger/sie4/generate',
        { method: 'POST', body: { period_id: periodId } },
      );
      if (error) throw error;
      return data ?? { ledger_sie4_export_id: '' };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ledgerKeys.sie4() }),
  });
}
