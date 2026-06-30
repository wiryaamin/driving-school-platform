import { Loader2, AlertCircle, TrendingUp, UserX, GraduationCap, Users } from 'lucide-react';
import { useInsightsKpi, type InstructorUtilization } from '../hooks/useInsightsKpi.js';
import { SvgBarChart } from '../components/SvgBarChart.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={cn('text-2xl font-bold', accent ?? 'text-foreground')}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Instructor utilization table ─────────────────────────────────────────────

function UtilizationRow({ instructor, maxHours }: { instructor: InstructorUtilization; maxHours: number }) {
  const pct = maxHours > 0 ? (instructor.hoursTaught / maxHours) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-28 shrink-0">
        <p className="text-sm font-medium text-foreground truncate">{instructor.name}</p>
        <p className="text-xs text-muted-foreground">{instructor.completedCount} lektioner</p>
      </div>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-16 shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-foreground">{instructor.hoursTaught}h</p>
        {instructor.noShowCount > 0 && (
          <p className="text-xs text-amber-500">{instructor.noShowCount} no-show</p>
        )}
      </div>
    </div>
  );
}

// ─── Pass rate ring ───────────────────────────────────────────────────────────

function RateRing({ pct, label, color }: { pct: number; label: string; color: string }) {
  const r = 32;
  const circ = 2 * Math.PI * r;
  const fill = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 80 80" className="w-20 h-20" aria-hidden>
        <circle cx={40} cy={40} r={r} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={8} />
        <circle
          cx={40} cy={40} r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
        />
        <text x={40} y={44} textAnchor="middle" fontSize={14} fontWeight={700} fill="currentColor">
          {pct}%
        </text>
      </svg>
      <p className="text-xs text-center font-medium text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

// ─── KpiTab ───────────────────────────────────────────────────────────────────

export function KpiTab() {
  const { data, isLoading, isError, error } = useInsightsKpi();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Hämtar KPI-data…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="text-sm">{error instanceof Error ? error.message : 'Kunde inte ladda KPI-data.'}</p>
      </div>
    );
  }

  const maxHours = Math.max(...data.instructorUtilization.map(i => i.hoursTaught), 1);
  const noShowColor = data.noShowRate.rate >= 15 ? 'text-red-500' : data.noShowRate.rate >= 8 ? 'text-amber-500' : 'text-green-600';

  return (
    <div className="space-y-8">

      {/* ── 1. No-show rate ─────────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          icon={UserX}
          title="No-show rate (senaste 30 dagarna)"
          sub="Andel bokade elever som uteblev utan avbokning"
        />
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Genomförda"
            value={data.noShowRate.completed.toLocaleString('sv-SE')}
            sub="lektioner"
          />
          <StatCard
            label="No-shows"
            value={data.noShowRate.noShows.toLocaleString('sv-SE')}
            sub="uteblivna"
          />
          <StatCard
            label="No-show rate"
            value={`${data.noShowRate.rate}%`}
            sub={data.noShowRate.rate < 8 ? 'Utmärkt' : data.noShowRate.rate < 15 ? 'Acceptabelt' : 'Åtgärd behövs'}
            accent={noShowColor}
          />
        </div>
      </section>

      {/* ── 2. Revenue trend ────────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          icon={TrendingUp}
          title="Intäkter per månad (senaste 6 månaderna)"
          sub="Summa betalningar (exkl. makulerade)"
        />
        <div className="bg-card border border-border rounded-xl p-4">
          <SvgBarChart
            data={data.revenueTrend}
            yLabel="kr"
            color="#3b82f6"
            formatY={(n) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toLocaleString('sv-SE')}
          />
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Totalt:{' '}
              <span className="font-semibold text-foreground">
                {data.revenueTrend.reduce((s, d) => s + d.value, 0).toLocaleString('sv-SE')} kr
              </span>
            </span>
            <span>
              Snitt per mån:{' '}
              <span className="font-semibold text-foreground">
                {Math.round(data.revenueTrend.reduce((s, d) => s + d.value, 0) / (data.revenueTrend.length || 1)).toLocaleString('sv-SE')} kr
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* ── 3. Instructor utilization ───────────────────────────────────────── */}
      <section>
        <SectionHeader
          icon={Users}
          title="Instruktörers nyttjandegrad (senaste 90 dagarna)"
          sub="Genomförda och registrerade lektionstimmar per instruktör"
        />
        {data.instructorUtilization.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
            Inga lektioner registrerade under perioden.
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl px-4 divide-y divide-border">
            {data.instructorUtilization.map(inst => (
              <UtilizationRow key={inst.id} instructor={inst} maxHours={maxHours} />
            ))}
          </div>
        )}
      </section>

      {/* ── 4. Exam pass rates ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          icon={GraduationCap}
          title="Körkortsresultat"
          sub="Andel aktiva elever som godkänts"
        />
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-around gap-6">
            <RateRing
              pct={data.examPassRates.theoryRate}
              label={`Teoriprov\n${data.examPassRates.theoryPassed} / ${data.examPassRates.totalStudents}`}
              color="#6366f1"
            />
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground tabular-nums">
                {data.examPassRates.totalStudents.toLocaleString('sv-SE')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">aktiva elever</p>
            </div>
            <RateRing
              pct={data.examPassRates.practicalRate}
              label={`Uppkörning\n${data.examPassRates.practicalPassed} / ${data.examPassRates.totalStudents}`}
              color="#10b981"
            />
          </div>
        </div>
      </section>

    </div>
  );
}
