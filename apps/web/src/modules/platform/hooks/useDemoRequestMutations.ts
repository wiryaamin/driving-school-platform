import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';
import type { Answers as BusinessSetupAnswers } from '@modules/trial-onboarding/index.js';
import type { DemoRequestStatus, DemoRequestRejectionReason } from './useDemoRequests.js';
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
//
// businessSetup is mandatory here too (Corrective Pass, 2026-08-28) — a demo
// request converting to a real, live trafikskola is exactly the "normal
// tenant creation" this unification covers, not an internal/admin-only
// exception. ConvertToCustomerDialog validates it the same way
// CreateOrgDialog does before calling this mutation.

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
  businessSetup:    BusinessSetupAnswers;
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
            business_setup:    input.businessSetup,
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

// ─── Mandatory onboarding workflow: Step 1 (Review) / Step 2 (Approve) ────────
// Same direct-table-update pattern as useUpdateDemoRequestStatus above —
// two small, additive columns (20260730000003), no new backend endpoint.

export function useMarkDemoRequestReviewed() {
  const invalidate = useInvalidate();
  const actorId = useSessionStore((s) => s.user?.id ?? null);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await demoRequests().update({
        reviewed_at: new Date().toISOString(),
        reviewed_by: actorId,
      }).eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['platform'] });
    },
  });
}

export function useApproveDemoRequestOnboarding() {
  const invalidate = useInvalidate();
  const actorId = useSessionStore((s) => s.user?.id ?? null);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await demoRequests().update({
        approved_at: new Date().toISOString(),
        approved_by: actorId,
      }).eq('id', id);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['platform'] });
    },
  });
}

// ─── Reject ───────────────────────────────────────────────────────────────────
//
// Unlike the plain client-side updates above, rejection goes through
// platform-admin (not a direct RLS write) because it also sends a real
// rejection email — that needs the service-role Resend credential, which
// only an Edge Function has access to. See platform-admin/index.ts's
// handleRejectDemoRequest.

export interface RejectDemoRequestInput {
  id:          string;
  reason:      DemoRequestRejectionReason;
  description: string;
}

export function useRejectDemoRequest() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (input: RejectDemoRequestInput): Promise<{ email_sent: boolean }> => {
      const { data, error } = await supabase.functions.invoke<{ data: { id: string; status: string; email_sent: boolean } }>(
        `platform-admin/demo-requests/${input.id}/reject`,
        { method: 'POST', body: { reason: input.reason, description: input.description } },
      );
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte avvisa förfrågan'));
      if (!data?.data) throw new Error('Inget svar från servern');
      return { email_sent: data.data.email_sent };
    },
    onSuccess: invalidate,
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────
//
// Hard delete via platform-admin — demo_requests has no client-side DELETE
// RLS policy (service-role only), matching the rest of this table's access
// model (see useDemoRequests.ts's own comment on RLS).

export function useDeleteDemoRequest() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.functions.invoke(`platform-admin/demo-requests/${id}`, { method: 'DELETE' });
      if (error) throw new Error(await extractFunctionErrorMessage(error, 'Kunde inte ta bort förfrågan'));
    },
    onSuccess: invalidate,
  });
}
