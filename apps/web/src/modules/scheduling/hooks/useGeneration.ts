import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerationConfig {
  id: string;
  organization_id: string;
  lesson_type_id: string;
  lesson_type_name: string | null;
  generation_horizon_days: number;
  generation_frequency: 'daily' | 'weekly' | 'manual';
  auto_generation_enabled: boolean;
  last_generation_at: string | null;
  next_generation_at: string | null;
  retry_count: number;
  max_retry_count: number;
  failure_backoff_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GenerationRun {
  id: string;
  organization_id: string;
  generation_scope: string;
  scope_id: string | null;
  lesson_type_id: string | null;
  start_date: string;
  end_date: string;
  started_at: string;
  completed_at: string | null;
  records_created: number;
  records_skipped: number;
  conflicts_detected: number;
  status: 'running' | 'completed' | 'partial' | 'failed';
  error_message: string | null;
  triggered_by: string | null;
}

export interface TriggerGenerationResult {
  run_id: string;
  instructors_processed: number;
  rules_processed: number;
  slots_created: number;
  slots_skipped: number;
  conflicts_found: number;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const generationKeys = {
  all:     ['generation'] as const,
  configs: ()            => [...generationKeys.all, 'configs'] as const,
  runs:    (limit: number) => [...generationKeys.all, 'runs', limit] as const,
};

// ─── Raw DB row shape ─────────────────────────────────────────────────────────

interface RawConfigRow {
  id: string;
  organization_id: string;
  lesson_type_id: string;
  generation_horizon_days: number;
  generation_frequency: string;
  auto_generation_enabled: boolean;
  last_generation_at: string | null;
  next_generation_at: string | null;
  retry_count: number;
  max_retry_count: number;
  failure_backoff_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  lesson_types: { name: string } | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useGenerationConfigs() {
  const { user } = useSessionStore();
  return useQuery({
    queryKey: generationKeys.configs(),
    enabled:  Boolean(user?.organization_id),
    staleTime: 60_000,
    queryFn: async (): Promise<GenerationConfig[]> => {
      const { data, error } = await supabase
        .from('scheduling_generation_configs')
        .select('*, lesson_types(name)')
        .eq('organization_id', user?.organization_id ?? '')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as RawConfigRow[]).map(r => ({
        id:                      r.id,
        organization_id:         r.organization_id,
        lesson_type_id:          r.lesson_type_id,
        lesson_type_name:        r.lesson_types?.name ?? null,
        generation_horizon_days: r.generation_horizon_days,
        generation_frequency:    r.generation_frequency as 'daily' | 'weekly' | 'manual',
        auto_generation_enabled: r.auto_generation_enabled,
        last_generation_at:      r.last_generation_at,
        next_generation_at:      r.next_generation_at,
        retry_count:             r.retry_count,
        max_retry_count:         r.max_retry_count,
        failure_backoff_minutes: r.failure_backoff_minutes,
        is_active:               r.is_active,
        created_at:              r.created_at,
        updated_at:              r.updated_at,
      }));
    },
  });
}

export function useGenerationRuns(limit = 30) {
  const { user } = useSessionStore();
  return useQuery({
    queryKey: generationKeys.runs(limit),
    enabled:  Boolean(user?.organization_id),
    staleTime: 30_000,
    queryFn: async (): Promise<GenerationRun[]> => {
      const { data, error } = await supabase
        .from('scheduling_generation_runs')
        .select('*')
        .eq('organization_id', user?.organization_id ?? '')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as GenerationRun[];
    },
  });
}

export function useTriggerGeneration() {
  const queryClient = useQueryClient();
  const { user } = useSessionStore();
  return useMutation({
    mutationFn: async ({
      lessonTypeId,
      startDate,
      endDate,
    }: {
      // null = generate generic availability slots (no fixed lesson type).
      lessonTypeId: string | null;
      startDate:    string;
      endDate:      string;
    }): Promise<TriggerGenerationResult> => {
      const { data, error } = await supabase
        .rpc('generate_slots_for_organization', {
          p_organization_id: user?.organization_id ?? '',
          p_lesson_type_id:  lessonTypeId,
          p_start_date:      startDate,
          p_end_date:        endDate,
        } as never);
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as TriggerGenerationResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: generationKeys.all });
    },
  });
}
