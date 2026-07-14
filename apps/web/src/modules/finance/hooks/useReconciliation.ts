import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BankStatementStatus = 'imported' | 'reconciling' | 'reconciled' | 'confirmed';
export type BankLineStatus      = 'unmatched' | 'matched' | 'confirmed' | 'exception' | 'ignored';

export interface BankStatementImport {
  id:                  string;
  organization_id:     string;
  bank_account_number: string;
  bank_name:           string | null;
  statement_date:      string;
  period_start:        string;
  period_end:          string;
  opening_balance:     number;
  closing_balance:     number;
  currency:            string;
  total_lines:         number;
  status:              BankStatementStatus;
  file_reference:      string | null;
  imported_at:         string;
  confirmed_at:        string | null;
  notes:               string | null;
}

export interface BankStatementLine {
  id:                  string;
  import_id:           string;
  line_number:         number;
  transaction_date:    string;
  value_date:          string | null;
  amount:              number;
  balance_after:       number | null;
  reference:           string | null;
  description:         string;
  counterpart_name:    string | null;
  counterpart_account: string | null;
  status:              BankLineStatus;
  payment_id:          string | null;
  matched_at:          string | null;
  match_method:        'automatic' | 'manual' | null;
  match_notes:         string | null;
}

export interface FinancialPeriod {
  id:           string;
  name:         string;
  period_start: string;
  period_end:   string;
  status:       string;
}

export interface ImportLineInput {
  transaction_date:  string;
  amount:            number;
  description:       string;
  reference?:        string | undefined;
  counterpart_name?: string | undefined;
}

export interface ImportBankStatementInput {
  account_number:  string;
  bank_name?:      string | undefined;
  statement_date:  string;
  period_start:    string;
  period_end:      string;
  opening_balance: number;
  closing_balance: number;
  currency:        string;
  lines:           ImportLineInput[];
}

// ─── Query keys ────────────────────────────────────────────────────────────────

export const reconciliationKeys = {
  all:        ['reconciliation'] as const,
  imports:    () => [...reconciliationKeys.all, 'imports']                   as const,
  importList: () => [...reconciliationKeys.imports(), 'list']                as const,
  lines:      (id: string) => [...reconciliationKeys.imports(), id, 'lines'] as const,
  periods:    () => [...reconciliationKeys.all, 'periods']                   as const,
};

// ─── Hooks ─────────────────────────────────────────────────────────────────────

export function useBankImports() {
  return useQuery({
    queryKey: reconciliationKeys.importList(),
    queryFn:  async () => {
      const { data, error } = await supabase.functions.invoke<{ data: BankStatementImport[] }>(
        'reconciliation/bank/imports',
        { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useBankImportLines(importId: string | null) {
  return useQuery({
    queryKey: reconciliationKeys.lines(importId ?? ''),
    queryFn:  async () => {
      const { data, error } = await supabase.functions.invoke<{ data: BankStatementLine[] }>(
        `reconciliation/bank/imports/${importId}/lines`,
        { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(importId),
    staleTime: 15_000,
  });
}

export function useFinancialPeriods() {
  return useQuery({
    queryKey: reconciliationKeys.periods(),
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('financial_periods' as never)
        .select('id, name, period_start, period_end, status')
        .order('period_start', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as FinancialPeriod[];
    },
    staleTime: 60_000,
  });
}

export function useImportBankStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImportBankStatementInput) => {
      const { data, error } = await supabase.functions.invoke<{ import_id: string }>(
        'reconciliation/bank/import',
        { method: 'POST', body: input },
      );
      if (error) throw error;
      if (!data) throw new Error('Inget svar från servern');
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reconciliationKeys.importList() });
    },
  });
}

export function useAutoMatchLines(importId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ matched_count: number }>(
        `reconciliation/bank/imports/${importId}/auto-match`,
        { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { matched_count: 0 };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reconciliationKeys.lines(importId) });
      void qc.invalidateQueries({ queryKey: reconciliationKeys.importList() });
    },
  });
}

export function useManualMatchLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      lineId, paymentId, notes, importId: _importId,
    }: { lineId: string; paymentId: string; notes?: string | undefined; importId: string }) => {
      const { error } = await supabase.functions.invoke<{ ok: boolean }>(
        `reconciliation/bank/lines/${lineId}/match`,
        { method: 'POST', body: { payment_id: paymentId, notes } },
      );
      if (error) throw error;
      return { ok: true };
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: reconciliationKeys.lines(vars.importId) });
      void qc.invalidateQueries({ queryKey: reconciliationKeys.importList() });
    },
  });
}

export function useUnmatchLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lineId, importId: _importId }: { lineId: string; importId: string }) => {
      const { error } = await supabase.functions.invoke<{ ok: boolean }>(
        `reconciliation/bank/lines/${lineId}/unmatch`,
        { method: 'POST' },
      );
      if (error) throw error;
      return { ok: true };
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: reconciliationKeys.lines(vars.importId) });
      void qc.invalidateQueries({ queryKey: reconciliationKeys.importList() });
    },
  });
}

export function useConfirmBankReconciliation(importId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ periodId, notes }: { periodId: string; notes?: string | undefined }) => {
      const { data, error } = await supabase.functions.invoke<{ reconciliation_run_id: string }>(
        `reconciliation/bank/imports/${importId}/confirm`,
        { method: 'POST', body: { period_id: periodId, notes } },
      );
      if (error) throw error;
      if (!data) throw new Error('Inget svar från servern');
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reconciliationKeys.importList() });
    },
  });
}

export interface CreateFinancialPeriodInput {
  name:         string;
  period_start: string;
  period_end:   string;
}

export function useCreateFinancialPeriod() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFinancialPeriodInput): Promise<{ id: string }> => {
      if (!orgId) throw new Error('Ingen organisation');
      const { data, error } = await supabase
        .from('financial_periods' as never)
        .insert({ ...input, organization_id: orgId } as never)
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reconciliationKeys.periods() });
    },
  });
}
