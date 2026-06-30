import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicCampaign {
  id:                  string;
  name:                string;
  campaign_type:       string;
  discount_value:      number | null;
  discount_is_pct:     boolean | null;
  max_discount_amount: number | null;
  bonus_lessons:       number | null;
  starts_at:           string | null;
  ends_at:             string | null;
  priority:            number;
  badge_label:         string | null;
}

export interface PublicPackage {
  id:                        string;
  name:                      string;
  description:               string | null;
  lesson_category:           string;
  quantity:                  number;
  price:                     number;
  vat_rate:                  number;
  price_incl_vat:            number;
  currency:                  string;
  package_code:              string | null;
  visibility:                string;
  featured:                  boolean;
  sort_order:                number;
  validity_days:             number | null;
  active_campaign:           PublicCampaign | null;
  discounted_price:          number | null;
  discounted_price_incl_vat: number | null;
  discount_amount:           number | null;
  savings_label:             string | null;
}

export interface PublicPackageDetail extends PublicPackage {
  bundle_credits: unknown[];
  all_campaigns:  PublicCampaign[];
  organization:   PublicOrganization;
}

export interface PublicOrganization {
  id:                  string;
  name:                string;
  subscription_status: string;
}

export interface CatalogListResponse {
  data:         PublicPackage[];
  organization: PublicOrganization;
  meta: {
    total:                 number;
    featured_count:        number;
    has_active_campaigns:  boolean;
    active_campaign_count: number;
  };
}

export interface CatalogParams {
  category?: string;
  featured?: boolean;
}

// ─── Formatting utils ─────────────────────────────────────────────────────────

export function formatCatalogPrice(amount: number, currency = 'SEK'): string {
  return new Intl.NumberFormat('sv-SE', {
    style:                 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export const LESSON_CATEGORY_LABELS: Record<string, string> = {
  driving: 'Körlektioner',
  theory:  'Teorilektioner',
  risk1:   'Risk 1',
  risk2:   'Risk 2',
  intro:   'Introduktionslektion',
  bundle:  'Paket',
};

// ─── Query keys ───────────────────────────────────────────────────────────────

export const catalogKeys = {
  all:    ['public-catalog'] as const,
  list:   (orgId: string, params: CatalogParams) => [...catalogKeys.all, orgId, 'list', params] as const,
  detail: (orgId: string, pkgId: string)          => [...catalogKeys.all, orgId, 'detail', pkgId] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePublicPackages(orgId: string | undefined, params: CatalogParams = {}) {
  return useQuery({
    queryKey: catalogKeys.list(orgId ?? '', params),
    queryFn:  async (): Promise<CatalogListResponse> => {
      const qs = new URLSearchParams({ org_id: orgId! });
      if (params.category) qs.set('category', params.category);
      if (params.featured) qs.set('featured', 'true');

      const { data, error } = await supabase.functions.invoke<CatalogListResponse>(
        `public-catalog?${qs.toString()}`,
        { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      return data;
    },
    enabled:   Boolean(orgId),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublicPackageDetail(orgId: string | undefined, pkgId: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.detail(orgId ?? '', pkgId ?? ''),
    queryFn:  async (): Promise<PublicPackageDetail> => {
      const qs = new URLSearchParams({ org_id: orgId! });

      const { data, error } = await supabase.functions.invoke<PublicPackageDetail>(
        `public-catalog/${pkgId}?${qs.toString()}`,
        { method: 'GET' },
      );
      if (error) throw error;
      if (!data) throw new Error('Package not found');
      return data;
    },
    enabled:   Boolean(orgId) && Boolean(pkgId),
    staleTime: 5 * 60 * 1000,
  });
}
