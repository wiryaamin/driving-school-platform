import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReplayRunStatus = 'pending' | 'running' | 'completed' | 'divergent' | 'failed';

export interface ReplayRun {
  id:               string;
  organization_id:  string;
  period_id:        string;
  status:           ReplayRunStatus;
  total_accounts:   number | null;
  divergent_count:  number | null;
  actor_id:         string | null;
  started_at:       string | null;
  completed_at:     string | null;
  created_at:       string;
}

export interface ReplaySnapshot {
  id:                string;
  organization_id:   string;
  replay_run_id:     string;
  account_code:      string;
  expected_balance:  number | null;
  replayed_balance:  number | null;
  divergence_amount: number | null;
  has_divergence:    boolean;
  created_at:        string;
}

export interface BalanceValidationResult {
  period_id:          string;
  passed:             boolean;
  total_accounts:     number;
  divergent_accounts: number;
  checked_at:         string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const replayKeys = {
  all:             ['ledger-replay'] as const,
  runsByPeriod:    (periodId: string) => [...replayKeys.all, 'runs-by-period',    periodId] as const,
  latestByPeriod:  (periodId: string) => [...replayKeys.all, 'latest-by-period',  periodId] as const,
  run:             (runId: string)    => [...replayKeys.all, 'run',               runId]    as const,
  snapshots:       (runId: string)    => [...replayKeys.all, 'snapshots',         runId]    as const,
  divergentSnaps:  (runId: string)    => [...replayKeys.all, 'divergent-snaps',   runId]    as const,
  divergentRuns:   ()                 => [...replayKeys.all, 'divergent-runs']              as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useReplayRunsByPeriod(periodId: string | null) {
  return useQuery({
    queryKey: replayKeys.runsByPeriod(periodId ?? ''),
    enabled:  Boolean(periodId),
    staleTime: 30_000,
    queryFn: async (): Promise<ReplayRun[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: ReplayRun[] }>(
        `ledger-replay/period/${periodId}/runs`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
  });
}

export function useLatestReplayRun(periodId: string | null) {
  return useQuery({
    queryKey: replayKeys.latestByPeriod(periodId ?? ''),
    enabled:  Boolean(periodId),
    staleTime: 30_000,
    queryFn: async (): Promise<ReplayRun | null> => {
      const { data, error } = await supabase.functions.invoke<ReplayRun>(
        `ledger-replay/period/${periodId}/latest`, { method: 'GET' },
      );
      if (error) {
        if ((error as { status?: number }).status === 404) return null;
        throw error;
      }
      return data ?? null;
    },
  });
}

export function useReplayRun(runId: string | null) {
  return useQuery({
    queryKey: replayKeys.run(runId ?? ''),
    enabled:  Boolean(runId),
    staleTime: 60_000,
    queryFn: async (): Promise<ReplayRun | null> => {
      const { data, error } = await supabase.functions.invoke<ReplayRun>(
        `ledger-replay/runs/${runId}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useReplaySnapshots(runId: string | null) {
  return useQuery({
    queryKey: replayKeys.snapshots(runId ?? ''),
    enabled:  Boolean(runId),
    staleTime: 60_000,
    queryFn: async (): Promise<ReplaySnapshot[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: ReplaySnapshot[] }>(
        `ledger-replay/runs/${runId}/snapshots`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
  });
}

export function useDivergentSnapshots(runId: string | null) {
  return useQuery({
    queryKey: replayKeys.divergentSnaps(runId ?? ''),
    enabled:  Boolean(runId),
    staleTime: 30_000,
    queryFn: async (): Promise<ReplaySnapshot[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: ReplaySnapshot[] }>(
        `ledger-replay/runs/${runId}/divergent`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
  });
}

export function useDivergentRuns() {
  return useQuery({
    queryKey: replayKeys.divergentRuns(),
    staleTime: 60_000,
    queryFn: async (): Promise<ReplayRun[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: ReplayRun[] }>(
        'ledger-replay/divergent', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
  });
}

export function useRunPeriodReplay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string): Promise<ReplayRun> => {
      const { data, error } = await supabase.functions.invoke<ReplayRun>(
        `ledger-replay/period/${periodId}`, { method: 'POST' },
      );
      if (error) throw error;
      if (!data) throw new Error('Inget svar från servern');
      return data;
    },
    onSuccess: (_run, periodId) => {
      void qc.invalidateQueries({ queryKey: replayKeys.runsByPeriod(periodId) });
      void qc.invalidateQueries({ queryKey: replayKeys.latestByPeriod(periodId) });
      void qc.invalidateQueries({ queryKey: replayKeys.divergentRuns() });
    },
  });
}

export function useValidatePeriodBalance() {
  return useMutation({
    mutationFn: async (periodId: string): Promise<BalanceValidationResult> => {
      const { data, error } = await supabase.functions.invoke<BalanceValidationResult>(
        `ledger-replay/period/${periodId}/validate`, { method: 'POST' },
      );
      if (error) throw error;
      if (!data) throw new Error('Inget svar från servern');
      return data;
    },
  });
}

export function useReplayFiscalYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fiscalYearId: string): Promise<unknown> => {
      const { data, error } = await supabase.functions.invoke(
        `ledger-replay/fiscal-year/${fiscalYearId}`, { method: 'POST' },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: replayKeys.all });
    },
  });
}
