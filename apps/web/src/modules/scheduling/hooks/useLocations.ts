import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgLocation {
  id:            string;
  name:          string;
  address_line1: string;
  postal_code:   string;
  city:          string;
  is_primary:    boolean;
}

export interface CreateLocationInput {
  name:          string;
  address_line1: string;
  postal_code:   string;
  city:          string;
  is_primary:    boolean;
}

// ─── Query key ────────────────────────────────────────────────────────────────

export const locationKeys = {
  all:  ['locations'] as const,
  list: () => [...locationKeys.all, 'list'] as const,
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchLocations(): Promise<OrgLocation[]> {
  const { data, error } = await supabase
    .from('organization_locations')
    .select('id, name, address_line1, postal_code, city, is_primary')
    .is('deleted_at', null)
    .order('is_primary', { ascending: false })
    .order('name',       { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrgLocation[];
}

// ─── Create ───────────────────────────────────────────────────────────────────

async function createLocation(input: CreateLocationInput & { organization_id: string }): Promise<void> {
  const { error } = await supabase
    .from('organization_locations')
    .insert(input as never);
  if (error) {
    if (error.message.includes('LOCATION_LIMIT_EXCEEDED')) {
      throw new Error('Antal platser har nått organisationens gräns (max_locations). Kontakta plattformsadministratören för att höja gränsen.');
    }
    throw new Error(error.message);
  }
}

// ─── Soft delete ──────────────────────────────────────────────────────────────

async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase
    .from('organization_locations')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useLocations() {
  return useQuery({
    queryKey: locationKeys.list(),
    queryFn:  fetchLocations,
    staleTime: 10 * 60_000,
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  const { organization } = useSession();
  const orgId = organization?.id;
  return useMutation({
    mutationFn: (input: CreateLocationInput) => {
      if (!orgId) throw new Error('Ingen organisation');
      return createLocation({ ...input, organization_id: orgId });
    },
    onSuccess:  () => qc.invalidateQueries({ queryKey: locationKeys.list() }),
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteLocation,
    onSuccess:  () => qc.invalidateQueries({ queryKey: locationKeys.list() }),
  });
}

// ─── Formatter ────────────────────────────────────────────────────────────────

export function formatLocationAddress(loc: OrgLocation): string {
  return `${loc.address_line1}, ${loc.postal_code} ${loc.city}`;
}
