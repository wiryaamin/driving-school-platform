import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookingLogFilter = 'all' | 'booked' | 'cancelled';

export interface BookingLogEntry {
  id: string; kalla: string; datum: string; handelse: string;
  tillfalle: string; larare: string; utford: string; status: string;
  elev: string; lektionstyp: string; fordon: string | null;
  plats: string | null; avbokningsorsak: string | null;
}

export interface CommunicationLogEntry {
  id: string; datum: string; kanal: string; kanal_raw: string;
  status: string; status_raw: string; amne: string;
  skickad_av: string; skickad_till: string; typ: string;
}

export interface ActivityLogEntry {
  id: string; datum: string; kund: string; email: string; typ: string;
  entity_type: string | null; entity_id: string | null; modul: string;
}

export interface MissedTrainingEntry {
  id: string; kund: string; larare: string; tidslucka: string;
  datum: string; bokning_id: string;
}

export interface MissedExamEntry {
  id: string; kund: string; larare: string; tidslucka: string;
  datum: string; typ: string; bokning_id: string;
}

export interface AuditLogEntry {
  id: string; datum: string; handelse: string; anvandare: string; modul: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE'; entity_id: string | null;
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null;
}

interface LogMeta {
  total: number; page: number; per_page: number; has_more: boolean;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const logKeys = {
  bookingLogs:    (p: object) => ['logs', 'bookings',        p] as const,
  communications: (p: object) => ['logs', 'communications',  p] as const,
  activities:     (p: object) => ['logs', 'activities',      p] as const,
  missedTraining: (p: object) => ['logs', 'missed-training', p] as const,
  missedExams:    (p: object) => ['logs', 'missed-exams',    p] as const,
  auditLog:       (orgId: string | undefined, p: object) => ['logs', 'audit', orgId, p] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useBookingLogs(
  params: { filter?: BookingLogFilter | undefined; page?: number | undefined; per_page?: number | undefined } = {},
) {
  const { filter = 'all', page = 1, per_page = 50 } = params;
  return useQuery({
    queryKey: logKeys.bookingLogs(params),
    queryFn: async () => {
      const sp = new URLSearchParams({ filter, page: String(page), per_page: String(per_page) });
      const { data, error } = await supabase.functions.invoke<{ data: BookingLogEntry[]; meta: LogMeta }>(
        `logs/bookings?${sp.toString()}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [] as BookingLogEntry[], meta: { total: 0, page, per_page, has_more: false } };
    },
    staleTime: 30_000,
  });
}

export function useCommunicationLogs(
  params: { channel?: string | undefined; status?: string | undefined; page?: number | undefined; per_page?: number | undefined } = {},
) {
  const { channel = 'all', status = 'all', page = 1, per_page = 50 } = params;
  return useQuery({
    queryKey: logKeys.communications(params),
    queryFn: async () => {
      const sp = new URLSearchParams({ channel, status, page: String(page), per_page: String(per_page) });
      const { data, error } = await supabase.functions.invoke<{ data: CommunicationLogEntry[]; meta: LogMeta }>(
        `logs/communications?${sp.toString()}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [] as CommunicationLogEntry[], meta: { total: 0, page, per_page, has_more: false } };
    },
    staleTime: 30_000,
  });
}

export function useActivityLogs(
  params: {
    page?: number | undefined; per_page?: number | undefined;
    entity_type?: string | undefined; date_from?: string | undefined; date_to?: string | undefined;
  } = {},
) {
  const { page = 1, per_page = 50, entity_type, date_from, date_to } = params;
  return useQuery({
    queryKey: logKeys.activities(params),
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), per_page: String(per_page) });
      if (entity_type) sp.set('entity_type', entity_type);
      if (date_from)   sp.set('date_from', date_from);
      if (date_to)     sp.set('date_to', date_to);
      const { data, error } = await supabase.functions.invoke<{ data: ActivityLogEntry[]; meta: LogMeta }>(
        `logs/activities?${sp.toString()}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [] as ActivityLogEntry[], meta: { total: 0, page, per_page, has_more: false } };
    },
    staleTime: 30_000,
  });
}

export function useMissedTrainingLogs(
  params: { instructor_id?: string | undefined; lesson_type_id?: string | undefined; page?: number | undefined; per_page?: number | undefined } = {},
) {
  const { instructor_id, lesson_type_id, page = 1, per_page = 50 } = params;
  return useQuery({
    queryKey: logKeys.missedTraining(params),
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), per_page: String(per_page) });
      if (instructor_id)  sp.set('instructor_id',  instructor_id);
      if (lesson_type_id) sp.set('lesson_type_id', lesson_type_id);
      const { data, error } = await supabase.functions.invoke<{ data: MissedTrainingEntry[]; meta: LogMeta }>(
        `logs/missed-training?${sp.toString()}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [] as MissedTrainingEntry[], meta: { total: 0, page, per_page, has_more: false } };
    },
    staleTime: 30_000,
  });
}

export interface AuditLogFilters {
  actor_email?: string | undefined; entity_type?: string | undefined; operation?: string | undefined;
  date_from?: string | undefined; date_to?: string | undefined;
  page?: number | undefined; per_page?: number | undefined;
}

/**
 * Ändringslogg (audit_logs), tenant-scoped. The organization is always
 * server-derived from the caller's own JWT (ctx.organizationId in the Edge
 * Function) — there is no org parameter here and none can be supplied by the
 * frontend. organization.id is included in the query key purely so a tenant
 * switch (which mints a new JWT) invalidates the cache instead of showing
 * the previous organization's rows until staleTime elapses.
 */
export function useTenantAuditLog(params: AuditLogFilters = {}) {
  const { organization } = useSession();
  const { actor_email, entity_type, operation, date_from, date_to, page = 1, per_page = 50 } = params;
  return useQuery({
    queryKey: logKeys.auditLog(organization?.id, params),
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), per_page: String(per_page) });
      if (actor_email) sp.set('actor_email', actor_email);
      if (entity_type) sp.set('entity_type', entity_type);
      if (operation)   sp.set('operation', operation);
      if (date_from)   sp.set('date_from', date_from);
      if (date_to)     sp.set('date_to', date_to);
      const { data, error } = await supabase.functions.invoke<{ data: AuditLogEntry[]; meta: LogMeta }>(
        `logs/audit?${sp.toString()}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [] as AuditLogEntry[], meta: { total: 0, page, per_page, has_more: false } };
    },
    enabled: !!organization?.id,
    staleTime: 30_000,
  });
}

export function useMissedExamLogs(
  params: { instructor_id?: string | undefined; category?: string | undefined; page?: number | undefined; per_page?: number | undefined } = {},
) {
  const { instructor_id, category = 'all', page = 1, per_page = 25 } = params;
  return useQuery({
    queryKey: logKeys.missedExams(params),
    queryFn: async () => {
      const sp = new URLSearchParams({ category, page: String(page), per_page: String(per_page) });
      if (instructor_id) sp.set('instructor_id', instructor_id);
      const { data, error } = await supabase.functions.invoke<{ data: MissedExamEntry[]; meta: LogMeta }>(
        `logs/missed-exams?${sp.toString()}`, { method: 'GET' },
      );
      if (error) throw error;
      return data ?? { data: [] as MissedExamEntry[], meta: { total: 0, page, per_page, has_more: false } };
    },
    staleTime: 30_000,
  });
}
