import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── API base URL ─────────────────────────────────────────────────────────────

const PORTAL_API = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/student-portal`;
const ANON_KEY   = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PortalSession {
  token:             string;
  student_id:        string;
  student_name:      string;
  organization_id:   string;
  organization_name: string;
  expires_at:        string;
}

export interface PortalStudent {
  id:                      string;
  first_name:              string;
  last_name:               string;
  email:                   string | null;
  phone:                   string | null;
  target_licence_category: string;
  permit_stage:            string;
  personnummer?:           string | null;
  address_line1?:          string | null;
  postal_code?:            string | null;
  city?:                   string | null;
}

export interface PortalSlot {
  id:                    string;
  starts_at:             string;
  ends_at:               string;
  current_bookings:      number;
  max_bookings:          number;
  lesson_type_name:      string | null;
  instructor_first_name: string | null;
  instructor_last_name:  string | null;
  location_name:         string | null;
  vehicle_label:         string | null;
}

export interface PortalBooking {
  id:                    string;
  slot_id:               string;
  status:                string;
  created_at:            string;
  starts_at:             string;
  ends_at:               string;
  lesson_type_name:      string | null;
  instructor_first_name: string | null;
  instructor_last_name:  string | null;
  location_name:         string | null;
  vehicle_label:         string | null;
  cancellation_reason:   string | null;
}

export interface PortalProgress {
  completed_count:     number;
  no_show_count:       number;
  total_minutes:       number;
  upcoming_count:      number;
  permit_stage:        string;
  risk1_completed_at:  string | null;
  risk2_completed_at:  string | null;
  theory_passed_at:    string | null;
  practical_passed_at: string | null;
}

export interface PortalBalance {
  outstanding_sek:  number;
  recent_invoices:  {
    id:             string;
    invoice_number: string | null;
    total_sek:      number;
    status:         string;
    issued_at:      string;
    due_date:       string | null;
  }[];
}

export interface PortalHistoryItem {
  id:                    string;
  slot_id:               string;
  status:                string;
  created_at:            string;
  starts_at:             string;
  ends_at:               string;
  lesson_type_name:      string | null;
  instructor_first_name: string | null;
  instructor_last_name:  string | null;
  instructor_notes:      string | null;
  performance_rating:    number | null;
  notes:                 { content: string; created_at: string }[];
}

export interface PortalLessonType {
  id:   string;
  name: string;
}

export interface PortalWaitlistEntry {
  id:               string;
  lesson_type_id:   string;
  lesson_type_name: string | null;
  status:           string;
  created_at:       string;
  expires_at:       string | null;
}

export interface PortalMaterial {
  id:           string;
  title:        string;
  description:  string | null;
  category:     string;
  content_type: 'link' | 'video' | 'document';
  url:          string | null;
  display_order: number;
}

export interface ValidateTokenResult {
  student:      PortalStudent;
  organization: { id: string; name: string };
  expires_at:   string;
}

export interface GenerateTokenResult {
  token:        string;
  url:          string;
  expires_at:   string;
  student_name: string;
}

// ─── Session storage ──────────────────────────────────────────────────────────

const SESSION_KEY = 'student_portal_session';

export function getStoredPortalSession(): PortalSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PortalSession;
    // Expire client-side if past expiry
    if (new Date(s.expires_at) < new Date()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function storePortalSession(session: PortalSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearPortalSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// ─── Portal fetch helper ──────────────────────────────────────────────────────

class PortalAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalAuthError';
  }
}

async function portalFetch<T>(
  path:    string,
  options?: RequestInit,
): Promise<T> {
  const session = getStoredPortalSession();
  if (!session) throw new PortalAuthError('No portal session');

  const res = await fetch(`${PORTAL_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.token}`,
      'apikey': ANON_KEY,
      ...(options?.headers as Record<string, string> | undefined),
    },
  });

  const body = await res.json() as Record<string, unknown>;

  if (res.status === 401) {
    clearPortalSession();
    window.dispatchEvent(new Event('portalSessionExpired'));
    throw new PortalAuthError((body['error'] as string | undefined) ?? 'Portal session expired');
  }

  if (!res.ok) {
    throw new Error((body['error'] as string | undefined) ?? `Request failed: ${res.status}`);
  }

  return body['data'] as T;
}

// ─── Token validation (unauthenticated) ──────────────────────────────────────

export async function validatePortalToken(token: string): Promise<ValidateTokenResult> {
  const res = await fetch(`${PORTAL_API}/validate?token=${encodeURIComponent(token)}`, {
    headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
  });
  const body = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error((body['error'] as string | undefined) ?? 'Invalid token');
  return body['data'] as ValidateTokenResult;
}

// ─── Push notifications ───────────────────────────────────────────────────────

export function useRegisterPushToken() {
  return useMutation({
    mutationFn: (input: { token: string; previousToken?: string }) =>
      portalFetch<{ id: string }>('/push/register', {
        method: 'POST',
        body:   JSON.stringify({ token: input.token, previous_token: input.previousToken }),
      }),
  });
}

// Final Gap Analysis P2-4 — the backend DELETE /push/register route already
// existed with zero frontend consumer; this is the missing piece, not a new
// endpoint.
export function useRevokePushToken() {
  return useMutation({
    mutationFn: (tokenId: string) =>
      portalFetch<{ revoked: boolean }>('/push/register', {
        method: 'DELETE',
        body:   JSON.stringify({ token_id: tokenId }),
      }),
  });
}

// ─── Student portal hooks ─────────────────────────────────────────────────────

export function usePortalMe() {
  return useQuery({
    queryKey: ['portal', 'me'],
    queryFn:  () => portalFetch<PortalStudent>('/me'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

// Final Gap Analysis P2-3 — the one profile field a student may edit
// themselves; every other field stays staff-mediated by existing design.
export function useUpdatePhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (phone: string) =>
      portalFetch<{ success: boolean; phone: string }>('/me/phone', {
        method: 'PATCH',
        body:   JSON.stringify({ phone }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'me'] });
    },
  });
}

export function usePortalProgress() {
  return useQuery({
    queryKey: ['portal', 'progress'],
    queryFn:  () => portalFetch<PortalProgress>('/progress'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 2 * 60_000,
    retry: 0,
  });
}

export function usePortalBookings() {
  return useQuery({
    queryKey: ['portal', 'bookings'],
    queryFn:  () => portalFetch<PortalBooking[]>('/bookings'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 60_000,
    retry: 0,
  });
}

export function usePortalSlots(from: string, to?: string) {
  const params = new URLSearchParams({ from });
  if (to) params.set('to', to);

  return useQuery({
    queryKey: ['portal', 'slots', from, to ?? ''],
    queryFn:  () => portalFetch<PortalSlot[]>(`/slots?${params.toString()}`),
    enabled:  Boolean(getStoredPortalSession() && from),
    staleTime: 60_000,
    retry: 0,
  });
}

export function usePortalBalance() {
  return useQuery({
    queryKey: ['portal', 'balance'],
    queryFn:  () => portalFetch<PortalBalance>('/balance'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 60_000,
    retry: 0,
  });
}

// ─── Portal mutation hooks ────────────────────────────────────────────────────

export function usePortalCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, lessonTypeId }: { slotId: string; lessonTypeId?: string }) =>
      portalFetch<{ id: string; slot_id: string; status: string; created_at: string }>('/bookings', {
        method: 'POST',
        body:   JSON.stringify({ slot_id: slotId, ...(lessonTypeId ? { lesson_type_id: lessonTypeId } : {}) }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'bookings'] });
      void qc.invalidateQueries({ queryKey: ['portal', 'slots'] });
      void qc.invalidateQueries({ queryKey: ['portal', 'progress'] });
    },
  });
}

export function usePortalCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason?: string }) =>
      portalFetch<{ success: boolean; credit_forfeited?: boolean; credit_reversal_failed?: boolean }>(`/bookings/${bookingId}/cancel`, {
        method: 'POST',
        body:   JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'bookings'] });
      void qc.invalidateQueries({ queryKey: ['portal', 'progress'] });
    },
  });
}

export function usePortalRescheduleBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, newSlotId }: { bookingId: string; newSlotId: string }) =>
      portalFetch<{ id: string; slot_id: string; status: string }>(`/bookings/${bookingId}/reschedule`, {
        method: 'POST',
        body:   JSON.stringify({ new_slot_id: newSlotId }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'bookings'] });
      void qc.invalidateQueries({ queryKey: ['portal', 'slots'] });
      void qc.invalidateQueries({ queryKey: ['portal', 'progress'] });
    },
  });
}

export function usePortalHistory() {
  return useQuery({
    queryKey: ['portal', 'history'],
    queryFn:  () => portalFetch<PortalHistoryItem[]>('/history'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 2 * 60_000,
    retry: 0,
  });
}

export function usePortalLessonTypes() {
  return useQuery({
    queryKey: ['portal', 'lesson-types'],
    queryFn:  () => portalFetch<PortalLessonType[]>('/lesson-types').catch((): PortalLessonType[] => []),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 10 * 60_000,
    retry: 0,
  });
}

export function usePortalMyWaitlist() {
  return useQuery({
    queryKey: ['portal', 'waitlist'],
    queryFn:  () => portalFetch<PortalWaitlistEntry[]>('/waitlist'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 2 * 60_000,
    retry: 0,
  });
}

export function usePortalJoinWaitlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { lesson_type_id: string }) =>
      portalFetch<PortalWaitlistEntry>('/waitlist', {
        method: 'POST',
        body:   JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'waitlist'] });
    },
  });
}

export function usePortalLeaveWaitlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      portalFetch<{ success: boolean }>(`/waitlist/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'waitlist'] });
    },
  });
}

