import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { vehicleKeys } from './useVehicles.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type InspectionType   = 'besiktning' | 'internal' | 'insurance' | 'other';
export type InspectionResult = 'passed' | 'failed' | 'passed_with_remarks' | 'deferred';

export const INSPECTION_TYPE_LABELS: Record<InspectionType, string> = {
  besiktning: 'Besiktning',
  internal:   'Intern kontroll',
  insurance:  'Försäkringskontroll',
  other:      'Övrigt',
};

export const INSPECTION_RESULT_LABELS: Record<InspectionResult, string> = {
  passed:              'Godkänd',
  failed:              'Underkänd',
  passed_with_remarks: 'Godkänd med anm.',
  deferred:            'Uppskjuten',
};

export interface VehicleInspection {
  id:                 string;
  organization_id:    string;
  vehicle_id:         string;
  inspection_type:    InspectionType;
  scheduled_at:       string | null;
  inspected_at:       string;
  next_due_at:        string;
  result:             InspectionResult;
  remarks:            string | null;
  station_name:       string | null;
  certificate_number: string | null;
  created_by:         string | null;
  created_at:         string;
  updated_at:         string;
}

export interface CreateInspectionInput {
  vehicle_id:          string;
  inspection_type:     InspectionType;
  scheduled_at?:       string | null;
  inspected_at:        string;
  next_due_at:         string;
  result:              InspectionResult;
  remarks?:            string | null;
  station_name?:       string | null;
  certificate_number?: string | null;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const inspectionKeys = {
  all:   ['vehicle_inspections'] as const,
  lists: () => [...inspectionKeys.all, 'list'] as const,
  list:  (vehicleId?: string) => [...inspectionKeys.lists(), vehicleId ?? 'all'] as const,
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchInspections(vehicleId?: string): Promise<VehicleInspection[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as unknown as any)
    .from('vehicle_inspections')
    .select(`
      id, organization_id, vehicle_id, inspection_type,
      scheduled_at, inspected_at, next_due_at, result,
      remarks, station_name, certificate_number,
      created_by, created_at, updated_at
    `)
    .order('inspected_at', { ascending: false });

  if (vehicleId) q = q.eq('vehicle_id', vehicleId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as VehicleInspection[];
}

// ─── Create ───────────────────────────────────────────────────────────────────

async function createInspection(input: CreateInspectionInput & { organization_id: string }): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as unknown as any)
    .from('vehicle_inspections')
    .insert(input);
  if (error) throw new Error(error.message);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useVehicleInspections(vehicleId?: string) {
  return useQuery({
    queryKey: inspectionKeys.list(vehicleId),
    queryFn:  () => fetchInspections(vehicleId),
    staleTime: 2 * 60_000,
  });
}

export function useCreateInspection() {
  const qc = useQueryClient();
  const { organization } = useSession();
  const orgId = organization?.id;
  return useMutation({
    mutationFn: (input: CreateInspectionInput) => {
      if (!orgId) throw new Error('Ingen organisation');
      return createInspection({ ...input, organization_id: orgId });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: inspectionKeys.lists() });
      void qc.invalidateQueries({ queryKey: vehicleKeys.list() });
    },
  });
}
