import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgiExportStatus   = 'draft' | 'submitted' | 'locked';
export type AuditExportType   = 'vat' | 'income' | 'payroll' | 'full';

export interface AgiExport {
  id:                string;
  organization_id:   string;
  payroll_run_id:    string;
  declaration_month: string;
  status:            AgiExportStatus;
  total_employees:   number;
  total_gross:       number;
  total_tax:         number;
  total_employer_contributions: number;
  sha256_hash:       string | null;
  notes:             string | null;
  locked_at:         string | null;
  locked_by:         string | null;
  receipt:           string | null;
  submitted_at:      string | null;
  created_at:        string;
  created_by:        string | null;
}

export interface AgiExportLine {
  id:                     string;
  agi_export_id:          string;
  organization_id:        string;
  employee_id:            string;
  personnummer:           string | null;
  first_name:             string | null;
  last_name:              string | null;
  gross_salary:           number;
  income_tax_withheld:    number;
  employer_contributions: number;
  net_salary:             number;
  created_at:             string;
}

export interface AgiIntegrityResult {
  is_valid:        boolean;
  computed_hash:   string;
  stored_hash:     string | null;
  mismatch_reason: string | null;
}

export interface RegulatoryAuditExport {
  id:                   string;
  organization_id:      string;
  financial_period_id:  string | null;
  export_type:          AuditExportType;
  export_date:          string;
  status:               string;
  sha256_hash:          string | null;
  payload_size_bytes:   number | null;
  notes:                string | null;
  created_at:           string;
  created_by:           string | null;
}

export interface ComplianceDashboard {
  organization_id:             string;
  last_agi_submission:         string | null;
  last_vat_submission:         string | null;
  pending_payroll_runs:        number;
  open_vat_periods:            number;
  overdue_declarations:        number;
  compliance_score:            number | null;
  [key: string]: unknown;
}

export interface GenerateAgiInput {
  payroll_run_id: string;
  notes?:         string | undefined;
}

export interface LockAgiInput {
  receipt?: string | undefined;
}

export interface GenerateAuditInput {
  period_id:   string;
  export_type: AuditExportType;
  notes?:      string | undefined;
}

export interface ListAgiParams {
  status?: AgiExportStatus;
}

export interface ListAuditParams {
  export_type?:          AuditExportType;
  financial_period_id?:  string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const regulatoryKeys = {
  all:         ['regulatory-exports'] as const,
  agiList:     (p: ListAgiParams)      => [...regulatoryKeys.all, 'agi-list', p]        as const,
  agiItem:     (id: string)            => [...regulatoryKeys.all, 'agi', id]             as const,
  agiLines:    (id: string)            => [...regulatoryKeys.all, 'agi-lines', id]       as const,
  agiVerify:   (id: string)            => [...regulatoryKeys.all, 'agi-verify', id]      as const,
  auditList:   (p: ListAuditParams)    => [...regulatoryKeys.all, 'audit-list', p]       as const,
  auditItem:   (id: string)            => [...regulatoryKeys.all, 'audit', id]           as const,
  compliance:  ()                      => [...regulatoryKeys.all, 'compliance']          as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAgiExports(params: ListAgiParams = {}) {
  return useQuery({
    queryKey: regulatoryKeys.agiList(params),
    queryFn:  async (): Promise<{ data: AgiExport[]; total: number }> => {
      const qs = params.status ? `?status=${params.status}` : '';
      const { data, error } = await supabase.functions.invoke<{ data: AgiExport[]; total: number }>(
        `regulatory-exports/agi${qs}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [], total: 0 };
    },
    staleTime: 20_000,
  });
}

export function useAgiExport(id: string | null) {
  return useQuery({
    queryKey: regulatoryKeys.agiItem(id ?? ''),
    queryFn:  async (): Promise<AgiExport> => {
      const { data, error } = await supabase.functions.invoke<AgiExport>(
        `regulatory-exports/agi/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('AGI export not found');
      return data;
    },
    enabled:   Boolean(id),
    staleTime: 30_000,
  });
}

export function useAgiExportLines(id: string | null) {
  return useQuery({
    queryKey: regulatoryKeys.agiLines(id ?? ''),
    queryFn:  async (): Promise<AgiExportLine[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: AgiExportLine[]; total: number }>(
        `regulatory-exports/agi/${id}/lines`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(id),
    staleTime: 60_000,
  });
}

export function useVerifyAgiIntegrity(id: string | null) {
  return useQuery({
    queryKey: regulatoryKeys.agiVerify(id ?? ''),
    queryFn:  async (): Promise<AgiIntegrityResult> => {
      const { data, error } = await supabase.functions.invoke<AgiIntegrityResult>(
        `regulatory-exports/agi/${id}/verify`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { is_valid: false, computed_hash: '', stored_hash: null, mismatch_reason: 'No result' };
    },
    enabled:   Boolean(id),
    staleTime: 0,
  });
}

export function useAuditExports(params: ListAuditParams = {}) {
  return useQuery({
    queryKey: regulatoryKeys.auditList(params),
    queryFn:  async (): Promise<{ data: RegulatoryAuditExport[]; total: number }> => {
      const qs = new URLSearchParams();
      if (params.export_type)         qs.set('export_type',         params.export_type);
      if (params.financial_period_id) qs.set('financial_period_id', params.financial_period_id);
      const path = qs.toString() ? `regulatory-exports/audit?${qs.toString()}` : 'regulatory-exports/audit';
      const { data, error } = await supabase.functions.invoke<{ data: RegulatoryAuditExport[]; total: number }>(
        path, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [], total: 0 };
    },
    staleTime: 20_000,
  });
}

export function useAuditExport(id: string | null) {
  return useQuery({
    queryKey: regulatoryKeys.auditItem(id ?? ''),
    queryFn:  async (): Promise<RegulatoryAuditExport> => {
      const { data, error } = await supabase.functions.invoke<RegulatoryAuditExport>(
        `regulatory-exports/audit/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('Audit export not found');
      return data;
    },
    enabled:   Boolean(id),
    staleTime: 30_000,
  });
}

export function useComplianceDashboard() {
  return useQuery({
    queryKey: regulatoryKeys.compliance(),
    queryFn:  async (): Promise<ComplianceDashboard> => {
      const { data, error } = await supabase.functions.invoke<ComplianceDashboard>(
        'regulatory-exports/compliance', { method: 'GET' },
      );
      if (error) throw error;
      return data ?? ({} as ComplianceDashboard);
    },
    staleTime: 30_000,
  });
}

export function useGenerateAgiExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateAgiInput): Promise<{ id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ id: string }>(
        'regulatory-exports/agi', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? { id: '' };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: regulatoryKeys.all }),
  });
}

export function useLockAgiExport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LockAgiInput): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `regulatory-exports/agi/${id}/lock`, { method: 'POST', body: input },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: regulatoryKeys.all }),
  });
}

export function useGenerateAuditExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GenerateAuditInput): Promise<{ id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ id: string }>(
        'regulatory-exports/audit', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? { id: '' };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: regulatoryKeys.all }),
  });
}