export function usePortalMaterials() {
  return useQuery({
    queryKey: ['portal', 'materials'],
    queryFn:  () => portalFetch<PortalMaterial[]>('/materials'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

export function usePortalCompletions() {
  return useQuery({
    queryKey: ['portal', 'completions'],
    queryFn:  () => portalFetch<string[]>('/completions'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

export function usePortalMarkComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (materialId: string) =>
      portalFetch<{ success: boolean }>('/completions', {
        method: 'POST',
        body:   JSON.stringify({ material_id: materialId }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['portal', 'completions'] }),
  });
}

// ─── Document hooks ───────────────────────────────────────────────────────────

export interface PortalDocument {
  id:              string;
  category:        string;
  file_name:       string;
  mime_type:       string | null;
  file_size_bytes: number | null;
  description:     string | null;
  expires_at:      string | null;
  created_at:      string;
  download_url:    string | null;
}

export function usePortalDocuments() {
  return useQuery({
    queryKey: ['portal', 'documents'],
    queryFn:  () => portalFetch<PortalDocument[]>('/documents'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 2 * 60_000,
    retry: 0,
  });
}

export function usePortalUnmarkComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (materialId: string) =>
      portalFetch<{ success: boolean }>(`/completions/${materialId}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['portal', 'completions'] }),
  });
}

// ─── Notification hooks ───────────────────────────────────────────────────────

export interface PortalNotification {
  id:                   string;
  subject:              string | null;
  body:                 string | null;
  template_key:         string;
  channel:              string;
  status:               string;
  category:             string | null;
  priority:             string;
  deep_link_identifier: string | null;
  read_at:              string | null;
  created_at:           string;
  reference_type:       string | null;
  reference_id:         string | null;
  metadata:             Record<string, unknown>;
}

export function usePortalNotifications() {
  return useQuery({
    queryKey: ['portal', 'notifications'],
    queryFn:  () => portalFetch<PortalNotification[]>('/notifications'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 2 * 60_000,
    retry: 0,
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['portal', 'notifications', 'unread-count'],
    queryFn:  () => portalFetch<{ count: number }>('/notifications/unread-count'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 60_000,
    retry: 0,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => portalFetch<{ success: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => portalFetch<{ success: boolean }>('/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    },
  });
}

// ─── Lesson package hooks ─────────────────────────────────────────────────────

export interface PortalPackage {
  id:                 string;
  name:               string;
  category:           string | null;
  quantity_granted:   number;
  quantity_consumed:  number;
  quantity_remaining: number;
  expires_at:         string | null;
  purchased_at:       string;
  status:             string;
}

export function usePortalPackages() {
  return useQuery({
    queryKey: ['portal', 'packages'],
    queryFn:  () => portalFetch<PortalPackage[]>('/packages'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 2 * 60_000,
    retry: 0,
  });
}

// ─── Terms acceptance hooks ───────────────────────────────────────────────────

export interface PortalTerms {
  accepted:      boolean;
  accepted_at:   string | null;
  terms_version: string | null;
}

export function usePortalTerms() {
  return useQuery({
    queryKey: ['portal', 'terms'],
    queryFn:  () => portalFetch<PortalTerms>('/terms'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

export function usePortalAcceptTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      portalFetch<{ success: boolean }>('/terms/accept', {
        method: 'POST',
        body:   '{}',
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['portal', 'terms'] }),
  });
}

export interface PortalOrg {
  name:                         string;
  swish_number:                 string | null;
  contact_phone:                string | null;
  contact_email:                string | null;
  // F3 V1 — the org's configured cancellation/reschedule deadline (hours
  // before a lesson), defaulting to 24 server-side when unset.
  cancellation_deadline_hours:  number;
}

export function usePortalOrg() {
  return useQuery({
    queryKey: ['portal', 'org'],
    queryFn:  () => portalFetch<PortalOrg>('/org'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 10 * 60_000,
    retry: 0,
  });
}

// ─── Practice log hooks ───────────────────────────────────────────────────────

export interface PortalPracticeEntry {
  id:               string;
  practice_date:    string;
  duration_minutes: number;
  notes:            string | null;
  created_at:       string;
}

export function usePortalPracticeLog() {
  return useQuery({
    queryKey: ['portal', 'practice-log'],
    queryFn:  () => portalFetch<PortalPracticeEntry[]>('/practice-log'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 2 * 60_000,
    retry: 0,
  });
}

export function usePortalAddPractice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { practice_date: string; duration_minutes: number; notes?: string | undefined }) =>
      portalFetch<PortalPracticeEntry>('/practice-log', {
        method: 'POST',
        body:   JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['portal', 'practice-log'] }),
  });
}

export function usePortalDeletePractice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      portalFetch<{ success: boolean }>(`/practice-log/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['portal', 'practice-log'] }),
  });
}

// ─── Online payment hooks ─────────────────────────────────────────────────────

export type PaymentRequestStatus = 'pending' | 'initiated' | 'completed' | 'failed' | 'expired' | 'cancelled';

export interface PaymentRequest {
  id:           string;
  provider:     'stripe' | 'swish';
  amount_sek:   number;
  status:       PaymentRequestStatus;
  completed_at: string | null;
  payment_id:   string | null;
}

export interface StripeCheckoutResult {
  session_url:        string;
  payment_request_id: string;
}

/** Record that the student opened the Swish deeplink for an invoice. */
export function usePortalRecordSwishInitiated() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) =>
      portalFetch<{ payment_request_id: string }>('/payments/swish', {
        method: 'POST',
        body:   JSON.stringify({ invoice_id: invoiceId }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'payment-requests'] });
    },
  });
}

