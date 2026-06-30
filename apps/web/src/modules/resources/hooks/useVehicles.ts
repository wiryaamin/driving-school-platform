import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Vehicle {
  id:                  string;
  registration_number: string;
  make:                string;
  model:               string;
  model_year:          number;
  color:               string | null;
  transmission:        'manual' | 'automatic';
  has_dual_controls:   boolean;
  fuel_type:           string;
  seats:               number;
  teaching_categories: string[];
  ownership_type:      'owned' | 'leased' | 'rented';
  operational_status:  'available' | 'in_use' | 'maintenance' | 'inspection_due' | 'inactive' | 'decommissioned';
  primary_location_id: string | null;
  next_service_date:   string | null;
}

export type ServiceStatus = 'ok' | 'soon' | 'overdue';

export function getServiceStatus(nextServiceDate: string | null): ServiceStatus {
  if (!nextServiceDate) return 'ok';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${nextServiceDate}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0)  return 'overdue';
  if (diffDays <= 14) return 'soon';
  return 'ok';
}

export interface CreateVehicleInput {
  registration_number: string;
  make:                string;
  model:               string;
  model_year:          number;
  color?:              string | undefined;
  transmission:        'manual' | 'automatic';
  has_dual_controls:   boolean;
  fuel_type:           string;
  seats:               number;
  teaching_categories: string[];
  ownership_type:      'owned' | 'leased' | 'rented';
  operational_status:  'available' | 'in_use' | 'maintenance' | 'inspection_due' | 'inactive' | 'decommissioned';
}

export interface UpdateVehicleStatusInput {
  id:                 string;
  operational_status: Vehicle['operational_status'];
}

// ─── Query key ────────────────────────────────────────────────────────────────

export const vehicleKeys = {
  all:  ['vehicles'] as const,
  list: () => [...vehicleKeys.all, 'list'] as const,
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(`
      id,
      registration_number,
      make,
      model,
      model_year,
      color,
      transmission,
      has_dual_controls,
      fuel_type,
      seats,
      teaching_categories,
      ownership_type,
      operational_status,
      primary_location_id,
      next_service_date
    `)
    .is('deleted_at', null)
    .order('make', { ascending: true })
    .order('model', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Vehicle[];
}

// ─── Create ───────────────────────────────────────────────────────────────────

async function createVehicle(input: CreateVehicleInput): Promise<void> {
  const { error } = await supabase
    .from('vehicles')
    .insert(input as never);
  if (error) throw new Error(error.message);
}

// ─── Update status ────────────────────────────────────────────────────────────

async function updateVehicleStatus(input: UpdateVehicleStatusInput): Promise<void> {
  const { error } = await supabase
    .from('vehicles')
    .update({ operational_status: input.operational_status } as never)
    .eq('id', input.id);
  if (error) throw new Error(error.message);
}

// ─── Soft delete ──────────────────────────────────────────────────────────────

async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase
    .from('vehicles')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useVehicles() {
  return useQuery({
    queryKey: vehicleKeys.list(),
    queryFn:  fetchVehicles,
    staleTime: 5 * 60_000,
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createVehicle,
    onSuccess:  () => qc.invalidateQueries({ queryKey: vehicleKeys.list() }),
  });
}

export function useUpdateVehicleStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateVehicleStatus,
    onSuccess:  () => qc.invalidateQueries({ queryKey: vehicleKeys.list() }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteVehicle,
    onSuccess:  () => qc.invalidateQueries({ queryKey: vehicleKeys.list() }),
  });
}
