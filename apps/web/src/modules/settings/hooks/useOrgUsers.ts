import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { invokeFunctionWithRetry, isGatewayRoutingError } from '@shared/lib/edgeFunctionRetry.js';
import type { InvitableRole } from '@platform/validation';
import { extractFunctionErrorMessage } from '../lib/orgUserUtils.js';
import type { OrgUserRow, IdentityEventRow } from '../lib/orgUserUtils.js';

export type { OrgUserRow, IdentityEventRow };

// ─── Shared organization-member (admin/staff-user) data layer ────────────────
//
// Single source of truth for the invite-user-backed member list and the
// mutations that act on it — used by Settings → Användare (UsersSettingsPage)
// and by the Personal workspace's Administratörer tab. Both share this query
// key so an edit/invite/deactivate made from either surface is immediately
// reflected in the other.

export const orgUserKeys = {
  all:     (orgId?: string) => ['org-users', orgId] as const,
  history: (userId?: string) => ['org-users-history', userId] as const,
};

export function useOrgUsers(options?: { enabled?: boolean }) {
  const { organization } = useSession();
  const orgId = organization?.id;

  return useQuery<OrgUserRow[]>({
    queryKey: orgUserKeys.all(orgId),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ data: OrgUserRow[] }>(
        'invite-user/list',
        { method: 'GET' },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte hämta användare'));
      return data?.data ?? [];
    },
    enabled: (options?.enabled ?? true) && !!orgId,
    staleTime: 30_000,
  });
}

export function useOrgUserHistory(userId: string | undefined, enabled: boolean) {
  return useQuery<IdentityEventRow[]>({
    queryKey: orgUserKeys.history(userId),
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('identity_security_events')
        .select('id, event_type, severity, occurred_at, metadata')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as IdentityEventRow[];
    },
    enabled: enabled && !!userId,
  });
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

function useInvalidateOrgUsers() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  return () => { void queryClient.invalidateQueries({ queryKey: orgUserKeys.all(orgId) }); };
}

export interface UpdateOrgUserProfileInput {
  userId:     string;
  first_name: string;
  last_name:  string;
  phone:      string;
  is_active:  boolean;
}

export function useUpdateOrgUserProfile() {
  const invalidate = useInvalidateOrgUsers();
  return useMutation({
    mutationFn: async (input: UpdateOrgUserProfileInput) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: input.first_name.trim(),
          last_name:  input.last_name.trim(),
          phone:      input.phone.trim() || null,
          is_active:  input.is_active,
        } as never)
        .eq('id', input.userId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useToggleOrgUserActive() {
  const invalidate = useInvalidateOrgUsers();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: active } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export interface InviteOrgUserInput {
  email:      string;
  first_name: string;
  last_name:  string;
  role:       InvitableRole;

  // ── Common personnel record — all optional (see packages/validation's
  // InviteUserSchema / PERSONNEL_JOB_TITLES for the exact field set) ──────
  job_title?:              string;
  mobile_phone?:           string;
  personnummer?:           string;
  identity_type?:          string; // 'personnummer' | 'samordningsnummer'
  employment_type?:        string;
  employment_number?:      string;
  employment_started_at?:  string;
  employment_ended_at?:    string; // omit = "Tills vidare"
  work_location_id?:       string;
  address_line1?:          string;
  postal_code?:            string;
  city?:                   string;
}

export function useInviteOrgUser() {
  const invalidate = useInvalidateOrgUsers();
  return useMutation({
    mutationFn: async (input: InviteOrgUserInput) => {
      const { data, errorBody, opaqueFailure } = await invokeFunctionWithRetry<
        { data: { status: 'invited' | 'added_existing_user' } },
        { code?: string; message?: string }
      >(
        'invite-user',
        Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== '')),
        isGatewayRoutingError,
      );
      if (opaqueFailure) throw new Error('Kunde inte nå invite-user-funktionen. Försök igen.');
      if (errorBody) throw new Error(errorBody.message ?? 'Inbjudan misslyckades.');
      return data?.data.status ?? 'invited';
    },
    onSuccess: invalidate,
  });
}

export function useResendOrgUserInvitation() {
  const invalidate = useInvalidateOrgUsers();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke(`invite-user/${userId}/resend-invitation`, { method: 'POST' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte skicka inbjudan igen'));
    },
    onSuccess: invalidate,
  });
}

export function useCancelOrgUserInvitation() {
  const invalidate = useInvalidateOrgUsers();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke(`invite-user/${userId}/cancel-invitation`, { method: 'POST' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte avbryta inbjudan'));
    },
    onSuccess: invalidate,
  });
}

export function useSendOrgUserPasswordReset() {
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke(`invite-user/${userId}/send-password-reset`, { method: 'POST' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte skicka lösenordsåterställning'));
    },
  });
}

export function useChangeOrgUserEmail() {
  const invalidate = useInvalidateOrgUsers();
  return useMutation({
    mutationFn: async ({ userId, email }: { userId: string; email: string }) => {
      const { error } = await supabase.functions.invoke(`invite-user/${userId}/change-email`, { method: 'POST', body: { email } });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte ändra e-postadressen'));
    },
    onSuccess: invalidate,
  });
}