/** Create a Stripe Checkout session for an invoice.
 *  Returns the hosted checkout URL — redirect the user there. */
export function usePortalCreateStripeCheckout() {
  return useMutation({
    mutationFn: (invoiceId: string) =>
      portalFetch<StripeCheckoutResult>('/payments/stripe/checkout', {
        method: 'POST',
        body:   JSON.stringify({ invoice_id: invoiceId }),
      }),
  });
}

/** Create a Nets Easy payment for an invoice.
 *  Returns the hosted payment page URL — redirect the user there. */
export function usePortalCreateNetsCheckout() {
  return useMutation({
    mutationFn: (invoiceId: string) =>
      portalFetch<StripeCheckoutResult>('/payments/nets/checkout', {
        method: 'POST',
        body:   JSON.stringify({ invoice_id: invoiceId }),
      }),
  });
}

/** Poll the status of a payment request (used after returning from Stripe). */
export function usePortalPaymentRequest(paymentRequestId: string | null) {
  return useQuery({
    queryKey: ['portal', 'payment-requests', paymentRequestId],
    queryFn:  () => portalFetch<PaymentRequest>(`/payments/requests/${paymentRequestId!}`),
    enabled:  Boolean(getStoredPortalSession() && paymentRequestId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Keep polling while pending/initiated; stop once settled
      if (!status || status === 'pending' || status === 'initiated') return 3_000;
      return false;
    },
    staleTime: 0,
    retry: 0,
  });
}

