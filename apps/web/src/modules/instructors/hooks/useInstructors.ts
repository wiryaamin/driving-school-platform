import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { Instructor, InstructorEmploymentType, InstructorListQueryInput } from '@platform/types';

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
    queryKey: instructorKeys.list(params),
    queryFn:  () => apiFetchInstructors({ per_page: 100, ...params }),
    enabled:  options?.enabled ?? true,
  });
}

export function useInstructor(id: string | null) {
  return useQuery({
    queryKey: instructorKeys.detail(id ?? ''),
    queryFn:  () => apiFetchInstructor(id!),
    enabled:  id !== null && id !== '',
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
