import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── API base URL ─────────────────────────────────────────────────────────────

const PORTAL_API = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/instructor-portal`;
const ANON_KEY   = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InstructorPortalSession {
  token:             string;
  instructor_id:     string;
  instructor_name:   string;
  organization_id:   string;
  organization_name: string;
  expires_at:        string;
}

export interface InstructorPortalProfile {
  id:                  string;
  first_name:          string;
  last_name:           string;
  email:               string;
  phone:               string | null;
  teaching_categories: string[];
  languages_spoken:    string[];
  employment_type:     string;
}

export interface InstructorPortalSlot {
  id:               string;
  starts_at:        string;
  ends_at:          string;
  status:           string;
  current_bookings: number;
  max_bookings:     number;
  lesson_type_name: string | null;
  location_name:    string | null;
  vehicle_label:    string | null;
}

export interface InstructorPortalBooking {
  id:                        string;
  slot_id:                   string;
  starts_at:                 string;
  ends_at:                   string;
  status:                    string;
  student_first_name:        string | null;
  student_last_name:         string | null;
  lesson_type_name:          string | null;
  attendance_status:         string | null;
  notes:                     string | null;
  evaluation_outcome:        string | null;
  evaluation_strengths:      string | null;
  evaluation_improvements:   string | null;
  evaluation_recommendation: string | null;
}

export interface InstructorPortalAssessment {
  id:           string;
  competencies: Record<string, string>;
  readiness:    Record<string, boolean>;
  notes:        string | null;
  assessed_at:  string;
  updated_at:   string;
}

export interface InstructorPortalStudent {
  id:                      string;
  first_name:              string;
  last_name:               string;
  email:                   string | null;
  phone:                   string | null;
  permit_stage:            string;
  target_licence_category: string;
  completed_lessons:       number;
  last_lesson_at:          string | null;
  next_lesson_at:          string | null;
}

export interface InstructorPortalStats {
  lessons_today:          number;
  lessons_this_week:      number;
  lessons_this_month:     number;
  total_hours_this_month: number;
  unique_students:        number;
  upcoming_count:         number;
}

export interface ValidateInstructorTokenResult {
  instructor:   InstructorPortalProfile;
  organization: { id: string; name: string };
  expires_at:   string;
}

export interface GenerateInstructorTokenResult {
  token:           string;
  url:             string;
  expires_at:      string;
  instructor_name: string;
}

// ─── Session storage ──────────────────────────────────────────────────────────

const SESSION_KEY = 'instructor_portal_session';

export function getStoredInstructorSession(): InstructorPortalSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as InstructorPortalSession;
    if (new Date(s.expires_at) < new Date()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function storeInstructorSession(session: InstructorPortalSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearInstructorSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

// ─── Demo mock data ───────────────────────────────────────────────────────────

const TODAY = new Date();
function demoDate(offsetDays: number, hour: number, min = 0): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

const DEMO_STATS: InstructorPortalStats = {
  lessons_today:          3,
  lessons_this_week:      12,
  lessons_this_month:     48,
  total_hours_this_month: 72,
  unique_students:        18,
  upcoming_count:         5,
};

const EMPTY_EVAL = { evaluation_outcome: null, evaluation_strengths: null, evaluation_improvements: null, evaluation_recommendation: null };

const DEMO_TODAY_BOOKINGS: InstructorPortalBooking[] = [
  { id: 'b1', slot_id: 's1', starts_at: demoDate(0, 8, 30),  ends_at: demoDate(0, 10, 0),  status: 'confirmed', student_first_name: 'Anna',   student_last_name: 'Lindström', lesson_type_name: 'Körlektion B', attendance_status: 'present', notes: null, ...EMPTY_EVAL },
  { id: 'b2', slot_id: 's2', starts_at: demoDate(0, 10, 0),  ends_at: demoDate(0, 11, 30), status: 'confirmed', student_first_name: 'Erik',   student_last_name: 'Svensson',  lesson_type_name: 'Körlektion B', attendance_status: null,      notes: null, ...EMPTY_EVAL },
  { id: 'b3', slot_id: 's3', starts_at: demoDate(0, 13, 0),  ends_at: demoDate(0, 14, 30), status: 'confirmed', student_first_name: 'Maria',  student_last_name: 'Johansson', lesson_type_name: 'Risk 1',       attendance_status: null,      notes: null, ...EMPTY_EVAL },
];

const DEMO_UPCOMING_BOOKINGS: InstructorPortalBooking[] = [
  ...DEMO_TODAY_BOOKINGS,
  { id: 'b4', slot_id: 's4', starts_at: demoDate(1, 9, 0),   ends_at: demoDate(1, 10, 30), status: 'confirmed', student_first_name: 'Jonas',  student_last_name: 'Berg',      lesson_type_name: 'Körlektion B', attendance_status: null, notes: null, ...EMPTY_EVAL },
  { id: 'b5', slot_id: 's5', starts_at: demoDate(1, 13, 30), ends_at: demoDate(1, 15, 0),  status: 'confirmed', student_first_name: 'Sofia',  student_last_name: 'Nilsson',   lesson_type_name: 'Körlektion B', attendance_status: null, notes: null, ...EMPTY_EVAL },
  { id: 'b6', slot_id: 's6', starts_at: demoDate(2, 8, 30),  ends_at: demoDate(2, 10, 0),  status: 'confirmed', student_first_name: 'Ahmed',  student_last_name: 'Hassan',    lesson_type_name: 'Uppkörning',  attendance_status: null, notes: null, ...EMPTY_EVAL },
];

const DEMO_SLOTS: InstructorPortalSlot[] = [
  { id: 's1', starts_at: demoDate(0, 8, 30),  ends_at: demoDate(0, 10, 0),  status: 'booked', current_bookings: 1, max_bookings: 1, lesson_type_name: 'Körlektion B', location_name: 'Göteborg',  vehicle_label: 'Volvo V40' },
  { id: 's2', starts_at: demoDate(0, 10, 0),  ends_at: demoDate(0, 11, 30), status: 'booked', current_bookings: 1, max_bookings: 1, lesson_type_name: 'Körlektion B', location_name: 'Göteborg',  vehicle_label: 'Volvo V40' },
  { id: 's3', starts_at: demoDate(0, 13, 0),  ends_at: demoDate(0, 14, 30), status: 'booked', current_bookings: 1, max_bookings: 1, lesson_type_name: 'Risk 1',       location_name: 'Kontoret',  vehicle_label: null },
  { id: 's4', starts_at: demoDate(1, 9, 0),   ends_at: demoDate(1, 10, 30), status: 'open',   current_bookings: 0, max_bookings: 1, lesson_type_name: 'Körlektion B', location_name: 'Göteborg',  vehicle_label: 'Ford Focus' },
  { id: 's5', starts_at: demoDate(1, 13, 30), ends_at: demoDate(1, 15, 0),  status: 'booked', current_bookings: 1, max_bookings: 1, lesson_type_name: 'Körlektion B', location_name: 'Göteborg',  vehicle_label: 'Ford Focus' },
  { id: 's6', starts_at: demoDate(2, 8, 30),  ends_at: demoDate(2, 10, 0),  status: 'booked', current_bookings: 1, max_bookings: 1, lesson_type_name: 'Uppkörning',  location_name: 'Trafikverket', vehicle_label: 'Volvo V40' },
];

const DEMO_STUDENTS: InstructorPortalStudent[] = [
  { id: 'st1', first_name: 'Anna',  last_name: 'Lindström', email: null, phone: null, permit_stage: 'practical', target_licence_category: 'B', completed_lessons: 28, last_lesson_at: demoDate(-1, 10, 0),  next_lesson_at: demoDate(0, 8, 30) },
  { id: 'st2', first_name: 'Erik',  last_name: 'Svensson',  email: null, phone: null, permit_stage: 'theory',    target_licence_category: 'B', completed_lessons: 15, last_lesson_at: demoDate(-3, 14, 0),  next_lesson_at: demoDate(0, 10, 0) },
  { id: 'st3', first_name: 'Maria', last_name: 'Johansson', email: null, phone: null, permit_stage: 'risk1',     target_licence_category: 'B', completed_lessons: 8,  last_lesson_at: demoDate(-7, 9, 0),   next_lesson_at: demoDate(0, 13, 0) },
  { id: 'st4', first_name: 'Jonas', last_name: 'Berg',      email: null, phone: null, permit_stage: 'learner',   target_licence_category: 'B', completed_lessons: 3,  last_lesson_at: demoDate(-2, 11, 0),  next_lesson_at: demoDate(1, 9, 0) },
  { id: 'st5', first_name: 'Sofia', last_name: 'Nilsson',   email: null, phone: null, permit_stage: 'risk2',     target_licence_category: 'B', completed_lessons: 20, last_lesson_at: demoDate(-5, 15, 0),  next_lesson_at: demoDate(1, 13, 30) },
  { id: 'st6', first_name: 'Ahmed', last_name: 'Hassan',    email: null, phone: null, permit_stage: 'practical', target_licence_category: 'B', completed_lessons: 32, last_lesson_at: demoDate(-1, 8, 30),  next_lesson_at: demoDate(2, 8, 30) },
];

const DEMO_ME: InstructorPortalProfile = {
  id: 'demo-instructor-id',
  first_name: 'Demo',
  last_name: 'Lärare',
  email: 'demo@trafikskola.se',
  phone: '070-000 00 00',
  teaching_categories: ['B'],
  languages_spoken: ['Svenska', 'English'],
  employment_type: 'employed',
};

function demoResponse(path: string): unknown {
  if (path.startsWith('/stats'))              return DEMO_STATS;
  if (path.startsWith('/bookings/today'))     return DEMO_TODAY_BOOKINGS;
  if (path.startsWith('/bookings/upcoming'))  return DEMO_UPCOMING_BOOKINGS;
  if (path.startsWith('/slots'))              return DEMO_SLOTS;
  if (path.match(/^\/students\/[^/]+\/assessment/)) return null;
  if (path.startsWith('/students'))           return DEMO_STUDENTS;
  if (path.startsWith('/me'))                 return DEMO_ME;
  return null;
}

// ─── Portal fetch helper ──────────────────────────────────────────────────────

async function portalFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const session = getStoredInstructorSession();
  if (!session) throw new Error('No instructor portal session');

  // Demo mode — return mock data without hitting the backend
  if (session.token === 'demo') {
    await new Promise(r => setTimeout(r, 150)); // simulate latency
    return demoResponse(path) as T;
  }

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
  if (!res.ok) throw new Error((body['error'] as string | undefined) ?? `Request failed: ${res.status}`);
  return body['data'] as T;
}

// ─── Token validation (unauthenticated) ──────────────────────────────────────

export async function validateInstructorToken(token: string): Promise<ValidateInstructorTokenResult> {
  const res = await fetch(`${PORTAL_API}/validate?token=${encodeURIComponent(token)}`, {
    headers: { 'apikey': ANON_KEY },
  });
  const body = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error((body['error'] as string | undefined) ?? 'Invalid token');
  return body['data'] as ValidateInstructorTokenResult;
}

// ─── Push notifications ───────────────────────────────────────────────────────

export function useRegisterInstructorPushToken() {
  return useMutation({
    mutationFn: (input: { token: string; previousToken?: string }) =>
      portalFetch<{ id: string }>('/push/register', {
        method: 'POST',
        body:   JSON.stringify({ token: input.token, previous_token: input.previousToken }),
      }),
  });
}

// ─── Query hooks ──────────────────────────────────────────────────────────────

export function useInstructorPortalMe() {
  return useQuery({
    queryKey: ['instructor-portal', 'me'],
    queryFn:  () => portalFetch<InstructorPortalProfile>('/me'),
    enabled:  Boolean(getStoredInstructorSession()),
    staleTime: 5 * 60_000,
  });
}

export function useInstructorPortalStats() {
  return useQuery({
    queryKey: ['instructor-portal', 'stats'],
    queryFn:  () => portalFetch<InstructorPortalStats>('/stats'),
    enabled:  Boolean(getStoredInstructorSession()),
    staleTime: 60_000,
  });
}

export function useInstructorPortalSlots(from: string, to?: string) {
  const params = new URLSearchParams({ from });
  if (to) params.set('to', to);
  return useQuery({
    queryKey: ['instructor-portal', 'slots', from, to ?? ''],
    queryFn:  () => portalFetch<InstructorPortalSlot[]>(`/slots?${params.toString()}`),
    enabled:  Boolean(getStoredInstructorSession() && from),
    staleTime: 60_000,
  });
}

export function useInstructorPortalTodayBookings() {
  return useQuery({
    queryKey: ['instructor-portal', 'bookings', 'today'],
    queryFn:  () => portalFetch<InstructorPortalBooking[]>('/bookings/today'),
    enabled:  Boolean(getStoredInstructorSession()),
    staleTime: 2 * 60_000,
  });
}

export function useInstructorPortalUpcomingBookings() {
  return useQuery({
    queryKey: ['instructor-portal', 'bookings', 'upcoming'],
    queryFn:  () => portalFetch<InstructorPortalBooking[]>('/bookings/upcoming'),
    enabled:  Boolean(getStoredInstructorSession()),
    staleTime: 60_000,
  });
}

export function useInstructorPortalStudents() {
  return useQuery({
    queryKey: ['instructor-portal', 'students'],
    queryFn:  () => portalFetch<InstructorPortalStudent[]>('/students'),
    enabled:  Boolean(getStoredInstructorSession()),
    staleTime: 2 * 60_000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export function useInstructorPortalMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId, status, notes,
      evaluation_outcome, evaluation_strengths, evaluation_improvements, evaluation_recommendation,
    }: {
      bookingId:                 string;
      status:                    string;
      notes?:                    string | undefined;
      evaluation_outcome?:       string | undefined;
      evaluation_strengths?:     string | undefined;
      evaluation_improvements?:  string | undefined;
      evaluation_recommendation?: string | undefined;
    }) =>
      portalFetch<{ success: boolean }>(`/bookings/${bookingId}/attendance`, {
        method: 'POST',
        body:   JSON.stringify({
          status, notes,
          evaluation_outcome, evaluation_strengths,
          evaluation_improvements, evaluation_recommendation,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['instructor-portal', 'bookings'] });
    },
  });
}

export function useInstructorPortalAssessment(studentId: string) {
  return useQuery({
    queryKey: ['instructor-portal', 'assessment', studentId],
    queryFn:  () => portalFetch<InstructorPortalAssessment | null>(`/students/${studentId}/assessment`),
    enabled:  Boolean(getStoredInstructorSession() && studentId),
    staleTime: 2 * 60_000,
  });
}

export function useInstructorPortalSaveAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      studentId, competencies, readiness, notes,
    }: {
      studentId:    string;
      competencies: Record<string, string>;
      readiness:    Record<string, boolean>;
      notes:        string;
    }) =>
      portalFetch<{ success: boolean }>(`/students/${studentId}/assessment`, {
        method: 'PUT',
        body:   JSON.stringify({ competencies, readiness, notes }),
      }),
    onSuccess: (_data, { studentId }) => {
      void qc.invalidateQueries({ queryKey: ['instructor-portal', 'assessment', studentId] });
    },
  });
}

// ─── Admin hook — generate a portal token for an instructor ──────────────────

export function useGenerateInstructorPortalToken() {
  return useMutation({
    mutationFn: async (instructorId: string): Promise<GenerateInstructorTokenResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Ingen aktiv session — ladda om sidan och försök igen');
      }

      const { data, error } = await supabase.functions.invoke<{ data: GenerateInstructorTokenResult }>(
        'instructor-portal/generate-token',
        { body: { instructor_id: instructorId } },
      );

      if (error) {
        const rawResponse = (error as unknown as { context?: Response }).context;
        if (rawResponse) {
          try {
            const text = await rawResponse.clone().text();
            console.error('[instructor-portal] generate-token server response:', {
              status: rawResponse.status,
              body:   text,
            });
          } catch { /* ignore */ }
        }
        throw new Error(error.message ?? 'Kunde inte generera portallänk');
      }

      if (!data?.data) throw new Error('Ogiltigt svar från servern');
      return data.data;
    },
  });
}
