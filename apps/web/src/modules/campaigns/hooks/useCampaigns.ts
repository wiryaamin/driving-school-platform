import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CampaignType =
  | 'percentage_discount'
  | 'fixed_discount'
  | 'bonus_lessons'
  | 'free_risk1'
  | 'free_risk2'
  | 'seasonal'
  | 'promotional_pricing';

export type CampaignStatus     = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired' | 'archived';
export type CampaignVisibility = 'public' | 'website' | 'student_portal' | 'internal';

export interface LinkedPackage {
  id:          string;
  offering_id: string;
  campaign_id: string;
  created_at:  string;
  package_offerings: {
    id:              string;
    name:            string;
    price:           number;
    vat_rate:        number;
    status:          string;
    lesson_category: string;
    package_code:    string | null;
    visibility:      string;
  } | null;
}

export interface Campaign {
  id:                  string;
  organization_id:     string;
  name:                string;
  description:         string | null;
  campaign_type:       CampaignType;
  status:              CampaignStatus;
  visibility:          CampaignVisibility;
  priority:            number;
  discount_value:      number | null;
  discount_is_pct:     boolean | null;
  max_discount_amount: number | null;
  bonus_lessons:       number | null;
  starts_at:           string | null;
  ends_at:             string | null;
  internal_notes:      string | null;
  metadata:            Record<string, unknown>;
  created_at:          string;
  updated_at:          string;
  created_by:          string | null;
  updated_by:          string | null;
  archived_at:         string | null;
  archived_by:         string | null;
  linked_packages?:    LinkedPackage[];
}

export interface CreateCampaignInput {
  name:                string;
  campaign_type:       CampaignType;
  description?:        string;
  visibility?:         CampaignVisibility;
  priority?:           number;
  discount_value?:     number;
  discount_is_pct?:    boolean;
  max_discount_amount?: number;
  bonus_lessons?:      number;
  starts_at?:          string;
  ends_at?:            string;
  internal_notes?:     string;
  offering_ids?:       string[];
}

export interface UpdateCampaignInput {
  name?:               string;
  description?:        string | null;
  visibility?:         CampaignVisibility;
  priority?:           number;
  discount_value?:     number | null;
  discount_is_pct?:    boolean | null;
  max_discount_amount?: number | null;
  bonus_lessons?:      number | null;
  starts_at?:          string | null;
  ends_at?:            string | null;
  internal_notes?:     string | null;
}

export interface ListCampaignsParams {
  status?:   string;
  type?:     string;
  page?:     number;
  per_page?: number;
}

export interface CampaignListResponse {
  data: Campaign[];
  meta: { page: number; per_page: number; total: number; active_count: number; scheduled_count: number };
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const campaignKeys = {
  all:      ['campaigns']                                        as const,
  list:     (p: ListCampaignsParams) => [...campaignKeys.all, 'list', p] as const,
  detail:   (id: string)             => [...campaignKeys.all, 'detail', id] as const,
};

function invalidateCampaigns(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: campaignKeys.all });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCampaigns(params: ListCampaignsParams = {}) {
  return useQuery({
    queryKey: campaignKeys.list(params),
    queryFn:  async (): Promise<CampaignListResponse> => {
      const qs = new URLSearchParams();
      if (params.status)   qs.set('status',   params.status);
      if (params.type)     qs.set('type',      params.type);
      if (params.page)     qs.set('page',      String(params.page));
      if (params.per_page) qs.set('per_page',  String(params.per_page));
      const path = qs.toString() ? `campaigns?${qs.toString()}` : 'campaigns';
      const { data, error } = await supabase.functions.invoke<CampaignListResponse>(
        path, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [], meta: { page: 1, per_page: 25, total: 0, active_count: 0, scheduled_count: 0 } };
    },
    staleTime: 20_000,
  });
}

export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: campaignKeys.detail(id ?? ''),
    queryFn:  async (): Promise<Campaign> => {
      const { data, error } = await supabase.functions.invoke<Campaign>(
        `campaigns/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('Campaign not found');
      return data;
    },
    enabled:   Boolean(id),
    staleTime: 30_000,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCampaignInput): Promise<Campaign> => {
      const { data, error } = await supabase.functions.invoke<Campaign>(
        'campaigns', { method: 'POST', body: input },
      );
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      return data;
    },
    onSuccess: () => invalidateCampaigns(qc),
  });
}

export function useUpdateCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCampaignInput): Promise<Campaign> => {
      const { data, error } = await supabase.functions.invoke<Campaign>(
        `campaigns/${id}`, { method: 'PATCH', body: input },
      );
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      return data;
    },
    onSuccess: () => invalidateCampaigns(qc),
  });
}

export function useActivateCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `campaigns/${id}/activate`, { method: 'POST' },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateCampaigns(qc),
  });
}

export function usePauseCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `campaigns/${id}/pause`, { method: 'POST' },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateCampaigns(qc),
  });
}

export function useArchiveCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `campaigns/${id}/archive`, { method: 'POST' },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateCampaigns(qc),
  });
}

export function useLinkPackage(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offeringId: string): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `campaigns/${campaignId}/link`,
        { method: 'POST', body: { offering_id: offeringId } },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) }),
  });
}

export function useUnlinkPackage(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offeringId: string): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `campaigns/${campaignId}/unlink`,
        { method: 'POST', body: { offering_id: offeringId } },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) }),
  });
}
