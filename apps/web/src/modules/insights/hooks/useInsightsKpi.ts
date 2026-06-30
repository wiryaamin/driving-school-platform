import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSessionStore } from '@core/store/session.store.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InstructorUtilization {
  id:             string;
  name:           string;
  hoursTaught:    number;
  completedCount: number;
  noShowCount:    number;
}

export interface KpiData {
  noShowRate: {
    completed: number;
    noShows:   number;
    rate:      number;
  };
  revenueTrend: {
    label: string;
    value: number;
  }[];
  instructorUtilization: InstructorUtilization[];
  examPassRates: {
    totalStudents:   number;
    theoryPassed:    number;
    practicalPassed: number;
    theoryRate:      number;
    practicalRate:   number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthLabel(date: Date): string {
  return date.toLocaleDateString('sv-SE', { month: 'short', year: '2-digit' });
}

function durationHours(startsAt: string, endsAt: string): number {
  return (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000;
}

// ─── Query key ────────────────────────────────────────────────────────────────

export const insightsKpiKeys = {
  all: ['insights', 'kpi'] as const,
  kpi: (orgId: string) => [...insightsKpiKeys.all, orgId] as const,
};

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useInsightsKpi() {
  const { user } = useSessionStore();
  const orgId = user?.organization_id ?? '';

  return useQuery({
    queryKey: insightsKpiKeys.kpi(orgId),
    enabled:  Boolean(orgId),
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<KpiData> => {
      const now        = new Date();
      const since30d   = new Date(now.getTime() -  30 * 86_400_000).toISOString();
      const since90d   = new Date(now.getTime() -  90 * 86_400_000).toISOString();
      const since180d  = new Date(now.getTime() - 180 * 86_400_000).toISOString();

      // ── 1. No-show rate (last 30 days) ─────────────────────────────────────
      const [completedRes, noShowRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as unknown as any)
          .from('lesson_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'completed')
          .gte('starts_at', since30d)
          .is('deleted_at', null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as unknown as any)
          .from('lesson_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'no_show')
          .gte('starts_at', since30d)
          .is('deleted_at', null),
      ]);

      const completedCount = completedRes.count ?? 0;
      const noShowCount    = noShowRes.count    ?? 0;
      const totalAttended  = completedCount + noShowCount;
      const noShowRate     = totalAttended > 0
        ? Math.round((noShowCount / totalAttended) * 1000) / 10
        : 0;

      // ── 2. Revenue trend (last 6 months, grouped by month) ─────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: paymentsRaw } = await (supabase as unknown as any)
        .from('payments')
        .select('amount, paid_at')
        .eq('organization_id', orgId)
        .not('paid_at', 'is', null)
        .is('void_at', null)
        .gte('paid_at', since180d)
        .limit(1000);

      // Build an ordered month map for the last 6 complete months + current
      const monthMap = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthMap.set(monthLabel(d), 0);
      }
      for (const p of (paymentsRaw ?? []) as { amount: number; paid_at: string }[]) {
        if (!p.paid_at) continue;
        const key = monthLabel(new Date(p.paid_at));
        if (monthMap.has(key)) {
          monthMap.set(key, (monthMap.get(key) ?? 0) + Number(p.amount));
        }
      }
      const revenueTrend = Array.from(monthMap.entries()).map(([label, value]) => ({
        label,
        value: Math.round(value),
      }));

      // ── 3. Instructor utilization (last 90 days) ────────────────────────────
      const [bookingsRaw, instructorsRaw] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as unknown as any)
          .from('lesson_bookings')
          .select('instructor_id, status, starts_at, ends_at')
          .eq('organization_id', orgId)
          .in('status', ['completed', 'no_show'])
          .gte('starts_at', since90d)
          .is('deleted_at', null)
          .limit(2000),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as unknown as any)
          .from('instructors')
          .select('id, first_name, last_name')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .neq('status', 'terminated'),
      ]);

      const instructorMap = new Map<string, { first_name: string; last_name: string }>(
        ((instructorsRaw.data ?? []) as { id: string; first_name: string; last_name: string }[])
          .map(i => [i.id, { first_name: i.first_name, last_name: i.last_name }])
      );

      const utilMap = new Map<string, { completed: number; noShow: number; hours: number }>();
      for (const b of (bookingsRaw.data ?? []) as { instructor_id: string; status: string; starts_at: string; ends_at: string }[]) {
        const cur = utilMap.get(b.instructor_id) ?? { completed: 0, noShow: 0, hours: 0 };
        if (b.status === 'completed') {
          cur.completed++;
          cur.hours += durationHours(b.starts_at, b.ends_at);
        } else {
          cur.noShow++;
        }
        utilMap.set(b.instructor_id, cur);
      }

      const instructorUtilization: InstructorUtilization[] = Array.from(utilMap.entries())
        .map(([id, stats]) => {
          const info = instructorMap.get(id);
          return {
            id,
            name:           info ? `${info.first_name} ${info.last_name}` : 'Okänd instruktör',
            hoursTaught:    Math.round(stats.hours * 10) / 10,
            completedCount: stats.completed,
            noShowCount:    stats.noShow,
          };
        })
        .sort((a, b) => b.hoursTaught - a.hoursTaught)
        .slice(0, 8);

      // ── 4. Exam pass rates ──────────────────────────────────────────────────
      const [totalRes, theoryRes, practicalRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as unknown as any)
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .in('status', ['active', 'onboarding', 'completed']),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as unknown as any)
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .not('theory_passed_at', 'is', null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as unknown as any)
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .not('practical_passed_at', 'is', null),
      ]);

      const totalStudents   = totalRes.count     ?? 0;
      const theoryPassed    = theoryRes.count     ?? 0;
      const practicalPassed = practicalRes.count  ?? 0;

      return {
        noShowRate: {
          completed: completedCount,
          noShows:   noShowCount,
          rate:      noShowRate,
        },
        revenueTrend,
        instructorUtilization,
        examPassRates: {
          totalStudents,
          theoryPassed,
          practicalPassed,
          theoryRate:    totalStudents > 0 ? Math.round((theoryPassed    / totalStudents) * 1000) / 10 : 0,
          practicalRate: totalStudents > 0 ? Math.round((practicalPassed / totalStudents) * 1000) / 10 : 0,
        },
      };
    },
  });
}
