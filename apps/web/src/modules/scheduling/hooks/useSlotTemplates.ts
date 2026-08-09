import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlotTemplate {
  id:              string;
  organization_id: string;
  name:            string;
  instructor_id:   string | null;
  vehicle_id:      string | null;
  location_id:     string | null;
  lesson_type_id:  string | null;
  day_of_week:     number;       // 1=Mon … 7=Sun
  start_time:      string;       // HH:MM:SS
  end_time:        string;
  max_bookings:    number;
  is_active:       boolean;
  notes:           string | null;
  created_at:      string;
  instructor:      { first_name: string; last_name: string } | null;
  lesson_type:     { name: string } | null;
  location:        { name: string } | null;
  vehicle:         { registration_number: string; make: string; model: string } | null;
}

export interface CreateSlotTemplateInput {
  name:            string;
  day_of_week:     number;
  start_time:      string;
  end_time:        string;
  max_bookings:    number;
  instructor_id?:  string | null;
  vehicle_id?:     string | null;
  location_id?:    string | null;
  lesson_type_id?: string | null;
  notes?:          string | null;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const templateKeys = {
  all:  ['slot_templates'] as const,
  list: () => [...templateKeys.all, 'list'] as const,
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchSlotTemplates(): Promise<SlotTemplate[]> {
  const { data, error } = await supabase
    .from('slot_templates')
    .select(`
      id, organization_id, name,
      instructor_id, vehicle_id, location_id, lesson_type_id,
      day_of_week, start_time, end_time, max_bookings, is_active, notes, created_at,
      instructor:instructors (first_name, last_name),
      lesson_type:lesson_types (name),
      location:organization_locations (name),
      vehicle:vehicles (registration_number, make, model)
    `)
    .is('deleted_at', null)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SlotTemplate[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSlotTemplates() {
  return useQuery({
    queryKey: templateKeys.list(),
    queryFn:  fetchSlotTemplates,
    staleTime: 2 * 60_000,
  });
}

export function useCreateSlotTemplate() {
  const qc = useQueryClient();
  const { organization } = useSession();
  const orgId = organization?.id;
  return useMutation({
    mutationFn: async (input: CreateSlotTemplateInput) => {
      if (!orgId) throw new Error('Ingen organisation');
      const { error } = await supabase
        .from('slot_templates')
        .insert({ ...input, organization_id: orgId } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.list() }),
  });
}

export function useToggleSlotTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('slot_templates')
        .update({ is_active } as never)
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.list() }),
  });
}

export function useDeleteSlotTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('slot_templates')
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKeys.list() }),
  });
}

export function useGenerateSlotsFromTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weekStart: string): Promise<number> => {
      const { data, error } = await supabase.rpc(
        'generate_slots_from_templates',
        { p_week_start: weekStart } as never,
      );
      if (error) throw new Error(error.message);
      return (data as number) ?? 0;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['slots'] });
      void qc.invalidateQueries({ queryKey: ['slot_templates'] });
    },
  });
}
