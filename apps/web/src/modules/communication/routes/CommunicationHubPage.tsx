import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  MessageSquare, Bell, Settings, Send,
  CheckCircle2, XCircle, Clock, ChartBar,
  ChevronRight, Plus, RefreshCcw, AlertTriangle, Zap,
  Activity, SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { Button, toast } from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useChannelConfigs, useCommAnalytics, useMessageList, useQueueHealth, useUpdateChannelConfig, useNotificationRules, useUpdateRule } from '../hooks/useCommunication.js';
import { ChannelBadge, StatusBadge, CHANNEL_META } from '../components/ChannelIcon.js';
import type { CommChannel, ChannelConfig, NotificationRule } from '../hooks/useCommunication.js';

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
        <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
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
        </PermissionGate>
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

function StatsBar({ total, sent, failed }: {
  total: number; sent: number; failed: number;
}) {
  const rate = total > 0 ? Math.round((sent / total) * 100) : 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Senaste 24h', value: total, icon: ChartBar,    color: 'text-foreground' },
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

// ─── Automation health card ───────────────────────────────────────────────────

function AutomationHealthCard({
  analytics,
  enabledRuleCount,
  totalRuleCount,
}: {
  analytics:        Array<{ total: number; sent: number; failed: number; delivery_rate: number }>;
  enabledRuleCount: number;
  totalRuleCount:   number;
}) {
  const weekTotal    = analytics.reduce((s, r) => s + r.total, 0);
  const weekSent     = analytics.reduce((s, r) => s + r.sent,  0);
  const weekFailed   = analytics.reduce((s, r) => s + r.failed, 0);
  const deliveryRate = weekTotal > 0 ? Math.round((weekSent / weekTotal) * 100) : 100;

  const healthColor = weekFailed === 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : weekFailed < 5
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-destructive';

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Zap className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Automationsstatus</p>
          <p className="text-xs text-muted-foreground">
            {enabledRuleCount > 0
              ? `${enabledRuleCount} av ${totalRuleCount} regler aktiva · event-worker körs varje minut`
              : 'Inga aktiva regler — aktivera i Notisregler'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 ml-0 sm:ml-auto flex-wrap">
        <div className="text-center">
          <p className="text-lg font-bold text-foreground tabular-nums">{weekTotal}</p>
          <p className="text-[10px] text-muted-foreground">Meddelanden (7 d)</p>
        </div>
        <div className="text-center">
          <p className={cn('text-lg font-bold tabular-nums', healthColor)}>{weekFailed}</p>
          <p className="text-[10px] text-muted-foreground">Misslyckade</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-foreground tabular-nums">{deliveryRate}%</p>
          <p className="text-[10px] text-muted-foreground">Leveransgrad</p>
        </div>
        <Link
          to="/communication/log"
          className="text-xs text-primary hover:underline flex items-center gap-0.5 shrink-0"
        >
          Leveranslogg <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ─── Automation rules panel ───────────────────────────────────────────────────

const EVENT_LABELS: Record<string, { label: string; description: string }> = {
  booking_confirmed:         { label: 'Bokningsbekräftelse',    description: 'Skickas direkt när en bokning bekräftas' },
  booking_cancelled:         { label: 'Avbokningsnotis',        description: 'Skickas när en bokning avbokas' },
  booking_rescheduled:       { label: 'Ombokningsnotis',        description: 'Skickas när en lektion ombokas' },
  booking_reminder_24h:      { label: 'Påminnelse 24 tim',      description: 'Skickas 24 timmar före lektionen' },
  booking_reminder_same_day: { label: 'Påminnelse samma dag',   description: 'Skickas på morgonen av lektionsdagen' },
  instructor_schedule_daily: { label: 'Dagsschemapåminnelse',   description: 'Instruktörens schema skickas varje morgon' },
  waitlist_promoted:         { label: 'Väntelistepromovering',  description: 'Skickas när en plats frigörs och eleven befordras' },
  invoice_issued:            { label: 'Faktura skapad',         description: 'Skickas när en ny faktura utfärdas' },
  invoice_overdue:           { label: 'Faktura försenad',       description: 'Skickas när en faktura passerar förfallodatum' },
};

function AutomationRulesPanel() {
  const { data: rules = [], isLoading } = useNotificationRules();
  const updateRule = useUpdateRule();

  function handleToggle(rule: NotificationRule) {
    updateRule.mutate(
      { id: rule.id, enabled: !rule.enabled },
      {
        onSuccess: () => toast({ title: rule.enabled ? 'Regel inaktiverad' : 'Regel aktiverad' }),
        onError:   () => toast({ title: 'Kunde inte uppdatera regel', variant: 'destructive' }),
      }
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Automatiska notifieringar</h2>
        </div>
        <Link
          to="/communication/rules"
          className="text-xs text-primary hover:underline flex items-center gap-0.5"
        >
          Hantera regler <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-muted rounded animate-pulse w-1/3" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-2 text-center px-6">
          <Bell className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Inga automatiska regler konfigurerade.</p>
          <Link to="/communication/rules" className="text-xs text-primary hover:underline">
            Lägg till regler →
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((rule) => {
            const eventMeta = EVENT_LABELS[rule.trigger_event];
            return (
              <div key={rule.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {eventMeta?.label ?? rule.trigger_event}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {eventMeta && (
                      <p className="text-xs text-muted-foreground">{eventMeta.description}</p>
                    )}
                    <ChannelBadge channel={rule.channel} />
                  </div>
                </div>
                <PermissionGate
                  permission={Permissions.COMMUNICATIONS_CREATE}
                  fallback={
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
                        rule.enabled
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground/60',
                      )}
                    >
                      {rule.enabled ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  }
                >
                  <button
                    type="button"
                    onClick={() => handleToggle(rule)}
                    disabled={updateRule.isPending}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent',
                      'transition-colors focus:outline-none disabled:opacity-50',
                      rule.enabled ? 'bg-primary' : 'bg-muted',
                    )}
                    role="switch"
                    aria-checked={rule.enabled}
                    aria-label={`${eventMeta?.label ?? rule.trigger_event} ${rule.enabled ? 'aktiv' : 'inaktiv'}`}
                  >
                    <span className={cn(
                      'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                      rule.enabled ? 'translate-x-4' : 'translate-x-0',
                    )} />
                  </button>
                </PermissionGate>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── CommunicationHubPage ─────────────────────────────────────────────────────

const ALL_CHANNELS: CommChannel[] = ['sms', 'email', 'whatsapp', 'push', 'voice'];

export function CommunicationHubPage() {
  const navigate    = useNavigate();
  const { data: configs = [], isLoading } = useChannelConfigs();
  const updateCfg   = useUpdateChannelConfig();

  // Analytics (1 d for StatsBar, 7 d for AutomationHealthCard)
  const { data: analytics1d = [] } = useCommAnalytics(1);
  const { data: analytics7d = [] } = useCommAnalytics(7);
  const { data: queueHealth }      = useQueueHealth();
  const { data: allRules = [] }    = useNotificationRules();

  const sentCount    = analytics1d.reduce((s, r) => s + r.sent,   0);
  const failedCount  = analytics1d.reduce((s, r) => s + r.failed, 0);
  const totalCount   = analytics1d.reduce((s, r) => s + r.total,  0);

  const enabledRuleCount = allRules.filter((r) => r.enabled).length;

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
      <SubscriptionGate feature="communication:templates:manage">

        {/* Stats (last 24h) */}
        <StatsBar
          total={totalCount}
          sent={sentCount}
          failed={failedCount}
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
            <ChartBar className="w-4 h-4 mr-1.5" />
            Kömonitor
          </Button>
          <Button variant="outline" onClick={() => navigate('/communication/notification-log')}>
            <Bell className="w-4 h-4 mr-1.5" />
            Notifikationslogg
          </Button>
          <Button variant="outline" onClick={() => navigate('/communication/activity')}>
            <Activity className="w-4 h-4 mr-1.5" />
            Aktivitetscenter
          </Button>
          <Button variant="outline" onClick={() => navigate('/communication/preferences')}>
            <SlidersHorizontal className="w-4 h-4 mr-1.5" />
            Mina notisinställningar
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

        {/* Automation health */}
        <AutomationHealthCard
          analytics={analytics7d}
          enabledRuleCount={enabledRuleCount}
          totalRuleCount={allRules.length}
        />

        {/* Recent messages */}
        <RecentMessages />

        {/* Automation rules */}
        <AutomationRulesPanel />

        {/* Analytics link */}
        <Link
          to="/communication/analytics"
          className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 hover:bg-accent/20 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ChartBar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Kommunikationsanalys</p>
              <p className="text-xs text-muted-foreground">Leveranstrender, kanaluppdelning och statistik över tid</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </Link>

        {/* Feature info */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Kommunikationsmotorn</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Send,         title: 'Händelsedriven', desc: 'Automatiska påminnelser vid bokningar, avbokningar och examinationer' },
              { icon: Settings,     title: 'Leverantörsoberoende', desc: 'Twilio, SendGrid, Vonage, Firebase — byt leverantör utan kodändringar' },
              { icon: ChartBar,    title: 'Full spårning', desc: 'Leveransstatus, retries och kvittenser per meddelande' },
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

      </SubscriptionGate>
      </PageContent>
    </PageLayout>
  );
}
