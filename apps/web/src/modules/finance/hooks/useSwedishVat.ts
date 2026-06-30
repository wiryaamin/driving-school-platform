import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type VatPeriodStatus   = 'open' | 'populated' | 'locked' | 'filed';
export type VatPeriodFrequency = 'monthly' | 'quarterly';

export interface VatPeriod {
  id:                string;
  organization_id:   string;
  period_start:      string;
  period_end:        string;
  frequency:         VatPeriodFrequency;
  status:            VatPeriodStatus;
  filing_reference:  string | null;
  output_vat_total:  number | null;
  input_vat_total:   number | null;
  net_vat_payable:   number | null;
  entries_count:     number | null;
  locked_at:         string | null;
  actor_id:          string | null;
  created_at:        string;
}

export interface VatReportEntry {
  id:                  string;
  vat_period_id:       string;
  organization_id:     string;
  transaction_date:    string;
  invoice_id:          string | null;
  account_code:        string | null;
  account_name:        string | null;
  vat_code:            string | null;
  output_vat_amount:   number;
  input_vat_amount:    number;
  gross_amount:        number;
  net_amount:          number;
  description:         string | null;
  created_at:          string;
}

export interface VatRate {
  id:                 string;
  rate_name:          string;
  rate_percent:       number;
  bas_output_account: string | null;
  bas_input_account:  string | null;
  description:        string | null;
}

export interface BasAccountEntry {
  id:           string;
  account_code: string;
  account_name: string;
  account_type: string;
  is_active:    boolean;
  sort_order:   number | null;
}

// ─── Query keys ──────────────────────────────────────────────────────────────

export const vatKeys = {
  all:     ['swedish-vat'] as const,
  periods: (status?: string) => [...vatKeys.all, 'periods', status ?? 'all'] as const,
  period:  (id: string)      => [...vatKeys.all, 'period', id]               as const,
  entries: (id: string)      => [...vatKeys.all, 'entries', id]              as const,
  rates:   ()                => [...vatKeys.all, 'rates']                    as const,
  bas:     ()                => [...vatKeys.all, 'bas']                      as const,
};

function invalidateVat(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: vatKeys.all });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useVatPeriods(status?: string) {
  return useQuery({
    queryKey: vatKeys.periods(status),
    queryFn:  async (): Promise<VatPeriod[]> => {
      const qs = status ? `?status=${status}` : '';
      const { data, error } = await supabase.functions.invoke<{ data: VatPeriod[] }>(
        `swedish-vat/periods${qs}`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 20_000,
  });
}

export function useVatPeriod(id: string | null) {
  return useQuery({
    queryKey: vatKeys.period(id ?? ''),
    queryFn:  async (): Promise<VatPeriod> => {
      const { data, error } = await supabase.functions.invoke<VatPeriod>(
        `swedish-vat/periods/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('Period not found');
      return data;
    },
    enabled:   Boolean(id),
    staleTime: 15_000,
  });
}

export function useVatPeriodEntries(periodId: string | null) {
  return useQuery({
    queryKey: vatKeys.entries(periodId ?? ''),
    queryFn:  async (): Promise<VatReportEntry[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: VatReportEntry[] }>(
        `swedish-vat/periods/${periodId}/entries`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(periodId),
    staleTime: 15_000,
  });
}

export function useVatRates() {
  return useQuery({
    queryKey: vatKeys.rates(),
    queryFn:  async (): Promise<VatRate[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: VatRate[] }>(
        'swedish-vat/rates', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 300_000,
  });
}

export function useBasAccounts() {
  return useQuery({
    queryKey: vatKeys.bas(),
    queryFn:  async (): Promise<BasAccountEntry[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: BasAccountEntry[] }>(
        'swedish-vat/bas', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 300_000,
  });
}

export function useCreateVatPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      period_start: string;
      period_end:   string;
      frequency?:   VatPeriodFrequency;
    }): Promise<{ period_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ period_id: string }>(
        'swedish-vat/periods',
        { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? { period_id: '' };
    },
    onSuccess: () => invalidateVat(qc),
  });
}

export function usePopulateVatPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string): Promise<{ entries_inserted: number }> => {
      const { data, error } = await supabase.functions.invoke<{ entries_inserted: number }>(
        `swedish-vat/periods/${periodId}/populate`, { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { entries_inserted: 0 };
    },
    onSuccess: (_, periodId) => {
      void qc.invalidateQueries({ queryKey: vatKeys.period(periodId) });
      void qc.invalidateQueries({ queryKey: vatKeys.entries(periodId) });
      void qc.invalidateQueries({ queryKey: vatKeys.periods() });
    },
  });
}

export function useLockVatPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      periodId,
      filingReference,
    }: {
      periodId:        string;
      filingReference?: string | undefined;
    }) => {
      const { error } = await supabase.functions.invoke(
        `swedish-vat/periods/${periodId}/lock`,
        { method: 'POST', body: { filing_reference: filingReference ?? null } },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateVat(qc),
  });
}
