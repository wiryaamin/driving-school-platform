import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnboardingStepStatus   = 'completed' | 'pending';
export type OnboardingStepCategory = 'go_live_requirement' | 'recommended_configuration' | 'system';

export interface OnboardingStep {
  key:      string;
  category: OnboardingStepCategory;
  status:   OnboardingStepStatus;
  detail:   Record<string, unknown>;
}

export interface OnboardingProgress {
  organization: {
    id: string;
    name: string;
    legal_name: string;
    org_number: string | null;
    go_live_at: string | null;
  };
  steps:             OnboardingStep[];
  ready_for_go_live: boolean;
  is_live:           boolean;
}

// ─── Business Discovery types ─────────────────────────────────────────────────
// Execution Direction Change (2026-08-07) — Business Discovery Onboarding
// foundation. See supabase/functions/_shared/provisioning-rules.ts for the
// archetype classifier this mirrors.

export const LICENCE_CATEGORY_OPTIONS = [
  'AM', 'A1', 'A2', 'A', 'B', 'B96', 'BE', 'C1', 'C', 'C1E', 'CE', 'D1', 'D', 'D1E', 'DE', 'Traktor',
] as const;

export type Archetype    = 'solo' | 'smallTeam' | 'multiBranch' | 'enterprise';
export type BusinessType = 'standard' | 'motorcycle' | 'heavy_vehicle' | 'mixed';
export type CountSource  = 'known_records' | 'tenant_answer';

export type CapabilityKey =
  | 'core_operations' | 'motorcycle_training' | 'heavy_vehicle_training' | 'multi_branch'
  | 'corporate_training' | 'online_booking' | 'communication_automation';

export interface CapabilityAssessment {
  key:    CapabilityKey;
  name:   string;
  active: boolean;
  reason: string;
}

export type DomainKey =
  | 'organization_management' | 'student_customer_management' | 'training_services' | 'operations'
  | 'sales_public_presence' | 'communication' | 'finance' | 'integrations';

export interface DomainAssessment {
  key:          DomainKey;
  name:         string;
  capabilities: CapabilityKey[];
  dependsOn:    DomainKey[];
  active:       boolean;
  reason:       string;
}

export interface BusinessProfileInput {
  // Omit a field entirely when known_counts already has a non-null value for
  // it — the platform already knows, don't make the tenant re-type it.
  branches?:                          number;
  instructors?:                       number;
  vehicles?:                          number;
  licence_categories:                string[];
  standard_lesson_duration_minutes:  number;
}

export interface KnownCounts {
  branches:    number | null;
  instructors: number | null;
  vehicles:    number | null;
}

export interface BusinessProfile extends Partial<BusinessProfileInput> {
  completed_at?:   string;
  known_counts?:   KnownCounts;
  count_sources?:  { branches: CountSource; instructors: CountSource; vehicles: CountSource };
  analysis?: {
    archetype:     Archetype;
    business_type: BusinessType;
    signals:       Record<string, number>;
    computed_at:   string;
  };
  capabilities?: CapabilityAssessment[];
  domains?: DomainAssessment[];
}

export interface SaveBusinessProfileResult {
  business_profile: {
    branches: number; instructors: number; vehicles: number;
    licence_categories: string[]; standard_lesson_duration_minutes: number;
    analysis: NonNullable<BusinessProfile['analysis']>;
    domains: DomainAssessment[];
    capabilities: CapabilityAssessment[];
  };
  count_sources:             NonNullable<BusinessProfile['count_sources']>;
  branch_created:            number;
  lesson_types_created:      number;
  package_templates_created: number;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const onboardingKeys = {
  progress:        ['tenant-onboarding', 'progress'] as const,
  businessProfile: ['tenant-onboarding', 'business-profile'] as const,
};

// ─── Invoke helper ────────────────────────────────────────────────────────────
// supabase-js wraps a non-2xx response in FunctionsHttpError whose .message is
// a generic "Edge Function returned a non-2xx status code" — the real
// {code, message, trace_id} body must be read from error.context separately
// (see modules/platform/lib/provisioningSchema.ts, where this was first found
// and fixed during Automated Customer Provisioning verification).
async function extractErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json() as { message?: string };
      if (typeof body.message === 'string' && body.message) return body.message;
    } catch {
      // response body wasn't JSON — fall through to fallback
    }
  }
  return error instanceof Error ? error.message : fallback;
}

async function invoke<T>(path: string, opts?: Parameters<typeof supabase.functions.invoke>[1]): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(path, opts);
  if (error) throw new Error(await extractErrorMessage(error, 'Ett fel uppstod'));
  if (!data) throw new Error('Tomt svar från servern');
  return data;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
//
// Pure orchestration layer — this is the only network call in this module.
// Every step's status is derived live, server-side, from the module that
// owns that data; there is nothing to confirm or skip (see Customer
// Provisioning & Tenant Onboarding Architecture, Section 8's second
// refinement note).

export function useOnboardingProgress() {
  return useQuery({
    queryKey: onboardingKeys.progress,
    queryFn:  () => invoke<{ data: OnboardingProgress }>('tenant-onboarding/progress', { method: 'GET' }).then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useBusinessProfile() {
  return useQuery({
    queryKey: onboardingKeys.businessProfile,
    queryFn:  () => invoke<{ data: BusinessProfile }>('tenant-onboarding/business-profile', { method: 'GET' }).then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useSaveBusinessProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BusinessProfileInput) =>
      invoke<{ data: SaveBusinessProfileResult }>('tenant-onboarding/business-profile', {
        method: 'POST',
        body:   JSON.stringify(input),
      }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: onboardingKeys.businessProfile });
      void qc.invalidateQueries({ queryKey: onboardingKeys.progress });
    },
  });
}
