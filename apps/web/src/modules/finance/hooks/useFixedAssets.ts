import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type FixedAssetStatus = 'active' | 'disposed' | 'fully_depreciated' | 'impaired';
export type DepreciationMethod = 'straight_line' | 'declining_balance';
export type DisposalType = 'sale' | 'scrapped' | 'write_off';

export interface AssetClass {
  id:          string;
  class_code:  string;
  class_name:  string;
  bas_account: string;
  is_active:   boolean;
}

export interface FixedAsset {
  id:                       string;
  organization_id:          string;
  asset_class_id:           string;
  asset_code:               string;
  asset_name:               string;
  status:                   FixedAssetStatus;
  acquisition_date:         string;
  acquisition_cost:         number;
  residual_value:           number;
  useful_life_months:       number;
  depreciation_method:      DepreciationMethod;
  accumulated_depreciation: number;
  net_book_value:           number;
  last_depreciation_date:   string | null;
  disposal_date:            string | null;
  bas_account:              string | null;
  credit_account:           string;
  description:              string | null;
  notes:                    string | null;
  created_at:               string;
}

export interface DepreciationScheduleLine {
  id:                   string;
  asset_id:             string;
  organization_id:      string;
  period_number:        number;
  depreciation_date:    string;
  depreciation_amount:  number;
  accumulated_after:    number;
  net_book_value_after: number;
  is_posted:            boolean;
  journal_entry_id:     string | null;
}

export interface RegisterAssetInput {
  period_id:           string;
  asset_class_id:      string;
  asset_code:          string;
  asset_name:          string;
  acquisition_date:    string;
  acquisition_cost:    number;
  residual_value?:     number | undefined;
  useful_life_months?: number | undefined;
  depreciation_method?: DepreciationMethod | undefined;
  credit_account?:     string | undefined;
  description?:        string | undefined;
  notes?:              string | undefined;
}

export interface ListParams {
  status?:         FixedAssetStatus | undefined;
  asset_class_id?: string | undefined;
  page?:           number | undefined;
  per_page?:       number | undefined;
}

// ─── Query keys ──────────────────────────────────────────────────────────────

export const assetKeys = {
  all:      ['fixed-assets'] as const,
  classes:  ()           => [...assetKeys.all, 'classes']          as const,
  list:     (p: ListParams) => [...assetKeys.all, 'list', p]       as const,
  detail:   (id: string) => [...assetKeys.all, 'detail', id]       as const,
  schedule: (id: string) => [...assetKeys.all, 'schedule', id]     as const,
};

function invalidateAssets(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: assetKeys.all });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAssetClasses() {
  return useQuery({
    queryKey: assetKeys.classes(),
    queryFn:  async (): Promise<AssetClass[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: AssetClass[] }>(
        'fixed-assets/classes', { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    staleTime: 120_000,
  });
}

export function useFixedAssets(params: ListParams = {}) {
  return useQuery({
    queryKey: assetKeys.list(params),
    queryFn:  async (): Promise<{ data: FixedAsset[]; meta: { total: number; page: number; per_page: number } }> => {
      const qs = new URLSearchParams();
      if (params.status)         qs.set('status', params.status);
      if (params.asset_class_id) qs.set('asset_class_id', params.asset_class_id);
      if (params.page)           qs.set('page', String(params.page));
      if (params.per_page)       qs.set('per_page', String(params.per_page));
      const q = qs.toString();
      const { data, error } = await supabase.functions.invoke<{ data: FixedAsset[]; meta: { total: number; page: number; per_page: number } }>(
        `fixed-assets${q ? `?${q}` : ''}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [], meta: { total: 0, page: 1, per_page: 25 } };
    },
    staleTime: 20_000,
  });
}

export function useFixedAsset(id: string | null) {
  return useQuery({
    queryKey: assetKeys.detail(id ?? ''),
    queryFn:  async (): Promise<FixedAsset> => {
      const { data, error } = await supabase.functions.invoke<{ data: FixedAsset }>(
        `fixed-assets/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data?.data) throw new Error('Asset not found');
      return data.data;
    },
    enabled:   Boolean(id),
    staleTime: 20_000,
  });
}

export function useAssetSchedule(assetId: string | null) {
  return useQuery({
    queryKey: assetKeys.schedule(assetId ?? ''),
    queryFn:  async (): Promise<DepreciationScheduleLine[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: DepreciationScheduleLine[] }>(
        `fixed-assets/${assetId}/schedule`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(assetId),
    staleTime: 20_000,
  });
}

export function useRegisterAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterAssetInput): Promise<FixedAsset> => {
      const { data, error } = await supabase.functions.invoke<{ data: FixedAsset }>(
        'fixed-assets', { method: 'POST', body: input },
      );
      if (error) throw error;
      if (!data?.data) throw new Error('No asset returned');
      return data.data;
    },
    onSuccess: () => invalidateAssets(qc),
  });
}

export function useDepreciateAsset(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string): Promise<{ journal_entry_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ journal_entry_id: string }>(
        `fixed-assets/${assetId}/depreciate`,
        { method: 'POST', body: { period_id: periodId } },
      );
      if (error) throw error;
      return data ?? { journal_entry_id: '' };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.detail(assetId) });
      void qc.invalidateQueries({ queryKey: assetKeys.schedule(assetId) });
      void qc.invalidateQueries({ queryKey: assetKeys.list({}) });
    },
  });
}

export function useDisposeAsset(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      period_id:     string;
      disposal_type: DisposalType;
      disposal_date: string;
      proceeds?:     number | undefined;
      notes?:        string | undefined;
    }) => {
      const { error } = await supabase.functions.invoke(
        `fixed-assets/${assetId}/dispose`, { method: 'POST', body: input },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateAssets(qc),
  });
}

export function useImpairAsset(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      period_id:         string;
      impairment_date:   string;
      impairment_amount: number;
      reason?:           string | undefined;
    }) => {
      const { error } = await supabase.functions.invoke(
        `fixed-assets/${assetId}/impair`, { method: 'POST', body: input },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.detail(assetId) });
      void qc.invalidateQueries({ queryKey: assetKeys.list({}) });
    },
  });
}

export function useGenerateSchedule(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ lines_generated: number }> => {
      const { data, error } = await supabase.functions.invoke<{ lines_generated: number }>(
        `fixed-assets/${assetId}/schedule/generate`, { method: 'POST' },
      );
      if (error) throw error;
      return data ?? { lines_generated: 0 };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assetKeys.schedule(assetId) });
    },
  });
}
