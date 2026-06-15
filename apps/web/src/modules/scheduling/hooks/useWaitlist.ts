import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WaitlistStatus = 'waiting' | 'promoted' | 'cancelled' | 'expired';
export type WaitlistTab    = 'aktiva' | 'utgångna' | 'raderade';

export interface WaitlistEntry {
  id:                   string;
  organization_id:      string;
  slot_id:              string;
  student_id:           string;
  priority:             number;
  status:               WaitlistStatus;
  status_changed_at:    string | null;
  expires_at:           string | null;
  promoted_booking_id:  string | null;
  notified_at:          string | null;
  reservation_deadline: string | null;
  notes:                string | null;
  created_at:           string;
  updated_at:           string;
}

// ─── Rich entry (with PostgREST-joined relations) ─────────────────────────────

export interface WaitlistStudentRef {
  id:         string;
  first_name: string;
  last_name:  string;
}

export interface WaitlistSlotRef {
  id:             string;
  starts_at:      string;
  ends_at:        string;
  instructor_id:  string;
  lesson_type_id: string;
}

export interface WaitlistEntryRich extends WaitlistEntry {
  students:     WaitlistStudentRef | null;
  lesson_slots: WaitlistSlotRef    | null;
}

export interface WaitlistListParams {
  tab?:      WaitlistTab;
  page?:     number;
  per_page?: number;
}

export interface WaitlistListResponse {
  data:  WaitlistEntryRich[];
  total: number;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const waitlistKeys = {
  all:    ['waitlist'] as const,
  bySlot: (slotId: string) => [...waitlistKeys.all, 'by-slot', slotId] as const,
  list:   (params: WaitlistListParams) => [...waitlistKeys.all, 'list', params] as const,
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetchWaitlistForSlot(slotId: string): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase.functions.invoke<{ data: WaitlistEntry[] }>(
    `waitlist?slot_id=${slotId}&status=waiting`,
    { method: 'GET' }
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useWaitlistForSlot(slotId: string | null) {
  return useQuery({
    queryKey: waitlistKeys.bySlot(slotId ?? ''),
    queryFn:  () => apiFetchWaitlistForSlot(slotId!),
    enabled:  slotId !== null && slotId !== '',
  });
}

// ─── Org-level list (direct PostgREST query with FK joins) ────────────────────

const TAB_STATUSES: Record<WaitlistTab, WaitlistStatus[]> = {
  aktiva:    ['waiting'],
  utgångna:  ['expired', 'promoted'],
  raderade:  ['cancelled'],
};

async function apiFetchWaitlistList(params: WaitlistListParams): Promise<WaitlistListResponse> {
  const per_page  = params.per_page ?? 200;
  const page      = params.page ?? 1;
  const rangeFrom = (page - 1) * per_page;
  const rangeTo   = rangeFrom + per_page - 1;
  const statuses  = TAB_STATUSES[params.tab ?? 'aktiva'];

  const { data, count, error } = await supabase
    .from('waitlist_entries')
    .select(
      `id, organization_id, slot_id, student_id, priority, status,
       status_changed_at, expires_at, promoted_booking_id, notified_at,
       reservation_deadline, notes, created_at, updated_at,
       students ( id, first_name, last_name ),
       lesson_slots ( id, starts_at, ends_at, instructor_id, lesson_type_id )`,
      { count: 'exact' }
    )
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .range(rangeFrom, rangeTo);

  if (error) throw new Error(error.message);
  return {
    data:  (data ?? []) as unknown as WaitlistEntryRich[],
    total: count ?? 0,
  };
}

export function useWaitlistList(params: WaitlistListParams = {}) {
  return useQuery({
    queryKey: waitlistKeys.list(params),
    queryFn:  () => apiFetchWaitlistList(params),
    staleTime: 30_000,
  });
}
