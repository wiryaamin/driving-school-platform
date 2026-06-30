import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';
import { generateUniqueSlug } from '../lib/slugify.js';
import type { PlatformOrganization } from './usePlatformOrganizations.js';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateOrgInput {
  name:              string;
  legal_name:        string;
  org_number:        string | null;
  contact_email:     string | null;
  subscription_tier: string;
  trial_days:        number;
}

export interface UpdateOrgInput {
  id:                string;
  name:              string;
  legal_name:        string;
  org_number:        string | null;
  contact_email:     string | null;
  subscription_tier: string;
  existingSettings:  Record<string, unknown>;
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
  'id, slug, name, legal_name, org_number, status, subscription_tier, subscription_status, trial_ends_at, settings, created_at';

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

// ─── Create Organization ──────────────────────────────────────────────────────

export function useCreateOrg() {
  const actorId    = useActorId();
  const invalidate = useInvalidatePlatform();

  return useMutation({
    mutationFn: async (input: CreateOrgInput): Promise<PlatformOrganization> => {
      const slug = await generateUniqueSlug(input.name);
      const isTrial = input.subscription_tier === 'trial';

      const { data, error } = await orgs()
        .insert({
          slug,
          name:                input.name.trim(),
          legal_name:          input.legal_name.trim(),
          org_number:          input.org_number || null,
          status:              'active',
          subscription_tier:   input.subscription_tier,
          subscription_status: isTrial ? 'trialing' : 'active',
          trial_ends_at:       isTrial
            ? new Date(Date.now() + input.trial_days * 86_400_000).toISOString()
            : null,
          settings:   input.contact_email ? { contact_email: input.contact_email } : {},
          created_by: actorId,
          updated_by: actorId,
        })
        .select(ORG_RETURN)
        .single();

      if (error) throw new Error((error as { message: string }).message);
      return asOrg(data);
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
