import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { LessonSlot, LessonSlotListQueryInput } from '@platform/types';

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type { LessonSlot };

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface SlotListMeta {
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface SlotListResponse {
  data: LessonSlot[];
  meta: SlotListMeta;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const slotKeys = {
  all:     ['slots'] as const,
  lists:   () => [...slotKeys.all, 'list'] as const,
  list:    (params: LessonSlotListQueryInput) => [...slotKeys.lists(), params] as const,
  details: () => [...slotKeys.all, 'detail'] as const,
  detail:  (id: string) => [...slotKeys.details(), id] as const,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

function buildSlotQueryString(params: LessonSlotListQueryInput): string {
  const sp = new URLSearchParams();
  if (params.page !== undefined)           sp.set('page',           String(params.page));
  if (params.per_page !== undefined)       sp.set('per_page',       String(params.per_page));
  if (params.sort_by !== undefined)        sp.set('sort_by',        params.sort_by);
  if (params.sort_dir !== undefined)       sp.set('sort_dir',       params.sort_dir);
  if (params.instructor_id !== undefined)  sp.set('instructor_id',  params.instructor_id);
  if (params.vehicle_id !== undefined)     sp.set('vehicle_id',     params.vehicle_id);
  if (params.location_id !== undefined)    sp.set('location_id',    params.location_id);
  if (params.lesson_type_id !== undefined) sp.set('lesson_type_id', params.lesson_type_id);
  if (params.status !== undefined)         sp.set('status',         params.status);
  if (params.from !== undefined)           sp.set('from',           params.from);
  if (params.to !== undefined)             sp.set('to',             params.to);
  return sp.toString();
}

async function apiFetchSlots(params: LessonSlotListQueryInput): Promise<SlotListResponse> {
  const qs = buildSlotQueryString(params);
  const fn = qs ? `slots?${qs}` : 'slots';
  const { data, error } = await supabase.functions.invoke<SlotListResponse>(fn, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiFetchSlot(id: string): Promise<LessonSlot> {
  const { data, error } = await supabase.functions.invoke<{ data: LessonSlot }>(`slots/${id}`, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useSlotList(params: LessonSlotListQueryInput = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: slotKeys.list(params),
    queryFn: () => apiFetchSlots({ per_page: 200, sort_by: 'starts_at', sort_dir: 'asc', ...params }),
    enabled: options?.enabled !== false && Boolean(params.from && params.to),
  });
}

export function useSlot(id: string | null) {
  return useQuery({
    queryKey: slotKeys.detail(id ?? ''),
    queryFn: () => apiFetchSlot(id!),
    enabled: id !== null && id !== '',
  });
}

export function useInstructorUpcomingSlots(instructorId: string | null | undefined) {
  const from  = new Date().toISOString();
  const to    = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const today = from.slice(0, 10);

  return useQuery({
    queryKey: [...slotKeys.all, 'instructor-upcoming', instructorId ?? '', today],
    queryFn:  () => apiFetchSlots({
      instructor_id: instructorId!,
      from,
      to,
      per_page: 10,
      sort_by:  'starts_at',
      sort_dir: 'asc',
    }),
    enabled:   Boolean(instructorId),
    staleTime: 2 * 60 * 1000,
  });
}
