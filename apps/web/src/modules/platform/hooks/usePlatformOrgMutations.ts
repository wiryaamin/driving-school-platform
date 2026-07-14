import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';
import type { PlatformOrganization } from './usePlatformOrganizations.js';
import { extractFunctionErrorMessage, type ProvisioningResult } from '../lib/provisioningSchema.js';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateOrgInput {
  name:              string;
  legal_name:        string;
  org_number:        string | null;
  subscription_tier: string;
  trial_days:        number;
  admin_first_name:  string;
  admin_last_name:   string;
  admin_email:       string;
}

export interface UpdateOrgInput {
  id:                string;
  name:              string;
  legal_name:        string;
  org_number:        string | null;
  contact_email:     string | null;
  subscription_tier: string;
  max_users:         number;
  max_locations:     number;
  existingSettings:  Record<string, unknown>;
}

export type AdminRole = 'org_owner' | 'org_admin' | 'org_manager';

export interface InviteAdminInput {
  orgId:      string;
  firstName:  string;
  lastName:   string;
  email:      string;
  role:       AdminRole;
}

// ─── DB access helper ─────────────────────────────────────────────────────────
//
// The hand-written Database stub in @platform/types lacks Relationships fields,
// causing supabase-js v2.47+ to resolve Insert/Update types to never. Reads are
// unaffected (results are cast). Mutations use an untyped accessor; security is
// enforced by RLS policies organizations_insert_platform + organizations_update_platform.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function orgs() { return (supabase as any).from('organizations'); }

const ORG_RETURN =
  'id, slug, name, legal_name, org_number, status, subscription_tier, subscription_status, trial_ends_at, max_users, max_locations, settings, created_at';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useActorId(): string | null {
  return useSessionStore(s => s.user?.id ?? null);
}

function useInvalidatePlatform() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['platform'] });
}

function asOrg(raw: unknown): PlatformOrganization {
  return raw as PlatformOrganization;
}

// ─── Create Organization (Automated Customer Provisioning) ────────────────────
//
// Calls POST /provision instead of inserting the organizations row directly —
// that bare insert (the previous implementation) is exactly the gap the
// Customer Provisioning & Tenant Onboarding Architecture (Section 7) closes:
// it produced an organization with no location, no admin, no membership, no
// role. The Edge Function performs the full sequence atomically, with
// rollback on partial failure. See supabase/functions/platform-admin/index.ts
// (handleProvision) for the implementation.

