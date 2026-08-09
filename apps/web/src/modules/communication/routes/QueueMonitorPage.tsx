import { RefreshCw, RotateCcw, Inbox, AlertTriangle, Clock, Skull } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Button, toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useQueueHealth, useBulkRetry, useOutboxHealth, useRequeueDeadLetters } from '../hooks/useCommunication.js';
import { ChannelBadge } from '../components/ChannelIcon.js';
import type { CommChannel, QueueHealthChannel, OutboxHealthEventType } from '../hooks/useCommunication.js';

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
          <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
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
          </PermissionGate>
        )}
      </td>
    </tr>
  );
}

// ─── QueueMonitorPage ─────────────────────────────────────────────────────────

export function QueueMonitorPage() {
  const { data: health, isLoading, refetch, isFetching } = useQueueHealth();
  const { data: outboxHealth, isLoading: outboxLoading } = useOutboxHealth();
  const bulkRetry = useBulkRetry();
  const requeueDeadLetters = useRequeueDeadLetters();

  function handleRetry(channel?: CommChannel) {
    bulkRetry.mutate(channel, {
      onSuccess: (r) => toast({ title: `${r.retried} meddelanden återköade` }),
      onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
    });
  }

  function handleRequeueDeadLetters(eventType?: string) {
    requeueDeadLetters.mutate(eventType, {
      onSuccess: (r) => toast({ title: `${r.requeued} händelser återköade` }),
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
      <SubscriptionGate feature="communication:templates:manage">

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
              <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRetry(undefined)}
                  disabled={bulkRetry.isPending}
                >
                  <RotateCcw className={cn('w-3.5 h-3.5 mr-1.5', bulkRetry.isPending && 'animate-spin')} />
                  Retry alla ({health!.total_retryable})
                </Button>
              </PermissionGate>
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

        {/* Event-outbox backlog (Epic 7.4) */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Händelsekö (event-worker)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Bakgrundshändelser som väntar på bearbetning</p>
            </div>
            {!outboxLoading && (outboxHealth?.total_dead_letter ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  <Skull className="w-3 h-3" />
                  {outboxHealth!.total_dead_letter} i dead-letter
                </span>
                <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRequeueDeadLetters(undefined)}
                    disabled={requeueDeadLetters.isPending}
                    className="h-7 text-xs gap-1"
                  >
                    <RotateCcw className={cn('w-3 h-3', requeueDeadLetters.isPending && 'animate-spin')} />
                    Återköa alla
                  </Button>
                </PermissionGate>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 px-4 py-3 border-b border-border">
            <div>
              <p className="text-xs text-muted-foreground">Väntande</p>
              <p className="text-lg font-bold tabular-nums">{outboxLoading ? '—' : outboxHealth?.total_pending ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bearbetas</p>
              <p className="text-lg font-bold tabular-nums">{outboxLoading ? '—' : outboxHealth?.total_processing ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Äldst väntande</p>
              <p className="text-lg font-bold tabular-nums">{outboxLoading ? '—' : formatAge(outboxHealth?.oldest_pending_at ?? null)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Händelsetyp</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Väntande</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Bearbetas</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Dead-letter</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Äldst väntande</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {outboxLoading ? (
                  Array.from({ length: 2 }, (_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }, (_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (outboxHealth?.by_event_type ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center">
                      <p className="text-sm text-muted-foreground">Inga väntande bakgrundshändelser.</p>
                    </td>
                  </tr>
                ) : (
                  (outboxHealth?.by_event_type ?? []).map((row: OutboxHealthEventType) => (
                    <tr key={row.event_type} className="hover:bg-accent/10 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-foreground">{row.event_type}</td>
                      <td className="px-4 py-3 text-xs font-mono text-foreground tabular-nums">{row.pending_count}</td>
                      <td className="px-4 py-3 text-xs font-mono text-foreground tabular-nums">{row.processing_count}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'text-xs font-mono tabular-nums',
                          row.dead_letter_count > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground',
                        )}>
                          {row.dead_letter_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatAge(row.oldest_pending_at)}</td>
                      <td className="px-4 py-3">
                        {row.dead_letter_count > 0 && (
                          <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRequeueDeadLetters(row.event_type)}
                              disabled={requeueDeadLetters.isPending}
                              className="h-7 text-xs gap-1"
                            >
                              <RotateCcw className={cn('w-3 h-3', requeueDeadLetters.isPending && 'animate-spin')} />
                              Återköa ({row.dead_letter_count})
                            </Button>
                          </PermissionGate>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </SubscriptionGate>
      </PageContent>
    </PageLayout>
  );
}
