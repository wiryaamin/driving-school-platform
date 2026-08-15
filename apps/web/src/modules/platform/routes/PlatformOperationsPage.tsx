import { Link } from 'react-router-dom';
import { Clock, RefreshCw, AlertCircle, ShieldAlert, Cpu } from 'lucide-react';
import { Skeleton } from '@platform/ui';
import { humanizeIdentifier } from '@platform/utils';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePlatformOperationsSummary, useWorkerRunSummary } from '../hooks/usePlatformOpsCenter.js';

/**
 * Operations Center — platform-wide queue/worker health, consolidating what
 * previously only existed one organization at a time (Organization Detail's
 * Drift tab) or buried in the Dashboard (worker health card). Reuses
 * `get_platform_operations_summary` (new, but built on the existing
 * event_outbox_health view) and the pre-existing worker-run summary hook.
 */
function StatCard({ label, value, icon: Icon, loading, danger }: { label: string; value: number; icon: React.ElementType; loading: boolean; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', danger && value > 0 ? 'bg-destructive/10' : 'bg-primary/10')}>
        <Icon className={cn('w-4 h-4', danger && value > 0 ? 'text-destructive' : 'text-primary')} />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        {loading ? <Skeleton className="h-6 w-10 mt-1" /> : <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>}
      </div>
    </div>
  );
}

const RUN_STATUS_LABEL: Record<string, string> = { completed: 'OK', partial: 'Delvis', failed: 'Misslyckad', running: 'Pågår' };
const RUN_STATUS_CLASS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  partial:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  failed:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  running:   'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
};

export function PlatformOperationsPage() {
  const { data: summary, isLoading: summaryLoading, error: summaryError } = usePlatformOperationsSummary();
  const { data: workers, isLoading: workersLoading } = useWorkerRunSummary();

  return (
    <PageLayout>
      <PageHeader title="Drift" description="Kö-hälsa, dead-letter-händelser och worker-status över hela plattformen" />

      {summaryError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Driftöversikt ej tillgänglig</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Väntande"     value={summary?.pending_count     ?? 0} icon={Clock}       loading={summaryLoading} />
        <StatCard label="Bearbetas"    value={summary?.processing_count  ?? 0} icon={RefreshCw}    loading={summaryLoading} />
        <StatCard label="Dead-letter"  value={summary?.dead_letter_count ?? 0} icon={AlertCircle}  loading={summaryLoading} danger />
        <StatCard label="Misslyckade"  value={summary?.failed_count      ?? 0} icon={ShieldAlert}  loading={summaryLoading} danger />
      </div>

      {/* Worker health */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Worker-hälsa</p>
        </div>
        {workersLoading && <div className="px-4 py-4 space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>}
        {!workersLoading && (workers ?? []).length === 0 && (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">Ingen worker-körning registrerad ännu</p>
        )}
        {!workersLoading && (workers ?? []).length > 0 && (
          <div className="divide-y divide-border">
            {(workers ?? []).map(w => (
              <div key={w.worker_name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground font-mono">{w.worker_name}</p>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold', RUN_STATUS_CLASS[w.last_run_status] ?? 'bg-muted text-muted-foreground')}>
                    {RUN_STATUS_LABEL[w.last_run_status] ?? w.last_run_status}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">24h: {w.runs_24h} körningar · {w.failed_24h} fel</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top offenders */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Organisationer med kö-problem</p>
        </div>
        {!summaryLoading && (summary?.top_offenders ?? []).length === 0 && (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">Inga köproblem just nu</p>
        )}
        {(summary?.top_offenders ?? []).length > 0 && (
          <div className="divide-y divide-border">
            {summary!.top_offenders.map((o, i) => (
              <Link key={i} to={`/platform/organizations/${o.organization_id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{o.org_name ?? o.organization_id}</p>
                  <p className="text-xs text-muted-foreground" title={o.event_type}>{humanizeIdentifier(o.event_type)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  {o.dead_letter_count > 0 && <span className="text-destructive font-semibold">{o.dead_letter_count} dead-letter</span>}
                  {o.pending_count > 0 && <span className="text-muted-foreground">{o.pending_count} väntande</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
