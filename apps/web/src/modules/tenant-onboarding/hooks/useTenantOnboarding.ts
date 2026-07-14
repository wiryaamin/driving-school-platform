import { useQuery } from '@tanstack/react-query';
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

// ─── Query keys ───────────────────────────────────────────────────────────────

export const onboardingKeys = {
  progress: ['tenant-onboarding', 'progress'] as const,
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
