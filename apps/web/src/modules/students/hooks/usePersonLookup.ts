import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@core/api/supabase.js';

// ─── Person Lookup Framework — frontend client ────────────────────────────────
// Student Registration is the first consumer. See supabase/functions/_shared/
// person-lookup.ts for the provider abstraction this calls into.

export interface PersonLookupData {
  first_name?:         string;
  last_name?:          string;
  full_legal_name?:    string;
  address_line1?:      string;
  postal_code?:        string;
  city?:               string;
  gender?:             'male' | 'female';
  date_of_birth?:      string;
  identity_valid?:     boolean;
  protected_identity?: boolean;
  deceased?:           boolean;
  /** True when the registry shows this person as emigrated — address data
   *  should not be trusted/auto-filled with the same confidence as a
   *  current resident. */
  emigrated?:          boolean;
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
  from_cache?:  boolean;
  confidence?:  'exact' | 'partial' | 'unknown' | null;
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

// ─── Tenant configuration (External Services settings page) ───────────────────
// Person Lookup is platform-managed (ADR: platform-managed integrations) —
// provider/credentials are no longer part of this response or writable via
// the update mutation below; only operational/business settings remain.

export interface PersonLookupConfig {
  platform_managed:             true;
  timeout_ms:                   number;
  max_retries:                  number;
  retry_backoff_ms:             number;
  auto_lookup_enabled:          boolean;
  auto_address_update_enabled:  boolean;
  cache_ttl_seconds:            number;
  is_active:                    boolean;
}

async function apiGetPersonLookupConfig(): Promise<PersonLookupConfig> {
  const { data, error } = await supabase.functions.invoke<{ data: PersonLookupConfig }>(
    'person-lookup-config', { method: 'GET' },
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

export function usePersonLookupConfig(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['person-lookup', 'config'],
    queryFn:  apiGetPersonLookupConfig,
    ...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
  });
}

export interface UpdatePersonLookupConfigInput {
  is_active?:                   boolean;
  auto_lookup_enabled?:         boolean;
  auto_address_update_enabled?: boolean;
  cache_ttl_seconds?:           number;
}

async function apiUpdatePersonLookupConfig(input: UpdatePersonLookupConfigInput): Promise<PersonLookupConfig> {
  const { data, error } = await supabase.functions.invoke<{ data: PersonLookupConfig }>(
    'person-lookup-config', { method: 'POST', body: input },
  );
  if (error) {
    const message = await extractErrorMessage(error, 'Kunde inte spara konfigurationen');
    throw new Error(message);
  }
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

export function useUpdatePersonLookupConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiUpdatePersonLookupConfig,
    onSuccess: (updated) => {
      qc.setQueryData(['person-lookup', 'config'], updated);
      void qc.invalidateQueries({ queryKey: ['person-lookup', 'status'] });
    },
  });
}
