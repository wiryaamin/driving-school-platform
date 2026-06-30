import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccrualType   = 'expense_prepaid' | 'income_accrued' | 'deferred_cost' | 'deferred_income' | string;
export type AccrualStatus = 'active' | 'completed' | 'cancelled';

export interface AccrualSchedule {
  id:                      string;
  organization_id:         string;
  financial_period_id:     string | null;
  accrual_type:            AccrualType;
  description:             string;
  total_amount:            number;
  released_amount:         number;
  remaining_amount:        number;
  start_date:              string;
  release_months:          number;
  months_released:         number;
  status:                  AccrualStatus;
  release_debit_account:   string;
  release_credit_account:  string;
  initial_debit_account:   string | null;
  initial_credit_account:  string | null;
  notes:                   string | null;
  cancelled_at:            string | null;
  cancel_reason:           string | null;
  created_at:              string;
  created_by:              string | null;
}

export interface AccrualReleaseLine {
  id:                  string;
  accrual_schedule_id: string;
  organization_id:     string;
  period_number:       number;
  release_date:        string;
  release_amount:      number;
  status:              'pending' | 'posted' | 'skipped';
  journal_entry_id:    string | null;
  posted_at:           string | null;
  created_at:          string;
}

export interface AccrualScheduleWithLines extends AccrualSchedule {
  lines: AccrualReleaseLine[];
}

export interface DeferredSchedule {
  id:                    string;
  organization_id:       string;
  financial_period_id:   string | null;
  source_type:           string;
  source_id:             string;
  description:           string;
  total_amount:          number;
  released_amount:       number;
  remaining_amount:      number;
  start_date:            string;
  release_months:        number;
  months_released:       number;
  is_fully_released:     boolean;
  deferral_account:      string;
  recognition_account:   string;
  notes:                 string | null;
  created_at:            string;
  created_by:            string | null;
}

export interface CreateAccrualInput {
  accrual_type:           AccrualType;
  description:            string;
  total_amount:           number;
  start_date:             string;
  release_months:         number;
  release_debit_account:  string;
  release_credit_account: string;
  initial_debit_account?: string | undefined;
  initial_credit_account?: string | undefined;
  period_id?:             string | undefined;
  notes?:                 string | undefined;
}

export interface CreateDeferredInput {
  source_type:           string;
  source_id:             string;
  description:           string;
  total_amount:          number;
  start_date:            string;
  release_months:        number;
  deferral_account?:     string;
  recognition_account?:  string;
  period_id?:            string;
  notes?:                string;
}

export interface ListAccrualsParams {
  status?:       string | undefined;
  accrual_type?: string | undefined;
  page?:         number | undefined;
  per_page?:     number | undefined;
}

export interface AccrualListResponse {
  data: AccrualSchedule[];
  meta: { page: number; per_page: number; total: number };
}

export interface DeferredListResponse {
  data: DeferredSchedule[];
  meta: { page: number; per_page: number; total: number };
}

export interface IntegrityResult {
  passed:  boolean;
  checks?: unknown[];
  errors?: unknown[];
  [key: string]: unknown;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const accrualKeys = {
  all:            ['accruals'] as const,
  schedules:      (p: ListAccrualsParams) => [...accrualKeys.all, 'schedules', p] as const,
  schedule:       (id: string)            => [...accrualKeys.all, 'schedule', id]  as const,
  deferred:       (activeOnly?: boolean)  => [...accrualKeys.all, 'deferred', activeOnly ?? false] as const,
  deferredItem:   (id: string)            => [...accrualKeys.all, 'deferred-item', id] as const,
  integrity:      (periodId: string)      => [...accrualKeys.all, 'integrity', periodId] as const,
};

function invalidateAccruals(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: accrualKeys.all });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAccrualSchedules(params: ListAccrualsParams = {}) {
  return useQuery({
    queryKey: accrualKeys.schedules(params),
    queryFn:  async (): Promise<AccrualListResponse> => {
      const qs = new URLSearchParams();
      if (params.status)       qs.set('status',      params.status);
      if (params.accrual_type) qs.set('accrual_type', params.accrual_type);
      if (params.page)         qs.set('page',         String(params.page));
      if (params.per_page)     qs.set('per_page',     String(params.per_page));
      const path = qs.toString() ? `accruals?${qs.toString()}` : 'accruals';
      const { data, error } = await supabase.functions.invoke<AccrualListResponse>(
        path, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [], meta: { page: 1, per_page: 50, total: 0 } };
    },
    staleTime: 20_000,
  });
}

