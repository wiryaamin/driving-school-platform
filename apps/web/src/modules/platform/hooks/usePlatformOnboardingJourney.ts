import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────
//
// Mirrors the Product Owner's mandatory 10-step business workflow exactly
// (Review Customer → Approve Onboarding → Choose Subscription → Create
// Organization → Create Administrator → Send Invitation → Administrator
// Activated → School Configuration → Verify Payment → Go Live Approval →
// Complete). `stage` is always one of these ten labels, or "Complete".

export type OnboardingHealth = 'green' | 'yellow' | 'red';

export type OnboardingActionKey =
  | 'mark-reviewed' | 'approve-onboarding' | 'resend-invitation' | 'cancel-invitation' | 'contact-customer'
  | 'verify-payment' | 'send-password-reset' | 'force-password-reset'
  | 'approve-go-live' | 'retry-communication';

export type OnboardingRecoveryAction =
  | 'resend-invitation' | 'cancel-invitation' | 'send-password-reset' | 'force-password-reset'
  | 'approve-go-live' | 'retry-communication';

export interface OnboardingTimelineEntry {
  label: string;
  occurred_at: string;
  /** Who performed it, when recorded — omitted for system-derived milestones
   *  (e.g. "First Vehicle Added") that have no attributable actor. */
  actor?: string | null;
}

export interface OnboardingWorkflowStep {
  key: string;
  label: string;
  completed: boolean;
  owner: 'Platform' | 'Customer' | 'Customer Success';
  blocking_reason: string | null;
  primary_action: { label: string; action: OnboardingActionKey } | null;
}

export interface OnboardingJourney {
  organization_id:   string;
  organization_name: string | null;
  subscription_tier:   string | null;
  subscription_status: string | null;
  stage:             string;
  progress_label:    string;
  progress_percent:  number;
  health:            OnboardingHealth;
  pending_action_owner: string;
  next_recommended_action: { label: string; action: OnboardingActionKey | null };
  recovery_actions:  OnboardingRecoveryAction[];
  expected_completion: { type: 'date' | 'typical_range'; value: string } | null;
  steps:             OnboardingWorkflowStep[];
  recent_activity:   OnboardingTimelineEntry[];
  admin_contact:     {
    user_id: string; name: string | null; email: string | null;
    activated: boolean;
    /** Fixed at first-ever activation — distinct from last_login_at, which updates on every subsequent sign-in. */
    first_login_at: string | null;
    last_login_at: string | null;
    /** Best-effort, from Resend's own send log — null when unknown/not yet looked up. */
    invitation_delivery_status: string | null;
    invitation_expired: boolean;
  } | null;
  customer_contact:  { name: string | null; email: string | null; phone: string | null } | null;
  demo_request_id:   string | null;
  operations_dead_letter_count: number;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function useOnboardingJourney(orgId: string | undefined) {
  return useQuery({
    queryKey: ['platform', 'org', orgId, 'onboarding-journey'],
    enabled:  !!orgId,
    queryFn: async (): Promise<OnboardingJourney> => {
      const { data, error } = await supabase.functions.invoke<{ data: OnboardingJourney }>(
        `platform-admin/orgs/${orgId!}/onboarding-journey`,
        { method: 'GET' },
      );
      if (error) throw new Error(error.message);
      if (!data?.data) throw new Error('Onboarding-resa hittades inte');
      return data.data;
    },
    staleTime: 20_000,
    retry: 1,
  });
}
