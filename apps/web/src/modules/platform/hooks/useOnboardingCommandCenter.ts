import { useQueries } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { OnboardingJourney } from './usePlatformOnboardingJourney.js';

/**
 * Fetches the existing per-org Onboarding Journey (platform-admin's
 * /orgs/:id/onboarding-journey, already used by OnboardingJourneyPanel) for
 * every org id given, in parallel. Uses the exact same query key shape as
 * useOnboardingJourney so the cache entry is shared — opening a row's detail
 * sheet on the Command Center never re-fetches what this list already has.
 */
export function useOrgJourneys(orgIds: string[]) {
  return useQueries({
    queries: orgIds.map((orgId) => ({
      queryKey: ['platform', 'org', orgId, 'onboarding-journey'] as const,
      queryFn: async (): Promise<OnboardingJourney> => {
        const { data, error } = await supabase.functions.invoke<{ data: OnboardingJourney }>(
          `platform-admin/orgs/${orgId}/onboarding-journey`,
          { method: 'GET' },
        );
        if (error) throw new Error(error.message);
        if (!data?.data) throw new Error('Onboarding-resa hittades inte');
        return data.data;
      },
      staleTime: 20_000,
      retry: 1,
    })),
  });
}

// ─── Operational status ─────────────────────────────────────────────────────
//
// Derived purely from fields the existing onboarding-journey endpoint
// already returns (stage / steps / next_recommended_action) — no new
// backend field, no new business rule, just a display label over data that
// already exists.

export type OperationalStatus = 'completed' | 'action_required' | 'waiting_for_customer' | 'in_progress';

export const OPERATIONAL_STATUS_LABEL: Record<OperationalStatus, string> = {
  completed:             'Klar',
  action_required:       'Åtgärd krävs',
  waiting_for_customer:  'Väntar på kund',
  in_progress:           'Pågår',
};

export const OPERATIONAL_STATUS_BADGE: Record<OperationalStatus, string> = {
  completed:             'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  action_required:       'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  waiting_for_customer:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  in_progress:           'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export function deriveOperationalStatus(journey: Pick<OnboardingJourney, 'stage' | 'steps' | 'next_recommended_action'>): OperationalStatus {
  if (journey.stage === 'Complete') return 'completed';
  const currentStep = journey.steps.find((s) => !s.completed);
  if (!currentStep) return 'completed';
  if (currentStep.owner === 'Customer' && !journey.next_recommended_action.action) return 'waiting_for_customer';
  if (journey.next_recommended_action.action) return 'action_required';
  return 'in_progress';
}

// ─── Time-in-stage ───────────────────────────────────────────────────────────
//
// Reuses the existing recent_activity timeline (already chronologically
// sorted server-side) rather than adding a new "stage entered at" field —
// its most recent entry is exactly the event that produced the current
// stage (org creation, invitation sent, first login, etc.), since a new
// timeline entry is only ever pushed when something real happens.

export function stageEnteredAt(journey: Pick<OnboardingJourney, 'recent_activity'>): string | null {
  const entries = journey.recent_activity;
  return entries.length > 0 ? entries[entries.length - 1]!.occurred_at : null;
}

// ─── Time-in-stage formatting ───────────────────────────────────────────────

export function formatTimeInStage(since: string | null): string {
  if (!since) return '—';
  const ms = Date.now() - new Date(since).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} ${days === 1 ? 'dag' : 'dagar'}`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} ${hours === 1 ? 'timme' : 'timmar'}`;
  return 'Mindre än en timme';
}
