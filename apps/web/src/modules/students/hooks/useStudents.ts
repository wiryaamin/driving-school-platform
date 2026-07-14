import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@shared/hooks/useSession.js';
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
  assigned_instructor_id?: string | null | undefined;
  communication_opt_in_sms?: boolean;
  notes?: string | null;
  corporate_customer_id?: string | null | undefined;
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
  if (params.licence_category !== undefined)     sp.set('licence_category',     params.licence_category);
  if (params.not_licence_category !== undefined) sp.set('not_licence_category', params.not_licence_category);
  if (params.corporate_customer_id !== undefined) sp.set('corporate_customer_id', params.corporate_customer_id);
  if (params.age_from !== undefined) sp.set('age_from', String(params.age_from));
  if (params.age_to   !== undefined) sp.set('age_to',   String(params.age_to));
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
    enabled:   options?.enabled ?? true,
    staleTime: 2 * 60_000,
  });
}

export function useStudent(id: string | null) {
  return useQuery({
    queryKey:  studentKeys.detail(id ?? ''),
    queryFn:   () => apiFetchStudent(id!),
    enabled:   id !== null && id !== '',
    staleTime: 2 * 60_000,
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

// ─── Student tag types ────────────────────────────────────────────────────────

export interface StudentTag {
  id:           string;
  name:         string;
  color:        string | null;
  description?: string | null;
}

export interface CreateTagInput {
  name:         string;
  color?:       string | null;
  description?: string | null;
}

export interface UpdateTagInput {
  id:           string;
  name?:        string;
  color?:       string | null;
  description?: string | null;
}

// ─── Student tag hooks ────────────────────────────────────────────────────────

export function useOrgStudentTags() {
  return useQuery<StudentTag[]>({
    queryKey: ['student-tags', 'org'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('student_tags')
        .select('id, name, color, description')
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as StudentTag[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useStudentTagAssignments(studentId: string) {
  return useQuery<StudentTag[]>({
    queryKey: ['student-tags', 'assignments', studentId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('student_tag_assignments')
        .select('student_tags(id, name, color, description)')
        .eq('student_id', studentId);
      if (error) throw new Error(error.message);
      return ((data ?? [])
        .map((r: { student_tags: StudentTag | null }) => r.student_tags)
        .filter(Boolean)) as StudentTag[];
    },
    enabled: !!studentId,
    staleTime: 2 * 60_000,
  });
}

export function useAssignStudentTag(studentId: string) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_tag_assignments')
        .upsert(
          { student_id: studentId, tag_id: tagId, assigned_by: user?.id ?? null },
          { onConflict: 'student_id,tag_id' },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['student-tags', 'assignments', studentId] });
    },
  });
}

export function useRemoveStudentTag(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_tag_assignments')
        .delete()
        .eq('student_id', studentId)
        .eq('tag_id', tagId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['student-tags', 'assignments', studentId] });
    },
  });
}

export function useCreateTag() {
  const { organization, user } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTagInput): Promise<StudentTag> => {
      const orgId = organization?.id;
      if (!orgId) throw new Error('Ingen organisation');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('student_tags')
        .insert({
          organization_id: orgId,
          name:            input.name.trim(),
          color:           input.color ?? null,
          description:     input.description ?? null,
          created_by:      user?.id ?? null,
        })
        .select('id, name, color, description')
        .single();
      if (error) throw new Error(error.message);
      return data as StudentTag;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['student-tags', 'org'] });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateTagInput): Promise<void> => {
      const patch: Record<string, unknown> = {};
      if (input.name        !== undefined) patch.name        = input.name.trim();
      if (input.color       !== undefined) patch.color       = input.color;
      if (input.description !== undefined) patch.description = input.description;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_tags')
        .update(patch)
        .eq('id', input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['student-tags', 'org'] });
      void queryClient.invalidateQueries({ queryKey: ['student-tags', 'assignments'] });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_tags')
        .delete()
        .eq('id', tagId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['student-tags', 'org'] });
      void queryClient.invalidateQueries({ queryKey: ['student-tags', 'assignments'] });
    },
  });
}

