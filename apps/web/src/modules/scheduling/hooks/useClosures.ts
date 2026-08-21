import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types (F5 V1 — Organization closures) ─────────────────────────────────────

export interface OrganizationClosure {
  id:              string;
  organization_id: string;
  name:            string;
  starts_at:       string;
  ends_at:         string;
  is_active:       boolean;
  created_at:      string;
  updated_at:      string;
}

export interface CreateClosureInput {
  name:      string;
  starts_at: string;
  ends_at:   string;
}

export interface UpdateClosureInput {
  id:         string;
  name?:      string;
  starts_at?: string;
  ends_at?:   string;
}

// Existing future booking that overlaps a closure window (requirement #7 —
// shown to the admin, never auto-cancelled; see business rule in F5 V1 scope).
export interface AffectedBooking {
  id:          string;
  slot_id:     string;
  starts_at:   string;
  ends_at:     string;
  status:      string;
  student:     { id: string; first_name: string; last_name: string } | null;
  lesson_type: { name: string } | null;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const closureKeys = {
  all:      ['organization_closures'] as const,
  list:     () => [...closureKeys.all, 'list'] as const,
  affected: (startsAt: string, endsAt: string) => [...closureKeys.all, 'affected', startsAt, endsAt] as const,
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchClosures(): Promise<OrganizationClosure[]> {
  const { data, error } = await supabase
    .from('organization_closures')
    .select('id, organization_id, name, starts_at, ends_at, is_active, created_at, updated_at')
    .order('starts_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrganizationClosure[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useClosures() {
  return useQuery({
    queryKey:  closureKeys.list(),
    queryFn:   fetchClosures,
    staleTime: 60_000,
  });
}

// created_by / updated_by follow the established direct-table-write convention
// (see useStudents.ts:useCreateTag, useInstructorApp.ts:useCreateTimeOff) —
// no DB-level default populates them, so callers set them explicitly from
// the current session's user id.

export function useCreateClosure() {
  const qc = useQueryClient();
  const { organization, user } = useSession();
  const orgId = organization?.id;
  return useMutation({
    mutationFn: async (input: CreateClosureInput) => {
      if (!orgId) throw new Error('Ingen organisation');
      const { error } = await supabase
        .from('organization_closures')
        .insert({ ...input, organization_id: orgId, created_by: user?.id ?? null } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: closureKeys.list() }),
  });
}

export function useUpdateClosure() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateClosureInput) => {
      const { error } = await supabase
        .from('organization_closures')
        .update({ ...patch, updated_by: user?.id ?? null } as never)
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: closureKeys.list() }),
  });
}

export function useToggleClosureActive() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('organization_closures')
        .update({ is_active, updated_by: user?.id ?? null } as never)
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: closureKeys.list() }),
  });
}

// Requirement #7: existing FUTURE bookings whose lesson window overlaps a
// candidate or saved closure window. Direct query against lesson_bookings,
// reusing its existing staff RLS policy (scheduling:booking:read) — no new
// backend endpoint. Never used to cancel anything (requirement #8) — the
// admin cancels manually via the existing CancelBookingDialog / cancel flow,
// picking the existing 'school_cancelled' category (requirement #9).
export function useBookingsAffectedByClosure(startsAt: string | null, endsAt: string | null) {
  const { organization } = useSession();
  const orgId = organization?.id;
  const enabled = Boolean(orgId && startsAt && endsAt);

  return useQuery({
    queryKey: enabled ? closureKeys.affected(startsAt as string, endsAt as string) : closureKeys.affected('', ''),
    queryFn: async (): Promise<AffectedBooking[]> => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('lesson_bookings')
        .select(`
          id, slot_id, starts_at, ends_at, status,
          student:students (id, first_name, last_name),
          lesson_type:lesson_types (name)
        `)
        .eq('organization_id', orgId as string)
        .not('status', 'in', '(cancelled,no_show,rescheduled)')
        .is('deleted_at', null)
        .gt('starts_at', nowIso)
        .lt('starts_at', endsAt as string)
        .gt('ends_at', startsAt as string)
        .order('starts_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AffectedBooking[];
    },
    enabled,
    staleTime: 30_000,
  });
}
