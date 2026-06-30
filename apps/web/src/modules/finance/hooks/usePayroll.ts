import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type PayrollRunStatus = 'draft' | 'ready' | 'posted' | 'reversed' | 'corrected';
export type PayrollRunType   = 'regular' | 'supplementary' | 'correction';
export type TaxRemittanceStatus =
  | 'pending' | 'clearing_posted' | 'payment_posted' | 'completed' | 'cancelled';

export interface PayrollRun {
  id:                      string;
  organization_id:         string;
  financial_period_id:     string | null;
  run_type:                PayrollRunType;
  pay_period_start:        string;
  pay_period_end:          string;
  pay_date:                string | null;
  status:                  PayrollRunStatus;
  total_gross:             number;
  total_withheld_tax:      number;
  total_employer_contrib:  number;
  total_net_pay:           number;
  entry_count:             number;
  journal_entry_id:        string | null;
  salary_payment_entry_id: string | null;
  correction_of_run_id:    string | null;
  notes:                   string | null;
  created_at:              string;
  posted_at:               string | null;
}

export interface PayrollEntry {
  id:                     string;
  organization_id:        string;
  payroll_run_id:         string;
  employee_id:            string;
  instructor_id:          string | null;
  gross_salary:           number;
  withheld_tax:           number;
  employer_contrib_rate:  number;
  employer_contrib_amount: number;
  pension_amount:         number;
  benefits_amount:        number;
  net_pay:                number;
  notes:                  string | null;
  created_at:             string;
}

export interface TaxRemittance {
  id:                       string;
  organization_id:          string;
  financial_period_id:      string | null;
  payroll_run_id:           string | null;
  declaration_period_start: string;
  declaration_period_end:   string;
  due_date:                 string | null;
  withheld_tax_amount:      number;
  employer_contrib_amount:  number;
  total_amount:             number;
  status:                   TaxRemittanceStatus;
  clearing_entry_id:        string | null;
  payment_entry_id:         string | null;
  payment_date:             string | null;
  payment_reference:        string | null;
  skatteverket_reference:   string | null;
  notes:                    string | null;
  created_at:               string;
}

export interface CreatePayrollRunInput {
  pay_period_start:     string;
  pay_period_end:       string;
  pay_date?:            string | undefined;
  run_type?:            PayrollRunType | undefined;
  financial_period_id?: string | undefined;
  notes?:               string | undefined;
}

export interface AddPayrollEntryInput {
  run_id:                string;
  employee_id:           string;
  instructor_id?:        string | undefined;
  gross_salary:          number;
  withheld_tax:          number;
  employer_contrib_rate?: number | undefined;
  pension_amount?:       number | undefined;
  benefits_amount?:      number | undefined;
  notes?:                string | undefined;
}

export interface CreateTaxRemittanceInput {
  payroll_run_id?:            string | undefined;
  declaration_period_start:   string;
  declaration_period_end:     string;
  due_date?:                  string | undefined;
  withheld_tax_amount:        number;
  employer_contrib_amount:    number;
  financial_period_id?:       string | undefined;
  notes?:                     string | undefined;
}

// ─── Query keys ────────────────────────────────────────────────────────────────

export const payrollKeys = {
  all:            ['payroll'] as const,
  runs:           () => [...payrollKeys.all, 'runs']                            as const,
  runList:        () => [...payrollKeys.runs(), 'list']                         as const,
  runEntries:     (id: string) => [...payrollKeys.runs(), id, 'entries']        as const,
  remittances:    () => [...payrollKeys.all, 'remittances']                     as const,
  remittanceList: () => [...payrollKeys.remittances(), 'list']                  as const,
};

// ─── Payroll run hooks ─────────────────────────────────────────────────────────

