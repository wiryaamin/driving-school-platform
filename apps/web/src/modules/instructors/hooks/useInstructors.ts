import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { Instructor, InstructorEmploymentType, InstructorListQueryInput } from '@platform/types';

// ─── Instructor booking log types ─────────────────────────────────────────────

export type InstructorLogFilter = 'all' | 'booked' | 'cancelled';

export interface InstructorLogEntry {
  id: string;
  datum: string;
  handelse: string;
  tillfalle: string;
  kund: string;
  status: string;
}

interface InstructorLogMeta {
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface InstructorLogResponse {
  data: InstructorLogEntry[];
  meta: InstructorLogMeta;
}

// ─── Log helpers ──────────────────────────────────────────────────────────────

function logHandelse(status: string, studentName: string, cancellationCategory: string | null): string {
  if (status === 'confirmed' || status === 'reserved') return `${studentName} inbokad`;
  if (status === 'completed')  return `${studentName} — lektion genomförd`;
  if (status === 'cancelled') {
    if (cancellationCategory === 'student_request') return `${studentName} avbokade sig`;
    return `${studentName} avbokades`;
  }
  if (status === 'no_show')    return `${studentName} uteblev`;
  if (status === 'rescheduled') return `${studentName} — ombokas`;
  return `${studentName} — ${status}`;
}

function logTillfalle(lessonTypeName: string, startsAt: string, endsAt: string): string {
  try {
    const tz = 'Europe/Stockholm';
    const s = new Date(startsAt), e = new Date(endsAt);
    const dayRaw  = s.toLocaleDateString('sv-SE', { weekday: 'long', timeZone: tz });
    const dateStr = s.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
    const st = s.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    const et = e.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    return `${lessonTypeName} (${dayRaw.charAt(0).toUpperCase() + dayRaw.slice(1)} ${dateStr} ${st}–${et})`;
  } catch { return lessonTypeName; }
}

export type { Instructor, InstructorEmploymentType };

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface InstructorListMeta {
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface InstructorListResponse {
  data: Instructor[];
  meta: InstructorListMeta;
}

// ─── Form input types (UI-layer) ──────────────────────────────────────────────

export interface CreateInstructorFormValues {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  employment_type?: InstructorEmploymentType;
  teaching_categories?: string[];
  adi_number?: string;
  adi_valid_until?: string;
  employee_number?: string;
  max_lessons_per_day?: number;
}

export type UpdateInstructorFormValues = Partial<CreateInstructorFormValues>;

// ─── Query keys ───────────────────────────────────────────────────────────────

export const instructorKeys = {
  all:     ['instructors'] as const,
  lists:   () => [...instructorKeys.all, 'list'] as const,
  list:    (params: InstructorListQueryInput) => [...instructorKeys.lists(), params] as const,
  details: () => [...instructorKeys.all, 'detail'] as const,
  detail:  (id: string) => [...instructorKeys.details(), id] as const,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

function buildQueryString(params: InstructorListQueryInput): string {
  const sp = new URLSearchParams();
  if (params.page !== undefined)              sp.set('page', String(params.page));
  if (params.per_page !== undefined)          sp.set('per_page', String(params.per_page));
  if (params.sort_by !== undefined)           sp.set('sort_by', params.sort_by);
  if (params.sort_dir !== undefined)          sp.set('sort_dir', params.sort_dir);
  if (params.search !== undefined && params.search !== '') sp.set('search', params.search);
  if (params.employment_type !== undefined)   sp.set('employment_type', params.employment_type);
  if (params.teaching_category !== undefined) sp.set('teaching_category', params.teaching_category);
  if (params.location_id !== undefined)       sp.set('location_id', params.location_id);
  return sp.toString();
}

async function apiFetchInstructors(params: InstructorListQueryInput): Promise<InstructorListResponse> {
  const qs = buildQueryString(params);
  const fn = qs ? `instructors?${qs}` : 'instructors';
  const { data, error } = await supabase.functions.invoke<InstructorListResponse>(fn, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiFetchInstructor(id: string): Promise<Instructor> {
  const { data, error } = await supabase.functions.invoke<{ data: Instructor }>(`instructors/${id}`, {
    method: 'GET',
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

function cleanFormValues(input: CreateInstructorFormValues): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined && v !== null)
  );
}

async function apiCreateInstructor(input: CreateInstructorFormValues): Promise<Instructor> {
  const { data, error } = await supabase.functions.invoke<{ data: Instructor }>('instructors', {
    method: 'POST',
    body: cleanFormValues(input),
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdateInstructor({
  id,
  input,
}: {
  id: string;
  input: UpdateInstructorFormValues;
}): Promise<Instructor> {
  const { data, error } = await supabase.functions.invoke<{ data: Instructor }>(`instructors/${id}`, {
    method: 'PATCH',
    body: cleanFormValues(input as CreateInstructorFormValues),
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiArchiveInstructor(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke(`instructors/${id}`, { method: 'DELETE' });
  if (error) throw error;
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useInstructorList(
  params: InstructorListQueryInput = {},
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey:  instructorKeys.list(params),
    queryFn:   () => apiFetchInstructors({ per_page: 100, ...params }),
    enabled:   options?.enabled ?? true,
    staleTime: 5 * 60_000,
  });
}

export function useInstructor(id: string | null) {
  return useQuery({
    queryKey:  instructorKeys.detail(id ?? ''),
    queryFn:   () => apiFetchInstructor(id!),
    enabled:   id !== null && id !== '',
    staleTime: 2 * 60_000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreateInstructor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiCreateInstructor,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: instructorKeys.lists() });
    },
  });
}

export function useUpdateInstructor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateInstructor,
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: instructorKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: instructorKeys.detail(id) });
    },
  });
}

export function useArchiveInstructor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiArchiveInstructor,
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: instructorKeys.lists() });
      queryClient.removeQueries({ queryKey: instructorKeys.detail(id) });
    },
  });
}

