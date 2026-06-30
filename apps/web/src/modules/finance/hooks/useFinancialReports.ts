import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RevenuePeriodRow {
  period_id:         string | null;
  period_name:       string | null;
  period_start:      string;
  period_end:        string;
  organization_id:   string;
  total_invoiced:    number;
  total_paid:        number;
  total_outstanding: number;
  invoice_count:     number;
  paid_invoice_count: number;
}

export interface VatSummaryRow {
  vat_rate:          number;
  output_vat:        number;
  input_vat:         number;
  net_vat:           number;
  invoice_count?:    number;
}

export interface AgingBucket {
  bucket:            string;
  invoice_count:     number;
  total_outstanding: number;
  oldest_due_date:   string | null;
}

export interface WalletLiabilityRow {
  lesson_category:    string;
  total_credits:      number;
  total_liability:    number;
  student_count:      number;
}

export interface OutstandingInvoice {
  id:                string;
  invoice_number:    string | null;
  student_id:        string | null;
  customer_name:     string | null;
  issue_date:        string;
  due_date:          string | null;
  total_amount:      number;
  amount_paid:       number;
  outstanding:       number;
  days_overdue:      number | null;
  status:            string;
}

export type ExportRunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ExportRunFormat = 'sie4' | 'csv' | 'json' | 'xlsx';

export interface AccountingExportRun {
  id:              string;
  organization_id: string;
  format:          ExportRunFormat;
  from_date:       string;
  to_date:         string;
  status:          ExportRunStatus;
  started_at:      string | null;
  completed_at:    string | null;
  entry_count:     number | null;
  error_message:   string | null;
  created_at:      string;
  created_by:      string | null;
}

export interface ChartOfAccountEntry {
  id:              string;
  organization_id: string;
  event_type:      string;
  account_debit:   string;
  account_credit:  string;
  description:     string | null;
  is_active:       boolean;
  created_at:      string;
  created_by:      string | null;
}

export interface CreateExportRunInput {
  format:    ExportRunFormat;
  from_date: string;
  to_date:   string;
}

export interface UpsertChartEntryInput {
  event_type:    string;
  account_debit: string;
  account_credit: string;
  description?:  string | undefined;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const finReportKeys = {
  all:         ['financial-reports'] as const,
  revenue:     ()                          => [...finReportKeys.all, 'revenue']         as const,
  vat:         (from: string, to: string)  => [...finReportKeys.all, 'vat', from, to]  as const,
  aging:       ()                          => [...finReportKeys.all, 'aging']           as const,
  wallet:      ()                          => [...finReportKeys.all, 'wallet']          as const,
  outstanding: ()                          => [...finReportKeys.all, 'outstanding']     as const,
  exports:     (page?: number)             => [...finReportKeys.all, 'exports', page ?? 1] as const,
  chart:       ()                          => [...finReportKeys.all, 'chart']           as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useRevenueReport() {
  return useQuery({
    queryKey: finReportKeys.revenue(),
    queryFn:  async (): Promise<RevenuePeriodRow[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: RevenuePeriodRow[] }>(
        'reports/revenue', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useVatReport(from: string, to: string) {
  return useQuery({
    queryKey: finReportKeys.vat(from, to),
    queryFn:  async (): Promise<VatSummaryRow[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: VatSummaryRow[] }>(
        `reports/vat?from=${from}&to=${to}`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(from && to),
    staleTime: 60_000,
  });
}

export function useAgingReport() {
  return useQuery({
    queryKey: finReportKeys.aging(),
    queryFn:  async (): Promise<AgingBucket[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: AgingBucket[] }>(
        'reports/aging', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useWalletLiabilityReport() {
  return useQuery({
    queryKey: finReportKeys.wallet(),
    queryFn:  async (): Promise<WalletLiabilityRow[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: WalletLiabilityRow[] }>(
        'reports/wallet', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useOutstandingReport() {
  return useQuery({
    queryKey: finReportKeys.outstanding(),
    queryFn:  async (): Promise<OutstandingInvoice[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: OutstandingInvoice[] }>(
        'reports/outstanding', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useExportRuns(page = 1) {
  return useQuery({
    queryKey: finReportKeys.exports(page),
    queryFn:  async (): Promise<{ data: AccountingExportRun[]; meta: { page: number; per_page: number; total: number } }> => {
      const { data, error } = await supabase.functions.invoke<{
        data: AccountingExportRun[];
        meta: { page: number; per_page: number; total: number };
      }>(`reports/exports?page=${page}&per_page=25`, { method: 'GET' });
      if (error) throw error;
      return data ?? { data: [], meta: { page: 1, per_page: 25, total: 0 } };
    },
    staleTime: 20_000,
  });
}

export function useChartOfAccounts() {
  return useQuery({
    queryKey: finReportKeys.chart(),
    queryFn:  async (): Promise<ChartOfAccountEntry[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: ChartOfAccountEntry[] }>(
        'reports/chart', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 120_000,
  });
}

export function useStartExportRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateExportRunInput): Promise<AccountingExportRun> => {
      const { data, error } = await supabase.functions.invoke<AccountingExportRun>(
        'reports/exports', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? ({} as AccountingExportRun);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: finReportKeys.exports() }),
  });
}

export function useUpsertChartEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertChartEntryInput): Promise<ChartOfAccountEntry> => {
      const { data, error } = await supabase.functions.invoke<ChartOfAccountEntry>(
        'reports/chart', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? ({} as ChartOfAccountEntry);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: finReportKeys.chart() }),
  });
}
