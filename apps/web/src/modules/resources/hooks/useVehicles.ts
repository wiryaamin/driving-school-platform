import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Vehicle {
  id:                     string;
  registration_number:    string;
  make:                   string;
  model:                  string;
  model_year:             number;
  color:                  string | null;
  transmission:           'manual' | 'automatic';
  has_dual_controls:      boolean;
  fuel_type:              string;
  seats:                  number;
  teaching_categories:    string[];
  ownership_type:         'owned' | 'leased' | 'rented';
  operational_status:     'available' | 'in_use' | 'maintenance' | 'inspection_due' | 'inactive' | 'decommissioned';
  primary_location_id:    string | null;
  next_service_date:      string | null;
  registration_expires_at: string;
  insurance_expires_at:   string;
  next_inspection_due_at: string | null;
  last_inspected_at:      string | null;
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

// 30-day warning window for insurance/registration/inspection compliance dates
export function getComplianceStatus(expiryDate: string | null): ServiceStatus {
  if (!expiryDate) return 'ok';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${expiryDate}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0)   return 'overdue';
  if (diffDays <= 30) return 'soon';
  return 'ok';
}

export interface CreateVehicleInput {
  registration_number:    string;
  make:                   string;
  model:                  string;
  model_year:             number;
  color?:                 string | undefined;
  transmission:           'manual' | 'automatic';
  has_dual_controls:      boolean;
  fuel_type:              string;
  seats:                  number;
  teaching_categories:    string[];
  ownership_type:         'owned' | 'leased' | 'rented';
  operational_status:     'available' | 'in_use' | 'maintenance' | 'inspection_due' | 'inactive' | 'decommissioned';
  registration_expires_at: string;
  insurance_expires_at:   string;
}

export interface UpdateVehicleStatusInput {
  id:                 string;
  operational_status: Vehicle['operational_status'];
}

export interface UpdateVehicleInput {
  id:                      string;
  next_inspection_due_at?: string | null;
  last_inspected_at?:      string | null;
  operational_status?:     Vehicle['operational_status'];
  registration_expires_at?: string;
  insurance_expires_at?:   string;
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
      next_service_date,
      registration_expires_at,
      insurance_expires_at,
      next_inspection_due_at,
      last_inspected_at
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

// ─── Update vehicle fields ────────────────────────────────────────────────────

async function updateVehicle(input: UpdateVehicleInput): Promise<void> {
  const { id, ...fields } = input;
  const { error } = await supabase
    .from('vehicles')
    .update(fields as never)
    .eq('id', id);
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

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateVehicle,
    onSuccess:  () => qc.invalidateQueries({ queryKey: vehicleKeys.list() }),
  });
}
