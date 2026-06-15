import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Transformation helpers ────────────────────────────────────────────────────

interface NameRow { first_name: string; last_name: string }

function fullName(r: NameRow | null | undefined): string {
  if (!r) return '—';
  return `${r.first_name} ${r.last_name}`.trim();
}

function buildHandelse(
  status: string,
  studentName: string,
  instructorName: string,
  cancellationCategory: string | null,
): string {
  if (status === 'confirmed' || status === 'reserved') return `${studentName} inbokad av ${instructorName}`;
  if (status === 'completed')  return `${studentName} — lektion genomförd av ${instructorName}`;
  if (status === 'cancelled') {
    if (cancellationCategory === 'student_request') return `${studentName} avbokade sig`;
    return `${studentName} avbokades av ${instructorName}`;
  }
  if (status === 'no_show')    return `${studentName} uteblev (${instructorName})`;
  if (status === 'rescheduled') return `${studentName} — ombokas av ${instructorName}`;
  return `${studentName} — ${status}`;
}

function buildTillfalle(lessonTypeName: string, startsAt: string, endsAt: string): string {
  try {
    const tz = 'Europe/Stockholm';
    const s = new Date(startsAt), e = new Date(endsAt);
    const dayRaw  = s.toLocaleDateString('sv-SE', { weekday: 'long', timeZone: tz });
    const dateStr = s.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
    const st = s.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    const et = e.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    return `${lessonTypeName} (${dayRaw.charAt(0).toUpperCase() + dayRaw.slice(1)} ${dateStr} ${st} - ${et})`;
  } catch { return lessonTypeName; }
}

function channelToLabel(ch: string): string {
  if (ch === 'email') return 'E-post';
  if (ch === 'sms')   return 'SMS';
  if (ch === 'push')  return 'Push';
  return ch;
}

function notifStatusToLabel(st: string): string {
  if (st === 'sent')      return 'Levererad';
  if (st === 'failed')    return 'Misslyckad';
  if (st === 'pending')   return 'Väntar';
  if (st === 'sending')   return 'Skickas';
  if (st === 'cancelled') return 'Avbruten';
  return st;
}

function templateKeyToLabel(key: string): string {
  const MAP: Record<string, string> = {
    booking_confirmation: 'Bokningsbekräftelse',
    booking_reminder:     'Bokningspåminnelse',
    lesson_reminder:      'Bokningspåminnelse',
    password_reset:       'Nytt lösenord',
    welcome:              'Välkommen',
    slot_available:       'Ledig tid',
    waitlist_promotion:   'Väntelistebefordran',
    cancellation:         'Avbokning',
  };
  return MAP[key] ?? key;
}

