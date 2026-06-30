import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Download } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotRow {
  instructor_id:    string | null;
  max_bookings:     number;
  current_bookings: number;
}

interface InstructorRow {
  id:         string;
  first_name: string;
  last_name:  string;
  employment_type: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useInstructorROIData(orgId: string | undefined, days: number) {
  return useQuery({
    queryKey: ['report-instructor-roi', orgId, days],
    queryFn: async () => {
      if (!orgId) return { instructors: [] as InstructorRow[], slots: [] as SlotRow[], invoiceLines: [] as { amount: number; slot_id: string | null }[] };
      const from = new Date(Date.now() - days * 86_400_000).toISOString();

      const [{ data: instructors }, { data: slots }] = await Promise.all([
        supabase
          .from('instructors')
          .select('id, first_name, last_name, employment_type')
          .eq('organization_id', orgId)
          .is('deleted_at', null)
          .order('last_name'),
        supabase
          .from('lesson_slots')
          .select('instructor_id, max_bookings, current_bookings')
          .eq('organization_id', orgId)
          .gte('starts_at', from),
      ]);

      return {
        instructors: (instructors ?? []) as InstructorRow[],
        slots:       (slots ?? []) as SlotRow[],
        invoiceLines: [] as { amount: number; slot_id: string | null }[],
      };
    },
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
}

// ─── InstruktorROIPage ────────────────────────────────────────────────────────

export function InstruktorROIPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const [days, setDays] = useState(90);

  const { data, isLoading } = useInstructorROIData(orgId, days);

  const roiRows = useMemo(() => {
    if (!data) return [];
    const { instructors, slots } = data;

    return instructors.map(inst => {
      const instSlots = slots.filter(s => s.instructor_id === inst.id);
      const totalSlots     = instSlots.length;
      const totalCapacity  = instSlots.reduce((s, sl) => s + sl.max_bookings, 0);
      const totalBooked    = instSlots.reduce((s, sl) => s + sl.current_bookings, 0);
      const utilization    = totalCapacity > 0 ? Math.round(totalBooked / totalCapacity * 100) : 0;

      return {
        id:           inst.id,
        name:         `${inst.first_name} ${inst.last_name}`,
        type:         inst.employment_type,
        totalSlots,
        totalBooked,
        totalCapacity,
        utilization,
      };
    }).sort((a, b) => b.totalBooked - a.totalBooked);
  }, [data]);

  const maxBooked = roiRows.reduce((m, r) => Math.max(m, r.totalBooked), 0);

  function exportCsv() {
    const rows = [
      ['Instruktör', 'Typ', 'Totala pass', 'Bokade platser', 'Max platser', 'Utnyttjande (%)'],
      ...roiRows.map(r => [r.name, r.type, r.totalSlots, r.totalBooked, r.totalCapacity, r.utilization]),
    ];
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `instruktor-roi-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Instruktörs-ROI
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Platsutnyttjande per instruktör</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
            {[30, 90, 180].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${days === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {d}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Instruktör</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Pass</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground">Bokade/Max</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Utnyttjande</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground hidden md:table-cell">Aktivitet</th>
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
            ) : roiRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Ingen data för perioden.
                </td>
              </tr>
            ) : (
              roiRows.map(row => (
                <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{row.type.replace('_', ' ')}</p>
                  </td>
                  <td className="px-4 py-3 text-center text-foreground">{row.totalSlots}</td>
                  <td className="px-4 py-3 text-center text-foreground">
                    {row.totalBooked}/{row.totalCapacity}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'text-sm font-bold',
                      row.utilization >= 80 ? 'text-green-600 dark:text-green-400'
                      : row.utilization >= 50 ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400',
                    )}>
                      {row.utilization}%
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${maxBooked > 0 ? (row.totalBooked / maxBooked * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Visualization */}
      {roiRows.length > 0 && !isLoading && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Utnyttjande per instruktör</p>
          <div className="space-y-2.5">
            {roiRows.slice(0, 10).map(row => (
              <div key={row.id} className="flex items-center gap-3">
                <div className="w-28 text-xs text-muted-foreground text-right shrink-0 truncate">{row.name.split(' ')[0]}</div>
                <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded transition-all',
                      row.utilization >= 80 ? 'bg-green-500'
                      : row.utilization >= 50 ? 'bg-amber-400'
                      : 'bg-red-400',
                    )}
                    style={{ width: `${row.utilization}%` }}
                  />
                </div>
                <div className="text-xs font-semibold text-foreground tabular-nums w-10 shrink-0 text-right">
                  {row.utilization}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