export function useCreateOrg() {
  const invalidate = useInvalidatePlatform();

  return useMutation({
    mutationFn: async (input: CreateOrgInput): Promise<ProvisioningResult> => {
      const { data, error } = await supabase.functions.invoke<{ data: ProvisioningResult }>(
        'platform-admin/provision',
        {
          method: 'POST',
          body: {
            name:              input.name.trim(),
            legal_name:        input.legal_name.trim(),
            org_number:        input.org_number || null,
            subscription_tier: input.subscription_tier,
            trial_days:        input.trial_days,
            admin_first_name:  input.admin_first_name.trim(),
            admin_last_name:   input.admin_last_name.trim(),
            admin_email:       input.admin_email.trim(),
          },
        },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte skapa organisationen'));
      if (!data?.data) throw new Error('Inget svar från provisioneringstjänsten');
      return data.data;
    },
    onSuccess: invalidate,
  });
}

// ─── Update Organization ──────────────────────────────────────────────────────

export function useUpdateOrg() {
  const actorId    = useActorId();
  const invalidate = useInvalidatePlatform();

  return useMutation({
    mutationFn: async (input: UpdateOrgInput): Promise<PlatformOrganization> => {
      const newSettings: Record<string, unknown> = {
        ...input.existingSettings,
        contact_email: input.contact_email || null,
      };

      const { data, error } = await orgs()
        .update({
          name:              input.name.trim(),
          legal_name:        input.legal_name.trim(),
          org_number:        input.org_number || null,
          subscription_tier: input.subscription_tier,
          max_users:         input.max_users,
          max_locations:     input.max_locations,
          settings:          newSettings,
          updated_by:        actorId,
        })
        .eq('id', input.id)
        .select(ORG_RETURN)
        .single();

      if (error) throw new Error((error as { message: string }).message);
      return asOrg(data);
    },
    onSuccess: invalidate,
  });
}

// ─── Suspend Organization ─────────────────────────────────────────────────────

export function useSuspendOrg() {
  const actorId    = useActorId();
  const invalidate = useInvalidatePlatform();

  return useMutation({
    mutationFn: async (orgId: string): Promise<void> => {
      const { error } = await orgs()
        .update({ status: 'suspended', updated_by: actorId })
        .eq('id', orgId);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: invalidate,
  });
}

// ─── Reactivate Organization ──────────────────────────────────────────────────

export function useReactivateOrg() {
  const actorId    = useActorId();
  const invalidate = useInvalidatePlatform();

  return useMutation({
    mutationFn: async (orgId: string): Promise<void> => {
      const { error } = await orgs()
        .update({ status: 'active', updated_by: actorId })
        .eq('id', orgId);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: invalidate,
  });
}

// ─── Terminate Organization ───────────────────────────────────────────────────
//
// Reuses the exact same direct-RLS-write mechanism as Suspend/Reactivate
// (organizations_update_platform policy) — Organization Lifecycle Stage 2
// implements the existing `terminated` status value, already modeled and
// displayed everywhere, using the architecture that already exists for the
// other two status transitions rather than a new mechanism. Reactivating a
// terminated organization reuses the existing useReactivateOrg unchanged
// (it already writes status: 'active' unconditionally, from any prior status).

export function useTerminateOrg() {
  const actorId    = useActorId();
  const invalidate = useInvalidatePlatform();

  return useMutation({
    mutationFn: async (orgId: string): Promise<void> => {
      const { error } = await orgs()
        .update({ status: 'terminated', updated_by: actorId })
        .eq('id', orgId);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: invalidate,
  });
}

// ─── Start Trial ──────────────────────────────────────────────────────────────

export function useStartTrial() {
  const actorId    = useActorId();
  const invalidate = useInvalidatePlatform();

  return useMutation({
    mutationFn: async ({ orgId, days }: { orgId: string; days: number }): Promise<void> => {
      const { error } = await orgs()
        .update({
          subscription_tier:   'trial',
          subscription_status: 'trialing',
          trial_ends_at:       new Date(Date.now() + days * 86_400_000).toISOString(),
          updated_by:          actorId,
        })
        .eq('id', orgId);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: invalidate,
  });
}

// ─── Extend Trial ─────────────────────────────────────────────────────────────

export function useExtendTrial() {
  const actorId    = useActorId();
  const invalidate = useInvalidatePlatform();

  return useMutation({
    mutationFn: async ({ orgId, days, currentTrialEndsAt }: { orgId: string; days: number; currentTrialEndsAt: string }): Promise<void> => {
      const currentEnd = new Date(currentTrialEndsAt);
      const base = currentEnd > new Date() ? currentEnd : new Date();
      const newEnd = new Date(base.getTime() + days * 86_400_000);

      const { error } = await orgs()
        .update({
          trial_ends_at: newEnd.toISOString(),
          updated_by: actorId,
        })
        .eq('id', orgId);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: invalidate,
  });
}

// ─── End Trial ────────────────────────────────────────────────────────────────

export function useEndTrial() {
  const actorId    = useActorId();
  const invalidate = useInvalidatePlatform();

  return useMutation({
    mutationFn: async ({ orgId, targetTier }: { orgId: string; targetTier: string }): Promise<void> => {
      const { error } = await orgs()
        .update({
          subscription_tier:   targetTier,
          subscription_status: 'active',
          trial_ends_at:       null,
          updated_by:          actorId,
        })
        .eq('id', orgId);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: invalidate,
  });
}

// ─── Administrator Management ─────────────────────────────────────────────────
//
// All five actions go through platform-admin (not a direct RLS write) because
// Invite Administrator requires the Supabase Auth Admin API, which only a
// service-role Edge Function can call — the same reason handleProvision is an
// Edge Function rather than a client-side insert. The other four are grouped
// alongside it for one consistent administrator-management surface, and
// because each enforces a multi-row invariant (exactly one active admin-tier
// role per person, never zero active administrators) that's safer to
// evaluate server-side than as a bare RLS-gated update.

function useInvalidateOrgAdmins(orgId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['platform', 'org', orgId, 'admins'] });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'org', orgId, 'timeline'] });
  };
}

export function useInviteAdmin(orgId: string) {
  const invalidate = useInvalidateOrgAdmins(orgId);

  return useMutation({
    mutationFn: async (input: Omit<InviteAdminInput, 'orgId'>): Promise<{ user_id: string; membership_id: string; role: AdminRole }> => {
      const { data, error } = await supabase.functions.invoke<{ data: { user_id: string; membership_id: string; role: AdminRole } }>(
        `platform-admin/orgs/${orgId}/admins`,
        {
          method: 'POST',
          body: {
            first_name: input.firstName.trim(),
            last_name:  input.lastName.trim(),
            email:      input.email.trim(),
            role:       input.role,
          },
        },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte bjuda in administratören'));
      if (!data?.data) throw new Error('Inget svar från servern');
      return data.data;
    },
    onSuccess: invalidate,
  });
}

export function useChangeAdminRole(orgId: string) {
  const invalidate = useInvalidateOrgAdmins(orgId);

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AdminRole }): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `platform-admin/orgs/${orgId}/admins/${userId}/role`,
        { method: 'POST', body: { role } },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte ändra rollen'));
    },
    onSuccess: invalidate,
  });
}

