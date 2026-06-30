import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PackageStatusType = 'active' | 'completed' | 'expired' | 'cancelled';

export type ConsumptionEventType =
  | 'package_assigned'
  | 'lesson_booked'
  | 'lesson_completed'
  | 'credit_consumed'
  | 'credit_reversed'
  | 'package_completed'
  | 'package_expired'
  | 'package_reactivated';

export type ReversalType =
  | 'manual'
  | 'late_cancellation'
  | 'no_show_reversal'
  | 'instructor_error'
  | 'administrative';

export interface PackageConsumptionEvent {
  id:                string;
  event_type:        ConsumptionEventType;
  booking_id:        string | null;
  reversal_id:       string | null;
  credits_delta:     number;
  lessons_used_after: number;
  actor_email:       string | null;
  metadata:          Record<string, unknown>;
  created_at:        string;
}

export interface PackageCreditReversal {
  id:               string;
  reversal_type:    ReversalType;
  reason:           string;
  credits_restored: number;
  booking_id:       string | null;
  reversed_by:      string | null;
  created_at:       string;
}

export interface StudentPackage {
  id:                           string;
  student_id:                   string;
  enrollment_id:                string | null;
  package_offering_id:          string;
  package_name:                 string;
  package_code:                 string | null;
  lesson_category:              string;
  package_quantity:             number;
  lessons_used:                 number;
  lessons_remaining:            number;
  completion_pct:               number;
  campaign_name:                string | null;
  coupon_code:                  string | null;
  base_price:                   number;
  final_price_incl_vat:         number;
  currency:                     string;
  status:                       PackageStatusType;
  expires_at:                   string | null;
  expiration_warning:           boolean;
  cancellation_consumes_credit: boolean;
  assigned_at:                  string;
}

export interface StudentPackageDetail extends StudentPackage {
  events:    PackageConsumptionEvent[];
  reversals: PackageCreditReversal[];
}

export interface StudentPackageListResponse {
  data: StudentPackage[];
  meta: { total: number; page: number; per_page: number; has_more: boolean };
}

export interface ConsumeInput {
  assignment_id:    string;
  booking_id?:      string;
  lesson_category?: string;
  notes?:           string;
}

export interface ReverseInput {
  assignment_id: string;
  reversal_type: ReversalType;
  reason:        string;
  booking_id?:   string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const packageConsumptionKeys = {
  all:    ['package-consumption'] as const,
  lists:  () => [...packageConsumptionKeys.all, 'list'] as const,
  list:   (studentId: string) => [...packageConsumptionKeys.lists(), studentId] as const,
  detail: (id: string) => [...packageConsumptionKeys.all, 'detail', id] as const,
  events: (id: string) => [...packageConsumptionKeys.all, 'events', id] as const,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetchStudentPackages(studentId: string): Promise<StudentPackageListResponse> {
  const { data, error } = await supabase.functions.invoke<StudentPackageListResponse>(
    `package-consumption?student_id=${studentId}&per_page=50`,
    { method: 'GET' },
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiFetchPackageDetail(id: string): Promise<{ data: StudentPackageDetail }> {
  const { data, error } = await supabase.functions.invoke<{ data: StudentPackageDetail }>(
    `package-consumption/${id}`,
    { method: 'GET' },
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiConsumeCredit(input: ConsumeInput): Promise<unknown> {
  const body: Record<string, unknown> = { assignment_id: input.assignment_id };
  if (input.booking_id      != null) body['booking_id']      = input.booking_id;
  if (input.lesson_category != null) body['lesson_category'] = input.lesson_category;
  if (input.notes           != null) body['notes']           = input.notes;

  const { data, error } = await supabase.functions.invoke(
    'package-consumption/consume',
    { method: 'POST', body },
  );
  if (error) throw error;
  return data;
}

async function apiReverseCredit(input: ReverseInput): Promise<unknown> {
  const body: Record<string, unknown> = {
    assignment_id: input.assignment_id,
    reversal_type: input.reversal_type,
    reason:        input.reason,
  };
  if (input.booking_id != null) body['booking_id'] = input.booking_id;

  const { data, error } = await supabase.functions.invoke(
    'package-consumption/reverse',
    { method: 'POST', body },
  );
  if (error) throw error;
  return data;
}

async function apiExpirePackages(): Promise<{ data: { expired_count: number } }> {
  const { data, error } = await supabase.functions.invoke<{ data: { expired_count: number } }>(
    'package-consumption/expire',
    { method: 'POST' },
  );
  if (error) throw error;
  if (!data) throw new Error('Inget svar från servern');
  return data;
}

async function apiPatchPackage(
  id: string,
  patch: { cancellation_consumes_credit: boolean },
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke(
    `package-consumption/${id}`,
    { method: 'PATCH', body: patch },
  );
  if (error) throw error;
  return data;
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useStudentPackages(studentId: string | null) {
  return useQuery({
    queryKey:  packageConsumptionKeys.list(studentId ?? ''),
    queryFn:   () => apiFetchStudentPackages(studentId!),
    enabled:   Boolean(studentId),
    staleTime: 30_000,
  });
}

export function usePackageDetail(id: string | null) {
  return useQuery({
    queryKey:  packageConsumptionKeys.detail(id ?? ''),
    queryFn:   () => apiFetchPackageDetail(id!),
    enabled:   Boolean(id),
    staleTime: 20_000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useConsumeCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiConsumeCredit,
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: packageConsumptionKeys.detail(input.assignment_id) });
      void qc.invalidateQueries({ queryKey: packageConsumptionKeys.lists() });
    },
  });
}

export function useReverseCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiReverseCredit,
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: packageConsumptionKeys.detail(input.assignment_id) });
      void qc.invalidateQueries({ queryKey: packageConsumptionKeys.lists() });
    },
  });
}