export function useStudentIdsByTag(tagId: string | null) {
  return useQuery<string[]>({
    queryKey: ['student-tags', 'by-tag', tagId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('student_tag_assignments')
        .select('student_id')
        .eq('tag_id', tagId);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { student_id: string }[]).map((r) => r.student_id);
    },
    enabled: !!tagId,
    staleTime: 2 * 60_000,
  });
}

// ─── Instructor assessments (Utbildningskort) ─────────────────────────────────

export interface StudentAssessment {
  id:              string;
  instructor_id:   string;
  instructor_name: string;
  competencies:    Record<string, string>;
  readiness:       Record<string, boolean>;
  notes:           string | null;
  assessed_at:     string;
  updated_at:      string;
}

export function useStudentAssessments(studentId: string | null) {
  return useQuery({
    queryKey:  ['student-assessments', studentId ?? ''],
    staleTime: 5 * 60_000,
    queryFn:   async (): Promise<StudentAssessment[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('instructor_student_assessments')
        .select('id, instructor_id, competencies, readiness, notes, assessed_at, updated_at, instructors(first_name, last_name)')
        .eq('student_id', studentId!)
        .order('updated_at', { ascending: false });
      if (error) throw new Error((error as { message: string }).message);
      return ((data ?? []) as Array<{
        id: string; instructor_id: string; competencies: Record<string, string>;
        readiness: Record<string, boolean>; notes: string | null;
        assessed_at: string; updated_at: string;
        instructors: { first_name: string; last_name: string } | null;
      }>).map(row => ({
        id:              row.id,
        instructor_id:   row.instructor_id,
        instructor_name: row.instructors
          ? `${row.instructors.first_name} ${row.instructors.last_name}`
          : 'Okänd instruktör',
        competencies:    row.competencies ?? {},
        readiness:       row.readiness    ?? {},
        notes:           row.notes,
        assessed_at:     row.assessed_at,
        updated_at:      row.updated_at,
      }));
    },
    enabled: studentId !== null && studentId !== '',
  });
}

// ─── Student Milestones ───────────────────────────────────────────────────────

export type PermitMilestoneKey =
  | 'risk1_booked' | 'risk1_completed'
  | 'risk2_booked' | 'risk2_completed'
  | 'theory_exam_booked' | 'theory_passed'
  | 'practical_exam_booked' | 'practical_passed'
  | 'licence_issued';

export interface StudentMilestone {
  id:               string;
  student_id:       string;
  licence_category: string;
  milestone:        PermitMilestoneKey;
  achieved_at:      string;
  notes:            string | null;
}

export function useStudentMilestones(studentId: string | null) {
  return useQuery<StudentMilestone[]>({
    queryKey: ['student-milestones', studentId ?? ''],
    queryFn: async () => {
      if (!studentId) return [];
      const { data, error } = await supabase
        .from('student_permit_milestones')
        .select('id, student_id, licence_category, milestone, achieved_at, notes')
        .eq('student_id', studentId)
        .order('achieved_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as StudentMilestone[];
    },
    enabled: studentId !== null && studentId !== '',
    staleTime: 5 * 60_000,
  });
}

export function useRecordMilestone() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      student_id:       string;
      licence_category: string;
      milestone:        PermitMilestoneKey;
      achieved_at?:     string;
      notes?:           string;
    }) => {
      if (!orgId) throw new Error('No org');
      const { error } = await supabase.from('student_permit_milestones').insert({
        organization_id:  orgId,
        student_id:       input.student_id,
        licence_category: input.licence_category,
        milestone:        input.milestone,
        achieved_at:      input.achieved_at ?? new Date().toISOString(),
        notes:            input.notes ?? null,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: ['student-milestones', v.student_id] });
      void qc.invalidateQueries({ queryKey: ['student', v.student_id] });
    },
  });
}
