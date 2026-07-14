import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { DemoRequestStatus } from './useDemoRequests.js';
import { extractFunctionErrorMessage, type ProvisioningResult } from '../lib/provisioningSchema.js';

// ─── DB access helper ─────────────────────────────────────────────────────────
// See useDemoRequests.ts for why the cast is needed (table not in the
// hand-maintained Database type stub).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function demoRequests() { return (supabase as any).from('demo_requests'); }

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['platform', 'demo-requests'] });
}

// ─── Update status ────────────────────────────────────────────────────────────
//
// contacted_at / converted_at are stamped client-side the first time a
// request moves into 'contacted' / 'converted' — mirrors how
// usePlatformOrgMutations.ts computes trial_ends_at client-side rather than
// via a DB trigger, keeping this table's simple UPDATE-only write path
// (no SECURITY DEFINER function needed for a lifecycle this small).

export function useUpdateDemoRequestStatus() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async ({
      id, status, alreadyContacted, alreadyConverted,
    }: {
      id: string;
      status: DemoRequestStatus;
      alreadyContacted: boolean;
      alreadyConverted: boolean;
    }): Promise<void> => {
      const patch: Record<string, unknown> = { status };
      if (status === 'contacted' && !alreadyContacted) {
        patch['contacted_at'] = new Date().toISOString();
      }
      if (status === 'converted' && !alreadyConverted) {
        patch['converted_at'] = new Date().toISOString();
      }

      const { error } = await demoRequests().update(patch).eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: invalidate,
  });
}

// ─── Assign to a platform administrator ───────────────────────────────────────

export function useAssignDemoRequest() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async ({ id, assignedTo }: { id: string; assignedTo: string | null }): Promise<void> => {
      const { error } = await demoRequests().update({ assigned_to: assignedTo }).eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: invalidate,
  });
}

// ─── Internal notes ───────────────────────────────────────────────────────────

export function useUpdateDemoRequestNotes() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }): Promise<void> => {
      const { error } = await demoRequests().update({ internal_notes: notes }).eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: invalidate,
  });
}

// ─── Convert to Customer (Automated Customer Provisioning) ────────────────────
//
// Calls the same POST /provision endpoint as useCreateOrg (usePlatformOrgMutations.ts)
// — this is the second of the two entry points that converge on one automated
// provisioning pipeline. Passing demo_request_id lets the Edge Function update
// this request's own status/converted_organization_id/converted_at as part of
// the same call, instead of a separate client-side update after the fact.

export interface ConvertDemoRequestInput {
  demoRequestId:   string;
  name:            string;
  legalName:       string;
  orgNumber:       string | null;
  subscriptionTier: string;
  trialDays:        number;
  adminFirstName:   string;
  adminLastName:    string;
  adminEmail:       string;
}

export function useConvertDemoRequestToCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ConvertDemoRequestInput): Promise<ProvisioningResult> => {
      const { data, error } = await supabase.functions.invoke<{ data: ProvisioningResult }>(
        'platform-admin/provision',
        {
          method: 'POST',
          body: {
            demo_request_id:   input.demoRequestId,
            name:              input.name,
            legal_name:        input.legalName,
            org_number:        input.orgNumber,
            subscription_tier: input.subscriptionTier,
            trial_days:        input.trialDays,
            admin_first_name:  input.adminFirstName,
            admin_last_name:   input.adminLastName,
            admin_email:       input.adminEmail,
          },
        },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte skapa organisationen'));
      if (!data?.data) throw new Error('Inget svar från provisioneringstjänsten');
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'demo-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['platform', 'organizations'] });
      void queryClient.invalidateQueries({ queryKey: ['platform', 'org-stats'] });
    },
  });
}
