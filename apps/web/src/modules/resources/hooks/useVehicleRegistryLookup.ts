import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@core/api/supabase.js';

// ─── Vehicle Registry Lookup Framework — frontend client ──────────────────────
// Populates registration/inspection/technical vehicle data by registration
// number, the same pattern as modules/students/hooks/usePersonLookup.ts. See
// supabase/functions/_shared/vehicle-registry.ts for the provider abstraction
// this calls into.

export interface VehicleRegistryData {
  registration_number?:       string;
  vin?:                       string;
  make?:                      string;
  model?:                     string;
  model_year?:                number;
  color?:                     string;
  registration_status?:       string;
  registration_valid_until?:  string;
  inspection_due_date?:       string;
  last_inspection_date?:      string;
  last_inspection_result?:    string;
  inspection_station_name?:   string;
  insurance_status?:          string;
  debt_flag?:                 boolean;
}

export interface VehicleRegistryCapabilities {
  registrationStatus: boolean;
  inspectionData:     boolean;
  technicalData:      boolean;
  debtInfo:           boolean;
  ownerData:          boolean;
}

export type VehicleRegistryLookupStatus = 'found' | 'not_found' | 'unavailable';

export interface VehicleRegistryLookupResponse {
  status:       VehicleRegistryLookupStatus;
  data:         VehicleRegistryData | null;
  provider:     string;
  capabilities: VehicleRegistryCapabilities;
  from_cache?:  boolean;
}

// supabase-js wraps a non-2xx response in FunctionsHttpError whose .message is
// generic — the real {code, message} body must be read from error.context
// separately (same idiom as usePersonLookup.ts).
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

interface LookupParams {
  registrationNumber: string;
  vehicleId?:         string;
  forceRefresh?:      boolean;
}

async function apiLookupVehicle(params: LookupParams): Promise<VehicleRegistryLookupResponse> {
  const { data, error } = await supabase.functions.invoke<{ data: VehicleRegistryLookupResponse }>(
    'vehicle-registry/lookup',
    {
      method: 'POST',
      body: {
        registration_number: params.registrationNumber,
        ...(params.vehicleId ? { vehicle_id: params.vehicleId } : {}),
        ...(params.forceRefresh ? { force_refresh: true } : {}),
      },
    },
  );
  if (error) {
    const message = await extractErrorMessage(error, 'Sökningen misslyckades');
    throw new Error(message);
  }
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

export function useVehicleRegistryLookup() {
  return useMutation({
    mutationFn: apiLookupVehicle,
  });
}

// ─── Status (External Services settings page) ─────────────────────────────────

export interface VehicleRegistryStatusResponse {
  provider:            string;
  connected:           boolean;
  capabilities:        VehicleRegistryCapabilities;
  auto_lookup_enabled: boolean;
}

async function apiVehicleRegistryStatus(): Promise<VehicleRegistryStatusResponse> {
  const { data, error } = await supabase.functions.invoke<{ data: VehicleRegistryStatusResponse }>(
    'vehicle-registry/status',
    { method: 'GET' },
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

export function useVehicleRegistryStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['vehicle-registry', 'status'],
    queryFn:  apiVehicleRegistryStatus,
    ...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
  });
}

// ─── Tenant configuration (External Services settings page) ───────────────────
// Only 'mock' and 'biluppgifter' are real, implemented providers today —
// 'fordonsfakta'/'custom' are registered but return "not implemented".

export interface VehicleRegistryConfig {
  active_provider:        string;
  credentials_configured: boolean;
  base_url:               string | null;
  timeout_ms:             number;
  max_retries:            number;
  retry_backoff_ms:       number;
  auto_lookup_enabled:    boolean;
  cache_ttl_seconds:      number;
  is_active:              boolean;
}

async function apiGetVehicleRegistryConfig(): Promise<VehicleRegistryConfig> {
  const { data, error } = await supabase.functions.invoke<{ data: VehicleRegistryConfig }>(
    'vehicle-registry-config', { method: 'GET' },
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

export function useVehicleRegistryConfig(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['vehicle-registry', 'config'],
    queryFn:  apiGetVehicleRegistryConfig,
    ...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
  });
}

export interface UpdateVehicleRegistryConfigInput {
  active_provider?: 'mock' | 'biluppgifter';
  api_key?:         string;
  is_active?:       boolean;
}

async function apiUpdateVehicleRegistryConfig(input: UpdateVehicleRegistryConfigInput): Promise<VehicleRegistryConfig> {
  const { data, error } = await supabase.functions.invoke<{ data: VehicleRegistryConfig }>(
    'vehicle-registry-config', { method: 'POST', body: input },
  );
  if (error) {
    const message = await extractErrorMessage(error, 'Kunde inte spara konfigurationen');
    throw new Error(message);
  }
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

export function useUpdateVehicleRegistryConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateVehicleRegistryConfig,
    onSuccess: (updated) => {
      qc.setQueryData(['vehicle-registry', 'config'], updated);
      void qc.invalidateQueries({ queryKey: ['vehicle-registry', 'status'] });
    },
  });
}
