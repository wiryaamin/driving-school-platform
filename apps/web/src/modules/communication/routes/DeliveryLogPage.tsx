import { useState } from 'react';
import { RefreshCcw, RotateCcw, X, Filter } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { toast } from '@platform/ui';
import { formatDateShort, formatTime, formatDateTime } from '@platform/utils';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useMessageList, useRetryMessage, useCancelMessage } from '../hooks/useCommunication.js';
import { ChannelBadge, StatusBadge } from '../components/ChannelIcon.js';
import type { CommChannel, MsgStatus, OutboundMessage } from '../hooks/useCommunication.js';

const ALL_CHANNELS: Array<{ value: CommChannel | ''; label: string }> = [
  { value: '',          label: 'Alla kanaler' },
  { value: 'sms',      label: 'SMS' },
  { value: 'email',    label: 'E-post' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'push',     label: 'Push' },
  { value: 'voice',    label: 'AI Röst' },
];

const ALL_STATUSES: Array<{ value: MsgStatus | ''; label: string }> = [
  { value: '',          label: 'Alla statusar' },
  { value: 'queued',   label: 'I kö' },
  { value: 'sending',  label: 'Skickar' },
  { value: 'sent',     label: 'Skickat' },
  { value: 'delivered', label: 'Levererat' },
  { value: 'failed',   label: 'Misslyckades' },
  { value: 'bounced',  label: 'Bounced' },
  { value: 'cancelled', label: 'Avbröts' },
];

// ─── Message row ──────────────────────────────────────────────────────────────

function MessageRow({
  msg,
  onRetry,
  onCancel,
}: {
  msg:      OutboundMessage;
  onRetry:  (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canRetry  = msg.status === 'failed' && msg.retry_count < msg.max_retries;
  const canCancel = msg.status === 'queued';

  return (
    <>
      <tr
        className="hover:bg-accent/20 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3 whitespace-nowrap">
          <ChannelBadge channel={msg.channel} />
        </td>
        <td className="px-4 py-3">
          <span className="text-sm text-foreground">{msg.recipient_address}</span>
        </td>
        <td className="px-4 py-3 max-w-xs">
          <span className="text-sm text-muted-foreground truncate block">
            {msg.body.slice(0, 50)}{msg.body.length > 50 ? '…' : ''}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <StatusBadge status={msg.status} />
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground font-mono">
          {/* The most specific event that has actually happened for this
              message — delivered, else sent, else just created/queued —
              always Europe/Stockholm regardless of viewer device timezone. */}
          {formatDateShort(msg.delivered_at ?? msg.sent_at ?? msg.created_at)}{' '}
          <span className="text-muted-foreground/60">|</span>{' '}
          {formatTime(msg.delivered_at ?? msg.sent_at ?? msg.created_at)}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
              <>
                {canRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(msg.id)}
                    title="Försök igen"
                    className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                {canCancel && (
                  <button
                    type="button"
                    onClick={() => onCancel(msg.id)}
                    title="Avbryt"
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            </PermissionGate>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Meddelande</p>
                <p className="text-foreground whitespace-pre-wrap">{msg.body}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Detaljer</p>
                <p className="text-muted-foreground">Leverantör: {msg.provider ?? '—'}</p>
                <p className="text-muted-foreground">Leverantörs-ID: {msg.provider_message_id ?? '—'}</p>
                <p className="text-muted-foreground">Retries: {msg.retry_count}/{msg.max_retries}</p>
                {msg.sent_at && <p className="text-muted-foreground">Skickat: {formatDateTime(msg.sent_at)}</p>}
                {msg.delivered_at && <p className="text-muted-foreground">Levererat: {formatDateTime(msg.delivered_at)}</p>}
                {msg.scheduled_at && <p className="text-muted-foreground">Schemalagt: {formatDateTime(msg.scheduled_at)}</p>}
              </div>
              {msg.error_message && (
                <div>
                  <p className="font-semibold text-destructive uppercase tracking-wide mb-1">Fel</p>
                  <p className="text-destructive text-xs">{msg.error_message}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── DeliveryLogPage ──────────────────────────────────────────────────────────

export function DeliveryLogPage() {
  const [channel,  setChannel]  = useState<CommChannel | ''>('');
  const [status,   setStatus]   = useState<MsgStatus | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const [page,     setPage]     = useState(1);

  const { data, isLoading, refetch, isFetching } = useMessageList({
    channel:  channel  || undefined,
    status:   status   || undefined,
    from:     fromDate ? `${fromDate}T00:00:00Z` : undefined,
    to:       toDate   ? `${toDate}T23:59:59Z`   : undefined,
    page,
    per_page: 50,
  });

  const retry  = useRetryMessage();
  const cancel = useCancelMessage();

  const messages    = data?.data ?? [];
  const total       = data?.meta.total ?? 0;
  const totalPages  = Math.ceil(total / 50);

  function handleRetry(id: string) {
    retry.mutate(id, {
      onSuccess: () => { toast({ title: 'Nytt försök skickat' }); },
      onError:   () => { toast({ title: 'Retry misslyckades', variant: 'destructive' }); },
    });
  }

  function handleCancel(id: string) {
    cancel.mutate(id, {
      onSuccess: () => { toast({ title: 'Meddelande avbrutet' }); },
      onError:   () => { toast({ title: 'Kunde inte avbryta', variant: 'destructive' }); },
    });
  }

  return (
    <PageLayout>
      <PageHeader
        title="Leveranslogg"
        description="Spåra status för alla skickade meddelanden"
        breadcrumbs={[
          { label: 'Kommunikation', href: '/communication' },
          { label: 'Leveranslogg' },
        ]}
      />

      <PageContent>
      <SubscriptionGate feature="communication:templates:manage">

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-border bg-card">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

          <select
            value={channel}
            onChange={(e) => { setChannel(e.target.value as CommChannel | ''); setPage(1); }}
            className="h-8 text-xs px-2 border border-border rounded bg-background text-foreground focus:outline-none"
          >
            {ALL_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as MsgStatus | ''); setPage(1); }}
            className="h-8 text-xs px-2 border border-border rounded bg-background text-foreground focus:outline-none"
          >
            {ALL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="h-8 text-xs px-2 border border-border rounded bg-background text-foreground focus:outline-none"
            placeholder="Från datum"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="h-8 text-xs px-2 border border-border rounded bg-background text-foreground focus:outline-none"
            placeholder="Till datum"
          />

          <button
            onClick={() => refetch()}
            className={cn(
              'ml-auto p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors',
              isFetching && 'animate-spin',
            )}
          >
            <RefreshCcw className="w-3.5 h-3.5" />
          </button>
        </div>

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
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Tid</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }, (_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : messages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <p className="text-sm text-muted-foreground">Inga meddelanden hittades.</p>
                    </td>
                  </tr>
                ) : (
                  messages.map((msg) => (
                    <MessageRow
                      key={msg.id}
                      msg={msg}
                      onRetry={handleRetry}
                      onCancel={handleCancel}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 50 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20">
              <span className="text-xs text-muted-foreground">
                {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} av {total} meddelanden
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-xs border border-border rounded hover:bg-accent disabled:opacity-40"
                >
                  Föregående
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 text-xs border border-border rounded hover:bg-accent disabled:opacity-40"
                >
                  Nästa
                </button>
              </div>
            </div>
          )}
        </div>

      </SubscriptionGate>
      </PageContent>
    </PageLayout>
  );
}