// ─── Admin hook — generate a portal token for a student ──────────────────────

export function useGeneratePortalToken() {
  return useMutation({
    mutationFn: async (studentId: string): Promise<GenerateTokenResult> => {
      // Confirm the GoTrue client has an active session before invoking.
      // If getSession() returns null, invoke would send no Authorization header
      // and the gateway would respond with 401 before our function code runs.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Ingen aktiv session — ladda om sidan och försök igen');
      }

      const { data, error } = await supabase.functions.invoke<{ data: GenerateTokenResult }>(
        'student-portal/generate-token',
        { body: { student_id: studentId } },
      );

      if (error) {
        // In @supabase/functions-js v2, error.context is the raw unread Response.
        // Read the body to surface the exact server error message.
        const rawResponse = (error as unknown as { context?: Response }).context;
        if (rawResponse) {
          try {
            const text = await rawResponse.clone().text();
            console.error('[student-portal] generate-token server response:', {
              status: rawResponse.status,
              body:   text,
            });
          } catch { /* ignore */ }
        } else {
          console.error('[student-portal] generate-token error (no response):', error.message);
        }
        throw new Error(error.message ?? 'Kunde inte generera portallänk');
      }

      if (!data?.data) throw new Error('Ogiltigt svar från servern');
      return data.data;
    },
  });
}

