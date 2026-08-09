import { useMemo } from 'react';
import { ChartBar, CalendarCheck, XCircle, Users, TrendingUp } from 'lucide-react';
import { Skeleton } from '@platform/ui';
import { useSlotList } from '../hooks/useSlots.js';
import { useBookingList } from '../hooks/useBookings.js';
import { useLessonTypes } from '../hooks/useLessonTypes.js';
import { useInstructorList } from '@modules/instructors/index.js';
import { cn } from '@/lib/utils.js';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function mondayOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const dow  = copy.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(d.getDate() + n);
  return copy;
}

function weekLabel(mon: Date): string {
  const num = weekNumber(mon);
  return `v.${num}`;
}

function weekNumber(d: Date): number {
  const utc    = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, color, loading,
}: {
  icon:    React.ElementType;
  label:   string;
  value:   string | number;
  sub?:    string;
  color:   string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-24 rounded" />
      ) : (
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      )}
      {sub && !loading && (
        <p className="text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

// ─── SVG bar chart (8 weeks) ──────────────────────────────────────────────────

interface WeekStat {
  label:    string;
  booked:   number;
  capacity: number;
}

function OccupancyBarChart({ weeks, loading }: { weeks: WeekStat[]; loading: boolean }) {
  const maxCap = Math.max(...weeks.map(w => w.capacity), 1);
  const W = 40; // bar width
  const G = 8;  // gap
  const H = 120; // chart height
  const totalW = weeks.length * (W + G) - G;

  if (loading) {
    return <div className="h-40 bg-muted/30 rounded-lg animate-pulse" />;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${totalW} ${H + 32}`}
        className="w-full min-w-[360px]"
        style={{ height: H + 40 }}
        aria-label="Beläggning per vecka"
      >
        {weeks.map((w, i) => {
          const x      = i * (W + G);
          const capH   = Math.round((w.capacity / maxCap) * H);
          const bokH   = Math.round((w.booked   / maxCap) * H);
          const capY   = H - capH;
          const bokY   = H - bokH;
          const pct    = w.capacity > 0 ? Math.round((w.booked / w.capacity) * 100) : 0;
          const isHigh = pct >= 80;
          const isMid  = pct >= 50;

          return (
            <g key={w.label}>
              {/* Capacity bar (light) */}
              <rect
                x={x} y={capY}
                width={W} height={capH}
                rx={4}
                className="fill-muted"
              />
              {/* Booked bar (colored) */}
              {bokH > 0 && (
                <rect
                  x={x} y={bokY}
                  width={W} height={bokH}
                  rx={4}
                  className={isHigh ? 'fill-green-500' : isMid ? 'fill-amber-400' : 'fill-blue-400'}
                />
              )}
              {/* % label above */}
              <text
                x={x + W / 2} y={Math.max(0, bokY) - 4}
                textAnchor="middle"
                fontSize={9}
                className="fill-muted-foreground"
              >
                {pct}%
              </text>
              {/* Week label below */}
              <text
                x={x + W / 2} y={H + 16}
                textAnchor="middle"
                fontSize={10}
                className="fill-muted-foreground"
              >
                {w.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-muted inline-block" />
          Kapacitet
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" />
          Bokade (&lt;50%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
          50–79%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />
          ≥80%
        </span>
      </div>
    </div>
  );
}

// ─── SchedulingStatistikPage ──────────────────────────────────────────────────

export function SchedulingStatistikPage() {
  // All date boundaries are memoized so they don't shift on re-renders
  const { thisWeek, from8, fromISO, toISO, from30, to30 } = useMemo(() => {
    const today    = new Date();
    const thisWeek = mondayOfWeek(today);
    const from8    = addDays(thisWeek, -7 * 7);
    return {
      thisWeek,
      from8,
      fromISO: from8.toISOString(),
      toISO:   addDays(thisWeek, 7).toISOString(),
      from30:  addDays(today, -30).toISOString(),
      to30:    addDays(today, 1).toISOString(),
    };
  }, []);

  const { data: slotsAll,    isLoading: slotsLoading    } = useSlotList({ per_page: 500, from: fromISO, to: toISO });
  const { data: bookingsAll, isLoading: bookingsLoading } = useBookingList({ per_page: 500, from: from30, to: to30 });
  const { data: lessonTypes = []                        } = useLessonTypes();
  const { data: instructorsData                         } = useInstructorList({ per_page: 100 });

  const loading = slotsLoading || bookingsLoading;

  const slots    = slotsAll?.data    ?? [];
  const bookings = bookingsAll?.data ?? [];

  // ── Build 8-week occupancy series ─────────────────────────────────────────
  const weekStats: WeekStat[] = useMemo(() => {
    const weeks: WeekStat[] = [];
    for (let i = 0; i < 8; i++) {
      const mon  = addDays(from8, i * 7);
      const sun  = addDays(mon, 7);
      const monS = mon.toISOString();
      const sunS = sun.toISOString();
      const wSlots = slots.filter(s => s.starts_at >= monS && s.starts_at < sunS);
      weeks.push({
        label:    weekLabel(mon),
        booked:   wSlots.reduce((a, s) => a + s.current_bookings, 0),
        capacity: wSlots.reduce((a, s) => a + s.max_bookings, 0),
      });
    }
    return weeks;
  }, [slots, from8]);

  // ── KPIs (this week) ──────────────────────────────────────────────────────
  const thisWeekSlots = useMemo(() => {
    const mon = thisWeek.toISOString();
    const sun = addDays(thisWeek, 7).toISOString();
    return slots.filter(s => s.starts_at >= mon && s.starts_at < sun);
  }, [slots, thisWeek]);

  const thisWeekBooked   = thisWeekSlots.reduce((a, s) => a + s.current_bookings, 0);
  const thisWeekCapacity = thisWeekSlots.reduce((a, s) => a + s.max_bookings, 0);
  const occupancyPct     = thisWeekCapacity > 0
    ? Math.round((thisWeekBooked / thisWeekCapacity) * 100)
    : 0;

  const recentCancelled = bookings.filter(b => b.status === 'cancelled' || b.status === 'no_show').length;
  const recentConfirmed = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed').length;
  const cancelRate      = (recentConfirmed + recentCancelled) > 0
    ? Math.round((recentCancelled / (recentConfirmed + recentCancelled)) * 100)
    : 0;

  // ── Lesson type breakdown (last 30 days bookings) ─────────────────────────
  const ltMap = useMemo(
    () => Object.fromEntries(lessonTypes.map(lt => [lt.id, lt.name])),
    [lessonTypes],
  );

  const ltBreakdown = useMemo(() => {
    const counts: Record<string, { name: string; bookings: number; cancelled: number }> = {};
    for (const b of bookings) {
      const key  = b.lesson_type_id ?? '';
      const name = ltMap[key] ?? 'Okänd';
      if (!counts[key]) counts[key] = { name, bookings: 0, cancelled: 0 };
      if (b.status === 'cancelled' || b.status === 'no_show') {
        counts[key]!.cancelled += 1;
      } else {
        counts[key]!.bookings += 1;
      }
    }
    return Object.values(counts).sort((a, b) => b.bookings - a.bookings);
  }, [bookings, ltMap]);

  // ── Top instructors (by booking count, last 30 days) ─────────────────────
  const instructors = instructorsData?.data ?? [];
  const instrMap    = useMemo(
    () => Object.fromEntries(instructors.map(i => [i.id, `${i.first_name} ${i.last_name}`])),
    [instructors],
  );

  const topInstructors = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of bookings) {
      if (b.status !== 'cancelled' && b.status !== 'no_show') {
        counts[b.instructor_id] = (counts[b.instructor_id] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([id, n]) => ({ name: instrMap[id] ?? id.slice(0, 8), bookings: n }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 5);
  }, [bookings, instrMap]);

  const maxInstrBookings = topInstructors[0]?.bookings ?? 1;

  return (
    <div className="space-y-6 pb-8">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Schemastatistik</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Beläggning, bokningar och avbokningar de senaste 8 veckorna
        </p>
      </div>

      {/* ── KPI row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={CalendarCheck} label="Beläggning denna vecka"
          value={`${occupancyPct}%`}
          sub={`${thisWeekBooked} av ${thisWeekCapacity} platser`}
          color="bg-primary"
          loading={loading}
        />
        <KpiCard
          icon={Users} label="Bokningar (30 dagar)"
          value={recentConfirmed}
          sub="bekräftade och genomförda"
          color="bg-green-500"
          loading={loading}
        />
        <KpiCard
          icon={XCircle} label="Avbokningsgrad (30 dagar)"
          value={`${cancelRate}%`}
          sub={`${recentCancelled} avbokningar`}
          color={cancelRate >= 20 ? 'bg-red-500' : 'bg-amber-500'}
          loading={loading}
        />
        <KpiCard
          icon={TrendingUp} label="Pass denna vecka"
          value={thisWeekSlots.length}
          sub={`${thisWeekSlots.filter(s => s.status === 'open').length} öppna`}
          color="bg-blue-500"
          loading={loading}
        />
      </div>

      {/* ── Occupancy chart ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ChartBar className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Beläggning per vecka</h2>
        </div>
        <OccupancyBarChart weeks={weekStats} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Lesson type breakdown ────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Bokningar per tjänst (30 dagar)</h2>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full rounded" />)}
            </div>
          ) : ltBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga bokningar i perioden</p>
          ) : (
            <div className="space-y-2.5">
              {ltBreakdown.map((lt, i) => {
                const total = lt.bookings + lt.cancelled;
                const pct   = total > 0 ? Math.round((lt.bookings / total) * 100) : 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground truncate max-w-[180px]">{lt.name}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0 ml-2">
                        {lt.bookings} bkn · {lt.cancelled > 0 ? `${lt.cancelled} avb` : ''}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Top instructors ──────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Lärare — flest bokningar (30 dagar)</h2>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full rounded" />)}
            </div>
          ) : topInstructors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga bokningar i perioden</p>
          ) : (
            <div className="space-y-2.5">
              {topInstructors.map((instr, i) => {
                const pct = Math.round((instr.bookings / maxInstrBookings) * 100);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className={cn(
                          'w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center text-white shrink-0',
                          i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-muted-foreground' : 'bg-muted-foreground/60',
                        )}>
                          {i + 1}
                        </span>
                        <span className="font-medium text-foreground truncate max-w-[160px]">{instr.name}</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums shrink-0 ml-2">{instr.bookings}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
