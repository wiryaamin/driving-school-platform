import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@core/api/supabase.js';
import type { Student, StudentStatus, StudentListQueryInput, PermitStage } from '@platform/types';

// ─── Re-exports for convenience ───────────────────────────────────────────────
export type { Student, StudentStatus, PermitStage };

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface StudentListMeta {
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface StudentListResponse {
  data: Student[];
  meta: StudentListMeta;
}

// ─── Form input type (UI-layer — no hash/encrypted fields) ────────────────────

export interface CreateStudentFormValues {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  postal_code?: string;
  city?: string;
  status?: StudentStatus;
  target_licence_category?: string;
  permit_stage?: string;
  data_processing_consent?: boolean;
  assigned_instructor_id?: string;
  communication_opt_in_sms?: boolean;
}

export type UpdateStudentFormValues = Partial<CreateStudentFormValues>;

// ─── Query keys ───────────────────────────────────────────────────────────────

export const studentKeys = {
  all: ['students'] as const,
  lists: () => [...studentKeys.all, 'list'] as const,
  list: (params: StudentListQueryInput) => [...studentKeys.lists(), params] as const,
  details: () => [...studentKeys.all, 'detail'] as const,
  detail: (id: string) => [...studentKeys.details(), id] as const,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

function buildQueryString(params: StudentListQueryInput): string {
  const sp = new URLSearchParams();
  if (params.page !== undefined)     sp.set('page', String(params.page));
  if (params.per_page !== undefined) sp.set('per_page', String(params.per_page));
  if (params.sort_by !== undefined)  sp.set('sort_by', params.sort_by);
  if (params.sort_dir !== undefined) sp.set('sort_dir', params.sort_dir);
  if (params.search !== undefined && params.search !== '') sp.set('search', params.search);
  if (params.status !== undefined)   sp.set('status', params.status);
  if (params.instructor_id !== undefined) sp.set('instructor_id', params.instructor_id);
  if (params.permit_stage !== undefined)  sp.set('permit_stage', params.permit_stage);
  if (params.licence_category !== undefined) sp.set('licence_category', params.licence_category);
  return sp.toString();
}

async function apiFetchStudents(params: StudentListQueryInput): Promise<StudentListResponse> {
  const qs = buildQueryString(params);
  const fn = qs ? `students?${qs}` : 'students';
  const { data, error } = await supabase.functions.invoke<StudentListResponse>(fn, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiFetchStudent(id: string): Promise<Student> {
  const { data, error } = await supabase.functions.invoke<{ data: Student }>(`students/${id}`, {
    method: 'GET',
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiFetchStudentsBatch(ids: string[]): Promise<Student[]> {
  const qs = `ids=${ids.join(',')}`;
  const { data, error } = await supabase.functions.invoke<{ data: Student[] }>(`students?${qs}`, { method: 'GET' });
  if (error) throw error;
  if (!data?.data) return [];
  return data.data;
}

function cleanFormValues(input: CreateStudentFormValues): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== '' && v !== undefined)
  );
}

async function apiCreateStudent(input: CreateStudentFormValues): Promise<Student> {
  const { data, error } = await supabase.functions.invoke<{ data: Student }>('students', {
    method: 'POST',
    body: cleanFormValues(input),
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdateStudent({
  id,
  input,
}: {
  id: string;
  input: UpdateStudentFormValues;
}): Promise<Student> {
  const { data, error } = await supabase.functions.invoke<{ data: Student }>(`students/${id}`, {
    method: 'PATCH',
    body: cleanFormValues(input as CreateStudentFormValues),
  });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiArchiveStudent(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke(`students/${id}`, { method: 'DELETE' });
  if (error) throw error;
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useStudentList(params: StudentListQueryInput = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: studentKeys.list(params),
    queryFn: () => apiFetchStudents({ per_page: 25, ...params }),
    enabled: options?.enabled ?? true,
    refetchOnMount: 'always',
  });
}

export function useStudent(id: string | null) {
  return useQuery({
    queryKey: studentKeys.detail(id ?? ''),
    queryFn: () => apiFetchStudent(id!),
    enabled: id !== null && id !== '',
  });
}

export function useStudentsBatch(ids: string[]) {
  const deduped = useMemo(() => [...new Set(ids)].sort(), [ids]);
  return useQuery({
    queryKey: [...studentKeys.all, 'batch', deduped] as const,
    queryFn: () => apiFetchStudentsBatch(deduped),
    enabled: deduped.length > 0,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiCreateStudent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
    },
  });
}

export function useUpdateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateStudent,
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
    },
  });
}

export function useArchiveStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiArchiveStudent,
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.removeQueries({ queryKey: studentKeys.detail(id) });
    },
  });
}
