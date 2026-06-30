import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChartBar, CheckCircle2, XCircle, Send, Clock,
  ChevronRight, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { useCommAnalytics, useCommDailyStats, useQueueHealth } from '../hooks/useCommunication.js';
import { CHANNEL_META } from '../components/ChannelIcon.js';
import type { CommChannel } from '../hooks/useCommunication.js';

// ─── Period selector ──────────────────────────────────────────────────────────

const PERIODS = [
  { value: 7,  label: '7 dagar'  },
  { value: 30, label: '30 dagar' },
  { value: 90, label: '90 dagar' },
] as const;

type Period = typeof PERIODS[number]['value'];

// ─── SVG bar chart ────────────────────────────────────────────────────────────

interface DayStat { date: string; total: number; sent: number; failed: number }

function DeliveryBarChart({ data, days }: { data: DayStat[]; days: number }) {
  if (data.length === 0 || data.every((d) => d.total === 0)) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
        Inga meddelanden under perioden
      </div>
    );
  }

  const maxVal   = Math.max(...data.map((d) => d.total), 1);
  const barCount = data.length;
  const W        = 700;
  const H        = 200;
  const PAD      = { top: 16, right: 16, bottom: 36, left: 44 };
  const plotW    = W - PAD.left - PAD.right;
  const plotH    = H - PAD.top  - PAD.bottom;
  const barW     = Math.max(2, (plotW / barCount) * 0.7);
  const step     = plotW / barCount;

  // Show every Nth label to avoid overcrowding
  const labelEvery = days <= 7 ? 1 : days <= 30 ? 5 : 15;

  const yTick = Math.ceil(maxVal / 4);
  const yMax  = yTick * 4;

  function py(v: number) { return PAD.top + plotH - (v / yMax) * plotH; }
  function bx(i: number) { return PAD.left + i * step + step / 2 - barW / 2; }

  function shortDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block bg-emerald-500" />
          <span className="text-xs text-muted-foreground">Skickade</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block bg-destructive/60" />
          <span className="text-xs text-muted-foreground">Misslyckade</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 200 }} aria-hidden>
        {/* Y axis grid + labels */}
        {[0, 1, 2, 3, 4].map((i) => {
          const v = i * yTick;
          const y = py(v);
          return (
            <g key={i}>
              <line
                x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y}
                stroke="currentColor" strokeOpacity={0.1} strokeWidth={1}
              />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.45}>
                {v}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const sentH   = (d.sent   / yMax) * plotH;
          const failedH = (d.failed / yMax) * plotH;
          const x       = bx(i);
          return (
            <g key={d.date}>
              {/* Sent bar */}
              <rect
                x={x} y={py(d.sent)} width={barW} height={sentH}
                fill="#22c55e" fillOpacity={0.75} rx={1}
              />
              {/* Failed bar (stacked on top) */}
              {d.failed > 0 && (
                <rect
                  x={x} y={py(d.sent + d.failed)} width={barW} height={failedH}
                  fill="hsl(var(--destructive))" fillOpacity={0.6} rx={1}
                />
              )}
            </g>
          );
        })}

        {/* X labels */}
        {data.map((d, i) => i % labelEvery === 0 && (
          <text
            key={d.date}
            x={bx(i) + barW / 2} y={H - 8}
            textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.5}
          >
            {shortDate(d.date)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Channel breakdown table ──────────────────────────────────────────────────

function DeliveryRateBar({ rate }: { rate: number }) {
  const color = rate >= 95 ? '#22c55e' : rate >= 80 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>{rate}%</span>
    </div>
  );
}

// ─── CommAnalyticsPage ────────────────────────────────────────────────────────

export function CommAnalyticsPage() {
  const [days, setDays] = useState<Period>(7);

  const { data: channelStats = [], isLoading: channelLoading } = useCommAnalytics(days);
  const { data: dailyStats   = [], isLoading: dailyLoading   } = useCommDailyStats(days);
  const { data: queueHealth }                                   = useQueueHealth();

  const totalSent     = channelStats.reduce((s, r) => s + r.sent,   0);
  const totalFailed   = channelStats.reduce((s, r) => s + r.failed, 0);
  const totalMessages = channelStats.reduce((s, r) => s + r.total,  0);
  const overallRate   = totalMessages > 0 ? Math.round((totalSent / totalMessages) * 100) : 100;
  const totalQueued   = queueHealth?.total_queued ?? 0;

  const isLoading = channelLoading || dailyLoading;

  return (
    <PageLayout>
      <PageHeader
        title="Kommunikationsanalys"
        description="Leveransstatistik och kanalöversikt"
        actions={
          <Link to="/communication" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
            Tillbaka till översikt <ChevronRight className="w-3 h-3" />
          </Link>
        }
      />

      <PageContent>

        {/* Period selector */}
        <div className="flex items-center gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                days === p.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Totalt skickade',  value: totalMessages, icon: Send,         color: 'text-foreground'  },
            { label: 'Levererade',       value: totalSent,     icon: CheckCircle2, color: 'text-emerald-600' },
            { label: 'Misslyckade',      value: totalFailed,   icon: XCircle,      color: 'text-destructive' },
            { label: 'I kö',             value: totalQueued,   icon: Clock,        color: 'text-amber-600'   },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
              <Icon className={cn('w-4 h-4 shrink-0', color)} />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{label}</p>
                <p className="text-lg font-bold text-foreground tabular-nums">{value.toLocaleString('sv-SE')}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Overall delivery health */}
        <div className={cn(
          'rounded-xl border p-4 flex items-center gap-4',
          overallRate >= 95
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/20'
            : overallRate >= 80
            ? 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20'
            : 'border-destructive/30 bg-destructive/5',
        )}>
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
            overallRate >= 95 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30',
          )}>
            {overallRate >= 95
              ? <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              : <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Leveransgrad: <span className="font-bold">{overallRate}%</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {overallRate >= 95
                ? 'Utmärkt — nästan alla meddelanden levereras korrekt.'
                : overallRate >= 80
                ? 'Godkänd — kontrollera misslyckade meddelanden i leveransloggen.'
                : 'Kritisk — hög felprocent. Kontrollera kanalernas leverantörskonfiguration.'}
            </p>
          </div>
          <Link
            to="/communication/log?status=failed"
            className="text-xs text-primary hover:underline shrink-0 flex items-center gap-0.5"
          >
            Leveranslogg <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Daily trend chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ChartBar className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Daglig leveranstrend</h2>
            <span className="text-xs text-muted-foreground ml-auto">
              {PERIODS.find((p) => p.value === days)?.label}
            </span>
          </div>
          {isLoading ? (
            <div className="h-40 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <DeliveryBarChart data={dailyStats} days={days} />
          )}
        </div>

        {/* Per-channel breakdown */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <ChartBar className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Kanaluppdelning</h2>
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-muted rounded-lg animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-muted rounded animate-pulse w-1/4" />
                    <div className="h-2 bg-muted rounded animate-pulse w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : channelStats.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-center">
              <ChartBar className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Inga data under vald period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Kanal</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Totalt</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Skickade</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Misslyckade</th>
                    <th className="px-4 py-2.5 text-left   text-xs font-semibold text-muted-foreground w-48">Leveransgrad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {channelStats.map((row) => {
                    const meta = CHANNEL_META[row.channel as CommChannel];
                    return (
                      <tr key={row.channel} className="hover:bg-accent/10 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {meta && (
                              <div className={cn('w-6 h-6 rounded flex items-center justify-center shrink-0', meta.bg)}>
                                <meta.Icon className={cn('w-3 h-3', meta.text)} />
                              </div>
                            )}
                            <span className="text-xs font-medium text-foreground capitalize">
                              {meta?.label ?? row.channel}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs tabular-nums text-foreground">{row.total.toLocaleString('sv-SE')}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                            {row.sent.toLocaleString('sv-SE')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            'text-xs tabular-nums',
                            row.failed > 0 ? 'text-destructive' : 'text-muted-foreground',
                          )}>
                            {row.failed.toLocaleString('sv-SE')}
                          </span>
                        </td>
                        <td className="px-4 py-3 w-48">
                          <DeliveryRateBar rate={row.delivery_rate} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/20">
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold text-foreground">Totalt</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-xs font-semibold tabular-nums">{totalMessages.toLocaleString('sv-SE')}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {totalSent.toLocaleString('sv-SE')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn(
                        'text-xs font-semibold tabular-nums',
                        totalFailed > 0 ? 'text-destructive' : 'text-muted-foreground',
                      )}>
                        {totalFailed.toLocaleString('sv-SE')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <DeliveryRateBar rate={overallRate} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { to: '/communication/log',      label: 'Leveranslogg',     desc: 'Granska skickade och misslyckade meddelanden'          },
            { to: '/communication/queue',     label: 'Kömonitor',        desc: 'Se kömeddelandens status i realtid'                    },
            { to: '/communication/settings',  label: 'Kanalinställningar', desc: 'Konfigurera leverantörer och testar kanaler'         },
          ].map(({ to, label, desc }) => (
            <Link
              key={to}
              to={to}
              className="rounded-xl border border-border bg-card p-4 hover:bg-accent/30 transition-colors group"
            >
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              <ChevronRight className="w-3.5 h-3.5 text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>

      </PageContent>
    </PageLayout>
  );
}
