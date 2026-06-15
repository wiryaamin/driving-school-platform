import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import type { PermitStage } from '@platform/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClassListEntry {
  id: string;
  first_name: string;
  last_name: string;
  leg: string;
  kkt: boolean;
  slutprov: boolean;
  risk1_done: boolean;
  risk2_done: boolean;
  bokningar: number;
  utbildad_tid_min: number;
  permit_stage: PermitStage;
}

export interface ClassListParams {
  licence_category?: string;
  page?: number;
  per_page?: number;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const classListKeys = {
  all:   ['classlist'] as const,
  lists: () => [...classListKeys.all, 'list'] as const,
  list:  (p: ClassListParams) => [...classListKeys.lists(), p] as const,
  licenceCategories: () => [...classListKeys.all, 'licence-categories'] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

interface RawStudent {
  id: string;
  first_name: string;
  last_name: string;
  target_licence_category: string;
  permit_stage: PermitStage;
  risk1_completed_at: string | null;
  risk2_completed_at: string | null;
  theory_passed_at: string | null;
}

interface RawBookingCount {
  student_id: string;
  count: number;
  total_min: number;
}

export function useClassList(params: ClassListParams = {}) {
  const { licence_category, page = 1, per_page = 50 } = params;

  return useQuery({
    queryKey: classListKeys.list(params),
    queryFn: async (): Promise<{ data: ClassListEntry[]; total: number }> => {
      const from = (page - 1) * per_page;
      const to   = from + per_page - 1;

      // eslint-disable-next-line prefer-const
      let q = (supabase as unknown as any)
        .from('students')
        .select(
          'id, first_name, last_name, target_licence_category, permit_stage, risk1_completed_at, risk2_completed_at, theory_passed_at',
          { count: 'exact' },
        )
        .is('deleted_at', null)
        .in('status', ['active', 'onboarding', 'paused', 'completed'])
        .order('first_name', { ascending: true })
        .range(from, to);

      if (licence_category && licence_category !== 'all') {
        q = q.eq('target_licence_category', licence_category);
      }

      const { data: students, count, error } = await q;
      if (error) throw new Error(error.message);

      const studentIds: string[] = (students ?? []).map((s: RawStudent) => s.id);

      // Fetch booking counts + training time for these students in one query
      let bookingMap = new Map<string, RawBookingCount>();
      if (studentIds.length > 0) {
        const { data: bookings, error: bErr } = await (supabase as unknown as any)
          .from('lesson_bookings')
          .select('student_id, starts_at, ends_at')
          .in('student_id', studentIds)
          .in('status', ['confirmed', 'completed'])
          .is('deleted_at', null);

        if (!bErr && bookings) {
          for (const b of bookings as { student_id: string; starts_at: string; ends_at: string }[]) {
            const sid = b.student_id;
            const existing = bookingMap.get(sid) ?? { student_id: sid, count: 0, total_min: 0 };
            const mins = (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000;
            bookingMap.set(sid, {
              student_id: sid,
              count:      existing.count + 1,
              total_min:  existing.total_min + Math.max(0, mins),
            });
          }
        }
      }

      const mapped: ClassListEntry[] = (students ?? []).map((s: RawStudent) => {
        const bk = bookingMap.get(s.id);
        return {
          id:               s.id,
          first_name:       s.first_name,
          last_name:        s.last_name,
          leg:              s.target_licence_category || '—',
          kkt:              s.permit_stage !== 'not_started',
          slutprov:         s.theory_passed_at !== null,
          risk1_done:       s.risk1_completed_at !== null,
          risk2_done:       s.risk2_completed_at !== null,
          bokningar:        bk?.count ?? 0,
          utbildad_tid_min: bk?.total_min ?? 0,
          permit_stage:     s.permit_stage,
        };
      });

      return { data: mapped, total: count ?? 0 };
    },
    staleTime: 60_000,
    refetchOnMount: 'always',
  });
}

export function useLicenceCategories() {
  return useQuery({
    queryKey: classListKeys.licenceCategories(),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as unknown as any)
        .from('students')
        .select('target_licence_category')
        .is('deleted_at', null)
        .not('target_licence_category', 'is', null);

      if (error) return [];
      const unique = [...new Set(
        (data ?? []).map((s: { target_licence_category: string }) => s.target_licence_category).filter(Boolean),
      )] as string[];
      return unique.sort();
    },
    staleTime: 300_000,
  });
}