export function usePayrollRuns() {
  return useQuery({
    queryKey: payrollKeys.runList(),
    queryFn:  async () => {
      const { data, error } = await supabase.functions.invoke<{ data: PayrollRun[]; total: number }>(
        'payroll/runs',
        { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function usePayrollRunEntries(runId: string | null) {
  return useQuery({
    queryKey: payrollKeys.runEntries(runId ?? ''),
    queryFn:  async () => {
      const { data, error } = await supabase.functions.invoke<{ data: PayrollEntry[]; total: number }>(
        `payroll/runs/${runId}/entries`,
        { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(runId),
    staleTime: 15_000,
  });
}

export function useCreatePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePayrollRunInput) => {
      const { data, error } = await supabase.functions.invoke<{ id: string }>(
        'payroll/runs',
        { method: 'POST', body: input },
      );
      if (error) throw error;
      if (!data) throw new Error('Inget svar från servern');
      return data;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: payrollKeys.runList() }); },
  });
}

export function useAddPayrollEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddPayrollEntryInput) => {
      const { data, error } = await supabase.functions.invoke<{ id: string }>(
        `payroll/runs/${input.run_id}/entries`,
        { method: 'POST', body: input },
      );
      if (error) throw error;
      if (!data) throw new Error('Inget svar från servern');
      return data;
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: payrollKeys.runEntries(vars.run_id) });
      void qc.invalidateQueries({ queryKey: payrollKeys.runList() });
    },
  });
}

export function usePostPayrollJournal(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ journal_entry_id: string }>(
        `payroll/runs/${runId}/post`,
        { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { journal_entry_id: '' };
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: payrollKeys.runList() }); },
  });
}

export function usePostSalaryPayment(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ payment_date, bank_account }: { payment_date: string; bank_account?: string }) => {
      const { data, error } = await supabase.functions.invoke<{ payment_entry_id: string }>(
        `payroll/runs/${runId}/salary-payment`,
        { method: 'POST', body: { payment_date, bank_account: bank_account ?? '1930' } },
      );
      if (error) throw error;
      return data ?? { payment_entry_id: '' };
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: payrollKeys.runList() }); },
  });
}

export function useReversePayrollRun(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason: string) => {
      const { data, error } = await supabase.functions.invoke<{ reversal_entry_id: string }>(
        `payroll/runs/${runId}/reverse`,
        { method: 'POST', body: { reason } },
      );
      if (error) throw error;
      return data ?? { reversal_entry_id: '' };
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: payrollKeys.runList() }); },
  });
}

// ─── Tax remittance hooks ─────────────────────────────────────────────────────

export function useTaxRemittances() {
  return useQuery({
    queryKey: payrollKeys.remittanceList(),
    queryFn:  async () => {
      const { data, error } = await supabase.functions.invoke<{ data: TaxRemittance[]; total: number }>(
        'payroll/tax-remittances',
        { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useCreateTaxRemittance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaxRemittanceInput) => {
      const { data, error } = await supabase.functions.invoke<{ id: string }>(
        'payroll/tax-remittances',
        { method: 'POST', body: input },
      );
      if (error) throw error;
      if (!data) throw new Error('Inget svar från servern');
      return data;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: payrollKeys.remittanceList() }); },
  });
}

export function useClearTaxRemittance(remittanceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ clearing_entry_id: string }>(
        `payroll/tax-remittances/${remittanceId}/clear`,
        { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { clearing_entry_id: '' };
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: payrollKeys.remittanceList() }); },
  });
}

export function usePayTaxRemittance(remittanceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ payment_date, reference }: { payment_date: string; reference?: string | undefined }) => {
      const { data, error } = await supabase.functions.invoke<{ payment_entry_id: string }>(
        `payroll/tax-remittances/${remittanceId}/pay`,
        { method: 'POST', body: { payment_date, reference } },
      );
      if (error) throw error;
      return data ?? { payment_entry_id: '' };
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: payrollKeys.remittanceList() }); },
  });
}

export function useCompleteTaxRemittance(remittanceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke<{ success: boolean }>(
        `payroll/tax-remittances/${remittanceId}/complete`,
        { method: 'POST' },
      );
      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: payrollKeys.remittanceList() }); },
  });
}
