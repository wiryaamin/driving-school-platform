import { RefreshCw, RotateCcw, Inbox, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Button, toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { useQueueHealth, useBulkRetry } from '../hooks/useCommunication.js';
import { ChannelBadge } from '../components/ChannelIcon.js';
import type { CommChannel, QueueHealthChannel } from '../hooks/useCommunication.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAge(iso: string | null): string {
  if (!iso) return '—';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1)   return 'just nu';
  if (mins < 60)  return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24)     return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// ─── Channel row ──────────────────────────────────────────────────────────────

function ChannelRow({
  row,
  onRetry,
  pending,
}: {
  row:     QueueHealthChannel;
  onRetry: (channel: CommChannel) => void;
  pending: boolean;
}) {
  return (
    <tr className="hover:bg-accent/10 transition-colors">
      <td className="px-4 py-3">
        <ChannelBadge channel={row.channel} />
      </td>
      <td className="px-4 py-3 text-xs font-mono text-foreground tabular-nums">
        {row.queued_count}
      </td>
      <td className="px-4 py-3 text-xs font-mono text-foreground tabular-nums">
        {row.sending_count}
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'text-xs font-mono tabular-nums',
          row.failed_total > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground',
        )}>
          {row.failed_total}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'text-xs font-mono tabular-nums',
          row.retryable_count > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground',
        )}>
          {row.retryable_count}
        </span>
      </td>
      <td className="px-4 py-3">
        {row.retryable_count > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRetry(row.channel)}
            disabled={pending}
            className="h-7 text-xs gap-1"
          >
            <RotateCcw className={cn('w-3 h-3', pending && 'animate-spin')} />
            Retry ({row.retryable_count})
          </Button>
        )}
      </td>
    </tr>
  );
}

// ─── QueueMonitorPage ─────────────────────────────────────────────────────────

export function QueueMonitorPage() {
  const { data: health, isLoading, refetch, isFetching } = useQueueHealth();
  const bulkRetry = useBulkRetry();

  function handleRetry(channel?: CommChannel) {
    bulkRetry.mutate(channel, {
      onSuccess: (r) => toast({ title: `${r.retried} meddelanden återköade` }),
      onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
    });
  }

  const channels = health?.by_channel ?? [];

  return (
    <PageLayout>
      <PageHeader
        title="Kömonitor"
        description="Realtidsstatus för meddelandekön — uppdateras automatiskt var 30:e sekund"
        breadcrumbs={[
          { label: 'Kommunikation', href: '/communication' },
          { label: 'Kömonitor' },
        ]}
      />

      <PageContent>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
            <Inbox className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">I kö</p>
              <p className="text-xl font-bold tabular-nums">{health?.total_queued ?? '—'}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
            <AlertTriangle className={cn(
              'w-4 h-4 shrink-0',
              (health?.total_retryable ?? 0) > 0 ? 'text-amber-500' : 'text-muted-foreground',
            )} />
            <div>
              <p className="text-xs text-muted-foreground">Väntar på retry</p>
              <p className={cn(
                'text-xl font-bold tabular-nums',
                (health?.total_retryable ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : '',
              )}>
                {health?.total_retryable ?? '—'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Äldst i kö</p>
              <p className="text-xl font-bold tabular-nums">{formatAge(health?.oldest_queued_at ?? null)}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Automatisk uppdatering var 30:e sekund</p>
          <div className="flex items-center gap-2">
            {(health?.total_retryable ?? 0) > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRetry(undefined)}
                disabled={bulkRetry.isPending}
              >
                <RotateCcw className={cn('w-3.5 h-3.5 mr-1.5', bulkRetry.isPending && 'animate-spin')} />
                Retry alla ({health!.total_retryable})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', isFetching && 'animate-spin')} />
              Uppdatera
            </Button>
          </div>
        </div>

        {/* Channel breakdown table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Breakdown per kanal</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Kanal</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">I kö</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Skickar</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Misslyckade</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Retryabla</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 3 }, (_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }, (_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : channels.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Inbox className="w-8 h-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">Kön är tom — inga aktiva meddelanden.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  channels.map((row) => (
                    <ChannelRow
                      key={row.channel}
                      row={row}
                      onRetry={handleRetry}
                      pending={bulkRetry.isPending}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </PageContent>
    </PageLayout>
  );
}
