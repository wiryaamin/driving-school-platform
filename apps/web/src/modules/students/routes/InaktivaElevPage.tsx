import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, AlertTriangle, ChevronRight } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InactiveStudent {
  id:            string;
  first_name:    string;
  last_name:     string;
  permit_stage:  string | null;
  last_booking:  string | null;
  days_inactive: number;
}

const THRESHOLD_DAYS = [14, 21, 30];

const STAGE_LABELS: Record<string, string> = {
  not_started:          'Ej påbörjad',
  theory_study:         'Teoristudier',
  risk1_booked:         'Risk 1 bokad',
  risk1_completed:      'Risk 1 klar',
  risk2_booked:         'Risk 2 bokad',
  risk2_completed:      'Risk 2 klar',
  theory_exam_booked:   'Teoriprov bokad',
  theory_passed:        'Teori godkänd',
  practical_exam_booked:'Uppkörning bokad',
  practical_passed:     'Uppkörning godkänd',
  licence_issued:       'Körkort utfärdat',
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useInactiveStudents(orgId: string | undefined, thresholdDays: number) {
  return useQuery<InactiveStudent[]>({
    queryKey: ['inactive-students', orgId, thresholdDays],
    queryFn: async () => {
      if (!orgId) return [];
      const { data: studentsRaw, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, permit_stage')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .is('deleted_at', null);

      const students = studentsRaw as Array<{ id: string; first_name: string; last_name: string; permit_stage: string | null }> | null;

      if (error) throw new Error(error.message);
      if (!students?.length) return [];

      const studentIds = students.map(s => s.id);

      const { data: bookings } = await supabase
        .from('lesson_bookings')
        .select('student_id, created_at')
        .eq('organization_id', orgId)
        .in('student_id', studentIds)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      const lastBookingByStudent: Record<string, string> = {};
      for (const b of (bookings ?? []) as Array<{ student_id: string; created_at: string }>) {
        if (!lastBookingByStudent[b.student_id]) {
          lastBookingByStudent[b.student_id] = b.created_at;
        }
      }

      const now = Date.now();
      const inactive: InactiveStudent[] = [];

      for (const s of students) {
        const lastBooking = lastBookingByStudent[s.id] ?? null;
        const daysInactive = lastBooking
          ? Math.floor((now - new Date(lastBooking).getTime()) / 86_400_000)
          : 999;

        if (daysInactive >= thresholdDays) {
          inactive.push({
            id:            s.id,
            first_name:    s.first_name,
            last_name:     s.last_name,
            permit_stage:  s.permit_stage,
            last_booking:  lastBooking,
            days_inactive: daysInactive,
          });
        }
      }

      return inactive.sort((a, b) => b.days_inactive - a.days_inactive);
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}

// ─── InaktivaElevPage ─────────────────────────────────────────────────────────

export function InaktivaElevPage() {
  const navigate = useNavigate();
  const { organization } = useSession();
  const orgId = organization?.id;
  const [threshold, setThreshold] = useState(21);

  const { data: students = [], isLoading } = useInactiveStudents(orgId, threshold);

  const byStage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of students) {
      const stage = s.permit_stage ?? 'not_started';
      m[stage] = (m[stage] ?? 0) + 1;
    }
    return Object.entries(m).sort(([, a], [, b]) => b - a);
  }, [students]);

  function formatLastBooking(iso: string | null): string {
    if (!iso) return 'Aldrig bokat';
    return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <PageLayout>
      <PageHeader
        title="Inaktiva elever"
        description="Elever som inte haft någon bokning inom vald period"
        breadcrumbs={[
          { label: 'Hem' },
          { label: 'Elever', href: '/students' },
          { label: 'Inaktiva' },
        ]}
      />

      <PageContent>

        {/* Controls */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm text-muted-foreground">Visa elever utan bokning de senaste</span>
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
            {THRESHOLD_DAYS.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setThreshold(d)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${threshold === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {d} dagarna
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Inaktiva elever</p>
            <p className="text-3xl font-bold text-foreground mt-1">{students.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Aktiva utan bokning</p>
          </div>
          {byStage.slice(0, 2).map(([stage, count]) => (
            <div key={stage} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{STAGE_LABELS[stage] ?? stage}</p>
              <p className="text-3xl font-bold text-foreground mt-1">{count}</p>
              <p className="text-xs text-muted-foreground mt-1">Elever</p>
            </div>
          ))}
        </div>

        {/* Alert strip */}
        {students.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 text-sm text-amber-800 dark:text-amber-300 mb-5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {students.length} aktiva elever har inte bokat på {threshold}+ dagar. Kontakta dem för att återaktivera.
            </span>
          </div>
        )}

        {/* Student list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Elev</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground hidden md:table-cell">Fas</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Senaste bokning</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Dagar</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [1,2,3,4,5].map(n => (
                  <tr key={n} className="border-b border-border/50">
                    <td colSpan={5} className="px-4 py-3">
                      <Skeleton className="h-4 rounded" />
                    </td>
                  </tr>
                ))
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Inga inaktiva elever inom vald period.</p>
                    <p className="text-xs text-muted-foreground mt-1">Alla aktiva elever har bokat de senaste {threshold} dagarna.</p>
                  </td>
                </tr>
              ) : (
                students.map(student => (
                  <tr
                    key={student.id}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => navigate(`/students/${student.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {student.first_name} {student.last_name}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {STAGE_LABELS[student.permit_stage ?? 'not_started'] ?? student.permit_stage ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                      {formatLastBooking(student.last_booking)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        student.days_inactive >= 60
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : student.days_inactive >= 30
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
                      )}>
                        {student.days_inactive >= 999 ? '999+' : student.days_inactive}d
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {students.length > 0 && (
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => navigate('/communication')}>
              Skicka massmedelande
            </Button>
          </div>
        )}

      </PageContent>
    </PageLayout>
  );
}
