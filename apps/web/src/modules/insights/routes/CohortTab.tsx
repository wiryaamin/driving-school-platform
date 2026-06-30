import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { Skeleton } from '@platform/ui';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentRow {
  id:         string;
  created_at: string;
}

interface BookingRow {
  student_id: string;
  slot_id:    string;
  created_at: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useCohortData(orgId: string | undefined) {
  return useQuery({
    queryKey: ['insights-cohort', orgId],
    queryFn: async () => {
      if (!orgId) return { students: [] as StudentRow[], bookings: [] as BookingRow[] };
      const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString();

      const [{ data: students }, { data: bookings }] = await Promise.all([
        supabase
          .from('students')
          .select('id, created_at')
          .eq('organization_id', orgId)
          .gte('created_at', cutoff)
          .is('deleted_at', null),
        supabase
          .from('lesson_bookings')
          .select('student_id, slot_id, created_at')
          .eq('organization_id', orgId)
          .gte('created_at', cutoff)
          .neq('status', 'cancelled'),
      ]);

      return {
        students: (students ?? []) as StudentRow[],
        bookings: (bookings ?? []) as BookingRow[],
      };
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}

// ─── Cohort analysis ──────────────────────────────────────────────────────────

function monthKey(iso: string): string {
  return iso.slice(0, 7); // "YYYY-MM"
}

function addMonths(key: string, n: number): string {
  const d = new Date(`${key}-01`);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 7);
}

const RETENTION_MONTHS = [1, 2, 3, 6];

// ─── Heat cell ────────────────────────────────────────────────────────────────

function HeatCell({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <td className="px-2 py-1.5 text-center text-xs text-muted-foreground/30">–</td>;
  }
  const intensity = pct >= 80 ? 'bg-green-500 text-white'
    : pct >= 60 ? 'bg-green-300 text-green-900'
    : pct >= 40 ? 'bg-yellow-200 text-yellow-900'
    : pct >= 20 ? 'bg-orange-100 text-orange-800'
    : 'bg-red-50 text-red-700';

  return (
    <td className={cn('px-2 py-1.5 text-center text-xs font-semibold rounded', intensity)}>
      {pct}%
    </td>
  );
}

// ─── CohortTab ────────────────────────────────────────────────────────────────

export function CohortTab() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const { data, isLoading } = useCohortData(orgId);

  const cohortTable = useMemo(() => {
    if (!data) return [];

    const { students, bookings } = data;

    // Group students by enrollment month
    const cohorts: Record<string, string[]> = {};
    for (const s of students) {
      const key = monthKey(s.created_at);
      (cohorts[key] ??= []).push(s.id);
    }

    // For each student, find earliest booking month
    const firstBookingMonth: Record<string, string> = {};
    for (const b of bookings) {
      const key = monthKey(b.created_at);
      if (!firstBookingMonth[b.student_id] || key < firstBookingMonth[b.student_id]!) {
        firstBookingMonth[b.student_id] = key;
      }
    }

    // Build booking activity per student per month
    const activityMap: Map<string, Set<string>> = new Map();
    for (const b of bookings) {
      if (!activityMap.has(b.student_id)) activityMap.set(b.student_id, new Set());
      activityMap.get(b.student_id)!.add(monthKey(b.created_at));
    }

    // Sort cohort months descending
    const sortedKeys = Object.keys(cohorts).sort().reverse().slice(0, 10);

    return sortedKeys.map(cohortMonth => {
      const cohortStudents = cohorts[cohortMonth] ?? [];
      const n = cohortStudents.length;

      const retentionByMonth = RETENTION_MONTHS.map(offset => {
        const targetMonth = addMonths(cohortMonth, offset);
        // Only show if enough time has passed
        const now = new Date().toISOString().slice(0, 7);
        if (targetMonth > now) return null;

        const activeInTarget = cohortStudents.filter(sid => {
          const months = activityMap.get(sid);
          return months?.has(targetMonth);
        }).length;

        return n > 0 ? Math.round(activeInTarget / n * 100) : 0;
      });

      const [ret1, ret2, ret3, ret6] = retentionByMonth;

      return {
        month: cohortMonth,
        size:  n,
        ret1:  ret1 ?? null,
        ret2:  ret2 ?? null,
        ret3:  ret3 ?? null,
        ret6:  ret6 ?? null,
      };
    });
  }, [data]);

  const formatMonth = (key: string) =>
    new Date(`${key}-01`).toLocaleDateString('sv-SE', { month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Kohortanalys</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Andel elever som var aktiva (hade minst en bokning) under varje månadsintervall efter inskrivning.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(n => <Skeleton key={n} className="h-10 rounded" />)}
        </div>
      ) : cohortTable.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Inte tillräckligt med data ännu.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Inskriv.månad</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Elever</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground">+1 mån</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground">+2 mån</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground">+3 mån</th>
                <th className="px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground">+6 mån</th>
              </tr>
            </thead>
            <tbody>
              {cohortTable.map(row => (
                <tr key={row.month} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 text-sm font-medium text-foreground">{formatMonth(row.month)}</td>
                  <td className="px-3 py-2 text-center text-sm text-muted-foreground">{row.size}</td>
                  <HeatCell pct={row.ret1} />
                  <HeatCell pct={row.ret2} />
                  <HeatCell pct={row.ret3} />
                  <HeatCell pct={row.ret6} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">Aktivitetsandel:</span>
        {[
          { cls: 'bg-green-500', label: '≥80%' },
          { cls: 'bg-green-300', label: '60-79%' },
          { cls: 'bg-yellow-200', label: '40-59%' },
          { cls: 'bg-orange-100', label: '20-39%' },
          { cls: 'bg-red-50', label: '<20%' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={cn('w-3 h-3 rounded-sm', l.cls)} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
