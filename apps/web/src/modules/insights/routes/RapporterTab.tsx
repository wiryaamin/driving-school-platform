import { useState } from 'react';
import { AlertCircle, ChartBar, TrendingUp, CalendarCheck } from 'lucide-react';
import { useInsightsRapporter, type DateRangeKey } from '../hooks/useInsightsRapporter.js';
import { SvgBarChart } from '../components/SvgBarChart.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEK_FORMAT = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });

function fmtSek(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Mkr`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k kr`;
  return SEK_FORMAT.format(n);
}

// ─── Date range selector ──────────────────────────────────────────────────────

const RANGES: { key: DateRangeKey; label: string }[] = [
  { key: '7d',   label: '7 dagar'  },
  { key: '30d',  label: '30 dagar' },
  { key: '90d',  label: '90 dagar' },
  { key: 'year', label: 'I år'     },
];

// ─── Summary stat card ────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor,
  valueColor,
  isLoading,
}: {
  icon:        React.ElementType;
  label:       string;
  value:       string;
  sub?:        string | undefined;
  iconColor:   string;
  valueColor?: string | undefined;
  isLoading:   boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', iconColor)}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
      {isLoading ? (
        <div className="h-8 bg-muted rounded animate-pulse w-24 mt-1" />
      ) : (
        <p className={cn('text-2xl font-bold tabular-nums', valueColor ?? 'text-foreground')}>{value}</p>
      )}
      {sub && !isLoading && (
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      )}
    </div>
  );
}

// ─── Lesson type distribution ─────────────────────────────────────────────────