export function useAccrualSchedule(id: string | null) {
  return useQuery({
    queryKey: accrualKeys.schedule(id ?? ''),
    queryFn:  async (): Promise<AccrualScheduleWithLines> => {
      const { data, error } = await supabase.functions.invoke<{ data: AccrualScheduleWithLines; lines: AccrualReleaseLine[] }>(
        `accruals/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('Accrual not found');
      return { ...data.data, lines: data.lines ?? [] };
    },
    enabled:   Boolean(id),
    staleTime: 15_000,
  });
}

export function useDeferredSchedules(activeOnly = false) {
  return useQuery({
    queryKey: accrualKeys.deferred(activeOnly),
    queryFn:  async (): Promise<DeferredListResponse> => {
      const qs = activeOnly ? '?active_only=true' : '';
      const { data, error } = await supabase.functions.invoke<DeferredListResponse>(
        `accruals/deferred${qs}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [], meta: { page: 1, per_page: 50, total: 0 } };
    },
    staleTime: 20_000,
  });
}

export function useDeferredSchedule(id: string | null) {
  return useQuery({
    queryKey: accrualKeys.deferredItem(id ?? ''),
    queryFn:  async (): Promise<DeferredSchedule> => {
      const { data, error } = await supabase.functions.invoke<{ data: DeferredSchedule }>(
        `accruals/deferred/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data?.data) throw new Error('Deferred schedule not found');
      return data.data;
    },
    enabled:   Boolean(id),
    staleTime: 15_000,
  });
}

export function useCreateAccrualSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAccrualInput): Promise<AccrualSchedule> => {
      const { data, error } = await supabase.functions.invoke<{ data: AccrualSchedule }>(
        'accruals', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data?.data ?? ({} as AccrualSchedule);
    },
    onSuccess: () => invalidateAccruals(qc),
  });
}

export function useReleaseAccrual(scheduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string): Promise<{ journal_entry_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ journal_entry_id: string }>(
        `accruals/${scheduleId}/release`,
        { method: 'POST', body: { period_id: periodId } },
      );
      if (error) throw error;
      return data ?? { journal_entry_id: '' };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accrualKeys.schedule(scheduleId) });
      void qc.invalidateQueries({ queryKey: accrualKeys.schedules({}) });
    },
  });
}

export function useCancelAccrual(scheduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason?: string): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `accruals/${scheduleId}/cancel`,
        { method: 'POST', body: { reason: reason ?? 'Cancelled' } },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateAccruals(qc),
  });
}

export function useCreateDeferredSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDeferredInput): Promise<DeferredSchedule> => {
      const { data, error } = await supabase.functions.invoke<{ data: DeferredSchedule }>(
        'accruals/deferred', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data?.data ?? ({} as DeferredSchedule);
    },
    onSuccess: () => invalidateAccruals(qc),
  });
}

export function useReleaseDeferredSchedule(scheduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string): Promise<{ journal_entry_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ journal_entry_id: string }>(
        `accruals/deferred/${scheduleId}/release`,
        { method: 'POST', body: { period_id: periodId } },
      );
      if (error) throw error;
      return data ?? { journal_entry_id: '' };
    },
    onSuccess: () => invalidateAccruals(qc),
  });
}

export function useRunIntegrityReplay() {
  return useMutation({
    mutationFn: async (periodId: string): Promise<IntegrityResult> => {
      const { data, error } = await supabase.functions.invoke<{ data: IntegrityResult }>(
        'accruals/integrity/replay',
        { method: 'POST', body: { period_id: periodId } },
      );
      if (error) throw error;
      return (data?.data ?? { passed: false }) as IntegrityResult;
    },
  });
}

export function useRunCloseDependencies() {
  return useMutation({
    mutationFn: async (periodId: string): Promise<IntegrityResult> => {
      const { data, error } = await supabase.functions.invoke<{ data: IntegrityResult }>(
        'accruals/integrity/close-dependencies',
        { method: 'POST', body: { period_id: periodId } },
      );
      if (error) throw error;
      return (data?.data ?? { passed: false }) as IntegrityResult;
    },
  });
}

export function useGenerateCanonicalExport() {
  return useMutation({
    mutationFn: async ({ periodId, notes }: { periodId: string; notes?: string }): Promise<unknown> => {
      const { data, error } = await supabase.functions.invoke<{ data: unknown }>(
        'accruals/integrity/canonical-export',
        { method: 'POST', body: { period_id: periodId, notes: notes ?? null } },
      );
      if (error) throw error;
      return data?.data;
    },
  });
}
