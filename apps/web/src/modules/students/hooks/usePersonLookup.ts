import { useMutation, useQuery } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@core/api/supabase.js';

// ─── Person Lookup Framework — frontend client ────────────────────────────────
// Student Registration is the first consumer. See supabase/functions/_shared/
// person-lookup.ts for the provider abstraction this calls into.

export interface PersonLookupData {
  first_name?:    string;
  last_name?:     string;
  address_line1?: string;
  postal_code?:   string;
  city?:          string;
  gender?:        'male' | 'female';
  date_of_birth?: string;
}

export interface PersonLookupCapabilities {
  address:      boolean;
  municipality: boolean;
  gender:       boolean;
  postalCode:   boolean;
  dateOfBirth:  boolean;
}

export type PersonLookupStatus = 'found' | 'not_found' | 'unavailable';

export interface PersonLookupResponse {
  status:       PersonLookupStatus;
  data:         PersonLookupData | null;
  provider:     string;
  capabilities: PersonLookupCapabilities;
}

// supabase-js wraps a non-2xx response in FunctionsHttpError whose .message is
// a generic "Edge Function returned a non-2xx status code" — the real
// {code, message} body must be read from error.context separately (same
// idiom as modules/tenant-onboarding/hooks/useTenantOnboarding.ts).
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

async function apiLookupPerson(personnummer: string): Promise<PersonLookupResponse> {
  const { data, error } = await supabase.functions.invoke<{ data: PersonLookupResponse }>(
    'students/lookup-person',
    { method: 'POST', body: { personnummer } },
  );
  if (error) {
    const message = await extractErrorMessage(error, 'Sökningen misslyckades');
    throw new Error(message);
  }
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

export function usePersonLookupByPersonnummer() {
  return useMutation({
    mutationFn: apiLookupPerson,
  });
}

// ─── Status (External Services settings page) ─────────────────────────────────

export interface PersonLookupStatusResponse {
  provider:     string;
  connected:    boolean;
  capabilities: PersonLookupCapabilities;
}

async function apiPersonLookupStatus(): Promise<PersonLookupStatusResponse> {
  const { data, error } = await supabase.functions.invoke<{ data: PersonLookupStatusResponse }>(
    'students/lookup-person/status',
    { method: 'GET' },
  );
  // Thrown as-is (not stringified) so callers can inspect the HTTP status —
  // see apps/web/src/shared/lib/integrationStatus.ts, used by the External
  // Services hub to distinguish a subscription restriction from a real error.
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

export function usePersonLookupStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['person-lookup', 'status'],
    queryFn:  apiPersonLookupStatus,
    ...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
  });
}
