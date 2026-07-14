import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { LessonBooking } from '@platform/types';
import { bookingKeys } from './useBookings.js';
import { slotKeys } from './useSlots.js';

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
  phone:      string | null;
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

  // Active waitlist entries are shown in queue order (priority asc, then oldest first).
  // Historical tabs (utgångna / raderade) show most-recent activity first.
  const isQueueTab = (params.tab ?? 'aktiva') === 'aktiva';

  let q = supabase
    .from('waitlist_entries')
    .select(
      `id, organization_id, slot_id, student_id, priority, status,
       status_changed_at, expires_at, promoted_booking_id, notified_at,
       reservation_deadline, notes, created_at, updated_at,
       students ( id, first_name, last_name, phone ),
       lesson_slots ( id, starts_at, ends_at, instructor_id, lesson_type_id )`,
      { count: 'exact' }
    )
    .in('status', statuses);

  if (isQueueTab) {
    q = q.order('priority', { ascending: true }).order('created_at', { ascending: true });
  } else {
    q = q.order('created_at', { ascending: false });
  }

  const { data, count, error } = await q.range(rangeFrom, rangeTo);

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

// ─── Promote from waitlist → booking ─────────────────────────────────────────

export interface PromoteFromWaitlistInput {
  waitlistEntryId: string;
  slotId:          string;
  studentId:       string;
}

async function apiPromoteFromWaitlist(input: PromoteFromWaitlistInput): Promise<LessonBooking> {
  // Step 1: create the booking via Edge Function (enforces capacity + RBAC)
  const { data: bookingData, error: bookingError } = await supabase.functions.invoke<{ data: LessonBooking }>('bookings', {
    method: 'POST',
    body:   { slot_id: input.slotId, student_id: input.studentId },
  });
  if (bookingError) throw bookingError;
  if (!bookingData?.data) throw new Error('Inget svar från servern');
  const booking = bookingData.data;

  // Step 2: mark the waitlist entry as promoted (best-effort — booking already exists)
  await supabase
    .from('waitlist_entries')
    .update({
      status:               'promoted',
      promoted_booking_id:  booking.id,
      status_changed_at:    new Date().toISOString(),
    } as never)
    .eq('id', input.waitlistEntryId);

  return booking;
}

export function usePromoteFromWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiPromoteFromWaitlist,
    onSuccess: (_data, { slotId }) => {
      void queryClient.invalidateQueries({ queryKey: waitlistKeys.all });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: slotKeys.detail(slotId) });
      void queryClient.invalidateQueries({ queryKey: waitlistKeys.bySlot(slotId) });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ─── Add to waitlist ─────────────────────────────────────────────────────────

export interface AddToWaitlistInput {
  slot_id:     string;
  student_id:  string;
  notes?:      string;
  expires_at?: string;
}

async function apiAddToWaitlist(input: AddToWaitlistInput): Promise<WaitlistEntry> {
  const { data, error } = await supabase
    .from('waitlist_entries')
    .insert({
      slot_id:    input.slot_id,
      student_id: input.student_id,
      status:     'waiting',
      priority:   1,
      ...(input.notes      ? { notes:      input.notes      } : {}),
      ...(input.expires_at ? { expires_at: input.expires_at } : {}),
    } as never)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as WaitlistEntry;
}

export function useAddToWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiAddToWaitlist,
    onSuccess: (_data, { slot_id }) => {
      void queryClient.invalidateQueries({ queryKey: waitlistKeys.all });
      void queryClient.invalidateQueries({ queryKey: waitlistKeys.bySlot(slot_id) });
    },
  });
}

// ─── Remove / cancel a waitlist entry ────────────────────────────────────────

async function apiRemoveFromWaitlist(entryId: string): Promise<WaitlistEntry> {
  const { data, error } = await supabase.functions.invoke<WaitlistEntry>(
    `waitlist/${entryId}`,
    { method: 'DELETE' }
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

export function useRemoveFromWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiRemoveFromWaitlist,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: waitlistKeys.all }),
  });
}

// ─── Mark waitlist entry as notified ─────────────────────────────────────────

async function apiMarkWaitlistNotified(entryId: string): Promise<void> {
  const { error } = await supabase
    .from('waitlist_entries')
    .update({ notified_at: new Date().toISOString() } as never)
    .eq('id', entryId);
  if (error) throw new Error(error.message);
}

export function useMarkWaitlistNotified() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiMarkWaitlistNotified,
    onSuccess:  () => void queryClient.invalidateQueries({ queryKey: waitlistKeys.all }),
  });
}
