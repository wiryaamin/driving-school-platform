import { useState } from 'react';
import { RefreshCw, RotateCcw, X, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Button, toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useMessageList,
  useRetryMessage,
  useCancelMessage,
  type MsgStatus,
  type CommChannel,
} from '../hooks/useCommunication.js';
import { ChannelBadge, StatusBadge } from '../components/ChannelIcon.js';

// ─── Filter state ─────────────────────────────────────────────────────────────

const STATUS_OPTS: Array<{ value: MsgStatus | 'all'; label: string }> = [
  { value: 'all',       label: 'Alla' },
  { value: 'queued',    label: 'I kö' },
  { value: 'sending',   label: 'Skickar' },
  { value: 'sent',      label: 'Skickat' },
  { value: 'delivered', label: 'Levererat' },
  { value: 'failed',    label: 'Misslyckades' },
  { value: 'bounced',   label: 'Bounced' },
  { value: 'cancelled', label: 'Avbröts' },
];

const CHANNEL_OPTS: Array<{ value: CommChannel | 'all'; label: string }> = [
  { value: 'all',      label: 'Alla kanaler' },
  { value: 'sms',      label: 'SMS' },
  { value: 'email',    label: 'E-post' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'push',     label: 'Push' },
  { value: 'voice',    label: 'AI Röst' },
];

// ─── Relative time formatter ──────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)         return 'just nu';
  if (diff < 3600_000)       return `${Math.floor(diff / 60_000)} min sedan`;
  if (diff < 86_400_000)     return `${Math.floor(diff / 3600_000)} h sedan`;
  return new Date(iso).toLocaleDateString('sv-SE');
}

// ─── MessageRow ───────────────────────────────────────────────────────────────

function MessageRow({
  msg,
}: {
  msg: {
    id:                  string;
    channel:             string;
    recipient_address:   string;
    subject:             string | null;
    body:                string;
    status:              string;
    provider:            string | null;
    error_message:       string | null;
    retry_count:         number;
    max_retries:         number;
    retry_after:         string | null;
    created_at:          string;
    sent_at:             string | null;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const retry  = useRetryMessage();
  const cancel = useCancelMessage();

  const canRetry  = msg.status === 'failed' && msg.retry_count < msg.max_retries;
  const canCancel = msg.status === 'queued';

  function handleRetry() {
    retry.mutate(msg.id, {
      onSuccess: () => toast({ title: 'Meddelande köat för återförsök' }),
      onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
    });
  }

  function handleCancel() {
    cancel.mutate(msg.id, {
      onSuccess: () => toast({ title: 'Meddelande avbrutet' }),
      onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
    });
  }

  return (
    <>
      <tr
        className="hover:bg-accent/20 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3 whitespace-nowrap">
          <ChannelBadge channel={msg.channel as CommChannel} />
        </td>
        <td className="px-4 py-3">
          <span className="text-sm text-foreground block truncate max-w-[180px]">{msg.recipient_address}</span>
        </td>
        <td className="px-4 py-3 max-w-xs">
          <span className="text-xs text-muted-foreground line-clamp-1">
            {msg.subject ?? msg.body.slice(0, 60)}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <StatusBadge status={msg.status} />
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
          {msg.provider ?? '—'}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
          {relativeTime(msg.created_at)}
        </td>
        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            {canRetry && (
              <button
                onClick={handleRetry}
                disabled={retry.isPending}
                className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Försök igen"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={cancel.isPending}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Avbryt"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="col-span-2">
                <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Meddelande</p>
                <p className="text-foreground whitespace-pre-wrap font-mono text-[11px]">{msg.body}</p>
              </div>
              <div className="space-y-2">
                {msg.error_message && (
                  <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{msg.error_message}</span>
                  </div>
                )}
                {msg.retry_after && (
                  <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                    <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Nästa försök: {new Date(msg.retry_after).toLocaleString('sv-SE')}</span>
                  </div>
                )}
                <div className="text-muted-foreground">
                  <span>Försök: {msg.retry_count} / {msg.max_retries}</span>
                </div>
                {msg.sent_at && (
                  <div className="text-muted-foreground">
                    <span>Skickat: {new Date(msg.sent_at).toLocaleString('sv-SE')}</span>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── ActivityCenterPage ───────────────────────────────────────────────────────

export function ActivityCenterPage() {
  const [statusFilter,  setStatusFilter]  = useState<MsgStatus | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<CommChannel | 'all'>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useMessageList({
    status:   statusFilter  === 'all' ? undefined : statusFilter,
    channel:  channelFilter === 'all' ? undefined : channelFilter,
    page,
    per_page: 25,
  });

  const messages = data?.data ?? [];
  const total    = data?.meta?.total ?? 0;
  const pages    = Math.ceil(total / 25);

  return (
    <PageLayout>
      <PageHeader
        title="Aktivitetscenter"
        description="Övervaka skickade meddelanden, felstatus och automatiska återförsök"
        breadcrumbs={[
          { label: 'Kommunikation', href: '/communication' },
          { label: 'Aktivitetscenter' },
        ]}
      />

      <PageContent>

        {/* Filters + refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter */}
          <div className="flex items-center gap-1">
            {STATUS_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { setStatusFilter(o.value); setPage(1); }}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-full border transition-colors',
                  statusFilter === o.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Channel filter */}
          <select
            value={channelFilter}
            onChange={(e) => { setChannelFilter(e.target.value as CommChannel | 'all'); setPage(1); }}
            className="h-8 px-2 text-xs border border-border rounded-md bg-background text-foreground focus:outline-none"
          >
            {CHANNEL_OPTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="ml-auto"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', isFetching && 'animate-spin')} />
            Uppdatera
          </Button>
        </div>

        {/* Stats summary */}
        {total > 0 && (
          <p className="text-xs text-muted-foreground">
            Visar {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} av {total} meddelanden
          </p>
        )}

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Kanal</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Mottagare</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Meddelande</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Leverantör</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Tid</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 8 }, (_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }, (_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : messages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                      Inga meddelanden matchar filtret.
                    </td>
                  </tr>
                ) : (
                  messages.map((msg) => (
                    <MessageRow key={msg.id} msg={msg} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Föregående
            </Button>
            <span className="text-xs text-muted-foreground">{page} / {pages}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Nästa
            </Button>
          </div>
        )}

      </PageContent>
    </PageLayout>
  );
}
