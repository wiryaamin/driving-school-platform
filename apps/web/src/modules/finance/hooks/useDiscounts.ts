import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DiscountType  = 'percentage' | 'fixed';
export type DiscountScope = 'offering' | 'catalog' | 'category' | 'all';

export interface DiscountDefinition {
  id:                  string;
  organization_id:     string;
  name:                string;
  description:         string | null;
  discount_type:       DiscountType;
  discount_scope:      DiscountScope;
  scope_reference_id:  string | null;
  scope_category:      string | null;
  discount_value:      number;
  max_discount_amount: number | null;
  currency:            string;
  valid_from:          string | null;
  valid_to:            string | null;
  is_active:           boolean;
  requires_coupon:     boolean;
  created_at:          string;
  updated_at:          string;
}

export interface CouponCode {
  id:                          string;
  organization_id:             string;
  discount_id:                 string;
  code:                        string;
  description:                 string | null;
  redemption_limit_total:      number | null;
  redemption_limit_per_student: number | null;
  redemptions_count:           number;
  valid_from:                  string | null;
  valid_to:                    string | null;
  is_active:                   boolean;
  created_at:                  string;
}

export interface CreateDiscountInput {
  name:                string;
  description?:        string | undefined;
  discount_type:       DiscountType;
  discount_scope?:     DiscountScope | undefined;
  scope_category?:     string | undefined;
  discount_value:      number;
  max_discount_amount?: number | undefined;
  currency?:           string | undefined;
  valid_from?:         string | undefined;
  valid_to?:           string | undefined;
  is_active?:          boolean | undefined;
  requires_coupon?:    boolean | undefined;
}

export interface CreateCouponInput {
  code:                        string;
  description?:                string | undefined;
  redemption_limit_total?:     number | undefined;
  redemption_limit_per_student?: number | undefined;
  valid_from?:                 string | undefined;
  valid_to?:                   string | undefined;
  is_active?:                  boolean | undefined;
}

export interface ApplyDiscountInput {
  invoice_id: string;
}

export interface RedeemCouponInput {
  invoice_id:  string;
  coupon_code: string;
  student_id:  string;
}

export interface DiscountListParams {
  is_active?: boolean;
  page?:      number;
  per_page?:  number;
}

export interface DiscountListResponse {
  data: DiscountDefinition[];
  meta: { total: number; page: number; per_page: number };
}

// ─── Query keys ──────────────────────────────────────────────────────────────

export const discountKeys = {
  all:     ['discounts'] as const,
  list:    (params: DiscountListParams) => [...discountKeys.all, 'list', params] as const,
  detail:  (id: string)                 => [...discountKeys.all, 'detail', id]   as const,
  coupons: (discountId: string)         => [...discountKeys.all, 'coupons', discountId] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useDiscounts(params: DiscountListParams = {}) {
  return useQuery({
    queryKey: discountKeys.list(params),
    queryFn:  async (): Promise<DiscountListResponse> => {
      const sp = new URLSearchParams();
      if (params.page      !== undefined) sp.set('page', String(params.page));
      if (params.per_page  !== undefined) sp.set('per_page', String(params.per_page));
      if (params.is_active !== undefined) sp.set('is_active', String(params.is_active));
      const qs = sp.toString();
      const fn = qs ? `discounts?${qs}` : 'discounts';
      const { data, error } = await supabase.functions.invoke<DiscountListResponse>(fn, { method: 'GET' });
      if (error) throw error;
      return data ?? { data: [], meta: { total: 0, page: 1, per_page: 25 } };
    },
    staleTime: 30_000,
  });
}

export function useDiscount(id: string | null) {
  return useQuery({
    queryKey: discountKeys.detail(id ?? ''),
    queryFn:  async (): Promise<DiscountDefinition> => {
      const { data, error } = await supabase.functions.invoke<DiscountDefinition>(
        `discounts/${id}`, { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('Discount not found');
      return data;
    },
    enabled:   Boolean(id),
    staleTime: 60_000,
  });
}

export function useDiscountCoupons(discountId: string | null) {
  return useQuery({
    queryKey: discountKeys.coupons(discountId ?? ''),
    queryFn:  async (): Promise<CouponCode[]> => {
      const { data, error } = await supabase.functions.invoke<{ data: CouponCode[] }>(
        `discounts/${discountId}/coupons`, { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? [];
    },
    enabled:   Boolean(discountId),
    staleTime: 20_000,
  });
}

export function useCreateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDiscountInput): Promise<DiscountDefinition> => {
      const { data, error } = await supabase.functions.invoke<DiscountDefinition>(
        'discounts', { method: 'POST', body: input },
      );
      if (error) throw error;
      if (!data) throw new Error('Inget svar från servern');
      return data;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: discountKeys.all }); },
  });
}

export function useDeactivateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `discounts/${id}/deactivate`, { method: 'POST' },
      );
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: discountKeys.all }); },
  });
}

export function useCreateCoupon(discountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCouponInput): Promise<CouponCode> => {
      const { data, error } = await supabase.functions.invoke<CouponCode>(
        `discounts/${discountId}/coupons`, { method: 'POST', body: input },
      );
      if (error) throw error;
      if (!data) throw new Error('Inget svar från servern');
      return data;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: discountKeys.coupons(discountId) }); },
  });
}

export function useApplyDiscount(discountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ApplyDiscountInput): Promise<{ application_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ application_id: string }>(
        `discounts/${discountId}/apply`, { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? { application_id: '' };
    },
    onSuccess: () => {
      // Invalidate invoices so the discount line item shows up
      void qc.invalidateQueries({ queryKey: ['finance', 'invoices'] });
    },
  });
}

export function useRedeemCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RedeemCouponInput): Promise<{ application_id: string }> => {
      const { data, error } = await supabase.functions.invoke<{ application_id: string }>(
        'discounts/redeem', { method: 'POST', body: input },
      );
      if (error) throw error;
      return data ?? { application_id: '' };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['finance', 'invoices'] });
    },
  });
}
