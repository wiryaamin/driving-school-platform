import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { LessonBooking, LessonBookingListQueryInput } from '@platform/types';

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type { LessonBooking };

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface BookingListMeta {
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface BookingListResponse {
  data: LessonBooking[];
  meta: BookingListMeta;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const bookingKeys = {
  all:     ['bookings'] as const,
  lists:   () => [...bookingKeys.all, 'list'] as const,
  list:    (params: LessonBookingListQueryInput) => [...bookingKeys.lists(), params] as const,
  bySlot:  (slotId: string) => [...bookingKeys.all, 'by-slot', slotId] as const,
  details: () => [...bookingKeys.all, 'detail'] as const,
  detail:  (id: string) => [...bookingKeys.details(), id] as const,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

function buildBookingQueryString(params: LessonBookingListQueryInput): string {
  const sp = new URLSearchParams();
  if (params.page !== undefined)          sp.set('page',         String(params.page));
  if (params.per_page !== undefined)      sp.set('per_page',     String(params.per_page));
  if (params.sort_by !== undefined)       sp.set('sort_by',      params.sort_by);
  if (params.sort_dir !== undefined)      sp.set('sort_dir',     params.sort_dir);
  if (params.student_id !== undefined)    sp.set('student_id',   params.student_id);
  if (params.instructor_id !== undefined) sp.set('instructor_id', params.instructor_id);
  if (params.slot_id !== undefined)       sp.set('slot_id',      params.slot_id);
  if (params.status !== undefined)        sp.set('status',       params.status);
  if (params.from !== undefined)          sp.set('from',         params.from);
  if (params.to !== undefined)            sp.set('to',           params.to);
  return sp.toString();
}

async function apiFetchBookings(params: LessonBookingListQueryInput): Promise<BookingListResponse> {
  const qs = buildBookingQueryString(params);
  const fn = qs ? `bookings?${qs}` : 'bookings';
  const { data, error } = await supabase.functions.invoke<BookingListResponse>(fn, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiFetchBooking(id: string): Promise<LessonBooking> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonBooking }>(`bookings/${id}`, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useBookingList(params: LessonBookingListQueryInput = {}) {
  return useQuery({
    queryKey: bookingKeys.list(params),
    queryFn: () => apiFetchBookings({ per_page: 100, sort_by: 'starts_at', sort_dir: 'asc', ...params }),
    enabled: Boolean(params.from && params.to),
  });
}

export function useBooking(id: string | null) {
  return useQuery({
    queryKey: bookingKeys.detail(id ?? ''),
    queryFn: () => apiFetchBooking(id!),
    enabled: id !== null && id !== '',
  });
}

export function useBookingsForSlot(slotId: string | null) {
  return useQuery({
    queryKey: bookingKeys.bySlot(slotId ?? ''),
    queryFn:  () => apiFetchBookings({
      slot_id:  slotId!,
      per_page: 50,
      sort_by:  'created_at',
      sort_dir: 'asc',
    }),
    enabled: slotId !== null && slotId !== '',
  });
}

export function useInstructorUpcomingBookings(instructorId: string | null | undefined) {
  const from  = new Date().toISOString();
  const to    = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const today = from.slice(0, 10);

  return useQuery({
    queryKey: [...bookingKeys.all, 'instructor-upcoming', instructorId ?? '', today],
    queryFn:  () => apiFetchBookings({
      instructor_id: instructorId!,
      from,
      to,
      per_page:  50,
      sort_by:   'starts_at',
      sort_dir:  'asc',
    }),
    enabled:   Boolean(instructorId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useStudentUpcomingBookings(studentId: string | null | undefined) {
  const from  = new Date().toISOString();
  const to    = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const today = from.slice(0, 10);

  return useQuery({
    queryKey: [...bookingKeys.all, 'student-upcoming', studentId ?? '', today],
    queryFn:  () => apiFetchBookings({
      student_id: studentId!,
      from,
      to,
      per_page:   10,
      sort_by:    'starts_at',
      sort_dir:   'asc',
    }),
    enabled:   Boolean(studentId),
    staleTime: 2 * 60 * 1000,
  });
}
