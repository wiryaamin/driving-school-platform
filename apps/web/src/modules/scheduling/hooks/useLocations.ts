import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgLocation {
  id:           string;
  name:         string;
  address_line1: string;
  postal_code:  string;
  city:         string;
  is_primary:   boolean;
}

// ─── Query key ────────────────────────────────────────────────────────────────

export const locationKeys = {
  all:  ['locations'] as const,
  list: () => [...locationKeys.all, 'list'] as const,
};

// ─── API helper ───────────────────────────────────────────────────────────────

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLocations() {
  return useQuery({
    queryKey: locationKeys.list(),
    queryFn:  fetchLocations,
    staleTime: 10 * 60_000,
  });
}

// ─── Formatter ────────────────────────────────────────────────────────────────

export function formatLocationAddress(loc: OrgLocation): string {
  return `${loc.address_line1}, ${loc.postal_code} ${loc.city}`;
}
