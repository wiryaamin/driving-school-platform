import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DunningSchedule {
  id:              string;
  organization_id: string;
  name:            string;
  description:     string | null;
  is_default:      boolean;
  is_active:       boolean;
  created_by:      string | null;
  created_at:      string;
  updated_at:      string;
}

export interface DunningStage {
  id:               string;
  schedule_id:      string;
  stage_number:     number;
  days_overdue:     number;
  action_type:      string;
  subject_template: string | null;
  message_template: string | null;
  late_fee_amount:  number;
  suspend_access:   boolean;
  is_final_stage:   boolean;
  created_at:       string;
}

export interface DunningScheduleWithStages extends DunningSchedule {
  stages: DunningStage[];
}

export interface DunningState {
  invoice_id:           string;
  organization_id:      string;
  schedule_id:          string | null;
  current_stage_number: number | null;
  current_stage_id:     string | null;
  is_resolved:          boolean;
  next_action_at:       string | null;
  updated_at:           string;
}

export interface ReminderLog {
  id:              string;
  invoice_id:      string;
  organization_id: string;
  stage_number:    number | null;
  action_type:     string | null;
  sent_at:         string;
  sent_by:         string | null;
  notes:           string | null;
}

export interface CreateScheduleInput {
  name:         string;
  description?: string | undefined;
  is_default?:  boolean | undefined;
  is_active?:   boolean | undefined;
}

export interface AddStageInput {
  stage_number:      number;
  days_overdue:      number;
  action_type:       string;
  subject_template?: string | undefined;
  message_template?: string | undefined;
  late_fee_amount?:  number | undefined;
  suspend_access?:   boolean | undefined;
  is_final_stage?:   boolean | undefined;
}

// ─── Query keys ──────────────────────────────────────────────────────────────

export const dunningKeys = {
  all:       ['dunning'] as const,
  schedules: ()           => [...dunningKeys.all, 'schedules']          as const,
  schedule:  (id: string) => [...dunningKeys.all, 'schedules', id]      as const,
  states:    ()           => [...dunningKeys.all, 'states']             as const,
  state:     (id: string) => [...dunningKeys.all, 'states', id]         as const,
  reminders: (id: string) => [...dunningKeys.all, 'reminders', id]      as const,
};

function invalidateDunning(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: dunningKeys.all });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useDunningSchedules() {
  return useQuery({
    queryKey: dunningKeys.schedules(),
    queryFn:  async (): Promise<DunningSchedule[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: DunningSchedule[] }>(
        'dunning/schedules', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useDunningSchedule(id: string | null) {
  return useQuery({
    queryKey: dunningKeys.schedule(id ?? ''),
    queryFn:  async (): Promise<DunningScheduleWithStages> => {
      const { data, error } = await supabase.functions.invoke<DunningScheduleWithStages>(
        `dunning/schedules/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('Not found');
      return data;
    },
    enabled:   Boolean(id),
    staleTime: 20_000,
  });
}

export function useActiveDunningStates() {
  return useQuery({
    queryKey: dunningKeys.states(),
    queryFn:  async (): Promise<DunningState[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: DunningState[] }>(
        'dunning/state', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 15_000,
  });
}

export function useDunningState(invoiceId: string | null) {
  return useQuery({
    queryKey: dunningKeys.state(invoiceId ?? ''),
    queryFn:  async (): Promise<DunningState | null> => {
      const { data, error } = await supabase.functions.invoke<DunningState>(
        `dunning/state/${invoiceId}`, { method: 'GET' },
      );
      if (error) {
        if ((error as { message?: string }).message?.includes('NOT_FOUND')) return null;
        throw error;
      }
      return data ?? null;
    },
    enabled:   Boolean(invoiceId),
    staleTime: 15_000,
  });
}

export function useInvoiceReminders(invoiceId: string | null) {
  return useQuery({
    queryKey: dunningKeys.reminders(invoiceId ?? ''),
    queryFn:  async (): Promise<ReminderLog[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: ReminderLog[] }>(
        `dunning/reminders/${invoiceId}`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(invoiceId),
    staleTime: 20_000,
  });
}

export function useCreateDunningSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateScheduleInput): Promise<DunningSchedule> => {
      const { data, error } = await supabase.functions.invoke<DunningSchedule>(
        'dunning/schedules', { method: 'POST', body: input },
      );
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      return data;
    },
    onSuccess: () => invalidateDunning(qc),
  });
}

export function useAddDunningStage(scheduleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddStageInput): Promise<DunningStage> => {
      const { data, error } = await supabase.functions.invoke<DunningStage>(
        `dunning/schedules/${scheduleId}/stages`, { method: 'POST', body: input },
      );
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dunningKeys.schedule(scheduleId) });
      void qc.invalidateQueries({ queryKey: dunningKeys.schedules() });
    },
  });
}

export function useAdvanceDunning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase.functions.invoke(
        `dunning/state/${invoiceId}/advance`, { method: 'POST' },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateDunning(qc),
  });
}

export function useResolveDunning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase.functions.invoke(
        `dunning/state/${invoiceId}/resolve`, { method: 'POST' },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateDunning(qc),
  });
}
