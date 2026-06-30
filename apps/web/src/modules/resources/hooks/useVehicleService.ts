import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { vehicleKeys } from './useVehicles.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceType =
  | 'annual_service'
  | 'oil_change'
  | 'tires'
  | 'brakes'
  | 'repair'
  | 'inspection_prep'
  | 'cleaning'
  | 'other';

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  annual_service:  'Årsservice',
  oil_change:      'Oljebyte',
  tires:           'Däckbyte',
  brakes:          'Bromsar',
  repair:          'Reparation',
  inspection_prep: 'Besiktningsförberedelse',
  cleaning:        'Rengöring',
  other:           'Övrigt',
};

export interface VehicleServiceRecord {
  id:               string;
  organization_id:  string;
  vehicle_id:       string;
  service_type:     ServiceType;
  service_date:     string;
  mileage_km:       number | null;
  cost_sek:         number | null;
  performed_by:     string | null;
  notes:            string | null;
  next_service_date: string | null;
  created_at:       string;
}

export interface CreateServiceRecordInput {
  vehicle_id:        string;
  service_type:      ServiceType;
  service_date:      string;
  mileage_km?:       number | null | undefined;
  cost_sek?:         number | null | undefined;
  performed_by?:     string | undefined;
  notes?:            string | undefined;
  next_service_date?: string | null | undefined;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const serviceKeys = {
  all:    ['vehicle_service_records'] as const,
  lists:  () => [...serviceKeys.all, 'list'] as const,
  list:   (vehicleId?: string) => [...serviceKeys.lists(), vehicleId ?? 'all'] as const,
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchServiceRecords(vehicleId?: string): Promise<VehicleServiceRecord[]> {
  let q = supabase
    .from('vehicle_service_records')
    .select(`
      id, organization_id, vehicle_id, service_type,
      service_date, mileage_km, cost_sek, performed_by,
      notes, next_service_date, created_at
    `)
    .is('deleted_at', null)
    .order('service_date', { ascending: false });

  if (vehicleId) q = q.eq('vehicle_id', vehicleId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as VehicleServiceRecord[];
}

// ─── Create ───────────────────────────────────────────────────────────────────

async function createServiceRecord(input: CreateServiceRecordInput): Promise<void> {
  const { error } = await supabase
    .from('vehicle_service_records')
    .insert(input as never);
  if (error) throw new Error(error.message);
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────

async function deleteServiceRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('vehicle_service_records')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useVehicleServiceRecords(vehicleId?: string) {
  return useQuery({
    queryKey: serviceKeys.list(vehicleId),
    queryFn:  () => fetchServiceRecords(vehicleId),
    staleTime: 2 * 60_000,
  });
}

export function useCreateServiceRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createServiceRecord,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: serviceKeys.lists() });
      void qc.invalidateQueries({ queryKey: vehicleKeys.list() });
    },
  });
}

export function useDeleteServiceRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteServiceRecord,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: serviceKeys.lists() });
      void qc.invalidateQueries({ queryKey: vehicleKeys.list() });
    },
  });
}