function LessonTypeBar({ name, count, pct, maxCount }: { name: string; count: number; pct: number; maxCount: number }) {
  const barW = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="grid grid-cols-[140px_1fr_80px] items-center gap-3 py-1.5">
      <p className="text-xs font-medium text-foreground truncate">{name}</p>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${barW}%` }}
        />
      </div>
      <div className="text-right">
        <span className="text-xs font-semibold text-foreground tabular-nums">{count} st</span>
        <span className="text-xs text-muted-foreground ml-1">({pct}%)</span>
      </div>
    </div>
  );
}

// ─── Booking breakdown mini-table ─────────────────────────────────────────────

function BookingBreakdown({
  confirmed,
  cancelled,
  noShow,
  total,
}: {
  confirmed: number;
  cancelled: number;
  noShow:    number;
  total:     number;
}) {
  if (total === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span>
        Genomförda:{' '}
        <span className="font-semibold text-foreground tabular-nums">{confirmed}</span>
        {total > 0 && (
          <span className="text-muted-foreground/70 ml-0.5">({Math.round((confirmed / total) * 100)}%)</span>
        )}
      </span>
      <span>
        Avbokade:{' '}
        <span className={cn('font-semibold tabular-nums', cancelled > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>
          {cancelled}
        </span>
      </span>
      <span>
        No-show:{' '}
        <span className={cn('font-semibold tabular-nums', noShow > 0 ? 'text-destructive' : 'text-foreground')}>
          {noShow}
        </span>
      </span>
    </div>
  );
}

// ─── RapporterTab ─────────────────────────────────────────────────────────────

export function RapporterTab() {
  const [rangeKey, setRangeKey] = useState<DateRangeKey>('30d');
  const { data, isLoading, isError, error } = useInsightsRapporter(rangeKey);

  const completionColor =
    !data          ? 'text-foreground'
    : data.completionRate >= 90 ? 'text-emerald-600 dark:text-emerald-400'
    : data.completionRate >= 75 ? 'text-amber-600 dark:text-amber-400'
    :                             'text-destructive';

  const maxLessonType = Math.max(...(data?.lessonTypeStats ?? []).map((s) => s.count), 1);

  const bookingChartData = (data?.bookingBars ?? []).map((b) => ({
    label: b.label,
    value: b.confirmed,
  }));
  const revenueChartData = (data?.revenueBars ?? []).map((b) => ({
    label:  b.label,
    value:  Math.round(b.amount),
  }));

  const totalConfirmedSum = data?.bookingBars.reduce((s, b) => s + b.confirmed, 0) ?? 0;
  const totalCancelSum    = data?.bookingBars.reduce((s, b) => s + b.cancelled, 0) ?? 0;
  const totalNoShowSum    = data?.bookingBars.reduce((s, b) => s + b.noShow, 0)    ?? 0;

  return (
    <div className="space-y-6">

      {/* Date range selector */}
      <div className="flex items-center gap-1 bg-muted/40 border border-border rounded-lg p-1 w-fit">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRangeKey(r.key)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              rangeKey === r.key
                ? 'bg-background text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isError ? (
        <div className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error instanceof Error ? error.message : 'Kunde inte ladda rapportdata.'}</p>
        </div>
      ) : (
        <>
          {/* KPI summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              icon={CalendarCheck}
              label="Totalt bokningar"
              value={isLoading ? '…' : String(data?.totalBookings ?? 0)}
              sub={isLoading ? undefined : `${data?.confirmedBookings ?? 0} genomförda`}
              iconColor="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              isLoading={isLoading}
            />
            <SummaryCard
              icon={ChartBar}
              label="Genomförandegrad"
              value={isLoading ? '…' : `${data?.completionRate ?? 0}%`}
              sub={isLoading ? undefined : `${data?.noShowBookings ?? 0} no-show registrerade`}
              iconColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              valueColor={isLoading ? undefined : completionColor}
              isLoading={isLoading}
            />
            <SummaryCard
              icon={TrendingUp}
              label="Intäkter i perioden"
              value={isLoading ? '…' : fmtSek(data?.totalRevenue ?? 0)}
              sub={isLoading ? undefined : `Bekräftade betalningar`}
              iconColor="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
              isLoading={isLoading}
            />
          </div>

          {/* Booking volume chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-semibold text-foreground">Genomförda bokningar per period</p>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">
              Antal genomförda lektioner (bekräftade + avslutade) uppdelat per{' '}
              {rangeKey === '7d' ? 'dag' : rangeKey === 'year' ? 'månad' : 'vecka'}.
            </p>
            {isLoading ? (
              <div className="h-40 bg-muted rounded animate-pulse" />
            ) : (
              <>
                <SvgBarChart
                  data={bookingChartData}
                  color="#3b82f6"
                  formatY={(n) => String(n)}
                />
                <BookingBreakdown
                  confirmed={totalConfirmedSum}
                  cancelled={totalCancelSum}
                  noShow={totalNoShowSum}
                  total={data?.totalBookings ?? 0}
                />
              </>
            )}
          </div>

          {/* Revenue chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-semibold text-foreground">Intäkter per period</p>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">
              Bekräftade betalningar uppdelat per{' '}
              {rangeKey === '7d' ? 'dag' : rangeKey === 'year' ? 'månad' : 'vecka'}.
            </p>
            {isLoading ? (
              <div className="h-40 bg-muted rounded animate-pulse" />
            ) : (
              <>
                <SvgBarChart
                  data={revenueChartData}
                  color="#10b981"
                  formatY={(n) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toLocaleString('sv-SE')}
                />
                {data && data.totalRevenue > 0 && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Totalt:{' '}
                      <span className="font-semibold text-foreground tabular-nums">
                        {fmtSek(data.totalRevenue)}
                      </span>
                    </span>
                    {data.revenueBars.filter((b) => b.amount > 0).length > 1 && (
                      <span>
                        Snitt per period:{' '}
                        <span className="font-semibold text-foreground tabular-nums">
                          {fmtSek(
                            data.totalRevenue /
                              Math.max(data.revenueBars.filter((b) => b.amount > 0).length, 1),
                          )}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Lesson type distribution */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-semibold text-foreground">Lektionstyper i perioden</p>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">
              Fördelning av lektionstyper baserat på skapade pass.
            </p>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="grid grid-cols-[140px_1fr_80px] items-center gap-3">
                    <div className="h-3 bg-muted rounded animate-pulse" />
                    <div className="h-2 bg-muted rounded-full animate-pulse" />
                    <div className="h-3 bg-muted rounded animate-pulse w-12 ml-auto" />
                  </div>
                ))}
              </div>
            ) : (data?.lessonTypeStats ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Inga pass registrerade under perioden.
              </p>
            ) : (
              <div className="divide-y divide-border/40">
                {(data?.lessonTypeStats ?? []).map((stat) => (
                  <LessonTypeBar
                    key={stat.name}
                    name={stat.name}
                    count={stat.count}
                    pct={stat.pct}
                    maxCount={maxLessonType}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
