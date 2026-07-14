import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { extractFunctionErrorMessage } from '../lib/provisioningSchema.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantOnboardingListRow {
  id:                      string;
  name:                    string;
  legal_name:              string;
  org_number:              string | null;
  subscription_tier:       string;
  subscription_status:     string;
  created_at:              string;
  // Ratio reflects only Go Live Readiness Requirements (Architecture Section
  // 8.1) — Recommended Configuration (8.2) never gates Go Live, so it's
  // reported separately rather than folded into the same ratio.
  completed_requirements:  number;
  total_requirements:      number;
  completed_recommended:   number;
  total_recommended:       number;
  ready_for_go_live:       boolean;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

const tenantOnboardingKeys = {
  list: ['platform', 'tenant-onboarding'] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────
//
// Reuses platform-admin's POST /provision invoke pattern (usePlatformOrgMutations.ts)
// and the same extractFunctionErrorMessage helper — the real {code, message} body
// from a non-2xx Edge Function response otherwise never surfaces (see
// modules/platform/lib/provisioningSchema.ts for why).

export function useTenantOnboardingList(search?: string) {
  return useQuery({
    queryKey: [...tenantOnboardingKeys.list, search ?? ''] as const,
    queryFn: async (): Promise<TenantOnboardingListRow[]> => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      const { data, error } = await supabase.functions.invoke<{ data: { organizations: TenantOnboardingListRow[]; total: number } }>(
        `platform-admin/tenant-onboarding${qs}`,
        { method: 'GET' },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte hämta onboarding-status'));
      return data?.data.organizations ?? [];
    },
    staleTime: 30_000,
  });
}

export function useApproveGoLive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string) => {
      const { data, error } = await supabase.functions.invoke(
        `platform-admin/tenant-onboarding/${orgId}/go-live`,
        { method: 'POST' },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte godkänna driftsättning'));
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: tenantOnboardingKeys.list });
      void qc.invalidateQueries({ queryKey: ['platform'] });
    },
  });
}
