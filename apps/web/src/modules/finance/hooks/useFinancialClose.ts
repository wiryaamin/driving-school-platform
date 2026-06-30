import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PeriodStatus    = 'open' | 'closed' | 'locked';
export type FiscalYearStatus = 'open' | 'closing' | 'closed';

export interface PeriodReadiness {
  period_id:                string;
  organization_id:          string;
  period_name:              string;
  period_start:             string;
  period_end:               string;
  status:                   PeriodStatus;
  amendment_count:          number;
  close_validated_at:       string | null;
  closed_at:                string | null;
  locked_at:                string | null;
  trial_balance_debit:      number;
  trial_balance_credit:     number;
  trial_balance_balanced:   boolean;
  posted_entry_count:       number;
  bank_reconciled:          boolean;
  ar_reconciled:            boolean;
  vat_reconciled:           boolean;
  deferred_reconciled:      boolean;
  soft_close_snapshot_exists: boolean;
  hard_close_snapshot_exists: boolean;
}

export interface FiscalYearOverview {
  fiscal_year_id:           string;
  organization_id:          string;
  year_number:              number;
  year_start:               string;
  year_end:                 string;
  fiscal_year_status:       FiscalYearStatus;
  retained_earnings_entry_id: string | null;
  closed_at:                string | null;
  total_periods:            number;
  open_periods:             number;
  soft_closed_periods:      number;
  hard_closed_periods:      number;
  year_end_period_id:       string | null;
  year_end_period_status:   string | null;
  first_period_start:       string | null;
  last_period_end:          string | null;
}

export interface AuditSnapshot {
  id:                 string;
  organization_id:    string;
  financial_period_id: string;
  snapshot_type:      string;
  notes:              string | null;
  captured_at:        string;
  hash:               string | null;
}

export interface ConsistencyCheck {
  id:                 string;
  organization_id:    string;
  financial_period_id: string;
  check_type:         string;
  passed:             boolean | null;
  issues_found:       number;
  created_at:         string;
}

export interface ValidationResult {
  all_passed: boolean;
  checks:     Array<{ name: string; passed: boolean; detail: string | null }>;
}

// ─── Query keys ──────────────────────────────────────────────────────────────

export const closeKeys = {
  all:          ['financial-close'] as const,
  readiness:    ()           => [...closeKeys.all, 'readiness']             as const,
  fiscalYears:  ()           => [...closeKeys.all, 'fiscal-years']          as const,
  snapshots:    (id: string) => [...closeKeys.all, 'snapshots', id]         as const,
  checks:       (id: string) => [...closeKeys.all, 'checks', id]            as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePeriodReadiness() {
  return useQuery({
    queryKey: closeKeys.readiness(),
    queryFn:  async (): Promise<PeriodReadiness[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: PeriodReadiness[] }>(
        'financial-close/periods/readiness', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useFiscalYears() {
  return useQuery({
    queryKey: closeKeys.fiscalYears(),
    queryFn:  async (): Promise<FiscalYearOverview[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: FiscalYearOverview[] }>(
        'financial-close/fiscal-years', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function usePeriodSnapshots(periodId: string | null) {
  return useQuery({
    queryKey: closeKeys.snapshots(periodId ?? ''),
    queryFn:  async (): Promise<AuditSnapshot[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: AuditSnapshot[] }>(
        `financial-close/periods/${periodId}/snapshots`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(periodId),
    staleTime: 20_000,
  });
}

export function usePeriodChecks(periodId: string | null) {
  return useQuery({
    queryKey: closeKeys.checks(periodId ?? ''),
    queryFn:  async (): Promise<ConsistencyCheck[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: ConsistencyCheck[] }>(
        `financial-close/periods/${periodId}/checks?limit=10`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(periodId),
    staleTime: 20_000,
  });
}

function invalidateClose(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: closeKeys.all });
}

export function useValidatePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string): Promise<ValidationResult> => {
      const { data, error } = await supabase.functions.invoke<ValidationResult>(
        `financial-close/periods/${periodId}/validate`, { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { all_passed: false, checks: [] };
    },
    onSuccess: () => invalidateClose(qc),
  });
}

export function useSoftClosePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ periodId, notes }: { periodId: string; notes?: string | undefined }) => {
      const { error } = await supabase.functions.invoke(
        `financial-close/periods/${periodId}/soft-close`,
        { method: 'POST', body: { notes } },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateClose(qc),
  });
}

export function useReopenPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ periodId, reason }: { periodId: string; reason: string }) => {
      const { error } = await supabase.functions.invoke(
        `financial-close/periods/${periodId}/reopen`,
        { method: 'POST', body: { reason } },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateClose(qc),
  });
}

export function useHardClosePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ periodId, notes }: { periodId: string; notes?: string | undefined }) => {
      const { error } = await supabase.functions.invoke(
        `financial-close/periods/${periodId}/hard-close`,
        { method: 'POST', body: { notes } },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateClose(qc),
  });
}

export function useCaptureSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ periodId, notes }: { periodId: string; notes?: string | undefined }) => {
      const { data, error } = await supabase.functions.invoke<{ snapshot_id: string }>(
        `financial-close/periods/${periodId}/snapshot`,
        { method: 'POST', body: { snapshot_type: 'manual', notes } },
      );
      if (error) throw error;
      return data ?? { snapshot_id: '' };
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: closeKeys.snapshots(vars.periodId) });
    },
  });
}

export function useRunConsistencyCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string) => {
      const { data, error } = await supabase.functions.invoke<{ check_id: string }>(
        `financial-close/periods/${periodId}/consistency`,
        { method: 'POST', body: { check_type: 'manual' } },
      );
      if (error) throw error;
      return data ?? { check_id: '' };
    },
    onSuccess: (_, periodId) => {
      void qc.invalidateQueries({ queryKey: closeKeys.checks(periodId) });
      void qc.invalidateQueries({ queryKey: closeKeys.readiness() });
    },
  });
}

export function useCreateFiscalYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      year_number: number;
      year_start:  string;
      year_end:    string;
      notes?:      string | undefined;
    }) => {
      const { data, error } = await supabase.functions.invoke<{ fiscal_year_id: string }>(
        'financial-close/fiscal-years', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? { fiscal_year_id: '' };
    },
    onSuccess: () => invalidateClose(qc),
  });
}

export function useValidateFiscalYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fyId: string): Promise<ValidationResult> => {
      const { data, error } = await supabase.functions.invoke<ValidationResult>(
        `financial-close/fiscal-years/${fyId}/validate`, { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { all_passed: false, checks: [] };
    },
    onSuccess: () => invalidateClose(qc),
  });
}

export function usePostRetainedEarnings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fyId: string) => {
      const { data, error } = await supabase.functions.invoke<{ journal_entry_id: string }>(
        `financial-close/fiscal-years/${fyId}/retained-earnings`, { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { journal_entry_id: '' };
    },
    onSuccess: () => invalidateClose(qc),
  });
}

export function useCloseFiscalYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fyId: string) => {
      const { error } = await supabase.functions.invoke(
        `financial-close/fiscal-years/${fyId}/close`, { method: 'POST' },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateClose(qc),
  });
}

export function useRolloverOpeningBalances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fyId, targetPeriodId }: { fyId: string; targetPeriodId: string }) => {
      const { data, error } = await supabase.functions.invoke<{ accounts_rolled_over: number }>(
        `financial-close/fiscal-years/${fyId}/rollover`,
        { method: 'POST', body: { target_period_id: targetPeriodId } },
      );
      if (error) throw error;
      return data ?? { accounts_rolled_over: 0 };
    },
    onSuccess: () => invalidateClose(qc),
  });
}
