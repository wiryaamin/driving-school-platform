import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EnrollmentStatusType =
  | 'submitted'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'converted';

export type OnboardingStatusType =
  | 'new_student'
  | 'documents_pending'
  | 'ready_for_booking'
  | 'active_student';

export interface EnrollmentEvent {
  id:          string;
  event_type:  string;
  actor_email: string | null;
  metadata:    Record<string, unknown>;
  created_at:  string;
}

export interface StudentPackageAssignment {
  id:                   string;
  student_id:           string;
  enrollment_id:        string | null;
  package_offering_id:  string;
  package_name:         string;
  package_code:         string | null;
  lesson_category:      string;
  package_quantity:     number;
  campaign_id:          string | null;
  campaign_name:        string | null;
  coupon_id:            string | null;
  coupon_code:          string | null;
  base_price:           number;
  vat_rate:             number;
  campaign_discount:    number;
  coupon_discount:      number;
  final_price:          number;
  final_price_incl_vat: number;
  currency:             string;
  lessons_used:         number;
  status:               'active' | 'completed' | 'expired' | 'cancelled';
  expires_at:           string | null;
  assigned_at:          string;
  assigned_by:          string | null;
}

export interface DuplicateStudent {
  id:                string;
  first_name:        string;
  last_name:         string;
  email?:            string;
  phone?:            string;
  personnummer_last4?: string;
  status:            string;
  onboarding_status?: string;
}

export interface DuplicateCheckResult {
  by_email:        DuplicateStudent[];
  by_phone:        DuplicateStudent[];
  by_personnummer: DuplicateStudent[];
}

export interface EnrollmentListItem {
  id:                   string;
  status:               EnrollmentStatusType;
  first_name:           string;
  last_name:            string;
  email:                string;
  phone:                string;
  package_name:         string;
  lesson_category:      string;
  final_price_incl_vat: number;
  currency:             string;
  campaign_name:        string | null;
  coupon_code:          string | null;
  submitted_at:         string;
  reviewed_at:          string | null;
  converted_at:         string | null;
  student_id:           string | null;
}

export interface EnrollmentDetail extends EnrollmentListItem {
  package_offering_id:        string;
  package_code:               string | null;
  package_quantity:           number;
  campaign_id:                string | null;
  coupon_id:                  string | null;
  base_price:                 number;
  vat_rate:                   number;
  base_price_incl_vat:        number;
  campaign_discount:          number;
  coupon_discount:            number;
  final_price:                number;
  personnummer:               string | null;
  address:                    string | null;
  preferred_language:         string;
  license_category:           string;
  comments:                   string | null;
  internal_notes:             string | null;
  rejected_reason:            string | null;
  reviewed_by:                string | null;
  converted_by:               string | null;
  created_at:                 string;
  updated_at:                 string;
  // Sprint 2 additions
  events:                     EnrollmentEvent[];
  package_assignment:         StudentPackageAssignment | null;
  student_onboarding_status:  OnboardingStatusType | null;
}

export interface EnrollmentListMeta {
  total:    number;
  page:     number;
  per_page: number;
  has_more: boolean;
}

export interface EnrollmentListResponse {
  data: EnrollmentListItem[];
  meta: EnrollmentListMeta;
}