function makeMeta(count: number | null, page: number, perPage: number) {
  const total = count ?? 0;
  return { total, page, per_page: perPage, has_more: page * perPage < total };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookingLogFilter = 'all' | 'booked' | 'cancelled';

export interface BookingLogEntry {
  id: string; kalla: string; datum: string; handelse: string;
  tillfalle: string; larare: string; utford: string; status: string;
}

export interface CommunicationLogEntry {
  id: string; datum: string; kanal: string; kanal_raw: string;
  status: string; status_raw: string; amne: string;
  skickad_av: string; skickad_till: string; typ: string;
}

export interface ActivityLogEntry {
  id: string; datum: string; kund: string; email: string; typ: string;
}

export interface MissedTrainingEntry {
  id: string; kund: string; larare: string; tidslucka: string;
  datum: string; bokning_id: string;
}

export interface MissedExamEntry {
  id: string; kund: string; larare: string; tidslucka: string;
  datum: string; typ: string; bokning_id: string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const logKeys = {
  bookingLogs:    (p: object) => ['logs', 'bookings',        p] as const,
  communications: (p: object) => ['logs', 'communications',  p] as const,
  activities:     (p: object) => ['logs', 'activities',      p] as const,
  missedTraining: (p: object) => ['logs', 'missed-training', p] as const,
  missedExams:    (p: object) => ['logs', 'missed-exams',    p] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useBookingLogs(
  params: { filter?: BookingLogFilter; page?: number; per_page?: number } = {},
) {
  const { filter = 'all', page = 1, per_page = 50 } = params;
  return useQuery({
    queryKey: logKeys.bookingLogs(params),
    queryFn: async () => {
      const from = (page - 1) * per_page;
      const to   = from + per_page - 1;

      // eslint-disable-next-line prefer-const
      let q = (supabase as unknown as any)
        .from('lesson_bookings')
        .select(
          `id, status, created_at, starts_at, ends_at, cancellation_category,
           students ( first_name, last_name ),
           instructors ( first_name, last_name ),
           lesson_types ( name )`,
          { count: 'exact' },
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filter === 'booked')    q = q.in('status', ['confirmed', 'reserved', 'completed']);
      if (filter === 'cancelled') q = q.eq('status', 'cancelled');

      const { data, count, error } = await q;
      if (error) throw new Error(error.message);

      const mapped: BookingLogEntry[] = (data ?? []).map((b: {
        id: string; status: string; created_at: string; starts_at: string; ends_at: string;
        cancellation_category: string | null; students: NameRow | null;
        instructors: NameRow | null; lesson_types: { name: string } | null;
      }) => ({
        id:        b.id,
        kalla:     'A',
        datum:     b.created_at,
        handelse:  buildHandelse(b.status, fullName(b.students), fullName(b.instructors), b.cancellation_category),
        tillfalle: buildTillfalle(b.lesson_types?.name ?? '', b.starts_at, b.ends_at),
        larare:    fullName(b.instructors),
        utford:    fullName(b.instructors),
        status:    b.status,
      }));

      return { data: mapped, meta: makeMeta(count, page, per_page) };
    },
    refetchOnMount: 'always',
    staleTime: 30_000,
  });
}

export function useCommunicationLogs(
  params: { channel?: string; status?: string; page?: number; per_page?: number } = {},
) {
  const { channel, status, page = 1, per_page = 50 } = params;
  return useQuery({
    queryKey: logKeys.communications(params),
    queryFn: async () => {
      const from = (page - 1) * per_page;
      const to   = from + per_page - 1;

      // eslint-disable-next-line prefer-const
      let q = (supabase as unknown as any)
        .from('notifications')
        .select(
          'id, created_at, channel, status, template_key, subject, metadata, recipient_id, recipient_type',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range(from, to);

      if (channel && channel !== 'all') q = q.eq('channel', channel);
      if (status  && status  !== 'all') q = q.eq('status',  status);

      const { data: notifs, count, error } = await q;
      if (error) throw new Error(error.message);

      const mapped: CommunicationLogEntry[] = (notifs ?? []).map((n: {
        id: string; created_at: string; channel: string; status: string;
        template_key: string; subject: string | null;
        metadata: Record<string, string> | null;
        recipient_id: string; recipient_type: string;
      }) => {
        const meta = n.metadata ?? {};
        return {
          id:           n.id,
          datum:        n.created_at,
          kanal:        channelToLabel(n.channel),
          kanal_raw:    n.channel,
          status:       notifStatusToLabel(n.status),
          status_raw:   n.status,
          amne:         n.subject ?? '—',
          skickad_av:   meta['sent_by_name'] ?? meta['sender'] ?? 'System',
          skickad_till: meta['to'] ?? '—',
          typ:          templateKeyToLabel(n.template_key),
        };
      });

      return { data: mapped, meta: makeMeta(count, page, per_page) };
    },
    refetchOnMount: 'always',
    staleTime: 30_000,
  });
}

export function useActivityLogs(params: { page?: number; per_page?: number } = {}) {
  const { page = 1, per_page = 50 } = params;
  return useQuery({
    queryKey: logKeys.activities(params),
    queryFn: async () => {
      const from = (page - 1) * per_page;
      const to   = from + per_page - 1;

      const { data, count, error } = await (supabase as unknown as any)
        .from('activity_logs')
        .select('id, occurred_at, user_email, action, description', { count: 'exact' })
        .order('occurred_at', { ascending: false })
        .range(from, to);

      if (error) throw new Error(error.message);

      const mapped: ActivityLogEntry[] = (data ?? []).map((l: {
        id: string; occurred_at: string; user_email: string | null;
        action: string; description: string | null;
      }) => ({
        id:    l.id,
        datum: l.occurred_at,
        kund:  l.user_email ?? '—',
        email: l.user_email ?? '—',
        typ:   l.description ?? l.action,
      }));

      return { data: mapped, meta: makeMeta(count, page, per_page) };
    },
    refetchOnMount: 'always',
    staleTime: 30_000,
  });
}

export function useMissedTrainingLogs(
  params: { instructor_id?: string; lesson_type_id?: string; page?: number; per_page?: number } = {},
) {
  const { instructor_id, lesson_type_id, page = 1, per_page = 50 } = params;
  return useQuery({
    queryKey: logKeys.missedTraining(params),
    queryFn: async () => {
      const from = (page - 1) * per_page;
      const to   = from + per_page - 1;

      // eslint-disable-next-line prefer-const
      let q = (supabase as unknown as any)
        .from('lesson_bookings')
        .select(
          `id, starts_at, ends_at,
           students ( first_name, last_name ),
           instructors ( first_name, last_name ),
           lesson_types ( name )`,
          { count: 'exact' },
        )
        .eq('status', 'no_show')
        .is('deleted_at', null)
        .order('starts_at', { ascending: false })
        .range(from, to);

      if (instructor_id)  q = q.eq('instructor_id',  instructor_id);
      if (lesson_type_id) q = q.eq('lesson_type_id', lesson_type_id);

      const { data, count, error } = await q;
      if (error) throw new Error(error.message);

      const mapped: MissedTrainingEntry[] = (data ?? []).map((b: {
        id: string; starts_at: string; ends_at: string;
        students: NameRow | null; instructors: NameRow | null;
        lesson_types: { name: string } | null;
      }) => ({
        id:         b.id,
        kund:       fullName(b.students),
        larare:     fullName(b.instructors),
        tidslucka:  b.lesson_types?.name ?? '—',
        datum:      buildTillfalle(b.lesson_types?.name ?? '', b.starts_at, b.ends_at),
        bokning_id: b.id,
      }));

      return { data: mapped, meta: makeMeta(count, page, per_page) };
    },
    refetchOnMount: 'always',
    staleTime: 30_000,
  });
}

export function useMissedExamLogs(
  params: { instructor_id?: string; category?: string; page?: number; per_page?: number } = {},
) {
  const { instructor_id, category, page = 1, per_page = 25 } = params;
  return useQuery({
    queryKey: logKeys.missedExams(params),
    queryFn: async () => {
      const from = (page - 1) * per_page;
      const to   = from + per_page - 1;

      const examCategories = !category || category === 'all'
        ? ['risk1', 'risk2', 'assessment']
        : [category];

      const { data: examTypes, error: typeErr } = await (supabase as unknown as any)
        .from('lesson_types')
        .select('id, name, category')
        .in('category', examCategories);

      if (typeErr) throw new Error(typeErr.message);

      const examTypeIds = (examTypes ?? []).map((t: { id: string }) => t.id) as string[];
      const examTypeMap = new Map<string, { name: string; category: string }>(
        (examTypes ?? []).map((t: { id: string; name: string; category: string }) => [t.id, t]),
      );

      if (examTypeIds.length === 0) {
        return { data: [] as MissedExamEntry[], meta: makeMeta(0, page, per_page) };
      }

      // eslint-disable-next-line prefer-const
      let q = (supabase as unknown as any)
        .from('lesson_bookings')
        .select(
          `id, starts_at, ends_at, lesson_type_id,
           students ( first_name, last_name ),
           instructors ( first_name, last_name )`,
          { count: 'exact' },
        )
        .in('lesson_type_id', examTypeIds)
        .in('status', ['confirmed', 'completed', 'no_show'])
        .is('deleted_at', null)
        .order('starts_at', { ascending: false })
        .range(from, to);

      if (instructor_id) q = q.eq('instructor_id', instructor_id);

      const { data, count, error } = await q;
      if (error) throw new Error(error.message);

      const mapped: MissedExamEntry[] = (data ?? []).map((b: {
        id: string; starts_at: string; ends_at: string; lesson_type_id: string;
        students: NameRow | null; instructors: NameRow | null;
      }) => {
        const lt = examTypeMap.get(b.lesson_type_id);
        return {
          id:         b.id,
          kund:       fullName(b.students),
          larare:     fullName(b.instructors),
          tidslucka:  lt?.name ?? '—',
          datum:      buildTillfalle(lt?.name ?? '', b.starts_at, b.ends_at),
          typ:        lt?.name ?? '—',
          bokning_id: b.id,
        };
      });

      return { data: mapped, meta: makeMeta(count, page, per_page) };
    },
    refetchOnMount: 'always',
    staleTime: 30_000,
  });
}