export function useDisableAdmin(orgId: string) {
  const invalidate = useInvalidateOrgAdmins(orgId);

  return useMutation({
    mutationFn: async (userId: string): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `platform-admin/orgs/${orgId}/admins/${userId}/disable`,
        { method: 'POST' },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte inaktivera administratören'));
    },
    onSuccess: invalidate,
  });
}

export function useReactivateAdmin(orgId: string) {
  const invalidate = useInvalidateOrgAdmins(orgId);

  return useMutation({
    mutationFn: async (userId: string): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `platform-admin/orgs/${orgId}/admins/${userId}/reactivate`,
        { method: 'POST' },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte återaktivera administratören'));
    },
    onSuccess: invalidate,
  });
}

export function useTransferOwnership(orgId: string) {
  const invalidate = useInvalidateOrgAdmins(orgId);

  return useMutation({
    mutationFn: async (userId: string): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `platform-admin/orgs/${orgId}/admins/${userId}/transfer-ownership`,
        { method: 'POST' },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte överföra ägarskapet'));
    },
    onSuccess: invalidate,
  });
}

// ─── Administrator Invitation Lifecycle (Phase 4) ─────────────────────────────
// Both are scoped server-side to invitation_status = 'pending' only — see
// platform-admin/index.ts's own comment on why an already-accepted
// administrator uses Disable Administrator instead.

export function useResendInvitation(orgId: string) {
  const invalidate = useInvalidateOrgAdmins(orgId);

  return useMutation({
    mutationFn: async (userId: string): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `platform-admin/orgs/${orgId}/admins/${userId}/resend-invitation`,
        { method: 'POST' },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte skicka inbjudan igen'));
    },
    onSuccess: invalidate,
  });
}

export function useCancelInvitation(orgId: string) {
  const invalidate = useInvalidateOrgAdmins(orgId);

  return useMutation({
    mutationFn: async (userId: string): Promise<void> => {
      const { error } = await supabase.functions.invoke(
        `platform-admin/orgs/${orgId}/admins/${userId}/cancel-invitation`,
        { method: 'POST' },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte avbryta inbjudan'));
    },
    onSuccess: invalidate,
  });
}