export function useInstructorBookingLogs(
  instructorId: string | null,
  params: { filter?: InstructorLogFilter; page?: number; per_page?: number } = {},
) {
  const { filter = 'all', page = 1, per_page = 50 } = params;
  return useQuery<InstructorLogResponse>({
    queryKey: ['instructors', 'logs', instructorId, { filter, page, per_page }],
    queryFn: async () => {
      const from = (page - 1) * per_page;
      const to   = from + per_page - 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as unknown as any)
        .from('lesson_bookings')
        .select(
          `id, status, created_at, starts_at, ends_at, cancellation_category,
           students ( first_name, last_name ),
           lesson_types ( name )`,
          { count: 'exact' },
        )
        .eq('instructor_id', instructorId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filter === 'booked')    q = q.in('status', ['confirmed', 'reserved', 'completed']);
      if (filter === 'cancelled') q = q.eq('status', 'cancelled');

      const { data, count, error } = await q;
      if (error) throw new Error(error.message);

      const mapped: InstructorLogEntry[] = (data ?? []).map((b: {
        id: string; status: string; created_at: string; starts_at: string; ends_at: string;
        cancellation_category: string | null;
        students: { first_name: string; last_name: string } | null;
        lesson_types: { name: string } | null;
      }) => {
        const studentName = b.students ? `${b.students.first_name} ${b.students.last_name}` : '—';
        return {
          id:        b.id,
          datum:     b.created_at,
          handelse:  logHandelse(b.status, studentName, b.cancellation_category),
          tillfalle: logTillfalle(b.lesson_types?.name ?? '', b.starts_at, b.ends_at),
          kund:      studentName,
          status:    b.status,
        };
      });

      const total = count ?? 0;
      return { data: mapped, meta: { total, page, per_page, has_more: page * per_page < total } };
    },
    enabled: !!instructorId,
    staleTime: 60_000,
  });
}
