import { z } from 'zod';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { SUBSCRIPTION_TIERS } from '@platform/types';

// supabase-js's functions.invoke() wraps a non-2xx response in a
// FunctionsHttpError whose own .message is a generic "Edge Function
// returned a non-2xx status code" — the real {code, message, trace_id}
// body (this project's canonical error shape) lives on error.context,
// the raw fetch Response, and must be read separately. Without this, every
// validation/conflict error from POST /provision (and any future
// .invoke() caller) would show that generic string instead of the actual
// reason — confirmed live via a duplicate-admin-email test during
// verification, not a hypothetical concern.
export async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
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

// Shared by CreateOrgDialog (standalone) and ConvertToCustomerDialog
// (pre-filled from a demo request) — both call the same POST /provision
// endpoint, so both validate against the same shape.

export const provisioningSchema = z.object({
  name:              z.string().min(2, 'Minst 2 tecken').max(100),
  legal_name:        z.string().min(2, 'Minst 2 tecken').max(200),
  org_number:        z.string().max(13).default(''),
  subscription_tier: z.enum(SUBSCRIPTION_TIERS),
  trial_days:        z.coerce.number().int().min(1).max(365).default(30),
  admin_first_name:  z.string().min(1, 'Förnamn krävs').max(100),
  admin_last_name:   z.string().min(1, 'Efternamn krävs').max(100),
  admin_email:       z.string().min(1, 'E-post krävs').email('Ogiltig e-postadress'),
}).superRefine((data, ctx) => {
  if (data.org_number && !/^\d{6}-\d{4}$/.test(data.org_number)) {
    ctx.addIssue({ code: 'custom', path: ['org_number'], message: 'Format: XXXXXX-XXXX' });
  }
  if (data.subscription_tier === 'trial' && data.trial_days < 1) {
    ctx.addIssue({ code: 'custom', path: ['trial_days'], message: 'Minst 1 dag' });
  }
});

export type ProvisioningFormValues = z.infer<typeof provisioningSchema>;

export interface ProvisioningResult {
  organization_id:      string;
  slug:                 string;
  tenant_admin_user_id: string;
  membership_id:        string;
  provisioning_run_id:  string;
  demo_request_updated: boolean;
}
