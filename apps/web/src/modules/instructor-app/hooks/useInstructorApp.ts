import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InstructorProfile {
  id: string;
  first_name: string;
  last_name: string;
  employment_type: string;
  phone: string | null;
  email: string | null;
}

export interface BookingDetail {
  id: string;
  status: string;
  student_id: string;
  student_first_name: string;
  student_last_name: string;
  student_phone: string | null;
  student_email: string | null;
  performance_rating: number | null;
  latest_note: string | null;
}

export interface ScheduleSlot {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  max_bookings: number;
  current_bookings: number;
  lesson_type_name: string | null;
  vehicle_registration: string | null;
  vehicle_model: string | null;
  bookings: BookingDetail[];
}

export interface AssignedStudent {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  target_licence_category: string;
  permit_stage: string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const instructorAppKeys = {
  all:           ['instructor-app'] as const,
  me:            (userId: string) => [...instructorAppKeys.all, 'me', userId] as const,
  schedule:      (instructorId: string, range: string) => [...instructorAppKeys.all, 'schedule', instructorId, range] as const,
  students:      (instructorId: string) => [...instructorAppKeys.all, 'students', instructorId] as const,
  studentSummary:(instructorId: string, studentId: string) => [...instructorAppKeys.all, 'student-summary', instructorId, studentId] as const,
  stats:         (instructorId: string) => [...instructorAppKeys.all, 'stats', instructorId] as const,
  timeOff:       (instructorId: string) => [...instructorAppKeys.all, 'time-off', instructorId] as const,
};

// ─── Raw Supabase row shapes (pre-mapping) ────────────────────────────────────

interface RawBookingRow {
  id: string;
  status: string;
  student_id: string;
  performance_rating: number | null;
  students: { first_name: string; last_name: string; phone: string | null; email: string | null } | null;
  booking_notes: { content: string; created_at: string }[] | null;
}

interface RawSlotRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  max_bookings: number;
  current_bookings: number;
  lesson_types: { name: string } | null;
  vehicles: { registration_number: string; model: string } | null;
  lesson_bookings: RawBookingRow[];
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function mapSlot(slot: RawSlotRow): ScheduleSlot {
  return {
    id:               slot.id,
    starts_at:        slot.starts_at,
    ends_at:          slot.ends_at,
    status:           slot.status,
    max_bookings:     slot.max_bookings,
    current_bookings: slot.current_bookings,
    lesson_type_name: slot.lesson_types?.name ?? null,
    vehicle_registration: slot.vehicles?.registration_number ?? null,
    vehicle_model:        slot.vehicles?.model ?? null,
    bookings: (slot.lesson_bookings ?? [])
      .filter(b => b.status !== 'cancelled')
      .map(b => ({
        id:                   b.id,
        status:               b.status,
        student_id:           b.student_id,
        student_first_name:   b.students?.first_name ?? '',
        student_last_name:    b.students?.last_name  ?? '',
        student_phone:        b.students?.phone ?? null,
        student_email:        b.students?.email ?? null,
        performance_rating:   b.performance_rating ?? null,
        latest_note: (b.booking_notes ?? [])
          .slice()
          .sort((x, y) => y.created_at.localeCompare(x.created_at))[0]?.content ?? null,
      })),
  };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useMyInstructor() {
  const { user } = useSessionStore();
  return useQuery({
    queryKey: instructorAppKeys.me(user?.id ?? ''),
    enabled:  Boolean(user?.id),
    staleTime: 60_000,
    queryFn: async (): Promise<InstructorProfile | null> => {
      if (!user?.id || !user.organization_id) return null;
      const { data, error } = await supabase
        .from('instructors')
        .select('id, first_name, last_name, employment_type, phone, email')
        .eq('user_id', user.id)
        .eq('organization_id', user.organization_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return data as InstructorProfile | null;
    },
  });
}

// from / to are ISO date strings 'YYYY-MM-DD' (inclusive)
export function useMySchedule(
  instructorId: string | null | undefined,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: instructorAppKeys.schedule(instructorId ?? '', `${from}:${to}`),
    enabled:  Boolean(instructorId),
    staleTime: 30_000,
    queryFn: async (): Promise<ScheduleSlot[]> => {
      if (!instructorId) return [];
      const { data, error } = await supabase
        .from('lesson_slots')
        .select(`
          id, starts_at, ends_at, status, max_bookings, current_bookings,
          lesson_types(name),
          vehicles(registration_number, model),
          lesson_bookings(id, status, student_id, performance_rating, students(first_name, last_name, phone, email), booking_notes(content, created_at))
        `)
        .eq('instructor_id', instructorId)
        .gte('starts_at', `${from}T00:00:00`)
        .lte('starts_at', `${to}T23:59:59`)
        .neq('status', 'cancelled')
        .order('starts_at');
      if (error) throw error;
      return ((data ?? []) as unknown as RawSlotRow[]).map(mapSlot);
    },
  });
}

export function useMyStudents(instructorId: string | null | undefined) {
  return useQuery({
    queryKey: instructorAppKeys.students(instructorId ?? ''),
    enabled:  Boolean(instructorId),
    staleTime: 60_000,
    queryFn: async (): Promise<AssignedStudent[]> => {
      if (!instructorId) return [];
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, phone, email, status, target_licence_category, permit_stage')
        .eq('assigned_instructor_id', instructorId)
        .is('deleted_at', null)
        .order('last_name');
      if (error) throw error;
      return (data ?? []) as AssignedStudent[];
    },
  });
}

export interface StudentLessonSummary {
  completed:  number;
  no_show:    number;
  upcoming:   number;
  avg_rating: number | null;
}

export function useStudentSummary(
  instructorId: string | null | undefined,
  studentId:    string | null | undefined,
) {
  return useQuery({
    queryKey: instructorAppKeys.studentSummary(instructorId ?? '', studentId ?? ''),
    enabled:  Boolean(instructorId && studentId),
    staleTime: 60_000,
    queryFn: async (): Promise<StudentLessonSummary> => {
      if (!instructorId || !studentId) {
        return { completed: 0, no_show: 0, upcoming: 0, avg_rating: null };
      }
      const { data, error } = await supabase
        .from('lesson_bookings')
        .select('status, performance_rating, lesson_slots!inner(starts_at)')
        .eq('student_id', studentId)
        .neq('status', 'cancelled');
      if (error) throw error;

      interface Row {
        status:             string;
        performance_rating: number | null;
        lesson_slots:       { starts_at: string } | null;
      }
      const rows = (data ?? []) as unknown as Row[];
      const now  = new Date().toISOString();
      let completed = 0, no_show = 0, upcoming = 0;
      const ratings: number[] = [];

      for (const row of rows) {
        if (row.status === 'completed') {
          completed++;
          if (row.performance_rating !== null && row.performance_rating > 0) {
            ratings.push(row.performance_rating);
          }
        } else if (row.status === 'no_show') {
          no_show++;
        } else if ((row.lesson_slots?.starts_at ?? '') > now) {
          upcoming++;
        }
      }

      const avg_rating = ratings.length > 0
        ? Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10
        : null;

      return { completed, no_show, upcoming, avg_rating };
    },
  });
}

// PORTALS V1.1 Phase 3: instructor lesson context — one aggregated,
// read-only fetch instead of assembling this view from several independent
// queries. Backend does all authorization (resolveInstructorVisibleStudentIds)
// and organization scoping; the frontend just renders whatever comes back.
export interface LessonContextLastLesson {
  lesson_type_name:          string | null;
  starts_at:                 string;
  status:                    string;
  instructor_first_name:     string | null;
  instructor_last_name:      string | null;
  performance_rating:        number | null;
  evaluation_outcome:        string | null;
  evaluation_strengths:      string | null;
  evaluation_improvements:   string | null;
  evaluation_recommendation: string | null;
}

export interface LessonContextAssessment {
  competencies: Record<string, string>;
  readiness:    Record<string, boolean>;
  notes:        string | null;
  assessed_at:  string;
}

export interface LessonContextNote {
  content:    string;
  created_at: string;
}

export interface LessonContextPackage {
  package_name:    string;
  lesson_category: string;
  remaining:       number;
  status:          string;
  expires_at:      string | null;
}

export interface LessonContextNextLesson {
  starts_at:         string;
  ends_at:           string;
  status:            string;
  lesson_type_name:  string | null;
}

export interface LessonContextVehicle {
  registration_number: string;
  make:                string;
  model:               string;
}

export interface LessonContext {
  progress: {
    permit_stage:        string;
    risk1_completed_at:  string | null;
    risk2_completed_at:  string | null;
    theory_passed_at:    string | null;
    practical_passed_at: string | null;
  };
  last_lesson:     LessonContextLastLesson | null;
  last_assessment: LessonContextAssessment | null;
  notes:           LessonContextNote[];
  package:         LessonContextPackage | null;
  next_lesson:     LessonContextNextLesson | null;
  vehicle:         LessonContextVehicle | null;
}

export function useLessonContext(studentId: string | null | undefined) {
  return useQuery({
    queryKey: [...instructorAppKeys.all, 'lesson-context', studentId ?? ''],
    enabled:  Boolean(studentId),
    staleTime: 30_000,
    queryFn: async (): Promise<LessonContext | null> => {
      if (!studentId) return null;
      const { data, error } = await supabase.functions.invoke<{ data: LessonContext }>(
        `students/${studentId}/lesson-context`,
        { method: 'GET' },
      );
      if (error) throw error;
      return data?.data ?? null;
    },
  });
}

export type AttendanceStatus = 'completed' | 'no_show' | 'confirmed';

export function useMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: AttendanceStatus }) => {
      const { data, error } = await supabase.functions.invoke<{ data: unknown }>(`bookings/${bookingId}`, {
        method: 'PATCH',
        body: { status },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: instructorAppKeys.all });
    },
  });
}