export function useExpirePackages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiExpirePackages,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: packageConsumptionKeys.all });
    },
  });
}

export function useUpdatePackageConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; cancellation_consumes_credit: boolean }) =>
      apiPatchPackage(id, patch),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: packageConsumptionKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: packageConsumptionKeys.lists() });
    },
  });
}

// ─── Label / color helpers ────────────────────────────────────────────────────

export function packageStatusLabel(status: PackageStatusType): string {
  const map: Record<PackageStatusType, string> = {
    active:    'Aktiv',
    completed: 'Slutförd',
    expired:   'Utgången',
    cancelled: 'Avbokad',
  };
  return map[status] ?? status;
}

export function packageStatusColor(status: PackageStatusType): string {
  const map: Record<PackageStatusType, string> = {
    active:    'bg-green-100 text-green-800',
    completed: 'bg-blue-100 text-blue-800',
    expired:   'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
  };
  return map[status] ?? 'bg-gray-100 text-gray-700';
}

export function consumptionEventLabel(eventType: ConsumptionEventType): string {
  const map: Record<ConsumptionEventType, string> = {
    package_assigned:   'Paket tilldelat',
    lesson_booked:      'Lektion bokad',
    lesson_completed:   'Lektion genomförd',
    credit_consumed:    'Kredit förbrukad',
    credit_reversed:    'Kredit återförd',
    package_completed:  'Paket slutfört',
    package_expired:    'Paket utgånget',
    package_reactivated:'Paket återaktiverat',
  };
  return map[eventType] ?? eventType;
}

export function consumptionEventColor(eventType: ConsumptionEventType): string {
  const map: Record<ConsumptionEventType, string> = {
    package_assigned:    'text-indigo-500',
    lesson_booked:       'text-blue-400',
    lesson_completed:    'text-blue-500',
    credit_consumed:     'text-orange-500',
    credit_reversed:     'text-yellow-500',
    package_completed:   'text-green-500',
    package_expired:     'text-gray-400',
    package_reactivated: 'text-teal-500',
  };
  return map[eventType] ?? 'text-gray-400';
}

export function reversalTypeLabel(type: ReversalType): string {
  const map: Record<ReversalType, string> = {
    manual:            'Manuell korrigering',
    late_cancellation: 'Sen avbokning',
    no_show_reversal:  'Uteblivande återförd',
    instructor_error:  'Instruktörsfel',
    administrative:    'Administrativ justering',
  };
  return map[type] ?? type;
}
