import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { extractFunctionErrorMessage } from '../lib/provisioningSchema.js';

// ─── Types ────────────────────────────────────────────────────────────────────
//
// tenant_trial_sessions has no RLS policies (service-role only, same as
// demo_requests before it) — everything here goes through platform-admin's
// /trial-requests routes, mirroring useTenantOnboardingList/useApproveGoLive's
// own supabase.functions.invoke pattern, not a direct table query.

export type TrialRequestStatus =
  | 'pending_verification' | 'email_verified' | 'questionnaire_in_progress' | 'questionnaire_completed'
  | 'approved' | 'provisioning' | 'provisioning_failed' | 'active'
  | 'rejected' | 'cancelled' | 'expired';

export interface TrialRequest {
  id:                    string;
  token:                 string;
  email:                 string;
  driving_school_name:   string;
  organization_id:       string | null;
  admin_user_id:         string | null;
  status:                TrialRequestStatus;
  expires_at:            string;
  email_verified_at:     string | null;
  completed_at:          string | null;
  rejected_at:           string | null;
  rejection_reason:      string | null;
  cancelled_at:          string | null;
  cancellation_reason:   string | null;
  created_at:            string;
  updated_at:            string;
}

export interface TrialEvent {
  id:                   string;
  session_id:           string | null;
  email:                string;
  driving_school_name:  string;
  event_type:           string;
  actor_type:           'system' | 'applicant' | 'admin';
  actor_id:              string | null;
  actor_email:           string | null;
  metadata:              Record<string, unknown>;
  created_at:             string;
}

export interface TrialRequestDetail {
  session: TrialRequest;
  events:  TrialEvent[];
}

export type TrialRejectionReason =
  | 'duplicate_email' | 'duplicate_request' | 'spam_or_fraud' | 'incomplete_invalid_info'
  | 'not_target_market' | 'unable_to_verify_business' | 'outside_service_area' | 'other';

// ─── Query keys ───────────────────────────────────────────────────────────────

const trialRequestKeys = {
  list:   (status?: string) => ['platform', 'trial-requests', status ?? 'all'] as const,
  detail: (id: string) => ['platform', 'trial-requests', 'detail', id] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useTrialRequests(status?: string) {
  return useQuery({
    queryKey: trialRequestKeys.list(status),
    queryFn: async (): Promise<TrialRequest[]> => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      const { data, error } = await supabase.functions.invoke<{ data: TrialRequest[] }>(
        `platform-admin/trial-requests${qs}`,
        { method: 'GET' },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte hämta testperiodsförfrågningar'));
      return data?.data ?? [];
    },
    staleTime: 15_000,
  });
}

export function useTrialRequestDetail(id: string | null) {
  return useQuery({
    queryKey: trialRequestKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<TrialRequestDetail> => {
      const { data, error } = await supabase.functions.invoke<{ data: TrialRequestDetail }>(
        `platform-admin/trial-requests/${id}`,
        { method: 'GET' },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte hämta förfrågan'));
      if (!data) throw new Error('Kunde inte hämta förfrågan');
      return data.data;
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

function useInvalidateTrialRequests() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['platform', 'trial-requests'] });
}

// Provisioning (org + configuration engine + administrator account +
// vehicles/instructors/staff/branches/slots) runs synchronously inside this
// call — can take several seconds for a fully-answered questionnaire.
export function useApproveTrialRequest() {
  const invalidate = useInvalidateTrialRequests();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(`platform-admin/trial-requests/${id}/approve`, { method: 'POST' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte godkänna och driftsätta förfrågan'));
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useRejectTrialRequest() {
  const invalidate = useInvalidateTrialRequests();
  return useMutation({
    mutationFn: async ({ id, reason, description }: { id: string; reason: TrialRejectionReason; description?: string }) => {
      const { data, error } = await supabase.functions.invoke(
        `platform-admin/trial-requests/${id}/reject`,
        { method: 'POST', body: { reason, description } },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte avvisa förfrågan'));
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useCancelTrialRequest() {
  const invalidate = useInvalidateTrialRequests();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { data, error } = await supabase.functions.invoke(
        `platform-admin/trial-requests/${id}/cancel`,
        { method: 'POST', body: { reason } },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte avbryta förfrågan'));
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useExpireTrialRequest() {
  const invalidate = useInvalidateTrialRequests();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(`platform-admin/trial-requests/${id}/expire`, { method: 'POST' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte markera förfrågan som utgången'));
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTrialRequest() {
  const invalidate = useInvalidateTrialRequests();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(`platform-admin/trial-requests/${id}`, { method: 'DELETE' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte ta bort förfrågan'));
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useResendTrialVerification() {
  const invalidate = useInvalidateTrialRequests();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(`platform-admin/trial-requests/${id}/resend-verification`, { method: 'POST' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte skicka om verifieringsmailet'));
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useResendTrialQuestionnaire() {
  const invalidate = useInvalidateTrialRequests();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(`platform-admin/trial-requests/${id}/resend-questionnaire`, { method: 'POST' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte skicka om frågeformuläret'));
      return data;
    },
    onSuccess: invalidate,
  });
}
