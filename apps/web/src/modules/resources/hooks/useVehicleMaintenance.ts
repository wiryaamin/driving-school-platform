import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { vehicleKeys } from './useVehicles.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MaintenanceRecordType =
  | 'routine_service'
  | 'repair'
  | 'major_service'
  | 'recall'
  | 'tyre_change'
  | 'other';

export type MaintenanceStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceRecordType, string> = {
  routine_service: 'Rutinservice',
  repair:          'Reparation',
  major_service:   'Stor service',
  recall:          'Återkallelse',
  tyre_change:     'Däckbyte',
  other:           'Övrigt',
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  scheduled:   'Planerad',
  in_progress: 'Pågår',
  completed:   'Klar',
  cancelled:   'Avbokad',
};

export interface VehicleMaintenanceRecord {
  id:                  string;
  organization_id:     string;
  vehicle_id:          string;
  record_type:         MaintenanceRecordType;
  status:              MaintenanceStatus;
  title:               string;
  description:         string | null;
  scheduled_at:        string;
  started_at:          string | null;
  completed_at:        string | null;
  odometer_at_service: number | null;
  service_provider:    string | null;
  cost_sek:            number | null;
  invoice_reference:   string | null;
  next_service_due_at: string | null;
  next_service_km:     number | null;
  created_by:          string | null;
  updated_by:          string | null;
  created_at:          string;
  updated_at:          string;
}

export interface CreateMaintenanceInput {
  vehicle_id:          string;
  record_type:         MaintenanceRecordType;
  title:               string;
  description?:        string | null;
  scheduled_at:        string;
  service_provider?:   string | null;
  cost_sek?:           number | null;
  invoice_reference?:  string | null;
  next_service_due_at?: string | null;
  next_service_km?:    number | null;
}

export interface UpdateMaintenanceStatusInput {
  id:           string;
  status:       MaintenanceStatus;
  completed_at?: string | null;
  started_at?:   string | null;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const maintenanceKeys = {
  all:   ['vehicle_maintenance'] as const,
  lists: () => [...maintenanceKeys.all, 'list'] as const,
  list:  (vehicleId?: string) => [...maintenanceKeys.lists(), vehicleId ?? 'all'] as const,
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchMaintenanceRecords(vehicleId?: string): Promise<VehicleMaintenanceRecord[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as unknown as any)
    .from('vehicle_maintenance')
    .select(`
      id, organization_id, vehicle_id, record_type, status,
      title, description, scheduled_at, started_at, completed_at,
      odometer_at_service, service_provider, cost_sek,
      invoice_reference, next_service_due_at, next_service_km,
      created_by, updated_by, created_at, updated_at
    `)
    .order('scheduled_at', { ascending: false });

  if (vehicleId) q = q.eq('vehicle_id', vehicleId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as VehicleMaintenanceRecord[];
}

// ─── Create ───────────────────────────────────────────────────────────────────

async function createMaintenanceRecord(input: CreateMaintenanceInput & { organization_id: string }): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as unknown as any)
    .from('vehicle_maintenance')
    .insert({ ...input, status: 'scheduled' });
  if (error) throw new Error(error.message);
}

// ─── Update status ────────────────────────────────────────────────────────────

async function updateMaintenanceStatus(input: UpdateMaintenanceStatusInput): Promise<void> {
  const { id, ...fields } = input;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as unknown as any)
    .from('vehicle_maintenance')
    .update(fields)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useVehicleMaintenanceRecords(vehicleId?: string) {
  return useQuery({
    queryKey: maintenanceKeys.list(vehicleId),
    queryFn:  () => fetchMaintenanceRecords(vehicleId),
    staleTime: 2 * 60_000,
  });
}

export function useCreateMaintenanceRecord() {
  const qc = useQueryClient();
  const { organization } = useSession();
  const orgId = organization?.id;
  return useMutation({
    mutationFn: (input: CreateMaintenanceInput) => {
      if (!orgId) throw new Error('Ingen organisation');
      return createMaintenanceRecord({ ...input, organization_id: orgId });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: maintenanceKeys.lists() });
      void qc.invalidateQueries({ queryKey: vehicleKeys.list() });
    },
  });
}

export function useUpdateMaintenanceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateMaintenanceStatus,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: maintenanceKeys.lists() });
    },
  });
}
