import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthPoint { label: string; month: number; count: number }

export interface CategoryStat {
  category: string;
  current: number;
  prevMonth: number;
  prevYear: number;
  pctMonth: number | null;
  pctYear: number | null;
}

export interface TrendsData {
  totalActive: number;
  prevMonthTotal: number;
  prevYearTotal: number;
  pctMonth: number | null;
  pctYear: number | null;
  monthPoints: MonthPoint[];
  categoryStats: CategoryStat[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SV_MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function pct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

// ─── Key ──────────────────────────────────────────────────────────────────────

export const trendsKey = (year: number, month: number) =>
  ['insights', 'trends', year, month] as const;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useInsightsTrends(year: number, month: number) {
  return useQuery({
    queryKey: trendsKey(year, month),
    queryFn: async (): Promise<TrendsData> => {
      // Fetch all non-deleted students with enrolled_at or created_at
      const { data, error } = await (supabase as unknown as any)
        .from('students')
        .select('id, target_licence_category, status, enrolled_at, created_at, deleted_at')
        .is('deleted_at', null)
        .not('status', 'in', '("archived","withdrawn")');

      if (error) throw new Error(error.message);

      const students = (data ?? []) as {
        id: string;
        target_licence_category: string;
        status: string;
        enrolled_at: string | null;
        created_at: string;
        deleted_at: string | null;
      }[];

      // For counting "active at end of month M":
      // A student is active at end of month M if they were enrolled before end of M
      function countActiveAtMonth(y: number, m: number): number {
        const endOfMonth = new Date(y, m, 0, 23, 59, 59); // day 0 = last day of previous month
        return students.filter((s) => {
          const enrollDate = new Date(s.enrolled_at ?? s.created_at);
          return enrollDate <= endOfMonth;
        }).length;
      }

      // Monthly points for the selected year (up to current month or selected month)
      const now        = new Date();
      const maxMonth   = year === now.getFullYear() ? now.getMonth() + 1 : 12;
      const endMonth   = month === 0 ? maxMonth : Math.min(month, maxMonth);

      const monthPoints: MonthPoint[] = [];
      for (let m = 1; m <= endMonth; m++) {
        monthPoints.push({
          label: SV_MONTHS[m - 1] ?? '',
          month: m,
          count: countActiveAtMonth(year, m),
        });
      }

      // Current total active
      const totalActive = students.filter((s) =>
        ['active', 'onboarding', 'paused'].includes(s.status),
      ).length;

      // Prev month total
      const prevMonthDate = new Date(year, (month === 0 ? now.getMonth() : month) - 2, 1);
      const prevMonthTotal = countActiveAtMonth(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1);

      // Prev year same month total
      const curMonth = month === 0 ? now.getMonth() + 1 : month;
      const prevYearTotal = countActiveAtMonth(year - 1, curMonth);

      // Category stats — count per category
      const catMap = new Map<string, number>();
      for (const s of students.filter((s) => ['active', 'onboarding', 'paused'].includes(s.status))) {
        const cat = s.target_licence_category || 'Okänd';
        catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
      }

      // Previous month per category (enrolled before prev month end)
      const prevMonthEnd = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0, 23, 59, 59);
      const catMapPrev = new Map<string, number>();
      for (const s of students) {
        const enrollDate = new Date(s.enrolled_at ?? s.created_at);
        if (enrollDate <= prevMonthEnd) {
          const cat = s.target_licence_category || 'Okänd';
          catMapPrev.set(cat, (catMapPrev.get(cat) ?? 0) + 1);
        }
      }

      // Previous year same month per category
      const prevYearEnd = new Date(year - 1, curMonth, 0, 23, 59, 59);
      const catMapPrevYear = new Map<string, number>();
      for (const s of students) {
        const enrollDate = new Date(s.enrolled_at ?? s.created_at);
        if (enrollDate <= prevYearEnd) {
          const cat = s.target_licence_category || 'Okänd';
          catMapPrevYear.set(cat, (catMapPrevYear.get(cat) ?? 0) + 1);
        }
      }

      const categoryStats: CategoryStat[] = [...catMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([cat, current]) => {
          const pm = catMapPrev.get(cat) ?? 0;
          const py = catMapPrevYear.get(cat) ?? 0;
          return {
            category:  cat,
            current,
            prevMonth: pm,
            prevYear:  py,
            pctMonth:  pct(current, pm),
            pctYear:   pct(current, py),
          };
        });

      return {
        totalActive,
        prevMonthTotal,
        prevYearTotal,
        pctMonth: pct(totalActive, prevMonthTotal),
        pctYear:  pct(totalActive, prevYearTotal),
        monthPoints,
        categoryStats,
      };
    },
    staleTime: 120_000,
  });
}
