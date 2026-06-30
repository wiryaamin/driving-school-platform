import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ComplianceEvent {
  id:              string;
  organization_id: string;
  event_type:      string;
  entity_type:     string | null;
  entity_id:       string | null;
  occurred_at:     string;
  actor_id:        string | null;
  metadata:        Record<string, unknown>;
}

export interface AgiSubmission {
  id:                 string;
  organization_id:    string;
  agi_export_id:      string;
  submission_status:  string;
  certification_hash: string | null;
  created_at:         string;
  certified_at:       string | null;
  actor_id:           string | null;
}

export interface VatDeclaration {
  id:                  string;
  organization_id:     string;
  vat_period_id:       string;
  declaration_status:  string;
  certification_hash:  string | null;
  created_at:          string;
  certified_at:        string | null;
  actor_id:            string | null;
}

export interface SaftExport {
  id:              string;
  organization_id: string;
  period_start:    string;
  period_end:      string;
  scope:           string;
  export_status:   string;
  sha256_hash:     string | null;
  created_at:      string;
  actor_id:        string | null;
}

export interface RetentionPolicy {
  id:              string;
  organization_id: string;
  policy_type:     string;
  retention_years: number;
  is_active:       boolean;
  description:     string | null;
}

// ─── Query keys ──────────────────────────────────────────────────────────────

export const complianceKeys = {
  all:       ['compliance'] as const,
  events:    ()  => [...complianceKeys.all, 'events']    as const,
  agi:       ()  => [...complianceKeys.all, 'agi']       as const,
  vat:       ()  => [...complianceKeys.all, 'vat']       as const,
  saft:      ()  => [...complianceKeys.all, 'saft']      as const,
  retention: ()  => [...complianceKeys.all, 'retention'] as const,
};

function invalidateCompliance(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: complianceKeys.all });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useComplianceEvents(limit = 50) {
  return useQuery({
    queryKey: [...complianceKeys.events(), limit],
    queryFn:  async (): Promise<ComplianceEvent[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: ComplianceEvent[] }>(
        `compliance/events?limit=${limit}`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useAgiSubmissions(status?: string) {
  return useQuery({
    queryKey: [...complianceKeys.agi(), status ?? 'all'],
    queryFn:  async (): Promise<AgiSubmission[]> => {
      const qs = status ? `?status=${status}` : '';
      const { data, error } = await supabase.functions.invoke<{ data: AgiSubmission[] }>(
        `compliance/agi/submissions${qs}`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useVatDeclarations(status?: string) {
  return useQuery({
    queryKey: [...complianceKeys.vat(), status ?? 'all'],
    queryFn:  async (): Promise<VatDeclaration[]> => {
      const qs = status ? `?status=${status}` : '';
      const { data, error } = await supabase.functions.invoke<{ data: VatDeclaration[] }>(
        `compliance/vat/declarations${qs}`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useSaftExports(status?: string) {
  return useQuery({
    queryKey: [...complianceKeys.saft(), status ?? 'all'],
    queryFn:  async (): Promise<SaftExport[]> => {
      const qs = status ? `?status=${status}` : '';
      const { data, error } = await supabase.functions.invoke<{ data: SaftExport[] }>(
        `compliance/saft/exports${qs}`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useRetentionPolicies() {
  return useQuery({
    queryKey: complianceKeys.retention(),
    queryFn:  async (): Promise<RetentionPolicy[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: RetentionPolicy[] }>(
        'compliance/retention/policies', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useGenerateVatDeclaration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vatPeriodId: string): Promise<{ declaration_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ declaration_id: string }>(
        'compliance/vat/generate',
        { method: 'POST', body: { vat_period_id: vatPeriodId } },
      );
      if (error) throw error;
      return data ?? { declaration_id: '' };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: complianceKeys.vat() }),
  });
}

export function useCertifyVatDeclaration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (declarationId: string): Promise<{ certification_hash: string }> => {
      const { data, error } = await supabase.functions.invoke<{ certification_hash: string }>(
        `compliance/vat/certify/${declarationId}`, { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { certification_hash: '' };
    },
    onSuccess: () => invalidateCompliance(qc),
  });
}

export function useGenerateSaftExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      period_start: string;
      period_end:   string;
      scope?:       string;
    }): Promise<{ export_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ export_id: string }>(
        'compliance/saft/generate', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? { export_id: '' };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: complianceKeys.saft() }),
  });
}

export function useCertifyAgiSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (submissionId: string): Promise<{ certification_hash: string }> => {
      const { data, error } = await supabase.functions.invoke<{ certification_hash: string }>(
        `compliance/agi/certify/${submissionId}`, { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { certification_hash: '' };
    },
    onSuccess: () => invalidateCompliance(qc),
  });
}