export interface EnrollmentListParams {
  page?:     number | undefined;
  per_page?: number | undefined;
  status?:   EnrollmentStatusType | 'all' | undefined;
  search?:   string | undefined;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const enrollmentKeys = {
  all:        ['enrollments'] as const,
  lists:      () => [...enrollmentKeys.all, 'list'] as const,
  list:       (params: EnrollmentListParams) => [...enrollmentKeys.lists(), params] as const,
  detail:     (id: string) => [...enrollmentKeys.all, 'detail', id] as const,
  duplicates: (id: string) => [...enrollmentKeys.all, 'duplicates', id] as const,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetchEnrollments(params: EnrollmentListParams): Promise<EnrollmentListResponse> {
  const qs = new URLSearchParams();
  if (params.page)     qs.set('page',     String(params.page));
  if (params.per_page) qs.set('per_page', String(params.per_page));
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.search)   qs.set('search',   params.search);

  const fn = qs.toString() ? `enrollments?${qs.toString()}` : 'enrollments';
  const { data, error } = await supabase.functions.invoke<EnrollmentListResponse>(fn, { method: 'GET' });
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiFetchEnrollment(id: string): Promise<{ data: EnrollmentDetail }> {
  const { data, error } = await supabase.functions.invoke<{ data: EnrollmentDetail }>(
    `enrollments/${id}`, { method: 'GET' },
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiFetchDuplicates(id: string): Promise<DuplicateCheckResult> {
  const { data, error } = await supabase.functions.invoke<{ data: DuplicateCheckResult }>(
    `enrollments/${id}/duplicates`, { method: 'GET' },
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data.data;
}

async function apiUpdateNotes({ id, internal_notes }: { id: string; internal_notes: string }) {
  const { data, error } = await supabase.functions.invoke(
    `enrollments/${id}`, { method: 'PATCH', body: { internal_notes } },
  );
  if (error) throw error;
  return data;
}

async function apiApprove(id: string) {
  const { data, error } = await supabase.functions.invoke(`enrollments/${id}/approve`, { method: 'POST' });
  if (error) throw error;
  return data;
}

async function apiReject({ id, reason }: { id: string; reason: string }) {
  const { data, error } = await supabase.functions.invoke(
    `enrollments/${id}/reject`, { method: 'POST', body: { reason } },
  );
  if (error) throw error;
  return data;
}

async function apiConvert(id: string) {
  const { data, error } = await supabase.functions.invoke(`enrollments/${id}/convert`, { method: 'POST' });
  if (error) throw error;
  return data;
}

async function apiAssignPackage(id: string) {
  const { data, error } = await supabase.functions.invoke(
    `enrollments/${id}/assign-package`, { method: 'POST' },
  );
  if (error) throw error;
  return data;
}

async function apiUpdateOnboarding({ id, onboarding_status }: { id: string; onboarding_status: OnboardingStatusType }) {
  const { data, error } = await supabase.functions.invoke(
    `enrollments/${id}/onboarding`, { method: 'PATCH', body: { onboarding_status } },
  );
  if (error) throw error;
  return data;
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useEnrollmentList(params: EnrollmentListParams = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey:  enrollmentKeys.list(params),
    queryFn:   () => apiFetchEnrollments({ per_page: 25, ...params }),
    enabled:   options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useEnrollment(id: string | null) {
  return useQuery({
    queryKey:  enrollmentKeys.detail(id ?? ''),
    queryFn:   () => apiFetchEnrollment(id!),
    enabled:   Boolean(id),
    staleTime: 30_000,
  });
}

export function useEnrollmentDuplicates(id: string | null, enabled = false) {
  return useQuery({
    queryKey:  enrollmentKeys.duplicates(id ?? ''),
    queryFn:   () => apiFetchDuplicates(id!),
    enabled:   Boolean(id) && enabled,
    staleTime: 120_000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useUpdateEnrollmentNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateNotes,
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: enrollmentKeys.detail(id) });
    },
  });
}

export function useApproveEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiApprove,
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: enrollmentKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: enrollmentKeys.lists() });
    },
  });
}

export function useRejectEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiReject,
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: enrollmentKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: enrollmentKeys.lists() });
    },
  });
}

export function useConvertEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiConvert,
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: enrollmentKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: enrollmentKeys.lists() });
    },
  });
}

export function useAssignPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiAssignPackage,
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: enrollmentKeys.detail(id) });
    },
  });
}

export function useUpdateOnboardingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiUpdateOnboarding,
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: enrollmentKeys.detail(id) });
    },
  });
}

// ─── Label / color helpers ────────────────────────────────────────────────────

export function enrollmentStatusLabel(status: EnrollmentStatusType): string {
  const map: Record<EnrollmentStatusType, string> = {
    submitted:      'Inkommen',
    pending_review: 'Granskas',
    approved:       'Godkänd',
    rejected:       'Nekad',
    converted:      'Omvandlad',
  };
  return map[status] ?? status;
}

export function enrollmentStatusColor(status: EnrollmentStatusType): string {
  const map: Record<EnrollmentStatusType, string> = {
    submitted:      'bg-blue-100 text-blue-800',
    pending_review: 'bg-yellow-100 text-yellow-800',
    approved:       'bg-green-100 text-green-800',
    rejected:       'bg-red-100 text-red-800',
    converted:      'bg-purple-100 text-purple-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-700';
}

export function onboardingStatusLabel(status: OnboardingStatusType): string {
  const map: Record<OnboardingStatusType, string> = {
    new_student:       'Ny elev',
    documents_pending: 'Dokument inväntas',
    ready_for_booking: 'Redo för bokning',
    active_student:    'Aktiv elev',
  };
  return map[status] ?? status;
}

export function onboardingStatusColor(status: OnboardingStatusType): string {
  const map: Record<OnboardingStatusType, string> = {
    new_student:       'bg-gray-100 text-gray-700',
    documents_pending: 'bg-yellow-100 text-yellow-800',
    ready_for_booking: 'bg-blue-100 text-blue-800',
    active_student:    'bg-green-100 text-green-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-700';
}

export function enrollmentEventLabel(eventType: string): string {
  const map: Record<string, string> = {
    submitted:        'Anmälan inkom',
    viewed:           'Anmälan öppnad för granskning',
    approved:         'Godkänd',
    rejected:         'Nekad',
    converted:        'Omvandlad till elev',
    package_assigned: 'Paket tilldelat',
    notes_updated:    'Interna anteckningar uppdaterade',
    status_updated:   'Onboarding-status uppdaterad',
  };
  return map[eventType] ?? eventType;
}

export function enrollmentEventColor(eventType: string): string {
  const map: Record<string, string> = {
    submitted:        'border-blue-300 bg-blue-50',
    viewed:           'border-gray-200 bg-gray-50',
    approved:         'border-green-300 bg-green-50',
    rejected:         'border-red-300 bg-red-50',
    converted:        'border-purple-300 bg-purple-50',
    package_assigned: 'border-indigo-300 bg-indigo-50',
    notes_updated:    'border-gray-200 bg-gray-50',
    status_updated:   'border-teal-300 bg-teal-50',
  };
  return map[eventType] ?? 'border-gray-200 bg-gray-50';
}