export function useAddBookingNote() {
  return useMutation({
    mutationFn: async ({ bookingId, content }: { bookingId: string; content: string }) => {
      const { data, error } = await supabase.functions.invoke<{ data: unknown }>(`bookings/${bookingId}/notes`, {
        method: 'POST',
        body: { content, is_internal: false },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useSetBookingFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, rating, notes }: { bookingId: string; rating?: number | undefined; notes?: string | undefined }) => {
      const body: Record<string, unknown> = {};
      if (rating !== undefined) body['performance_rating'] = rating;
      if (notes  !== undefined) body['instructor_notes']   = notes;
      const { data, error } = await supabase.functions.invoke<{ data: unknown }>(`bookings/${bookingId}/feedback`, {
        method: 'PATCH',
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: instructorAppKeys.all });
    },
  });
}

// ─── Instructor statistics ────────────────────────────────────────────────────

export interface InstructorStats {
  total_completed: number;
  total_no_show:   number;
  total_hours:     number;
  avg_rating:      number | null;
  month_completed: number;
  month_hours:     number;
}

const EMPTY_STATS: InstructorStats = {
  total_completed: 0, total_no_show: 0, total_hours: 0,
  avg_rating: null,   month_completed: 0, month_hours: 0,
};

export function useInstructorStats(
  instructorId:   string | null | undefined,
  organizationId: string | null | undefined,
) {
  return useQuery({
    queryKey: instructorAppKeys.stats(instructorId ?? ''),
    enabled:  Boolean(instructorId && organizationId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<InstructorStats> => {
      if (!instructorId || !organizationId) return EMPTY_STATS;

      const { data, error } = await supabase
        .from('lesson_slots')
        .select('starts_at, ends_at, lesson_bookings(status, performance_rating)')
        .eq('instructor_id', instructorId)
        .eq('organization_id', organizationId)
        .is('deleted_at', null);

      if (error) throw error;

      interface BRow { status: string; performance_rating: number | null }
      interface SRow { starts_at: string; ends_at: string; lesson_bookings: BRow[] }

      const slots = (data ?? []) as unknown as SRow[];
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStr = monthStart.toISOString();

      let total_completed = 0, total_no_show = 0, total_hours = 0;
      let month_completed = 0, month_hours = 0;
      const ratings: number[] = [];

      for (const slot of slots) {
        const duration = (new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 3_600_000;
        const isThisMonth = slot.starts_at >= monthStr;
        for (const b of (slot.lesson_bookings ?? [])) {
          if (b.status === 'completed') {
            total_completed++;
            total_hours += duration;
            if (b.performance_rating !== null) ratings.push(b.performance_rating);
            if (isThisMonth) { month_completed++; month_hours += duration; }
          } else if (b.status === 'no_show') {
            total_no_show++;
          }
        }
      }

      const avg_rating = ratings.length > 0
        ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
        : null;

      return {
        total_completed,
        total_no_show,
        total_hours:    Math.round(total_hours * 10) / 10,
        avg_rating,
        month_completed,
        month_hours:    Math.round(month_hours * 10) / 10,
      };
    },
  });
}

// ─── Instructor time-off ──────────────────────────────────────────────────────

export interface TimeOffEntry {
  id:            string;
  time_off_type: string;
  status:        string;
  starts_at:     string;
  ends_at:       string;
  is_full_day:   boolean;
  reason:        string | null;
}

export function useInstructorTimeOff(instructorId: string | null | undefined) {
  const { user } = useSessionStore();
  return useQuery({
    queryKey: instructorAppKeys.timeOff(instructorId ?? ''),
    enabled:  Boolean(instructorId && user?.organization_id),
    staleTime: 60_000,
    queryFn: async (): Promise<TimeOffEntry[]> => {
      if (!instructorId || !user?.organization_id) return [];
      const { data, error } = await supabase
        .from('instructor_time_off')
        .select('id, time_off_type, status, starts_at, ends_at, is_full_day, reason')
        .eq('instructor_id', instructorId)
        .eq('organization_id', user.organization_id)
        .in('status', ['pending', 'approved'])
        .gte('ends_at', new Date().toISOString())
        .order('starts_at')
        .limit(20);
      if (error) throw error;
      return (data ?? []) as TimeOffEntry[];
    },
  });
}

export function useCreateTimeOff() {
  const { user } = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      instructorId:  string;
      time_off_type: string;
      starts_at:     string;
      ends_at:       string;
      reason?:       string | undefined;
    }) => {
      if (!user?.organization_id || !user?.id) throw new Error('Ingen aktiv session');
      const { data, error } = await supabase
        .from('instructor_time_off')
        .insert({
          organization_id: user.organization_id,
          instructor_id:   input.instructorId,
          time_off_type:   input.time_off_type,
          status:          'approved',
          starts_at:       input.starts_at,
          ends_at:         input.ends_at,
          is_full_day:     true,
          reason:          input.reason ?? null,
          approved_by:     user.id,
          approved_at:     new Date().toISOString(),
          created_by:      user.id,
        } as never)
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: instructorAppKeys.timeOff(variables.instructorId) });
    },
  });
}

export function useCancelTimeOff() {
  const { user } = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, instructorId }: { entryId: string; instructorId: string }) => {
      if (!user?.organization_id) throw new Error('Ingen aktiv session');
      const { error } = await supabase
        .from('instructor_time_off')
        .update({ status: 'cancelled', updated_by: user.id } as never)
        .eq('id', entryId)
        .eq('instructor_id', instructorId)
        .eq('organization_id', user.organization_id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: instructorAppKeys.timeOff(variables.instructorId) });
    },
  });
}
