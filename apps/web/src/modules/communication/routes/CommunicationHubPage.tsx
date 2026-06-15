import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  MessageSquare, Mail, Bell, Mic, Settings, Send,
  CheckCircle2, XCircle, Clock, BarChart3,
  ChevronRight, Plus, RefreshCcw, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { Button, toast } from '@platform/ui';
import { useChannelConfigs, useCommAnalytics, useQueueHealth, useUpdateChannelConfig } from '../hooks/useCommunication.js';
import { ChannelBadge, StatusBadge, CHANNEL_META } from '../components/ChannelIcon.js';
import type { CommChannel, ChannelConfig } from '../hooks/useCommunication.js';

// ─── Channel status card ──────────────────────────────────────────────────────

function ChannelCard({ config, onToggle }: {
  config:   ChannelConfig;
  onToggle: (channel: CommChannel, enabled: boolean) => void;
}) {
  const meta = CHANNEL_META[config.channel];
  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 flex flex-col gap-3',
      config.enabled ? 'border-border' : 'border-border/50 opacity-70',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', meta.bg)}>
          <meta.Icon className={cn('w-4 h-4', meta.text)} />
        </div>
        <button
          type="button"
          onClick={() => onToggle(config.channel, !config.enabled)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent',
            'transition-colors focus:outline-none',
            config.enabled ? 'bg-primary' : 'bg-muted',
          )}
          role="switch"
          aria-checked={config.enabled}
        >
          <span className={cn(
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            config.enabled ? 'translate-x-4' : 'translate-x-0',
          )} />
        </button>
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">{meta.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {config.enabled
            ? config.provider
              ? `Via ${config.provider}`
              : 'Aktiverad — konfigurera leverantör'
            : 'Inaktiverad'}
        </p>
        {config.from_address && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 font-mono truncate">
            {config.from_address}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
        <span className={cn(
          'text-[10px] font-semibold px-2 py-0.5 rounded-full',
          config.enabled
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground/60',
        )}>
          {config.enabled ? 'Aktiv' : 'Inaktiv'}
        </span>
        <Link
          to="/communication/settings"
          className="text-xs text-primary hover:underline flex items-center gap-0.5"
        >
          Konfigurera <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ─── Empty channel card (for channels not yet configured) ─────────────────────

function EmptyChannelCard({ channel }: { channel: CommChannel }) {
  const meta = CHANNEL_META[channel];
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 flex flex-col gap-3 opacity-50">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', meta.bg)}>
        <meta.Icon className={cn('w-4 h-4', meta.text)} />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{meta.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Inte konfigurerad</p>
      </div>
    </div>
  );
}

// ─── Recent messages table ────────────────────────────────────────────────────

function RecentMessages() {
  const { data, isLoading, refetch } = useMessageList({ per_page: 10 });
  const messages = data?.data ?? [];

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Senaste meddelanden</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Uppdatera"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
          </button>
          <Link
            to="/communication/log"
            className="text-xs text-primary hover:underline flex items-center gap-0.5"
          >
            Visa alla <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-muted rounded animate-pulse w-2/3" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-2 text-center">
          <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Inga meddelanden skickade ännu.</p>
          <Link to="/communication/compose" className="text-xs text-primary hover:underline">
            Skicka ditt första meddelande →
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {messages.map((msg) => (
            <div key={msg.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition-colors">
              <ChannelBadge channel={msg.channel} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{msg.recipient_address}</p>
                <p className="text-xs text-muted-foreground truncate">{msg.body.slice(0, 60)}{msg.body.length > 60 ? '…' : ''}</p>
              </div>
              <div className="shrink-0 text-right space-y-0.5">
                <StatusBadge status={msg.status} />
                <p className="text-[10px] text-muted-foreground">
                  {new Date(msg.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ total, sent, failed, pending }: {
  total: number; sent: number; failed: number; pending: number;
}) {
  const rate = total > 0 ? Math.round((sent / total) * 100) : 0;
  return (
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: 'Senaste 24h', value: total, icon: BarChart3,    color: 'text-foreground' },
        { label: 'Skickade',    value: sent,  icon: CheckCircle2, color: 'text-emerald-600' },
        { label: 'Misslyckade', value: failed, icon: XCircle,     color: 'text-destructive' },
        { label: 'Leveransgrad', value: `${rate}%`, icon: Send,   color: 'text-primary' },
      ].map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
          <Icon className={cn('w-4 h-4 shrink-0', color)} />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-base font-bold text-foreground tabular-nums">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── CommunicationHubPage ─────────────────────────────────────────────────────

const ALL_CHANNELS: CommChannel[] = ['sms', 'email', 'whatsapp', 'push', 'voice'];

export function CommunicationHubPage() {
  const navigate    = useNavigate();
  const { data: configs = [], isLoading } = useChannelConfigs();
  const updateCfg   = useUpdateChannelConfig();

  // Analytics (last 24 h) — replaces the overfetch of 200 raw rows
  const { data: analytics = [] } = useCommAnalytics(1);
  const { data: queueHealth }    = useQueueHealth();

  const sentCount    = analytics.reduce((s, r) => s + r.sent,   0);
  const failedCount  = analytics.reduce((s, r) => s + r.failed, 0);
  const totalCount   = analytics.reduce((s, r) => s + r.total,  0);
  const pendingCount = queueHealth?.total_queued ?? analytics.reduce((s, r) => s + r.queued, 0);

  const configMap = Object.fromEntries(configs.map((c) => [c.channel, c]));

  function handleToggle(channel: CommChannel, enabled: boolean) {
    updateCfg.mutate(
      { channel, enabled },
      {
        onSuccess: () => { toast({ title: enabled ? `${CHANNEL_META[channel].label} aktiverat` : `${CHANNEL_META[channel].label} inaktiverat` }); },
        onError:   () => { toast({ title: 'Kunde inte uppdatera kanal', variant: 'destructive' }); },
      },
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Kommunikation"
        description="Hantera kanaler, skicka meddelanden och följ leveranser"
        breadcrumbs={[{ label: 'Hem' }, { label: 'Kommunikation' }]}
      />

      <PageContent>

        {/* Stats */}
        <StatsBar
          total={totalCount}
          sent={sentCount}
          failed={failedCount}
          pending={pendingCount}
        />

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            className="bg-green-500 hover:bg-green-600 text-white"
            onClick={() => navigate('/communication/compose')}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nytt meddelande
          </Button>
          <Button variant="outline" onClick={() => navigate('/communication/log')}>
            <Clock className="w-4 h-4 mr-1.5" />
            Leveranslogg
          </Button>
          <Button variant="outline" onClick={() => navigate('/communication/templates')}>
            <Settings className="w-4 h-4 mr-1.5" />
            Mallar
          </Button>
          <Button variant="outline" onClick={() => navigate('/communication/queue')}>
            <BarChart3 className="w-4 h-4 mr-1.5" />
            Kömonitor
          </Button>
        </div>

        {/* Queue health alert */}
        {(queueHealth?.total_retryable ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => navigate('/communication/queue')}
            className="w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20 px-4 py-3 text-left hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm text-amber-800 dark:text-amber-300 flex-1">
              <strong>{queueHealth!.total_retryable}</strong> meddelanden väntar på återförsök
            </span>
            <ChevronRight className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          </button>
        )}

        {/* Channel grid */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Kanaler
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {ALL_CHANNELS.map((ch) => (
                <div key={ch} className="h-36 rounded-xl border border-border bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {ALL_CHANNELS.map((ch) => {
                const config = configMap[ch];
                return config
                  ? <ChannelCard key={ch} config={config} onToggle={handleToggle} />
                  : <EmptyChannelCard key={ch} channel={ch} />;
              })}
            </div>
          )}
        </section>

        {/* Recent messages */}
        <RecentMessages />

        {/* Feature info */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Kommunikationsmotorn</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Send,         title: 'Händelsedriven', desc: 'Automatiska påminnelser vid bokningar, avbokningar och examinationer' },
              { icon: Settings,     title: 'Leverantörsoberoende', desc: 'Twilio, SendGrid, Vonage, Firebase — byt leverantör utan kodändringar' },
              { icon: BarChart3,    title: 'Full spårning', desc: 'Leveransstatus, retries och kvittenser per meddelande' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </PageContent>
    </PageLayout>
  );
}