// ─── Quiz types ───────────────────────────────────────────────────────────────

export interface QuizCategory {
  category:       string;
  question_count: number;
  last_score:     number | null;
  last_total:     number | null;
  last_attempt:   string | null;
}

export interface QuizQuestion {
  id:            string;
  question_text: string;
  category:      string;
  difficulty:    string;
  options:       Array<{ text: string }>;
}

export interface QuizSession {
  session_id: string;
  questions:  QuizQuestion[];
}

export interface QuizAnswerInput {
  question_id:    string;
  selected_index: number | null;
}

export interface QuizResultDetail {
  question_id:    string;
  question_text:  string;
  selected_index: number | null;
  correct_index:  number;
  is_correct:     boolean;
  explanation:    string | null;
}

export interface QuizResult {
  session_id: string;
  score:      number;
  total:      number;
  percentage: number;
  passed:     boolean;
  details:    QuizResultDetail[];
}

export interface QuizHistoryEntry {
  id:             string;
  category:       string | null;
  question_count: number;
  score:          number | null;
  completed_at:   string;
  time_spent_sec: number | null;
  created_at:     string;
}

// ─── Quiz hooks ───────────────────────────────────────────────────────────────

export function usePortalQuizCategories() {
  return useQuery({
    queryKey: ['portal', 'quiz', 'categories'],
    queryFn:  (): Promise<QuizCategory[]> =>
      portalFetch<QuizCategory[]>('/quiz/categories'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 60_000,
    retry: 0,
  });
}

export function usePortalStartQuiz() {
  return useMutation({
    mutationFn: (params: {
      category?:       string | undefined;
      question_count?: number | undefined;
    }): Promise<QuizSession> =>
      portalFetch<QuizSession>('/quiz/sessions', {
        method: 'POST',
        body:   JSON.stringify(params),
      }),
  });
}

export function usePortalSubmitQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      session_id:      string;
      answers:         QuizAnswerInput[];
      time_spent_sec?: number;
    }): Promise<QuizResult> => {
      const { session_id, ...body } = params;
      return portalFetch<QuizResult>(
        `/quiz/sessions/${session_id}/submit`,
        { method: 'POST', body: JSON.stringify(body) },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portal', 'quiz', 'categories'] });
      void qc.invalidateQueries({ queryKey: ['portal', 'quiz', 'history'] });
    },
  });
}

export function usePortalQuizHistory() {
  return useQuery({
    queryKey: ['portal', 'quiz', 'history'],
    queryFn:  (): Promise<QuizHistoryEntry[]> =>
      portalFetch<QuizHistoryEntry[]>('/quiz/sessions'),
    enabled:  Boolean(getStoredPortalSession()),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}
