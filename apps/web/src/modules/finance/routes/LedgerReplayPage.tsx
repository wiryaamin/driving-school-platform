import { useState } from 'react';
import {
  RefreshCw, AlertTriangle, CheckCircle2, CircleDot,
  ChevronRight, Loader2, Clock, ChartBar,
} from 'lucide-react';
import { Button, Badge, toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useFinancialPeriods } from '../hooks/useReconciliation.js';
import {
  useReplayRunsByPeriod, useLatestReplayRun, useReplaySnapshots,
  useDivergentSnapshots, useDivergentRuns,
  useRunPeriodReplay, useValidatePeriodBalance,
  type ReplaySnapshot,
} from '../hooks/useLedgerReplay.js';
import { formatCurrency } from '../lib/financeUtils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: string | null): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts));
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  completed: { label: 'Klar',       className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',  icon: CheckCircle2 },
  divergent: { label: 'Avvikelse',  className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',          icon: AlertTriangle },
  failed:    { label: 'Misslyckad', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: AlertTriangle },
  running:   { label: 'Körs...',    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',       icon: Loader2 },
  pending:   { label: 'Väntar',     className: 'bg-muted text-muted-foreground',                                         icon: Clock },
};

function RunStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['pending']!;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Latest run card ──────────────────────────────────────────────────────────

function LatestRunCard({
  periodId,
  onSelectRun,
}: {
  periodId: string;
  onSelectRun: (runId: string) => void;
}) {
  const { data: run, isLoading } = useLatestReplayRun(periodId);
  const runReplay   = useRunPeriodReplay();
  const validateBal = useValidatePeriodBalance();

  function handleReplay() {
    runReplay.mutate(periodId, {
      onSuccess: (r) => {
        toast({ title: 'Replay startad', description: `Status: ${r.status}` });
        onSelectRun(r.id);
      },
      onError: (e) => toast({ title: 'Fel', description: String(e), variant: 'destructive' }),
    });
  }

  function handleValidate() {
    validateBal.mutate(periodId, {
      onSuccess: (result) => {
        if (result.passed) {
          toast({ title: 'Balansen stämmer', description: `Alla ${result.total_accounts} konton är korrekta.` });
        } else {
          toast({
            title:       'Avvikelser hittades',
            description: `${result.divergent_accounts} av ${result.total_accounts} konton avviker.`,
            variant:     'destructive',
          });
        }
      },
      onError: (e) => toast({ title: 'Fel', description: String(e), variant: 'destructive' }),
    });
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 animate-pulse space-y-3">
        <div className="h-4 bg-muted rounded w-1/3" />
        <div className="h-8 bg-muted rounded w-1/2" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ChartBar className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Senaste replay</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PermissionGate permission={Permissions.FINANCE_REPLAY_MANAGE}>
            <Button
              size="sm"
              variant="outline"
              onClick={handleValidate}
              disabled={validateBal.isPending}
            >
              {validateBal.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
              Validera balans
            </Button>
            <Button
              size="sm"
              onClick={handleReplay}
              disabled={runReplay.isPending}
            >
              {runReplay.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Kör replay
            </Button>
          </PermissionGate>
        </div>
      </div>

      {run == null ? (
        <p className="text-sm text-muted-foreground">Ingen replay körts för denna period ännu.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <RunStatusBadge status={run.status} />
            <span className="text-xs text-muted-foreground">{formatTs(run.completed_at ?? run.created_at)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Totalt konton</p>
              <p className="text-base font-semibold text-foreground">{run.total_accounts ?? '—'}</p>
            </div>
            <div className={`rounded-md px-3 py-2 ${(run.divergent_count ?? 0) > 0 ? 'bg-red-50 dark:bg-red-950/20' : 'bg-muted/40'}`}>
              <p className="text-xs text-muted-foreground">Avvikande konton</p>
              <p className={`text-base font-semibold ${(run.divergent_count ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                {run.divergent_count ?? '—'}
              </p>
            </div>
          </div>
          <button
            className="text-xs text-primary hover:underline flex items-center gap-1"
            onClick={() => onSelectRun(run.id)}
          >
            Visa snapshots <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Run history table ────────────────────────────────────────────────────────

function RunHistoryTable({
  periodId,
  selectedRunId,
  onSelect,
}: {
  periodId: string;
  selectedRunId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data: runs = [], isLoading } = useReplayRunsByPeriod(periodId);

  if (isLoading) return <div className="animate-pulse h-20 bg-muted rounded-lg" />;
  if (runs.length === 0) return <p className="text-sm text-muted-foreground py-4">Ingen körhistorik.</p>;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Körd</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Konton</th>
            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Avvikelser</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {runs.map((run) => (
            <tr
              key={run.id}
              className={`cursor-pointer hover:bg-muted/30 transition-colors ${selectedRunId === run.id ? 'bg-primary/5' : ''}`}
              onClick={() => onSelect(run.id)}
            >
              <td className="px-4 py-2.5 text-muted-foreground">{formatTs(run.completed_at ?? run.created_at)}</td>
              <td className="px-4 py-2.5"><RunStatusBadge status={run.status} /></td>
              <td className="px-4 py-2.5 text-right">{run.total_accounts ?? '—'}</td>
              <td className="px-4 py-2.5 text-right">
                {(run.divergent_count ?? 0) > 0
                  ? <span className="text-red-600 dark:text-red-400 font-medium">{run.divergent_count}</span>
                  : <span className="text-muted-foreground">{run.divergent_count ?? '—'}</span>
                }
              </td>
              <td className="px-4 py-2.5 text-right">
                <ChevronRight className="w-4 h-4 text-muted-foreground inline" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Snapshot panel ───────────────────────────────────────────────────────────

type SnapshotFilter = 'all' | 'divergent';

function SnapshotPanel({ runId }: { runId: string }) {
  const [filter, setFilter] = useState<SnapshotFilter>('all');

  const { data: allSnaps = [],       isLoading: loadAll } = useReplaySnapshots(runId);
  const { data: divSnaps = [],        isLoading: loadDiv } = useDivergentSnapshots(runId);

  const isLoading = loadAll || loadDiv;
  const snaps: ReplaySnapshot[] = filter === 'divergent' ? divSnaps : allSnaps;

  return (
    <div className="rounded-lg border border-border bg-card space-y-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Kontosnapshots</span>
        <div className="flex items-center rounded border border-input bg-background p-0.5 gap-0.5">
          {(['all', 'divergent'] as SnapshotFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {f === 'all' ? 'Alla' : `Avvikande (${divSnaps.length})`}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse h-32 bg-muted/40" />
      ) : snaps.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">
          {filter === 'divergent' ? 'Inga avvikelser hittades.' : 'Inga snapshots.'}
        </p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Konto</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Förväntad</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Inspelad</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Skillnad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {snaps.map((s) => (
                <tr
                  key={s.id}
                  className={s.has_divergence ? 'bg-red-50/50 dark:bg-red-950/10' : ''}
                >
                  <td className="px-4 py-2 font-mono text-xs">
                    {s.has_divergence && <AlertTriangle className="w-3 h-3 text-red-500 inline mr-1.5" />}
                    {s.account_code}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {s.expected_balance !== null ? formatCurrency(s.expected_balance, 'SEK') : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {s.replayed_balance !== null ? formatCurrency(s.replayed_balance, 'SEK') : '—'}
                  </td>
                  <td className={`px-4 py-2 text-right font-medium ${s.has_divergence ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                    {s.divergence_amount !== null
                      ? (s.has_divergence ? formatCurrency(Math.abs(s.divergence_amount), 'SEK') : '—')
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Divergent runs alert ─────────────────────────────────────────────────────

function DivergentRunsAlert() {
  const { data: runs = [] } = useDivergentRuns();

  if (runs.length === 0) return null;

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20">
      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800 dark:text-red-300">
          {runs.length} period{runs.length !== 1 ? 'er' : ''} med avvikelser
        </p>
        <p className="text-xs text-red-700/70 dark:text-red-400/70 mt-0.5">
          {runs.map((r) => r.period_id.slice(0, 8)).join(', ')} — kör replay för att verifiera.
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LedgerReplayPage() {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [selectedRunId,    setSelectedRunId]    = useState<string | null>(null);

  const { data: periods = [], isLoading: periodsLoading } = useFinancialPeriods();

  function handleSelectPeriod(id: string) {
    setSelectedPeriodId(id);
    setSelectedRunId(null);
  }

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  return (
    <PageLayout>
      <PageHeader
        title="Ledger Replay"
        description="Deterministisk verifiering av bokföringsbalansen per period"
        breadcrumbs={[
          { label: 'Ekonomi', href: '/finance' },
          { label: 'Ledger Replay' },
        ]}
      />

      <PageContent>
        <div className="space-y-6 max-w-4xl">

          <DivergentRunsAlert />

          {/* Period selector */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <p className="text-sm font-semibold text-foreground">Välj period</p>
            {periodsLoading ? (
              <div className="animate-pulse flex gap-2 flex-wrap">
                {[1,2,3].map((i) => (
                  <div key={i} className="h-8 w-32 bg-muted rounded" />
                ))}
              </div>
            ) : periods.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga perioder hittades.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {periods.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPeriod(p.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      selectedPeriodId === p.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border bg-background hover:bg-muted/50 text-foreground'
                    }`}
                  >
                    <CircleDot className={`w-3 h-3 ${p.status === 'open' ? 'text-green-500' : 'text-muted-foreground'}`} />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Period detail */}
          {selectedPeriodId && selectedPeriod && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">{selectedPeriod.name}</h2>
                <Badge variant="outline" className="text-xs capitalize">{selectedPeriod.status}</Badge>
              </div>

              <LatestRunCard
                periodId={selectedPeriodId}
                onSelectRun={setSelectedRunId}
              />

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Körhistorik</p>
                <RunHistoryTable
                  periodId={selectedPeriodId}
                  selectedRunId={selectedRunId}
                  onSelect={setSelectedRunId}
                />
              </div>

              {selectedRunId && (
                <SnapshotPanel runId={selectedRunId} />
              )}
            </div>
          )}

          {!selectedPeriodId && !periodsLoading && periods.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <ChartBar className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Välj en period ovan för att se replay-status.</p>
            </div>
          )}

        </div>
      </PageContent>
    </PageLayout>
  );
}
